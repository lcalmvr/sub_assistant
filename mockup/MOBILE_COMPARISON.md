# Mobile Translation: Current Setup vs Mockup

## Current Setup Page Structure

### Desktop Layout
```
┌─────────────────────────────────────────────────────────┐
│ HeaderBar: [Docs] [Extract] [Required] [Conflicts]     │
│           [📋 doc1.pdf] [📄 doc2.pdf] [📧 doc3.txt] [+]│
├──────────────────────┬──────────────────────────────────┤
│                      │                                  │
│  Left Panel          │      PDF Viewer                 │
│  (Extractions/       │      (Full Width)                │
│   Required/          │                                  │
│   Conflicts)         │                                  │
│                      │                                  │
└──────────────────────┴──────────────────────────────────┘
```

**Key Features:**
- Documents shown as **horizontal chips** in header bar
- Header bar wraps to multiple lines if needed
- Split screen: Left panel (2fr) + PDF (3fr)
- Single screen: PDF only (full width)

---

## Mockup Structure

### Desktop Layout
```
┌─────────────────────────────────────────────────────────┐
│ Global Nav: Underwriting Portal / Moog Inc             │
├─────────────────────────────────────────────────────────┤
│ Context Header: Company Info | Broker | Actions        │
│ Tabs: [Setup] [Analyze] [Quote] [Policy]               │
├──────────┬──────────────────────────────────────────────┤
│          │ Action Bar: [Extract Data] [Mark Reviewed]   │
│ Docs     ├──────────────────────────────────────────────┤
│ Sidebar  │                                              │
│          │      PDF Viewer                              │
│ [Active] │                                              │
│ [Inact]  │                                              │
│ [Inact]  │                                              │
│          │                                              │
│ Progress │                                              │
└──────────┴──────────────────────────────────────────────┘
```

**Key Features:**
- Documents shown as **vertical list** in left sidebar
- Always-visible sidebar (256px wide)
- Context header with company/broker info
- Tab navigation for stages

---

## Mobile Translation Comparison

### Current Setup → Mobile

#### Challenges:
1. **Horizontal document chips** become cramped
   - Chips wrap to multiple rows
   - Hard to see all documents at once
   - Requires scrolling horizontally or wrapping

2. **Header bar gets crowded**
   - Mode buttons + document chips compete for space
   - Expand/collapse toggle needed for wrapped docs

3. **Split screen doesn't work**
   - Left panel + PDF side-by-side is too narrow
   - Would need to stack vertically or use modals/drawers

#### Mobile Adaptation Strategy:
```jsx
// Mobile: Stack everything vertically
<div className="flex flex-col md:grid md:grid-cols-[2fr_3fr]">
  {/* Mobile: Full-width mode selector */}
  <div className="md:hidden">
    <select onChange={setViewMode}>
      <option>Docs</option>
      <option>Extract</option>
      <option>Required</option>
    </select>
  </div>
  
  {/* Mobile: Horizontal scrollable doc chips */}
  <div className="md:hidden overflow-x-auto">
    {documents.map(doc => <Chip />)}
  </div>
  
  {/* Mobile: Full-width left panel OR drawer */}
  {isSplitScreen && (
    <div className="md:block">
      {/* Could be a bottom sheet or full-screen overlay */}
    </div>
  )}
  
  {/* PDF always full-width on mobile */}
  <div className="w-full">
    <PdfViewer />
  </div>
</div>
```

**Mobile UX:**
- Documents: Horizontal scrollable chips (better than wrapping)
- Left panel: Bottom sheet or full-screen overlay
- PDF: Always full-width
- Mode switching: Dropdown or bottom nav

---

### Mockup → Mobile

#### Advantages:
1. **Vertical sidebar** translates naturally
   - Becomes a **bottom sheet** or **drawer**
   - Easy to swipe up/down
   - All documents visible in one scrollable list

2. **Context header** can collapse
   - Company info → compact single line
   - Broker info → icon + name only
   - Tabs → bottom navigation bar

3. **Single-column layout** works well
   - PDF takes full width
   - Document list accessible via drawer/sheet

#### Mobile Adaptation Strategy:
```jsx
// Mobile: Bottom sheet for documents
<div className="flex flex-col h-screen">
  {/* Compact header */}
  <header className="md:block">
    <h1>Moog Inc</h1>
    <Tabs /> {/* Becomes bottom nav on mobile */}
  </header>
  
  {/* PDF viewer - full width */}
  <main className="flex-1">
    <PdfViewer />
  </main>
  
  {/* Mobile: Floating button to open doc drawer */}
  <button 
    className="md:hidden fixed bottom-4 right-4"
    onClick={openDrawer}
  >
    📄 Documents (3)
  </button>
  
  {/* Drawer/Sidebar */}
  <Drawer open={isOpen} onClose={closeDrawer}>
    <DocumentList />
  </Drawer>
</div>
```

