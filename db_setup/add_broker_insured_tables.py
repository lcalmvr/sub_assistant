#!/usr/bin/env python3

import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

schema_additions = """
-- Brokers table: company + multiple contacts
CREATE TABLE brokers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    phone TEXT,
    website TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Broker contacts: multiple people per broker
CREATE TABLE broker_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broker_id UUID REFERENCES brokers(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    title TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Insured entities: typically company info
CREATE TABLE insured_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    industry TEXT,
    naics_code TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    phone TEXT,
    website TEXT,
    employee_count INTEGER,
    annual_revenue BIGINT,
    primary_contact_name TEXT,
    primary_contact_email TEXT,
    primary_contact_phone TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Update submissions table to reference these entities
ALTER TABLE submissions 
ADD COLUMN broker_id UUID REFERENCES brokers(id),
ADD COLUMN insured_id UUID REFERENCES insured_entities(id);

-- Create indexes for performance
CREATE INDEX idx_broker_contacts_broker_id ON broker_contacts(broker_id);
CREATE INDEX idx_broker_contacts_email ON broker_contacts(email);
CREATE INDEX idx_insured_entities_company_name ON insured_entities(company_name);
CREATE INDEX idx_submissions_broker_id ON submissions(broker_id);
CREATE INDEX idx_submissions_insured_id ON submissions(insured_id);

-- Add unique constraint for primary contacts
CREATE UNIQUE INDEX idx_broker_contacts_primary_unique 
ON broker_contacts(broker_id) 
WHERE is_primary = TRUE;
"""

def main():
    print("Connecting to DB...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print("Adding broker and insured tables...")
    cur.execute(schema_additions)
    conn.commit()
    
    cur.close()
    conn.close()
    print("✅ Broker and insured tables created successfully.")

if __name__ == "__main__":
    main()