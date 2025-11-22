import os
import json
import argparse
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
from tavily import TavilyClient
from guideline_rag import get_ai_decision

# ---------- FILENAME DETECTION HELPER ----------
_FILE_EXT_RE = re.compile(r"\.(pdf|json|docx?|xlsx?|pptx?|csv|png|jpe?g)$", re.I)

def _looks_like_filename(s: str) -> bool:
    """Return True if string ends with a common file extension."""
    return bool(_FILE_EXT_RE.search(s.strip()))


# ---------- DB / vector imports ----------
import psycopg2
from psycopg2.extras import Json            # ← correct adapter
from pgvector.psycopg2 import register_vector
from pgvector import Vector
# ---------- END DB / vector imports -------

# ---------- BEGIN NAICS imports ----------
import numpy as np
import pandas as pd
# ---------- END   NAICS imports ----------

from datetime import datetime, UTC


# ─────────────────── ENV / CLIENTS (unchanged) ───────────────────
load_dotenv(dotenv_path=Path('.') / '.env')
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
DATABASE_URL = os.getenv("DATABASE_URL")  # make sure this is set in .env
# ─────────────────── FILE HELPERS (unchanged) ────────────────────
def load_json(file_path):
    with open(file_path, "r") as f:
        return json.load(f)

def load_email_text(file_path):
    with open(file_path, "r") as f:
        return f.read()

# ───────────── IDENTIFIER EXTRACTORS (unchanged) ────────────────
# ──────────────────────────────────────────────────────────────
# NEW extract_applicant_info
# ──────────────────────────────────────────────────────────────
def extract_applicant_info(app_data):
    name_keys    = {
        "applicantname", "applicant_name",
        "insuredname",   "insured_name",
        "companyname",   "company_name"
    }
    site_keys    = {
        "primarywebsiteandemaildomains", "primary_website_and_email_domains",
        "website", "web_site", "primarywebsite", "domain", "url"
    }

    raw_name = _deep_find(app_data, name_keys) or ""
    raw_site = _deep_find(app_data, site_keys) or ""

    # Discard filename-like values to trigger email fallback
    if raw_name and _looks_like_filename(raw_name):
        raw_name = ""


    name    = _clean_company_name(raw_name) if raw_name else ""
    website = ""

    # normalise website / domain string
    if raw_site:
        # if JSON gives a list, take the first element
        if raw_site.startswith("[") and raw_site.endswith("]"):
            try:
                lst = json.loads(raw_site)
                raw_site = lst[0] if lst else ""
            except Exception:
                pass
        # split on whitespace/commas and pick first token containing a dot
        parts = [p.strip().lower() for p in re.split(r"[,\s]+", raw_site) if "." in p]
        website = parts[0] if parts else ""

    return name, website

# ──────────────────────────────────────────────────────────────
# NEW extract_name_from_email  (tightened regex)
# ──────────────────────────────────────────────────────────────
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
# ───────────── PUBLIC INFO / FALLBACK (unchanged) ───────────────
# ──────────────────────────────────────────────────────────────
# Helper: clean company name (same rules you requested earlier)
# ──────────────────────────────────────────────────────────────
def _clean_company_name(raw: str) -> str:
    raw = _FILE_EXT_RE.sub("", raw)
    raw = re.sub(r"[_\-]+", " ", raw)
    core = re.split(r"[.,\n\r]", raw, 1)[0]
    core = re.sub(r"\s{2,}", " ", core).strip()
    return core.title()
# ──────────────────────────────────────────────────────────────
# Helper: deep search for a key (case-insensitive) in nested JSON
# ──────────────────────────────────────────────────────────────
def _deep_find(d: Mapping | Sequence, key_set: set[str]) -> str | None:
    stack = [d]
    while stack:
        cur = stack.pop()
        if isinstance(cur, Mapping):
            for k, v in cur.items():
                if k.lower() in key_set and isinstance(v, str) and v.strip():
                    return v.strip()
                if isinstance(v, (Mapping, Sequence)):
                    stack.append(v)
        elif isinstance(cur, Sequence) and not isinstance(cur, (str, bytes)):
            stack.extend(cur)
    return None

