import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  CircleSlash,
  Copy,
  Download,
  FileText,
  Grid3X3,
  Layers,
  Link2,
  Loader2,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  UploadCloud,
} from 'lucide-react';

/**
 * AppQuote7 - "Workflow Ledger"
 * Emphasizes a guided, validation-first workflow with a dedicated cross-option rail.
 */
const QuoteWorkflowLedger = () => {
  const [selectedQuoteId, setSelectedQuoteId] = useState(1);
  const [assignmentTab, setAssignmentTab] = useState('subjectivities');
  const [showMatrix, setShowMatrix] = useState(true);

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
      subjectivities: 3,
      endorsements: 5,
      enhancements: 2,
      docs: 2,
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
      subjectivities: 4,
      endorsements: 6,
      enhancements: 1,
      docs: 0,
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
      subjectivities: 2,
      endorsements: 3,
      enhancements: 0,
      docs: 0,
    },
  ];

  const selectedQuote = quotes.find((q) => q.id === selectedQuoteId) || quotes[0];

  const towerLayers = selectedQuote.position === 'excess'
    ? [
        { id: 1, carrier: 'TBD', limit: '$10M', attach: '$10M', qs: null, rpm: '--', ilf: '--' },
        { id: 2, carrier: 'CMAI', limit: '$2.5M', attach: '$5M', qs: '$5M', rpm: '$10.5K', ilf: '1.00' },
        { id: 3, carrier: 'Partner Re', limit: '$2.5M', attach: '$5M', qs: '$5M', rpm: '$10.5K', ilf: '1.00' },
        { id: 4, carrier: 'Beazley', limit: '$5M', attach: '$0', qs: null, rpm: '--', ilf: '--' },
      ]
    : [
        { id: 1, carrier: 'CMAI', limit: '$2M', attach: '$25K', qs: null, rpm: '$19.2K', ilf: '1.00' },
      ];

  const subjectivities = [
    { id: 1, text: 'Signed application', status: 'received', auto: true, assignedTo: [1, 2, 3] },
    { id: 2, text: 'Copy of underlying policies', status: 'pending', auto: true, assignedTo: [1, 2] },
    { id: 3, text: 'Year 2 financials (for extended term)', status: 'pending', auto: false, assignedTo: [2] },
  ];

  const endorsements = [
    { id: 1, code: 'END-WAR-001', name: 'War & Terrorism Exclusion', type: 'required', assignedTo: [1, 2, 3] },
    { id: 2, code: 'END-OFAC-001', name: 'OFAC Sanctions Compliance', type: 'required', assignedTo: [1, 2, 3] },
    { id: 3, code: 'END-AI-001', name: 'Additional Insured Schedule', type: 'auto', assignedTo: [1] },
    { id: 4, code: 'END-ERP-001', name: 'Modified ERP Terms', type: 'auto', assignedTo: [2] },
    { id: 5, code: 'END-BIO-001', name: 'Biometric Exclusion', type: 'optional', assignedTo: [2] },
  ];

  const enhancements = [
    { id: 1, name: 'Additional Insureds', detail: 'ABC Corp, XYZ Inc', linked: 'END-AI-001' },
    { id: 2, name: 'Modified ERP', detail: '60/90 day tail', linked: 'END-ERP-001' },
  ];

  const documents = [
    { id: 1, name: 'Quote - $5M xs $5M', type: 'Quote', date: 'Mar 12', status: 'Sent' },
    { id: 2, name: 'Package - Quote + Endorsements', type: 'Package', date: 'Mar 12', status: 'Ready' },
  ];

  const validation = {
    errors: ['Policy effective date not set', '1 subjectivity still pending'],
    warnings: ['Tower quota share is 50% filled', 'Retro schedule not applied to all options'],
  };

  return (
    <div
      className="quote-flow relative min-h-screen overflow-hidden text-slate-900"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@500;700&display=swap');
        .quote-flow {
          --ink: #0f172a;
          --accent: #2563eb;
          --accent-strong: #1d4ed8;
          --accent-warm: #f59e0b;
          --surface: rgba(255, 255, 255, 0.9);
          background: linear-gradient(180deg, #e0f2fe 0%, #f1f5f9 48%, #e2e8f0 100%);
        }
        .fade-up { animation: fadeUp 0.6s ease both; }
        .fade-up-delay { animation: fadeUp 0.8s ease both; animation-delay: 0.1s; }
        .fade-up-delay-2 { animation: fadeUp 0.8s ease both; animation-delay: 0.2s; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="pointer-events-none absolute -top-24 right-[-10%] h-72 w-72 rounded-full bg-[#bfdbfe]/50 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10%] left-[-10%] h-80 w-80 rounded-full bg-[#dbeafe]/35 blur-3xl" />

      <header className="relative z-10 border-b border-slate-200/70 bg-slate-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Submission</p>
            <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "'IBM Plex Serif', serif" }}>
              Karbon Steel Industries
            </h1>
            <p className="text-sm text-slate-500">$5.0B Revenue - Tech Manufacturing - New Business</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
              <BadgeCheck size={14} /> Quote in progress
            </span>
            <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300">
              <Activity size={14} /> Latest doc: Mar 12
            </button>
            <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300">
              <Download size={14} /> Generate
            </button>
            <button className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white shadow">
              <ShieldCheck size={14} /> Bind Option
            </button>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[1400px] px-6 py-5">
        <div className="flex flex-wrap gap-3">
          {quotes.map((quote) => (
            <button
              key={quote.id}
              onClick={() => setSelectedQuoteId(quote.id)}
              className={`flex min-w-[220px] flex-1 items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition-all ${
                selectedQuoteId === quote.id
                  ? 'border-[var(--accent)] bg-white shadow-sm'
                  : 'border-slate-200/70 bg-slate-50/80 hover:border-slate-200'
              }`}
            >
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {quote.position === 'excess' ? 'Excess' : 'Primary'} option
                </p>
                <h3 className="text-lg font-semibold text-slate-900">{quote.name}</h3>
                <p className="text-xs text-slate-500">{quote.descriptor}</p>
              </div>
              <div className="text-right">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  quote.status === 'quoted'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {quote.status.toUpperCase()}
                </span>
                <p className="mt-2 text-lg font-semibold text-slate-900">${quote.premium.toLocaleString()}</p>
              </div>
            </button>
          ))}
          <button className="flex min-w-[160px] flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-500 hover:border-[var(--accent)] hover:text-[var(--accent)]">
            <Plus size={16} /> New option
          </button>
        </div>
      </section>

      <main className="relative z-10 mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-6 pb-12 xl:grid-cols-12">
        <aside className="xl:col-span-3 space-y-5">
          <div className="fade-up rounded-3xl border border-slate-200/70 bg-slate-50/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Option Tools</h4>
              <Settings2 size={16} className="text-slate-400" />
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <button className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-700 hover:border-[var(--accent)]">
                <Copy size={14} className="mr-2 inline" /> Clone selected
              </button>
              <button className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 font-semibold text-slate-700 hover:border-[var(--accent)]">
                <CircleSlash size={14} className="mr-2 inline" /> Delete option
              </button>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Apply to all</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Retro schedule</span>
                  <ToggleRight size={18} className="text-blue-500" />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-600">Coverage flags</span>
                  <ToggleLeft size={18} className="text-slate-300" />
                </div>
              </div>
            </div>
          </div>

          <div className="fade-up-delay rounded-3xl border border-slate-200/70 bg-slate-50/90 p-5 shadow-sm">
            <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Document Pulse</h4>
            <div className="mt-4 space-y-3 text-sm">
              {documents.map((doc) => (
                <div key={doc.id} className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{doc.type}</span>
                    <span className="text-[10px] uppercase text-blue-600">{doc.status}</span>
                  </div>
                  <p className="mt-1 font-medium text-slate-800">{doc.name}</p>
                  <p className="text-xs text-slate-400">{doc.date}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="xl:col-span-6 space-y-6">
          <div className="fade-up rounded-3xl border border-slate-200/70 bg-slate-50/90 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Selected option</p>
                <h2 className="text-2xl font-semibold text-slate-900">{selectedQuote.name}</h2>
                <p className="text-sm text-slate-500">{selectedQuote.descriptor} - {selectedQuote.policyForm}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-600">
                  <Download size={14} className="mr-2 inline" /> Generate quote
                </button>
                <button className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white">
                  <ShieldCheck size={14} className="mr-2 inline" /> Bind
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                { label: 'Technical', value: '$58,000' },
                { label: 'Risk adjusted', value: '$55,000' },
                { label: 'Sold premium', value: '$52,500' },
              ].map((metric) => (
                <div key={metric.label} className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.label}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{metric.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Policy limit</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{selectedQuote.limit.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Retention / attach</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{selectedQuote.retention.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="fade-up-delay rounded-3xl border border-slate-200/70 bg-slate-50/90 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Tower structure</h3>
              <button className="text-xs font-semibold text-[var(--accent-strong)]">Edit tower</button>
            </div>
            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-[1.8fr_1fr_1fr_1fr_1fr] gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                <span>Carrier</span>
                <span>Limit</span>
                <span>Attach</span>
                <span>QS</span>
                <span>RPM / ILF</span>
              </div>
              {towerLayers.map((layer) => (
                <div key={layer.id} className={`grid grid-cols-[1.8fr_1fr_1fr_1fr_1fr] gap-2 rounded-2xl border px-3 py-2 text-sm ${
                  layer.carrier === 'CMAI'
                    ? 'border-[var(--accent)] bg-blue-50'
                    : 'border-slate-100 bg-white'
                }`}>
                  <span className="font-semibold text-slate-700">{layer.carrier}</span>
                  <span>{layer.limit}</span>
                  <span>{layer.attach}</span>
                  <span className="text-xs text-slate-500">{layer.qs || '--'}</span>
                  <span className="text-xs text-slate-500">{layer.rpm} - {layer.ilf}</span>
                </div>
              ))}
            </div>
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-500 hover:border-[var(--accent)] hover:text-[var(--accent)]">
              <Layers size={16} /> Add underlying layer
            </button>
          </div>

          <div className="fade-up-delay-2 rounded-3xl border border-slate-200/70 bg-slate-50/90 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Dates + Retro schedule</h3>
                <p className="text-sm text-slate-500">Global policy dates with per-coverage retro schedule.</p>
              </div>
              <button className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                <Calendar size={14} className="mr-2 inline" /> Apply to all
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Policy period</p>
                <p className="mt-2 text-sm font-semibold text-slate-700">12 month policy period</p>
                <button className="mt-3 text-xs font-semibold text-[var(--accent-strong)]">Set specific dates</button>
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
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Coverage schedule</h3>
                <p className="text-sm text-slate-500">Sublimits from primary documents (excess) or coverage flags (primary).</p>
              </div>
              <button className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--accent-strong)]">
                <UploadCloud size={14} /> Extract from PDF
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {['Social engineering', 'System failure', 'Media liability', 'Regulatory defense'].map((coverage) => (
                <div key={coverage} className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">{coverage}</p>
                  <p className="text-xs text-slate-500">Our limit: $1M - Our attach: $5M</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Assignments</h3>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">
                <Grid3X3 size={14} /> {showMatrix ? 'Matrix on' : 'Matrix off'}
              </div>
            </div>
            <div className="mt-4 flex gap-3 text-sm font-semibold">
              {['subjectivities', 'endorsements'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAssignmentTab(tab)}
                  className={`rounded-full px-4 py-1.5 ${
                    assignmentTab === tab
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {assignmentTab === 'subjectivities'
                ? subjectivities.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.text}</p>
                        <p className="text-xs text-slate-400">{item.auto ? 'Auto template' : 'Manual'}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.status === 'received'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  ))
                : endorsements.map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.code} - {item.name}</p>
                        <p className="text-xs text-slate-400">{item.type} endorsement</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.type === 'required'
                          ? 'bg-slate-200 text-slate-700'
                          : item.type === 'auto'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.type}
                      </span>
                    </div>
                  ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Enhancements & modifications</h3>
              <button className="text-xs font-semibold text-[var(--accent-strong)]">Add enhancement</button>
            </div>
            <div className="mt-4 space-y-3">
              {enhancements.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.detail}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                    <Link2 size={12} /> {item.linked}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Document builder</h3>
            <p className="text-sm text-slate-500">Generate quote only or full package.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Package type</p>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <button className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white">Quote only</button>
                  <button className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500">Full package</button>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Included docs</p>
                <div className="mt-2 space-y-1 text-sm text-slate-600">
                  <p>Included: Endorsements ({selectedQuote.endorsements})</p>
                  <p>Included: Policy specimen</p>
                  <p>Optional: Claims sheets</p>
                </div>
              </div>
            </div>
            <button className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow">
              <FileText size={16} /> Generate package
            </button>
          </div>
        </section>

        <aside className="xl:col-span-3 space-y-5">
          <div className="fade-up rounded-3xl border border-slate-200/70 bg-slate-50/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Bind readiness</h4>
              <AlertTriangle size={16} className="text-amber-500" />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {validation.errors.map((err) => (
                <div key={err} className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700">
                  <span className="mt-0.5">-</span>
                  <span>{err}</span>
                </div>
              ))}
              {validation.warnings.map((warn) => (
                <div key={warn} className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-amber-700">
                  <span className="mt-0.5">-</span>
                  <span>{warn}</span>
                </div>
              ))}
              <button className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                Review blockers
              </button>
            </div>
          </div>

          <div className="fade-up-delay rounded-3xl border border-slate-200/70 bg-slate-50/90 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Cross-option matrix</h4>
              <button
                onClick={() => setShowMatrix(!showMatrix)}
                className="text-xs font-semibold text-[var(--accent-strong)]"
              >
                {showMatrix ? 'Hide' : 'Show'}
              </button>
            </div>
            {showMatrix && (
              <div className="mt-4 space-y-3">
                {[
                  { label: 'Subjectivities', icon: Sparkles, count: 6 },
                  { label: 'Endorsements', icon: ShieldCheck, count: 8 },
                  { label: 'Coverages', icon: SlidersHorizontal, count: 12 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <item.icon size={16} className="text-[var(--accent-strong)]" />
                      <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{item.count} items</span>
                  </div>
                ))}
                <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-500 hover:border-[var(--accent)]">
                  <Grid3X3 size={14} /> Open full matrix
                </button>
              </div>
            )}
          </div>

          <div className="fade-up-delay-2 rounded-3xl border border-slate-200/70 bg-slate-50/90 p-5 shadow-sm">
            <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Workflow status</h4>
            <div className="mt-4 space-y-3 text-sm">
              {[
                { label: 'Pricing locked', status: 'done' },
                { label: 'Tower validated', status: 'in-progress' },
                { label: 'Subjectivities sent', status: 'pending' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                  <span className="text-slate-700">{item.label}</span>
                  {item.status === 'done' && <CheckCircle2 size={16} className="text-blue-500" />}
                  {item.status === 'in-progress' && <Loader2 size={16} className="text-amber-500" />}
                  {item.status === 'pending' && <AlertTriangle size={16} className="text-slate-300" />}
                </div>
              ))}
              <button className="w-full rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white">
                Send quote package <ArrowRight size={14} className="ml-2 inline" />
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default QuoteWorkflowLedger;
