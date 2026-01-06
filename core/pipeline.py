from __future__ import annotations

import os
import json
import re
import uuid
from collections.abc import Mapping, Sequence
from pathlib import Path
from datetime import datetime
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI
from tavily import TavilyClient

# DB / vectors
import psycopg2
from psycopg2.extras import Json
from pgvector.psycopg2 import register_vector
from pgvector import Vector
from sqlalchemy import create_engine, text

# Attachment contract (must match ingest_local.py usage)
from dataclasses import dataclass
from typing import Optional

@dataclass
class Attachment:
    filename: Optional[str] = None
    standardized_json: Optional[str] = None
    schema_hint: Optional[str] = None
    # keep these optional so older/newer callers don’t break
    path: Optional[str] = None
    content_type: Optional[str] = None


# ─────────────────── ENV / CLIENTS ───────────────────
load_dotenv(dotenv_path=Path('.') / '.env')
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL) if DATABASE_URL else None

# ---------- FILENAME DETECTION HELPER ----------
_FILE_EXT_RE = re.compile(r"\.(pdf|json|docx?|xlsx?|pptx?|csv|png|jpe?g|txt)$", re.I)

def _looks_like_filename(s: str) -> bool:
    return bool(_FILE_EXT_RE.search(s.strip()))

# ---------- FILE HELPERS ----------

def load_json(file_path: str | Path) -> dict[str, Any]:
    with open(file_path, "r") as f:
        return json.load(f)

def load_text(file_path: str | Path) -> str:
    with open(file_path, "r") as f:
        return f.read()

# ───────────── IDENTIFIER EXTRACTORS ─────────────

def extract_applicant_info(app_data: Mapping | Sequence | None) -> tuple[str, str]:
    if not app_data:
        return "", ""
    name_keys = {
        "applicantname", "applicant_name",
        "insuredname", "insured_name",
        "companyname", "company_name",
    }
    site_keys = {
        "primarywebsiteandemaildomains", "primary_website_and_email_domains",
        "website", "web_site", "primarywebsite", "domain", "url",
    }
    raw_name = _deep_find(app_data, name_keys) or ""
    raw_site = _deep_find(app_data, site_keys) or ""
    if raw_name and _looks_like_filename(raw_name):
        raw_name = ""
    name = _clean_company_name(raw_name) if raw_name else ""
    website = ""
    if raw_site:
        # normalize list-ish strings
        if isinstance(raw_site, str) and raw_site.startswith("[") and raw_site.endswith("]"):
            try:
                lst = json.loads(raw_site)
                raw_site = lst[0] if lst else ""
            except Exception:
                pass
        parts = [p.strip().lower() for p in re.split(r"[,\s]+", str(raw_site)) if "." in p]
        website = parts[0] if parts else ""
    return name, website


def extract_revenue(app_data: Mapping | Sequence | None) -> int | None:
    """Extract annual revenue from application data."""
    if not app_data:
        return None
    
    revenue_keys = {
        "annualRevenue", "annual_revenue", "revenue", "annualrevenue",
        "gross_revenue", "grossrevenue", "total_revenue", "totalrevenue"
    }
    
    revenue_value = _deep_find(app_data, revenue_keys)
    
    if revenue_value is None:
        return None
    
    # Convert to integer if it's a number or numeric string
    try:
        if isinstance(revenue_value, (int, float)):
            return int(revenue_value)
        elif isinstance(revenue_value, str):
            # Remove common formatting like commas, dollar signs, etc.
            cleaned = re.sub(r'[$,€£¥\s]', '', revenue_value)
            # Handle "M" for millions, "K" for thousands
            if cleaned.upper().endswith('M'):
                return int(float(cleaned[:-1]) * 1_000_000)
            elif cleaned.upper().endswith('K'):
                return int(float(cleaned[:-1]) * 1_000)
            else:
                return int(float(cleaned))
    except (ValueError, TypeError):
        return None
    
    return None


def extract_name_from_email(email_text: str) -> str:
    patterns = [
        r"submission for\s+([^\r\n.,]+)",
        r"insured[:\s]+([^\r\n]+)",
        r"applicant[:\s]+([^\r\n]+)",
        r"company[:\s]+([^\r\n]+)",
        r"named insured[:\s]+([^\r\n]+)",
    ]
    for pat in patterns:
        m = re.search(pat, email_text, re.I)
        if m:
            return _clean_company_name(m.group(1))
    return "unknown company"


def _clean_company_name(raw: str) -> str:
    raw = _FILE_EXT_RE.sub("", raw)
    raw = re.sub(r"[_\-]+", " ", raw)
    core = re.split(r"[.,\n\r]", raw, 1)[0]
    core = re.sub(r"\s{2,}", " ", core).strip()
    return core.title()


def _deep_find(d: Mapping | Sequence, key_set: set[str]) -> Any | None:
    stack: list[Any] = [d]
    # Convert all keys in the set to lowercase for case-insensitive comparison
    key_set_lower = {k.lower() for k in key_set}
    
    while stack:
        cur = stack.pop()
        if isinstance(cur, Mapping):
            for k, v in cur.items():
                if isinstance(k, str) and k.lower() in key_set_lower:
                    # Return the value if it's a string, number, or boolean
                    if isinstance(v, (str, int, float, bool)) and v is not None:
                        return v
                if isinstance(v, (Mapping, Sequence)) and not isinstance(v, (str, bytes)):
                    stack.append(v)
        elif isinstance(cur, Sequence) and not isinstance(cur, (str, bytes)):
            stack.extend(cur)
    return None

# ───────────── Tavily + fallback ─────────────

def fallback_research_summary(name_or_domain: str) -> str:
    prompt = f"""
You are an analyst tasked with researching a company. Based on the name or domain provided, explain in plain, factual language what the company does. Avoid marketing language or speculation.
Company: {name_or_domain}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    return rsp.choices[0].message.content.strip()


def get_public_description(name: str, website: str | None = None) -> str:
    queries = [
        f"{name} company overview",
        f"What does {name} do",
        f"{name} industry",
    ]
    if website:
        queries.insert(0, website)
    collected: list[str] = []
    for q in queries:
        try:
            res = tavily_client.search(q, max_results=3)
            for hit in res.get("results", []):
                snippet = (hit.get("content", "") or "").strip()
                if snippet and snippet not in collected:
                    collected.append(snippet)
            if sum(len(s.split()) for s in collected) >= 120:
                break
        except Exception:
            continue
    if not collected:
        return fallback_research_summary(name or (website or ""))
    joined = " ".join(collected)
    words = joined.split()
    return " ".join(words[:300])

# ───────────── Summarisers ─────────────

def summarize_business_operations(name: str, website: str, public_info: str) -> str:
    prompt = f"""
You are a cyber insurance underwriter reviewing a company for potential coverage. Using the information below, write a plain, factual summary of what this company does. Avoid any marketing language. Do NOT include anything about insurance, brokers, submissions, or policy terms.
Company Name: {name or 'unknown company'}
Website: {website or 'no website provided'}
Public Info:\n{public_info}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    return rsp.choices[0].message.content.strip()


def summarize_cyber_exposures(business_summary: str) -> str:
    prompt = f"""
You are a cyber insurance underwriter assessing exposures for a Cyber & Technology E&O policy. Based on the business description below, identify the most significant and DISTINCT cyber risks this company faces. Focus only on the operations as described—do not speculate beyond what is stated.

Select 4-5 exposures that are clearly different from each other. Avoid duplication—if two risks are similar, combine them or choose the more impactful one. Common distinct categories include: Operational Disruption, Intellectual Property Theft, Third-Party Liability, Business Email/Payment Fraud, Ransomware/Data Loss, Supply Chain, Industrial Espionage, etc.

Format as 4-5 concise bullet points. Each bullet must start with a short **Bold Heading** (2-4 words maximum) followed by a colon, then 1-2 sentences of explanation. Be direct and avoid sub-bullets, repetition, or over-elaboration.

Example format:
- **Intellectual Property Theft**: Brief explanation of the risk in 1-2 sentences.
- **Operational Disruptions**: Brief explanation in 1-2 sentences.

Business Summary:\n{business_summary}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    return rsp.choices[0].message.content.strip()


def summarize_nist_controls(app_data: dict[str, Any]) -> str:
    """Generate NIST Cybersecurity Framework summary only"""
    prompt = f"""
You are a cyber insurance underwriter. Review the following JSON-formatted application data. Summarize the insured's cybersecurity posture by comparing their responses to the NIST Cybersecurity Framework.

For each of the five NIST CSF core functions, include:
- The function name (e.g., Identify)
- A flag based on the strength of controls:
  - ✅ Strong / comprehensive controls
  - ⚠️ Partial / inconsistent controls
  - ❌ Lacking / no information provided
- A short paragraph describing:
  - What is implemented
  - Any weaknesses
  - Any missing/unclear information

When evaluating each NIST domain, apply the following inference rules:
- If the application confirms that remote access is protected by MFA, consider this a valid MFA control—even if MFA isn't mentioned elsewhere.
- If the organization uses a Managed Detection and Response (MDR) provider, assume Endpoint Detection & Response (EDR) is present unless explicitly contradicted.
- If patching cadence is provided, include this under the "Protect" domain even if no specific patching tools are mentioned.
- If segmentation, encryption, or backup practices are described, include them under "Protect" and assess maturity.
- If phishing training is mentioned under any form of security awareness or training, include it under "Protect".
- If fields are marked "not provided" or are missing, note this clearly and consider it when assigning flags.
- Do not highlight something as missing if the context reasonably implies its existence based on the above.

