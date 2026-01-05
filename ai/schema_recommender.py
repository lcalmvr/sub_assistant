"""
Schema Recommendation System

Analyzes insurance application documents and suggests additions/improvements
to the extraction schema based on:
1. Questions found in documents that don't map to existing schema fields
2. Common question patterns across multiple documents
3. Fields that are frequently not found (coverage gaps)
"""

import json
import os
from typing import Optional
import anthropic

from core.db import get_conn


def _get_client() -> anthropic.Anthropic:
    """Get Anthropic client with API key from environment."""
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")
    return anthropic.Anthropic(api_key=key)


def _get_active_schema() -> tuple[str, dict] | None:
    """Get the active schema ID and definition."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, schema_definition
                FROM extraction_schemas
                WHERE is_active = true
                LIMIT 1
            """)
            row = cur.fetchone()
            if row:
                return row["id"], row["schema_definition"]
    return None


def _create_recommendation(
    schema_id: str,
    rec_type: str,
    category: str,
    field_key: str,
    field_name: str,
    field_type: str,
    description: str,
    reasoning: str,
    confidence: float,
    source_doc_id: str = None,
    source_doc_name: str = None,
    source_question: str = None,
    enum_values: list = None,
):
    """Insert a schema recommendation into the database."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO schema_recommendations (
                    schema_id, recommendation_type, suggested_category,
                    suggested_field_key, suggested_field_name, suggested_type,
                    suggested_description, ai_reasoning, confidence,
                    source_document_id, source_document_name, source_question_text,
                    suggested_enum_values
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING id
            """, (
                schema_id, rec_type, category, field_key, field_name, field_type,
                description, reasoning, confidence, source_doc_id, source_doc_name,
                source_question, json.dumps(enum_values) if enum_values else None
            ))
            return cur.fetchone()["id"]


