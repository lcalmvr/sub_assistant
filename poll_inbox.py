#!/usr/bin/env python3
"""
poll_inbox.py  •  Gmail → DocuPipe → GPT-4o underwriting pipeline
===============================================================
Persists each submission to Postgres (Supabase) with:
  • operations_summary                (text)
  • security_controls_summary         (text)
  • ops_embedding, controls_embedding (pgvector)
  • flags JSON  e.g.
      {
        "mfa": "above_average",
        "backups": "below_average",
        "edr": "above_average",
        "phish_training": "average"
      }
  • industry_code  (manufacturing, msp, saas …)
and sends an acknowledgement e-mail back to the broker.
"""
# ────────────────────────────────────────────────────────────
import os, re, time, json, base64, imaplib, email, smtplib, html
from datetime import datetime, UTC
from email.header  import decode_header
from email.message import EmailMessage
from bs4           import BeautifulSoup

import requests, openai, tavily, psycopg2
from pgvector.psycopg2 import register_vector
from pgvector          import Vector

# ─── ENV & secrets ──────────────────────────────────────────
EMAIL_ACCOUNT          = os.getenv("GMAIL_USER")
APP_PASSWORD           = os.getenv("GMAIL_APP_PASSWORD")
IMAP_SERVER, IMAP_PORT = "imap.gmail.com", 993

DOCUPIPE_API_KEY       = os.getenv("DOCUPIPE_API_KEY")
BASE_URL               = "https://app.docupipe.ai"

openai_client  = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
tavily_client  = tavily.TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

DATABASE_URL   = os.getenv("DATABASE_URL")

ATT_DIR, RESP_DIR = "attachments", "responses"

SCHEMA_MAP = {
    "bb981184": "e794cee0",   # Cyber / Tech application
    "ef9a697a": "34e8b170",   # Loss runs
}

# ─── Security-controls extraction & rating  ─────────────────
_CONTROL_CATS = {
    "mfa"            : ["multifactor", "mfa"],
    "backups"        : ["backup", "offlinebackup", "immutablebackup"],
    "edr"            : ["edr", "endpointdetection"],
    "phish_training" : ["phishing", "securityawareness"],
}

def _bool_from_val(val):
    """Normalise True/False/Yes/No/1/0 → present/absent/unknown."""
    if val in (True, "true", "yes", "present", 1):   return "present"
    if val in (False, "false", "no", "absent", 0):   return "absent"
    return "unknown"

def _find_flag(node, needle):
    """
    DFS through nested dicts/lists; if a key contains *needle*:
      • if value is bool/str/int → return presence
      • if value is dict → look for child key 'present' or 'isPresent'
    """
    stack = [node]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if needle in k.lower():
                    if isinstance(v, (bool, str, int)):
                        return _bool_from_val(v)
                    if isinstance(v, dict):
                        for ck, cv in v.items():
                            if "present" in ck.lower():
                                return _bool_from_val(cv)
                stack.append(v)
        elif isinstance(cur, list):
            stack.extend(cur)
    return "unknown"

def _presence_to_rating(val: str) -> str:
    """present → above_average, unknown → average, absent → below_average"""
    if val == "present": return "above_average"
    if val == "absent":  return "below_average"
    return "average"

def _controls_from_json(app_jsons: list[dict]) -> tuple[str, dict]:
    """
    Returns (narrative_summary, ratings_dict)
    ratings_dict = { mfa | backups | edr | phish_training : above/average/below }
    """
    if not app_jsons:
        return (
            "No security-controls information supplied.",
            {k: "average" for k in _CONTROL_CATS.keys()},
        )

    app = app_jsons[0]        # assume first application JSON is primary
    ratings: dict[str, str] = {}

    for cat, needles in _CONTROL_CATS.items():
        presence = "unknown"
        for n in needles:
            presence = _find_flag(app, n)
            if presence != "unknown":
                break
        ratings[cat] = _presence_to_rating(presence)

    # Build narrative sentence
    phrases = []
    for cat, grade in ratings.items():
        label = {
            "mfa"            : "MFA",
            "backups"        : "backups",
            "edr"            : "EDR",
            "phish_training" : "phishing-training",
        }[cat]
        if grade == "above_average":
            phrases.append(f"strong {label}")
        elif grade == "average":
            phrases.append(f"partial {label}")
        else:
            phrases.append(f"no {label}")

    narrative = (
        "Security-controls assessment: " +
        "; ".join(phrases[:-1]) +
        f"; and {phrases[-1]}."
    ).capitalize()

    return narrative, ratings