**Mobile UX:**
- Documents: Bottom sheet or slide-out drawer
- Context: Collapsible header
- Tabs: Bottom navigation (iOS/Android pattern)
- PDF: Full-width, always visible

---

## Side-by-Side Mobile Comparison

| Aspect | Current Setup | Mockup |
|--------|--------------|--------|
| **Document Selection** | Horizontal chips (wrap/scroll) | Bottom sheet/drawer |
| **Document Visibility** | Limited (chips truncate) | Full list in drawer |
| **Context Info** | Summary card (collapsible) | Compact header |
| **Mode Switching** | Header buttons → Dropdown | Tabs → Bottom nav |
| **Left Panel** | Bottom sheet/overlay | Same (drawer) |
| **PDF Viewing** | Full-width | Full-width |
| **Navigation** | Top header | Bottom nav (tabs) |

---

## Recommendations

### For Mobile-First Design:

**Mockup approach is better because:**
1. ✅ Vertical list → drawer is a standard mobile pattern
2. ✅ Bottom navigation for tabs (familiar iOS/Android UX)
3. ✅ More space for document metadata (type, date, status)
4. ✅ Easier to show document progress/status
5. ✅ Better for accessibility (larger touch targets)

**Current approach advantages:**
1. ✅ Documents always visible (no drawer to open)
2. ✅ Faster document switching (no drawer animation)
3. ✅ Less vertical space used on desktop

### Hybrid Approach (Best of Both):

```jsx
// Desktop: Sidebar (like mockup)
// Mobile: Bottom sheet (like mockup)
// Tablet: Horizontal chips (like current) OR sidebar

const DocumentSelector = () => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  
  if (isMobile) {
    return <BottomSheet><DocumentList /></BottomSheet>;
  }
  
  if (isTablet) {
    return <HorizontalChips documents={docs} />;
  }
  
  return <Sidebar><DocumentList /></Sidebar>;
};
```

---

## Code Example: Mobile-Responsive Mockup

```jsx
const UnderwritingPortal = () => {
  const [activeTab, setActiveTab] = useState('Setup');
  const [docDrawerOpen, setDocDrawerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Desktop: Full header, Mobile: Compact */}
      <header className="hidden md:block bg-white border-b">
        {/* Full context header */}
      </header>
      
      <header className="md:hidden bg-white border-b px-4 py-2">
        <h1 className="text-lg font-bold">Moog Inc</h1>
        <p className="text-xs text-gray-500">ID: 336414</p>
      </header>
      
      {/* Desktop: Sidebar, Mobile: Drawer */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-64 bg-white border-r flex-col">
          <DocumentList />
        </aside>
        
        {/* Mobile: Floating button */}
        <button
          className="md:hidden fixed bottom-4 right-4 bg-purple-600 text-white p-4 rounded-full shadow-lg z-50"
          onClick={() => setDocDrawerOpen(true)}
        >
          <FileText size={24} />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            3
          </span>
        </button>
        
        {/* Main content */}
        <main className="flex-1 flex flex-col">
          <PdfViewer document={selectedDoc} />
        </main>
      </div>
      
      {/* Mobile: Bottom navigation for tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around">
        {['Setup', 'Analyze', 'Quote', 'Policy'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm ${
              activeTab === tab ? 'text-purple-600' : 'text-gray-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>
      
      {/* Mobile: Document drawer */}
      <Drawer
        open={docDrawerOpen}
        onClose={() => setDocDrawerOpen(false)}
        position="bottom"
        className="md:hidden"
      >
        <DocumentList
          onSelect={(doc) => {
            setSelectedDoc(doc);
            setDocDrawerOpen(false);
          }}
        />
      </Drawer>
    </div>
  );
};
```

---

## Summary

**Current Setup:**
- Desktop: ✅ Efficient use of space
- Mobile: ⚠️ Horizontal chips are cramped, requires wrapping/scroll

**Mockup:**
- Desktop: ✅ Better document visibility, cleaner layout
- Mobile: ✅ Natural translation to drawer/bottom sheet pattern

**Recommendation:** The mockup structure translates better to mobile because vertical lists → drawers are a standard mobile pattern, while horizontal chips require horizontal scrolling or wrapping which is less ideal.


