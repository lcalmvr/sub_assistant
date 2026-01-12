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
  Calendar,
  DollarSign,
  Layers,
  Shield,
  ClipboardList,
  Settings,
  Clock,
  X,
} from 'lucide-react';

// Mock data
const mockQuotes = [
  {
    id: '1',
    name: '$5M xs $2M',
    position: 'excess',
    premium: 52000,
    technicalPremium: 48000,
    status: 'quoted',
    tower: [
      { carrier: 'Primary Carrier', limit: 2000000, attachment: 0, retention: 25000, premium: 57000 },
      { carrier: 'CMAI', limit: 5000000, attachment: 2000000, premium: 52000 },
    ],
  },
  {
    id: '2',
    name: '$3M xs $1M',
    position: 'excess',
    premium: 25000,
    technicalPremium: 22000,
    status: 'draft',
    tower: [
      { carrier: 'Primary Carrier', limit: 1000000, attachment: 0, retention: 25000, premium: 35000 },
      { carrier: 'CMAI', limit: 3000000, attachment: 1000000, premium: 25000 },
    ],
  },
  {
    id: '3',
    name: '$2M x $25K',
    position: 'primary',
    premium: 38000,
    technicalPremium: 36000,
    status: 'draft',
    tower: [
      { carrier: 'CMAI', limit: 2000000, attachment: 0, retention: 25000, premium: 38000 },
    ],
  },
];

const mockEndorsements = [
  { id: 'e1', code: 'END-WAR-001', title: 'War & Terrorism Exclusion', required: true, quotes: ['1', '2', '3'] },
  { id: 'e2', code: 'END-OFAC-001', title: 'OFAC Sanctions Compliance', required: true, quotes: ['1', '2', '3'] },
  { id: 'e3', code: 'END-BIO-001', title: 'Biometric Data Exclusion', auto: true, quotes: ['1', '2'] },
  { id: 'e4', code: 'END-AI-001', title: 'Additional Insured Schedule', quotes: ['1'] },
];

const mockSubjectivities = [
  { id: 's1', text: 'Receipt of signed application', status: 'pending', quotes: ['1', '2', '3'] },
  { id: 's2', text: 'Evidence of underlying coverage', status: 'received', quotes: ['1'] },
  { id: 's3', text: 'Copy of expiring policy', status: 'pending', quotes: ['1', '2'] },
];

