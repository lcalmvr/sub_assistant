# Source Verification Highlighting - Architecture Plan

## Current State (Option A - Implemented)

Simple page jump without highlighting:
- Clicking "p.2" in extraction panel switches to correct document and scrolls PDF to page 2
- No visual highlighting of the specific field on the page
- Clean, fast, no extra API calls

## Future State (Option B - Roadmap)

Visual highlighting of extraction source on the PDF page.

### The Problem We Were Solving Wrong

The original implementation ran Textract **twice**:
1. Backend: During document ingestion (extracts data)
2. Frontend: On-demand to get bounding box coordinates for highlighting

This caused:
- Wasted API costs (~$0.015/page each time)
- Slow UX (had to wait for "Scanning...")
- Confusing badges ("Ready for highlights")
- Technical debt from disconnected systems

### The Right Architecture

Store bbox coordinates **once** during initial extraction, then frontend just reads stored data.

```
┌─────────────────────────────────────────────────────────────────┐
│                     DOCUMENT INGESTION                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Document uploaded                                           │
│  2. Classification runs                                         │
│  3. For applications: Run Claude extraction                     │
│     - Saves to extraction_provenance (has page, source_text)   │
│  4. For all docs: Run Textract with FORMS feature              │
│     - Save key-value pairs WITH bbox to new table              │
│     - Link to extraction_provenance records                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND DISPLAY                            │
├─────────────────────────────────────────────────────────────────┤
│  1. Load extraction_provenance (already done)                   │
│  2. When user clicks "p.2":                                     │
│     - Fetch bbox from stored data (new API endpoint)           │
│     - Scroll PDF to page                                        │
│     - Draw highlight overlay at bbox coordinates               │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema Changes

New table to store Textract bbox data:

```sql
CREATE TABLE textract_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,

    -- Key-value pair info
    field_key TEXT,
    field_value TEXT,

    -- Bounding box (normalized 0-1 coordinates)
    bbox_left DECIMAL(6, 5),
    bbox_top DECIMAL(6, 5),
    bbox_width DECIMAL(6, 5),
    bbox_height DECIMAL(6, 5),

    -- Confidence
    confidence DECIMAL(3, 2),

    -- Link to provenance (optional - for matching)
    provenance_id UUID REFERENCES extraction_provenance(id),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_textract_doc_page ON textract_extractions(document_id, page_number);
```

### Backend Changes

1. **Update extraction_orchestrator.py**:
   - When running Textract FORMS, save bbox data to `textract_extractions` table
   - Try to link to `extraction_provenance` records by matching field values

2. **New API endpoint**:
   ```python
   @app.get("/api/documents/{document_id}/textract-bbox")
   def get_textract_bbox(document_id: str, page: int = None):
       """Get stored Textract bbox data for a document."""
       # Returns list of {field_key, field_value, bbox, page}
   ```

3. **Update extraction_provenance query**:
   - Join with textract_extractions to include bbox in response
   - Or add bbox_id foreign key to extraction_provenance

### Frontend Changes

1. **PdfHighlighter component**:
   - Accept `highlight` prop with bbox coordinates
   - Draw semi-transparent overlay at the coordinates
   - Handle coordinate scaling based on PDF zoom level

2. **ReviewPage**:
   - When user clicks page link, fetch bbox from stored data (not re-scan)
   - Pass bbox to PdfHighlighter

### Migration Strategy

1. Re-process existing documents to populate textract_extractions
2. Or only apply to new documents going forward

### Cost Analysis

- Current (broken): ~$0.015/page on frontend demand = variable cost
- Proposed: ~$0.015/page once during ingestion = fixed cost
- Net: Same or lower cost, better UX

### Implementation Steps

1. Create `textract_extractions` table (migration)
2. Update extraction_orchestrator to save bbox during FORMS extraction
3. Add API endpoint to retrieve bbox data
4. Update extraction_provenance API to include bbox
5. Update PdfHighlighter to render highlight overlay
6. Update ReviewPage to fetch and display highlights
7. Test with sample documents
8. Backfill existing documents (optional)

### Priority

Medium - This is a "nice to have" feature that improves demo impressions.
Core functionality (page jumping) works without it.

---

*Created: 2026-01-03*
*Status: Roadmap - Not yet implemented*
