#!/usr/bin/env python3
"""
poll_inbox.py   –   Gmail → DocuPipe → GPT-4o underwriting assistant
-------------------------------------------------------------------
Adds reliable controls bullets + flags + industry code.
"""

# ─── stdlib ──────────────────────────────────────────────────
import os, re, time, json, html, base64, imaplib, email, smtplib, textwrap
from datetime import datetime, UTC
from email.header  import decode_header
from email.message import EmailMessage
from bs4           import BeautifulSoup

# ─── 3rd-party ──────────────────────────────────────────────
import openai, tavily, psycopg2, requests
from pgvector.psycopg2 import register_vector
from pgvector          import Vector

# ─── ENV / secrets ─────────────────────────────────────────
EMAIL_ACCOUNT          = os.environ["GMAIL_USER"]
APP_PASSWORD           = os.environ["GMAIL_APP_PASSWORD"]
IMAP_SERVER, IMAP_PORT = "imap.gmail.com", 993

DOCUPIPE_API_KEY       = os.environ["DOCUPIPE_API_KEY"]
BASE_URL               = "https://app.docupipe.ai"

openai_client  = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
tavily_client  = tavily.TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

DATABASE_URL   = os.getenv("DATABASE_URL")

ATT_DIR, RESP_DIR = "attachments", "responses"

SCHEMA_MAP = {
    "bb981184": "e794cee0",   # Cyber Apps
    "ef9a697a": "34e8b170",   # Loss Runs
}

# ─── tiny helpers ───────────────────────────────────────────
def utc_now(): return datetime.now(UTC)

def plain_body(msg):
    if msg.is_multipart():
        for p in msg.walk():
            ct = p.get_content_type()
            if ct == "text/plain":
                return p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
            if ct == "text/html":
                html_txt = p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
                return BeautifulSoup(html_txt, "html.parser").get_text(" ", strip=True)
    return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8")

def shrink(d):
    out={}
    for k,v in d.items():
        if isinstance(v,str) and len(v)>800: continue
        if isinstance(v,list) and len(v)>50: out[k]=f"[{len(v)} items]"
        else: out[k]=v
    return out

# ─── controls flags from JSON or bullets ────────────────────
def normalize_bool(val):
    if val in (True,"true","present","yes"):  return "present"
    if val in (False,"false","absent","no"):  return "absent"
    return "unknown"

def flags_from_sources(apps_json, bullets_text):
    flags = {"mfa":"unknown", "backups":"unknown"}

    # 1️⃣  structured JSON (preferred)
    if apps_json:
        gi = apps_json[0].get("generalInformation",{})
        flags["mfa"]     = normalize_bool(gi.get("multiFactorAuthentication_is_present"))
        flags["backups"] = normalize_bool(gi.get("offlineBackups_is_present"))

    # 2️⃣  fallback: bullet keywords
    if flags["mfa"]=="unknown":
        txt = bullets_text.lower()
        if "no mfa" in txt or "mfa absent" in txt:
            flags["mfa"]="absent"
        elif "mfa" in txt:
            flags["mfa"]="present"

    if flags["backups"]=="unknown":
        txt = bullets_text.lower()
        if "no backup" in txt or "offline backups absent" in txt:
            flags["backups"]="absent"
        elif "backup" in txt:
            flags["backups"]="present"

    return flags

# ─── industry classifier helpers ────────────────────────────
CHOICES = {"manufacturing","msp","saas","fintech","healthcare",
           "ecommerce","logistics","retail","energy","government","other"}

def tavily_blurb(name, website):
    q = (name or website).strip()
    if not q: return ""
    res = tavily_client.search(f"{q} company overview", max_results=5)
    if res.get("results"):
        top=res["results"][0]
        return f"{top['title']}: {top.get('content','').strip()}"
    return ""

def classify_industry(name, context):
    prompt = (
        "Return ONE word from this list:\n"
        f"{', '.join(sorted(CHOICES))}\n\n"
        f"Company: {name}\nContext:\n{context}"
    )
    ans=openai_client.chat.completions.create(
        model="gpt-4o-mini", messages=[{"role":"user","content":prompt}],
        temperature=0,max_tokens=10).choices[0].message.content.strip().lower()
    return ans if ans in CHOICES else "other"

# ─── GPT ops bullets & summary ───────────────────────────────
def bullets_business_ops(context):
    prompt=("Convert the following description into 4–6 concise bullet points "
            "covering products/services, customers, scale, and use cases:\n\n"+context)
    txt=openai_client.chat.completions.create(
        model="gpt-4o",messages=[{"role":"user","content":prompt}],
        temperature=0.3,max_tokens=180).choices[0].message.content.strip()
    if txt.lower().startswith("to provide a detailed response"):
        txt="* Business operations unavailable – awaiting further info."
    return txt

