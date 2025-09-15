#!/usr/bin/env python3
"""
Normalize Broker Structure
==========================
Creates a normalized broker structure to avoid duplicates:
- broker_companies: Parent companies (ABC Company)
- broker_locations: Multiple addresses per company (Main Office, North East Branch)
- broker_contacts: Individuals linked to companies/locations
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# Step 1: Create new normalized tables
normalized_schema = """
-- Parent company table (one record per company)
CREATE TABLE broker_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL UNIQUE,  -- "ABC Company"
    primary_website TEXT,
    primary_phone TEXT,
    company_notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Multiple locations/offices per company  
CREATE TABLE broker_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES broker_companies(id) ON DELETE CASCADE,
    location_name TEXT,  -- "Main Office", "North East Branch", "Corporate HQ"
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    phone TEXT,  -- Location-specific phone
    is_headquarters BOOLEAN DEFAULT FALSE,
    location_notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Contacts linked to companies (and optionally specific locations)
CREATE TABLE broker_contacts_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES broker_companies(id) ON DELETE CASCADE,
    location_id UUID REFERENCES broker_locations(id) ON DELETE SET NULL,  -- Optional location assignment
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    title TEXT,
    is_primary BOOLEAN DEFAULT FALSE,  -- Primary contact for the company
    is_location_primary BOOLEAN DEFAULT FALSE,  -- Primary contact for specific location
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_broker_locations_company_id ON broker_locations(company_id);
CREATE INDEX idx_broker_contacts_new_company_id ON broker_contacts_new(company_id);
CREATE INDEX idx_broker_contacts_new_location_id ON broker_contacts_new(location_id);
CREATE INDEX idx_broker_contacts_new_email ON broker_contacts_new(email);
CREATE INDEX idx_broker_companies_name ON broker_companies(company_name);

-- Ensure only one primary contact per company
CREATE UNIQUE INDEX idx_broker_contacts_new_company_primary 
ON broker_contacts_new(company_id) 
WHERE is_primary = TRUE;

-- Ensure only one primary contact per location
CREATE UNIQUE INDEX idx_broker_contacts_new_location_primary 
ON broker_contacts_new(location_id) 
WHERE is_location_primary = TRUE AND location_id IS NOT NULL;

-- Ensure only one headquarters per company
CREATE UNIQUE INDEX idx_broker_locations_headquarters 
ON broker_locations(company_id) 
WHERE is_headquarters = TRUE;
"""

# Step 2: Migration script to move existing data
migration_script = """
-- Migrate existing broker data to new structure
-- First, extract unique companies from existing brokers table
INSERT INTO broker_companies (company_name, primary_website, primary_phone, company_notes)
SELECT DISTINCT 
    REGEXP_REPLACE(company_name, ' (North East|South West|Main Office|Branch|HQ|Headquarters).*$', '', 'i') as clean_company_name,
    website,
    phone,
    'Migrated from legacy broker system'
FROM brokers
WHERE REGEXP_REPLACE(company_name, ' (North East|South West|Main Office|Branch|HQ|Headquarters).*$', '', 'i') NOT IN (
    SELECT company_name FROM broker_companies
)
ORDER BY clean_company_name;

-- Migrate broker locations
INSERT INTO broker_locations (company_id, location_name, address, city, state, zip_code, phone, is_headquarters)
SELECT 
    bc.id as company_id,
    CASE 
        WHEN b.company_name = REGEXP_REPLACE(b.company_name, ' (North East|South West|Main Office|Branch|HQ|Headquarters).*$', '', 'i') 
        THEN 'Main Office'
        ELSE REGEXP_REPLACE(b.company_name, '^.*? (North East|South West|Main Office|Branch|HQ|Headquarters)', '\\1', 'i')
    END as location_name,
    b.address,
    b.city,
    b.state,
    b.zip_code,
    b.phone,
    CASE WHEN b.company_name ILIKE '%headquarters%' OR b.company_name ILIKE '%main office%' OR b.company_name ILIKE '%hq%' 
         THEN TRUE ELSE FALSE END as is_headquarters
FROM brokers b
JOIN broker_companies bc ON bc.company_name = REGEXP_REPLACE(b.company_name, ' (North East|South West|Main Office|Branch|HQ|Headquarters).*$', '', 'i');

-- Migrate existing contacts to new structure
INSERT INTO broker_contacts_new (company_id, location_id, first_name, last_name, email, phone, title, is_primary)
SELECT 
    bc.id as company_id,
    bl.id as location_id,
    cnt.first_name,
    cnt.last_name,
    cnt.email,
    cnt.phone,
    cnt.title,
    cnt.is_primary
FROM broker_contacts cnt
JOIN brokers b ON b.id = cnt.broker_id
JOIN broker_companies bc ON bc.company_name = REGEXP_REPLACE(b.company_name, ' (North East|South West|Main Office|Branch|HQ|Headquarters).*$', '', 'i')
JOIN broker_locations bl ON bl.company_id = bc.id 
    AND bl.address = b.address 
    AND bl.city = b.city 
    AND bl.state = b.state;
"""

# Step 3: Update submissions table to reference companies instead of old brokers
update_submissions = """
-- Add new foreign key for broker companies
ALTER TABLE submissions 
ADD COLUMN broker_company_id UUID REFERENCES broker_companies(id);

-- Migrate existing broker references 
UPDATE submissions s
SET broker_company_id = bc.id
FROM brokers b
JOIN broker_companies bc ON bc.company_name = REGEXP_REPLACE(b.company_name, ' (North East|South West|Main Office|Branch|HQ|Headquarters).*$', '', 'i')
WHERE s.broker_id = b.id;

-- Create index for performance
CREATE INDEX idx_submissions_broker_company_id ON submissions(broker_company_id);
"""

def main():
    print("🔄 Normalizing broker structure...")
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        print("📋 Creating normalized broker tables...")
        cur.execute(normalized_schema)
        conn.commit()
        print("✅ New tables created successfully")
        
        print("🔄 Migrating existing broker data...")
        cur.execute(migration_script)
        conn.commit()
        print("✅ Data migration completed")
        
        print("🔗 Updating submissions references...")
        cur.execute(update_submissions)
        conn.commit()
        print("✅ Submissions table updated")
        
        # Show summary of migrated data
        print("\n📊 Migration Summary:")
        
        cur.execute("SELECT COUNT(*) FROM broker_companies")
        company_count = cur.fetchone()[0]
        print(f"   • Companies: {company_count}")
        
        cur.execute("SELECT COUNT(*) FROM broker_locations")
        location_count = cur.fetchone()[0]
        print(f"   • Locations: {location_count}")
        
        cur.execute("SELECT COUNT(*) FROM broker_contacts_new")
        contact_count = cur.fetchone()[0]
        print(f"   • Contacts: {contact_count}")
        
        cur.execute("SELECT COUNT(*) FROM submissions WHERE broker_company_id IS NOT NULL")
        updated_submissions = cur.fetchone()[0]
        print(f"   • Updated submissions: {updated_submissions}")
        
        print("\n🎯 Next steps:")
        print("   1. Test the new structure with broker_management.py")
        print("   2. Update UI to use new broker_companies/locations")
        print("   3. Once verified, drop old broker/broker_contacts tables")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error during migration: {str(e)}")
        conn.rollback()
        cur.close()
        conn.close()
        raise

if __name__ == "__main__":
    main()