JSON:
{json.dumps(app_data, indent=2)}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    return rsp.choices[0].message.content.strip()


def extract_mandatory_controls(app_data: dict[str, Any]) -> dict[str, list[dict]]:
    """
    Deterministically extract and categorize mandatory controls from application JSON.
    Returns: {"present": [...], "not_present": [...], "not_asked": [...]}
    """
    # Define mandatory control mappings: control_name -> list of possible JSON field names
    MANDATORY_CONTROLS = {
        "Phishing Training": ["conductsPhishingSimulations", "mandatoryTrainingTopics"],
        "EDR": ["endpointSecurityTechnologies", "eppedrOnDomainControllers", "hasEdr"],
        "MFA Email": ["emailMfa", "mfaEmail"],
        "MFA Privileged Account Access": ["mfaForCriticalInfoAccess", "pamRequiresMfa"],
        "MFA for Remote Access": ["remoteAccessMfa", "mfaForRemoteAccess"],
        "MFA Backups": ["backupMfa", "mfaBackups"],
        "Offline Backups": ["offlineBackups", "hasOfflineBackups"],
        "Offsite Backups": ["offsiteBackups", "hasOffsiteBackups"],
        "Immutable Backups": ["immutableBackups", "hasImmutableBackups"],
        "Encrypted Backups": ["encryptedBackups", "backupEncryption"],
    }

    result = {"present": [], "not_present": [], "not_asked": []}

    def find_field_value(data: dict, field_names: list[str]) -> tuple[bool, Any]:
        """Search for field in nested dict, check _is_present flag. Returns (was_asked, value)"""
        # Handle "data" wrapper if present
        if "data" in data and isinstance(data["data"], dict):
            search_data = data["data"]
        else:
            search_data = data

        for field_name in field_names:
            # Search in nested structure
            for section in search_data.values():
                if not isinstance(section, dict):
                    continue

                # Check if field exists
                if field_name in section:
                    # Check if there's an _is_present flag
                    is_present_key = f"{field_name}_is_present"
                    if is_present_key in section:
                        was_asked = section[is_present_key]
                        value = section[field_name]
                        return (was_asked, value)
                    else:
                        # No _is_present flag, assume asked if value is not None
                        value = section[field_name]
                        was_asked = value is not None
                        return (was_asked, value)

        return (False, None)  # Field not found at all

    # Categorize each mandatory control
    for control_name, field_names in MANDATORY_CONTROLS.items():
        was_asked, value = find_field_value(app_data, field_names)

        if not was_asked:
            result["not_asked"].append({"name": control_name})
        elif value in [True, "Yes", "yes", "true", "True"]:
            result["present"].append({"name": control_name})
        elif isinstance(value, list) and len(value) > 0:
            # Non-empty list means present
            result["present"].append({"name": control_name})
        elif value in [False, "No", "no", "false", "False"]:
            result["not_present"].append({"name": control_name})
        elif isinstance(value, list) and len(value) == 0:
            # Empty list but was asked - treat as not present
            result["not_present"].append({"name": control_name})
        else:
            # Value is ambiguous or null but was asked - treat as not present
            if was_asked:
                result["not_present"].append({"name": control_name})
            else:
                result["not_asked"].append({"name": control_name})

    return result


def summarize_bullet_points(app_data: dict[str, Any]) -> str:
    """Generate bullet point summary of security controls only"""
    # First, deterministically extract mandatory controls
    mandatory_categorized = extract_mandatory_controls(app_data)

    prompt = f"""
You are a cyber insurance underwriter. Create a formatted bullet-point summary of security controls from the application data.

**PRE-CATEGORIZED MANDATORY CONTROLS:**
PRESENT (these mandatory controls were confirmed as present):
{json.dumps([c["name"] for c in mandatory_categorized["present"]], indent=2)}

NOT PRESENT (these mandatory controls were confirmed as absent):
{json.dumps([c["name"] for c in mandatory_categorized["not_present"]], indent=2)}

NOT ASKED (these mandatory controls were not asked about in the application):
{json.dumps([c["name"] for c in mandatory_categorized["not_asked"]], indent=2)}

**YOUR TASK:**
Generate a formatted summary with three sections. For mandatory controls, STRICTLY use the pre-categorized data above.
For non-mandatory controls, extract from the JSON below.

**FORMATTING INSTRUCTIONS:**

1. **✅ PRESENT CONTROLS**:
   - List ALL controls that are explicitly confirmed as YES/Present in the application data
   - **Group by consolidated categories ONLY - use these exact categories, no others**:
     * **Authentication & Access**: All MFA types, SSO, PAM, password managers, admin rights, AND ALL remote access controls (remote access MFA, remote access solutions like RDP/VPN, etc.)
     * **Endpoint Protection**: EDR, endpoint security, firewall, IDS/IPS, antivirus
     * **Backup & Recovery**: All backup types (offline, offsite, immutable, encrypted), frequencies, testing
     * **Training & Awareness**: Phishing training, security awareness
     * **Patch Management**: Patch policies, timeframes
     * **Operational Technology**: OT/ICS systems
     * **Security Management**: MDR, SOC, security teams
   - **DO NOT create a separate "Remote Access" category - it belongs in "Authentication & Access"**
   - For EACH control, include ALL available details on the same line: vendor names, specific systems, frequencies, percentages, methods, etc.
   - If partial information is provided, add what's known AND what's missing in parentheses on the same line
   - **DO NOT add redundant ": Yes" or similar** - being in PRESENT CONTROLS already means it's present
   - Only add descriptive context when there's meaningful detail (vendor name, coverage %, etc.)
   - Examples:
     * Good: "⭐ MFA Email" (no need to say "Yes")
     * Good: "⭐ EDR: CrowdStrike on domain controllers (endpoint/server coverage percentages not specified)"
     * Bad: "⭐ MFA Email: Yes" (redundant)
   - **Visual marker for mandatory controls in this section**: Add ⭐ before any mandatory control (from the mandatory list above)

   **MARKDOWN FORMATTING RULES:**
   - Use this exact format:
     ```
     ### ✅ PRESENT CONTROLS

     **Category Name**
     - Control item 1
     - Control item 2

     **Next Category Name**
     - Control item 1
     ```
   - Major section headers use ### (PRESENT CONTROLS, NOT PRESENT CONTROLS, NOT ASKED)
   - Category names use plain bold ** (Authentication & Access, Endpoint Protection, etc.)
   - First bullet starts immediately on the next line after category name
   - ONE blank line between last bullet and next category name

   - Example: "⭐ EDR: CrowdStrike on domain controllers (endpoint/server coverage percentages not specified)"
   - Example: "⭐ MFA Email"
   - Example: "Patch Management: Central management in place, critical patches within 1 week (normal patching timeframe not specified)"

2. **❌ NOT PRESENT CONTROLS**:
   - Include mandatory controls from the NOT PRESENT list above
   - Add non-mandatory controls that were asked and answered No (from JSON)
   - Use same consolidated categories
   - **Add 🔴 before mandatory controls ONLY**
   - DO NOT add ": No" - redundant
   - Same markdown formatting as section 1

3. **⚠️ NOT ASKED (MANDATORY ONLY)**:
   - List ONLY the mandatory controls from the NOT ASKED list above
   - Simple bullet list, no categories
   - **Add 🔶 before each item**
   - Format: "### ⚠️ NOT ASKED (MANDATORY ONLY)" then bullets

**CRITICAL RULES:**
- For mandatory controls: USE THE PRE-CATEGORIZED DATA ABOVE - do NOT reinterpret
- For non-mandatory controls: extract from JSON using _is_present flags
- DO NOT add ": Yes" or ": No" - the section itself indicates presence
- Only add descriptive context for meaningful details (vendor names, coverage %, specific systems, etc.)
- DO preserve all implementation details inline

**OUTPUT FORMAT:**
- Respond with raw markdown ONLY
- DO NOT wrap your response in code fences (```)
- DO NOT include any preamble or explanation
- Just return the formatted markdown starting with "### ✅ PRESENT CONTROLS"

JSON:
{json.dumps(app_data, indent=2)}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    return rsp.choices[0].message.content.strip()


def summarize_controls_with_flags_and_bullets(app_data: dict[str, Any]) -> str:
    """Legacy function - now returns combined content for backward compatibility"""
    nist_summary = summarize_nist_controls(app_data)
    bullet_summary = summarize_bullet_points(app_data)
    
    return f"""---

🔐 NIST CYBERSECURITY FRAMEWORK SUMMARY

{nist_summary}

---

📌 BULLET POINT SUMMARY

{bullet_summary}"""


def summarize_submission_email(email_text: str) -> str:
    prompt = f"""
Summarize this broker email into a short bullet list that identifies: what is being requested, important dates, key coverage/structure considerations. Keep it brief and specific.
Email:\n{email_text}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    return rsp.choices[0].message.content.strip()

# ───────────── NAICS (vector + LLM) ─────────────
import numpy as np
import pandas as pd

NAICS_FILE = Path("ai/naics_2022_w_embeddings.parquet")
if not NAICS_FILE.exists():
    raise FileNotFoundError("naics_2022_w_embeddings.parquet missing. Build it once, then rerun.")

_naics_df = pd.read_parquet(NAICS_FILE)  # expects columns: code,title,emb(list[float])
_EMBED_MODEL = "text-embedding-3-small"


def _embed(txt: str) -> list[float]:
    return openai_client.embeddings.create(input=[txt[:512]], model=_EMBED_MODEL).data[0].embedding


