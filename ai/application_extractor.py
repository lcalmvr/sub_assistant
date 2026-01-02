"""
Native application document extractor using OpenAI.
Replaces Docupipe for converting PDF applications to structured JSON.

This module extracts insurance application data from PDF text and returns
structured JSON matching the Docupipe schema, with added confidence scores
and provenance tracking.
"""

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any, Optional
from pathlib import Path

from openai import OpenAI


def _get_client() -> OpenAI:
    """Get OpenAI client with API key from environment."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    return OpenAI(api_key=key)

# ─────────────────────────────────────────────────────────────
# Schema Definition
# ─────────────────────────────────────────────────────────────

# The extraction schema - defines all fields we want to extract
EXTRACTION_SCHEMA = {
    "generalInformation": {
        "applicantName": {"type": "string", "description": "Legal name of the applicant company"},
        "primaryWebsiteAndEmailDomains": {"type": "string", "description": "Primary website domain(s)"},
        "primaryIndustry": {"type": "string", "description": "Primary industry or business type"},
        "annualRevenue": {"type": "number", "description": "Annual revenue in USD"},
        "employeeCount": {"type": "number", "description": "Number of employees"},
    },
    "securityManagement": {
        "securityManagement": {"type": "array", "description": "Who manages IT security (Internal IT, MSP, etc.)"},
        "mdrThirdPartyIntervention": {"type": "boolean", "description": "Has MDR with third-party intervention capability"},
        "workloadInfrastructure": {"type": "string", "description": "Cloud, on-premises, or hybrid"},
    },
    "patchManagement": {
        "centralPatchManagement": {"type": "boolean", "description": "Uses centralized patch management"},
        "criticalPatchTimeframe": {"type": "string", "description": "Timeframe for applying critical patches"},
        "normalPatchingTimeframe": {"type": "string", "description": "Timeframe for normal patches"},
    },
    "accessManagement": {
        "singleSignOn": {"type": "boolean", "description": "Uses SSO"},
        "emailMfa": {"type": "boolean", "description": "MFA enabled for email access"},
        "mfaForCriticalInfoAccess": {"type": "boolean", "description": "MFA for critical systems"},
        "passwordManager": {"type": "boolean", "description": "Uses password manager"},
        "endUserAdminRights": {"type": "boolean", "description": "End users have admin rights (negative control)"},
        "privilegedAccessManagement": {"type": "boolean", "description": "Uses PAM solution"},
    },
    "networkSecurity": {
        "networkSecurityTechnologies": {"type": "array", "description": "Firewall, IDS/IPS, etc."},
        "networkSegmentation": {"type": "boolean", "description": "Network is segmented"},
    },
    "endpointSecurity": {
        "endpointSecurityTechnologies": {"type": "array", "description": "EDR/AV vendors (CrowdStrike, SentinelOne, etc.)"},
        "hasEdr": {"type": "boolean", "description": "Has EDR solution"},
        "edrEndpointCoveragePercent": {"type": "number", "description": "Percentage of endpoints with EDR"},
        "eppedrOnDomainControllers": {"type": "boolean", "description": "EDR on domain controllers"},
    },
    "remoteAccess": {
        "allowsRemoteAccess": {"type": "boolean", "description": "Allows remote access to network"},
        "remoteAccessMfa": {"type": "boolean", "description": "MFA required for remote access"},
        "remoteAccessSolutions": {"type": "array", "description": "VPN, RDP, etc."},
    },
    "operationalTechnology": {
        "utilizesOperationalTechnology": {"type": "boolean", "description": "Uses OT/ICS systems"},
        "itOtSegregated": {"type": "boolean", "description": "IT and OT networks are segregated"},
    },
    "trainingAndAwareness": {
        "conductsPhishingSimulations": {"type": "boolean", "description": "Conducts phishing simulations"},
        "phishingSimulationFrequency": {"type": "string", "description": "How often phishing tests run"},
        "mandatoryTrainingTopics": {"type": "array", "description": "Security awareness training topics"},
    },
    "backupAndRecovery": {
        "hasBackups": {"type": "boolean", "description": "Has backup solution"},
        "criticalInfoBackupFrequency": {"type": "string", "description": "Backup frequency"},
        "backupStorageLocation": {"type": "array", "description": "Where backups are stored"},
        "offlineBackups": {"type": "boolean", "description": "Has offline/air-gapped backups"},
        "offsiteBackups": {"type": "boolean", "description": "Has offsite backups"},
        "immutableBackups": {"type": "boolean", "description": "Has immutable backups"},
        "encryptedBackups": {"type": "boolean", "description": "Backups are encrypted"},
        "backupRestoreTestFrequency": {"type": "string", "description": "How often restore tests run"},
    },
}


@dataclass
class ExtractionResult:
    """Result of extracting a single field."""
    value: Any
    confidence: float  # 0.0 to 1.0
    source_text: Optional[str] = None  # The text that led to this extraction
    page_number: Optional[int] = None  # Page where this was found
    is_present: bool = True  # Whether the question was asked in the application


@dataclass
class ApplicationExtraction:
    """Full extraction result with all fields and metadata."""
    data: dict[str, dict[str, ExtractionResult]]
    raw_text: str
    page_count: int
    model_used: str = "gpt-4o"
    extraction_metadata: dict = field(default_factory=dict)

    def to_docupipe_format(self) -> dict:
        """Convert to Docupipe-compatible JSON format."""
        result = {"pageCount": self.page_count, "data": {}}

        for section, fields in self.data.items():
            result["data"][section] = {}
            for field_name, extraction in fields.items():
                result["data"][section][field_name] = extraction.value
                result["data"][section][f"{field_name}_is_present"] = extraction.is_present
                # Add confidence as metadata (not in original Docupipe format)
                result["data"][section][f"{field_name}_confidence"] = extraction.confidence

        return result

    def to_provenance_records(self, submission_id: str) -> list[dict]:
        """Generate provenance records for database storage."""
        records = []
        for section, fields in self.data.items():
            for field_name, extraction in fields.items():
                records.append({
                    "submission_id": submission_id,
                    "field_name": f"{section}.{field_name}",
                    "extracted_value": extraction.value,
                    "confidence": extraction.confidence,
                    "source_text": extraction.source_text,
                    "source_page": extraction.page_number,
                    "is_present": extraction.is_present,
                })
        return records


def _build_extraction_prompt(text: str, page_markers: dict[int, int]) -> str:
    """Build the extraction prompt for Claude."""

    schema_description = []
    for section, fields in EXTRACTION_SCHEMA.items():
        schema_description.append(f"\n### {section}")
        for field_name, field_info in fields.items():
            schema_description.append(
                f"- **{field_name}** ({field_info['type']}): {field_info['description']}"
            )

    schema_text = "\n".join(schema_description)

    return f"""You are an expert insurance application data extractor. Extract structured data from the following insurance application document.