def fallback_research_summary(name_or_domain):
    prompt = f"""
You are an analyst tasked with researching a company. Based on the name or domain provided, explain in plain, factual language what the company does. Focus only on their core business and offerings. Avoid all marketing language or speculation.

Company: {name_or_domain}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        # max_completion_tokens=250,
    )
    return rsp.choices[0].message.content.strip()

def get_public_description(name: str, website: str | None = None) -> str:
    """
    Query Tavily (or fallback) with multiple angles until we collect at least
    ~120 words of raw text. Always tries:
        • "<name> company overview"
        • "What does <name> do"
        • "<name> industry"
    Plus, if a website/domain is known, tries the domain directly.
    Returns the concatenated snippets (deduped, trimmed).
    """
    queries = [
        f"{name} company overview",
        f"What does {name} do",
        f"{name} industry",
    ]
    if website:
        queries.insert(0, website)  # domain first, then generic queries

    collected = []
    for q in queries:
        try:
            res = tavily_client.search(q, max_results=3)
            for hit in res.get("results", []):
                snippet = hit.get("content", "").strip()
                if snippet and snippet not in collected:
                    collected.append(snippet)
            # early exit if we have ~120+ words
            if sum(len(s.split()) for s in collected) >= 120:
                break
        except Exception:
            continue

    if not collected:
        # final fallback to LLM if Tavily fails everywhere
        return fallback_research_summary(name or website)

    joined = " ".join(collected)
    # soft trim to ~300 words for prompt efficiency
    words = joined.split()
    return " ".join(words[:300])


# ───────────── BUSINESS / CYBER SUMMARISERS (unchanged) ─────────
def summarize_business_operations(name, website, public_info):
    prompt = f"""
You are a cyber insurance underwriter reviewing a company for potential coverage. Using the information below, write a plain, factual summary of what this company does. Avoid any marketing language. Do NOT include anything about insurance, brokers, submissions, or policy terms.

Company Name: {name or 'unknown company'}
Website: {website or 'no website provided'}
Public Info:
{public_info}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        # max_completion_tokens=300,
    )
    return rsp.choices[0].message.content.strip()

def summarize_cyber_exposures(business_summary):
    prompt = f"""
You are a cyber insurance underwriter. Based on the business description below, identify the likely cyber risks and exposures this company faces. Focus only on the operations as described—do not speculate beyond what is stated. Format as bullet points.

Business Summary:
{business_summary}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        # max_completion_tokens=200,
    )
    return rsp.choices[0].message.content.strip()

def summarize_controls_with_flags_and_bullets(app_data):
    prompt = f"""
You are a cyber insurance underwriter. Review the following JSON-formatted application data. Summarize the insured’s cybersecurity posture by comparing their responses to the NIST Cybersecurity Framework. Organize the output into two sections:

---

🔐 NIST CYBERSECURITY FRAMEWORK SUMMARY

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

---

📌 BULLET POINT SUMMARY

Provide a bullet-point summary of all notable security controls, grouped by category (e.g., MFA, Backups, EDR, Phishing Training). Use clear, concise, factual language.

---

When evaluating each NIST domain, apply the following inference rules:

- If the application confirms that remote access is protected by MFA, consider this a valid MFA control—even if MFA isn't mentioned elsewhere.
- If the organization uses a Managed Detection and Response (MDR) provider, assume Endpoint Detection & Response (EDR) is present unless explicitly contradicted.
- If patching cadence is provided, include this under the "Protect" domain even if no specific patching tools are mentioned.
- If segmentation, encryption, or backup practices are described, include them under "Protect" and assess maturity.
- If phishing training is mentioned under any form of security awareness or training, include it under "Protect".
- If fields are marked “not provided” or are missing, note this clearly and consider it when assigning flags.
- Do not highlight something as missing if the context reasonably implies its existence based on the above.

JSON:
{json.dumps(app_data, indent=2)}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        # max_completion_tokens=1000,
    )
    return rsp.choices[0].message.content.strip()

def summarize_submission_email(email_text):
    prompt = f"""
You are a cyber insurance underwriter. Summarize this broker email into a short list of bullet points that clearly identifies:
- what is being requested
- important dates
- key coverage or structure considerations
Keep it brief and specific.

Email:
{email_text}
"""
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        # max_completion_tokens=180,
    )
    return rsp.choices[0].message.content.strip()

### BEGIN NAICS BLOCK  (replace your current block with this) ------------------
NAICS_FILE = Path("naics_2022_w_embeddings.parquet")
if not NAICS_FILE.exists():
    raise FileNotFoundError(
        "naics_2022_w_embeddings.parquet missing. Build it once, then rerun."
    )

_naics_df = pd.read_parquet(NAICS_FILE)     # code | title | emb (list[float])
_EMBED_MODEL = "text-embedding-3-small"

def _embed(txt: str) -> list[float]:
    return openai_client.embeddings.create(
        input=[txt[:512]], model=_EMBED_MODEL
    ).data[0].embedding