def _cosine(a, b):
    a, b = np.array(a), np.array(b)
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
    return float(np.dot(a, b) / denom)


def _top_k(desc: str, k: int = 8):
    vec = _embed(desc)
    _naics_df["sim"] = _naics_df["emb"].apply(lambda v: _cosine(vec, v))
    return _naics_df.nlargest(k, "sim")["code title sim".split()]

_SYSTEM_NAICS = (
    "You are a NAICS classifier. Return ONLY valid JSON with keys: primary{code,title,confidence}, secondary{code,title,confidence or null}.\n"
    "primary = what the company ITSELF does. secondary = the clear customer vertical if any, else nulls. confidence 0-1."
)


def _generate_industry_tags(description: str) -> list[str]:
    prompt = (
        "List 1-3 concise industry tags that best describe the company below. Use common tech/industry slang (max 3 words each). Return as a JSON array of strings.\n\n"
        f"{description}"
    )
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    ).choices[0].message.content.strip()
    m = re.search(r"\[.*\]", rsp, re.S)
    try:
        tags = json.loads(m.group(0)) if m else []
    except json.JSONDecodeError:
        tags = []
    return list({(t or "").strip().title() for t in tags if isinstance(t, str) and t.strip()})


def classify_naics(description: str) -> dict:
    cands = _top_k(description).to_dict("records")
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[
            {"role": "system", "content": _SYSTEM_NAICS},
            {"role": "user", "content": f"Description:\n{description}\n\nCandidates:\n{cands}"},
        ],
        temperature=0.0,
    ).choices[0].message.content.strip()
    m = re.search(r"\{.*\}", rsp, re.S)
    try:
        naics = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        naics = {}
    primary = naics.get("primary", {}) or {}
    secondary = naics.get("secondary", {}) or {}
    if not secondary.get("code"):
        for cand in cands:
            if cand["code"] != primary.get("code"):
                secondary = {
                    "code": cand["code"],
                    "title": cand["title"],
                    "confidence": round(float(cand["sim"]), 3),
                }
                break
    tags = _generate_industry_tags(description)
    return {"primary": primary, "secondary": secondary, "tags": tags}

# ───────────── Flags + Embeddings ─────────────

def _parse_nist_flags(text: str) -> dict:
    flags: dict[str, str] = {}
    for fn in ("Identify", "Protect", "Detect", "Respond", "Recover"):
        m = re.search(rf"{fn}[^✅⚠️❌]*?(✅|⚠️|❌)", text, re.I)
        if m:
            flags[fn.lower()] = m.group(1)
    return flags


def _vector_from_flags(flags: dict) -> list[int]:
    order = ["identify", "protect", "detect", "respond", "recover"]
    code = {"✅": 1, "⚠️": 0, "❌": -1}
    return [code.get(flags.get(f, "⚠️"), 0) for f in order]


def _embed_text(txt: str) -> list[float] | None:
    if not (txt or "").strip():
        return None
    return openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=txt,
        encoding_format="float",
    ).data[0].embedding


def parse_controls_from_summary(bullet_summary: str, nist_summary: str = "") -> list[str]:
    """
    Extract structured controls list from text summaries for rating engine.
    Returns list of control slugs matching control_modifiers.yml (MFA, EDR, Backups, Phishing).
    """
    combined_text = (bullet_summary + " " + nist_summary).lower()
    controls = []
    
    # MFA detection - broad patterns for multi-factor authentication
    mfa_patterns = [
        r"multi[- ]?factor", r"two[- ]?factor", r"2fa", r"mfa",
        r"authenticator", r"auth.*app", r"totp", r"sso.*mfa",
        r"email.*mfa", r"remote.*mfa", r"access.*mfa"
    ]
    if any(re.search(pattern, combined_text) for pattern in mfa_patterns):
        controls.append("MFA")
    
    # EDR detection - endpoint detection and response tools
    edr_patterns = [
        r"edr", r"endpoint.*detection", r"crowdstrike", r"sentinelone", 
        r"carbon.*black", r"microsoft.*defender.*atp", r"cylance",
        r"cortex.*xdr", r"managed.*detection", r"mdr.*provider"
    ]
    if any(re.search(pattern, combined_text) for pattern in edr_patterns):
        controls.append("EDR")
    
    # Backups detection
    backup_patterns = [
        r"backup", r"restore", r"recovery", r"snapshot",
        r"offsite.*storage", r"cloud.*storage", r"disaster.*recovery"
    ]
    if any(re.search(pattern, combined_text) for pattern in backup_patterns):
        controls.append("Backups")
    
    # Phishing training detection
    phishing_patterns = [
        r"phishing.*train", r"phishing.*simulat", r"security.*awareness",
        r"awareness.*train", r"phishing.*test", r"social.*engineering.*train"
    ]
    if any(re.search(pattern, combined_text) for pattern in phishing_patterns):
        controls.append("Phishing")
    
    return controls

# ───────────── Guideline RAG (user-provided) ─────────────
from ai.guideline_rag import get_ai_decision

# ───────────── Conflict Detection ─────────────
from core.conflict_service import save_field_value, ConflictService

# Native application extraction
from ai.application_extractor import extract_from_pdf, ApplicationExtraction

# Document classification
from ai.document_classifier import (
    smart_classify_documents,
    get_applications,
    get_loss_runs,
    get_quotes,
    get_financials,
    DocumentType,
    ClassificationResult
)

# ───────────── DB helpers (schema-safe) ─────────────

def _existing_columns(table: str) -> set[str]:
    if not engine:
        return set()
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema='public' AND table_name=:t
                """
            ),
            {"t": table},
        ).fetchall()
    return {r[0] for r in rows}


def _existing_tables() -> set[str]:
    if not engine:
        return set()
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                """
            )
        ).fetchall()
    return {r[0] for r in rows}


def _insert_stub(broker: str, name: str, email_summary: str) -> Any:
    """Insert minimal row into submissions using only columns that exist."""
    if not engine:
        return -1
    cols = _existing_columns("submissions")
    columns: list[str] = []
    values: list[str] = []
    params: dict[str, Any] = {}

    if "broker_email" in cols:
        columns.append("broker_email"); values.append(":broker"); params["broker"] = broker
    if "applicant_name" in cols:
        columns.append("applicant_name"); values.append(":name"); params["name"] = name
    if "date_received" in cols:
        columns.append("date_received"); values.append("NOW()")
    if "summary" in cols:
        columns.append("summary"); values.append(":summary"); params["summary"] = email_summary
    if "flags" in cols:
        columns.append("flags"); values.append("'{}'::jsonb")
    if "quote_ready" in cols:
        columns.append("quote_ready"); values.append("FALSE")
    if "created_at" in cols:
        columns.append("created_at"); values.append("NOW()")
    if "updated_at" in cols:
        columns.append("updated_at"); values.append("NOW()")

    if not columns:
        raise RuntimeError("No insertable columns found on public.submissions")

    sql = text(f"INSERT INTO submissions ({', '.join(columns)}) VALUES ({', '.join(values)}) RETURNING id")
    with engine.begin() as conn:
        sid = conn.execute(sql, params).scalar_one()
    return sid


def _update_submission_by_id(sid: Any, rec: dict[str, Any]) -> None:
    """Update only the columns that exist; silently skip non-existent ones."""
    if not engine or sid == -1:
        return
    cols = _existing_columns("submissions")
    updates: list[str] = []
    params: dict[str, Any] = {"sid": sid}

    def add(col: str, val: Any):
        if col in cols:
            updates.append(f"{col} = :{col}")
            params[col] = val

    # Map fields → columns (add only if they exist)
    add("website", rec.get("website"))
    add("broker_email", rec.get("broker_email"))
    add("broker_company_id", rec.get("broker_company_id"))
    add("business_summary", rec.get("biz_sum"))
    add("cyber_exposures", rec.get("cyber"))
    add("nist_controls_summary", rec.get("ctrl_sum"))
    add("bullet_point_summary", rec.get("bullet_sum"))
    add("annual_revenue", rec.get("revenue"))
    add("naics", json.dumps(rec.get("naics")))

    primary = (rec.get("naics") or {}).get("primary", {})
    secondary = (rec.get("naics") or {}).get("secondary", {})
    add("naics_primary_code", primary.get("code"))
    add("naics_primary_title", primary.get("title"))
    add("naics_primary_confidence", primary.get("confidence"))
    add("naics_secondary_code", secondary.get("code"))
    add("naics_secondary_title", secondary.get("title"))
    add("naics_secondary_confidence", secondary.get("confidence"))

    add("nist_controls", json.dumps(rec.get("nist_flags")))
    add("nist_vector", rec.get("nist_vector"))
    add("ops_embedding", rec.get("ops_vec"))
    add("controls_embedding", rec.get("controls_vec"))
    add("exposures_embedding", rec.get("exposures_vec"))
    add("industry_tags", json.dumps(rec.get("industry_tags")))
    add("ai_recommendation", rec.get("ai_rec"))
    add("ai_guideline_citations", json.dumps(rec.get("ai_cites")))
    # Optional alt-brokers fields if present
    add("broker_org_id", rec.get("broker_org_id"))
    add("broker_employment_id", rec.get("broker_employment_id"))
    add("broker_person_id", rec.get("broker_person_id"))

    if not updates:
        return
    sql = text(f"UPDATE submissions SET {', '.join(updates)}, updated_at = COALESCE(updated_at, NOW()) WHERE id = :sid")
    with engine.begin() as conn:
        conn.execute(sql, params)


# ───────────── Remarket Detection (Phase 7) ─────────────

