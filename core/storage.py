"""
Supabase Storage Integration

Handles document upload/download for the underwriting platform.
Uses S3-compatible object storage via Supabase.

Bucket structure:
  documents/
    submissions/{submission_id}/
      {timestamp}_{filename}    # Source documents (applications, loss runs, etc.)
    quotes/{quote_id}/
      {timestamp}_{filename}    # Generated quote/binder PDFs
"""

import os
import mimetypes
import time
import hashlib
from pathlib import Path
from typing import Optional

from supabase import create_client, Client

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────

_SUPA_URL = os.getenv("SUPABASE_URL")
_SUPA_KEY = os.getenv("SUPABASE_SERVICE_ROLE") or os.getenv("SUPABASE_ANON_KEY")
_BUCKET = os.getenv("STORAGE_BUCKET", "documents")  # Default bucket for documents

if not _SUPA_URL or not _SUPA_KEY:
    _SB: Optional[Client] = None
else:
    _SB = create_client(_SUPA_URL, _SUPA_KEY)


def require_sb():
    """Get Supabase client or raise if not configured."""
    if _SB is None:
        raise RuntimeError("Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE in .env")
    return _SB


def is_configured() -> bool:
    """Check if Supabase storage is configured."""
    return _SB is not None


# ─────────────────────────────────────────────────────────────
# Low-level helpers
# ─────────────────────────────────────────────────────────────

def now_key(prefix: str, filename: str) -> str:
    """Generate a timestamped storage key."""
    ts = int(time.time() * 1000)
    return f"{prefix}/{ts}-{filename}"


def put_bytes(key: str, data: bytes, content_type: str | None = None) -> str:
    """Upload bytes to storage. Returns the storage key."""
    sb = require_sb()
    ct = content_type or mimetypes.guess_type(key)[0] or "application/octet-stream"
    sb.storage.from_(_BUCKET).upload(key, data, {"content-type": ct, "upsert": "true"})
    return key


def signed_url(key: str, expires_sec: int = 3600) -> str:
    """Generate a signed URL for temporary access to a file."""
    sb = require_sb()
    result = sb.storage.from_(_BUCKET).create_signed_url(key, expires_in=expires_sec)
    return result.get("signedURL") if isinstance(result, dict) else result


def public_url(key: str) -> str:
    """Get the public URL for a file (bucket must have public access)."""
    sb = require_sb()
    return sb.storage.from_(_BUCKET).get_public_url(key)


# ─────────────────────────────────────────────────────────────
# Document-specific functions
# ─────────────────────────────────────────────────────────────

def upload_document(
    file_path: str | Path,
    submission_id: str,
    filename: str | None = None,
) -> dict:
    """
    Upload a source document (application, loss run, etc.) to storage.

    Args:
        file_path: Path to the file on disk
        submission_id: The submission this document belongs to
        filename: Optional override for the stored filename

    Returns:
        dict with 'storage_key' and 'url' (signed URL valid for 1 hour)
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    # Generate unique storage key
    fname = filename or path.name
    ts = int(time.time())
    file_hash = hashlib.md5(f"{submission_id}_{fname}_{ts}".encode()).hexdigest()[:8]
    storage_key = f"submissions/{submission_id}/{ts}_{file_hash}_{fname}"

    # Read and upload
    with open(path, "rb") as f:
        data = f.read()

    content_type = mimetypes.guess_type(fname)[0] or "application/octet-stream"
    put_bytes(storage_key, data, content_type)

    # Return key and a signed URL
    return {
        "storage_key": storage_key,
        "url": signed_url(storage_key, expires_sec=3600),
    }


def upload_document_bytes(
    data: bytes,
    submission_id: str,
    filename: str,
    content_type: str = "application/pdf",
) -> dict:
    """
    Upload document bytes directly to storage.

    Args:
        data: File content as bytes
        submission_id: The submission this document belongs to
        filename: Name for the stored file
        content_type: MIME type of the file

    Returns:
        dict with 'storage_key' and 'url'
    """
    ts = int(time.time())
    file_hash = hashlib.md5(f"{submission_id}_{filename}_{ts}".encode()).hexdigest()[:8]
    storage_key = f"submissions/{submission_id}/{ts}_{file_hash}_{filename}"

    put_bytes(storage_key, data, content_type)

    return {
        "storage_key": storage_key,
        "url": signed_url(storage_key, expires_sec=3600),
    }


def get_document_url(storage_key: str, expires_sec: int = 3600) -> str:
    """
    Get a fresh signed URL for accessing a document.

    Args:
        storage_key: The storage key returned from upload_document
        expires_sec: How long the URL should be valid (default 1 hour)

    Returns:
        Signed URL for accessing the document
    """
    return signed_url(storage_key, expires_sec=expires_sec)


def delete_document(storage_key: str) -> bool:
    """
    Delete a document from storage.

    Args:
        storage_key: The storage key to delete

    Returns:
        True if deleted successfully
    """
    try:
        sb = require_sb()
        sb.storage.from_(_BUCKET).remove([storage_key])
        return True
    except Exception as e:
        print(f"[storage] Failed to delete {storage_key}: {e}")
        return False


# ─────────────────────────────────────────────────────────────
# Bucket management (for setup)
# ─────────────────────────────────────────────────────────────

def ensure_bucket_exists(bucket_name: str = None) -> bool:
    """
    Ensure the storage bucket exists. Creates it if not.

    Args:
        bucket_name: Name of bucket (defaults to STORAGE_BUCKET env var)

    Returns:
        True if bucket exists or was created
    """
    bucket = bucket_name or _BUCKET
    try:
        sb = require_sb()
        # List buckets to check if ours exists
        buckets = sb.storage.list_buckets()
        bucket_names = [b.name for b in buckets]

        if bucket not in bucket_names:
            # Create the bucket (private by default)
            sb.storage.create_bucket(bucket, options={"public": False})
            print(f"[storage] Created bucket: {bucket}")
        return True
    except Exception as e:
        print(f"[storage] Failed to ensure bucket exists: {e}")
        return False

