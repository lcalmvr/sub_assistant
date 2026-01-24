# Conflict Detection & Human Review - Implementation Plan

## Overview

This document outlines the implementation plan for a conflict detection and human review system for submission data. The system will:

1. Track field values with provenance (source, confidence)
2. Detect conflicts between different sources
3. Present conflicts to humans for resolution
4. Support approval workflows before key actions (binding, etc.)

## Architecture

### Core Principle: Detection vs. Trigger Separation

The detection logic is stateless and pure. The **strategy** controls **when** detection runs:

```
┌─────────────────────────────────────────────────────────────────┐
│                      CONFLICT DETECTION                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │   Trigger    │────▶│   Detector   │────▶│    Store     │   │
│  │   Layer      │     │   (Pure)     │     │   (Cache)    │   │
│  └──────────────┘     └──────────────┘     └──────────────┘   │
│         │                                         │            │
│  ┌──────┴──────┐                          ┌──────┴──────┐     │
│  │    EAGER    │                          │    LAZY     │     │
│  │  (on write) │                          │  (on read)  │     │
│  └─────────────┘                          └─────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### Strategy Switching

The "switch" is an environment variable:

```bash
# Options: eager, lazy, hybrid
export CONFLICT_DETECTION_STRATEGY=eager
```

- **EAGER**: Detect on every field value write
- **LAZY**: Detect only when UI requests conflicts
- **HYBRID**: Eager for critical fields, lazy for rest

---

## Files to Create

| File | Purpose | Est. Lines | Status |
|------|---------|------------|--------|
| `core/conflict_config.py` | Configuration, constants, thresholds | ~180 | ✅ Done |
| `core/conflict_detection.py` | Pure detection logic (stateless) | ~340 | ✅ Done |
| `core/conflict_service.py` | Service layer with strategy switching | ~420 | ✅ Done |
| `db_setup/create_conflict_review_tables.sql` | Database schema | ~125 | ✅ Done |
| `pages_components/review_queue_panel.py` | Review Queue UI component | ~450 | ✅ Done |

### File Dependencies

```
conflict_config.py  (no deps)
       ↓
conflict_detection.py  (imports config)
       ↓
conflict_service.py  (imports config, detection, db)
```

---

## File Specifications

### 1. `core/conflict_config.py`

Central configuration that controls detection behavior.

**Contents**:

```python
# Enums and Types
- DetectionStrategy enum (EAGER, LAZY, HYBRID)
- ConflictType literal (VALUE_MISMATCH, LOW_CONFIDENCE, MISSING_REQUIRED, etc.)
- ConflictPriority literal (high, medium, low)
- ReviewStatus literal (pending, approved, rejected, deferred)
- SourceType literal (ai_extraction, document_form, user_edit, etc.)

# Strategy Configuration
- get_detection_strategy() -> DetectionStrategy
  Reads from env var CONFLICT_DETECTION_STRATEGY, defaults to EAGER

# Field Configuration
- TRACKED_FIELDS: set[str]
  Fields stored in field_values table (applicant_name, annual_revenue, etc.)

- EAGER_FIELDS: set[str]
  Fields that get eager detection in HYBRID mode

- REQUIRED_FIELDS: list[str]
  Fields that trigger MISSING_REQUIRED conflict if absent

# Confidence Thresholds
- ConfidenceThreshold class
  - AUTO_ACCEPT = 0.90 (no review needed)
  - NEEDS_VERIFICATION = 0.70 (flagged for review)

# Validation Rules
- CROSS_FIELD_RULES: list[dict]
  e.g., effective_date < expiration_date

- OUTLIER_RANGES: dict[str, tuple]
  e.g., annual_revenue: (10_000, 100_000_000_000)

# Cache Configuration
- CACHE_TTL_SECONDS = 3600

# Helpers
- get_field_priority(field_name) -> ConflictPriority
```

---

### 2. `core/conflict_detection.py`

Pure, stateless detection functions. Takes data in, returns conflicts out. **No DB calls.**

**Contents**:

```python
# Main Entry Point
- detect_conflicts(submission_id: str, field_values: list[dict]) -> list[dict]
  Orchestrates all detection types, returns list of conflict dicts

# Detection Functions (all pure, no side effects)
- detect_value_mismatches(field_values) -> list[dict]
  Groups by field, finds fields with multiple different values

- detect_low_confidence(field_values) -> list[dict]
  Flags values with confidence < CONFIDENCE_THRESHOLD

- detect_missing_required(field_values, required_fields) -> list[dict]
  Checks REQUIRED_FIELDS are present and non-empty

- detect_cross_field_conflicts(field_values) -> list[dict]
  Applies CROSS_FIELD_RULES validation

