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
   - `'mobile'` - Mobile-responsive drawer layout

## Features

- React 18 with Vite for fast development
- Tailwind CSS for styling
- Lucide React icons
- Fully isolated from the main project
- **Desktop version** (`App.jsx`) - Sidebar layout
- **Desktop version 2** (`App2.jsx`) - 3-column layout with extraction mode and conflicts panel
- **Analyze page** (`AppAnalyze.jsx`) - Analyze tab with case file and workbench layout
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

