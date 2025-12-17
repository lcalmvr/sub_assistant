"""
AI-powered sublimit parser for insurance policies.
Parses natural language descriptions of sublimits into structured data.
"""

import os
import json
import re
from typing import Any, Dict, List

from openai import OpenAI


_MODEL = os.getenv("TOWER_AI_MODEL", "gpt-5.1")


def _client() -> OpenAI:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    return OpenAI(api_key=key)


SYSTEM = """You are an expert insurance broker assistant. Parse natural language descriptions of insurance sublimits into structured JSON.

Common sublimit coverages in cyber insurance include:
- Ransomware / Ransomware Extortion
- Business Interruption (BI)
- Social Engineering / Fraudulent Transfer
- Breach Response / Incident Response
- Regulatory Defense / Regulatory Fines
- PCI DSS / Payment Card
- Dependent Business Interruption
- System Failure
- Reputation / PR Expenses
- Cyber Extortion
- Media Liability
- Network Security Liability

Parse amounts flexibly: "1M" = 1000000, "500K" = 500000, "250,000" = 250000, etc.
"""

USER_TEMPLATE = """Parse the following description of insurance sublimits into a structured list.

Text: '''{text}'''

{context}

Output strictly as JSON with this schema:
{{
  "sublimits": [
    {{
      "coverage": string,  // Coverage name (e.g., "Ransomware", "Business Interruption")
      "primary_limit": number  // Primary carrier's sublimit in dollars
    }}
  ]
}}

Rules:
- Extract all sublimits mentioned in the text
- Normalize coverage names to standard terms where possible
- Parse all amounts to raw dollar values (e.g., "1M" -> 1000000)
- If a sublimit is described relative to another (e.g., "BI is half of ransomware"), calculate the value
- Maintain the order sublimits are mentioned
"""


def parse_sublimits_with_ai(text: str, context: str = "") -> List[Dict[str, Any]]:
    """
    Parse natural language sublimit description into structured data.

    Args:
        text: Natural language description of sublimits
        context: Optional context (e.g., primary carrier limit) to help parsing

    Returns:
        List of dicts with 'coverage' and 'primary_limit' keys
    """
    client = _client()

    context_str = f"Additional context: {context}" if context else ""

    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": USER_TEMPLATE.format(text=text, context=context_str)},
    ]

    rsp = client.chat.completions.create(
        model=_MODEL,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )

    content = rsp.choices[0].message.content or "{}"
    data = json.loads(content)
    sublimits = data.get("sublimits", [])

    # Normalize and validate
    result = []
    for sub in sublimits:
        coverage = str(sub.get("coverage", "")).strip()
        primary_limit = _parse_amount(sub.get("primary_limit", 0))

        if coverage:  # Skip entries without coverage name
            result.append({
                "coverage": coverage,
                "primary_limit": primary_limit,
                "treatment": "follow_form",  # Default treatment
            })

    return result


EDIT_SYSTEM = """You are an expert insurance broker assistant. You will receive the current sublimits as JSON and a user instruction.
Apply the instruction to produce updated sublimits. You can add, remove, or modify sublimits based on the instruction.
"""

EDIT_USER_TEMPLATE = """Current sublimits:
{current_json}

Instruction: {instruction}

Output strictly as JSON with key 'sublimits' (same schema as before).
"""


def edit_sublimits_with_ai(current_sublimits: List[Dict[str, Any]], instruction: str) -> List[Dict[str, Any]]:
    """
    Edit existing sublimits based on natural language instruction.

    Args:
        current_sublimits: Current list of sublimit dicts
        instruction: Natural language edit instruction

    Returns:
        Updated list of sublimit dicts
    """
    client = _client()

    messages = [
        {"role": "system", "content": EDIT_SYSTEM},
        {
            "role": "user",
            "content": EDIT_USER_TEMPLATE.format(
                current_json=json.dumps({"sublimits": current_sublimits}, indent=2),
                instruction=instruction
            ),
        },
    ]

    rsp = client.chat.completions.create(
        model=_MODEL,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )

    content = rsp.choices[0].message.content or "{}"
    data = json.loads(content)
    sublimits = data.get("sublimits", [])

    # Normalize and validate
    result = []
    for sub in sublimits:
        coverage = str(sub.get("coverage", "")).strip()
        primary_limit = _parse_amount(sub.get("primary_limit", 0))
        treatment = sub.get("treatment", "follow_form")

        if coverage:
            result.append({
                "coverage": coverage,
                "primary_limit": primary_limit,
                "treatment": treatment,
            })

    return result


# ─────────────────────── Document Parsing ───────────────────────

DOCUMENT_SYSTEM = """You are an expert insurance policy analyst specializing in cyber and technology insurance.
Extract coverage information from insurance policy documents (quotes, binders, policies, declarations pages).

Common cyber insurance coverages include:
- Network Security & Privacy Liability
- Privacy Regulatory Defense & Penalties
- PCI DSS / Payment Card Liability
- Media Liability
- Business Interruption (BI)
- System Failure / Non-Malicious BI
- Dependent Business Interruption
- Cyber Extortion / Ransomware
- Data Recovery / Restoration
- Reputational Harm / Crisis Management
- Technology Errors & Omissions (Tech E&O)
- Social Engineering / Fraudulent Transfer
- Invoice Manipulation / Funds Transfer Fraud
- Telecommunications Fraud
- Breach Response / Incident Response
- Cryptojacking

Normalize coverage names to standard industry terms where possible.
Parse amounts flexibly: "1M" = 1000000, "500K" = 500000, "$250,000" = 250000, etc.
"""