- detect_outliers(field_values) -> list[dict]
  Checks values against OUTLIER_RANGES bounds

# Helpers
- normalize_value(value: any) -> comparable
  Normalizes for comparison (handles "$5M" vs 5000000, date formats, etc.)

- values_are_equal(val1, val2) -> bool
  Fuzzy equality check with normalization

# Data Classes
- ConflictResult (dataclass)
  - conflict_type: ConflictType
  - field_name: str | None
  - priority: ConflictPriority
  - details: dict
  - conflicting_values: list[dict]
```

---

### 3. `core/conflict_service.py`

Service layer that handles strategy switching, caching, and DB operations.

**Contents**:

```python
# Main Service Class
class ConflictService:

    # Trigger Methods (called by pipeline/UI)
    - on_field_value_written(submission_id: str, field_name: str) -> None
      Called after field_values insert. Decides whether to detect now based on strategy.

    - get_conflicts(submission_id: str) -> list[dict]
      Returns conflicts. Uses cache if fresh, otherwise runs detection.

    - force_refresh(submission_id: str) -> list[dict]
      Always re-runs detection, ignores cache.

    # Resolution Methods
    - resolve_conflict(review_item_id: str, resolution: dict, resolved_by: str) -> bool
      Marks conflict resolved with chosen value/method.

    - defer_conflict(review_item_id: str, notes: str, deferred_by: str) -> bool
      Marks conflict as deferred for later.

    # Summary Methods
    - get_review_summary(submission_id: str) -> dict
      Returns {pending: N, high_priority: N, ...} for UI badges.

    - has_blocking_conflicts(submission_id: str) -> bool
      Returns True if any HIGH priority pending conflicts exist.

# Field Value Storage Functions
- save_field_value(
    submission_id: str,
    field_name: str,
    value: any,
    source_type: SourceType,
    confidence: float | None = None,
    source_document_id: str | None = None,
    extraction_metadata: dict | None = None,
    created_by: str = "system"
  ) -> str  # Returns field_value ID

- get_field_values(submission_id: str, active_only: bool = True) -> list[dict]

- get_field_values_for_field(submission_id: str, field_name: str) -> list[dict]

- deactivate_field_value(field_value_id: str) -> bool

# Review Item Storage Functions (private)
- _run_and_cache(submission_id: str) -> list[dict]
  Runs detection, stores in review_items, returns conflicts.

- _store_conflicts(submission_id: str, conflicts: list[dict]) -> None
  Upserts conflicts into review_items table.

- _get_cached_conflicts(submission_id: str) -> list[dict] | None
  Returns cached conflicts or None if not cached.

- _is_cache_stale(submission_id: str) -> bool
  Checks if cache is older than CACHE_TTL_SECONDS.

- _invalidate_cache(submission_id: str) -> None
  Marks cached conflicts as stale.

# Duplicate Detection
- check_duplicate_submission(submission_id: str, threshold: float = 0.95) -> list[dict]
  Uses ops_embedding vector similarity to find potential duplicates.
```

---

### 4. `db_setup/create_conflict_review_tables.sql`

Database schema for new tables.

```sql
-- =============================================================================
-- field_values: Track every field extraction with provenance
-- =============================================================================
CREATE TABLE field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    value JSONB,                          -- Supports any type
    source_type VARCHAR(50) NOT NULL,     -- ai_extraction, user_edit, etc.
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    confidence DECIMAL(3,2),              -- 0.00 to 1.00, NULL for user edits
    extraction_metadata JSONB,            -- Model, prompt, raw response
    is_active BOOLEAN DEFAULT TRUE,       -- Current vs historical
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'system'
);

-- Indexes
CREATE INDEX idx_field_values_submission ON field_values(submission_id);
CREATE INDEX idx_field_values_lookup ON field_values(submission_id, field_name, is_active);


-- =============================================================================
-- review_items: Track conflicts requiring human attention
-- =============================================================================
CREATE TABLE review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    conflict_type VARCHAR(50) NOT NULL,   -- VALUE_MISMATCH, LOW_CONFIDENCE, etc.
    field_name VARCHAR(100),              -- NULL for submission-level conflicts
    priority VARCHAR(20) NOT NULL,        -- high, medium, low
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, deferred

    conflicting_value_ids UUID[],         -- Array of field_value IDs in conflict
    conflict_details JSONB,               -- Type-specific details

    resolution JSONB,                     -- Chosen value, method, notes
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,

    detected_at TIMESTAMPTZ DEFAULT NOW(),
    cache_key VARCHAR(100),               -- For cache invalidation grouping
    is_stale BOOLEAN DEFAULT FALSE
);

