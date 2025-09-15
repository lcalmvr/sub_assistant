# poll_inbox.py – inside your loop, after fetching one message `raw`
from core.pipeline import process_submission, Attachment

attachments = []
for part in raw.walk():
    if part.get("Content-Disposition","").startswith("attachment"):
        filename = part.get_filename() or "attachment.bin"
        content_bytes = part.get_payload(decode=True) or b""
        attachments.append(Attachment(filename=filename,
                                      content_bytes=content_bytes,
                                      content_type=part.get_content_type()))
sid = process_submission(subject, body, sender, attachments, use_docupipe=True)
print("Saved submission", sid)
