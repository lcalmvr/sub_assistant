#!/usr/bin/env python3
"""
poll_inbox.py  ·  Gmail → DocuPipe → GPT-4o underwriting pipeline
===============================================================
Writes for each submission:
  • operations_summary
  • security_controls_summary
  • ops_embedding, controls_embedding   (pgvector)
  • flags   {"mfa":"present|absent|unknown", "backups": ...}
  • industry_code  (manufacturing, msp, saas, …)
and sends an acknowledgement e-mail back to the broker.
"""

# ─── stdlib ────────────────────────────────────────────────
import os, re, time, json, base64, imaplib, email, smtplib, textwrap, html
from datetime import datetime, UTC
from email.header  import decode_header
from email.message import EmailMessage
from bs4           import BeautifulSoup

# ─── 3rd-party ─────────────────────────────────────────────
import openai, tavily, psycopg2, requests
from pgvector.psycopg2 import register_vector
from pgvector          import Vector

# ─── ENV / secrets ─────────────────────────────────────────
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
    "bb981184": "e794cee0",   # Cyber Apps
    "ef9a697a": "34e8b170",   # Loss Runs
}

# ═══════════════════════════════════════════════════════════
def utc_now() -> datetime: return datetime.now(UTC)

# ─── e-mail body helper ────────────────────────────────────
def plain_body(msg):
    if msg.is_multipart():
        for p in msg.walk():
            ct=p.get_content_type()
            if ct=="text/plain":
                return p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
            if ct=="text/html":
                html_txt=p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
                return BeautifulSoup(html_txt,"html.parser").get_text(" ",strip=True)
    return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8")

# ─── applicant-name helper ─────────────────────────────────
def derive_applicant_name(subject: str, gi: dict) -> str:
    name = gi.get("applicantName")
    if name: return name.strip()
    parts = re.split(r"\s[-–]\s", subject)
    name  = parts[-1].strip() if len(parts)>1 else subject.strip()
    name  = re.sub(r"(?i)(submission|cyber/tech|request)", "", name).strip()
    return name or "Unnamed Company"

# ─── shrink JSON for GPT prompt ────────────────────────────
def shrink(d):
    out={}
    for k,v in d.items():
        if isinstance(v,str) and len(v)>800: continue
        if isinstance(v,list) and len(v)>50: out[k]=f"[{len(v)} items]"
        else: out[k]=v
    return out

# ─── controls bullets extractor (robust) ───────────────────
def extract_controls_bullets(summary: str) -> str:
    m = re.search(
        r"Controls Summary\s*[-–:\n]+\s*(.*?)\n\s*(?:\d\)|Loss|Losses|$)",
        summary, re.S|re.I
    )
    return textwrap.dedent(m.group(1)).strip() if m else ""

# ─── recursive JSON flag search ────────────────────────────
def find_boolean_flag(data, keys: tuple[str,...]):
    stack=[data]
    while stack:
        cur=stack.pop()
        if isinstance(cur,dict):
            for k,v in cur.items():
                if any(key in k.lower() for key in keys):
                    return v
                stack.append(v)
        elif isinstance(cur,list):
            stack.extend(cur)
    return None

def normalize_bool(val) -> str:
    if val in (True,"true","present","yes"):   return "present"
    if val in (False,"false","absent","no"):   return "absent"
    return "unknown"

def flags_from_sources(apps_json, bullets):
    flags={"mfa":"unknown","backups":"unknown"}
    if apps_json:
        flags["mfa"]     = normalize_bool(find_boolean_flag(apps_json, ("mfa","multifactor")))
        flags["backups"] = normalize_bool(find_boolean_flag(apps_json, ("backup","offlinebackup")))
    txt=bullets.lower()
    if flags["mfa"]=="unknown":
        flags["mfa"]="absent" if "no mfa" in txt else ("present" if "mfa" in txt else "unknown")
    if flags["backups"]=="unknown":
        flags["backups"]="absent" if "no backup" in txt else ("present" if "backup" in txt else "unknown")
    return flags

