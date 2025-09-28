#!/usr/bin/env python3

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS brkr_paper_companies (
    paper_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_org_id UUID NOT NULL REFERENCES brkr_organizations(org_id) ON DELETE CASCADE,
    paper_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Fast lookups by carrier
CREATE INDEX IF NOT EXISTS idx_brkr_paper_companies_carrier ON brkr_paper_companies(carrier_org_id);

-- Prevent duplicates per carrier (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_brkr_paper_companies_unique_name
  ON brkr_paper_companies(carrier_org_id, lower(paper_name));
"""


def main():
    print("Connecting to DB…")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    print("Creating brkr_paper_companies table…")
    cur.execute(SCHEMA_SQL)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ brkr_paper_companies created or already exists.")


if __name__ == "__main__":
    main()