def _detect_remarket(submission_id: str) -> dict | None:
    """
    Check if this submission matches a prior submission for the same account.

    Uses the find_prior_submissions database function to check FEIN, domain,
    and fuzzy name matches. If a match is found with confidence >= 70%,
    updates the submission with the detection info.

    Returns the best match info if found, None otherwise.
    """
    if not engine:
        return None

    with engine.begin() as conn:
        # Call the database function to find matches
        result = conn.execute(
            text("SELECT * FROM find_prior_submissions(:sid) ORDER BY match_confidence DESC LIMIT 1"),
            {"sid": submission_id}
        )
        match = result.fetchone()

        if match:
            # Only auto-flag if confidence is high enough
            # (FEIN=100, domain=80, name_exact=70 are all good)
            if match.match_confidence >= 70:
                conn.execute(
                    text("""
                        UPDATE submissions
                        SET remarket_detected_at = NOW(),
                            remarket_match_type = :match_type,
                            remarket_match_confidence = :confidence
                        WHERE id = :sid
                    """),
                    {
                        "sid": submission_id,
                        "match_type": match.match_type,
                        "confidence": match.match_confidence,
                    }
                )
                print(f"[pipeline] Remarket detected: {match.match_type} match ({match.match_confidence}%) "
                      f"with prior submission {match.submission_id} ({match.insured_name})")
                return {
                    "prior_submission_id": str(match.submission_id),
                    "insured_name": match.insured_name,
                    "match_type": match.match_type,
                    "match_confidence": match.match_confidence,
                    "submission_date": str(match.submission_date) if match.submission_date else None,
                    "outcome": match.submission_outcome,
                }
            else:
                # Lower confidence - log but don't auto-flag
                print(f"[pipeline] Possible remarket (low confidence): {match.match_type} "
                      f"({match.match_confidence}%) with {match.insured_name}")

    return None


# ───────────── Renewal Matching (Phase 8) ─────────────

def _match_renewal_expectation(
    submission_id: str,
    applicant_name: str | None,
    broker_email: str | None,
    website: str | None
) -> dict | None:
    """
    Check if this submission matches a pending renewal expectation.

    If a match is found, links the submission to the expectation's prior policy
    and deletes the expectation (merging them).

    Returns match info if found, None otherwise.
    """
    if not applicant_name:
        return None

    try:
        from ingestion.renewal_automation import match_incoming_to_expected, link_submission_to_expectation

        # Try to find a matching expectation
        match = match_incoming_to_expected(
            applicant_name=applicant_name,
            broker_email=broker_email,
            website=website
        )

        if match and match.get("confidence") == "high":
            # Auto-link for high confidence matches
            expectation_id = match["expectation_id"]
            success = link_submission_to_expectation(
                submission_id=submission_id,
                expectation_id=expectation_id,
                carry_over_bound_option=True
            )
            if success:
                print(f"[pipeline] Renewal matched: auto-linked to expectation {expectation_id} "
                      f"({match['match_type']} match for {match['applicant_name']})")
                return match
            else:
                print(f"[pipeline] Renewal match found but link failed for {expectation_id}")
        elif match:
            # Medium confidence - log but don't auto-link
            print(f"[pipeline] Possible renewal match (medium confidence): "
                  f"{match['match_type']} for {match['applicant_name']} - "
                  f"expectation_id={match['expectation_id']}")
            # Could store this for manual review
            return match

    except ImportError:
        # renewal_automation not available
        pass
    except Exception as e:
        print(f"[pipeline] Renewal matching error: {e}")

    return None


# ───────────── Broker email matching ─────────────
_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
_FORWARDED_FROM_RE = re.compile(r"^>?\s*From:\s*([^\n<]+?)\s*<([^>]+)>", re.I | re.M)
_SUBMISSION_FROM_RE = re.compile(
    r"\b(?:new|another|incoming|latest|updated)?\s*submission\s+from\s+([A-Z][A-Z'\-a-z.]+(?:\s+[A-Z][A-Z'\-a-z.]+){0,2})",
    re.I,
)
_NAME_TOKEN_RE = re.compile(r"[^a-z0-9]+")


def _extract_emails_from_text(txt: str) -> list[str]:
    if not txt:
        return []
    found = _EMAIL_RE.findall(txt)
    # Also parse common quoted header lines
    # e.g., From: Jane Doe <jane@broker.com>
    m = re.findall(r"From:\s*[^\n<]*<([^>]+)>", txt, flags=re.I)
    if m:
        found.extend(m)
    # dedupe preserving order
    seen = set()
    out = []
    for e in found:
        el = e.strip().lower()
        if el and el not in seen:
            seen.add(el)
            out.append(el)
    return out


def _tokenize_name(value: str | None) -> set[str]:
    if not value:
        return set()
    return {
        token
        for token in _NAME_TOKEN_RE.split(str(value).lower())
        if token
    }


def _extract_forwarded_email_names(txt: str) -> dict[str, str]:
    pairs: dict[str, str] = {}
    if not txt:
        return pairs
    for name, email_addr in _FORWARDED_FROM_RE.findall(txt):
        email_norm = email_addr.strip().lower()
        if email_norm:
            pairs[email_norm] = name.strip()
    return pairs


def _extract_submission_cue_tokens(txt: str) -> list[set[str]]:
    cues: list[set[str]] = []
    if not txt:
        return cues
    for name in _SUBMISSION_FROM_RE.findall(txt):
        tokens = _tokenize_name(name)
        if not tokens:
            continue
        cues.append(tokens)
        # Also keep first token solo to handle single-name references like "Lauren sent this"
        first = next(iter(tokens))
        cues.append({first})
    return cues


def _prioritize_candidate_emails(
    candidate_emails: list[str],
    sender_email: str | None,
    forwarded_names: dict[str, str],
    cue_tokens: list[set[str]],
    debug_log: list[dict] | None = None,
) -> list[str]:
    if not candidate_emails:
        return candidate_emails

    sender_email = (sender_email or "").strip().lower()

    prioritized = []
    for idx, email in enumerate(candidate_emails):
        email_norm = email.strip().lower()
        score = 100 + idx  # Base ordering fallback
        reasons: list[str] = [f"base=100 idx={idx}"]

        if sender_email and email_norm == sender_email:
            score += 50  # Tilt away from the forwarding broker when other cues exist
            reasons.append("sender_penalty:+50")

        name_tokens = _tokenize_name(forwarded_names.get(email_norm))
        local_tokens = _tokenize_name(email_norm.split("@")[0])

        if forwarded_names.get(email_norm):
            new_score = 40 + idx
            if new_score < score:
                reasons.append(f"forwarded_header->score {score}->{new_score}")
            score = min(score, new_score)

        for cue in cue_tokens:
            if not cue:
                continue
            if cue.issubset(name_tokens):
                new_score = 0 + idx
                if new_score < score:
                    reasons.append(f"cue_name_match {sorted(cue)}->{score}->{new_score}")
                score = min(score, new_score)
            elif cue.issubset(local_tokens):
                new_score = 5 + idx
                if new_score < score:
                    reasons.append(f"cue_local_match {sorted(cue)}->{score}->{new_score}")
                score = min(score, new_score)

        prioritized.append((score, idx, email))
        if debug_log is not None:
            debug_log.append(
                {
                    "email": email_norm,
                    "initial_rank": idx,
                    "final_score": score,
                    "forwarded_name": forwarded_names.get(email_norm),
                    "name_tokens": sorted(name_tokens),
                    "local_tokens": sorted(local_tokens),
                    "reasons": reasons,
                }
            )

    prioritized.sort(key=lambda item: (item[0], item[1]))
    return [email for _, _, email in prioritized]


def _load_alt_employment_email_map() -> dict[str, dict]:
    """Load email -> minimal employment/org mapping from fixtures store (optional)."""
    try:
        base = Path(__file__).resolve().parent.parent  # core/ -> project root
        data_path = base / "fixtures" / "brokerage_experiment.json"
        if not data_path.exists():
            return {}
        data = json.loads(data_path.read_text(encoding="utf-8"))
        emps = data.get("employments") or {}
        people = data.get("people") or {}
        orgs = data.get("organizations") or {}
        out: dict[str, dict] = {}
        for emp in emps.values():
            email = (emp or {}).get("email")
            if not email:
                continue
            el = str(email).strip().lower()
            out[el] = {
                "employment_id": emp.get("employment_id"),
                "person_id": emp.get("person_id"),
                "org_id": emp.get("org_id"),
                "office_id": emp.get("office_id"),
                "org_name": (orgs.get(emp.get("org_id")) or {}).get("name"),
                "person_name": "{fn} {ln}".format(
                    fn=(people.get(emp.get("person_id")) or {}).get("first_name", "").strip(),
                    ln=(people.get(emp.get("person_id")) or {}).get("last_name", "").strip(),
                ).strip(),
                "source": "alt_store",
            }
        return out
    except Exception:
        return {}


