#!/usr/bin/env python3
"""
poll_inbox.py • Gmail → DocuPipe → GPT-4o underwriting pipeline
================================================================
Persists each submission to Postgres:
  • operations_summary                (Business-Ops bullets – unchanged)
  • security_controls_summary         (Positive / Negative / Not Provided bullets)
  • ops_embedding, controls_embedding (pgvector)
  • flags JSON                        (mfa / backups / edr / phish_training)
  • industry_code
and e-mails an acknowledgement to the broker.
"""
# ───────────────────────────── Imports & ENV ───────────────────────────
import os, re, time, json, base64, imaplib, email, smtplib, html
from datetime import datetime, UTC
from email.header  import decode_header
from email.message import EmailMessage
from bs4           import BeautifulSoup

import requests, openai, tavily, psycopg2
from pgvector.psycopg2 import register_vector
from pgvector          import Vector

EMAIL_ACCOUNT          = os.getenv("GMAIL_USER")
APP_PASSWORD           = os.getenv("GMAIL_APP_PASSWORD")
IMAP_SERVER            = "imap.gmail.com"
DOCUPIPE_API_KEY       = os.getenv("DOCUPIPE_API_KEY")
BASE_URL               = "https://app.docupipe.ai"
openai_client          = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
tavily_client          = tavily.TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
DATABASE_URL           = os.getenv("DATABASE_URL")

ATT_DIR, RESP_DIR      = "attachments", "responses"

SCHEMA_MAP = {
    "bb981184": "e794cee0",   # Cyber / Tech application
    "ef9a697a": "34e8b170",   # Loss runs
}

# ───────────── Headline control categories & helpers ───────────────────
_CONTROL_CATS = {
    "mfa"            : ["multifactor", "mfa"],
    "backups"        : ["backup", "offlinebackup", "immutablebackup"],
    "edr"            : ["edr", "endpointdetection"],
    "phish_training" : ["phishing", "securityawareness"],
}

def _bool_from_val(val):
    if val in (True, "true", "yes", "present", 1): return "present"
    if val in ("absent", "no"):                    return "absent"
    return "unknown"

def _find_flag(node, needle):
    stack=[node]
    while stack:
        cur=stack.pop()
        if isinstance(cur,dict):
            for k,v in cur.items():
                if needle in k.lower():
                    if isinstance(v,(bool,str,int)):
                        return _bool_from_val(v)
                    if isinstance(v,dict):
                        for ck,cv in v.items():
                            if "present" in ck.lower():
                                return _bool_from_val(cv)
                stack.append(v)
        elif isinstance(cur,list):
            stack.extend(cur)
    return "unknown"

def _presence_to_rating(val:str)->str:
    return "above_average" if val=="present" else ("below_average" if val=="absent" else "no_info")

def extract_control_flags(app_jsons:list[dict])->dict:
    if not app_jsons:
        return {k:"no_info"for k in _CONTROL_CATS}
    app=app_jsons[0]
    return {
        cat:_presence_to_rating(next((_find_flag(app,n) for n in needles if _find_flag(app,n)!="unknown"),"unknown"))
        for cat,needles in _CONTROL_CATS.items()
    }

# ───────────── Rich controls summary via GPT-4o ─────────────────────────
def _gpt_controls_prompt(json_snip:str, strict:bool)->list[dict]:
    system=(
        "You are a cyber-security analyst.  Produce EXACTLY three markdown "
        "headings named **Positive**, **Negative**, **Not Provided** (in that order). "
        "Under each heading, include bullet points describing controls. "
        "Focus on MFA, backups, endpoint security/EDR, SOC/MDR, patching cadence, "
        "SSO, email security, phishing-training, PAM, firewalls/IDS/IPS, and remote access."
    )
    if strict:
        system+="\nDO NOT use any other heading names."
    return [
        {"role":"system","content":system},
        {"role":"user","content":f"APPLICATION_JSON:\n{json_snip}"}
    ]

