# Document Generation Guide

Comprehensive guide to the document generation system for quotes, binders, policies, and endorsements.

---

## Document Lifecycle

```
                         ┌─────────────────┐
                         │   Submission    │
                         │    Created      │
                         └────────┬────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │     Quote Option(s)       │
                    │   (insurance_towers)      │
                    └─────────────┬─────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  Quote Primary  │  │  Quote Excess   │  │     Binder      │
    │    (Q-YYYY-*)   │  │   (QX-YYYY-*)   │  │    (B-YYYY-*)   │
    └─────────────────┘  └─────────────────┘  └────────┬────────┘
                                                       │
                                              (Bind Quote Option)
                                                       │
                                              ┌────────▼────────┐
                                              │     Policy      │
                                              │    (P-YYYY-*)   │
                                              └────────┬────────┘
                                                       │
                                              (Mid-term changes)
                                                       │
                                              ┌────────▼────────┐
                                              │   Endorsements  │
                                              │  (Draft → Issued)│
                                              └─────────────────┘
```

### Document Types

| Type | Prefix | When Generated | Template | Description |
|------|--------|----------------|----------|-------------|
| `quote_primary` | Q | Quote tab → Generate Quote | `quote_primary.html` | Primary layer quote proposal |
| `quote_excess` | QX | Quote tab → Generate Excess Quote | `quote_excess.html` | Excess layer quote with tower structure |
| `binder` | B | Quote tab → Bind Option | `binder.html` | Evidence of bound coverage |
| `policy` | P | Policy tab → Issue Policy | `policy_combined.html` | Full issued policy (Dec + Form + Endorsements) |
| endorsement | varies | Policy tab → Issue Endorsement | (library templates) | Mid-term policy modifications |

### Status Transitions

```
       draft
         │
         ├──────────────▶ issued (final, immutable)
         │
         └──────────────▶ void (cancelled, with reason)

       issued
         │
         └──────────────▶ superseded (replaced by newer version)
```

- **draft**: Initial state, can be modified
- **issued**: Finalized, cannot be modified
- **superseded**: Replaced by a newer version (soft-delete, preserves history)
- **void**: Cancelled with reason and audit trail

---

## Core Module

**File**: `core/document_generator.py`

### Key Functions

```python
generate_document(submission_id, quote_option_id, doc_type, created_by)
    # Main entry point - generates PDF and stores in database
    # Returns: {id, document_number, document_type, pdf_url, created_at}

get_document_context(submission_id, quote_option_id)
    # Gathers all data for templates from database
    # Returns: dict with all context variables

render_and_upload(template_name, context, doc_type)
    # Renders Jinja2 template → HTML → PDF (WeasyPrint)
    # Uploads to Supabase storage
    # Returns: public PDF URL

get_documents(submission_id)
    # Retrieves all documents for a submission
    # Returns: list of document dicts

void_document(document_id, reason, voided_by)
    # Voids a document with audit trail
    # Returns: bool
```

### Document Types Registry

```python
DOCUMENT_TYPES = {
    "quote_primary": {
        "template": "quote_primary.html",
        "prefix": "Q",
        "label": "Primary Quote",
    },
    "quote_excess": {
        "template": "quote_excess.html",
        "prefix": "QX",
        "label": "Excess Quote",
    },
    "binder": {
        "template": "binder.html",
        "prefix": "B",
        "label": "Binder",
    },
    "policy": {
        "template": "policy_combined.html",
        "prefix": "P",
        "label": "Policy",
    },
}
```

---

## Template Structure

**Location**: `rating_engine/templates/`

```
templates/
├── _base.html                    # Base template (letterhead, CSS, footer)
├── _components/
│   ├── coverage_table.html       # Coverage schedule macro
│   ├── signature_block.html      # Authorization/signature macros
│   └── tower_visual.html         # Tower layer visualization
├── quote_primary.html            # Primary quote template
├── quote_excess.html             # Excess quote template
├── binder.html                   # Binder/certificate template
├── policy_combined.html          # Combined policy (Dec + Form + Endorsements)
└── policy_forms/
    ├── cyber_form.html           # Cyber policy form content
    ├── cyber_tech_form.html      # Cyber + Tech E&O form content
    └── tech_form.html            # Tech E&O only form content
```

### Base Template (`_base.html`)

