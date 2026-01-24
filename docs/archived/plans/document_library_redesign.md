# Document Library Redesign Options

## Current Problem

The Quill rich text editor cannot properly edit complex document structures:
- Tables render as plain text lines in editor, but display correctly in preview
- Blockquotes styling differs between editor and preview
- Legal/product experts cannot reliably edit documents and predict output

## Option 1: Component-Based Architecture (Recommended)

### Concept

Standardize endorsement structure into reusable components. Legal experts draft content in Word (their comfort zone), upload it, and AI extracts/assembles the pieces.

### Components

```
┌─────────────────────────────────────┐
│         STANDARD HEADER             │  ← Company branding, endorsement
│   (logo, company name, form #)      │     number placeholder
├─────────────────────────────────────┤
│         STANDARD OPENING            │  ← Consistent legal opening
│   "This endorsement modifies the    │     (editable in one place)
│    insurance provided under the     │
│    policy to which it is attached." │
├─────────────────────────────────────┤
│         ENDORSEMENT BODY            │  ← Extracted from Word upload
│   - Title/Heading                   │     (unique per endorsement)
│   - Content sections                │
│   - Tables, lists, etc.             │
├─────────────────────────────────────┤
│         STANDARD CLOSING            │  ← Signature block, effective
│   Effective Date: [DATE]            │     date, policy reference
│   Policy Number: [POLICY_NUMBER]    │
│   All other terms unchanged.        │
└─────────────────────────────────────┘
```

### Database Schema Changes

```sql
-- Standard components (one of each type)
CREATE TABLE document_components (
    id UUID PRIMARY KEY,
    component_type TEXT NOT NULL,  -- 'header', 'opening', 'closing'
    name TEXT NOT NULL,            -- 'Default Header', 'Excess Header'
    content_html TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Modify document_library to store only the body
ALTER TABLE document_library
    ADD COLUMN body_html TEXT,           -- Just the unique content
    ADD COLUMN header_component_id UUID REFERENCES document_components(id),
    ADD COLUMN opening_component_id UUID REFERENCES document_components(id),
    ADD COLUMN closing_component_id UUID REFERENCES document_components(id),
    ADD COLUMN source_file_url TEXT;     -- Original Word doc
```

### Workflow

1. **Admin Setup** (one-time)
   - Create standard header component (with company branding)
   - Create standard opening line(s)
   - Create standard closing block(s)

2. **Endorsement Creation**
   - Legal expert drafts endorsement in Word
   - Includes heading and content only (no header/opening/closing)
   - Uploads Word file to document library

3. **AI Processing**
   - Extracts heading from Word doc
   - Extracts body content (preserves tables, lists, formatting)
   - Converts to clean HTML
   - Stores body separately from standard components

4. **Rendering**
   - At PDF generation time, assembles: header + opening + body + closing
   - Placeholders filled with policy data

### Benefits

- **Bulk updates**: Change header once, all endorsements update
- **Consistency**: Opening/closing language always correct
- **Familiar tools**: Legal works in Word
- **Version control**: Track which component versions were used
- **Flexibility**: Different headers for primary vs excess policies

### Implementation Steps

1. Create `document_components` table
2. Build component management UI (simple - just a few records)
3. Add Word upload endpoint with AI extraction
4. Modify PDF generator to assemble components
5. Migrate existing endorsements (extract body from full content)

---

## Option 2: Better WYSIWYG Editor

### Concept

Replace streamlit-quill with TinyMCE via `st-tiny-editor` package.

### Package

```bash
pip install st-tiny-editor
```

### Code Change

```python
# In rich_text_editor.py

from st_tiny_editor import st_tiny_editor

def render_rich_text_editor(
    initial_content: str = "",
    key: str = "rich_text_editor",
    height: int = 400
) -> str:
    """Render TinyMCE editor with table support."""

    content = st_tiny_editor(
        value=initial_content,
        key=key,
        height=height,
        toolbar="""
            undo redo | blocks fontfamily fontsize |
            bold italic underline strikethrough |
            table | align lineheight |
            numlist bullist indent outdent |
            removeformat
        """,
        plugins="table lists link"
    )

    return content or ""
```

### Benefits

- Quick to implement (swap one component)
- Full table support in editor
- WYSIWYG - what you see matches output
- Paste from Word support

### Drawbacks

- Users still need to learn an editor interface
- No bulk update capability for standard elements
- Each endorsement is a standalone blob of HTML
- Inconsistency risk if users edit opening/closing text

### Resources

- [st-tiny-editor on PyPI](https://pypi.org/project/st-tiny-editor/)
- [TinyMCE Documentation](https://www.tiny.cloud/)

---

## Recommendation

**Start with Option 1 (Component-Based Architecture)** because:

1. Legal experts already work in Word - no training needed
2. Enables bulk updates for compliance changes
3. Enforces consistency across all documents
4. Better separation of concerns (standard vs unique content)
5. AI extraction is a one-time cost per document

Option 2 is a quick fix but doesn't solve the underlying workflow problem of non-technical users needing to create complex formatted documents.

---

## Future Considerations

- **Template variants**: Different openings for different states/jurisdictions
- **Approval workflow**: Draft → Review → Approved status for components
- **Version history**: Track changes to standard components over time
- **Preview mode**: Show assembled document before saving
- **Batch re-render**: When component changes, queue affected documents for re-generation
