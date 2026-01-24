# Control Update Workflow

## Problem Statement

When a submission is processed, some mandatory controls may be marked as "Not Asked" - meaning the application didn't include questions about them. The UW needs to follow up with the broker to get this information, and then update the system when the broker responds.

**Current gap:** Controls are stored as markdown text in `bullet_point_summary`. There's no structured way to:
- Update individual control statuses
- Track where the updated information came from
- See rating impact of changes
- Maintain audit trail

## Proposed Solution

### Data Model

```sql
-- Structured controls with audit trail
CREATE TABLE submission_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES submissions(id),
    control_name TEXT NOT NULL,           -- e.g., "Phishing Training"
    control_category TEXT,                 -- e.g., "Authentication & Access"
    is_mandatory BOOLEAN DEFAULT false,

    -- Status: present, not_present, not_asked, pending_confirmation
    status TEXT NOT NULL DEFAULT 'not_asked',

    -- Source tracking
    source_type TEXT,                      -- 'extraction', 'email', 'synthetic', 'verbal'
    source_document_id UUID,               -- Link to document if applicable
    source_bbox JSONB,                     -- Bounding box if from document
    source_note TEXT,                      -- Required for verbal, optional for others
    source_text TEXT,                      -- The actual text that confirms/denies

    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by TEXT,                       -- User who made the change

    UNIQUE(submission_id, control_name)
);

-- History of changes for audit trail
CREATE TABLE submission_controls_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    control_id UUID REFERENCES submission_controls(id),
    previous_status TEXT,
    new_status TEXT,
    source_type TEXT,
    source_document_id UUID,
    source_note TEXT,
    changed_by TEXT,
    changed_at TIMESTAMPTZ DEFAULT now()
);
```

### Source Types

| Type | Description | Requirements | Evidence Strength |
|------|-------------|--------------|-------------------|
| `extraction` | Original application processing | Auto-populated | Strong |
| `email` | Broker email forwarded/uploaded | Document stored, bbox available | Strong |
| `synthetic` | Text pasted by UW from broker | Text stored as synthetic doc | Medium |
| `verbal` | Verbal confirmation (call, etc.) | Note required | Weak |

### Workflows

#### 1. Email Document Workflow (Preferred)

```
UW uploads broker email
    ↓
System stores as document (like application docs)
    ↓
AI scans email, knowing the "Not Asked" items to look for
    ↓
AI proposes updates with bbox citations:
    "Phishing Training: ✅ Present"
    Source: "yes, we do annual KnowBe4 training" (highlighted in doc)
    ↓
UW reviews and approves
    ↓
Controls updated, history logged, rating recalculated
```

#### 2. Pasted Text Workflow

```
UW clicks "Add Broker Response"
    ↓
Pastes text from email/message
    ↓
System creates "synthetic document" (text-only, no original file)
    ↓
AI parses text for control confirmations
    ↓
AI proposes updates (linked to synthetic doc)
    ↓
UW reviews and approves
    ↓
Controls updated, history logged
```

#### 3. Verbal Confirmation Workflow

```
UW clicks control item → "Update Status"
    ↓
Selects new status: ✅ Present / ❌ Not Present
    ↓
Selects source: "Verbal"
    ↓
Required note field:
    "Broker confirmed on 1/3/25 call - uses KnowBe4 annually"
    ↓
UW saves
    ↓
Control updated with verbal tag, history logged
```

### UI Components

#### Right Sidebar: Information Needed Widget

When there are "Not Asked" mandatory controls, show a sticky widget:

```
┌─────────────────────────────────────┐
│ ⚠️ Information Needed (7)           │
├─────────────────────────────────────┤
│ ☐ Phishing Training                 │
│ ☐ MFA Privileged Account Access     │
│ ☐ MFA Backups                       │
│ ☐ Offline Backups                   │
│ ☐ Offsite Backups                   │
│ ☐ Immutable Backups                 │
│ ☐ Encrypted Backups                 │
│                                     │
│ [+ Add Broker Response]             │
└─────────────────────────────────────┘
```

