import os, mimetypes, time
from typing import Optional

from supabase import create_client, Client

_SUPA_URL = os.getenv("SUPABASE_URL")
_SUPA_KEY = os.getenv("SUPABASE_SERVICE_ROLE") or os.getenv("SUPABASE_ANON_KEY")
_BUCKET  = os.getenv("STORAGE_BUCKET", "attachments")

if not _SUPA_URL or not _SUPA_KEY:
    _SB: Optional[Client] = None
else:
    _SB = create_client(_SUPA_URL, _SUPA_KEY)

def require_sb():
    if _SB is None:
        raise RuntimeError("Supabase not configured. Set SUPABASE_URL and a key in .env")
    return _SB

def now_key(prefix: str, filename: str) -> str:
    ts = int(time.time() * 1000)
    return f"{prefix}/{ts}-{filename}"

def put_bytes(key: str, data: bytes, content_type: str | None = None) -> str:
    sb = require_sb()
    ct = content_type or mimetypes.guess_type(key)[0] or "application/octet-stream"
    # upsert in case you retry
    sb.storage.from_(_BUCKET).upload(key, data, {"contentType": ct, "upsert": True})
    return key

def signed_url(key: str, expires_sec: int = 3600) -> str:
    sb = require_sb()
    return sb.storage.from_(_BUCKET).create_signed_url(key, expires_in=expires_sec)

