# Review & UW Page Redesign Roadmap

> **Status**: Phase 1 Complete
> **Created**: 2025-01-02
> **Updated**: 2025-01-02
> **Target Architecture**: Document-Centric Review with Side-by-Side Intelligence

---

## Executive Summary

The React migration simplified the Review and UW pages, losing key AI-first functionality that existed in Streamlit. This document captures the analysis of what was lost, proposes a phased approach to restoration, and architects toward a document-centric future that leverages native document ingestion.

**Key Insight**: The original system was AI-first (AI proposes, human disposes). The React migration inadvertently made AI output read-only, breaking the feedback loop and removing the UW's ability to correct AI work.

---

## Part 1: Current State Analysis

### Original Streamlit Architecture

The Streamlit implementation (`pages_workflows/submissions.py`, 2191 lines) provided:

#### Review Tab - Verification & Conflicts
- **Credibility scoring** (0-100) with breakdown:
  - Consistency score (40% weight) - internal data contradictions
  - Plausibility score (35% weight) - business context makes sense
  - Completeness score (25% weight) - application has required answers
- **Conflict detection** - flags contradictions between sources
- **Blocker warnings** - prevents binding when critical issues exist
- **Document preview** - UWs could view source PDFs inline

#### UW Tab - AI Analysis with Human Editing
- **Editable AI outputs**:
  - Business Summary (expandable, rich text)
  - Cyber Exposures (markdown editing)
  - NIST Controls Summary (markdown editing)
  - Bullet Point Summary
- **Feedback tracking** - every edit logged via `save_feedback()` for model improvement
- **Read-only displays**: NAICS classification, industry tags
- **Override controls**: Hazard class, control adjustments

#### Key Features
- Inline edit/save workflow with session state
- Expandable sections for long content
- Document popover (`docs_popover.py`) for viewing source PDFs
- All data on single page with tab navigation

### Current React Implementation

#### ReviewPage.jsx (258 lines)
**What it shows:**
- AI Recommendation (read-only gray box)
- Guideline Citations (read-only)
- Quick Facts metrics
- Accept/Refer/Decline buttons

**What's missing:**
- Credibility score display
- Conflict detection UI
- Blocker warnings
- Document preview
- No editing capability

#### UWPage.jsx (390 lines)
**What it shows:**
- Hazard/Control adjustment dropdowns (editable)
- Business Summary (read-only)
- Cyber Exposures (read-only)
- NIST Controls Assessment (read-only)
- AI Recommendation preview

**What's missing:**
- Inline editing for AI-generated fields
- Feedback tracking
- Expandable sections
- No ability to correct AI outputs

### What Was Lost in Translation

| Feature | Streamlit | React | Impact |
|---------|-----------|-------|--------|
| Credibility Scoring | Full dashboard | Not implemented | UWs can't assess AI confidence |
| Conflict Detection | Full UI with cards | Not implemented | Contradictions go unnoticed |
| AI Content Editing | Inline edit/save | Read-only | No human-in-the-loop correction |
| Feedback Tracking | Every edit logged | Not implemented | No model improvement loop |
| Document Preview | PDF viewer modal | Not implemented | UWs can't verify source |
| Expandable Sections | st.expander() | Fixed layout | Long content harder to navigate |

### Database Schema (Preserved)

All AI fields still exist in the database:
- `ai_recommendation` - AI's quote/decline/refer decision
- `ai_guideline_citations` - RAG citations as JSON
- `business_summary` - AI-generated company description
- `cyber_exposures` - AI-identified risk bullets
- `nist_controls_summary` - NIST CSF assessment
- `bullet_point_summary` - Key findings bullets
- `nist_controls` - Parsed controls JSON

Supporting tables also exist:
- `credibility_scores` - Per-submission credibility breakdown
- `conflict_reviews` - Detected conflicts and resolutions
- `feedback` - Edit tracking for model improvement

---

## Part 2: Document Ingestion Analysis

### Current Flow (with Docupipe)

```
Email Inbox
    │
    ▼
┌─────────────┐
│ poll_inbox  │ ── extracts attachments
└─────────────┘
    │
    ▼
┌─────────────┐
│  Docupipe   │ ── external service (PDF → JSON)
│  (external) │
└─────────────┘
    │
    ▼
┌─────────────┐
│  pipeline   │ ── process_submission()
│   .py       │    - summarize business ops
└─────────────┘    - extract cyber exposures
    │              - NIST controls analysis
    ▼              - NAICS classification
┌─────────────┐    - AI recommendation (RAG)
│  Database   │    - conflict detection
└─────────────┘
```

