import React, { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Filter,
  Layers,
  Link2,
  Plus,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  UserCheck,
} from 'lucide-react';

/**
 * AppQuote8 - "Status Board + Inspector"
 * Organizes quote options by status with a right-side inspector for full edit access.
 */
const QuoteStatusBoard = () => {
  const [selectedQuoteId, setSelectedQuoteId] = useState(2);
  const [activeTab, setActiveTab] = useState('structure');

  const quotes = [
    {
      id: 1,
      name: '$5M xs $5M',
      descriptor: 'Standard Annual',
      position: 'excess',
      status: 'quoted',
      premium: 52500,
      limit: 5000000,
      retention: 5000000,
      policyForm: 'FF-CYBER-2024',
    },
    {
      id: 2,
      name: '$5M xs $5M',
      descriptor: '18 Month ODDL',
      position: 'excess',
      status: 'draft',
      premium: 78750,
      limit: 5000000,
      retention: 5000000,
      policyForm: 'FF-CYBER-2024',
    },
    {
      id: 3,
      name: '$2M x $25K',
      descriptor: 'Primary Option',
      position: 'primary',
      status: 'draft',
      premium: 38500,
      limit: 2000000,
      retention: 25000,
      policyForm: 'CM-CYBER-2024',
    },
    {
      id: 4,
      name: '$3M x $50K',
      descriptor: 'Bound Option',
      position: 'primary',
      status: 'bound',
      premium: 46000,
      limit: 3000000,
      retention: 50000,
      policyForm: 'CM-CYBER-2024',
    },
  ];

  const statusColumns = [
    { key: 'draft', label: 'Draft', accent: 'bg-slate-100 text-slate-600' },
    { key: 'quoted', label: 'Quoted', accent: 'bg-blue-100 text-blue-700' },
    { key: 'bound', label: 'Bound', accent: 'bg-blue-200 text-blue-800' },
  ];

  const selectedQuote = quotes.find((q) => q.id === selectedQuoteId) || quotes[0];

  const towerLayers = selectedQuote.position === 'excess'
    ? [
        { id: 1, carrier: 'TBD', limit: '$10M', attach: '$10M', qs: null },
        { id: 2, carrier: 'CMAI', limit: '$2.5M', attach: '$5M', qs: '$5M' },
        { id: 3, carrier: 'Partner Re', limit: '$2.5M', attach: '$5M', qs: '$5M' },
        { id: 4, carrier: 'Beazley', limit: '$5M', attach: '$0', qs: null },
      ]
    : [
        { id: 1, carrier: 'CMAI', limit: '$2M', attach: '$25K', qs: null },
      ];

  const subjectivities = [
    { id: 1, text: 'Signed application', status: 'received', assignedTo: [1, 2, 3, 4] },
    { id: 2, text: 'Copy of underlying policies', status: 'pending', assignedTo: [1, 2] },
    { id: 3, text: 'Year 2 financials', status: 'pending', assignedTo: [2] },
  ];

  const endorsements = [
    { id: 1, code: 'END-WAR-001', name: 'War and Terrorism Exclusion', type: 'required', assignedTo: [1, 2, 3, 4] },
    { id: 2, code: 'END-OFAC-001', name: 'OFAC Sanctions Compliance', type: 'required', assignedTo: [1, 2, 3, 4] },
    { id: 3, code: 'END-AI-001', name: 'Additional Insured Schedule', type: 'auto', assignedTo: [1] },
    { id: 4, code: 'END-ERP-001', name: 'Modified ERP Terms', type: 'auto', assignedTo: [2] },
  ];

  const documents = [
    { id: 1, name: 'Quote - $5M xs $5M', type: 'Quote', date: 'Mar 12', status: 'Sent' },
    { id: 2, name: 'Package - Quote + Endorsements', type: 'Package', date: 'Mar 12', status: 'Ready' },
    { id: 3, name: 'Binder Draft', type: 'Binder', date: 'Mar 13', status: 'Draft' },
  ];

  return (
    <div
      className="quote-board relative min-h-screen overflow-hidden text-slate-900"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@500;700&display=swap');
        .quote-board {
          --accent: #2563eb;
          --accent-dark: #1d4ed8;
          background: linear-gradient(180deg, #e0f2fe 0%, #f1f5f9 48%, #e2e8f0 100%);
        }
        .slide-in { animation: slideIn 0.5s ease both; }
        .stagger-1 { animation-delay: 0.05s; }
        .stagger-2 { animation-delay: 0.1s; }
        .stagger-3 { animation-delay: 0.15s; }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div className="pointer-events-none absolute -top-20 left-1/4 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-blue-100/30 blur-3xl" />

      <header className="relative z-10 border-b border-slate-200/70 bg-slate-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Quote board</p>
            <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "'IBM Plex Serif', serif" }}>
              Karbon Steel Industries
            </h1>
            <p className="text-sm text-slate-500">$5.0B Revenue - Tech Manufacturing - Renewal</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <Filter size={14} className="mr-2 inline" /> Filter options
            </button>
            <button className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <Download size={14} className="mr-2 inline" /> Generate
            </button>
            <button className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white">
              <Plus size={14} className="mr-2 inline" /> New option
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1500px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-12">
        <section className="lg:col-span-8 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {statusColumns.map((column) => (
              <div key={column.key} className="slide-in rounded-3xl border border-slate-200/70 bg-slate-50/90 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${column.accent}`}>
                    {column.label.toUpperCase()}
                  </span>
                  <button className="text-xs text-slate-400">Manage</button>
                </div>
                <div className="mt-3 space-y-3">
                  {quotes.filter((q) => q.status === column.key).map((quote, idx) => (
                    <button
                      key={quote.id}
                      onClick={() => setSelectedQuoteId(quote.id)}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition-all ${
                        selectedQuoteId === quote.id
                          ? 'border-[var(--accent)] bg-white shadow-sm'
                          : 'border-slate-100 bg-white'
                      } stagger-${idx + 1}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                            {quote.position === 'excess' ? 'Excess' : 'Primary'}
                          </p>
                          <h3 className="text-base font-semibold text-slate-800">{quote.name}</h3>
                          <p className="text-xs text-slate-500">{quote.descriptor}</p>
                        </div>
                        <span className="text-sm font-semibold text-slate-800">${quote.premium.toLocaleString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Selected option</p>
                <h2 className="text-2xl font-semibold text-slate-900">{selectedQuote.name}</h2>
                <p className="text-sm text-slate-500">{selectedQuote.descriptor} - {selectedQuote.policyForm}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  <Copy size={14} className="mr-2 inline" /> Clone
                </button>
                <button className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white">
                  <UserCheck size={14} className="mr-2 inline" /> Bind
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
              {['structure', 'policy', 'assignments', 'docs'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-4 py-1.5 ${
                    activeTab === tab
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="mt-5">
              {activeTab === 'structure' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    <AlertTriangle size={14} className="mr-2 inline" /> Tower validation required - quota share incomplete.
                  </div>
                  <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                    <span>Carrier</span>
                    <span>Limit</span>
                    <span>Attach</span>
                    <span>QS</span>
                  </div>
                  {towerLayers.map((layer) => (
                    <div
                      key={layer.id}
                      className={`grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 rounded-2xl border px-3 py-2 text-sm ${
                        layer.carrier === 'CMAI'
                          ? 'border-[var(--accent)] bg-blue-50'
                          : 'border-slate-100 bg-white'
                      }`}
                    >
                      <span className="font-semibold text-slate-700">{layer.carrier}</span>
                      <span>{layer.limit}</span>
                      <span>{layer.attach}</span>
                      <span className="text-xs text-slate-500">{layer.qs || '--'}</span>
                    </div>
                  ))}
                  <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-500 hover:border-[var(--accent)] hover:text-[var(--accent)]">
                    <Layers size={16} /> Add underlying layer
                  </button>
                </div>
              )}

              {activeTab === 'policy' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Policy dates</p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">12 month policy period</p>
                    <button className="mt-3 text-xs font-semibold text-[var(--accent-dark)]">Set specific dates</button>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Retro schedule</p>
                    <div className="mt-2 space-y-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>Cyber liability</span>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Full prior acts</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Privacy liability</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Inception</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Coverage schedule</p>
                      <button className="text-xs font-semibold text-[var(--accent-dark)]">Apply to all</button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                      {['Social engineering', 'System failure', 'Media liability', 'Reg defense'].map((item) => (
                        <span key={item} className="rounded-full bg-slate-100 px-3 py-1">{item}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'assignments' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Subjectivities</p>
                      <button className="text-xs font-semibold text-[var(--accent-dark)]">Add</button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {subjectivities.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span>{item.text}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.status === 'received'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Endorsements</p>
                      <button className="text-xs font-semibold text-[var(--accent-dark)]">Add</button>
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      {endorsements.map((item) => (
                        <div key={item.id} className="flex items-center justify-between">
                          <span>{item.code} - {item.name}</span>
                          <span className="text-xs text-slate-400">{item.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Enhancements</p>
                      <button className="text-xs font-semibold text-[var(--accent-dark)]">Add</button>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span>Additional insured schedule</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                        <Link2 size={12} /> Auto endorsement
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'docs' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">Generate package</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-white">Quote only</span>
                      <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-500">Full package</span>
                      <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-500">Binder</span>
                    </div>
                    <button className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white">
                      <FileText size={14} /> Generate
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">Recent documents</p>
                    <div className="mt-3 space-y-2 text-sm">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-700">{doc.name}</p>
                            <p className="text-xs text-slate-400">{doc.type} - {doc.date}</p>
                          </div>
                          <span className="text-xs text-slate-500">{doc.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="lg:col-span-4 space-y-5">
          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Bind readiness</h4>
              <AlertTriangle size={16} className="text-amber-500" />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700">
                <span>-</span>
                <span>Policy effective date missing</span>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-amber-700">
                <span>-</span>
                <span>1 subjectivity pending</span>
              </div>
              <button className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                Review blockers
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-5 shadow-sm">
            <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Cross-option tools</h4>
            <div className="mt-4 space-y-3 text-sm">
              <button className="flex w-full items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-slate-700">
                  <Sparkles size={14} className="text-[var(--accent-dark)]" /> Subjectivity matrix
                </span>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
              <button className="flex w-full items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-slate-700">
                  <SlidersHorizontal size={14} className="text-[var(--accent-dark)]" /> Coverage batch edit
                </span>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
              <button className="flex w-full items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <span className="flex items-center gap-2 text-slate-700">
                  <UploadCloud size={14} className="text-[var(--accent-dark)]" /> Extract from PDF
                </span>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-5 shadow-sm">
            <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Document timeline</h4>
            <div className="mt-4 space-y-3 text-sm">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                  <Archive size={16} className="text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-700">{doc.name}</p>
                    <p className="text-xs text-slate-400">{doc.type} - {doc.date}</p>
                  </div>
                </div>
              ))}
              <button className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                View all documents
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default QuoteStatusBoard;