## EXTRACTION SCHEMA

Extract these fields, organized by section:
{schema_text}

## INSTRUCTIONS

1. For each field, extract:
   - **value**: The actual value (null if not found)
   - **confidence**: 0.0-1.0 score indicating extraction certainty
   - **source_text**: Brief quote from document (max 100 chars) that supports this extraction
   - **page**: Page number where found (if determinable)
   - **is_present**: true if the question was asked, false if not in the document

2. Confidence scoring guide:
   - 1.0: Explicitly stated, exact match
   - 0.8-0.9: Clearly stated but needs minor interpretation
   - 0.6-0.7: Inferred from context
   - 0.4-0.5: Educated guess based on limited info
   - 0.0-0.3: Very uncertain or not found

3. For boolean fields:
   - true/false if clearly stated
   - null if question wasn't asked or answer unclear

4. For arrays:
   - Extract all mentioned items
   - Empty array [] if none found but question was asked
   - null if question wasn't asked

## DOCUMENT TEXT

{text}

## OUTPUT FORMAT

Return a JSON object with this structure:
```json
{{
  "generalInformation": {{
    "applicantName": {{
      "value": "Company Name",
      "confidence": 0.95,
      "source_text": "Applicant: Company Name",
      "page": 1,
      "is_present": true
    }},
    // ... other fields
  }},
  // ... other sections
}}
```

Extract all fields from the schema. If a field is not found, set value to null and is_present to false.
Return ONLY valid JSON, no additional text."""


def _parse_extraction_response(response_text: str) -> dict:
    """Parse Claude's response into structured data."""
    # Try to extract JSON from response
    json_match = re.search(r'\{[\s\S]*\}', response_text)
    if not json_match:
        raise ValueError("No JSON found in response")

    try:
        return json.loads(json_match.group())
    except json.JSONDecodeError as e:
        # Try to fix common JSON issues
        text = json_match.group()
        # Remove trailing commas
        text = re.sub(r',\s*}', '}', text)
        text = re.sub(r',\s*]', ']', text)
        return json.loads(text)