### What Docupipe Does

Docupipe converts raw PDF application forms into structured JSON:
```json
{
  "applicantName": "Acme Corp",
  "annualRevenue": 5000000,
  "primaryWebsiteAndEmailDomains": "acme.com",
  "conductsPhishingSimulations": true,
  "endpointSecurityTechnologies": ["CrowdStrike"],
  "mfaForRemoteAccess": true,
  // ... hundreds of fields
}
```

### Native Extraction Opportunity

We already have partial infrastructure:
- `ai/document_extractor.py` - extracts raw text from PDF/DOCX
- `pypdf` for text extraction
- `unstructured` as fallback for scanned docs

**What we'd need to build:**
1. **Schema-aware extraction** - prompt engineering to extract specific fields
2. **Confidence scoring** - AI's certainty on each extracted value
3. **Provenance tracking** - page number, bounding box, source text
4. **Multi-document merging** - combine data from app, loss runs, email

### Benefits of Native Ingestion

1. **Provenance** - "This value came from page 3, paragraph 2"
2. **Confidence** - Per-field certainty scores
3. **Correction at source** - UW edits link back to extraction
4. **Side-by-side view** - Document + extractions together
5. **Feedback loop** - Corrections improve future extractions
6. **Cost control** - No per-document external API fees
7. **Customization** - Tailor to our specific application forms

---

## Part 3: Proposed Directions

### Direction A: Document-Centric Review

**Philosophy**: Review is where UWs verify AI understood the submission correctly.

```
┌──────────────────────────────────────────────────────────────────┐
│  REVIEW PAGE                                                      │
├────────────────────────────┬─────────────────────────────────────┤
│                            │                                      │
│  📄 Source Documents       │  🔍 Extracted Data                   │
│                            │                                      │
│  ┌──────────────────┐     │  Applicant: Acme Corp ✓ [edit]       │
│  │                  │     │  Revenue: $5M ⚠️ (72% conf) [edit]   │
│  │   [PDF Viewer]   │     │  Website: acme.com ✓                 │
│  │                  │     │  Industry: SaaS (NAICS 541511) ✓     │
│  │  Click field to  │     │                                      │
│  │  highlight source│     │  ─────────────────────────────────   │
│  │                  │     │                                      │
│  │   Page 3 ────────┼────▶│  Controls Extracted:                 │
│  │                  │     │  ✓ MFA Email                         │
│  └──────────────────┘     │  ✓ EDR: CrowdStrike                  │
│                            │  ❌ Offline Backups: Not found       │
│  Documents:                │  ⚠️ Phishing Training: Unclear       │
│  • Application.pdf ★       │                                      │
│  • LossRuns_2024.pdf       │  ─────────────────────────────────   │
│  • broker_email.eml        │                                      │
│                            │  Credibility Score: 78/100           │
│                            │  • Consistency: 85% ✓                │
│                            │  • Completeness: 70% ⚠️              │
│                            │  • Plausibility: 80% ✓               │
│                            │                                      │
│                            │  ─────────────────────────────────   │
│                            │                                      │
│                            │  ⚠️ 1 Conflict Detected              │
│                            │  Revenue in app ($5M) differs from   │
│                            │  web research ($12M annual)          │
│                            │  [Resolve]                           │
│                            │                                      │
└────────────────────────────┴─────────────────────────────────────┘
```

**Key Features:**
- Side-by-side document + extractions
- Click field → PDF scrolls to source
- Confidence indicators on extracted values
- Inline editing with provenance
- Credibility score prominent
- Conflict resolution workflow

### Direction B: Linear Workflow

Restructure tabs to match UW mental model:

| Tab | Purpose | When Active |
|-----|---------|-------------|
| **Account** | Company info, broker contact | Always |
| **Documents** | Source doc viewer, extraction status | Always |
| **Analysis** | AI outputs (NIST, exposures, bullets) + editing | Always |
| **Decision** | Accept/Refer/Decline with full context | Always |
| **Rating** | Premium calculation | After Accept |
| **Quote** | Tower structure, terms | After Accept |
| **Policy** | Bound policy management | After Bind |

