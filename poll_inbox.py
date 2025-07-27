#!/usr/bin/env python3
"""
poll_inbox.py  —  Gmail → DocuPipe → GPT-4o underwriting assistant
──────────────────────────────────────────────────────────────────
• Parses unread broker e-mails
• Uploads attachments to DocuPipe, classifies & standardises
• Builds four-section summary (Submission, Ops, Controls, Losses)
• Extracts structured flags  (MFA / Backups)  from Cyber-App JSON
• Classifies company into an industry_code using Tavily + GPT
• Stores:
      – operations_summary, security_controls_summary
      – ops_embedding, controls_embedding   (pgvector)
      – flags  (jsonb)   e.g. {"mfa":"present","backups":"absent"}
      – industry_code   e.g. "manufacturing"
• Sends acknowledgement e-mail back to broker
"""

# ───────── stdlib ────────────────────────────────────────────
import os, imaplib, email, time, json, html, base64, requests, smtplib, re, textwrap
from datetime import datetime
from email.header  import decode_header
from email.message import EmailMessage
from bs4           import BeautifulSoup

# ───────── 3rd-party libs ───────────────────────────────────
import openai, tavily
import psycopg2
from   pgvector.psycopg2 import register_vector
from   pgvector          import Vector

# ───────── secrets / config ─────────────────────────────────
EMAIL_ACCOUNT          = os.environ["GMAIL_USER"]
APP_PASSWORD           = os.environ["GMAIL_APP_PASSWORD"]
IMAP_SERVER, IMAP_PORT = "imap.gmail.com", 993

DOCUPIPE_API_KEY       = os.environ["DOCUPIPE_API_KEY"]
BASE_URL               = "https://app.docupipe.ai"

openai_client          = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
tavily_client          = tavily.TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

DATABASE_URL           = os.environ["DATABASE_URL"]

ATT_DIR, RESP_DIR      = "attachments", "responses"

SCHEMA_MAP = {
    "bb981184": "e794cee0",   # Cyber Apps
    "ef9a697a": "34e8b170",   # Loss Runs
}

# ───────── text helpers ─────────────────────────────────────
def plain_body(msg):
    if msg.is_multipart():
        for p in msg.walk():
            if p.get_content_type() == "text/plain":
                return p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
            if p.get_content_type() == "text/html":
                html_txt = p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
                return BeautifulSoup(html_txt, "html.parser").get_text(" ", strip=True)
    return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8")


def shrink(d):
    out = {}
    for k, v in d.items():
        if isinstance(v, str) and len(v) > 800: continue
        if isinstance(v, list) and len(v) > 50: out[k] = f"[{len(v)} items]"
        else: out[k] = v
    return out


def derive_applicant_name(subject: str, gi: dict) -> str:
    if gi.get("applicantName"):
        return gi["applicantName"].strip()
    parts = re.split(r"\s[-–]\s", subject)
    name  = parts[-1].strip() if len(parts) > 1 else subject.strip()
    name  = re.sub(r"(?i)submission|cyber/tech|request", "", name).strip()
    return name or "Unnamed Company"


# ───────── controls & industry normalization ────────────────
def controls_from_json(apps_json: list[dict]) -> dict:
    if not apps_json:
        return {"mfa":"unknown", "backups":"unknown"}
    gi = apps_json[0].get("generalInformation", {})
    mfa_val    = gi.get("multiFactorAuthentication_is_present")
    backup_val = gi.get("offlineBackups_is_present")

    def norm(v):
        if v in (True, "true", "present", "yes"):   return "present"
        if v in (False,"false","absent","no"):      return "absent"
        return "unknown"
    return {"mfa": norm(mfa_val), "backups": norm(backup_val)}


def fetch_ops_blurb(name: str, website: str) -> str:
    query = (name or website).strip()
    if not query: return ""
    res = tavily_client.search(f"{query} company overview", max_results=5)
    if res.get("results"):
        top = res["results"][0]
        snippet = top.get("content","").strip()
        return f"{top['title']}: {snippet}" if snippet else ""
    return ""