def analyze_document_for_schema_gaps(
    document_text: str,
    document_id: str = None,
    document_name: str = None,
) -> list[dict]:
    """
    Analyze a document to find questions that don't match the current schema.

    Returns a list of recommended schema additions.
    """
    schema_result = _get_active_schema()
    if not schema_result:
        return []

    schema_id, schema_def = schema_result

    # Build a description of current schema fields
    current_fields = []
    for category, cat_data in schema_def.items():
        if isinstance(cat_data, dict) and "fields" in cat_data:
            for field_key, field_def in cat_data["fields"].items():
                current_fields.append({
                    "category": category,
                    "key": field_key,
                    "name": field_def.get("displayName", field_key),
                    "type": field_def.get("type", "string"),
                    "description": field_def.get("description", ""),
                })

    current_fields_text = json.dumps(current_fields, indent=2)

    client = _get_client()

    prompt = f"""You are an insurance application schema analyst. Your task is to review a document and identify questions/fields that are NOT covered by the current extraction schema.

## CURRENT SCHEMA FIELDS

These fields are already in our schema:
{current_fields_text}

## DOCUMENT TO ANALYZE

{document_text[:50000]}  # Truncate very long documents

## TASK

Identify 0-5 questions/fields in the document that:
1. Ask for information NOT covered by any existing schema field
2. Would be valuable for underwriting cyber/ransomware insurance
3. Are commonly asked across insurance applications (not one-off questions)

For each gap found, provide:
- suggested_category: Which existing category it fits in, or a new category name
- suggested_key: camelCase field name (e.g., "hasDataClassification")
- suggested_name: Human-readable display name
- suggested_type: string, boolean, number, enum, or array
- suggested_description: What this field captures
- enum_values: If type is enum/array, list the valid values
- source_question: The exact question text from the document
- reasoning: Why this field should be added
- confidence: 0.0-1.0 how confident you are this is a real gap

Return JSON array:
```json
[
  {{
    "suggested_category": "securityManagement",
    "suggested_key": "hasDataClassification",
    "suggested_name": "Data Classification Program",
    "suggested_type": "boolean",
    "suggested_description": "Organization has a formal data classification program",
    "enum_values": null,
    "source_question": "Does the Applicant have a formal data classification policy?",
    "reasoning": "Data classification is a key security control not currently tracked",
    "confidence": 0.85
  }}
]
```

If no gaps are found, return an empty array: []

Return ONLY valid JSON, no additional text."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = response.content[0].text

    # Parse response
    try:
        # Extract JSON from response
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        elif "```" in response_text:
            json_start = response_text.find("```") + 3
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()

        recommendations = json.loads(response_text)
    except json.JSONDecodeError:
        print(f"[schema] Failed to parse recommendation response: {response_text[:500]}")
        return []

    # Save recommendations to database
    saved_recs = []
    for rec in recommendations:
        if rec.get("confidence", 0) >= 0.6:  # Only save high-confidence recs
            try:
                rec_id = _create_recommendation(
                    schema_id=schema_id,
                    rec_type="new_field",
                    category=rec.get("suggested_category"),
                    field_key=rec.get("suggested_key"),
                    field_name=rec.get("suggested_name"),
                    field_type=rec.get("suggested_type", "string"),
                    description=rec.get("suggested_description"),
                    reasoning=rec.get("reasoning"),
                    confidence=rec.get("confidence", 0.7),
                    source_doc_id=document_id,
                    source_doc_name=document_name,
                    source_question=rec.get("source_question"),
                    enum_values=rec.get("enum_values"),
                )
                saved_recs.append({**rec, "id": rec_id})
            except Exception as e:
                print(f"[schema] Failed to save recommendation: {e}")

    return saved_recs


def analyze_extraction_coverage(days: int = 30) -> dict:
    """
    Analyze field coverage across recent extractions to identify:
    1. Fields that are rarely found (may not be on most forms)
    2. Fields that are always found (well-defined)
    3. Categories with low coverage (may need more fields)
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get field occurrence stats
            cur.execute("""
                SELECT
                    field_key,
                    COUNT(*) as total_docs,
                    COUNT(*) FILTER (WHERE was_found) as found_count,
                    AVG(confidence) FILTER (WHERE was_found) as avg_confidence
                FROM extraction_field_occurrences
                WHERE created_at > NOW() - INTERVAL '%s days'
                GROUP BY field_key
                ORDER BY total_docs DESC
            """, (days,))

            field_stats = []
            for row in cur.fetchall():
                total = row["total_docs"]
                found = row["found_count"]
                coverage = (found / total * 100) if total > 0 else 0
                field_stats.append({
                    "field_key": row["field_key"],
                    "total_documents": total,
                    "found_count": found,
                    "coverage_pct": round(coverage, 1),
                    "avg_confidence": round(row["avg_confidence"] or 0, 2),
                })

            return {
                "period_days": days,
                "field_stats": field_stats,
                "low_coverage_fields": [f for f in field_stats if f["coverage_pct"] < 30],
                "high_coverage_fields": [f for f in field_stats if f["coverage_pct"] >= 80],
            }


def record_field_occurrence(
    document_id: str,
    field_key: str,
    was_found: bool,
    extracted_value: any = None,
    source_question: str = None,
    confidence: float = None,
    page_number: int = None,
):
    """Record that a field was (or wasn't) found in a document."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO extraction_field_occurrences
                (document_id, field_key, was_found, extracted_value, source_question_text, confidence, page_number)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (document_id, field_key) DO UPDATE SET
                    was_found = EXCLUDED.was_found,
                    extracted_value = EXCLUDED.extracted_value,
                    source_question_text = EXCLUDED.source_question_text,
                    confidence = EXCLUDED.confidence,
                    page_number = EXCLUDED.page_number
            """, (
                document_id, field_key, was_found,
                json.dumps(extracted_value) if extracted_value is not None else None,
                source_question, confidence, page_number
            ))
