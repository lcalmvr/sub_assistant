# Underwriting Portal Mockup

This is a standalone mockup of the Underwriting Portal component, completely isolated from the main project.

## Quick Start

1. Install dependencies:
```bash
cd mockup
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open your browser to the URL shown (typically `http://localhost:5173`)

4. **To switch between versions**: Edit `src/main.jsx` and change the `VERSION` constant:
   - `'original'` - Original sidebar layout
   - `'v2'` - 3-column layout with extraction mode and conflicts panel
   - `'analyze'` - Analyze page with case file and workbench layout
   - `'analyze2'` - Analyze page with interactive pricing matrix and slide-over comps modal
   - `'workflow'` - Linear workflow navigation with step-by-step progression
   - `'quote'` - Quote setup page with tower visualizer and endorsement toggles
   - `'quote2'` - Quote matrix design with functional structure editor and assignment matrix
   - `'quote3'` - Split-view matrix design with left panel quote selector and tabbed right panel (includes policy dates, retro schedule, enhancements)
   - `'quote4'` - Dashboard overview design with quote cards grid and expandable detail panel (includes policy dates, retro schedule, enhancements)
- **`'quote5'` - "Command Center" - Browser-tab style quote selector + persistent cross-option matrix sidebar (NEW)**
- **`'quote6'` - "Split Comparison" - Side-by-side diff view with visual highlighting + bulk actions toolbar (NEW)**
- **`'quote7'` - "Workflow Ledger" - Guided validation workflow with cross-option rail and document pulse (NEW)**
- **`'quote8'` - "Status Board" - Quote options organized by status with right-side inspector (NEW)**
- **`'quote9'` - "Matrix Only" - Mid-density cross-option matrix for focused evaluation (NEW)**
- **`'quote10'` - "Matrix Dense" - Extra-dense cross-option matrix (NEW)**
- **`'quote11'` - "Config Refined" - Structure defaults sidebar + variations table + scope toggles (NEW)**
   - `'mobile'` - Mobile-responsive drawer layout

## Features

- React 18 with Vite for fast development
- Tailwind CSS for styling
- Lucide React icons
- Fully isolated from the main project
- **Desktop version** (`App.jsx`) - Sidebar layout
- **Desktop version 2** (`App2.jsx`) - 3-column layout with extraction mode and conflicts panel
- **Analyze page** (`AppAnalyze.jsx`) - Analyze tab with case file and workbench layout
- **Analyze page v2** (`AppAnalyze2.jsx`) - Interactive pricing matrix with slide-over comparable analysis modal
- **Workflow navigation** (`AppWorkflow.jsx`) - Linear workflow stepper with step-by-step progression
- **Quote setup** (`AppQuote.jsx`) - Quote configuration with tower visualizer and endorsement toggles
- **Quote setup v2** (`AppQuote2.jsx`) - Quote matrix design with functional structure editor and assignment matrix
- **Quote setup v3** (`AppQuote3.jsx`) - Split-view matrix design with left panel quote selector and tabbed right panel. Includes policy dates (with "12 month policy period" option), retro schedule editor, enhancements & modifications panel, and assignment matrix
- **Quote setup v4** (`AppQuote4.jsx`) - Dashboard overview design with quote cards grid and expandable detail panel. Includes policy dates, retro schedule editor, enhancements & modifications panel, and right sidebar quick reference
- **Quote setup v5** (`AppQuote5.jsx`) - "Command Center" design with browser-tab style quote option selector. Features:
  - Quote options as horizontal tabs (always visible, like browser tabs)
  - Persistent right sidebar showing cross-option assignment matrix
  - Premium summary with Technical/Risk-Adjusted/Sold distinction
  - Tower structure with quota share support and visual warnings
  - Enhancements with auto-attach endorsement linking
  - Full document generation options (Quote Only vs Full Package)
- **Quote setup v6** (`AppQuote6.jsx`) - "Split Comparison" design for side-by-side diff viewing. Features:
  - Split-pane view: edit one quote while viewing another side-by-side
  - Visual diff highlighting (amber for compare, purple for primary)
  - Bulk action toolbar for cross-option operations (sync settings, copy endorsements)
  - Matrix view overlay for full cross-option checkbox grid
  - Comparison indicators showing "Only in this option" / "Only in compare"
- **Quote setup v7** (`AppQuote7.jsx`) - "Workflow Ledger" design with a validation-first flow. Features:
  - Guided bind readiness panel with errors and warnings
  - Main workspace with tower, policy, coverage, assignments, enhancements, documents
  - Cross-option rail for matrix access and workflow status
  - Document pulse panel for recent outputs
- **Quote setup v8** (`AppQuote8.jsx`) - "Status Board" layout. Features:
  - Options organized by Draft / Quoted / Bound columns
  - Right-side inspector with Structure, Policy, Assignments, and Docs tabs
  - Bind readiness card plus document timeline
  - Cross-option tool shortcuts for batch edits and extraction
- **Quote setup v9** (`AppQuote9.jsx`) - "Matrix Only" layout. Features:
  - Mid-density grid with sticky headers and item column
  - Filters for required, auto, and differences only
  - Category tabs for Endorsements, Subjectivities, Coverages
  - Clear ON/OFF assignment cells per option
- **Quote setup v10** (`AppQuote10.jsx`) - "Matrix Dense" layout. Features:
  - Tighter column widths and compact row height
  - Smaller labels and chips for fast scanning
  - Same filters and tabs as v9 with reduced chrome
- **Quote setup v11** (`AppQuote11.jsx`) - "Config Refined" layout. Features:
  - Structure defaults sidebar with "Applies to All" settings (retroactive date, commission, standard subjectivities)
  - Visual tower position confirmation in sidebar
  - Variations table showing pricing and overrides (with visual indicators for overridden defaults)
  - Scope toggle matrix solving the "2 out of 3" problem with direct action buttons
  - Global vs custom scope indicators for endorsements/subjectivities
  - "Add Global" button for items that apply to all variations
- **Mobile version** (`AppMobile.jsx`) - Drawer/bottom sheet layout
- **Comparison document** (`MOBILE_COMPARISON.md`) - Detailed analysis

## Project Structure

```
mockup/
├── src/
│   ├── App.jsx          # Main UnderwritingPortal component
│   ├── main.jsx         # React entry point
│   └── index.css        # Tailwind imports
├── index.html           # HTML entry point
├── package.json         # Dependencies
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind configuration
└── postcss.config.js    # PostCSS configuration
```

This mockup is completely separate from your main project and can be safely deleted or modified without affecting anything else.