def classify_industry(name: str, ctx: str) -> str:
    CHOICES = {"manufacturing","msp","saas","fintech","healthcare",
               "ecommerce","logistics","retail","energy","government","other"}
    prompt = (
        "Return ONE lowercase industry keyword from this list:\n"
        "manufacturing • msp • saas • fintech • healthcare • ecommerce • "
        "logistics • retail • energy • government • other\n\n"
        f"Company: {name}\nContext:\n{ctx}"
    )
    ans = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0,
        max_tokens=10,
    ).choices[0].message.content.strip().lower()
    return ans if ans in CHOICES else "other"


# ───────── GPT summary & embedding helpers ──────────────────
def ask_business_ops(bullets_src: str) -> str:
    # bullets_src already contains Tavily blurb + industry string
    prompt = (
        "Convert the following description into 4–6 crisp bullet points "
        "covering key products/services, customers, scale, and use cases:\n\n"
        f"{bullets_src}"
    )
    resp = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role":"user","content":prompt}],
        temperature=0.3,
        max_tokens=180,
    ).choices[0].message.content.strip()
    if resp.lower().startswith("to provide a detailed response"):
        resp = "* Business operations unavailable – awaiting further info."
    return resp


def gpt_summary(subject, body, apps_small, losses_small, business_ops):
    sys_prompt = (
        "You are a cyber-E&O underwriting analyst. Produce FOUR sections:\n"
        "1) Submission Summary\n2) Business Operations (use bullets provided)\n"
        "3) Controls Summary (Positive / Negative / Not Provided)\n"
        "4) Loss Summary\nBullet points only, ≤120 words/section."
    )
    messages = [
        {"role":"system","content":sys_prompt},
        {"role":"user","content":f"Subject: {subject}\n\nBody:\n{body}"},
        {"role":"user","content":f"Business Ops bullets:\n{business_ops}"},
        {"role":"user","content":f"Application JSON:\n{json.dumps(apps_small,indent=2)}"},
        {"role":"user","content":f"Loss-run JSON:\n{json.dumps(losses_small,indent=2)}"},
    ]
    return openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.25,
        max_tokens=1200,
    ).choices[0].message.content.strip()


def embed_text(text: str):
    if not text.strip(): return None
    return openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
        encoding_format="float"
    ).data[0].embedding


# ───────── DocuPipe upload → standardize ────────────────────
def dp_process(fp):
    hdr = {"X-API-Key": DOCUPIPE_API_KEY,
           "accept": "application/json","content-type": "application/json"}
    with open(fp,"rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    doc_id = requests.post(f"{BASE_URL}/document",headers=hdr,
        json={"document":{"file":{"contents":b64,"filename":os.path.basename(fp)}}}
    ).json()["documentId"]
    for _ in range(30):
        if requests.get(f"{BASE_URL}/document/{doc_id}",headers=hdr).json()["status"]=="completed":
            break
        time.sleep(4)
    job_id = requests.post(f"{BASE_URL}/classify/batch",headers=hdr,
        json={"documentIds":[doc_id]}).json()["classificationJobIds"][0]
    for _ in range(30):
        job = requests.get(f"{BASE_URL}/job/{job_id}",headers=hdr).json()
        if job["status"]=="completed": break
        time.sleep(4)
    cls    = (job.get("assignedClassIds") or job.get("result",{}).get("assignedClassIds") or [None])[0]
    schema = SCHEMA_MAP.get(cls)
    if not schema: return None,None
    std = requests.post(f"{BASE_URL}/standardize",headers=hdr,
        json={"documentId":doc_id,"schemaId":schema})
    if not std.ok: return None,None
    out = os.path.join(RESP_DIR, os.path.basename(fp)+".standardized.json")
    open(out,"w").write(std.text)
    return out,schema


# ───────── DB helpers ───────────────────────────────────────
def insert_submission_stub(broker, applicant, summary):
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()
    cur.execute("""
      INSERT INTO submissions (
        broker_email, applicant_name,
        date_received, summary,
        flags, quote_ready, created_at, updated_at
      ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
      RETURNING id;
    """, (
        broker, applicant,
        datetime.utcnow(), summary,
        json.dumps({}), False,
        datetime.utcnow(), datetime.utcnow()
    ))
    sid = cur.fetchone()[0]
    conn.commit(); cur.close(); conn.close()
    return sid


