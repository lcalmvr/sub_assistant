# Compliance Module Setup

## Overview
The Compliance module provides a comprehensive reference library and rules engine for compliance requirements related to quotes, binders, and policies.

## Setup Instructions

### 1. Create the Database Table

**Option A: Using the Python migration script (recommended)**
```bash
python db_setup/run_compliance_migration.py
```

**Option B: Using psql directly**
```bash
psql $DATABASE_URL -f db_setup/create_compliance_rules.sql
```

**Option C: Using a database client**
Execute the SQL file `db_setup/create_compliance_rules.sql` directly in your database client (pgAdmin, DBeaver, etc.)

### 2. Seed Initial Compliance Rules
Run the Python seed script to populate the table with initial compliance rules:

```bash
python db_setup/seed_compliance_rules.py
```

This will seed the database with rules for:
- **OFAC Compliance**: SDN list screening and reporting requirements
- **Service of Suit**: General and state-specific requirements (CA, etc.)
- **NY Free Trade Zone**: Eligibility criteria and cyber-specific requirements
- **State Rules**: Cancellation notices, disclosure requirements
- **Notice & Stamping**: Surplus lines stamping requirements (FL, TX, IL, etc.)

### 3. Access the Compliance Page
Navigate to the Compliance page from the sidebar (⚖️ Compliance) or from the main page quick actions.

## Features

### Browse by Category
- Filter rules by category (OFAC, Service of Suit, NYFTZ, State Rules, Notice & Stamping)
- Filter by state or product type
- View detailed requirements and procedures for each rule

### Search
- Search rules by code, title, or description
- Full-text search across all active rules

### Quick Reference
- Quick reference guides for major compliance areas
- OFAC compliance checklist
- NYFTZ eligibility criteria
- Service of Suit requirements
- State-specific requirements organized by state

## Rule Structure

Each compliance rule includes:
- **Code**: Unique identifier (e.g., "OFAC-001")
- **Title**: Short descriptive title
- **Category**: Main category classification
- **Description**: Detailed description of the rule
- **Requirements**: Specific requirements checklist
- **Procedures**: Step-by-step compliance procedures
- **Legal Reference**: Citation to relevant regulation
- **Source URL**: Link to official documentation
- **Check Config**: JSON configuration for automated checks (if applicable)
- **Compliance Flags**: Whether endorsement, notice, or stamping is required

## Adding New Rules

You can add new compliance rules programmatically using the `create_compliance_rule()` function in `core/compliance_management.py`, or extend the seed script to include additional rules.

