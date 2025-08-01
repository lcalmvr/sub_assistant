#!/usr/bin/env python3
"""
Gmail → DocuPipe → GPT-4o underwriting summary
Business Ops generated via a dedicated “What does <company> do?” call.
"""

import imaplib, email, os, time, requests, base64, json, smtplib, html
from email.header import decode_header
from email.message import EmailMessage
from bs4 import BeautifulSoup
import openai

# ——— CONFIG ———
EMAIL_ACCOUNT    = os.environ["GMAIL_USER"]
APP_PASSWORD     = os.environ["GMAIL_APP_PASSWORD"]
IMAP_SERVER, IMAP_PORT = "imap.gmail.com", 993

DOCUPIPE_API_KEY = os.environ["DOCUPIPE_API_KEY"]
BASE_URL         = "https://app.docupipe.ai"
OPENAI_KEY       = os.environ["OPENAI_API_KEY"]

CHECK_INTERVAL   = 60
ATT_DIR, RESP_DIR = "attachments", "responses"

SCHEMA_MAP = {
    "bb981184": "e794cee0",   # Cyber Apps
    "ef9a697a": "34e8b170",   # Loss Runs
}

openai_client = openai.OpenAI(api_key=OPENAI_KEY)

# ——— util helpers ———
def plain_body(msg):
    if msg.is_multipart():
        for p in msg.walk():
            if p.get_content_type() == "text/plain":
                return p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
            if p.get_content_type() == "text/html":
                ht = p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
                return BeautifulSoup(ht, "html.parser").get_text(" ", strip=True)
    return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8")

def shrink(d):
    out={}
    for k,v in d.items():
        if isinstance(v,str) and len(v)>800: continue
        if isinstance(v,list) and len(v)>50: out[k]=f"[{len(v)} items]"
        else: out[k]=v
    return out

def ask_business_ops(name, industry, website):
    """Independent call: 'What does Smartly do?' (ChatGPT style)."""
    prompt = (
        f"What does {name} do? Respond in 4–6 crisp bullet points, "
        "covering key products/services, target customers, scale, and any well-known use cases. "
        "Use your general knowledge; if you’re unsure, infer from the industry and website.\n\n"
        f"Company info:\n• Industry: {industry}\n• Website: {website}"
    )
    resp = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role":"user","content":prompt}],
        temperature=0.5,
        max_tokens=200,
    )
    return resp.choices[0].message.content.strip()

def gpt_summary(subject, body, apps, losses):
    apps_small  = [shrink(a) for a in apps]
    losses_small= [shrink(l) for l in losses]

    gi = apps[0].get("generalInformation", {}) if apps else {}
    comp_name   = gi.get("applicantName","")
    comp_ind    = gi.get("primaryIndustry","")
    comp_site   = gi.get("primaryWebsiteAndEmailDomains","")
    business_ops = ask_business_ops(comp_name, comp_ind, comp_site)

    system_prompt = (
        "You are a cyber-E&O underwriting analyst.  Produce FOUR sections:\n"
        "1) Submission Summary – broker asks, deadlines.\n"
        "2) Business Operations – paste exactly the bullets provided below.\n"
        "3) Controls Summary – sub-lists Positive / Negative / Not Provided (see rules).\n"
        "4) Loss Summary – frequency, largest loss, root causes.\n"
        "Controls rules:\n"
        "• Positive = explicitly present; Negative = explicitly absent; "
        "Not Provided = question not asked (<field>_is_present false).\n"
        "Max 120 words/section.  Bullet points only."
    )
    messages = [
        {"role":"system","content":system_prompt},
        {"role":"user","content":f"Email subject: {subject}\n\nBody:\n{body}"},
        {"role":"user","content":f"Business Ops bullets:\n{business_ops}"},
        {"role":"user","content":f"Application JSON list:\n{json.dumps(apps_small, indent=2)}"},
        {"role":"user","content":f"Loss-run JSON list:\n{json.dumps(losses_small, indent=2)}"},
    ]
    resp = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.25,
        max_tokens=1200,
    )
    return resp.choices[0].message.content.strip()

