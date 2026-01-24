# Supabase Storage Setup

This guide covers setting up Supabase Storage for document management in the underwriting platform.

## Overview

Documents (applications, loss runs, quotes, etc.) are stored in Supabase Storage, which is S3-compatible object storage. This provides:

- **Signed URLs**: Time-limited access to documents (default 1 hour)
- **Organized structure**: Files stored by submission ID
- **Scalability**: Same pattern used by enterprise document systems
- **Easy migration**: Can move to raw S3/GCS later if needed

## Architecture

```
Supabase Storage
└── documents/                    # Bucket (private)
    └── submissions/
        └── {submission_id}/
            └── {timestamp}_{hash}_{filename}
```

## Setup Steps

### 1. Create Storage Bucket in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Settings:
   - **Name**: `documents`
   - **Public bucket**: OFF (keep private for signed URLs)
   - **File size limit**: 50MB (adjust as needed)
   - **Allowed MIME types**: Leave empty to allow all, or restrict to:
     - `application/pdf`
     - `image/*`
     - `application/json`

### 2. Configure Environment Variables

Add these to your `.env` file:

```bash
# Required - already set if using Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE=your-service-role-key  # NOT the anon key

# Optional - defaults to "documents"
STORAGE_BUCKET=documents
```

**Important**: Use the **Service Role** key (not anon key) for server-side uploads. Find it in:
- Supabase Dashboard > Settings > API > Service Role Key

### 3. Set Up RLS Policies (Optional)

If you want row-level security on storage:

```sql
-- Allow authenticated users to read documents
CREATE POLICY "Allow authenticated read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Allow service role to upload
CREATE POLICY "Allow service uploads"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'documents');
```

### 4. Verify Setup

Run this to test the storage connection:

```bash
./venv/bin/python3 -c "
from core.storage import is_configured, ensure_bucket_exists
print(f'Storage configured: {is_configured()}')
if is_configured():
    print(f'Bucket exists: {ensure_bucket_exists()}')
"
```

## How It Works

### During Document Ingestion

When the pipeline processes a submission with PDFs:

1. Documents are classified (application, loss run, etc.)
2. Each PDF is uploaded to Supabase Storage
3. The `storage_key` is saved in `documents.doc_metadata`
4. Extraction data is saved to `extraction_provenance`

### When Viewing Documents

1. Frontend requests `/api/submissions/{id}/documents`
2. API checks each document for `storage_key` in metadata
3. If found, generates a signed URL (valid 1 hour)
4. Frontend renders PDF in iframe using signed URL

### Code Flow

```
Pipeline (core/pipeline.py)
    └── _save_document_records()
        └── upload_document() from core/storage.py
            └── Supabase Storage API

API (api/main.py)
    └── get_submission_documents()
        └── get_document_url() from core/storage.py
            └── Signed URL generation

Frontend (ReviewPage.jsx)
    └── iframe src={document.url}
```

## Storage Module API

### `core/storage.py`

```python
from core.storage import (
    upload_document,      # Upload file from disk
    upload_document_bytes, # Upload raw bytes
    get_document_url,     # Get signed URL for viewing
    delete_document,      # Remove from storage
    is_configured,        # Check if storage is set up
    ensure_bucket_exists, # Create bucket if missing
)

# Upload a document
result = upload_document(
    file_path="/path/to/document.pdf",
    submission_id="abc-123",
    filename="Application.pdf"  # Optional override
)
# Returns: {"storage_key": "submissions/abc-123/...", "url": "https://..."}

# Get a fresh signed URL
url = get_document_url(result["storage_key"], expires_sec=3600)
```

## Troubleshooting

### "Supabase not configured" error
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` in `.env`
- Ensure you're using the Service Role key, not anon key

### Documents not uploading
- Check bucket exists in Supabase dashboard
- Verify file exists at the path
- Check for upload errors in pipeline logs

### Signed URLs not working
- URLs expire after 1 hour by default
- Ensure bucket is private (public buckets don't use signed URLs)
- Check RLS policies aren't blocking access

### PDF not rendering in viewer
- Browser must support PDF viewing (most do)
- Check for CORS issues in browser console
- Try "Open in new tab" to test URL directly

## Migration Notes

If you later need to migrate to raw S3:

1. The `storage_key` format is S3-compatible
2. Update `core/storage.py` to use boto3 instead of supabase
3. Signed URL pattern is identical
4. No database changes needed

## Security Considerations

- **Service Role key**: Keep secret, never expose to frontend
- **Signed URLs**: Time-limited, include in server responses only
- **Bucket privacy**: Keep private, use signed URLs for access
- **File validation**: Consider adding virus scanning for uploads