def _detect_page_markers(text: str) -> dict[int, int]:
    """
    Detect page boundaries in the text.
    Returns dict mapping page number to character offset.
    """
    markers = {1: 0}  # Page 1 starts at 0

    # Common page marker patterns
    patterns = [
        r'---\s*Page\s+(\d+)\s*---',
        r'\[Page\s+(\d+)\]',
        r'Page\s+(\d+)\s+of\s+\d+',
        r'\n\s*(\d+)\s*\n',  # Standalone page numbers
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            try:
                page_num = int(match.group(1))
                markers[page_num] = match.start()
            except (ValueError, IndexError):
                continue

    return markers


def _get_page_for_position(position: int, page_markers: dict[int, int]) -> int:
    """Determine which page a character position falls on."""
    current_page = 1
    for page, offset in sorted(page_markers.items()):
        if position >= offset:
            current_page = page
        else:
            break
    return current_page


def extract_application_data(
    text: str,
    model: str = "gpt-4o",
    page_count: Optional[int] = None,
) -> ApplicationExtraction:
    """
    Extract structured application data from document text.

    Args:
        text: Full text content of the application document
        model: OpenAI model to use for extraction
        page_count: Number of pages (if known)

    Returns:
        ApplicationExtraction with all extracted fields and metadata
    """
    # Detect page markers
    page_markers = _detect_page_markers(text)
    if page_count is None:
        page_count = max(page_markers.keys()) if page_markers else 1

    # Build and send prompt
    prompt = _build_extraction_prompt(text, page_markers)

    client = _get_client()
    response = client.chat.completions.create(
        model=model,
        max_tokens=8000,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )

    response_text = response.choices[0].message.content

    # Parse response
    raw_data = _parse_extraction_response(response_text)

    # Convert to ExtractionResult objects
    data: dict[str, dict[str, ExtractionResult]] = {}

    for section, fields in EXTRACTION_SCHEMA.items():
        data[section] = {}
        section_data = raw_data.get(section, {})

        for field_name in fields:
            field_data = section_data.get(field_name, {})

            if isinstance(field_data, dict):
                data[section][field_name] = ExtractionResult(
                    value=field_data.get("value"),
                    confidence=float(field_data.get("confidence", 0.0)),
                    source_text=field_data.get("source_text"),
                    page_number=field_data.get("page"),
                    is_present=field_data.get("is_present", False),
                )
            else:
                # Handle case where model returns just the value
                data[section][field_name] = ExtractionResult(
                    value=field_data if field_data is not None else None,
                    confidence=0.5,
                    is_present=field_data is not None,
                )

    return ApplicationExtraction(
        data=data,
        raw_text=text,
        page_count=page_count,
        model_used=model,
        extraction_metadata={
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
        },
    )


def extract_from_pdf(
    file_path: str,
    model: str = "gpt-4o",
) -> ApplicationExtraction:
    """
    Extract application data directly from a PDF file.

    Args:
        file_path: Path to PDF file
        model: Claude model to use

    Returns:
        ApplicationExtraction with all extracted fields
    """
    from pypdf import PdfReader

    # Get page count
    reader = PdfReader(file_path)
    page_count = len(reader.pages)

    # Extract text with page markers
    text_parts = []
    for i, page in enumerate(reader.pages, 1):
        page_text = page.extract_text()
        if page_text:
            text_parts.append(f"--- Page {i} ---\n{page_text}")

    text = "\n\n".join(text_parts)

    return extract_application_data(text, model=model, page_count=page_count)


# ─────────────────────────────────────────────────────────────
# CLI for testing
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Extract application data from PDF")
    parser.add_argument("file", help="Path to PDF file")
    parser.add_argument("--model", default="gpt-4o", help="OpenAI model to use")
    parser.add_argument("--output", "-o", help="Output JSON file path")
    args = parser.parse_args()

    print(f"Extracting from: {args.file}")
    result = extract_from_pdf(args.file, model=args.model)

    output = result.to_docupipe_format()

    if args.output:
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2)
        print(f"Saved to: {args.output}")
    else:
        print(json.dumps(output, indent=2))

    # Print extraction stats
    print(f"\n--- Extraction Stats ---")
    print(f"Pages: {result.page_count}")
    print(f"Model: {result.model_used}")
    print(f"Tokens: {result.extraction_metadata}")

    # Count high/low confidence extractions
    high_conf = sum(
        1 for section in result.data.values()
        for field in section.values()
        if field.confidence >= 0.8
    )
    low_conf = sum(
        1 for section in result.data.values()
        for field in section.values()
        if field.confidence < 0.5 and field.is_present
    )
    print(f"High confidence (>=0.8): {high_conf}")
    print(f"Low confidence (<0.5): {low_conf}")