# ─── Small util fns ─────────────────────────────────────────
utc_now = lambda: datetime.now(UTC)

def plain_body(msg):
    """Extract plain-text body from e-mail (fallback to HTML→text)."""
    if msg.is_multipart():
        for p in msg.walk():
            ct = p.get_content_type()
            if ct == "text/plain":
                return p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
            if ct == "text/html":
                h = p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
                return BeautifulSoup(h, "html.parser").get_text(" ", strip=True)
    return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8")

def derive_applicant_name(subject: str, gi: dict) -> str:
    """Use App JSON or subject line to determine insured name."""
    if gi.get("applicantName"):
        return gi["applicantName"].strip()
    # split on " – " or " - "
    parts = re.split(r"\s[-–]\s", subject)
    name  = parts[-1].strip() if len(parts) > 1 else subject.strip()
    name  = re.sub(r"(?i)(submission|cyber/tech|request)", "", name).strip()
    return name or "Unnamed Company"

def shrink(d: dict) -> dict:
    """Strip giant blobs before passing into GPT context."""
    out = {}
    for k, v in d.items():
        if isinstance(v, str)  and len(v) > 800:                 continue
        if isinstance(v, list) and len(v) > 50:  out[k] = f"[{len(v)} items]"
        else:                                    out[k] = v
    return out

# ─── Industry helpers / GPT prompts ─────────────────────────
CHOICES = {
    "manufacturing","msp","saas","fintech","healthcare",
    "ecommerce","logistics","retail","energy","government","other",
}

def tavily_blurb(name: str, website: str) -> str:
    q = (name or website).strip()
    if not q:
        return ""
    try:
        res = tavily_client.search(f"{q} company overview", max_results=5)
        if res.get("results"):
            top = res["results"][0]
            return f"{top['title']}: {top.get('content','').strip()}"
    except Exception as e:
        print("Tavily error:", e)
    return ""

def classify_industry(name: str, ctx: str) -> str:
    prompt = (
        "Return ONE word from: " + ", ".join(sorted(CHOICES)) +
        f"\n\nCompany: {name}\nContext:\n{ctx}"
    )
    ans = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0,
        max_tokens=10,
    ).choices[0].message.content.strip().lower()
    return ans if ans in CHOICES else "other"

def bullets_business_ops(context: str) -> str:
    prompt = (
        "Convert the description below into 4-6 concise bullet points:\n\n" + context
    )
    txt = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role":"user","content":prompt}],
        temperature=0.3,
        max_tokens=180,
    ).choices[0].message.content.strip()
    # guardrail for empty / safety responses
    if txt.lower().startswith("to provide a detailed response"):
        txt = "* Business operations unavailable – awaiting further info."
    return txt

def gpt_summary(subject, body, apps_small, losses_small, ops_bullets):
    sys = (
        "You are a cyber-E&O underwriting analyst. Produce FOUR sections:\n"
        "1) Submission Summary\n2) Business Operations (use bullets)\n"
        "3) Controls Summary\n4) Loss Summary\n≤120 words each. Bullets only."
    )
    msgs = [
        {"role":"system","content":sys},
        {"role":"user","content":f"Subject: {subject}\n\nBody:\n{body}"},
        {"role":"user","content":f"Business Ops bullets:\n{ops_bullets}"},
        {"role":"user","content":f"Application JSON:\n{json.dumps(apps_small,indent=2)}"},
        {"role":"user","content":f"Loss-run JSON:\n{json.dumps(losses_small,indent=2)}"},
    ]
    return openai_client.chat.completions.create(
        model="gpt-4o",
        messages=msgs,
        temperature=0.25,
        max_tokens=1200,
    ).choices[0].message.content.strip()

def embed(text: str):
    if not text.strip():
        return None
    return openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
        encoding_format="float",
    ).data[0].embedding

