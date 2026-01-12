import React, { useMemo, useState } from 'react';
import {
  Filter,
  Layers,
  Lock,
  Search,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

/**
 * AppQuote9 - "Matrix Only" Mid-Density View
 * Focuses exclusively on the cross-option matrix for fast evaluation.
 */
const QuoteMatrixMid = () => {
  const [activeCategory, setActiveCategory] = useState('endorsements');
  const [showRequiredOnly, setShowRequiredOnly] = useState(false);
  const [showAutoOnly, setShowAutoOnly] = useState(false);
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  const options = [
    { id: 1, name: '$5M xs $5M', descriptor: 'Standard Annual', status: 'quoted' },
    { id: 2, name: '$5M xs $5M', descriptor: '18 Month ODDL', status: 'draft' },
    { id: 3, name: '$2M x $25K', descriptor: 'Primary Option', status: 'draft' },
  ];

  const categories = {
    endorsements: {
      label: 'Endorsements',
      items: [
        { id: 1, name: 'War and Terrorism Exclusion', code: 'END-WAR-001', required: true, auto: false, assignedTo: [1, 2, 3] },
        { id: 2, name: 'OFAC Sanctions Compliance', code: 'END-OFAC-001', required: true, auto: false, assignedTo: [1, 2, 3] },
        { id: 3, name: 'Additional Insured Schedule', code: 'END-AI-001', required: false, auto: true, assignedTo: [1] },
        { id: 4, name: 'Modified ERP Terms', code: 'END-ERP-001', required: false, auto: true, assignedTo: [2] },
        { id: 5, name: 'Biometric Exclusion', code: 'END-BIO-001', required: false, auto: false, assignedTo: [2] },
        { id: 6, name: 'Tech E and O Extension', code: 'END-TEO-001', required: false, auto: false, assignedTo: [1, 2] },
      ],
    },
    subjectivities: {
      label: 'Subjectivities',
      items: [
        { id: 1, name: 'Signed application', required: false, auto: true, assignedTo: [1, 2, 3] },
        { id: 2, name: 'Copy of underlying policies', required: false, auto: true, assignedTo: [1, 2] },
        { id: 3, name: 'Year 2 financials (extended term)', required: false, auto: false, assignedTo: [2] },
        { id: 4, name: 'Prior acts warranty', required: false, auto: false, assignedTo: [3] },
      ],
    },
    coverages: {
      label: 'Coverages',
      items: [
        { id: 1, name: 'Social engineering', required: false, auto: false, assignedTo: [1, 2, 3] },
        { id: 2, name: 'Media liability', required: false, auto: false, assignedTo: [1, 2] },
        { id: 3, name: 'Privacy liability', required: false, auto: false, assignedTo: [2, 3] },
        { id: 4, name: 'System failure', required: false, auto: false, assignedTo: [1, 3] },
        { id: 5, name: 'Regulatory defense', required: false, auto: false, assignedTo: [1, 2, 3] },
      ],
    },
  };

  const activeItems = useMemo(() => {
    const items = categories[activeCategory].items;
    return items.filter((item) => {
      if (showRequiredOnly && !item.required) return false;
      if (showAutoOnly && !item.auto) return false;
      if (showDiffOnly && item.assignedTo.length === options.length) return false;
      return true;
    });
  }, [activeCategory, showRequiredOnly, showAutoOnly, showDiffOnly, options.length, categories]);

  const gridColumns = `220px repeat(${options.length}, minmax(140px, 1fr))`;

  return (
    <div
      className="matrix-mid min-h-screen text-slate-900"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Newsreader:wght@500;700&display=swap');
        .matrix-mid { --ink: #0f172a; --accent: #0ea5a6; --accent-soft: rgba(14, 165, 166, 0.12); --warm: #f97316; --surface: rgba(255,255,255,0.88); --border: rgba(15, 23, 42, 0.08); }
        .matrix-bg { background: radial-gradient(circle at top left, rgba(14,165,166,0.16), transparent 55%), radial-gradient(circle at bottom right, rgba(249,115,22,0.12), transparent 50%), #f8fafc; }
        .matrix-card { background: var(--surface); border: 1px solid var(--border); border-radius: 24px; box-shadow: 0 16px 30px rgba(15,23,42,0.06); }
        .matrix-grid { display: grid; grid-template-columns: ${gridColumns}; }
        .matrix-head { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); }
        .matrix-row { border-top: 1px solid rgba(15, 23, 42, 0.06); }
        .matrix-item { position: sticky; left: 0; z-index: 5; background: rgba(255,255,255,0.95); }
        .fade-in { animation: fadeIn 0.6s ease both; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="matrix-bg min-h-screen">
        <header className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Cross option matrix</p>
            <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "'Newsreader', serif" }}>
              Quote Option Assignments
            </h1>
            <p className="text-sm text-slate-500">Mid density grid with quick filters and diff focus.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
              {options.length} options
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
              {categories[activeCategory].items.length} items
            </span>
            <button className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600">
              Export matrix
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 pb-8">
          <div className="matrix-card p-4 fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                {Object.entries(categories).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => setActiveCategory(key)}
                    className={`rounded-full px-4 py-2 ${
                      activeCategory === key
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {value.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  <Search size={14} className="text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search items"
                    className="w-32 bg-transparent text-xs text-slate-600 outline-none"
                  />
                </div>
                <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600">
                  <Filter size={14} className="mr-2 inline" /> Filters
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <button
                onClick={() => setShowRequiredOnly(!showRequiredOnly)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
                  showRequiredOnly ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-slate-200'
                }`}
              >
                {showRequiredOnly ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                Required only
              </button>
              <button
                onClick={() => setShowAutoOnly(!showAutoOnly)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
                  showAutoOnly ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-slate-200'
                }`}
              >
                {showAutoOnly ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                Auto only
              </button>
              <button
                onClick={() => setShowDiffOnly(!showDiffOnly)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
                  showDiffOnly ? 'border-[var(--warm)] text-[var(--warm)]' : 'border-slate-200'
                }`}
              >
                {showDiffOnly ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                Only differences
              </button>
              <span className="ml-auto inline-flex items-center gap-2 text-xs text-slate-400">
                <SlidersHorizontal size={14} /> Batch edit
              </span>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
              <div className="matrix-grid min-w-[700px]">
                <div className="matrix-head matrix-item px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  {categories[activeCategory].label}
                </div>
                {options.map((option) => (
                  <div
                    key={option.id}
                    className="matrix-head border-l border-slate-100 px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-slate-800">{option.name}</p>
                    <p className="text-[10px] text-slate-400">{option.descriptor}</p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        option.status === 'quoted'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {option.status}
                    </span>
                  </div>
                ))}

                <div className="matrix-row col-span-full bg-slate-50/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {categories[activeCategory].label} ({activeItems.length})
                </div>

                {activeItems.map((item) => (
                  <React.Fragment key={item.id}>
                    <div className="matrix-row matrix-item px-3 py-2">
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5 text-slate-400">
                          {item.required ? <Lock size={14} /> : item.auto ? <Sparkles size={14} /> : <Layers size={14} />}
                        </div>
                        <div>
                          {item.code && (
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{item.code}</p>
                          )}
                          <p className="text-xs font-semibold text-slate-700">{item.name}</p>
                          <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-400">
                            {item.required && <span className="rounded-full bg-slate-100 px-2 py-0.5">Required</span>}
                            {item.auto && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Auto</span>}
                            {!item.required && !item.auto && <span className="rounded-full bg-slate-100 px-2 py-0.5">Optional</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    {options.map((option) => {
                      const isOn = item.assignedTo.includes(option.id);
                      return (
                        <div
                          key={`${item.id}-${option.id}`}
                          className={`matrix-row border-l border-slate-100 px-3 py-2 ${
                            isOn ? 'bg-[var(--accent-soft)]' : 'bg-white'
                          }`}
                        >
                          <button
                            className={`flex w-full items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold ${
                              isOn
                                ? 'border-[var(--accent)] text-[var(--accent)]'
                                : 'border-slate-200 text-slate-400'
                            }`}
                          >
                            {isOn ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Required items are locked.</span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Auto items follow enhancements.</span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Use batch edit to sync changes.</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default QuoteMatrixMid;