def summarize_controls_json(app_jsons:list[dict])->str:
    if not app_jsons:
        return ("**Not Provided**:\n"
                "  - No security-control information supplied.")
    raw_json=json.dumps(app_jsons[0],indent=2)[:15000]  # first 15 000 chars
    for attempt in (1,2):  # try twice (loose → strict)
        strict=(attempt==2)
        try:
            out=openai_client.chat.completions.create(
                model="gpt-4o",
                messages=_gpt_controls_prompt(raw_json,strict),
                temperature=0.2,max_tokens=500).choices[0].message.content.strip()
        except Exception as e:
            print("GPT error:",e); break
        if all(h in out for h in ("**Positive**","**Negative**","**Not Provided**")):
            return out
        print("GPT controls summary missing headings (attempt",attempt,"):",out[:200])
    # fallback
    return ("**Positive**:\n  - (none captured)\n"
            "- **Negative**:\n  - (none captured)\n"
            "- **Not Provided**:\n  - Insufficient data")

# ───────────── Misc helpers (body, applicant name, etc.) ───────────────
utc_now=lambda:datetime.now(UTC)

def plain_body(msg):
    if msg.is_multipart():
        for p in msg.walk():
            ct=p.get_content_type()
            if ct=="text/plain":
                return p.get_payload(decode=True).decode(p.get_content_charset()or"utf-8")
            if ct=="text/html":
                return BeautifulSoup(p.get_payload(decode=True).decode(p.get_content_charset()or"utf-8"),"html.parser").get_text(" ",strip=True)
    return msg.get_payload(decode=True).decode(msg.get_content_charset()or"utf-8")

def derive_applicant_name(subject:str,gi:dict)->str:
    if gi.get("applicantName"):return gi["applicantName"].strip()
    parts=re.split(r"\s[-–]\s",subject)
    name=parts[-1].strip()if len(parts)>1 else subject.strip()
    return re.sub(r"(?i)(submission|cyber/tech|request)","",name).strip() or"Unnamed Company"

def shrink(d):  # trim huge fields before GPT
    out={}
    for k,v in d.items():
        if isinstance(v,str)and len(v)>800:continue
        if isinstance(v,list)and len(v)>50:out[k]=f"[{len(v)} items]"
        else:out[k]=v
    return out

# ───────────── Business-ops & industry helpers (unchanged) ─────────────
CHOICES={"manufacturing","msp","saas","fintech","healthcare","ecommerce","logistics","retail","energy","government","other"}
def tavily_blurb(name,website):
    q=(name or website).strip()
    if not q:return""
    try:
        res=tavily_client.search(f"{q} company overview",max_results=5)
        if res.get("results"):top=res["results"][0];return f"{top['title']}: {top.get('content','').strip()}"
    except Exception as e:print("Tavily error:",e)
    return""

def classify_industry(name,ctx):
    prompt=("Return ONE word from: "+", ".join(sorted(CHOICES))+
            f"\n\nCompany: {name}\nContext:\n{ctx}")
    ans=openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0,max_tokens=10).choices[0].message.content.strip().lower()
    return ans if ans in CHOICES else"other"

def bullets_business_ops(context):
    prompt=("Convert the description below into 4-6 concise bullet points:\n\n"+context)
    txt=openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role":"user","content":prompt}],
        temperature=0.3,max_tokens=180).choices[0].message.content.strip()
    if txt.lower().startswith("to provide a detailed response"):
        txt="* Business operations unavailable – awaiting further info."
    return txt

def build_email_summary(subject,body,ops_bullets,controls_summary,apps_small,losses_small):
    sys=("You are a cyber-E&O underwriting analyst.  Produce EXACTLY:\n"
         "## Submission Summary (≤120-word bullets)\n"
         "## Business Operations (verbatim <OPS>)\n"
         "## Controls Summary (verbatim <CTRL>)\n"
         "## Loss Summary (≤120-word bullets)")
    msgs=[
        {"role":"system","content":sys},
        {"role":"user","content":f"Subject: {subject}\n\nBody:\n{body}"},
        {"role":"user","content":f"<OPS>\n{ops_bullets}\n</OPS>"},
        {"role":"user","content":f"<CTRL>\n{controls_summary}\n</CTRL>"},
        {"role":"user","content":"APP_JSON:\n"+json.dumps(apps_small,indent=2)},
        {"role":"user","content":"LOSS_JSON:\n"+json.dumps(losses_small,indent=2)},
    ]
    return openai_client.chat.completions.create(
        model="gpt-4o",
        messages=msgs,
        temperature=0.25,max_tokens=1200).choices[0].message.content.strip()