def _find_broker_contact_in_db(candidate_emails: list[str]) -> tuple[str | None, str | None]:
    """Return (matched_email, broker_company_id) if found uniquely in DB, else (None,None)."""
    if not engine or not candidate_emails:
        return None, None
    emails = [e.lower() for e in candidate_emails]
    tables = _existing_tables()
    with engine.begin() as conn:
        # Prefer normalized contacts
        if "broker_contacts_new" in tables:
            rows = conn.execute(
                text(
                    """
                    SELECT lower(email) as email, company_id
                    FROM broker_contacts_new
                    WHERE lower(email) = ANY(:emails)
                    """
                ),
                {"emails": emails},
            ).fetchall()
            if len(rows) == 1:
                return rows[0][0], str(rows[0][1]) if rows[0][1] is not None else None
            # If multiple distinct matches, try to prefer the first in the chain order
            if rows:
                order = {e: i for i, e in enumerate(emails)}
                rows_sorted = sorted(rows, key=lambda r: order.get(r[0], 9999))
                return rows_sorted[0][0], str(rows_sorted[0][1]) if rows_sorted[0][1] is not None else None
        # Legacy contacts table (no company mapping)
        if "broker_contacts" in tables:
            rows = conn.execute(
                text(
                    """
                    SELECT lower(email) as email
                    FROM broker_contacts
                    WHERE lower(email) = ANY(:emails)
                    """
                ),
                {"emails": emails},
            ).fetchall()
            if rows:
                # choose first by order in chain
                order = {e: i for i, e in enumerate(emails)}
                rows_sorted = sorted(rows, key=lambda r: order.get(r[0], 9999))
                return rows_sorted[0][0], None
    return None, None


def _find_alt_employment_in_db(candidate_emails: list[str]) -> dict | None:
    """Find employment by email in brkr_ tables. Returns {email, org_id, employment_id, person_id}."""
    if not engine or not candidate_emails:
        return None
    emails = [e.lower() for e in candidate_emails]
    tables = _existing_tables()
    # Require new brkr_ tables
    emp_table = "brkr_employments" if "brkr_employments" in tables else None
    if emp_table is None:
        return None
    with engine.begin() as conn:
        sql = text(
            f"""
            SELECT lower(email) as email, employment_id, person_id, org_id
            FROM {emp_table}
            WHERE email IS NOT NULL AND lower(email) = ANY(:emails)
            ORDER BY updated_at DESC
            """
        )
        rows = conn.execute(sql, {"emails": emails}).fetchall()
        if not rows:
            return None
        # Prefer first by candidate order
        order = {e: i for i, e in enumerate(emails)}
        rows_sorted = sorted(rows, key=lambda r: order.get(r[0], 9999))
        r0 = rows_sorted[0]
        return {"email": r0[0], "employment_id": str(r0[1]), "person_id": str(r0[2]), "org_id": str(r0[3])}


def resolve_broker_assignment(email_body: str, sender_email: str) -> dict:
    """
    Decide the submitting broker using email chain + known contacts/employments.
    Returns dict with keys: email, broker_company_id (optional), confidence, source.
    """
    # Build candidate email list: sender + any emails from chain
    raw_candidates: list[tuple[str, str]] = []
    sender_norm = sender_email.strip().lower() if sender_email else ""
    if sender_norm:
        raw_candidates.append(("sender", sender_norm))

    for address in _extract_emails_from_text(email_body or ""):
        raw_candidates.append(("body", address))

    seen: set[str] = set()
    cand: list[str] = []
    for _, addr in raw_candidates:
        if addr and addr not in seen:
            seen.add(addr)
            cand.append(addr)

    forwarded_names = _extract_forwarded_email_names(email_body or "")
    cue_tokens = _extract_submission_cue_tokens(email_body or "")
    cand = _prioritize_candidate_emails(cand, sender_norm, forwarded_names, cue_tokens)

    # Prefer brokers_alt in DB if present (brkr_ tables)
    alt_db = _find_alt_employment_in_db(cand)
    if alt_db:
        alt_email = (alt_db.get("email") or "").strip().lower()
        top_email = cand[0] if cand else None
        if (
            top_email
            and alt_email
            and alt_email != top_email
            and sender_norm
            and alt_email == sender_norm
        ):
            top_name_tokens = _tokenize_name(forwarded_names.get(top_email))
            top_local_tokens = _tokenize_name(top_email.split("@")[0])
            strong_cue = bool(forwarded_names.get(top_email))
            if not strong_cue:
                for cue in cue_tokens:
                    if cue and (cue.issubset(top_name_tokens) or cue.issubset(top_local_tokens)):
                        strong_cue = True
                        break
            if strong_cue:
                return {
                    "email": top_email,
                    "broker_company_id": None,
                    "broker_org_id": None,
                    "broker_employment_id": None,
                    "broker_person_id": None,
                    "confidence": "medium",
                    "source": "forwarded_instruction",
                }
        return {
            "email": alt_db.get("email"),
            "broker_company_id": None,
            "broker_org_id": alt_db.get("org_id"),
            "broker_employment_id": alt_db.get("employment_id"),
            "broker_person_id": alt_db.get("person_id"),
            "confidence": "high",
            "source": "alt_db",
        }

    # Fallback to alternate employment fixtures store
    alt_map = _load_alt_employment_email_map()
    for e in cand:
        if e in alt_map:
            alt = alt_map.get(e) or {}
            return {
                "email": e,
                "broker_company_id": None,
                "broker_org_id": alt.get("org_id"),
                "broker_employment_id": alt.get("employment_id"),
                "broker_person_id": alt.get("person_id"),
                "confidence": "medium",
                "source": "alt_store",
            }

    # Fallback to DB contacts if present (legacy)
    match_email, company_id = _find_broker_contact_in_db(cand)
    if match_email:
        return {
            "email": match_email,
            "broker_company_id": company_id,
            "confidence": "medium" if company_id else "low",
            "source": "db_contacts_new" if company_id else "db_contacts_legacy",
        }

    # Last resort: use sender
    return {
        "email": cand[0] if cand else sender_email,
        "broker_company_id": None,
        "confidence": "low",
        "source": "sender",
    }

# ───────────── Extraction Provenance Helpers ─────────────

def _save_extraction_provenance(
    submission_id: str,
    extraction: ApplicationExtraction,
    document_id: str | None = None,
) -> None:
    """Save extraction provenance records to database."""
    if not engine:
        return

    tables = _existing_tables()
    if "extraction_provenance" not in tables:
        return

    records = extraction.to_provenance_records(submission_id)

    with engine.begin() as conn:
        for rec in records:
            conn.execute(
                text("""
                    INSERT INTO extraction_provenance
                    (submission_id, field_name, extracted_value, confidence,
                     source_page, source_text, is_present, model_used, source_document_id)
                    VALUES (:submission_id, :field_name, :extracted_value, :confidence,
                            :source_page, :source_text, :is_present, :model_used, :doc_id)
                    ON CONFLICT (submission_id, field_name)
                    DO UPDATE SET
                        extracted_value = EXCLUDED.extracted_value,
                        confidence = EXCLUDED.confidence,
                        source_page = EXCLUDED.source_page,
                        source_text = EXCLUDED.source_text,
                        is_present = EXCLUDED.is_present,
                        model_used = EXCLUDED.model_used,
                        source_document_id = EXCLUDED.source_document_id,
                        created_at = NOW()
                """),
                {
                    "submission_id": submission_id,
                    "field_name": rec["field_name"],
                    "extracted_value": Json(rec["extracted_value"]),
                    "confidence": rec["confidence"],
                    "source_page": rec.get("source_page"),
                    "source_text": rec.get("source_text"),
                    "is_present": rec["is_present"],
                    "model_used": extraction.model_used,
                    "doc_id": document_id,
                },
            )


