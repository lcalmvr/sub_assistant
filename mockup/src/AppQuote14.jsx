import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Copy,
  Trash2,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  DollarSign,
  Layers,
  Shield,
  ClipboardList,
} from 'lucide-react';

// Mock data
const mockQuotes = [
  {
    id: '1',
    name: '$5M xs $5M',
    descriptor: 'Standard Annual',
    position: 'excess',
    premium: 52000,
    status: 'quoted',
    tower: [
      { carrier: 'Travelers', limit: 5000000, attachment: 0, retention: 25000, premium: 45000 },
      { carrier: 'CMAI', limit: 5000000, attachment: 5000000, premium: 52000 },
    ],
  },
  {
    id: '2',
    name: '$2M x $25K',
    descriptor: 'Primary Only',
    position: 'primary',
    premium: 38000,
    status: 'draft',
    tower: [
      { carrier: 'CMAI', limit: 2000000, attachment: 0, retention: 25000, premium: 38000 },
    ],
  },
];

const mockEndorsements = [
  { id: 'e1', code: 'END-WAR-001', title: 'War & Terrorism Exclusion', required: true, quotes: ['1', '2'] },
  { id: 'e2', code: 'END-OFAC-001', title: 'OFAC Sanctions Compliance', required: true, quotes: ['1', '2'] },
  { id: 'e3', code: 'END-BIO-001', title: 'Biometric Data Exclusion', auto: true, quotes: ['1', '2'] },
  { id: 'e4', code: 'END-AI-001', title: 'Additional Insured Schedule', quotes: ['1'] },
];

const mockSubjectivities = [
  { id: 's1', text: 'Receipt of signed application', status: 'pending', quotes: ['1', '2'] },
  { id: 's2', text: 'Evidence of underlying coverage', status: 'received', quotes: ['1'] },
  { id: 's3', text: 'Copy of expiring policy', status: 'pending', quotes: ['1', '2'] },
];

// Helpers
const formatCompact = (val) => {
  if (!val) return '—';
  if (val >= 1_000_000) return `$${val / 1_000_000}M`;
  if (val >= 1_000) return `$${val / 1_000}K`;
  return `$${val}`;
};

const formatCurrency = (val) => {
  if (!val) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
};