-- Indexes
CREATE INDEX idx_review_items_submission ON review_items(submission_id);
CREATE INDEX idx_review_items_pending ON review_items(submission_id, status)
    WHERE status = 'pending';
CREATE INDEX idx_review_items_priority ON review_items(submission_id, priority, status);
```

---

## Integration Points (Future Work)

After core files are created, integration happens in:

### 1. Pipeline Integration (`core/pipeline.py`)

```python
# After extracting a field value
from core.conflict_service import save_field_value

save_field_value(
    submission_id=submission_id,
    field_name="annual_revenue",
    value=extracted_revenue,
    source_type="ai_extraction",
    confidence=0.85,
    source_document_id=doc_id,
    extraction_metadata={"model": "gpt-4", "prompt": "..."}
)
```

### 2. UI Integration (`pages_components/details_panel.py`)

```python
# Show conflict badge at top of details
from core.conflict_service import ConflictService

service = ConflictService()
summary = service.get_review_summary(submission_id)

if summary["pending"] > 0:
    st.warning(f"⚠️ {summary['pending']} items need review")
```

### 3. Binding Gate (`core/bound_option.py`)

```python
# Before allowing bind
from core.conflict_service import ConflictService

service = ConflictService()
if service.has_blocking_conflicts(submission_id):
    raise ValueError("Cannot bind: unresolved high-priority conflicts")
```

### 4. New Review Queue UI (`pages_components/review_queue_panel.py`)

New component for reviewing and resolving conflicts.

---

## Review Queue UI Specification

### Overview

The Review Queue UI provides a focused interface for humans to review and resolve conflicts detected during submission data extraction. It can be rendered as a panel within the submission page or as a standalone page.

### File: `pages_components/review_queue_panel.py`

**Purpose**: Streamlit component for conflict review and resolution.

### UI Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔍 Review Queue                                    [Refresh] [Filter]│
├─────────────────────────────────────────────────────────────────────┤
│ Summary: 5 pending (3 high, 2 medium) | 2 resolved | 1 deferred     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 🔴 HIGH | VALUE_MISMATCH | annual_revenue                       │ │
│ │                                                                 │ │
│ │ Field 'annual_revenue' has 2 different values:                  │ │
│ │                                                                 │ │
│ │   ○ $5,000,000  (AI Extraction, 85% confidence)                │ │
│ │   ○ $8,200,000  (Document Form)                                │ │
│ │   ○ Enter manually: [________________]                          │ │
│ │                                                                 │ │
│ │ [Approve Selected] [Defer] [Reject]                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 🔴 HIGH | MISSING_REQUIRED | effective_date                     │ │
│ │                                                                 │ │
│ │ Required field 'effective_date' is missing or empty             │ │
│ │                                                                 │ │
│ │ Enter value: [________________] (date picker)                   │ │
│ │                                                                 │ │
│ │ [Save & Approve] [Defer]                                        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 🟡 MEDIUM | LOW_CONFIDENCE | naics_primary_code                 │ │
│ │                                                                 │ │
│ │ Field extracted with 55% confidence (below 70% threshold)       │ │
│ │                                                                 │ │
│ │ Extracted value: 541512 - Computer Systems Design Services      │ │
│ │                                                                 │ │
│ │ [✓ Confirm Value] [Edit] [Defer]                                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ─────────────────── Resolved Items (3) ───────────────────         │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ ✅ APPROVED | applicant_name | Resolved by: user@email.com      │ │
│ │    Chose: "Acme Corporation" from AI Extraction                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Component API

```python
def render_review_queue_panel(
    submission_id: str,
    expanded: bool = True,
    show_resolved: bool = False,
    on_resolve: Callable[[str], None] | None = None,
) -> dict:
    """
    Render the review queue panel for a submission.

    Args:
        submission_id: UUID of the submission
        expanded: Whether the panel is initially expanded
        show_resolved: Whether to show resolved/deferred items
        on_resolve: Callback when an item is resolved (for UI refresh)

    Returns:
        Summary dict with counts: {pending, resolved, has_blockers}
    """
```

### Sub-components

```python
def _render_conflict_card(
    review_item: dict,
    field_values: list[dict],
    submission_id: str,
) -> bool:
    """
    Render a single conflict card with resolution options.

    Returns True if the item was resolved (triggers refresh).
    """

def _render_value_mismatch_card(item: dict, values: list[dict], sub_id: str) -> bool:
    """Radio buttons to select between conflicting values or enter manual."""

def _render_low_confidence_card(item: dict, values: list[dict], sub_id: str) -> bool:
    """Confirm/edit interface for low-confidence extractions."""

def _render_missing_required_card(item: dict, sub_id: str) -> bool:
    """Input field to enter missing required value."""

