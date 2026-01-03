# Loss History Enhancements

Three related projects to improve loss history handling and document accessibility.

---

## Project A: Documents Button in Header (Modal/Panel)

**Problem:** Users must navigate to the Review tab to view documents. When reviewing loss history on UW tab or working on Quote tab, there's no quick access to source documents.

**Solution:** Add a "Docs" button in the submission header that opens a slide-out panel or modal with:
- Document list for the submission
- PDF viewer
- Extraction data preview

**Location:** Top header bar, near "Karbon Steel > Received" breadcrumb area

**Behavior:**
- Click "Docs" button → slide-out panel from right (or modal)
- Panel contains: document list, PDF viewer, extraction highlights
- Can be opened from any tab (Account, UW, Rating, Quote, etc.)
- Doesn't navigate away from current tab

**Technical:**
- Add state to SubmissionLayout for panel open/close
- Reuse existing DocumentViewer and ExtractionPanel components
- Panel overlays current content, doesn't replace it

---

## Project B: UW Notes on Loss Claims

**Problem:** Formal loss runs show paid/reserved amounts, but UWs get additional context from broker calls, emails, and other informal sources. A claim showing $0 paid might actually be expected to be a limit loss.

**Solution:** Add annotation capability to each claim in loss_history:

**Database changes:**
```sql
ALTER TABLE loss_history ADD COLUMN uw_notes TEXT;
ALTER TABLE loss_history ADD COLUMN expected_total NUMERIC(15,2);
ALTER TABLE loss_history ADD COLUMN note_source VARCHAR(255);
ALTER TABLE loss_history ADD COLUMN note_updated_at TIMESTAMP;
ALTER TABLE loss_history ADD COLUMN note_updated_by VARCHAR(255);
```

**UI changes:**
- Each claim row expandable or has edit icon
- Click to add/edit UW notes
- Fields: Notes (free text), Expected Total ($), Source (e.g., "Broker call 1/3/25")
- Show indicator when claim has UW notes

**Example:**
```
Claim #123 | $0 paid | $0 reserved
UW Note: "Broker expects limit loss - $1M. Litigation ongoing."
Source: Call with Jane Smith, 1/2/2025
Expected Total: $1,000,000
```

---

## Project C: AI Correction Review Workflow

**Problem:** AI extraction (especially OCR) may correct values (e.g., dates 1908→2008). These corrections could be wrong, and UWs should review before data is finalized.

**Solution:** Store original vs corrected values and require UW approval.

**Database changes:**
```sql
CREATE TABLE extraction_corrections (
    id SERIAL PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id),
    source_document_id UUID REFERENCES documents(id),
    target_table VARCHAR(100),  -- e.g., 'loss_history'
    target_record_id INTEGER,
    field_name VARCHAR(100),
    original_value TEXT,
    corrected_value TEXT,
    correction_reason TEXT,
    confidence FLOAT,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, accepted, rejected
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Workflow:**
1. AI extraction detects value that needs correction
2. Stores both original and corrected in `extraction_corrections`
3. Uses corrected value in target table but marks as "pending review"
4. UW sees pending corrections in UI
5. UW accepts (keeps corrected) or rejects (reverts to original)

**UI:**
- Badge/indicator showing "X corrections pending review"
- Review panel showing side-by-side: Original | AI Suggested | [Accept] [Reject]
- Audit trail of all corrections

---

## Implementation Order

1. **Project A** - Docs button in header (enables quick document access)
2. **Project B** - UW notes on claims (quick win, high value)
3. **Project C** - AI correction review (more complex, foundational)

---

## Status

| Project | Status | Started | Completed |
|---------|--------|---------|-----------|
| A - Docs Header Button | In Progress | 2025-01-03 | |
| B - UW Notes on Claims | Not Started | | |
| C - AI Correction Review | Not Started | | |