def gpt_summary(subject, body, apps_small, losses_small, ops_bullets):
    sys=(
        "You are a cyber-E&O underwriting analyst. Produce FOUR sections:\n"
        "1) Submission Summary\n2) Business Operations (use bullets below)\n"
        "3) Controls Summary (Positive/Negative/Not Provided)\n4) Loss Summary\n"
        "≤120 words per section. Bullet points only.")
    msgs=[
        {"role":"system","content":sys},
        {"role":"user","content":f"Subject: {subject}\n\nBody:\n{body}"},
        {"role":"user","content":f"Business Ops bullets:\n{ops_bullets}"},
        {"role":"user","content":f"Application JSON:\n{json.dumps(apps_small,indent=2)}"},
        {"role":"user","content":f"Loss-run JSON:\n{json.dumps(losses_small,indent=2)}"},
    ]
    return openai_client.chat.completions.create(
        model="gpt-4o",messages=msgs,temperature=0.25,max_tokens=1200
    ).choices[0].message.content.strip()

def embed(text:str):
    if not text.strip(): return None
    return openai_client.embeddings.create(
        model="text-embedding-3-small",input=text,encoding_format="float"
    ).data[0].embedding

# ─── reply email ─────────────────────────────────────────────
def reply_email(to_addr, subj, summary, links):
    msg=EmailMessage()
    msg["Subject"]=f"RE: {subj} – Submission Received"
    msg["From"]=EMAIL_ACCOUNT; msg["To"]=to_addr
    html_links="".join(f"<li>{html.escape(os.path.basename(p))}</li>" for p in links)
    plain_links="\n".join(os.path.basename(p) for p in links) or "(no JSON)"
    msg.set_content(f"{summary}\n\nStructured JSON files:\n{plain_links}")
    msg.add_alternative(
        f"<p>{html.escape(summary).replace(chr(10),'<br>')}</p>"
        f"<p><b>Structured JSON files:</b></p><ul>{html_links}</ul>", subtype="html")
    for p in links:
        with open(p,"rb") as f:
            msg.add_attachment(f.read(),maintype="application",subtype="json",
                               filename=os.path.basename(p))
    with smtplib.SMTP_SSL("smtp.gmail.com",465) as s:
        s.login(EMAIL_ACCOUNT,APP_PASSWORD); s.send_message(msg)