def _render_cross_field_card(item: dict, values: list[dict], sub_id: str) -> bool:
    """Show related fields and allow editing to fix inconsistency."""

def _render_resolved_item(item: dict) -> None:
    """Compact display of resolved/deferred items."""

def _get_priority_indicator(priority: str) -> str:
    """Return emoji for priority: 🔴 high, 🟡 medium, 🟢 low."""

def _get_source_label(source_type: str) -> str:
    """Human-readable label for source type."""

def _format_value_for_display(value: any, field_name: str) -> str:
    """Format value appropriately (currency, date, etc.)."""
```

### State Management

```python
# Session state keys used:
# - review_queue_filter_{submission_id}: "all" | "pending" | "resolved"
# - review_queue_manual_value_{item_id}: str (for manual entry)
# - review_queue_selected_value_{item_id}: str (field_value_id of selected)
# - review_queue_notes_{item_id}: str (resolution notes)
```

### Resolution Flow

1. **VALUE_MISMATCH**:
   - User selects one of the conflicting values via radio button
   - Or enters a manual value in text input
   - Clicks "Approve Selected"
   - System calls `service.resolve_conflict()` with chosen value
   - System calls `set_active_field_value()` to mark winner

2. **LOW_CONFIDENCE**:
   - User reviews the extracted value
   - Clicks "Confirm" to accept as-is
   - Or clicks "Edit" to modify, then "Save"
   - System calls `service.resolve_conflict()`

3. **MISSING_REQUIRED**:
   - User enters the missing value
   - Clicks "Save & Approve"
   - System calls `save_field_value()` with source_type="user_edit"
   - System calls `service.resolve_conflict()`

4. **CROSS_FIELD**:
   - User sees related fields with current values
   - User edits one or both to fix inconsistency
   - Clicks "Save Changes"
   - System saves new values and resolves conflict

### Integration with Submission Page

```python
# In pages_workflows/submissions.py, add to tab or sidebar:

from pages_components.review_queue_panel import render_review_queue_panel

# In Details tab or as a separate tab:
summary = render_review_queue_panel(submission_id, expanded=True)

if summary["has_blockers"]:
    st.warning("⚠️ Resolve high-priority conflicts before binding")
```

### Styling

- **Priority colors**:
  - High: `#FF4B4B` (Streamlit error red)
  - Medium: `#FFA500` (orange/warning)
  - Low: `#4CAF50` (green)

- **Card styling**: Use `st.container()` with custom CSS via `st.markdown()`

- **Status badges**: Use emoji + colored background
  - 🔴 Pending High
  - 🟡 Pending Medium
  - ✅ Approved
  - ⏸️ Deferred
  - ❌ Rejected

---

## Migration Path

### Switching from EAGER to LAZY

```python
# No data migration needed
# 1. Change env var
export CONFLICT_DETECTION_STRATEGY=lazy

# 2. Optionally mark all cached as stale
UPDATE review_items SET is_stale = true;
```

### Switching from LAZY to EAGER

```python
# 1. Change env var
export CONFLICT_DETECTION_STRATEGY=eager

# 2. Backfill detection for existing submissions
from core.conflict_service import ConflictService
service = ConflictService()

for submission_id in get_all_submission_ids():
    service.force_refresh(submission_id)
```

---

## Performance Considerations

| Component | Impact | Mitigation |
|-----------|--------|------------|
| field_values writes | +100-150 rows/submission | Only track TRACKED_FIELDS |
| Conflict detection | ~100-200ms per run | Cache results, run async in EAGER |
| Review queue queries | +2-3 queries per page | Indexed queries, lazy load details |
| Confidence scoring | +15-20% tokens | Embed in existing prompts, no new calls |

---

## Open Questions

1. **Granularity**: Track all fields or only TRACKED_FIELDS subset?
   - **Decision**: Start with subset, expand as needed

2. **Auto-approval threshold**: How aggressive?
   - **Decision**: Conservative (0.90 confidence for auto-accept)

3. **Binding gate**: Hard block or warning only?
   - **Decision**: TBD based on user preference

4. **Review queue location**: Separate page or embedded in submission?
   - **Decision**: TBD - likely separate page with link from submission

---

## Implementation Order

1. ✅ Create this plan document
2. ✅ Create `core/conflict_config.py`
3. ✅ Create `core/conflict_detection.py`
4. ✅ Create `core/conflict_service.py`
5. ✅ Create `db_setup/create_conflict_review_tables.sql`
6. ✅ Run migration (tables, indexes, views created)
7. ✅ Create `pages_components/review_queue_panel.py`
8. ⬜ Integration (pipeline, details panel badge) - separate task
9. ⬜ Binding gate integration - separate task