**Key Change**: "Review" splits into "Documents" (verification) and "Decision" (action)

### Direction C: Minimal Changes + Foundation

Preserve current structure but add missing pieces:

**ReviewPage additions:**
- Credibility score card (fetch from `credibility_scores` table)
- Conflict warnings section (fetch from `conflict_reviews` table)
- Document preview button (modal with PDF viewer)

**UWPage additions:**
- Inline editing toggle for AI fields
- Auto-save with feedback tracking
- Expandable sections for long content

**API additions:**
- `GET /api/submissions/:id/credibility` - credibility breakdown
- `GET /api/submissions/:id/conflicts` - conflict list
- `GET /api/submissions/:id/documents` - document list with preview URLs
- `PATCH /api/submissions/:id` - accept edits to AI fields

### Direction D: Side-by-Side Intelligence

Every AI output shows its source:

```
┌─────────────────────────────────────────────────────────────────┐
│  Business Summary                                    [📄 Source] │
├─────────────────────────────────────────────────────────────────┤
│  Acme Corp is a B2B SaaS company providing...                   │
│                                                                  │
│  [Edit] [Show Source Documents]                                  │
└─────────────────────────────────────────────────────────────────┘

Clicking [📄 Source] opens:
┌─────────────────────────────────────────────────────────────────┐
│  Sources for Business Summary                                    │
├─────────────────────────────────────────────────────────────────┤
│  1. Application.pdf (page 1) - Company description field         │
│  2. Web research - acme.com/about                                │
│  3. Broker email - "They're a fast-growing SaaS startup..."     │
└─────────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Native ingestion with provenance tracking
- Source attribution on every AI-generated field
- Ability to trace any value back to its origin

---

## Part 4: Implementation Roadmap

### Phase 1: Foundation ✅ COMPLETE

**Goal**: Restore core Streamlit functionality in React

**Completed 2025-01-02:**

#### 1.1 UWPage Editing ✅
- Inline edit mode for AI-generated fields:
  - `business_summary`
  - `cyber_exposures`
  - `nist_controls_summary`
  - `bullet_point_summary`
- Auto-save with API PATCH
- Keyboard shortcuts (Cmd+Enter to save, Escape to cancel)
- Note: Feedback tracking deferred to later phase

#### 1.2 ReviewPage Enhancements ✅
- Credibility score display with dimension breakdown
- Conflict list with approve/defer actions
- Source documents list
- New API endpoints for all three

#### 1.3 Deferred: Layout & UX Refinement

The following UX work is recognized but deferred to focus on functionality first:

- **Field placement optimization** - Review layout of sections across Review/UW pages
- **Complementary field grouping** - Some fields may overlap or complement each other (e.g., AI recommendation appears in both Review and UW)
- **Information hierarchy** - Determine which information is primary vs. supporting
- **Progressive disclosure** - Consider collapsible sections for less critical data
- **Cross-page consistency** - Ensure similar patterns used across all tabs

This refinement should happen after Phase 2 (native ingestion) when we have a clearer picture of how extraction provenance will be displayed alongside the data.

#### 1.4 API Endpoints (Implemented)
```
GET  /api/submissions/:id/credibility
GET  /api/submissions/:id/conflicts
POST /api/submissions/:id/conflicts/:conflict_id/resolve
GET  /api/submissions/:id/documents
GET  /api/submissions/:id/documents/:doc_id/content
POST /api/feedback  (for edit tracking)
```

### Phase 2: Native Document Ingestion

**Goal**: Replace Docupipe with Claude-based extraction

#### 2.1 Extraction Pipeline
- Build Claude-based PDF → JSON extractor
- Define extraction schema matching current `standardized_json` format
- Implement confidence scoring per field
- Store extraction provenance (page, bounding box, source text)

#### 2.2 Database Schema Extensions
```sql
-- Field-level extraction provenance
CREATE TABLE extraction_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id),
  field_name TEXT NOT NULL,
  extracted_value JSONB,
  confidence DECIMAL(3,2),
  source_document_id UUID REFERENCES documents(id),
  source_page INTEGER,
  source_text TEXT,
  source_bbox JSONB,  -- {x, y, width, height}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extraction corrections (for feedback loop)