Provides:
- **Letterhead**: Company logo, name, contact info
- **CSS**: Complete styling (page layout, typography, tables, colors)
- **Footer**: Document ID, generation timestamp, disclaimer
- **Page numbering**: "Page X of Y" via CSS @page rules

#### CSS Variables (Color Palette)
```css
--navy: #1a365d;       /* Headers, primary text */
--navy-light: #2c5282; /* Gradients */
--gold: #b7791f;       /* Accents, section borders */
--gray-100: #f7fafc;   /* Backgrounds */
--gray-500: #718096;   /* Muted text */
--green: #276749;      /* Success badges */
--red: #c53030;        /* Void badges */
```

### Template Inheritance

```html
{% extends "_base.html" %}
{% from "_components/coverage_table.html" import render_coverage_schedule %}

{% block title %}Quote - {{ insured_name }}{% endblock %}

{% block content %}
    {# Document-specific content #}
{% endblock %}
```

---

## Context Variables

All templates receive these context variables from `get_document_context()`:

### Insured Information
| Variable | Type | Example |
|----------|------|---------|
| `insured_name` | str | "Acme Corp" |
| `insured_website` | str | "acme.com" |
| `insured_industry` | str | "Software Development" |
| `annual_revenue` | int | 50000000 |

### Policy Dates
| Variable | Type | Example |
|----------|------|---------|
| `effective_date` | str | "January 1, 2025" |
| `expiration_date` | str | "January 1, 2026" |
| `quote_date` | str | "December 26, 2024" |
| `valid_until` | str | "January 25, 2025" |

### Broker Information
| Variable | Type | Example |
|----------|------|---------|
| `broker_name` | str | "John Smith" |
| `broker_company` | str | "Marsh & McLennan" |
| `broker_email` | str | "jsmith@marsh.com" |

### Policy Terms
| Variable | Type | Example |
|----------|------|---------|
| `aggregate_limit` | int | 1000000 |
| `retention` | int | 50000 |
| `our_attachment` | int | 1000000 (excess only) |
| `premium` | int | 25000 |
| `position` | str | "primary" or "excess" |
| `policy_form` | str | "cyber", "cyber_tech", or "tech" |
| `quote_name` | str | "Option A" |
| `display_name` | str | "1M x 50K SIR" |

### Coverage Data
| Variable | Type | Description |
|----------|------|-------------|
| `aggregate_coverages` | dict | `{"Network Security": 1000000, ...}` |
| `sublimit_coverages` | dict | `{"Social Engineering": 250000, ...}` |
| `has_dropdown_sublimits` | bool | True for excess with dropdown sublimits |

### Tower Structure (Excess)
| Variable | Type | Description |
|----------|------|-------------|
| `tower` | list | `[{carrier, limit, attachment, premium}, ...]` |

### Document Metadata
| Variable | Type | Example |
|----------|------|---------|
| `document_number` | str | "Q-2025-A1B2C3" |
| `document_id` | str | "A1B2C3D4" |
| `generated_at` | str | "2024-12-26 14:30" |
| `is_revised_binder` | bool | True if regenerating binder |

### Additional Data
| Variable | Type | Description |
|----------|------|-------------|
| `endorsements` | list | Endorsement names attached to quote |
| `subjectivities` | list | (Currently empty, future use) |
| `terms` | str | Standard terms and conditions text |

---

## Custom Jinja2 Filters

Registered in `document_generator.py`:

```python
{{ value | format_currency }}   # $1M, $50K, $1,234,567
{{ value | format_date }}       # January 15, 2025
{{ value | format_limit }}      # 1M, 50K (no $ sign)
```

### Examples
```html
<td>${{ "{:,}".format(premium | int) }}</td>     # $25,000
<td>{{ aggregate_limit | format_currency }}</td>  # $1M
<td>{{ effective_date }}</td>                     # January 1, 2025
```

---

## Storage & Retrieval

### Supabase Storage

**Bucket**: `quotes`
**Path pattern**: `{doc_type}/{uuid}.pdf`

Examples:
- `quotes/quote_primary/550e8400-e29b-41d4-a716-446655440000.pdf`
- `quotes/binder/550e8400-e29b-41d4-a716-446655440001.pdf`
- `quotes/policy/550e8400-e29b-41d4-a716-446655440002.pdf`
- `quotes/endorsements/{submission_id}/endorsement_1_uuid.pdf`