def _cosine(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def _top_k(desc, k=8):
    vec = _embed(desc)
    _naics_df["sim"] = _naics_df["emb"].apply(lambda v: _cosine(vec, v))
    return _naics_df.nlargest(k, "sim")[["code", "title", "sim"]]

# -----------------------------------------------------------------------------#
#  GPT system prompt for NAICS
# -----------------------------------------------------------------------------#
_SYSTEM_NAICS = (
    "You are a NAICS classifier.\n"
    "Return ONLY valid JSON with keys:\n"
    "  primary   {code,title,confidence}\n"
    "  secondary {code,title,confidence or null}\n"
    "Rules:\n"
    "• primary   = what the company ITSELF does.\n"
    "• secondary = customer vertical if the company clearly sells into one; "
    "  else set all values to null.\n"
    "• confidence must be a float 0–1."
)

# -----------------------------------------------------------------------------#
#  Extra helper: generate concise industry tags (e.g., 'AdTech', 'SaaS')
# -----------------------------------------------------------------------------#
def _generate_industry_tags(description: str) -> list[str]:
    prompt = (
        "List 1-3 concise industry tags that best describe the company below. "
        "Use common tech/industry slang (max 3 words each). "
        "Return as a JSON array of strings (no markdown).\n\n"
        f"{description}"
    )
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        # max_completion_tokens=60,
    ).choices[0].message.content.strip()

    import json, re
    m = re.search(r"\[.*\]", rsp, re.S)
    try:
        tags = json.loads(m.group(0)) if m else []
    except json.JSONDecodeError:
        tags = []
    # clean & dedupe
    return list({t.strip().title() for t in tags if isinstance(t, str) and t.strip()})

# -----------------------------------------------------------------------------#
#  Main classifier
# -----------------------------------------------------------------------------#
def classify_naics(description: str) -> dict:
    # 1) vector search for top-k candidates
    cands = _top_k(description).to_dict("records")

    # 2) ask GPT to pick primary / secondary
    rsp = openai_client.chat.completions.create(
        model="gpt-5.1",
        messages=[
            {"role": "system", "content": _SYSTEM_NAICS},
            {"role": "user",
             "content": f"Description:\n{description}\n\nCandidates:\n{cands}"},
        ],
        temperature=0.0,
        # max_completion_tokens=200,
    ).choices[0].message.content.strip()

    import json, re
    m = re.search(r"\{.*\}", rsp, re.S)
    try:
        naics = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        naics = {}

    primary   = naics.get("primary", {}) or {}
    secondary = naics.get("secondary", {}) or {}

    # 3) deterministic fallback: use second-best candidate if secondary empty
    if not secondary.get("code"):
        for cand in cands:
            if cand["code"] != primary.get("code"):
                secondary = {
                    "code": cand["code"],
                    "title": cand["title"],
                    "confidence": round(cand["sim"], 3),
                }
                break

    # 4) generate free-form tags
    tags = _generate_industry_tags(description)

    return {"primary": primary, "secondary": secondary, "tags": tags}
### END NAICS BLOCK ------------------------------------------------------------


# ─────────────── DB save helper (overwrite existing) ───────────────
def _save_to_db(rec: dict):
    """
    Insert run results into `submissions`. No upsert logic—every call writes
    a fresh row. Make sure the columns listed here exist in the table.
    """
    if not DATABASE_URL:
        print("⚠️  DATABASE_URL not set – skipping DB insert")
        return

    primary = rec["naics"].get("primary", {})
    secondary = rec["naics"].get("secondary", {})

    sql = """
    INSERT INTO submissions (
      applicant_name, website,
      business_summary, cyber_exposures, nist_controls_summary,
      naics,
      naics_primary_code, naics_primary_title, naics_primary_confidence,
      naics_secondary_code, naics_secondary_title, naics_secondary_confidence,
      nist_controls, nist_vector,
      ops_embedding, controls_embedding, exposures_embedding, industry_tags,
      ai_recommendation, ai_guideline_citations
    )
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);
    """

    try:
        conn = psycopg2.connect(DATABASE_URL)
        register_vector(conn)          # ← add this line once
        cur  = conn.cursor()
        cur.execute(
            sql,
            (
                rec["name"],
                rec["website"],
                rec["biz_sum"],
                rec["cyber"],
                rec["ctrl_sum"],
                json.dumps(rec["naics"]),
                primary.get("code"), primary.get("title"), primary.get("confidence"),
                secondary.get("code"), secondary.get("title"), secondary.get("confidence"),
                json.dumps(rec["nist_flags"]),
                Vector(rec["nist_vector"]),
                Vector(rec["ops_vec"]),
                Vector(rec["controls_vec"]),
                Vector(rec["exposures_vec"]),    # 1536-D  ← new column
                Json(rec["industry_tags"]),             # ← new parameter 18
                rec["ai_rec"],                          # new parameter 19
                json.dumps(rec["ai_cites"]),            # new parameter 20
            ),
        )
        conn.commit()
        cur.close()
        conn.close()
        print(f"✅  inserted row for {rec['name']}")
    except Exception as e:
        print("⚠️  DB insert failed:", e)