CREATE TABLE extraction_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provenance_id UUID REFERENCES extraction_provenance(id),
  original_value JSONB,
  corrected_value JSONB,
  corrected_by TEXT,
  corrected_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2.3 Multi-Document Handling
- Merge extractions from multiple documents
- Conflict detection between documents
- Priority rules (application > loss runs > email)

### Phase 3: Document-Centric Review

**Goal**: Implement Direction A/D - side-by-side intelligence

#### 3.1 Document Viewer Component
- PDF.js integration with page navigation
- Highlight regions based on provenance
- Click-to-scroll from field to source

#### 3.2 Extraction Panel Component
- Display all extracted fields
- Show confidence indicators
- Inline editing with correction tracking
- "Show source" links per field

#### 3.3 Review Page Redesign
- Split-pane layout (document | extractions)
- Credibility score prominent
- Conflict resolution workflow
- Approval/rejection per field

#### 3.4 UW Page Integration
- "Show source" on AI-generated content
- Source document references in analysis
- Edit history with provenance

### Phase 4: Continuous Improvement

**Goal**: Close the feedback loop

#### 4.1 Extraction Model Improvement
- Use corrections to improve extraction prompts
- A/B test extraction approaches
- Track extraction accuracy over time

#### 4.2 AI Analysis Improvement
- Use UW edits to improve summaries
- Track which AI outputs get edited most
- Refine prompts based on patterns

#### 4.3 Credibility Model Tuning
- Correlate credibility scores with outcomes
- Adjust scoring weights based on data
- Add new credibility dimensions

---

## Part 5: Technical Architecture

### Component Structure (Phase 1)

```
frontend/src/
├── pages/
│   ├── ReviewPage.jsx      # Enhanced with credibility, conflicts, docs
│   ├── UWPage.jsx          # Enhanced with inline editing
│   └── ...
├── components/
│   ├── CredibilityScore.jsx     # Score display with breakdown
│   ├── ConflictCard.jsx         # Single conflict display
│   ├── ConflictList.jsx         # List of conflicts
│   ├── DocumentPreview.jsx      # PDF viewer modal
│   ├── EditableField.jsx        # Inline edit component
│   └── FeedbackTracker.jsx      # Silent edit tracking
└── api/
    └── client.js           # Add new endpoints
```

### Component Structure (Phase 3)

```
frontend/src/
├── pages/
│   ├── ReviewPage.jsx      # Document-centric layout
│   └── ...
├── components/
│   ├── review/
│   │   ├── DocumentViewer.jsx      # PDF.js with highlighting
│   │   ├── ExtractionPanel.jsx     # Field list with confidence
│   │   ├── FieldWithSource.jsx     # Field + provenance link
│   │   ├── ConflictResolver.jsx    # Conflict resolution UI
│   │   └── CredibilityCard.jsx     # Score with drill-down
│   ├── uw/
│   │   ├── EditableSection.jsx     # Expandable + editable
│   │   ├── SourceAttribution.jsx   # "Source" link component
│   │   └── EditHistory.jsx         # Show edit provenance
│   └── shared/
│       ├── PDFHighlighter.jsx      # Highlight regions in PDF
│       └── ConfidenceBadge.jsx     # Visual confidence indicator
└── api/
    └── client.js
```

### API Structure (Phase 1)

```python
# api/main.py additions

@app.get("/api/submissions/{submission_id}/credibility")
def get_credibility(submission_id: str):
    """Return credibility score breakdown"""
    # Fetch from credibility_scores table
    return {
        "overall": 78,
        "consistency": 85,
        "plausibility": 80,
        "completeness": 70,
        "flags": ["Missing backup configuration answers"]
    }

@app.get("/api/submissions/{submission_id}/conflicts")
def get_conflicts(submission_id: str):
    """Return list of detected conflicts"""
    # Fetch from conflict_reviews table
    return {
        "conflicts": [
            {
                "id": "...",
                "field": "annual_revenue",
                "type": "value_mismatch",
                "source_a": {"value": 5000000, "source": "application"},
                "source_b": {"value": 12000000, "source": "web_research"},
                "status": "unresolved",
                "severity": "medium"
            }
        ]
    }

@app.post("/api/submissions/{submission_id}/conflicts/{conflict_id}/resolve")
def resolve_conflict(submission_id: str, conflict_id: str, resolution: dict):
    """Mark conflict as resolved with chosen value"""
    pass

@app.get("/api/submissions/{submission_id}/documents")
def get_documents(submission_id: str):
    """Return list of source documents"""
    return {
        "documents": [
            {
                "id": "...",
                "filename": "Application.pdf",
                "document_type": "Application Form",
                "page_count": 12,
                "is_priority": True,
                "preview_url": "/api/documents/.../preview"
            }
        ]
    }

@app.post("/api/feedback")
def save_feedback(feedback: dict):
    """Track AI output edits for model improvement"""
    # Insert into feedback table
    pass
```