# ─── industry helpers ──────────────────────────────────────
CHOICES={"manufacturing","msp","saas","fintech","healthcare",
         "ecommerce","logistics","retail","energy","government","other"}

def tavily_blurb(name, website):
    q=(name or website).strip()
    if not q: return ""
    try:
        res=tavily_client.search(f"{q} company overview",max_results=5)
        if res.get("results"):
            top=res["results"][0]
            return f"{top['title']}: {top.get('content','').strip()}"
    except Exception as e:
        print("Tavily error:",e)
    return ""

def classify_industry(name, ctx):
    prompt=("Return ONE word from: "+", ".join(sorted(CHOICES))+
            f"\n\nCompany: {name}\nContext:\n{ctx}")
    ans=openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0,max_tokens=10
    ).choices[0].message.content.strip().lower()
    return ans if ans in CHOICES else "other"

# ─── GPT bullets & summary ─────────────────────────────────
def bullets_business_ops(context):
    prompt=("Convert the following description into 4–6 concise bullet points "
            "about products/services, customers, scale, use cases:\n\n"+context)
    txt=openai_client.chat.completions.create(
        model="gpt-4o",messages=[{"role":"user","content":prompt}],
        temperature=0.3,max_tokens=180
    ).choices[0].message.content.strip()
    if txt.lower().startswith("to provide a detailed response"):
        txt="* Business operations unavailable – awaiting further info."
    return txt

def gpt_summary(subject, body, apps_small, losses_small, ops_bullets):
    sys=("You are a cyber-E&O underwriting analyst. Produce FOUR sections:\n"
         "1) Submission Summary\n2) Business Operations (use bullets)\n"
         "3) Controls Summary (Positive/Negative/Not Provided)\n4) Loss Summary\n"
         "≤120 words each. Bullet points only.")
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

def embed(text):
    if not text.strip(): return None
    return openai_client.embeddings.create(
        model="text-embedding-3-small",input=text,encoding_format="float"
    ).data[0].embedding

# ─── reply email helper ────────────────────────────────────
def reply_email(to_addr, subj, summary, links):
    msg=EmailMessage()
    msg["Subject"]=f"RE: {subj} – Submission Received"
    msg["From"]=EMAIL_ACCOUNT; msg["To"]=to_addr
    html_links="".join(f"<li>{html.escape(os.path.basename(p))}</li>" for p in links)
    plain_links="\n".join(os.path.basename(p) for p in links) or "(no JSON)"
    msg.set_content(f"{summary}\n\nStructured JSON files:\n{plain_links}")
    msg.add_alternative(
        f"<p>{html.escape(summary).replace(chr(10),'<br>')}</p>"
        f"<p><b>Structured JSON files:</b></p><ul>{html_links}</ul>",
        subtype="html")
    for p in links:
        with open(p,"rb") as f:
            msg.add_attachment(f.read(),maintype="application",subtype="json",
                               filename=os.path.basename(p))
    with smtplib.SMTP_SSL("smtp.gmail.com",465) as s:
        s.login(EMAIL_ACCOUNT,APP_PASSWORD); s.send_message(msg)