def embed(text):
    if not text.strip():return None
    return openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=text,encoding_format="float").data[0].embedding

# ───────────── SMTP acknowledgement ────────────────────────
def reply_email(to_addr,subj,summary,links):
    msg=EmailMessage();msg["Subject"]=f"RE: {subj} – Submission Received"
    msg["From"]=EMAIL_ACCOUNT;msg["To"]=to_addr
    html_links="".join(f"<li>{html.escape(os.path.basename(p))}</li>"for p in links)
    plain_links="\n".join(os.path.basename(p)for p in links)or"(no JSON)"
    msg.set_content(f"{summary}\n\nStructured JSON files:\n{plain_links}")
    msg.add_alternative(f"<p>{html.escape(summary).replace(chr(10),'<br>')}</p>"
                        f"<p><b>Structured JSON files:</b></p><ul>{html_links}</ul>",
                        subtype="html")
    for p in links:
        with open(p,"rb")as f:
            msg.add_attachment(f.read(),maintype="application",subtype="json",
                               filename=os.path.basename(p))
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com",465)as s:
            s.login(EMAIL_ACCOUNT,APP_PASSWORD);s.send_message(msg)
    except Exception as e:print("SMTP send failed:",e)

# ───────────── DocuPipe upload → classify → standardize ────
def dp_process(fp:str)->tuple[str|None,str|None]:
    hdr={"X-API-Key":DOCUPIPE_API_KEY,"accept":"application/json","content-type":"application/json"}
    with open(fp,"rb")as f:b64=base64.b64encode(f.read()).decode()
    up=requests.post(f"{BASE_URL}/document",headers=hdr,
                     json={"document":{"file":{"contents":b64,"filename":os.path.basename(fp)}}})
    if not up.ok:print("DocuPipe upload failed:",up.text);return None,None
    doc_id=up.json()["documentId"]
    for _ in range(30):
        if requests.get(f"{BASE_URL}/document/{doc_id}",headers=hdr).json()["status"]=="completed":break
        time.sleep(4)
    cl=requests.post(f"{BASE_URL}/classify/batch",headers=hdr,json={"documentIds":[doc_id]})
    if not cl.ok:print("DocuPipe classify failed:",cl.text);return None,None
    ids=cl.json().get("jobIds") or cl.json().get("classificationJobIds") or[]
    if not ids:print("No jobIds in classify response:",cl.json());return None,None
    job_id=ids[0]
    for _ in range(30):
        job=requests.get(f"{BASE_URL}/job/{job_id}",headers=hdr).json()
        if job["status"]=="completed":break
        time.sleep(4)
    cls=(job.get("assignedClassIds")or job.get("result",{}).get("assignedClassIds") or[None])[0]
    schema=SCHEMA_MAP.get(cls)
    print("DBG class ID →",cls,"mapped schema →",schema)
    if not schema:print("Unknown schema:",job);return None,None
    std=requests.post(f"{BASE_URL}/standardize",headers=hdr,
                      json={"documentId":doc_id,"schemaId":schema})
    if not std.ok:print("Standardize failed:",std.text);return None,None
    out_path=os.path.join(RESP_DIR,os.path.basename(fp)+".standardized.json")
    with open(out_path,"w")as f:f.write(std.text)
    return out_path,schema

# ───────────── Postgres helpers ────────────────────────────
def insert_stub(broker,name,summary):
    conn=psycopg2.connect(DATABASE_URL);cur=conn.cursor()
    cur.execute("""INSERT INTO submissions (
      broker_email,applicant_name,date_received,summary,
      flags,quote_ready,created_at,updated_at)
      VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id;""",
      (broker,name,utc_now(),summary,json.dumps({}),False,utc_now(),utc_now()))
    sid=cur.fetchone()[0];conn.commit();cur.close();conn.close();return sid

