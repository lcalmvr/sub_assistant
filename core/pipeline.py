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

# ───────────── PUBLIC ENTRYPOINT used by ingest_local.py ─────────────

def process_submission(subject: str, email_body: str, sender_email: str, attachments: list[str] | None, use_docupipe: bool = False) -> Any:
    """
    Build analysis using the 'test_analysis' logic and persist results safely to the current schema.
    Returns the new submission id.
    """
    attachments = attachments or []

    # Prefer a JSON application attachment if present
    app_data = {}
    for p in attachments:
        if hasattr(p, 'standardized_json') and p.standardized_json:
            app_data = p.standardized_json
            break
        elif str(p).lower().endswith(".json") and Path(p).exists():
            app_data = load_json(p)
            break

    # Determine applicant
    name, website = extract_applicant_info(app_data)
    if not name:
        name = extract_name_from_email(email_body or subject or "")
    
    # Extract revenue
    revenue = extract_revenue(app_data)

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