def _save_extraction_run(
    submission_id: str,
    extraction: ApplicationExtraction,
) -> None:
    """Save extraction run metadata for monitoring."""
    if not engine:
        return

    tables = _existing_tables()
    if "extraction_runs" not in tables:
        return

    # Count high/low confidence
    high_conf = sum(
        1 for section in extraction.data.values()
        for field in section.values()
        if field.confidence >= 0.8
    )
    low_conf = sum(
        1 for section in extraction.data.values()
        for field in section.values()
        if field.confidence < 0.5 and field.is_present
    )
    total_fields = sum(len(section) for section in extraction.data.values())

    metadata = extraction.extraction_metadata

    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO extraction_runs
                (submission_id, model_used, input_tokens, output_tokens,
                 fields_extracted, high_confidence_count, low_confidence_count,
                 status, completed_at)
                VALUES (:submission_id, :model, :input_tokens, :output_tokens,
                        :fields, :high, :low, 'completed', NOW())
            """),
            {
                "submission_id": submission_id,
                "model": extraction.model_used,
                "input_tokens": metadata.get("prompt_tokens"),
                "output_tokens": metadata.get("completion_tokens"),
                "fields": total_fields,
                "high": high_conf,
                "low": low_conf,
            },
        )


# ───────────── Save Extracted Values (Phase 1.9) ─────────────

def _save_extracted_values(
    submission_id: str,
    extraction: ApplicationExtraction,
    source_type: str = "extraction",
    document_id: str | None = None,
) -> int:
    """
    Save extraction results to submission_extracted_values table.

    This is the unified data store for all extracted field values.
    AI functions (NIST assessment, show gaps, etc.) read from this table.

    Args:
        submission_id: The submission UUID
        extraction: ApplicationExtraction result from extract_from_pdf()
        source_type: 'extraction' for initial, 'supplemental' for supplemental apps
        document_id: Optional source document UUID

    Returns:
        Number of values saved
    """
    if not engine:
        return 0

    tables = _existing_tables()
    if "submission_extracted_values" not in tables:
        print("[pipeline] submission_extracted_values table not found, skipping")
        return 0

    saved_count = 0
    with engine.begin() as conn:
        for section_name, fields in extraction.data.items():
            for field_name, result in fields.items():
                # Determine status based on extraction result
                if not result.is_present:
                    status = "not_asked"
                elif result.value is None:
                    status = "pending"  # Question asked but no answer
                elif result.value is True or (result.value and result.value not in [False, [], ""]):
                    status = "present"
                else:
                    status = "not_present"

                # Convert value to JSON-compatible format
                import json
                value_json = json.dumps(result.value) if result.value is not None else None

                try:
                    conn.execute(
                        text("""
                            INSERT INTO submission_extracted_values
                                (submission_id, field_key, value, status, source_type,
                                 source_document_id, source_text, confidence, updated_at, updated_by)
                            VALUES
                                (:submission_id, :field_key, :value, :status, :source_type,
                                 :source_document_id, :source_text, :confidence, NOW(), :updated_by)
                            ON CONFLICT (submission_id, field_key)
                            DO UPDATE SET
                                value = CASE
                                    -- Only update if new value is more definitive
                                    WHEN EXCLUDED.status = 'present' THEN EXCLUDED.value
                                    WHEN submission_extracted_values.status = 'present' THEN submission_extracted_values.value
                                    ELSE COALESCE(EXCLUDED.value, submission_extracted_values.value)
                                END,
                                status = CASE
                                    -- Present > pending > not_asked > not_present (priority order)
                                    WHEN EXCLUDED.status = 'present' THEN 'present'
                                    WHEN submission_extracted_values.status = 'present' THEN 'present'
                                    WHEN EXCLUDED.status = 'pending' THEN 'pending'
                                    WHEN submission_extracted_values.status = 'pending' THEN 'pending'
                                    ELSE EXCLUDED.status
                                END,
                                source_type = CASE
                                    WHEN EXCLUDED.status = 'present' THEN EXCLUDED.source_type
                                    ELSE submission_extracted_values.source_type
                                END,
                                source_text = CASE
                                    WHEN EXCLUDED.status = 'present' THEN EXCLUDED.source_text
                                    ELSE submission_extracted_values.source_text
                                END,
                                confidence = CASE
                                    WHEN EXCLUDED.confidence > submission_extracted_values.confidence
                                    THEN EXCLUDED.confidence
                                    ELSE submission_extracted_values.confidence
                                END,
                                updated_at = NOW()
                        """),
                        {
                            "submission_id": submission_id,
                            "field_key": field_name,  # Just the field name, not section.field
                            "value": value_json,
                            "status": status,
                            "source_type": source_type,
                            "source_document_id": document_id,
                            "source_text": result.source_text[:500] if result.source_text else None,
                            "confidence": result.confidence,
                            "updated_by": "pipeline",
                        },
                    )
                    saved_count += 1
                except Exception as e:
                    print(f"[pipeline] Failed to save {field_name}: {e}")

    print(f"[pipeline] Saved {saved_count} extracted values to submission_extracted_values")
    return saved_count


# ───────────── Document Record Saving ─────────────

def _save_document_records(
    submission_id: str,
    document_classifications: dict,
) -> None:
    """
    Save document metadata to the documents table for UI display.
    Also uploads files to Supabase Storage if configured.
    Maps document classification types to user-friendly document types.
    """
    if not engine:
        return

    tables = _existing_tables()
    if "documents" not in tables:
        return

    # Import storage module (optional - graceful fallback if not configured)
    try:
        from core.storage import upload_document, is_configured as storage_configured
        use_storage = storage_configured()
    except ImportError:
        use_storage = False

    # Map DocumentType enum to user-friendly types for the UI
    type_mapping = {
        "application_supplemental": "Application Form",
        "application_acord": "Application Form",
        "loss_runs": "Loss Run",
        "quote": "Quote",
        "financial": "Financial Statement",
        "other": "Other",
    }

    with engine.begin() as conn:
        for file_path, classification in document_classifications.items():
            try:
                path = Path(file_path)
                filename = path.name
                doc_type = type_mapping.get(classification.document_type.value, "Other")

                # Get page count if PDF
                page_count = 1
                if path.suffix.lower() == ".pdf" and path.exists():
                    try:
                        import fitz
                        doc = fitz.open(str(path))
                        page_count = len(doc)
                        doc.close()
                    except Exception:
                        pass

                # Mark applications as priority (only if no existing priority doc)
                is_application = classification.document_type.value in (
                    "application_supplemental", "application_acord"
                )
                is_priority = False
                if is_application:
                    # Check if there's already a priority document
                    existing = conn.execute(
                        text("SELECT 1 FROM documents WHERE submission_id = :sid AND is_priority = true LIMIT 1"),
                        {"sid": submission_id}
                    ).fetchone()
                    is_priority = existing is None  # Only set priority if none exists

                # Upload to Supabase Storage if configured
                storage_key = None
                if use_storage and path.exists():
                    try:
                        result = upload_document(str(path), submission_id, filename)
                        storage_key = result.get("storage_key")
                        print(f"[pipeline] Uploaded to storage: {filename}")
                    except Exception as e:
                        print(f"[pipeline] Storage upload failed for {filename}: {e}")

                # Build metadata
                doc_metadata = {
                    "classification": classification.document_type.value,
                    "classification_confidence": classification.confidence,
                    "file_path": str(path),
                    "ingest_source": "native_pipeline",
                }
                if storage_key:
                    doc_metadata["storage_key"] = storage_key

                conn.execute(
                    text("""
                        INSERT INTO documents
                        (submission_id, filename, document_type, page_count,
                         is_priority, doc_metadata, created_at)
                        VALUES (:sid, :filename, :doc_type, :page_count,
                                :is_priority, :metadata, NOW())
                    """),
                    {
                        "sid": submission_id,
                        "filename": filename,
                        "doc_type": doc_type,
                        "page_count": page_count,
                        "is_priority": is_priority,
                        "metadata": json.dumps(doc_metadata),
                    },
                )
                print(f"[pipeline] Saved document: {filename} ({doc_type})")
            except Exception as e:
                print(f"[pipeline] Failed to save document {file_path}: {e}")


# ───────────── Application Data Merge Helper ─────────────

def _merge_application_data(primary: dict, supplemental: dict) -> dict:
    """
    Merge supplemental application data into primary.
    Supplemental fills gaps but doesn't override existing values.
    """
    def merge_dict(base: dict, extra: dict) -> dict:
        result = dict(base)
        for key, value in extra.items():
            if key not in result or result[key] is None or result[key] == "":
                result[key] = value
            elif isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = merge_dict(result[key], value)
            elif isinstance(result[key], list) and isinstance(value, list):
                # Extend lists with unique items
                existing = set(str(x) for x in result[key])
                for item in value:
                    if str(item) not in existing:
                        result[key].append(item)
        return result

    return merge_dict(primary, supplemental)


# ───────────── Document Processing Helpers ─────────────

def _extract_text_from_pdf(pdf_path: str, use_ocr_fallback: bool = True) -> str:
    """
    Extract text from PDF using PyMuPDF with OCR fallback for scanned documents.

    Args:
        pdf_path: Path to PDF file
        use_ocr_fallback: If True, use Textract OCR when PDF appears scanned

    Returns:
        Extracted text
    """
    try:
        from ai.ocr_utils import extract_text_with_ocr_fallback

        result = extract_text_with_ocr_fallback(pdf_path)

        if result.is_scanned:
            print(f"[pipeline] Scanned PDF detected, used {result.ocr_method} "
                  f"(confidence: {result.ocr_confidence:.0%}, cost: ${result.extraction_cost:.4f})")

        return result.text

    except ImportError:
        # Fallback if ocr_utils not available
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(pdf_path)
            text_parts = []
            for page in doc:
                text_parts.append(page.get_text())
            doc.close()
            return "\n".join(text_parts)
        except Exception as e:
            print(f"[pipeline] Failed to extract text from {pdf_path}: {e}")
            return ""
    except Exception as e:
        print(f"[pipeline] Failed to extract text from {pdf_path}: {e}")
        return ""


def _extract_text_from_pdf_with_metadata(pdf_path: str) -> dict:
    """
    Extract text from PDF with full metadata including OCR info.

    Returns:
        {
            "text": str,
            "page_count": int,
            "is_scanned": bool,
            "ocr_method": str or None,
            "ocr_confidence": float or None,
            "extraction_cost": float
        }
    """
    try:
        from ai.ocr_utils import extract_text_with_ocr_fallback

        result = extract_text_with_ocr_fallback(pdf_path)

        return {
            "text": result.text,
            "page_count": result.page_count,
            "is_scanned": result.is_scanned,
            "ocr_method": result.ocr_method,
            "ocr_confidence": result.ocr_confidence,
            "extraction_cost": result.extraction_cost,
        }

    except Exception as e:
        print(f"[pipeline] Failed to extract text from {pdf_path}: {e}")
        return {
            "text": "",
            "page_count": 0,
            "is_scanned": False,
            "ocr_method": "failed",
            "ocr_confidence": None,
            "extraction_cost": 0.0,
        }


def _process_loss_runs(submission_id: str, loss_runs_docs: list[tuple[str, ClassificationResult]]) -> None:
    """
    Process loss runs documents and save to loss_history table.
    Uses AI to extract claims data from PDF text.
    """
    if not loss_runs_docs:
        return

    for pdf_path, classification in loss_runs_docs:
        try:
            text = _extract_text_from_pdf(pdf_path)
            if not text.strip():
                print(f"[pipeline] No text extracted from loss runs: {pdf_path}")
                continue

            # Parse loss runs with AI
            loss_data = _parse_loss_runs_with_ai(text)
            if loss_data and loss_data.get("claims"):
                _save_loss_history(submission_id, loss_data, classification.detected_carrier)
                print(f"[pipeline] Processed loss runs from {Path(pdf_path).name}: {len(loss_data['claims'])} claims")
        except Exception as e:
            print(f"[pipeline] Failed to process loss runs {pdf_path}: {e}")


def _parse_loss_runs_with_ai(text: str) -> dict:
    """Parse loss runs text using AI to extract structured claims data."""
    prompt = """Analyze this loss runs / loss history document and extract all claims.

