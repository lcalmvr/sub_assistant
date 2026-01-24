# Supabase Documentation

This document provides Claude Code context for using Supabase in this project.

## Project Usage

Supabase provides the database (PostgreSQL) and file storage:

| Component | Usage | Files |
|-----------|-------|-------|
| Database | PostgreSQL with SQLAlchemy | `core/db.py` |
| Storage | S3-compatible file storage | `core/storage.py` |
| pgvector | Vector embeddings for RAG | `ai/guideline_rag.py` |
| RPC | Custom functions | `ai/guideline_rag.py` |

## Environment Variables

```
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIs...  # anon key
SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI1NiIs...  # service role key
STORAGE_BUCKET=documents
```

## Client Initialization

```python
from supabase import create_client, Client

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")  # or SUPABASE_SERVICE_ROLE for admin access
)
```

## Database Operations

### Select Data

```python
# Basic select
data = supabase.table("submissions").select("*").execute()

# With filters
data = supabase.table("submissions").select("*").eq("id", submission_id).execute()

# Select specific columns
data = supabase.table("submissions").select(
    "applicant_name,naics_primary_title,business_summary"
).eq("id", submission_id).execute()

# Access results
if data.data:
    row = data.data[0]
    name = row.get('applicant_name')
```

### Insert Data

```python
data = supabase.table("documents").insert({
    "submission_id": submission_id,
    "filename": filename,
    "document_type": doc_type,
}).execute()

# Get inserted ID
new_id = data.data[0]["id"]
```

### Update Data

```python
data = supabase.table("submissions").update({
    "status": "approved",
    "updated_at": datetime.now(timezone.utc).isoformat()
}).eq("id", submission_id).execute()
```

### Upsert Data

```python
data = supabase.table("settings").upsert({
    "key": "theme",
    "value": "dark"
}).execute()
```

### Delete Data

```python
data = supabase.table("documents").delete().eq("id", doc_id).execute()
```

## RPC (Remote Procedure Calls)

Used for custom PostgreSQL functions like vector similarity search:

```python
# Call stored procedure without parameters
response = supabase.rpc("get_all_users").execute()

# Call with parameters
response = supabase.rpc(
    "match_guidelines",
    {
        "query_embedding": embedding_vector,
        "match_count": 15,
    }
).execute()

# Access results
for row in response.data or []:
    content = row.get("content", "")
    similarity = row.get("similarity", 0)
```

### Example: Vector Search Function (PostgreSQL)

```sql
CREATE OR REPLACE FUNCTION match_guidelines(
    query_embedding vector(1536),
    match_count int
)
RETURNS TABLE (
    content text,
    section text,
    page text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.content,
        g.section,
        g.page,
        1 - (g.embedding <=> query_embedding) as similarity
    FROM guidelines g
    ORDER BY g.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

## Storage Operations

### Upload Files

```python
bucket_name = "documents"

# Upload from bytes
supabase.storage.from_(bucket_name).upload(
    path="submissions/123/document.pdf",
    file=file_bytes,
    file_options={"content-type": "application/pdf", "upsert": "true"}
)

# Upload from file
with open(file_path, "rb") as f:
    supabase.storage.from_(bucket_name).upload(path, f.read())
```

### Download Files

```python
# Download file bytes
data = supabase.storage.from_(bucket_name).download("photo.png")

# Save to local file
with open("downloaded.png", "wb") as file:
    file.write(data)
```

### Get URLs

```python
# Get public URL (bucket must be public)
url = supabase.storage.from_(bucket_name).get_public_url("photo.png")

# Get signed URL (temporary access)
result = supabase.storage.from_(bucket_name).create_signed_url(
    "private/doc.pdf",
    expires_in=3600  # 1 hour
)
signed_url = result.get("signedURL")
```

### List and Delete Files

```python
# List files in bucket
files = supabase.storage.from_(bucket_name).list()

# List files in folder
files = supabase.storage.from_(bucket_name).list("submissions/123/")

# Delete files
supabase.storage.from_(bucket_name).remove(["old_file.pdf", "temp.png"])

# Move/rename files
supabase.storage.from_(bucket_name).move(
    "temp/file.pdf",
    "permanent/file.pdf"
)
```

### Bucket Management

```python
# List buckets
buckets = supabase.storage.list_buckets()

# Create bucket
supabase.storage.create_bucket("new-bucket", options={"public": False})
```

## SQLAlchemy Integration

The project also uses SQLAlchemy for database access (`core/db.py`):

```python
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    pool_recycle=1800,
)

@contextmanager
def get_conn():
    with engine.begin() as conn:
        yield conn

# Usage
with get_conn() as conn:
    result = conn.execute(text("SELECT * FROM submissions WHERE id = :id"), {"id": sub_id})
    row = result.fetchone()
```

## Best Practices

1. **Use Service Role Key** for server-side operations that bypass RLS
2. **Use Anon Key** for client-side with Row Level Security (RLS)
3. **RPC for Complex Queries** - Use stored procedures for vector search and complex operations
4. **Connection Pooling** - SQLAlchemy handles pooling; configure appropriately for load
5. **Storage Keys** - Use timestamped, unique keys to avoid collisions

## References

- [Supabase Python Client](https://github.com/supabase/supabase-py)
- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [pgvector Extension](https://github.com/pgvector/pgvector)
