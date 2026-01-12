-- Seed Initial Enhancement Types

INSERT INTO enhancement_types (code, name, description, data_schema, linked_endorsement_code, position, sort_order)
VALUES
-- Additional Insured Schedule
(
    'ADD-INSURED',
    'Additional Insured Schedule',
    'Add additional insureds to the policy with specified relationships',
    '{
        "type": "array",
        "title": "Additional Insureds",
        "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "title": "Name", "required": true},
                "street": {"type": "string", "title": "Street Address"},
                "city": {"type": "string", "title": "City"},
                "state": {"type": "string", "title": "State", "maxLength": 2},
                "zip": {"type": "string", "title": "ZIP", "maxLength": 5},
                "relationship": {
                    "type": "select",
                    "title": "Relationship",
                    "options": ["Landlord", "Lender/Mortgagee", "Vendor", "Client/Customer", "Joint Venture Partner", "Subsidiary", "Affiliate", "Other"]
                }
            }
        },
        "minItems": 1
    }'::jsonb,
    'END-AI-001',
    'either',
    10
),

-- Modified ERP Terms
(
    'MOD-ERP',
    'Modified ERP Terms',
    'Customize Extended Reporting Period terms beyond standard provisions',
    '{
        "type": "object",
        "title": "ERP Terms",
        "properties": {
            "basic_period_days": {
                "type": "number",
                "title": "Basic ERP Period (days)",
                "default": 60,
                "description": "Days of automatic coverage after policy cancellation"
            },
            "supplemental_period_months": {
                "type": "number",
                "title": "Supplemental Period (months)",
                "default": 12,
                "description": "Optional extended period available for purchase"
            },
            "supplemental_premium_pct": {
                "type": "number",
                "title": "Supplemental Premium (%)",
                "default": 100,
                "description": "Percentage of annual premium for supplemental ERP"
            },
            "notes": {
                "type": "text",
                "title": "Special Terms",
                "description": "Any additional ERP provisions"
            }
        }
    }'::jsonb,
    'END-ERP-MOD-001',
    'either',
    20
),

-- Modified Hammer Clause
(
    'MOD-HAMMER',
    'Modified Hammer Clause',
    'Adjust consent-to-settle provisions from standard policy terms',
    '{
        "type": "object",
        "title": "Hammer Clause Terms",
        "properties": {
            "insurer_percentage": {
                "type": "number",
                "title": "Insurer Share (%)",
                "required": true,
                "description": "Insurer percentage of excess settlement if consent refused"
            },
            "insured_percentage": {
                "type": "number",
                "title": "Insured Share (%)",
                "required": true,
                "description": "Insured percentage of excess settlement if consent refused"
            }
        }
    }'::jsonb,
    'END-HAMMER-001',
    'either',
    30
),

-- Subsidiary Acquisition Threshold
(
    'SUB-THRESHOLD',
    'Subsidiary Acquisition Threshold',
    'Set automatic coverage threshold for newly acquired subsidiaries',
    '{
        "type": "object",
        "title": "Acquisition Threshold",
        "properties": {
            "revenue_threshold": {
                "type": "currency",
                "title": "Revenue Threshold",
                "required": true,
                "description": "Maximum annual revenue for automatic coverage"
            },
            "asset_threshold": {
                "type": "currency",
                "title": "Asset Threshold",
                "description": "Maximum total assets for automatic coverage"
            },
            "notice_days": {
                "type": "number",
                "title": "Notice Period (days)",
                "default": 90,
                "description": "Days to notify insurer of acquisitions exceeding threshold"
            },
            "coverage_period_days": {
                "type": "number",
                "title": "Automatic Coverage Period (days)",
                "default": 90,
                "description": "Days of automatic coverage for qualifying acquisitions"
            }
        }
    }'::jsonb,
    'END-SUB-ACQ-001',
    'primary',
    40
)

ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    data_schema = EXCLUDED.data_schema,
    linked_endorsement_code = EXCLUDED.linked_endorsement_code,
    position = EXCLUDED.position,
    sort_order = EXCLUDED.sort_order;