# ─── robust DocuPipe process ───────────────────────────────
def dp_process(fp):
    hdr={"X-API-Key":DOCUPIPE_API_KEY,"accept":"application/json","content-type":"application/json"}
    # upload
    with open(fp,"rb") as f:b64=base64.b64encode(f.read()).decode()
    up=requests.post(f"{BASE_URL}/document",headers=hdr,
        json={"document":{"file":{"contents":b64,"filename":os.path.basename(fp)}}})
    if not up.ok:
        print("DocuPipe upload failed:",up.text); return None,None
    doc_id=up.json()["documentId"]
    # OCR poll
    for _ in range(30):
        if requests.get(f"{BASE_URL}/document/{doc_id}",headers=hdr).json()["status"]=="completed":
            break; time.sleep(4)
    # classify
    cl=requests.post(f"{BASE_URL}/classify/batch",headers=hdr,json={"documentIds":[doc_id]})
    if not cl.ok:
        print("DocuPipe classify failed:",cl.text); return None,None
    ids=cl.json().get("jobIds") or cl.json().get("classificationJobIds") or []
    if not ids:
        print("Classify response missing jobIds:",cl.json()); return None,None
    job_id=ids[0]
    for _ in range(30):
        job=requests.get(f"{BASE_URL}/job/{job_id}",headers=hdr).json()
        if job["status"]=="completed": break; time.sleep(4)
    cls=(job.get("assignedClassIds") or job.get("result",{}).get("assignedClassIds") or [None])[0]
    schema=SCHEMA_MAP.get(cls);  # None if unknown
    if not schema:
        print("Unknown schema class:",job); return None,None
    std=requests.post(f"{BASE_URL}/standardize",headers=hdr,
        json={"documentId":doc_id,"schemaId":schema})
    if not std.ok:
        print("DocuPipe standardize failed:",std.text); return None,None
    out=os.path.join(RESP_DIR,os.path.basename(fp)+".standardized.json")
    open(out,"w").write(std.text); return out,schema

# ─── DB helpers ────────────────────────────────────────────
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
          ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s);
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
            fn=part.get_filename(); pth=os.path.join(ATT_DIR,fn)
            open(pth,"wb").write(part.get_payload(decode=True))
            jp,schema=dp_process(pth)
            if not jp: continue
            links.append(jp); data=json.load(open(jp))
            if schema=="e794cee0":   apps.append(data);   dtype="Application"
            elif schema=="34e8b170": losses.append(data); dtype="Loss Run"
            else: dtype="Other"
            docs_payload.append({"filename":fn,"document_type":dtype,
                                 "page_count":data.get("pageCount"),
                                 "is_priority":True,
                                 "doc_metadata":{"source":"email"},
                                 "extracted_data":data})

    gi=apps[0].get("generalInformation",{}) if apps else {}
    applicant=derive_applicant_name(subject,gi)
    industry = gi.get("primaryIndustry","")
    website  = gi.get("primaryWebsiteAndEmailDomains","")

    blurb       = tavily_blurb(applicant,website)
    ops_bullets = bullets_business_ops(f"{industry}\n{blurb}")
    summary     = gpt_summary(
        subject, body,
        [shrink(a) for a in apps],
        [shrink(l) for l in losses],
        ops_bullets
    )

    controls_bullets = extract_controls_bullets(summary)
    flags            = flags_from_sources(apps, controls_bullets)
    industry_code    = classify_industry(applicant, f"{ops_bullets}\n{blurb}")

    sid=insert_stub(sender,applicant,summary)
    insert_documents(sid,docs_payload)

    ops_vec  = embed(ops_bullets)
    ctrl_vec = embed(controls_bullets)

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
      WHERE id = %s;
    """,(ops_bullets,
         controls_bullets,
         Vector(ops_vec)  if ops_vec  else None,
         Vector(ctrl_vec) if ctrl_vec else None,
         json.dumps(flags),
         industry_code,
         utc_now(),
         sid))
    conn.commit(); cur.close(); conn.close()

    print(f"✅ Saved submission {sid} ({len(docs_payload)} docs + embeddings + flags)")
    reply_email(sender,subject,summary,links)

# ─── IMAP poll loop ─────────────────────────────────────────
def main():
    try:
        m=imaplib.IMAP4_SSL(IMAP_SERVER)
        m.login(EMAIL_ACCOUNT,APP_PASSWORD)
        m.select("inbox")
        _, ids=m.search(None,"UNSEEN")
        print(f"Checked inbox – {len(ids[0].split())} unseen messages.")
        for num in ids[0].split():
            _, data=m.fetch(num,"(RFC822)")
            handle_email(data[0][1])
            m.store(num,"+FLAGS","\\Seen")
        m.logout()
    except Exception as e:
        print("ERROR:",e)

if __name__=="__main__":
    main()