const mockRetroCoverages = [
  { coverage: 'D&O', retroDate: '2018-01-01' },
  { coverage: 'EPL', retroDate: '2020-06-15' },
  { coverage: 'Fiduciary', retroDate: 'Full Prior Acts' },
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

// Tower Table
function TowerTable({ tower, position }) {
  const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
  const cmaiPremium = cmaiLayer?.premium;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <Layers size={14} className="text-gray-400" />
          Tower Structure
          {cmaiPremium && (
            <span className="text-sm font-semibold text-green-600 normal-case ml-2">
              Our Premium: {formatCurrency(cmaiPremium)}
            </span>
          )}
        </h3>
      </div>
      <div className="p-4">
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
                  <tr key={idx} className={`${isCMAI ? 'bg-purple-50' : ''} cursor-pointer hover:bg-gray-50`}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isCMAI ? 'text-purple-700' : 'text-gray-800'}`}>
                          {layer.carrier}
                        </span>
                        {isCMAI && (
                          <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded">Ours</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{formatCompact(layer.limit)}</td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {layer.attachment > 0 ? `xs ${formatCompact(layer.attachment)}` : formatCompact(layer.retention)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-green-700">{formatCurrency(layer.premium)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{rpm ? `$${rpm.toLocaleString()}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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

// Side Panel Tab Button
function SidePanelTab({ icon: Icon, label, isActive, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
        isActive
          ? 'bg-purple-100 text-purple-700'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={16} />
      <span>{label}</span>
      {badge && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
          isActive ? 'bg-purple-200 text-purple-800' : 'bg-gray-200 text-gray-600'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

export default function AppQuote15() {
  const [activeQuoteId, setActiveQuoteId] = useState('1');
  const [sidePanelTab, setSidePanelTab] = useState('dates');
  const [endorsements, setEndorsements] = useState(mockEndorsements);
  const [subjectivities, setSubjectivities] = useState(mockSubjectivities);
  const [effectiveDate, setEffectiveDate] = useState('2025-12-21');
  const [expirationDate, setExpirationDate] = useState('2026-02-06');

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

  // Bind readiness
  const bindErrors = [];
  const bindWarnings = [];
  if (!activeQuote?.premium) bindErrors.push('Premium not set');
  if (activeQuote?.status === 'draft') bindWarnings.push('Quote document not generated');
  const pendingSubj = subjectivities.filter(s => s.quotes.includes(activeQuoteId) && s.status === 'pending').length;
  if (pendingSubj > 0) bindWarnings.push(`${pendingSubj} pending subjectivities`);

  // Format policy period for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

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

        {/* LEFT COLUMN: Quote Content */}
        <div className="col-span-8 space-y-4">

          {/* Quote Tabs + Policy Period + Actions (all in one row) */}
          <div className="flex items-center justify-between gap-4">
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
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{formatDate(effectiveDate)} — {formatDate(expirationDate)}</span>
              <div className="flex gap-1">
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
          </div>

          {/* Tower Structure */}
          <TowerTable tower={activeQuote?.tower || []} position={activeQuote?.position} />

          {/* Coverage Schedule (collapsed) */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <Shield size={14} className="text-gray-400" />
                Coverage Schedule
              </h3>
              <ChevronRight size={18} className="text-gray-400" />
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: Unified Side Editor (Sticky) */}
        <div className="col-span-4 sticky top-6">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">

            {/* Side Panel Header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <Settings size={14} className="text-gray-400" />
                Quote Configuration
              </h3>
            </div>

            {/* Tab Navigation */}
            <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1">
              <SidePanelTab
                icon={Calendar}
                label="Dates"
                isActive={sidePanelTab === 'dates'}
                onClick={() => setSidePanelTab('dates')}
              />
              <SidePanelTab
                icon={DollarSign}
                label="Premium"
                isActive={sidePanelTab === 'premium'}
                onClick={() => setSidePanelTab('premium')}
              />
              <SidePanelTab
                icon={ClipboardList}
                label="Endts"
                isActive={sidePanelTab === 'endorsements'}
                onClick={() => setSidePanelTab('endorsements')}
                badge={endorsements.length}
              />
              <SidePanelTab
                icon={AlertTriangle}
                label="Subjs"
                isActive={sidePanelTab === 'subjectivities'}
                onClick={() => setSidePanelTab('subjectivities')}
                badge={subjectivities.filter(s => s.status === 'pending').length}
              />
            </div>

            {/* Tab Content */}
            <div className="p-4">

              {/* DATES TAB */}
              {sidePanelTab === 'dates' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Effective</label>
                      <input
                        type="date"
                        className="w-full text-sm border border-gray-300 rounded px-3 py-2"
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold mb-1 block">Expiration</label>
                      <input
                        type="date"
                        className="w-full text-sm border border-gray-300 rounded px-3 py-2"
                        value={expirationDate}
                        onChange={(e) => setExpirationDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Retro Schedule */}
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-1.5">
                        <Clock size={12} />
                        Retroactive Schedule
                      </span>
                      <button className="text-xs text-purple-600 hover:text-purple-800">+ Add</button>
                    </div>
                    <div className="space-y-2">
                      {mockRetroCoverages.map((rc, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm">
                          <span className="font-medium text-gray-700">{rc.coverage}</span>
                          <span className="text-gray-500">{rc.retroDate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* PREMIUM TAB */}
              {sidePanelTab === 'premium' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-3 px-3 bg-gray-50 rounded">
                      <span className="text-xs text-gray-500 uppercase font-semibold">Technical</span>
                      <span className="text-lg font-bold text-gray-700">{formatCurrency(activeQuote?.technicalPremium)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-3 bg-blue-50 rounded">
                      <span className="text-xs text-blue-600 uppercase font-semibold">Risk-Adjusted</span>
                      <span className="text-lg font-bold text-blue-700">{formatCurrency(activeQuote?.premium)}</span>
                    </div>
                    <div className="py-3 px-3 bg-purple-50 rounded border-2 border-purple-200">
                      <label className="text-xs text-purple-600 uppercase font-semibold mb-2 block">Sold Premium</label>
                      <input
                        type="text"
                        defaultValue={activeQuote?.premium?.toLocaleString()}
                        className="text-xl font-bold text-purple-700 bg-transparent w-full outline-none"
                        placeholder="Enter sold premium"
                      />
                    </div>
                  </div>
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Deviation from technical</span>
                      <span className="font-medium text-amber-600">+8.3%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ENDORSEMENTS TAB */}
              {sidePanelTab === 'endorsements' && (
                <div className="space-y-3">
                  {/* Column Headers */}
                  <div className="grid grid-cols-[1fr_50px_50px_50px] gap-1 text-[10px] font-semibold text-gray-500 uppercase">
                    <div></div>
                    {mockQuotes.map(q => (
                      <div key={q.id} className="text-center truncate" title={q.name}>
                        {q.name.split(' ')[0]}
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {endorsements.map(endt => (
                      <div key={endt.id} className="grid grid-cols-[1fr_50px_50px_50px] gap-1 items-center py-1.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {endt.required && <span className="text-gray-400 text-xs">🔒</span>}
                          {endt.auto && <span className="text-amber-500 text-xs">⚡</span>}
                          {!endt.required && !endt.auto && <span className="text-gray-300 text-xs">+</span>}
                          <span className="text-xs text-gray-700 truncate" title={endt.title}>
                            {endt.title.length > 20 ? `${endt.title.substring(0, 20)}...` : endt.title}
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
                  </div>

                  <button className="w-full py-2 text-xs text-purple-600 hover:bg-purple-50 rounded border border-dashed border-purple-200 font-medium">
                    + Add Endorsement
                  </button>
                </div>
              )}

              {/* SUBJECTIVITIES TAB */}
              {sidePanelTab === 'subjectivities' && (
                <div className="space-y-3">
                  {/* Column Headers */}
                  <div className="grid grid-cols-[1fr_50px_50px_50px] gap-1 text-[10px] font-semibold text-gray-500 uppercase">
                    <div></div>
                    {mockQuotes.map(q => (
                      <div key={q.id} className="text-center truncate" title={q.name}>
                        {q.name.split(' ')[0]}
                      </div>
                    ))}
                  </div>

                  {/* Rows */}
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {subjectivities.map(subj => (
                      <div key={subj.id} className="grid grid-cols-[1fr_50px_50px_50px] gap-1 items-center py-1.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[10px] px-1 py-0.5 rounded ${
                            subj.status === 'received' ? 'bg-green-100 text-green-700' :
                            subj.status === 'waived' ? 'bg-gray-100 text-gray-500' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {subj.status.slice(0, 3)}
                          </span>
                          <span className="text-xs text-gray-700 truncate" title={subj.text}>
                            {subj.text.length > 18 ? `${subj.text.substring(0, 18)}...` : subj.text}
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

                  <button className="w-full py-2 text-xs text-purple-600 hover:bg-purple-50 rounded border border-dashed border-purple-200 font-medium">
                    + Add Subjectivity
                  </button>
                </div>
              )}

            </div>

            {/* Bind Readiness & Actions */}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 space-y-3">

              {/* Bind Readiness */}
              <div className={`rounded-lg p-3 border-l-4 ${
                bindErrors.length > 0
                  ? 'bg-red-50 border-red-500'
                  : bindWarnings.length > 0
                    ? 'bg-amber-50 border-amber-500'
                    : 'bg-green-50 border-green-500'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-gray-900">Bind Readiness</span>
                  {bindErrors.length > 0 ? (
                    <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded flex items-center gap-1">
                      <AlertCircle size={12} /> {bindErrors.length}
                    </span>
                  ) : bindWarnings.length > 0 ? (
                    <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded flex items-center gap-1">
                      <AlertTriangle size={12} /> {bindWarnings.length}
                    </span>
                  ) : (
                    <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 size={12} /> Ready
                    </span>
                  )}
                </div>
                {(bindErrors.length > 0 || bindWarnings.length > 0) && (
                  <ul className="text-xs text-gray-600 space-y-1 mt-2">
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

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button className="py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2">
                  <FileText size={16} />
                  Generate
                </button>
                <button
                  className={`py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                    bindErrors.length > 0
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                  disabled={bindErrors.length > 0}
                >
                  <CheckCircle2 size={16} />
                  Bind
                </button>
              </div>

            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