Document text:
'''
{text}
'''

Output strictly as JSON:
{{
  "carrier": string | null,  // Carrier name if found
  "policy_period": string | null,  // Policy period if found (e.g., "01/01/2020 - 01/01/2021")
  "total_incurred": number | null,  // Total incurred losses if shown
  "claims": [
    {{
      "claim_number": string | null,
      "date_of_loss": string | null,  // ISO format YYYY-MM-DD if possible
      "description": string | null,  // Brief description of loss
      "status": string | null,  // "open", "closed", "reserved"
      "paid": number | null,  // Amount paid
      "reserved": number | null,  // Amount reserved
      "incurred": number | null  // Total incurred (paid + reserved)
    }}
  ]
}}

Rules:
- Extract ALL claims mentioned
- Parse dates to ISO format when possible
- Parse amounts to raw numbers (e.g., "$50,000" -> 50000)
- If a claim shows "No losses" or similar, return empty claims array
- Include "clean" loss runs (no claims) by returning empty claims array
"""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt.format(text=text[:15000])}],  # Limit text length
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content or "{}")
    except Exception as e:
        print(f"[pipeline] AI loss runs parsing failed: {e}")
        return {}


def _save_loss_history(submission_id: str, loss_data: dict, carrier: str = None) -> None:
    """Save parsed loss history to database."""
    if not engine:
        return

    claims = loss_data.get("claims", [])
    carrier_name = carrier or loss_data.get("carrier")

    with engine.begin() as conn:
        for claim in claims:
            try:
                conn.execute(
                    text("""
                        INSERT INTO loss_history (
                            submission_id, carrier, claim_number, date_of_loss,
                            description, status, paid_amount, reserved_amount, incurred_amount
                        ) VALUES (
                            :sub_id, :carrier, :claim_num, :date_loss,
                            :description, :status, :paid, :reserved, :incurred
                        )
                        ON CONFLICT DO NOTHING
                    """),
                    {
                        "sub_id": submission_id,
                        "carrier": carrier_name,
                        "claim_num": claim.get("claim_number"),
                        "date_loss": claim.get("date_of_loss"),
                        "description": claim.get("description"),
                        "status": claim.get("status"),
                        "paid": claim.get("paid"),
                        "reserved": claim.get("reserved"),
                        "incurred": claim.get("incurred"),
                    },
                )
            except Exception as e:
                print(f"[pipeline] Failed to save claim: {e}")


def _extract_revenue_from_financials(financial_docs: list[tuple[str, ClassificationResult]]) -> int | None:
    """
    Extract annual revenue from financial documents as fallback
    when application doesn't include it.
    """
    if not financial_docs:
        return None

    for pdf_path, classification in financial_docs:
        try:
            text = _extract_text_from_pdf(pdf_path)
            if not text.strip():
                continue

            # Parse financials with AI
            revenue = _parse_revenue_from_financials_ai(text)
            if revenue:
                print(f"[pipeline] Extracted revenue from financials: ${revenue:,}")
                return revenue
        except Exception as e:
            print(f"[pipeline] Failed to extract revenue from {pdf_path}: {e}")

    return None


def _parse_revenue_from_financials_ai(text: str) -> int | None:
    """Parse financial document to extract annual revenue."""
    prompt = """Analyze this financial document and extract the annual revenue.

Document text:
'''
{text}
'''

Output strictly as JSON:
{{
  "annual_revenue": number | null,  // Annual revenue/sales in dollars
  "revenue_year": string | null,  // Year the revenue is for
  "source_line": string | null,  // The exact line item name (e.g., "Total Revenue", "Net Sales")
  "confidence": string  // "high", "medium", "low"
}}

Look for:
- "Revenue", "Total Revenue", "Net Revenue"
- "Sales", "Net Sales", "Gross Sales"
- "Service Revenue", "Operating Revenue"
- Income statement top-line figures

