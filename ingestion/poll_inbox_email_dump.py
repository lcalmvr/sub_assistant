#!/usr/bin/env python3
"""Lightweight inbox poller that snapshots email metadata for fixtures."""

import imaplib
import email
import os
import time
import json
import re
import html
from email.header import decode_header, make_header
from email.utils import getaddresses, parseaddr
from pathlib import Path
from datetime import datetime

from core.pipeline import _extract_emails_from_text

EMAIL_ACCOUNT = os.environ["GMAIL_USER"]
APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
IMAP_SERVER = os.getenv("IMAP_SERVER", "imap.gmail.com")
IMAP_PORT = int(os.getenv("IMAP_PORT", "993"))
MAILBOX_NAME = os.getenv("EMAIL_DUMP_MAILBOX", "INBOX")
CHECK_INTERVAL = int(os.getenv("EMAIL_DUMP_INTERVAL", "60"))
OUTPUT_DIR = Path(os.getenv("EMAIL_DUMP_DIR", "fixtures/email_dumps"))


def _decode_header(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(make_header(decode_header(value)))


def _flatten_addresses(field: str | None) -> list[str]:
    if not field:
        return []
    return [addr for _, addr in getaddresses([field]) if addr]


def _normalize_subject(subject: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", subject.strip().lower())
    return cleaned.strip("-") or "email"


def _strip_html(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"<\s*br\s*/?\s*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_body(msg: email.message.Message) -> str:
    parts: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = (part.get("Content-Disposition") or "").lower()
            if disp.startswith("attachment"):
                continue
            if ctype == "text/plain":
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                try:
                    parts.append(payload.decode(charset, errors="replace"))
                except LookupError:
                    parts.append(payload.decode("utf-8", errors="replace"))
            elif ctype == "text/html":
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                try:
                    html_text = payload.decode(charset, errors="replace")
                except LookupError:
                    html_text = payload.decode("utf-8", errors="replace")
                parts.append(_strip_html(html_text))
    else:
        payload = msg.get_payload(decode=True) or b""
        charset = msg.get_content_charset() or "utf-8"
        try:
            text = payload.decode(charset, errors="replace")
        except LookupError:
            text = payload.decode("utf-8", errors="replace")
        if msg.get_content_type() == "text/html":
            text = _strip_html(text)
        parts.append(text)
    combined = "\n\n".join(p.strip() for p in parts if p.strip())
    return combined.strip()


def _snapshot(msg_bytes: bytes) -> dict:
    msg = email.message_from_bytes(msg_bytes)
    subject = _decode_header(msg.get("Subject"))
    sender_name, sender_addr = parseaddr(msg.get("From"))
    snapshot = {
        "subject": subject,
        "from_name": sender_name,
        "from_email": sender_addr,
        "to": _flatten_addresses(msg.get("To")),
        "cc": _flatten_addresses(msg.get("Cc")),
        "date": msg.get("Date", ""),
        "message_id": msg.get("Message-ID", ""),
        "body_text": _extract_body(msg),
    }
    snapshot["extracted_emails"] = _extract_emails_from_text(
        "\n".join([snapshot["body_text"], snapshot["subject"], sender_addr])
    )
    snapshot["headers"] = {
        key: _decode_header(value)
        for key, value in msg.items()
        if key.lower() not in {"x-google-original-message-id"}
    }
    return snapshot


def _write_snapshot(data: dict) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    slug = _normalize_subject(data.get("subject", ""))
    path = OUTPUT_DIR / f"{timestamp}_{slug}.json"
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    return path


def poll_once() -> None:
    with imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT) as conn:
        conn.login(EMAIL_ACCOUNT, APP_PASSWORD)
        conn.select(MAILBOX_NAME)
        status, ids = conn.search(None, "UNSEEN")
        if status != "OK":
            raise RuntimeError(f"IMAP search failed: {status}")
        for num in ids[0].split():
            status, data = conn.fetch(num, "(RFC822)")
            if status != "OK" or not data:
                continue
            path = _write_snapshot(_snapshot(data[0][1]))
            print(f"Saved email snapshot -> {path}")
            conn.store(num, "+FLAGS", "\\Seen")
        conn.close()
        conn.logout()


def main() -> None:
    while True:
        try:
            poll_once()
        except Exception as exc:
            print(f"ERROR: {exc}")
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()
