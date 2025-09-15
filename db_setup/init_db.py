import psycopg2

DATABASE_URL = "postgresql://postgres:JXnDIbktoamRBBZIZuSSHruOTcBYeHtn@nozomi.proxy.rlwy.net:47254/railway"

schema = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broker_email TEXT NOT NULL,
    date_received TIMESTAMP NOT NULL,
    summary TEXT,
    flags JSONB,
    quote_ready BOOLEAN DEFAULT FALSE,
    revenue BIGINT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    document_type TEXT,
    page_count INT,
    is_priority BOOLEAN DEFAULT FALSE,
    doc_metadata JSONB,
    extracted_data JSONB,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_documents_submission_id ON documents(submission_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_priority ON documents(is_priority);
CREATE INDEX idx_submissions_revenue ON submissions(revenue);
"""

def main():
    print("Connecting to DB...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute(schema)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ Tables created successfully.")

if __name__ == "__main__":
    main()

