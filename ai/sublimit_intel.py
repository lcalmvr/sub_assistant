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