#### Broker Response Modal

```
┌─────────────────────────────────────────────────────┐
│ Add Broker Response                              ✕  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Source:                                             │
│ ○ Upload Email (.eml, .msg, .pdf)                  │
│ ● Paste Text                                        │
│ ○ Verbal Confirmation                               │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Hi Sarah,                                       │ │
│ │                                                 │ │
│ │ To answer your questions:                       │ │
│ │ - Yes, we have phishing training through       │ │
│ │   KnowBe4, done annually                        │ │
│ │ - MFA is required for all privileged accounts  │ │
│ │ - We don't currently have immutable backups    │ │
│ │   but are evaluating Veeam                     │ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│                              [Cancel] [Analyze]     │
└─────────────────────────────────────────────────────┘
```

#### AI Analysis Results

```
┌─────────────────────────────────────────────────────┐
│ Broker Response Analysis                         ✕  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ✅ Phishing Training → Present                      │
│    "phishing training through KnowBe4, annually"   │
│                                                     │
│ ✅ MFA Privileged Account Access → Present          │
│    "MFA is required for all privileged accounts"   │
│                                                     │
│ ❌ Immutable Backups → Not Present                  │
│    "don't currently have immutable backups"        │
│                                                     │
│ ⏳ MFA Backups → Not Addressed                      │
│    No mention in response                          │
│                                                     │
│ ⏳ Offline Backups → Not Addressed                  │
│    No mention in response                          │
│                                                     │
│ ───────────────────────────────────────────────── │
│ Rating Impact: Premium +2.3% (missing immutable)   │
│                                                     │
│                    [Edit] [Apply 3 Updates]         │
└─────────────────────────────────────────────────────┘
```

#### Audit Trail View

In control details or history:

```
Phishing Training
Status: ✅ Present

History:
─────────────────────────────────────────────────────
Jan 3, 2025 2:34 PM — Sarah Chen
Changed: ⚠️ Not Asked → ✅ Present
Source: Pasted broker response
"phishing training through KnowBe4, done annually"
[View Source Document]

Dec 28, 2024 9:15 AM — System
Initial extraction from application
Status: ⚠️ Not Asked (question not in application)
─────────────────────────────────────────────────────
```

### AI Prompt for Parsing Broker Response

```
You are analyzing a broker's response email to determine the status of specific
security controls.

Controls to look for (currently marked as "Not Asked"):
- Phishing Training
- MFA Privileged Account Access
- MFA Backups
- Offline Backups
- Offsite Backups
- Immutable Backups
- Encrypted Backups

For each control, determine:
1. Is it addressed in the response?
2. If yes, is it PRESENT (they have it) or NOT PRESENT (they don't)?
3. Quote the relevant text that supports your determination.

Response format:
{
  "controls": [
    {
      "name": "Phishing Training",
      "status": "present",  // present, not_present, not_addressed
      "confidence": "high", // high, medium, low
      "source_text": "yes, we have phishing training through KnowBe4, done annually"
    },
    ...
  ]
}

Broker Response:
{broker_text}
```

### Migration Path

1. **Phase 1:** Create `submission_controls` table, populate from existing `bullet_point_summary` parsing
2. **Phase 2:** Add "Information Needed" widget to sidebar (read-only display)
3. **Phase 3:** Add "Add Broker Response" flow with AI parsing
4. **Phase 4:** Add verbal confirmation flow
5. **Phase 5:** Add audit trail UI
6. **Phase 6:** Integrate with rating engine (control changes affect premium)

### Open Questions

1. Should "Not Addressed" items auto-generate a follow-up prompt to ask broker again?
2. Should there be a "Request from Broker" button that drafts an email?
3. How to handle partial confirmations ("we're implementing this next quarter")?
4. Should controls have expiration/re-verification dates for renewals?