### Database Queries (Phase 1)

```sql
-- Credibility score query
SELECT
    overall_score,
    consistency_score,
    plausibility_score,
    completeness_score,
    flags
FROM credibility_scores
WHERE submission_id = $1
ORDER BY created_at DESC
LIMIT 1;

-- Conflicts query
SELECT
    id,
    field_name,
    conflict_type,
    source_a_value,
    source_a_origin,
    source_b_value,
    source_b_origin,
    status,
    severity,
    resolution,
    resolved_at,
    resolved_by
FROM conflict_reviews
WHERE submission_id = $1
ORDER BY severity DESC, created_at DESC;

-- Documents query
SELECT
    id,
    filename,
    document_type,
    page_count,
    is_priority,
    created_at
FROM documents
WHERE submission_id = $1
ORDER BY is_priority DESC, created_at DESC;
```

---

## Part 6: Design Principles

### AI-First, Human-in-the-Loop

1. **AI proposes** - Generate summaries, extract fields, classify industry
2. **Human reviews** - See AI confidence, verify against source
3. **Human corrects** - Edit inline, system tracks correction
4. **AI learns** - Corrections feed back to improve future extractions

### Progressive Disclosure

1. **Default view** - Clean, focused on key decisions
2. **Expand for detail** - Click to see confidence, source, history
3. **Deep dive available** - Full document view, all extractions

### Source Attribution

Every AI-generated value should answer:
- Where did this come from?
- How confident is the AI?
- Has it been edited by a human?

### Feedback Loop Integrity

Every human correction should:
- Be tracked with timestamp and user
- Link to original AI output
- Be available for model improvement
- Preserve edit history

---

## Part 7: Open Questions

### Technical
1. **PDF.js vs. alternatives** - Best React PDF viewer for highlighting?
2. **Extraction model** - Claude vs. GPT-4 Vision vs. specialized?
3. **Bounding box storage** - How to efficiently store/query?

### Product
1. **Conflict resolution UX** - Modal vs. inline vs. separate page?
2. **Confidence thresholds** - What score triggers manual review?
3. **Edit permissions** - Who can edit AI outputs?

### Process
1. **Migration strategy** - How to handle in-flight submissions?
2. **Docupipe sunset** - Timeline for deprecation?
3. **Training** - How to onboard UWs to new workflow?

---

## Appendix A: File References

### Streamlit (Original)
- `pages_workflows/submissions.py` - Main workflow (2191 lines)
- `pages_components/review_queue_panel.py` - Review component
- `pages_components/docs_popover.py` - Document preview
- `core/credibility_score.py` - Credibility calculation
- `core/conflict_service.py` - Conflict detection
- `core/pipeline.py` - Ingestion pipeline

### React (Current)
- `frontend/src/pages/ReviewPage.jsx` - Review page (258 lines)
- `frontend/src/pages/UWPage.jsx` - UW page (390 lines)
- `frontend/src/pages/AccountPage.jsx` - Account page (304 lines)
- `frontend/src/pages/RatingPage.jsx` - Rating page (368 lines)
- `api/main.py` - Backend API

### Database
- `db_setup/create_conflict_review_tables.sql` - Conflict tables
- `db_setup/create_document_library.sql` - Document tables

### AI
- `ai/document_extractor.py` - Text extraction
- `ai/guideline_rag.py` - AI recommendation

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Credibility Score** | 0-100 rating of application quality (consistency, plausibility, completeness) |
| **Conflict** | Contradiction between data sources (e.g., app vs. web research) |
| **Provenance** | Origin tracking for extracted values (document, page, location) |
| **Docupipe** | External service that converts PDF applications to structured JSON |
| **Native Ingestion** | In-house document extraction using Claude/GPT |
| **Feedback Loop** | System where human corrections improve AI outputs |

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-01-02 | Claude | Initial document based on codebase analysis |
