import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  Zap,
  Download,
  FileSignature,
  Copy,
  Lock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Calendar,
  Eye,
  MoreHorizontal,
  X
} from 'lucide-react';

/**
 * AppQuote13 - Refined based on PDF feedback
 *
 * Key refinements:
 * - Tower table only (no graphic above - wasted space)
 * - Matrix with FULL option names as column headers
 * - Pricing + structure together (not separate tabs)
 * - Dates/retro inline, not ugly separate cards
 * - Bind readiness card (v7 style)
 * - Side quick reference card (refined, no redundancy)
 * - No ON/OFF buttons, just checkboxes
 * - No busy "Enhancement: X" text under items
 * - No multiline, no extra colors
 */
const QuoteRefined = () => {
  const [selectedQuoteId, setSelectedQuoteId] = useState(1);
  const [showQuickRef, setShowQuickRef] = useState(true);

  const quotes = [
    { id: 1, name: '$5M xs $5M', descriptor: 'Standard Annual', position: 'excess', status: 'quoted', premium: 52500 },
    { id: 2, name: '$5M xs $5M', descriptor: '18 Month ODDL', position: 'excess', status: 'draft', premium: 78750 },
    { id: 3, name: '$2M x $25K', descriptor: 'Primary Option', position: 'primary', status: 'draft', premium: 38500 },
  ];

  const selectedQuote = quotes.find(q => q.id === selectedQuoteId);

  const towerLayers = [
    { carrier: 'TBD', limit: '$10,000,000', attach: '$10,000,000', premium: '—', rpm: '—', ilf: '—' },
    { carrier: 'CMAI (Ours)', limit: '$5,000,000', attach: '$5,000,000', premium: '$50,000', rpm: '$10K', ilf: '1.00', isCMAI: true },
    { carrier: 'Beazley', limit: '$5,000,000', attach: '$0', premium: '—', rpm: '—', ilf: '—' },
  ];

  const endorsements = [
    { id: 1, name: 'War & Terrorism Exclusion', type: 'required', assigned: [1, 2, 3] },
    { id: 2, name: 'OFAC Sanctions Compliance', type: 'required', assigned: [1, 2, 3] },
    { id: 3, name: 'Biometric Exclusion', type: 'manual', assigned: [2] },
    { id: 4, name: 'Additional Insured Schedule', type: 'auto', assigned: [1] },
    { id: 5, name: 'Extended Reporting Period', type: 'auto', assigned: [2] },
    { id: 6, name: 'Excess Follow Form', type: 'manual', assigned: [1, 2] },
  ];

  const subjectivities = [
    { id: 1, text: 'Copy of Underlying Policies', status: 'pending', assigned: [1, 2] },
    { id: 2, text: 'Signed Application', status: 'received', assigned: [1, 2, 3] },
    { id: 3, text: 'Year 2 Financials', status: 'pending', assigned: [2] },
  ];

  const bindIssues = [
    'Policy effective date not set',
    '1 subjectivity still pending',
    'Retro schedule not applied to all options',
  ];

  const formatCurrency = (val) => typeof val === 'number' ? '$' + val.toLocaleString() : val;

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800">

      {/* HEADER */}
      <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
        <div>
          <div className="text-base font-bold text-slate-900">Karbon Steel Industries</div>
          <div className="text-xs text-slate-500">$5.0B Revenue · Tech Manufacturing · New Business</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Latest doc: Mar 12</span>
          <button className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1.5">
            <Download size={14}/> Generate
          </button>
          <button className="px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1.5">
            <FileSignature size={14}/> Bind Option
          </button>
        </div>
      </header>

      {/* QUOTE OPTION CARDS */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-start gap-3">
          {quotes.map((quote) => {
            const isSelected = quote.id === selectedQuoteId;
            return (
              <button
                key={quote.id}
                onClick={() => setSelectedQuoteId(quote.id)}
                className={`px-4 py-3 rounded-lg border-2 text-left min-w-[160px] transition-all ${
                  isSelected
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-bold uppercase ${
                    quote.position === 'excess' ? 'text-blue-600' : 'text-gray-500'
                  }`}>
                    {quote.position === 'excess' ? 'Excess Option' : 'Primary Option'}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    quote.status === 'quoted' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {quote.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-900">{quote.name}</div>
                <div className="text-xs text-slate-500 mb-2">{quote.descriptor}</div>
                <div className="text-base font-bold text-slate-900">{formatCurrency(quote.premium)}</div>
              </button>
            );
          })}

          <button className="px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 text-slate-400 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 min-w-[120px] flex flex-col items-center justify-center">
            <Plus size={20}/>
            <span className="text-xs font-medium mt-1">New option</span>
          </button>
        </div>
      </div>

      <div className="flex">
        {/* MAIN CONTENT */}
        <main className="flex-1 p-6 space-y-6">

          {/* SELECTED OPTION HEADER + ACTIONS */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-slate-900">{selectedQuote?.name}</div>
              <div className="text-sm text-slate-500">{selectedQuote?.descriptor} · FF-CYBER-2024</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs text-slate-500 hover:text-purple-600 flex items-center gap-1">
                <Copy size={12}/> Clone
              </button>
              <button className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1">
                <Trash2 size={12}/> Delete
              </button>
            </div>
          </div>

          {/* TOWER + PRICING (together) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">Tower Structure</span>
              <button className="text-xs text-purple-600 hover:underline">Edit tower</button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Carrier</th>
                  <th className="text-right px-4 py-2 font-semibold">Limit</th>
                  <th className="text-right px-4 py-2 font-semibold">Attach</th>
                  <th className="text-right px-4 py-2 font-semibold">Premium</th>
                  <th className="text-right px-4 py-2 font-semibold">RPM</th>
                  <th className="text-right px-4 py-2 font-semibold">ILF</th>
                </tr>
              </thead>
              <tbody>
                {towerLayers.map((layer, idx) => (
                  <tr key={idx} className={`border-t border-gray-100 ${layer.isCMAI ? 'bg-purple-50' : ''}`}>
                    <td className="px-4 py-2.5">
                      <span className={layer.isCMAI ? 'font-bold text-purple-700' : 'text-slate-700'}>
                        {layer.isCMAI && <span className="inline-block w-2 h-2 rounded-full bg-purple-600 mr-2"></span>}
                        {layer.carrier}
                      </span>
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono text-slate-600">{layer.limit}</td>
                    <td className="text-right px-4 py-2.5 font-mono text-slate-600">{layer.attach}</td>
                    <td className="text-right px-4 py-2.5 font-mono text-slate-900">{layer.premium}</td>
                    <td className="text-right px-4 py-2.5 font-mono text-slate-500">{layer.rpm}</td>
                    <td className="text-right px-4 py-2.5 font-mono text-slate-500">{layer.ilf}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pricing row inline */}
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center gap-8">
              <div>
                <span className="text-xs text-slate-500">Technical</span>
                <div className="text-sm font-mono text-slate-600">$58,000</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Risk-Adjusted</span>
                <div className="text-sm font-mono text-slate-600">$55,000</div>
              </div>
              <div className="bg-white px-3 py-1.5 rounded border border-purple-200">
                <span className="text-xs text-purple-600">Sold Premium</span>
                <div className="text-sm font-mono font-bold text-purple-700">{formatCurrency(selectedQuote?.premium)}</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Policy Limit</span>
                <div className="text-sm font-mono text-slate-600">$5,000,000</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Retention</span>
                <div className="text-sm font-mono text-slate-600">$5,000,000</div>
              </div>
            </div>
          </div>

          {/* DATES + RETRO (inline, not separate ugly cards) */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-700">Dates + Retro Schedule</span>
              <button className="text-xs text-purple-600 hover:underline">Apply to all</button>
            </div>
            <div className="flex items-start gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-3">
                  <div>
                    <span className="text-xs text-slate-500 block mb-1">Policy Period</span>
                    <span className="text-sm px-2 py-1 bg-purple-100 text-purple-700 rounded">12 month policy period</span>
                  </div>
                  <button className="text-xs text-purple-600 hover:underline mt-4">Set specific dates</button>
                </div>
              </div>
              <div className="flex-1 border-l border-gray-200 pl-8">
                <span className="text-xs text-slate-500 block mb-2">Retro Schedule</span>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">Cyber liability</span>
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-slate-600">Full prior acts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">Privacy liability</span>
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-slate-600">Inception</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ENDORSEMENTS MATRIX - Full option names as headers */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-slate-700">Endorsements</span>
                <span className="text-sm text-slate-400">Subjectivities</span>
                <span className="text-sm text-slate-400">Coverages</span>
              </div>
              <input
                type="text"
                placeholder="Add endorsements..."
                className="text-xs px-2 py-1 border border-gray-300 rounded w-48"
              />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase w-1/2">Item Name</th>
                  {quotes.map((q) => (
                    <th key={q.id} className="px-4 py-2 text-center">
                      <div className="text-xs font-bold text-slate-700">{q.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{q.descriptor}</div>
                    </th>
                  ))}
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {endorsements.map((item) => (
                  <tr key={item.id} className={`border-t border-gray-50 ${item.type === 'required' ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {item.type === 'required' && <Lock size={12} className="text-slate-400"/>}
                        {item.type === 'auto' && <Zap size={12} className="text-amber-500"/>}
                        <span className="text-slate-700">{item.name}</span>
                        {item.type === 'required' && <span className="text-[10px] text-slate-400">Mandatory</span>}
                      </div>
                    </td>
                    {quotes.map((q) => (
                      <td key={q.id} className="px-4 py-2.5 text-center">
                        {item.type === 'required' ? (
                          <Check size={16} className="mx-auto text-slate-300"/>
                        ) : (
                          <input
                            type="checkbox"
                            checked={item.assigned.includes(q.id)}
                            onChange={() => {}}
                            className="accent-purple-600 w-4 h-4"
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-2">
                      {item.type !== 'required' && (
                        <button className="text-slate-300 hover:text-red-500">
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* SUBJECTIVITIES (same pattern) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">Subjectivities</span>
              <input
                type="text"
                placeholder="Add subjectivity..."
                className="text-xs px-2 py-1 border border-gray-300 rounded w-48"
              />
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase w-1/2">Item</th>
                  {quotes.map((q) => (
                    <th key={q.id} className="px-4 py-2 text-center">
                      <div className="text-xs font-bold text-slate-700">{q.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{q.descriptor}</div>
                    </th>
                  ))}
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {subjectivities.map((item) => (
                  <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700">{item.text}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          item.status === 'received' ? 'bg-green-100 text-green-700' :
                          item.status === 'waived' ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                    </td>
                    {quotes.map((q) => (
                      <td key={q.id} className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={item.assigned.includes(q.id)}
                          onChange={() => {}}
                          className="accent-purple-600 w-4 h-4"
                        />
                      </td>
                    ))}
                    <td className="px-2">
                      <button className="text-slate-300 hover:text-red-500">
                        <Trash2 size={14}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </main>

        {/* RIGHT SIDEBAR - Quick Reference + Bind Readiness */}
        {showQuickRef && (
          <aside className="w-72 bg-white border-l border-gray-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase">Quick Reference</span>
              <button onClick={() => setShowQuickRef(false)} className="text-slate-400 hover:text-slate-600">
                <X size={14}/>
              </button>
            </div>

            {/* Bind Readiness */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-amber-600"/>
                <span className="text-xs font-bold text-amber-800 uppercase">Bind Readiness</span>
              </div>
              <ul className="space-y-1">
                {bindIssues.map((issue, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <span className="text-amber-400 mt-0.5">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
              <button className="mt-2 text-xs text-amber-700 hover:underline">Review blockers</button>
            </div>

            {/* Latest Document */}
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase block mb-2">Latest Document</span>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <div className="text-sm font-medium text-slate-900">Quote Document</div>
                <div className="text-xs text-slate-500 mb-2">Dec 30, 2026</div>
                <button className="text-xs text-purple-600 hover:underline flex items-center gap-1">
                  <Eye size={12}/> View PDF
                </button>
              </div>
            </div>

            {/* Document Generation */}
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase block mb-2">Generate</span>
              <div className="space-y-2">
                <button className="w-full text-left px-3 py-2 border border-gray-200 rounded hover:border-purple-300 hover:bg-purple-50 text-sm">
                  Quote Only
                </button>
                <button className="w-full text-left px-3 py-2 border-2 border-purple-200 bg-purple-50 rounded hover:border-purple-400 text-sm font-medium text-purple-700">
                  Full Package
                </button>
              </div>
            </div>

            {/* Pending Actions */}
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase block mb-2">Pending Actions</span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded">
                  <AlertTriangle size={12} className="text-amber-600"/>
                  <span className="text-amber-800">2 pending subjectivities</span>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Sidebar toggle when closed */}
        {!showQuickRef && (
          <button
            onClick={() => setShowQuickRef(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 border-r-0 rounded-l px-1 py-4 shadow-sm"
          >
            <ChevronRight size={14} className="text-slate-400 rotate-180"/>
          </button>
        )}
      </div>
    </div>
  );
};

export default QuoteRefined;
