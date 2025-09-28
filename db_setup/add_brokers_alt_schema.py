#!/usr/bin/env python3

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

SCHEMA_SQL = """
-- Core entities with brkr_ prefix
CREATE TABLE IF NOT EXISTS brkr_organizations (
    org_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    org_type TEXT NOT NULL DEFAULT 'brokerage', -- brokerage|carrier|vendor|competitor|other
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brkr_offices (
    office_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES brkr_organizations(org_id) ON DELETE CASCADE,
    office_name TEXT NOT NULL,
    default_address_id UUID,
    status TEXT NOT NULL DEFAULT 'active', -- active|inactive
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brkr_people (
    person_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brkr_employments (
    employment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES brkr_people(person_id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES brkr_organizations(org_id) ON DELETE CASCADE,
    office_id UUID REFERENCES brkr_offices(office_id) ON DELETE SET NULL,
    email TEXT,
    phone TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    override_dba_id UUID,
    override_address_id UUID,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Teams (optional, for routing/ops)
CREATE TABLE IF NOT EXISTS brkr_teams (
    team_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL,
    org_id UUID REFERENCES brkr_organizations(org_id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brkr_team_offices (
    team_office_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES brkr_teams(team_id) ON DELETE CASCADE,
    office_id UUID NOT NULL REFERENCES brkr_offices(office_id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    role_label TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brkr_team_memberships (
    team_membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES brkr_teams(team_id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES brkr_people(person_id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    role_label TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Catalogs
CREATE TABLE IF NOT EXISTS brkr_dba_names (
    dba_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES brkr_organizations(org_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brkr_org_addresses (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES brkr_organizations(org_id) ON DELETE CASCADE,
    line1 TEXT NOT NULL,
    line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'US',
    normalized TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Indexes and constraints
-- Unique email across employments (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_brkr_employments_email_unique ON brkr_employments ((lower(email))) WHERE email IS NOT NULL;

-- At most one active employment per person
CREATE UNIQUE INDEX IF NOT EXISTS idx_brkr_employments_active_per_person ON brkr_employments(person_id) WHERE active = TRUE;

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_brkr_employments_org_id ON brkr_employments(org_id);
CREATE INDEX IF NOT EXISTS idx_brkr_employments_person_id ON brkr_employments(person_id);
CREATE INDEX IF NOT EXISTS idx_brkr_offices_org_id ON brkr_offices(org_id);
CREATE INDEX IF NOT EXISTS idx_brkr_dba_org_id ON brkr_dba_names(org_id);
CREATE INDEX IF NOT EXISTS idx_brkr_org_addresses_org_id ON brkr_org_addresses(org_id);
"""


def main():
    print("Connecting to DB…")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    print("Creating brokers_alt schema tables…")
    cur.execute(SCHEMA_SQL)
    conn.commit()
    cur.close()
    conn.close()
    print("✅ brokers_alt tables created or already exist.")


if __name__ == "__main__":
    main()
