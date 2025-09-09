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
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=250,
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
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=300,
    )
    return rsp.choices[0].message.content.strip()


def summarize_cyber_exposures(business_summary: str) -> str:
    prompt = f"""
You are a cyber insurance underwriter. Based on the business description below, identify the likely cyber risks and exposures this company faces. Focus only on the operations as described—do not speculate beyond what is stated. Format as bullet points.
Business Summary:\n{business_summary}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=200,
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
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=1000,
    )
    return rsp.choices[0].message.content.strip()


def summarize_bullet_points(app_data: dict[str, Any]) -> str:
    """Generate bullet point summary of security controls only"""
    prompt = f"""
You are a cyber insurance underwriter. Review the following JSON-formatted application data. Provide a bullet-point summary of all notable security controls, grouped by category (e.g., MFA, Backups, EDR, Phishing Training). Use clear, concise, factual language.

Group controls by category and list specific implementations or gaps. Focus on factual statements about what is present, absent, or unclear.

JSON:
{json.dumps(app_data, indent=2)}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=800,
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
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=180,
    )
    return rsp.choices[0].message.content.strip()

# ───────────── NAICS (vector + LLM) ─────────────
import numpy as np
import pandas as pd

NAICS_FILE = Path("naics_2022_w_embeddings.parquet")
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
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=60,
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
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": _SYSTEM_NAICS},
            {"role": "user", "content": f"Description:\n{description}\n\nCandidates:\n{cands}"},
        ],
        temperature=0.0,
        max_tokens=200,
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


def _embed_text(txt: str) -> list[float]:
    if not (txt or "").strip():
        return []
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
from guideline_rag import get_ai_decision

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

    if not updates:
        return
    sql = text(f"UPDATE submissions SET {', '.join(updates)}, updated_at = COALESCE(updated_at, NOW()) WHERE id = :sid")
    with engine.begin() as conn:
        conn.execute(sql, params)

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

    # Insert minimal stub, then update with whatever columns exist
    sid = _insert_stub(sender_email, name, email_summary)
    _update_submission_by_id(sid, {
        "name": name,
        "website": website,
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