# ──────────────────────────────────────────────────────────

# --- helpers to add -------------------------------------------------
def _parse_nist_flags(text: str) -> dict:
    """Return dict of CSF flags found in the summary text."""
    flags = {}
    for fn in ("Identify", "Protect", "Detect", "Respond", "Recover"):
        m = re.search(rf"{fn}[^✅⚠️❌]*?(✅|⚠️|❌)", text, re.I)
        if m:
            flags[fn.lower()] = m.group(1)
    return flags

def _vector_from_flags(flags: dict) -> list[int]:
    """Map ✅→1, ⚠️→0, ❌→-1 for [identify,protect,detect,respond,recover]."""
    order = ["identify", "protect", "detect", "respond", "recover"]
    code  = {"✅": 1, "⚠️": 0, "❌": -1}
    return [code.get(flags.get(f, "⚠️"), 0) for f in order]

def _embed_text(txt: str) -> list[float]:
    """OpenAI embedding for vectors – use the same small model everywhere."""
    if not txt.strip():       # empty safeguard
        return []
    return openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=txt,
        encoding_format="float"
    ).data[0].embedding
# --------------------------------------------------------------------


# ───────────────────────── MAIN FLOW ──────────────────────
def run_test(app_file, email_file):
    print("🗂️ Loading files...")
    app_data   = load_json(app_file)
    email_body = load_email_text(email_file)

    name, website = extract_applicant_info(app_data)
    if not name:
        name = extract_name_from_email(email_body)

    print(f"📛 Company Name: {name}")
    print(f"🌐 Website: {website or 'Not provided'}")

    tavily_text = get_public_description(name, website)

    # Summaries
    email_summary    = summarize_submission_email(email_body)
    business_summary = summarize_business_operations(name, website, tavily_text)
    cyber_exposures  = summarize_cyber_exposures(business_summary)
    controls_summary = summarize_controls_with_flags_and_bullets(app_data)
    ai_text, ai_cites = get_ai_decision(business_summary, cyber_exposures, controls_summary)
    naics_result     = classify_naics(business_summary)
    industry_tags = naics_result.get("tags", [])   # NEW
    nist_flags   = _parse_nist_flags(controls_summary)
    nist_vector  = _vector_from_flags(nist_flags)
    ops_vec      = _embed_text(business_summary)     # 1536-d
    controls_vec = _embed_text(controls_summary)     # 1536-d
    exposures_vec  = _embed_text(cyber_exposures)       # NEW


    # Display (unchanged)
    print("\n📩 SUBMISSION SUMMARY:\n")
    print(email_summary)

    print("\n🏢 BUSINESS OPERATIONS:\n")
    print(business_summary)

    print("\n🛡️ CYBER EXPOSURES:\n")
    print(cyber_exposures)

    print("\n🔐 SECURITY CONTROLS (NIST FRAMEWORK):\n")
    print(controls_summary)

    print("\n🏷️ NAICS CLASSIFICATION:\n")
    print(json.dumps(naics_result, indent=2))

    # Save to DB
    _save_to_db({
        "name": name,
        "website": website,
        "biz_sum": business_summary,
        "cyber": cyber_exposures,
        "ctrl_sum": controls_summary,
        "naics": naics_result,
        "industry_tags": industry_tags,
        "nist_flags": nist_flags,                 # ← added
        "nist_vector": nist_vector,               # ← added
        "ops_vec": ops_vec,                       # ← added
        "controls_vec": controls_vec,             # ← added
        "exposures_vec" : exposures_vec,      # ← new
        "ai_rec": ai_text,
        "ai_cites": ai_cites,
    })

# ───────────────────────── CLI ────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-file", required=True, help="Path to standardized application JSON")
    parser.add_argument("--email-file", required=True, help="Path to broker email text")
    args = parser.parse_args()
    run_test(args.app_file, args.email_file)