# ─── SMTP acknowledgement ──────────────────────────────────
def reply_email(to_addr, subj, summary, links):
    msg = EmailMessage()
    msg["Subject"] = f"RE: {subj} – Submission Received"
    msg["From"]    = EMAIL_ACCOUNT
    msg["To"]      = to_addr

    # plain & HTML bodies
    html_links  = "".join(f"<li>{html.escape(os.path.basename(p))}</li>" for p in links)
    plain_links = "\n".join(os.path.basename(p) for p in links) or "(no JSON)"
    msg.set_content(f"{summary}\n\nStructured JSON files:\n{plain_links}")
    msg.add_alternative(
        f"<p>{html.escape(summary).replace(chr(10),'<br>')}</p>"
        f"<p><b>Structured JSON files:</b></p><ul>{html_links}</ul>",
        subtype="html",
    )

    # attach standardized JSONs
    for p in links:
        with open(p, "rb") as f:
            msg.add_attachment(
                f.read(),
                maintype="application",
                subtype="json",
                filename=os.path.basename(p),
            )

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(EMAIL_ACCOUNT, APP_PASSWORD)
            s.send_message(msg)
    except Exception as e:
        print("SMTP send failed:", e)

# ─── DocuPipe upload → classify → standardize  ─────────────
def dp_process(fp: str) -> tuple[str | None, str | None]:
    """
    Returns (path_to_standardized_json, schema_id) or (None, None) on failure.
    """
    hdr = {
        "X-API-Key"   : DOCUPIPE_API_KEY,
        "accept"      : "application/json",
        "content-type": "application/json",
    }

    # 1) upload
    with open(fp, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    up = requests.post(
        f"{BASE_URL}/document",
        headers=hdr,
        json={"document": {"file": {"contents": b64, "filename": os.path.basename(fp)}}},
    )
    if not up.ok:
        print("DocuPipe upload failed:", up.text)
        return None, None
    doc_id = up.json()["documentId"]

    # 2) OCR poll
    for _ in range(30):
        status = requests.get(f"{BASE_URL}/document/{doc_id}", headers=hdr).json()["status"]
        if status == "completed":
            break
        time.sleep(4)

    # 3) classify
    cl = requests.post(
        f"{BASE_URL}/classify/batch",
        headers=hdr,
        json={"documentIds": [doc_id]},
    )
    if not cl.ok:
        print("DocuPipe classify failed:", cl.text)
        return None, None
    ids = cl.json().get("jobIds") or cl.json().get("classificationJobIds") or []
    if not ids:
        print("No jobIds in classify response:", cl.json())
        return None, None
    job_id = ids[0]

    for _ in range(30):
        job = requests.get(f"{BASE_URL}/job/{job_id}", headers=hdr).json()
        if job["status"] == "completed":
            break
        time.sleep(4)

    cls    = (job.get("assignedClassIds") or job.get("result", {}).get("assignedClassIds") or [None])[0]
    schema = SCHEMA_MAP.get(cls)
    print("DBG class ID →", cls, "mapped schema →", schema)

    if not schema:
        print("Unknown schema:", job)
        return None, None

    # 4) standardize
    std = requests.post(
        f"{BASE_URL}/standardize",
        headers=hdr,
        json={"documentId": doc_id, "schemaId": schema},
    )
    if not std.ok:
        print("Standardize failed:", std.text)
        return None, None

    out_path = os.path.join(RESP_DIR, os.path.basename(fp) + ".standardized.json")
    print("DBG writing std file for schema →", schema, "→", os.path.basename(out_path))
    with open(out_path, "w") as f:
        f.write(std.text)

    return out_path, schema

# ─── Postgres helpers ──────────────────────────────────────
def insert_stub(broker: str, name: str, summary: str) -> int:
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()
    cur.execute(
        """
        INSERT INTO submissions (
          broker_email, applicant_name,
          date_received, summary,
          flags, quote_ready, created_at, updated_at
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id;
        """,
        (broker, name, utc_now(), summary, json.dumps({}), False, utc_now(), utc_now()),
    )
    sid = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return sid

def insert_documents(sid: int, docs: list[dict]):
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()
    for d in docs:
        cur.execute(
            """
            INSERT INTO documents (
              submission_id, filename, document_type, page_count, is_priority,
              doc_metadata, extracted_data, created_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s);
            """,
            (
                sid,
                d["filename"],
                d["document_type"],
                d["page_count"],
                d["is_priority"],
                json.dumps(d["doc_metadata"]),
                json.dumps(d["extracted_data"]),
                utc_now(),
            ),
        )
    conn.commit()
    cur.close()
    conn.close()

# ─── E-mail handler ────────────────────────────────────────
os.makedirs(ATT_DIR, exist_ok=True)
os.makedirs(RESP_DIR, exist_ok=True)

def handle_email(msg_bytes: bytes):
    raw = email.message_from_bytes(msg_bytes)

    # headers
    subject = decode_header(raw.get("Subject"))[0][0]
    subject = subject.decode() if isinstance(subject, bytes) else subject
    body    = plain_body(raw)
    sender  = email.utils.parseaddr(raw.get("From"))[1]
    print("▶", subject, "—", sender)

    apps, losses = [], []
    docs_payload, links = [], []

    # process attachments
    for part in raw.walk():
        if part.get("Content-Disposition", "").startswith("attachment"):
            fn  = part.get_filename()
            pth = os.path.join(ATT_DIR, fn)
            open(pth, "wb").write(part.get_payload(decode=True))

            jp, schema = dp_process(pth)
            if not jp:
                continue

            links.append(jp)
            data = json.load(open(jp))

            if schema == "e794cee0":
                apps.append(data)
                dtype = "Application"
            elif schema == "34e8b170":
                losses.append(data)
                dtype = "Loss Run"
            else:
                dtype = "Other"

            docs_payload.append({
                "filename"      : fn,
                "document_type" : dtype,
                "page_count"    : data.get("pageCount"),
                "is_priority"   : True,
                "doc_metadata"  : {"source": "email"},
                "extracted_data": data,
            })

    gi        = apps[0].get("generalInformation", {}) if apps else {}
    applicant = derive_applicant_name(subject, gi)
    industry  = gi.get("primaryIndustry", "")
    website   = gi.get("primaryWebsiteAndEmailDomains", "")

    blurb       = tavily_blurb(applicant, website)
    ops_bullets = bullets_business_ops(f"{industry}\n{blurb}")
    summary     = gpt_summary(
        subject, body,
        [shrink(a) for a in apps],
        [shrink(l) for l in losses],
        ops_bullets,
    )

    controls_summary, flags = _controls_from_json(apps)
    industry_code           = classify_industry(applicant, f"{ops_bullets}\n{blurb}")

    # DB writes
    sid = insert_stub(sender, applicant, summary)
    insert_documents(sid, docs_payload)

    ops_vec  = embed(ops_bullets)
    ctrl_vec = embed(controls_summary)

    conn = psycopg2.connect(DATABASE_URL)
    register_vector(conn)
    cur  = conn.cursor()
    cur.execute(
        """
        UPDATE submissions SET
            operations_summary        = %s,
            security_controls_summary = %s,
            ops_embedding             = %s,
            controls_embedding        = %s,
            flags                     = %s,
            industry_code             = %s,
            updated_at                = %s
        WHERE id = %s;
        """,
        (
            ops_bullets,
            controls_summary,
            Vector(ops_vec)  if ops_vec  else None,
            Vector(ctrl_vec) if ctrl_vec else None,
            json.dumps(flags),
            industry_code,
            utc_now(),
            sid,
        ),
    )
    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Saved submission {sid} ({len(docs_payload)} docs + embeddings + flags)")
    reply_email(sender, subject, summary, links)

# ─── Main poll loop ────────────────────────────────────────
def main():
    try:
        m = imaplib.IMAP4_SSL(IMAP_SERVER)
        m.login(EMAIL_ACCOUNT, APP_PASSWORD)
        m.select("inbox")
        _, ids = m.search(None, "UNSEEN")
        unseen = ids[0].split()
        print(f"Checked inbox – {len(unseen)} unseen messages.")
        for num in unseen:
            _, data = m.fetch(num, "(RFC822)")
            handle_email(data[0][1])
            m.store(num, "+FLAGS", "\\Seen")
        m.logout()
    except Exception as e:
        print("ERROR:", e)

if __name__ == "__main__":
    main()