def insert_documents(sid,docs):
    conn=psycopg2.connect(DATABASE_URL);cur=conn.cursor()
    for d in docs:
        cur.execute("""INSERT INTO documents (
          submission_id,filename,document_type,page_count,is_priority,
          doc_metadata,extracted_data,created_at)
          VALUES(%s,%s,%s,%s,%s,%s,%s,%s);""",
          (sid,d["filename"],d["document_type"],d["page_count"],d["is_priority"],
           json.dumps(d["doc_metadata"]),json.dumps(d["extracted_data"]),utc_now()))
    conn.commit();cur.close();conn.close()

# ───────────── E-mail handler ──────────────────────────────
os.makedirs(ATT_DIR,exist_ok=True);os.makedirs(RESP_DIR,exist_ok=True)

def handle_email(msg_bytes:bytes):
    raw=email.message_from_bytes(msg_bytes)
    subject=decode_header(raw.get("Subject"))[0][0]
    subject=subject.decode() if isinstance(subject,bytes) else subject
    body=plain_body(raw)
    sender=email.utils.parseaddr(raw.get("From"))[1]
    print("▶",subject,"—",sender)

    apps,losses=[],[]
    docs_payload,links=[],[]

    for part in raw.walk():
        if part.get("Content-Disposition","").startswith("attachment"):
            fn=part.get_filename();pth=os.path.join(ATT_DIR,fn)
            open(pth,"wb").write(part.get_payload(decode=True))
            jp,schema=dp_process(pth)
            if not jp:continue
            links.append(jp);data=json.load(open(jp))
            if schema=="e794cee0":   apps.append(data);   dtype="Application"
            elif schema=="34e8b170": losses.append(data); dtype="Loss Run"
            else: dtype="Other"
            docs_payload.append({"filename":fn,"document_type":dtype,
                "page_count":data.get("pageCount"),"is_priority":True,
                "doc_metadata":{"source":"email"},"extracted_data":data})

    gi=apps[0].get("generalInformation",{}) if apps else {}
    applicant=derive_applicant_name(subject,gi)
    industry=gi.get("primaryIndustry","")
    website=gi.get("primaryWebsiteAndEmailDomains","")

    blurb       = tavily_blurb(applicant,website)
    ops_bullets = bullets_business_ops(f"{industry}\n{blurb}")

    flags            = extract_control_flags(apps)
    controls_summary = summarize_controls_json(apps)

    email_summary=build_email_summary(
        subject,body,ops_bullets,controls_summary,
        [shrink(a) for a in apps],[shrink(l) for l in losses])

    industry_code=classify_industry(applicant,f"{ops_bullets}\n{blurb}")

    sid=insert_stub(sender,applicant,email_summary)
    insert_documents(sid,docs_payload)

    ops_vec,ctrl_vec=embed(ops_bullets),embed(controls_summary)
    conn=psycopg2.connect(DATABASE_URL);register_vector(conn);cur=conn.cursor()
    cur.execute("""UPDATE submissions SET
        operations_summary=%s, security_controls_summary=%s,
        ops_embedding=%s, controls_embedding=%s,
        flags=%s, industry_code=%s, updated_at=%s WHERE id=%s;""",
        (ops_bullets,controls_summary,
         Vector(ops_vec) if ops_vec else None,
         Vector(ctrl_vec) if ctrl_vec else None,
         json.dumps(flags),industry_code,utc_now(),sid))
    conn.commit();cur.close();conn.close()

    print(f"✅ Saved submission {sid} ({len(docs_payload)} docs)")
    reply_email(sender,subject,email_summary,links)

# ───────────── Main poll loop ──────────────────────────────
def main():
    try:
        m=imaplib.IMAP4_SSL(IMAP_SERVER);m.login(EMAIL_ACCOUNT,APP_PASSWORD)
        m.select("inbox");_,ids=m.search(None,"UNSEEN")
        unseen=ids[0].split();print("Checked inbox –",len(unseen),"unseen.")
        for num in unseen:
            _,data=m.fetch(num,"(RFC822)");handle_email(data[0][1])
            m.store(num,"+FLAGS","\\Seen")
        m.logout()
    except Exception as e:print("ERROR:",e)

if __name__=="__main__":main()

