# Unified Extraction Panel - Implementation Plan

**Goal:** Consolidate SetupPage into a cleaner verification workflow with a unified extraction panel.

**Safety:**
- Backup branch: `bbox-working-backup`
- Checkpoint commit: `5cf7f15`

---

## Design Summary

### Before (Current)
- Verification Checklist (separate component)
- Application Quality Card (on SetupPage)
- Conflicts Section (separate)
- Document Viewer + Extraction Panel (side by side)

### After (New)
- **PDF Viewer** (left) - unchanged
- **Unified Extraction Panel** (right) - new component combining:
  - Required Verifications section (collapsible, at top)
  - All Extractions sections (collapsible, grouped by category)
  - Conflicts inline with extractions (not separate)
- **Application Quality** → moves to AnalyzePage

---

## Required Verification Fields

1. Company Name
2. Revenue
3. Business Description
4. Website
5. Broker
6. Policy Period (effective + expiration dates)
7. Industry (NAICS)

---

## Task List

### Phase 1: Setup & Safety
- [x] Commit current working state
- [x] Create backup branch `bbox-working-backup`
- [x] Document the plan

### Phase 2: Database & API
- [x] Add `field_verifications` table for field verifications
- [x] Add API endpoint: `GET /api/submissions/:id/verifications`
- [x] Add API endpoint: `PATCH /api/submissions/:id/verifications/:field_name`
- [x] Inline edits update both verification record AND submission field

### Phase 3: New Component
- [x] Create `UnifiedExtractionPanel.jsx`
  - [x] RequiredVerifications section with progress indicator
  - [x] Collapsible extraction groups (reuse existing logic)
  - [x] Inline verify/edit actions
  - [x] Conflict badges inline with fields
  - [x] Bbox highlighting integration (use existing PdfHighlighter)

### Phase 4: SetupPage Refactor
- [x] Simplify SetupPage layout (PDF + UnifiedExtractionPanel)
- [x] Remove standalone VerificationChecklist component
- [x] Remove Application Quality card (moves to Analyze)
- [x] Remove separate Conflicts section

### Phase 5: AnalyzePage Update
- [x] Add Application Quality card to AnalyzePage

### Phase 6: Testing & Cleanup
- [ ] Test bbox highlighting still works
- [ ] Test verification save/load
- [ ] Test inline field editing
- [ ] Test conflict resolution
- [x] Business description verification component integrated
- [ ] Remove unused components if successful

---

## Component Architecture

```
SetupPage.jsx
├── PdfHighlighter.jsx (unchanged)
└── UnifiedExtractionPanel.jsx (new)
    ├── RequiredVerificationsSection
    │   └── VerificationItem (verify/edit/conflict actions)
    └── ExtractionGroupSection (existing logic, wrapped)
        └── ExtractionItem (with bbox click handler)
```

---

## API Schema

### verification_status table
```sql
CREATE TABLE field_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id),
  field_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'corrected')),
  original_value TEXT,
  corrected_value TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, field_name)
);
```

### API Responses
```json
// GET /api/submissions/:id/verifications
{
  "verifications": {
    "company_name": { "status": "confirmed", "verified_at": "..." },
    "revenue": { "status": "corrected", "original_value": "5000000", "corrected_value": "8000000" }
  },
  "progress": { "completed": 2, "total": 7 }
}
```

---

## Rollback Plan

If this doesn't work:
1. `git checkout bbox-working-backup`
2. Or revert to commit `5cf7f15`

The existing `PdfHighlighter.jsx` and `ExtractionPanel.jsx` remain untouched as fallback.