def insert_documents(sid, docs):
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()
    for d in docs:
        cur.execute("""
          INSERT INTO documents (
            submission_id, filename, document_type,
            page_count, is_priority,
            doc_metadata, extracted_data, created_at
          ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s);
        """, (
            sid,
            d["filename"], d["document_type"],
            d["page_count"], d["is_priority"],
            json.dumps(d["doc_metadata"]),
            json.dumps(d["extracted_data"]),
            datetime.utcnow()
        ))
    conn.commit(); cur.close(); conn.close()


# ───────── handle one e-mail ────────────────────────────────
os.makedirs(ATT_DIR, exist_ok=True)
os.makedirs(RESP_DIR, exist_ok=True)

def handle_email(msg_bytes):
    raw     = email.message_from_bytes(msg_bytes)
    subject = decode_header(raw.get("Subject"))[0][0]
    subject = subject.decode() if isinstance(subject,bytes) else subject
    body    = plain_body(raw)
    sender  = email.utils.parseaddr(raw.get("From"))[1]
    print("▶", subject, "—", sender)

    apps, losses = [], []
    docs_payload, links = [], []

    for part in raw.walk():
        if part.get("Content-Disposition","").startswith("attachment"):
            fname = part.get_filename()
            pth   = os.path.join(ATT_DIR, fname)
            open(pth,"wb").write(part.get_payload(decode=True))

            jp, schema = dp_process(pth)
            if not jp: continue
            links.append(jp)
            data = json.load(open(jp))

            if schema=="e794cee0":   apps.append(data);   dtype="Application"
            elif schema=="34e8b170": losses.append(data); dtype="Loss Run"
            else: dtype="Other"

            docs_payload.append({
                "filename":fname,"document_type":dtype,
                "page_count":data.get("pageCount"),
                "is_priority":True,
                "doc_metadata":{"source":"email"},
                "extracted_data":data
            })

    gi = apps[0].get("generalInformation", {}) if apps else {}
    applicant = derive_applicant_name(subject, gi)
    industry  = gi.get("primaryIndustry","")
    website   = gi.get("primaryWebsiteAndEmailDomains","")

    blurb         = fetch_ops_blurb(applicant, website)
    business_ops  = ask_business_ops(f"{industry}\n{blurb}")
    controls_bullets_match = re.search(
        r"3\)\s*Controls Summary\s*[-–]?\s*(.*?)\n\s*4", business_ops, re.S | re.I)
    controls_bullets = controls_bullets_match.group(1).strip() if controls_bullets_match else ""

    industry_code = classify_industry(applicant, f"{business_ops}\n{blurb}")
    flags         = controls_from_json(apps)

    summary = gpt_summary(
        subject, body,
        [shrink(a) for a in apps],
        [shrink(l) for l in losses],
        business_ops
    )

    sid = insert_submission_stub(sender, applicant, summary)
    insert_documents(sid, docs_payload)

    conn = psycopg2.connect(DATABASE_URL); register_vector(conn)
    cur  = conn.cursor()
    cur.execute("""
      UPDATE submissions SET
        operations_summary            = %s,
        security_controls_summary     = %s,
        ops_embedding                 = %s,
        controls_embedding            = %s,
        flags                         = %s,
        industry_code                 = %s,
        updated_at                    = %s
      WHERE id = %s;
    """, (
        business_ops,
        controls_bullets,
        Vector(embed_text(business_ops)),
        Vector(embed_text(controls_bullets)),
        json.dumps(flags),
        industry_code,
        datetime.utcnow(),
        sid
    ))
    conn.commit(); cur.close(); conn.close()

    print(f"✅ Saved submission {sid} ({len(docs_payload)} docs + embeddings + flags)")
    reply_email(sender, subject, summary, links)


# ───────── poll loop ────────────────────────────────────────
def main():
    try:
        m = imaplib.IMAP4_SSL(IMAP_SERVER)
        m.login(EMAIL_ACCOUNT, APP_PASSWORD)
        m.select("inbox")
        _, ids = m.search(None, "UNSEEN")
        print(f"Checked inbox – {len(ids[0].split())} unseen messages.")
        for num in ids[0].split():
            _, data = m.fetch(num, "(RFC822)")
            handle_email(data[0][1])
            m.store(num, "+FLAGS", "\\Seen")
        m.logout()
    except Exception as e:
        print("ERROR:", e)

if __name__ == "__main__":
    main()