**Public URL format**:
```
{SUPABASE_URL}/storage/v1/object/public/quotes/{path}
```

### Database Schema

**Table**: `policy_documents`

```sql
CREATE TABLE policy_documents (
    id UUID PRIMARY KEY,
    submission_id UUID NOT NULL,      -- FK to submissions
    quote_option_id UUID,              -- FK to insurance_towers

    document_type TEXT NOT NULL,       -- 'quote_primary', 'quote_excess', 'binder', 'policy'
    document_number TEXT,              -- 'Q-2025-001234', 'P-2025-000001'

    pdf_url TEXT NOT NULL,             -- Supabase public URL
    document_json JSONB,               -- Snapshot of context used to generate

    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'draft',       -- 'draft', 'issued', 'superseded', 'void'
    superseded_by UUID,                -- Self-reference
    is_bound_quote BOOLEAN,            -- TRUE if this is the bound quote

    created_by TEXT,
    created_at TIMESTAMP,
    voided_at TIMESTAMP,
    voided_by TEXT,
    void_reason TEXT
);

-- Indexes
idx_policy_documents_submission (submission_id)
idx_policy_documents_type (document_type)
idx_policy_documents_status (status)
idx_policy_documents_quote_option (quote_option_id)
```

---

## Document Number Formats

| Document | Format | Example |
|----------|--------|---------|
| Quote Primary | Q-{YEAR}-{6-char} | Q-2025-A1B2C3 |
| Quote Excess | QX-{YEAR}-{6-char} | QX-2025-D4E5F6 |
| Binder | B-{YEAR}-{6-char} | B-2025-G7H8I9 |
| Policy | P-{YEAR}-{6-digit-seq} | P-2025-000001 |

**Note**: Quotes and binders use random UUID suffixes. Policies use sequential numbering for a more traditional insurance feel.

---

## Extending the System

### Adding a New Document Type

1. **Add to DOCUMENT_TYPES** in `core/document_generator.py`:
```python
DOCUMENT_TYPES["new_type"] = {
    "template": "new_type.html",
    "prefix": "NT",
    "label": "New Document Type",
}
```

2. **Create template** in `rating_engine/templates/new_type.html`:
```html
{% extends "_base.html" %}
{% block title %}New Type - {{ insured_name }}{% endblock %}
{% block content %}
    {# Your content here #}
{% endblock %}
```

3. **Update database constraint** (if needed):
```sql
ALTER TABLE policy_documents
DROP CONSTRAINT valid_document_type;

ALTER TABLE policy_documents
ADD CONSTRAINT valid_document_type CHECK (
    document_type IN ('quote_primary', 'quote_excess', 'binder', 'policy', 'new_type')
);
```

### Adding Context Variables

1. **Update `get_document_context()`** in `core/document_generator.py`:
```python
def get_document_context(submission_id, quote_option_id):
    context = {}
    # ... existing code ...

    # Add your new variable
    context["new_variable"] = compute_new_value()

    return context
```

2. **Use in template**:
```html
{{ new_variable }}
```

### Adding Custom Filters

In `core/document_generator.py`:

```python
def format_custom(value):
    """Your custom formatting logic."""
    return formatted_value

TEMPLATE_ENV.filters['format_custom'] = format_custom
```

Usage:
```html
{{ value | format_custom }}
```

### Adding Template Components

1. **Create component** in `rating_engine/templates/_components/`:
```html
{# _components/my_component.html #}
{% macro render_my_component(data) %}
<div class="my-component">
    {{ data }}
</div>
{% endmacro %}
```

2. **Use in template**:
```html
{% from "_components/my_component.html" import render_my_component %}
{{ render_my_component(my_data) }}
```

---

## Related Modules

| Module | Purpose |
|--------|---------|
| `core/document_generator.py` | Core generation functions |
| `core/package_generator.py` | Combines documents with library endorsements |
| `core/document_library.py` | Reusable document/endorsement library |
| `core/policy_issuance.py` | Policy issuance workflow |
| `rating_engine/coverage_config.py` | Coverage schedule configuration |
| `pages_components/document_actions_panel.py` | UI for generating documents |
| `pages_components/document_history_panel.py` | UI for viewing document history |