# ─── DocuPipe fn (unchanged) ─────────────────────────────────
def dp_process(fp):
    """
    Upload → OCR → classify → standardize one document.
    Returns (json_path, schema_id)  or  (None, None) on failure.
    """
    hdr = {
        "X-API-Key": DOCUPIPE_API_KEY,
        "accept": "application/json",
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

    # 2) wait for OCR
    for _ in range(30):
        status = requests.get(f"{BASE_URL}/document/{doc_id}", headers=hdr).json()
        if status["status"] == "completed":
            break
        time.sleep(4)

    # 3) classify
    cl_resp = requests.post(
        f"{BASE_URL}/classify/batch", headers=hdr, json={"documentIds": [doc_id]}
    )
    if not cl_resp.ok:
        print("DocuPipe classify failed:", cl_resp.text)
        return None, None

    cl_json = cl_resp.json()
    # new API: {"jobIds":[...]}  old API: {"classificationJobIds":[...]}
    job_ids = (
        cl_json.get("jobIds")
        or cl_json.get("classificationJobIds")
        or []
    )
    if not job_ids:
        print("DocuPipe classify response missing jobIds:", cl_json)
        return None, None
    job_id = job_ids[0]

    # 4) poll job
    for _ in range(30):
        job = requests.get(f"{BASE_URL}/job/{job_id}", headers=hdr).json()
        if job["status"] == "completed":
            break
        time.sleep(4)

    cls = (
        job.get("assignedClassIds")
        or job.get("result", {}).get("assignedClassIds")
        or [None]
    )[0]
    schema = SCHEMA_MAP.get(cls)
    if not schema:
        print("Unknown schema class:", job)
        return None, None

    # 5) standardise
    std = requests.post(
        f"{BASE_URL}/standardize",
        headers=hdr,
        json={"documentId": doc_id, "schemaId": schema},
    )
    if not std.ok:
        print("DocuPipe standardize failed:", std.text)
        return None, None

    out_path = os.path.join(RESP_DIR, os.path.basename(fp) + ".standardized.json")
    with open(out_path, "w") as f:
        f.write(std.text)
    return out_path, schema

# ─── applicant-name helper ──────────────────────────────────
def derive_applicant_name(subject: str, gi: dict) -> str:
    """
    1️⃣  If the Cyber-App JSON has generalInformation.applicantName → use it.
    2️⃣  Otherwise take the LAST chunk of the e-mail subject after the final dash,
        stripping filler words like “Submission Cyber/Tech”.
    3️⃣  Fallback = “Unnamed Company”.
    """
    name = gi.get("applicantName")
    if name:
        return name.strip()

    # take text AFTER the last " - " or " – "
    parts = re.split(r"\s[-–]\s", subject)
    name = parts[-1].strip() if len(parts) > 1 else subject.strip()

    # strip generic words
    name = re.sub(r"(?i)(submission|cyber/tech|request)", "", name).strip()
    return name or "Unnamed Company"

# ─── DB helpers ─────────────────────────────────────────────
def insert_stub(broker,name,summary):
    conn=psycopg2.connect(DATABASE_URL); cur=conn.cursor()
    cur.execute("""
      INSERT INTO submissions (
        broker_email, applicant_name,
        date_received, summary,
        flags, quote_ready, created_at, updated_at
      ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
      RETURNING id;
    """,(broker,name,utc_now(),summary,json.dumps({}),False,utc_now(),utc_now()))
    sid=cur.fetchone()[0]; conn.commit(); cur.close(); conn.close(); return sid

def insert_documents(sid,docs):
    conn=psycopg2.connect(DATABASE_URL); cur=conn.cursor()
    for d in docs:
        cur.execute("""
          INSERT INTO documents (
            submission_id,filename,document_type,page_count,is_priority,
            doc_metadata,extracted_data,created_at
          )VALUES(%s,%s,%s,%s,%s,%s,%s,%s);
        """,(sid,d["filename"],d["document_type"],d["page_count"],d["is_priority"],
             json.dumps(d["doc_metadata"]),json.dumps(d["extracted_data"]),utc_now()))
    conn.commit(); cur.close(); conn.close()

# ─── main e-mail handler ───────────────────────────────────
os.makedirs(ATT_DIR,exist_ok=True); os.makedirs(RESP_DIR,exist_ok=True)

def handle_email(msg_bytes):
    raw=email.message_from_bytes(msg_bytes)
    subject=decode_header(raw.get("Subject"))[0][0]
    subject=subject.decode() if isinstance(subject,bytes) else subject
    body=plain_body(raw); sender=email.utils.parseaddr(raw.get("From"))[1]
    print("▶",subject,"—",sender)

    apps,losses=[],[]
    docs_payload,links=[],[]

    for part in raw.walk():
        if part.get("Content-Disposition","").startswith("attachment"):
            fn=part.get_filename()
            pth=os.path.join(ATT_DIR,fn)
            open(pth,"wb").write(part.get_payload(decode=True))
            jp,schema=dp_process(pth)
            if not jp: continue
            links.append(jp); data=json.load(open(jp))
            if schema=="e794cee0": apps.append(data); dtype="Application"
            elif schema=="34e8b170": losses.append(data); dtype="Loss Run"
            else: dtype="Other"
            docs_payload.append({"filename":fn,"document_type":dtype,
                                 "page_count":data.get("pageCount"),
                                 "is_priority":True,"doc_metadata":{"source":"email"},
                                 "extracted_data":data})

    gi=apps[0].get("generalInformation",{}) if apps else {}
    applicant=derive_applicant_name(subject,gi)
    industry=gi.get("primaryIndustry",""); website=gi.get("primaryWebsiteAndEmailDomains","")

    blurb=tavily_blurb(applicant,website)
    ops_bullets=bullets_business_ops(f"{industry}\n{blurb}")
    summary=gpt_summary(subject,body,[shrink(a) for a in apps],
                        [shrink(l) for l in losses],ops_bullets)

    # extract controls bullets from full summary
    m=re.search(r"3\)\s*Controls Summary\s*[-–]?\s*(.*?)\n\s*4", summary, re.S|re.I)
    controls_bullets=textwrap.dedent(m.group(1)).strip() if m else ""

    flags=flags_from_sources(apps, controls_bullets)
    industry_code=classify_industry(applicant, f"{ops_bullets}\n{blurb}")

    sid=insert_stub(sender,applicant,summary)
    insert_documents(sid,docs_payload)

    conn=psycopg2.connect(DATABASE_URL); register_vector(conn); cur=conn.cursor()
    cur.execute("""
      UPDATE submissions SET
        operations_summary            = %s,
        security_controls_summary     = %s,
        ops_embedding                 = %s,
        controls_embedding            = %s,
        flags                         = %s,
        industry_code                 = %s,
        updated_at                    = %s
      WHERE id=%s;
    """,(ops_bullets,controls_bullets,
         Vector(embed(ops_bullets))     if embed(ops_bullets) else None,
         Vector(embed(controls_bullets))if embed(controls_bullets) else None,
         json.dumps(flags),industry_code,utc_now(),sid))
    conn.commit(); cur.close(); conn.close()

    print(f"✅ Saved submission {sid} ({len(docs_payload)} docs + embeddings + flags)")
    reply_email(sender,subject,summary,links)

# ─── IMAP poll loop ─────────────────────────────────────────
def main():
    try:
        m=imaplib.IMAP4_SSL(IMAP_SERVER); m.login(EMAIL_ACCOUNT,APP_PASSWORD)
        m.select("inbox"); _, ids=m.search(None,"UNSEEN")
        print(f"Checked inbox – {len(ids[0].split())} unseen messages.")
        for num in ids[0].split():
            _,data=m.fetch(num,"(RFC822)"); handle_email(data[0][1])
            m.store(num,"+FLAGS","\\Seen")
        m.logout()
    except Exception as e:
        print("ERROR:",e)

if __name__=="__main__":
    main()