DOCUMENT_USER_TEMPLATE = """Analyze this insurance policy document and extract all coverage information.

Document text:
'''
{document_text}
'''

{context}

Output strictly as JSON with this schema:
{{
  "policy_type": string,  // "cyber", "tech", "cyber_tech", or "unknown"
  "carrier_name": string | null,  // Name of the insurance carrier if found
  "policy_form": string | null,  // Policy form name/number if found (e.g., "CyberEdge 3.0")
  "aggregate_limit": number | null,  // Total policy aggregate if found
  "retention": number | null,  // Primary retention/deductible if found
  "sublimits": [
    {{
      "coverage": string,  // EXACT coverage name as written in the document
      "coverage_normalized": [string],  // Array of standardized tags (one coverage can map to multiple)
      "primary_limit": number,  // Sublimit amount in dollars
      "notes": string | null  // Any relevant conditions (e.g., "72-hour waiting period")
    }}
  ]
}}

Rules:
- Extract ALL sublimits mentioned, even partial information
- "coverage" must be the EXACT name from the document (preserve carrier's terminology)
- "coverage_normalized" is an ARRAY - one carrier coverage may map to multiple standard tags
  Example: A "Dependent Business Interruption" coverage that includes both IT and Non-IT providers
  would have: ["Dependent BI - IT Providers", "Dependent BI - Non-IT Providers"]
- Standard tags to use:
  * Network Security Liability
  * Privacy Liability
  * Privacy Regulatory Defense
  * Privacy Regulatory Penalties
  * PCI DSS Assessment
  * Media Liability
  * Business Interruption
  * System Failure (Non-Malicious BI)
  * Dependent BI - IT Providers
  * Dependent BI - Non-IT Providers
  * Cyber Extortion / Ransomware
  * Data Recovery / Restoration
  * Reputational Harm
  * Crisis Management / PR
  * Technology E&O
  * Social Engineering
  * Invoice Manipulation
  * Funds Transfer Fraud
  * Telecommunications Fraud
  * Breach Response / Notification
  * Forensics
  * Credit Monitoring
  * Cryptojacking
  * Betterment
  * Bricking
  * Other
- Parse all amounts to raw dollar values (e.g., "1M" -> 1000000, "$500K" -> 500000)
- If a coverage has "full limits" or "aggregate", use the aggregate_limit value
- If a sublimit is per-occurrence vs aggregate, note in the notes field
- Include waiting periods, coinsurance, or other conditions in notes
- Order sublimits by limit amount descending
"""


def parse_coverages_from_document(document_text: str, context: str = "") -> dict:
    """
    Parse insurance document text into structured coverage data.

    This is designed for primary carrier quotes, binders, or policy documents
    to extract coverage information for populating the excess coverage schedule.

    Args:
        document_text: Raw text extracted from PDF/DOCX
        context: Optional context (e.g., expected policy type, known aggregate)

    Returns:
        Dict with:
        - policy_type: "cyber" | "tech" | "cyber_tech" | "unknown"
        - carrier_name: str | None
        - aggregate_limit: float | None
        - retention: float | None
        - sublimits: List of {coverage, primary_limit, notes}
    """
    client = _client()

    context_str = f"Additional context: {context}" if context else ""

    messages = [
        {"role": "system", "content": DOCUMENT_SYSTEM},
        {"role": "user", "content": DOCUMENT_USER_TEMPLATE.format(
            document_text=document_text[:20000],  # Limit input size
            context=context_str
        )},
    ]

    rsp = client.chat.completions.create(
        model=_MODEL,
        messages=messages,
        temperature=0,
        response_format={"type": "json_object"},
    )

    content = rsp.choices[0].message.content or "{}"
    data = json.loads(content)

    # Normalize and validate the response
    result = {
        "policy_type": data.get("policy_type", "unknown"),
        "carrier_name": data.get("carrier_name"),
        "policy_form": data.get("policy_form"),
        "aggregate_limit": _parse_amount(data.get("aggregate_limit")),
        "retention": _parse_amount(data.get("retention")),
        "sublimits": [],
    }

    # Process sublimits
    for sub in data.get("sublimits", []):
        coverage = str(sub.get("coverage", "")).strip()
        primary_limit = _parse_amount(sub.get("primary_limit", 0))
        notes = sub.get("notes")

        # Handle coverage_normalized as array (may come as string or list)
        raw_normalized = sub.get("coverage_normalized", [])
        if isinstance(raw_normalized, str):
            coverage_normalized = [raw_normalized] if raw_normalized else []
        elif isinstance(raw_normalized, list):
            coverage_normalized = [str(t).strip() for t in raw_normalized if t]
        else:
            coverage_normalized = []

        # Default to coverage name if no tags provided
        if not coverage_normalized and coverage:
            coverage_normalized = [coverage]

        if coverage and primary_limit > 0:
            result["sublimits"].append({
                "coverage": coverage,  # Original carrier language
                "coverage_normalized": coverage_normalized,  # Array of standardized tags
                "primary_limit": primary_limit,
                "notes": notes,
            })

    # Sort by limit descending
    result["sublimits"].sort(key=lambda x: x["primary_limit"], reverse=True)

    return result


def _parse_amount(val: Any) -> float:
    """Parse dollar and K/M-suffixed numbers into float dollars."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().upper().replace(",", "").replace("$", "")
    if not s:
        return 0.0
    try:
        if s.endswith("K"):
            return float(s[:-1] or 0) * 1_000
        if s.endswith("M"):
            return float(s[:-1] or 0) * 1_000_000
        return float(s)
    except Exception:
        try:
            n = float(re.sub(r"[^0-9.]+", "", s))
            return n
        except Exception:
            return 0.0