Parse amounts to raw numbers (e.g., "$5,000,000" -> 5000000, "5M" -> 5000000).
Use the most recent full year if multiple years shown.
"""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt.format(text=text[:10000])}],
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content or "{}")
        revenue = data.get("annual_revenue")
        if revenue and data.get("confidence") != "low":
            return int(revenue)
    except Exception as e:
        print(f"[pipeline] AI revenue extraction failed: {e}")

    return None


def _process_underlying_quotes(submission_id: str, quote_docs: list[tuple[str, ClassificationResult]]) -> None:
    """
    Process underlying quotes/policies for excess submissions.
    Extracts coverage information to populate the tower structure.
    """
    if not quote_docs:
        return

    from ai.sublimit_intel import parse_coverages_from_document

    for pdf_path, classification in quote_docs:
        try:
            text = _extract_text_from_pdf(pdf_path)
            if not text.strip():
                print(f"[pipeline] No text extracted from quote: {pdf_path}")
                continue

            # Parse coverage using existing sublimit_intel function
            coverage_data = parse_coverages_from_document(text)

            if coverage_data:
                _save_underlying_coverage(submission_id, coverage_data, classification.detected_carrier)
                carrier = coverage_data.get("carrier_name") or classification.detected_carrier or "Unknown"
                print(f"[pipeline] Processed underlying quote from {carrier}: {len(coverage_data.get('sublimits', []))} coverages")
        except Exception as e:
            print(f"[pipeline] Failed to process quote {pdf_path}: {e}")


def _save_underlying_coverage(submission_id: str, coverage_data: dict, detected_carrier: str = None) -> None:
    """
    Save underlying coverage data from quotes.
    This creates entries that can be used to populate the tower for excess submissions.
    """
    if not engine:
        return

    carrier = coverage_data.get("carrier_name") or detected_carrier
    aggregate = coverage_data.get("aggregate_limit")
    retention = coverage_data.get("retention")
    sublimits = coverage_data.get("sublimits", [])

    # Save to underlying_coverages table (or similar)
    # This data can then be used by the quote page to auto-populate tower
    with engine.begin() as conn:
        # Check if table exists
        tables = _existing_tables()
        if "underlying_coverages" not in tables:
            # Create the table if it doesn't exist
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS underlying_coverages (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
                    carrier VARCHAR(200),
                    aggregate_limit NUMERIC,
                    retention NUMERIC,
                    policy_type VARCHAR(50),
                    sublimits JSONB,
                    source_document VARCHAR(500),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))

        # Insert the coverage data
        conn.execute(
            text("""
                INSERT INTO underlying_coverages (
                    submission_id, carrier, aggregate_limit, retention,
                    policy_type, sublimits
                ) VALUES (
                    :sub_id, :carrier, :aggregate, :retention,
                    :policy_type, :sublimits
                )
            """),
            {
                "sub_id": submission_id,
                "carrier": carrier,
                "aggregate": aggregate,
                "retention": retention,
                "policy_type": coverage_data.get("policy_type"),
                "sublimits": Json(sublimits),
            },
        )


# ───────────── PUBLIC ENTRYPOINT used by ingest_local.py ─────────────

def process_submission(subject: str, email_body: str, sender_email: str, attachments: list[str] | None, use_docupipe: bool = False) -> Any:
    """
    Build analysis using the 'test_analysis' logic and persist results safely to the current schema.
    Returns the new submission id.
    """
    attachments = attachments or []

    # Track extraction for provenance saving later
    extraction_result: ApplicationExtraction | None = None
    pdf_path: str | None = None

    # Prefer a JSON application attachment if present, otherwise try PDF extraction
    app_data = {}
    for p in attachments:
        if hasattr(p, 'standardized_json') and p.standardized_json:
            app_data = p.standardized_json
            break
        elif str(p).lower().endswith(".json") and Path(p).exists():
            app_data = load_json(p)
            break

    # If no JSON found, use document classifier + native PDF extraction
    document_classifications: dict[str, ClassificationResult] = {}
    if not app_data:
        # Gather all PDF paths
        pdf_paths = []
        for p in attachments:
            path_str = str(p.path if hasattr(p, 'path') and p.path else p)
            if path_str.lower().endswith(".pdf") and Path(path_str).exists():
                pdf_paths.append(path_str)

        # Classify all PDFs to identify applications vs loss runs vs quotes
        if pdf_paths:
            try:
                document_classifications = smart_classify_documents(pdf_paths)
                print(f"[pipeline] Classified {len(pdf_paths)} documents:")
                for path, result in document_classifications.items():
                    print(f"  - {Path(path).name}: {result.document_type.value} ({result.confidence:.0%})")
            except Exception as e:
                print(f"[pipeline] Document classification failed: {e}")
                # Fall back to treating all PDFs as potential applications
                document_classifications = {}

        # Extract from application documents (ACORD first, then supplementals)
        supplemental_extractions = []  # Phase 1.9: collect for unified data flow
        application_docs = get_applications(document_classifications)
        if application_docs:
            # Extract from the primary application (usually ACORD)
            primary_app_path, primary_classification = application_docs[0]
            try:
                extraction_result = extract_from_pdf(primary_app_path)
                app_data = extraction_result.to_docupipe_format()
                pdf_path = primary_app_path
                print(f"[pipeline] Extracted from primary application: {Path(primary_app_path).name}")

                # If we have supplemental applications, extract and merge their data
                if len(application_docs) > 1:
                    for supp_path, supp_class in application_docs[1:]:
                        try:
                            supp_result = extract_from_pdf(supp_path)
                            supp_data = supp_result.to_docupipe_format()
                            # Merge: supplemental data fills in gaps but doesn't override
                            app_data = _merge_application_data(app_data, supp_data)
                            supplemental_extractions.append(supp_result)  # Store for later
                            print(f"[pipeline] Merged supplemental: {Path(supp_path).name}")
                        except Exception as e:
                            print(f"[pipeline] Supplemental extraction failed for {supp_path}: {e}")
            except Exception as e:
                print(f"[pipeline] Primary application extraction failed: {e}")

        # Fallback: if no classified applications, try first PDF
        if not app_data and pdf_paths:
            for path_str in pdf_paths:
                try:
                    extraction_result = extract_from_pdf(path_str)
                    app_data = extraction_result.to_docupipe_format()
                    pdf_path = path_str
                    print(f"[pipeline] Fallback extraction from: {Path(path_str).name}")
                    break
                except Exception as e:
                    print(f"[pipeline] PDF extraction failed for {path_str}: {e}")
                    continue

    # Determine applicant
    name, website = extract_applicant_info(app_data)
    if not name:
        name = extract_name_from_email(email_body or subject or "")

    # Extract revenue (with financial document fallback)
    revenue = extract_revenue(app_data)
    if not revenue and document_classifications:
        # Fallback: try to extract revenue from financial documents
        financial_docs = get_financials(document_classifications)
        if financial_docs:
            print(f"[pipeline] No revenue in app, checking {len(financial_docs)} financial document(s)...")
            revenue = _extract_revenue_from_financials(financial_docs)

    # External public info
    tavily_text = get_public_description(name, website)

    # Summaries
    email_summary = summarize_submission_email(email_body or subject or "")
    business_summary = summarize_business_operations(name, website, tavily_text)
    cyber_exposures = summarize_cyber_exposures(business_summary)
    nist_controls = summarize_nist_controls(app_data or {})
    bullet_points = summarize_bullet_points(app_data or {})
    controls_summary = summarize_controls_with_flags_and_bullets(app_data or {})  # Legacy combined

    # Guideline decision
    ai_result = get_ai_decision(business_summary, cyber_exposures, controls_summary)
    ai_text = ai_result["answer"]
    ai_cites = ai_result["citations"]

    # NAICS + tags
    naics_result = classify_naics(business_summary)
    industry_tags = naics_result.get("tags", [])

    # Flags + vectors
    nist_flags = _parse_nist_flags(controls_summary)
    nist_vector = _vector_from_flags(nist_flags)
    ops_vec = _embed_text(business_summary)
    controls_vec = _embed_text(controls_summary)
    exposures_vec = _embed_text(cyber_exposures)

    # Resolve broker assignment from email chain and contacts
    broker_info = resolve_broker_assignment(email_body or subject or "", sender_email)
    broker_email = broker_info.get("email") or sender_email
    broker_company_id = broker_info.get("broker_company_id")
    broker_org_id = broker_info.get("broker_org_id")
    broker_employment_id = broker_info.get("broker_employment_id")
    broker_person_id = broker_info.get("broker_person_id")

    # Insert minimal stub, then update with whatever columns exist
    sid = _insert_stub(broker_email, name, email_summary)
    _update_submission_by_id(sid, {
        "name": name,
        "website": website,
        "broker_email": broker_email,
        "broker_company_id": broker_company_id,
        "broker_org_id": broker_org_id,
        "broker_employment_id": broker_employment_id,
        "broker_person_id": broker_person_id,
        "revenue": revenue,
        "biz_sum": business_summary,
        "cyber": cyber_exposures,
        "ctrl_sum": nist_controls,  # Now just NIST controls
        "bullet_sum": bullet_points,  # New separate bullet points
        "naics": naics_result,
        "industry_tags": industry_tags,
        "nist_flags": nist_flags,
        "nist_vector": nist_vector,
        "ops_vec": ops_vec,
        "controls_vec": controls_vec,
        "exposures_vec": exposures_vec,
        "ai_rec": ai_text,
        "ai_cites": ai_cites,
    })

    # ───────────── Save field values for conflict detection ─────────────
    # Track extracted values with provenance for conflict detection system
    sid_str = str(sid)

    # Applicant info (from application documents)
    if name:
        save_field_value(sid_str, "applicant_name", name, "ai_extraction")
    if website:
        save_field_value(sid_str, "website", website, "ai_extraction")
    if revenue:
        save_field_value(sid_str, "annual_revenue", revenue, "ai_extraction")

    # NAICS classification
    primary = naics_result.get("primary", {}) or {}
    secondary = naics_result.get("secondary", {}) or {}
    if primary.get("code"):
        save_field_value(
            sid_str, "naics_primary_code", primary["code"], "ai_extraction",
            confidence=primary.get("confidence"),
        )
    if primary.get("title"):
        save_field_value(
            sid_str, "naics_primary_title", primary["title"], "ai_extraction",
            confidence=primary.get("confidence"),
        )
    if secondary.get("code"):
        save_field_value(
            sid_str, "naics_secondary_code", secondary["code"], "ai_extraction",
            confidence=secondary.get("confidence"),
        )

    # Broker info (from email parsing)
    if broker_email:
        save_field_value(sid_str, "broker_email", broker_email, "broker_submission")

    # ───────────── Run full conflict detection ─────────────
    # Run detection with app_data for contradiction checks and broker_info for sign-offs
    conflict_service = ConflictService()
    conflict_service.run_full_detection(
        submission_id=sid_str,
        app_data=app_data,
        broker_info=broker_info,
    )

    # ───────────── Save extraction provenance (if native extraction was used) ─────────────
    if extraction_result is not None:
        try:
            _save_extraction_provenance(sid_str, extraction_result)
            _save_extraction_run(sid_str, extraction_result)
            # Phase 1.9: Also save to unified submission_extracted_values table
            _save_extracted_values(sid_str, extraction_result, source_type="extraction")
        except Exception as e:
            print(f"[pipeline] Failed to save extraction provenance: {e}")

    # Phase 1.9: Save supplemental extraction results to unified table
    for supp_extraction in supplemental_extractions:
        try:
            _save_extracted_values(sid_str, supp_extraction, source_type="supplemental")
        except Exception as e:
            print(f"[pipeline] Failed to save supplemental extraction: {e}")

    # ───────────── Save document records for UI display ─────────────
    if document_classifications:
        try:
            _save_document_records(sid_str, document_classifications)
        except Exception as e:
            print(f"[pipeline] Failed to save document records: {e}")

    # ───────────── Process other document types ─────────────
    if document_classifications:
        # Process loss runs
        loss_runs_docs = get_loss_runs(document_classifications)
        if loss_runs_docs:
            print(f"[pipeline] Processing {len(loss_runs_docs)} loss runs document(s)...")
            try:
                _process_loss_runs(sid_str, loss_runs_docs)
            except Exception as e:
                print(f"[pipeline] Loss runs processing failed: {e}")

        # Process underlying quotes for tower population
        quote_docs = get_quotes(document_classifications)
        if quote_docs:
            print(f"[pipeline] Processing {len(quote_docs)} underlying quote(s)...")
            try:
                _process_underlying_quotes(sid_str, quote_docs)
            except Exception as e:
                print(f"[pipeline] Quote processing failed: {e}")

    # ───────────── Intelligent Document Extraction ─────────────
    # Use the extraction orchestrator for documents that benefit from
    # intelligent routing and policy form catalog
    if document_classifications:
        try:
            from core.extraction_orchestrator import process_submission_documents, link_provenance_to_textract
            print(f"[pipeline] Running intelligent extraction orchestrator...")
            extraction_results = process_submission_documents(sid_str, document_classifications)
            if extraction_results:
                print(f"[pipeline] Orchestrator processed {len(extraction_results)} documents")

            # Link provenance records to Textract bbox entries for PDF highlighting
            link_result = link_provenance_to_textract(sid_str)
            if link_result.get("linked_count"):
                print(f"[pipeline] Linked {link_result['linked_count']}/{link_result['total_provenance']} extractions to bbox")
        except ImportError as e:
            print(f"[pipeline] Extraction orchestrator not available: {e}")
        except Exception as e:
            print(f"[pipeline] Extraction orchestrator failed: {e}")

    # ───────────── Remarket Detection (Phase 7) ─────────────
    # Check if this is a resubmission of an account we've seen before
    try:
        _detect_remarket(sid_str)
    except Exception as e:
        print(f"[pipeline] Remarket detection failed: {e}")

    # ───────────── Renewal Matching (Phase 8) ─────────────
    # Check if this submission matches a pending renewal expectation
    try:
        _match_renewal_expectation(sid_str, name, broker_email, website)
    except Exception as e:
        print(f"[pipeline] Renewal matching failed: {e}")

    return sid

# ───────────── CLI (optional for local testing) ─────────────
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-file", help="Path to standardized application JSON")
    parser.add_argument("--email-file", help="Path to broker email text")
    parser.add_argument("--broker", default="local@example.com")
    args = parser.parse_args()

    app_data = load_json(args.app_file) if args.app_file else {}
    email_body = load_text(args.email_file) if args.email_file else ""
    sid = process_submission(
        subject="Local Test",
        email_body=email_body,
        sender_email=args.broker,
        attachments=[args.app_file] if args.app_file else [],
        use_docupipe=False,
    )
    print(f"✅ submission id: {sid}")