// Quote Option Tab
function QuoteTab({ quote, isActive, onClick }) {
  const statusColors = {
    draft: 'bg-gray-100 text-gray-600',
    quoted: 'bg-purple-100 text-purple-700',
    bound: 'bg-green-100 text-green-700',
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-lg border-2 text-left transition-all ${
        isActive
          ? 'border-purple-500 bg-purple-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`font-semibold text-sm ${isActive ? 'text-purple-900' : 'text-gray-800'}`}>
          {quote.name}
        </span>
        {quote.position === 'excess' && (
          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">XS</span>
        )}
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColors[quote.status]}`}>
          {quote.status.toUpperCase()}
        </span>
      </div>
      <div className="text-sm text-gray-500 mt-0.5">{formatCurrency(quote.premium)}</div>
    </button>
  );
}

// Tower Table (Compact)
function TowerTable({ tower, position }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Carrier</th>
            <th className="px-3 py-2 text-left font-semibold">Limit</th>
            <th className="px-3 py-2 text-left font-semibold">{position === 'primary' ? 'Retention' : 'Attach'}</th>
            <th className="px-3 py-2 text-right font-semibold">Premium</th>
            <th className="px-3 py-2 text-right font-semibold">RPM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...tower].reverse().map((layer, idx) => {
            const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
            const rpm = layer.premium && layer.limit ? Math.round(layer.premium / (layer.limit / 1_000_000)) : null;
            return (
              <tr key={idx} className={isCMAI ? 'bg-purple-50' : ''}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${isCMAI ? 'text-purple-700' : 'text-gray-800'}`}>
                      {layer.carrier}
                    </span>
                    {isCMAI && (
                      <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded">Ours</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-700">{formatCompact(layer.limit)}</td>
                <td className="px-3 py-2 text-gray-600">
                  {layer.attachment > 0 ? `xs ${formatCompact(layer.attachment)}` : formatCompact(layer.retention)}
                </td>
                <td className="px-3 py-2 text-right font-medium text-green-700">{formatCurrency(layer.premium)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{rpm ? `$${rpm.toLocaleString()}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Section Header
function SectionHeader({ icon: Icon, title, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
        <Icon size={14} className="text-gray-400" />
        {title}
      </h3>
      {action}
    </div>
  );
}

// Matrix Checkbox
function MatrixCheckbox({ checked, onChange, disabled }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

export default function AppQuote14() {
  const [activeQuoteId, setActiveQuoteId] = useState('1');
  const [matrixTab, setMatrixTab] = useState('endorsements');
  const [endorsements, setEndorsements] = useState(mockEndorsements);
  const [subjectivities, setSubjectivities] = useState(mockSubjectivities);

  const activeQuote = mockQuotes.find(q => q.id === activeQuoteId);

  // Toggle endorsement for a quote
  const toggleEndorsement = (endtId, quoteId) => {
    setEndorsements(prev => prev.map(e => {
      if (e.id !== endtId) return e;
      const quotes = e.quotes.includes(quoteId)
        ? e.quotes.filter(q => q !== quoteId)
        : [...e.quotes, quoteId];
      return { ...e, quotes };
    }));
  };

  // Toggle subjectivity for a quote
  const toggleSubjectivity = (subjId, quoteId) => {
    setSubjectivities(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      const quotes = s.quotes.includes(quoteId)
        ? s.quotes.filter(q => q !== quoteId)
        : [...s.quotes, quoteId];
      return { ...s, quotes };
    }));
  };

  // Bind readiness checks
  const bindErrors = [];
  const bindWarnings = [];
  if (!activeQuote?.premium) bindErrors.push('Premium not set');
  if (activeQuote?.status === 'draft') bindWarnings.push('Quote document not generated');
  const pendingSubj = subjectivities.filter(s => s.quotes.includes(activeQuoteId) && s.status === 'pending').length;
  if (pendingSubj > 0) bindWarnings.push(`${pendingSubj} pending subjectivities`);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      {/* Header */}
      <nav className="h-12 bg-slate-900 text-slate-300 flex items-center px-4 text-sm">
        <span className="font-semibold text-white mr-4">Underwriting Portal</span>
        <span className="text-white">Karbon Steel</span>
        <span className="ml-4 px-2 py-0.5 bg-purple-900 text-purple-200 text-xs rounded-full border border-purple-700">
          Quoting
        </span>
      </nav>

      <main className="max-w-7xl mx-auto w-full p-6 grid grid-cols-12 gap-6 items-start">

        {/* LEFT COLUMN: Quote Editor */}
        <div className="col-span-8 space-y-6">

          {/* Quote Tabs + Actions */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {mockQuotes.map(q => (
                <QuoteTab
                  key={q.id}
                  quote={q}
                  isActive={activeQuoteId === q.id}
                  onClick={() => setActiveQuoteId(q.id)}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="Clone">
                <Copy size={18} />
              </button>
              <button className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="New">
                <Plus size={18} />
              </button>
              <button className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          {/* Tower Structure */}
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
            <SectionHeader
              icon={Layers}
              title="Tower Structure"
              action={
                <button className="text-xs text-purple-600 hover:text-purple-800 font-medium">
                  Edit Tower
                </button>
              }
            />
            <TowerTable tower={activeQuote?.tower || []} position={activeQuote?.position} />
          </section>

          {/* Premium */}
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
            <SectionHeader icon={DollarSign} title="Premium" />
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Technical</div>
                <div className="text-lg font-bold text-gray-900">$48,000</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Risk-Adjusted</div>
                <div className="text-lg font-bold text-blue-600">$52,000</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center border-2 border-purple-200">
                <div className="text-xs text-purple-600 uppercase mb-1">Sold</div>
                <input
                  type="text"
                  defaultValue="52,000"
                  className="text-lg font-bold text-purple-700 bg-transparent text-center w-full outline-none"
                />
              </div>
            </div>
          </section>

          {/* Dates & Retro */}
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
            <SectionHeader icon={Calendar} title="Policy Dates" />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Effective</label>
                <input type="date" className="w-full text-sm border border-gray-300 rounded px-3 py-2" defaultValue="2025-01-15" />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Expiration</label>
                <input type="date" className="w-full text-sm border border-gray-300 rounded px-3 py-2" defaultValue="2026-01-15" />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Retro Date</label>
                <input type="date" className="w-full text-sm border border-gray-300 rounded px-3 py-2" defaultValue="2020-01-01" />
              </div>
            </div>
          </section>

          {/* Coverage Schedule (collapsed by default) */}
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <button className="w-full flex items-center justify-between p-5 hover:bg-gray-50">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <Shield size={14} className="text-gray-400" />
                Coverage Schedule
              </h3>
              <ChevronRight size={18} className="text-gray-400" />
            </button>
          </section>

        </div>

        {/* RIGHT COLUMN: Workbench (Sticky) */}
        <div className="col-span-4 space-y-5 sticky top-6">

          {/* Bind Readiness */}
          <div className={`rounded-lg shadow-sm p-4 border-l-4 ${
            bindErrors.length > 0
              ? 'bg-red-50 border-red-500 border border-red-200'
              : bindWarnings.length > 0
                ? 'bg-amber-50 border-amber-500 border border-amber-200'
                : 'bg-green-50 border-green-500 border border-green-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-gray-900">Bind Readiness</span>
              {bindErrors.length > 0 ? (
                <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded flex items-center gap-1">
                  <AlertCircle size={12} /> {bindErrors.length} Errors
                </span>
              ) : bindWarnings.length > 0 ? (
                <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded flex items-center gap-1">
                  <AlertTriangle size={12} /> {bindWarnings.length} Warnings
                </span>
              ) : (
                <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle2 size={12} /> Ready
                </span>
              )}
            </div>
            {(bindErrors.length > 0 || bindWarnings.length > 0) && (
              <ul className="text-xs text-gray-600 space-y-1">
                {bindErrors.map((e, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-red-700">
                    <span className="w-1 h-1 bg-red-500 rounded-full" /> {e}
                  </li>
                ))}
                {bindWarnings.map((w, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-amber-700">
                    <span className="w-1 h-1 bg-amber-500 rounded-full" /> {w}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cross-Option Matrix */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <ClipboardList size={14} className="text-gray-400" />
                Cross-Option Assignment
              </h3>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setMatrixTab('endorsements')}
                className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  matrixTab === 'endorsements'
                    ? 'border-purple-500 text-purple-600 bg-purple-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Endorsements ({endorsements.length})
              </button>
              <button
                onClick={() => setMatrixTab('subjectivities')}
                className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  matrixTab === 'subjectivities'
                    ? 'border-purple-500 text-purple-600 bg-purple-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Subjectivities ({subjectivities.length})
              </button>
            </div>

            {/* Matrix Content */}
            <div className="p-3">
              {/* Column Headers */}
              <div className="grid grid-cols-[1fr_60px_60px] gap-1 mb-2 text-[10px] font-semibold text-gray-500 uppercase">
                <div></div>
                {mockQuotes.map(q => (
                  <div key={q.id} className="text-center truncate" title={q.name}>
                    {q.name.split(' ')[0]}
                  </div>
                ))}
              </div>

              {/* Rows */}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {matrixTab === 'endorsements' && endorsements.map(endt => (
                  <div key={endt.id} className="grid grid-cols-[1fr_60px_60px] gap-1 items-center py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {endt.required && <span className="text-gray-400 text-xs">🔒</span>}
                      {endt.auto && <span className="text-amber-500 text-xs">⚡</span>}
                      {!endt.required && !endt.auto && <span className="text-gray-300 text-xs">+</span>}
                      <span className="text-xs text-gray-700 truncate" title={endt.title}>
                        {endt.title.length > 25 ? `${endt.title.substring(0, 25)}...` : endt.title}
                      </span>
                    </div>
                    {mockQuotes.map(q => (
                      <div key={q.id} className="text-center">
                        <MatrixCheckbox
                          checked={endt.quotes.includes(q.id)}
                          onChange={() => toggleEndorsement(endt.id, q.id)}
                          disabled={endt.required}
                        />
                      </div>
                    ))}
                  </div>
                ))}

                {matrixTab === 'subjectivities' && subjectivities.map(subj => (
                  <div key={subj.id} className="grid grid-cols-[1fr_60px_60px] gap-1 items-center py-1.5 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[10px] px-1 py-0.5 rounded ${
                        subj.status === 'received' ? 'bg-green-100 text-green-700' :
                        subj.status === 'waived' ? 'bg-gray-100 text-gray-500' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {subj.status.slice(0, 3)}
                      </span>
                      <span className="text-xs text-gray-700 truncate" title={subj.text}>
                        {subj.text.length > 20 ? `${subj.text.substring(0, 20)}...` : subj.text}
                      </span>
                    </div>
                    {mockQuotes.map(q => (
                      <div key={q.id} className="text-center">
                        <MatrixCheckbox
                          checked={subj.quotes.includes(q.id)}
                          onChange={() => toggleSubjectivity(subj.id, q.id)}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Add button */}
              <button className="w-full mt-3 py-2 text-xs text-purple-600 hover:bg-purple-50 rounded border border-dashed border-purple-200 font-medium">
                + Add {matrixTab === 'endorsements' ? 'Endorsement' : 'Subjectivity'}
              </button>
            </div>
          </div>

          {/* Generate Document */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <FileText size={14} className="text-gray-400" />
              Generate Document
            </h3>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="docType" defaultChecked className="text-purple-600" />
                <span className="text-sm text-gray-700">Quote Only</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="docType" className="text-purple-600" />
                <span className="text-sm text-gray-700">Full Package</span>
              </label>
            </div>
            <button className="w-full py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm">
              Generate Quote
            </button>
          </div>

          {/* Bind Button */}
          <button
            className={`w-full py-3 rounded-lg text-sm font-semibold shadow-sm transition-colors ${
              bindErrors.length > 0
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
            disabled={bindErrors.length > 0}
          >
            {bindErrors.length > 0 ? 'Cannot Bind' : 'Bind Quote'}
          </button>

        </div>

      </main>
    </div>
  );
}