def reply_email(to_addr, subj, summary, links):
    msg = EmailMessage()
    msg["Subject"]=f"RE: {subj} – Submission Received"
    msg["From"], msg["To"] = EMAIL_ACCOUNT, to_addr
    html_links="".join(f"<li>{html.escape(os.path.basename(p))}</li>" for p in links)
    plain_links="\n".join(os.path.basename(p) for p in links) or "(no JSON)"
    msg.set_content(f"{summary}\n\nStructured JSON files:\n{plain_links}")
    msg.add_alternative(
        f"<p>{html.escape(summary).replace(chr(10),'<br>')}</p>"
        f"<p><b>Structured JSON files:</b></p><ul>{html_links}</ul>", subtype="html")
    for p in links:
        with open(p,"rb") as f:
            msg.add_attachment(f.read(), maintype="application",
                               subtype="json", filename=os.path.basename(p))
    with smtplib.SMTP_SSL("smtp.gmail.com",465) as s:
        s.login(EMAIL_ACCOUNT,APP_PASSWORD); s.send_message(msg)

# —— DocuPipe helpers (upload→classify→standardize) ——
def dp_process(fp):
    h={"X-API-Key":DOCUPIPE_API_KEY,"accept":"application/json","content-type":"application/json"}
    with open(fp,"rb") as f: b64=base64.b64encode(f.read()).decode()
    doc_id=requests.post(f"{BASE_URL}/document",headers=h,
        json={"document":{"file":{"contents":b64,"filename":os.path.basename(fp)}}}).json()["documentId"]
    for _ in range(30):
        if requests.get(f"{BASE_URL}/document/{doc_id}",headers=h).json()["status"]=="completed":break
        time.sleep(4)
    child=requests.post(f"{BASE_URL}/classify/batch",headers=h,
        json={"documentIds":[doc_id]}).json()["classificationJobIds"][0]
    for _ in range(30):
        job=requests.get(f"{BASE_URL}/job/{child}",headers=h).json()
        if job["status"]=="completed": break
        time.sleep(4)
    cls=(job.get("assignedClassIds") or job.get("result",{}).get("assignedClassIds") or [None])[0]
    schema=SCHEMA_MAP.get(cls)
    if not schema: return None,None
    std=requests.post(f"{BASE_URL}/standardize",headers=h,
        json={"documentId":doc_id,"schemaId":schema})
    if not std.ok: return None,None
    out=os.path.join(RESP_DIR,os.path.basename(fp)+".standardized.json")
    with open(out,"w") as f: f.write(std.text)
    return out,schema

# —— e-mail handler ——
os.makedirs(ATT_DIR,exist_ok=True); os.makedirs(RESP_DIR,exist_ok=True)

def handle_email(msg_bytes):
    raw=email.message_from_bytes(msg_bytes)
    subject=decode_header(raw.get("Subject"))[0][0]
    subject=subject.decode() if isinstance(subject,bytes) else subject
    body=plain_body(raw); sender=email.utils.parseaddr(raw.get("From"))[1]
    print("▶",subject,"—",sender)

    links,apps,losses=[],[],[]
    for part in raw.walk():
        if part.get("Content-Disposition","").startswith("attachment"):
            fn=part.get_filename(); pth=os.path.join(ATT_DIR,fn)
            with open(pth,"wb") as f: f.write(part.get_payload(decode=True))
            jp,schema=dp_process(pth)
            if jp:
                links.append(jp)
                with open(jp) as jf: data=json.load(jf)
                if schema=="e794cee0": apps.append(data)
                elif schema=="34e8b170": losses.append(data)

    summary=gpt_summary(subject,body,apps,losses)
    reply_email(sender,subject,summary,links)

# —— main loop ——
def main():
    while True:
        try:
            m=imaplib.IMAP4_SSL(IMAP_SERVER); m.login(EMAIL_ACCOUNT,APP_PASSWORD); m.select("inbox")
            _,ids=m.search(None,"UNSEEN")
            for num in ids[0].split():
                _,d=m.fetch(num,"(RFC822)"); handle_email(d[0][1]); m.store(num,"+FLAGS","\\Seen")
            m.logout()
        except Exception as e:
            print("ERROR:",e)
        time.sleep(CHECK_INTERVAL)

if __name__=="__main__":
    main()

