import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
  Download,
  FileSignature,
  Copy,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Calendar,
  Layers,
  DollarSign,
  Settings2,
  MoreHorizontal
} from 'lucide-react';

/**
 * AppQuote12 - "Compact Command" Design
 *
 * Consolidates best concepts from v1-v11:
 * - Browser-tab quote selector (always visible)
 * - Persistent matrix sidebar (cross-option assignment)
 * - Bind readiness bar (validation status)
 * - Tabbed content (no vertical scroll)
 * - Compact tower table (data over decoration)
 */
const QuoteCompactCommand = () => {
  const [selectedQuoteId, setSelectedQuoteId] = useState(1);
  const [activeTab, setActiveTab] = useState('structure');
  const [matrixSection, setMatrixSection] = useState('endorsements');
  const [bindBarExpanded, setBindBarExpanded] = useState(false);
  const [towerEditMode, setTowerEditMode] = useState(false);

  // Mock data
  const quotes = [
    { id: 1, name: '$5M xs $5M', descriptor: 'Standard', position: 'excess', status: 'quoted', soldPremium: 52500, riskAdjusted: 55000 },
    { id: 2, name: '$5M xs $5M', descriptor: '18 Month', position: 'excess', status: 'draft', soldPremium: null, riskAdjusted: 78750 },
    { id: 3, name: '$2M x $25K', descriptor: 'Primary', position: 'primary', status: 'draft', soldPremium: null, riskAdjusted: 38500 },
  ];

  const selectedQuote = quotes.find(q => q.id === selectedQuoteId);

  const towerLayers = [
    { carrier: 'TBD', limit: 10000000, attach: 10000000, premium: null, rpm: null },
    { carrier: 'CMAI', limit: 5000000, attach: 5000000, premium: 52500, rpm: 10.5, isCMAI: true },
    { carrier: 'Beazley', limit: 5000000, attach: 0, premium: null, rpm: null },
  ];

  const endorsements = [
    { id: 1, code: 'END-WAR-001', name: 'War & Terrorism Exclusion', type: 'required', assigned: { 1: true, 2: true, 3: true } },
    { id: 2, code: 'END-OFAC-001', name: 'OFAC Sanctions', type: 'required', assigned: { 1: true, 2: true, 3: true } },
    { id: 3, code: 'END-BIO-001', name: 'Biometric Exclusion', type: 'manual', assigned: { 1: false, 2: true, 3: false } },
    { id: 4, code: 'END-AI-001', name: 'Additional Insured', type: 'auto', assigned: { 1: true, 2: false, 3: false } },
    { id: 5, code: 'END-ERP-001', name: 'Extended Reporting', type: 'auto', assigned: { 1: false, 2: true, 3: false } },
  ];

  const subjectivities = [
    { id: 1, text: 'Copy of Underlying Policies', status: 'pending', assigned: { 1: true, 2: true, 3: false } },
    { id: 2, text: 'Signed Application', status: 'received', assigned: { 1: true, 2: true, 3: true } },
    { id: 3, text: 'Year 2 Financials', status: 'pending', assigned: { 1: false, 2: true, 3: false } },
  ];

  const bindValidation = {
    errors: [],
    warnings: [
      { message: '1 pending subjectivity', field: 'subjectivities' },
      { message: 'Sold premium not set', field: 'premium' },
    ],
  };

  const formatCurrency = (val) => val ? '$' + val.toLocaleString() : '—';

  const getStatusStyle = (status) => {
    switch (status) {
      case 'bound': return 'bg-green-600 text-white';
      case 'quoted': return 'bg-purple-600 text-white';
      default: return 'bg-gray-200 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-slate-800 flex flex-col">

      {/* HEADER */}
      <header className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-900">Karbon Steel Industries</span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">$5.0B Revenue · Tech Manufacturing</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1">
            <Download size={12}/> Generate
          </button>
          {selectedQuote?.status === 'quoted' && (
            <button className="px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1">
              <FileSignature size={12}/> Bind
            </button>
          )}
        </div>
      </header>

      {/* QUOTE TABS */}
      <div className="bg-white border-b border-gray-200 px-4 flex items-center gap-1">
        {quotes.map((quote) => {
          const isSelected = quote.id === selectedQuoteId;
          return (
            <button
              key={quote.id}
              onClick={() => setSelectedQuoteId(quote.id)}
              className={`group px-3 py-2 flex items-center gap-2 border-b-2 transition-all ${
                isSelected
                  ? 'border-purple-600 bg-purple-50/50'
                  : 'border-transparent hover:bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${isSelected ? 'text-purple-700' : 'text-slate-700'}`}>
                    {quote.name}
                  </span>
                  <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${getStatusStyle(quote.status)}`}>
                    {quote.status === 'quoted' ? 'QTD' : quote.status === 'bound' ? 'BND' : 'DFT'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">{quote.descriptor}</span>
              </div>
              <span className={`text-xs font-bold ${isSelected ? 'text-purple-700' : 'text-slate-500'}`}>
                {formatCurrency(quote.soldPremium || quote.riskAdjusted)}
              </span>
              <button className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600">
                <MoreHorizontal size={14}/>
              </button>
            </button>
          );
        })}

        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-200">
          <button className="px-2 py-1.5 text-xs text-slate-500 hover:text-purple-600 flex items-center gap-1">
            <Plus size={12}/> New
          </button>
          <button className="px-2 py-1.5 text-xs text-slate-500 hover:text-purple-600 flex items-center gap-1">
            <Copy size={12}/> Clone
          </button>
        </div>
      </div>

      {/* MAIN AREA */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* BIND READINESS BAR */}
          <div className={`shrink-0 border-b ${
            bindValidation.errors.length > 0
              ? 'bg-red-50 border-red-200'
              : bindValidation.warnings.length > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-green-50 border-green-200'
          }`}>
            <button
              onClick={() => setBindBarExpanded(!bindBarExpanded)}
              className="w-full px-4 py-2 flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-3">
                {bindValidation.errors.length > 0 ? (
                  <XCircle size={16} className="text-red-600"/>
                ) : bindValidation.warnings.length > 0 ? (
                  <AlertTriangle size={16} className="text-amber-600"/>
                ) : (
                  <CheckCircle2 size={16} className="text-green-600"/>
                )}
                <span className={`font-medium ${
                  bindValidation.errors.length > 0 ? 'text-red-800' :
                  bindValidation.warnings.length > 0 ? 'text-amber-800' : 'text-green-800'
                }`}>
                  {bindValidation.errors.length > 0
                    ? `${bindValidation.errors.length} error(s) blocking bind`
                    : bindValidation.warnings.length > 0
                    ? `${bindValidation.warnings.length} warning(s) · Ready to bind`
                    : 'Ready to bind'
                  }
                </span>
              </div>
              {bindBarExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>

            {bindBarExpanded && (bindValidation.errors.length > 0 || bindValidation.warnings.length > 0) && (
              <div className="px-4 pb-3 space-y-1">
                {bindValidation.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-red-700">
                    <XCircle size={12}/> {err.message}
                  </div>
                ))}
                {bindValidation.warnings.map((warn, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-amber-700">
                    <AlertTriangle size={12}/> {warn.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CONTENT TABS */}
          <div className="bg-white border-b border-gray-100 px-4 flex gap-1">
            {[
              { id: 'structure', label: 'Structure', icon: Layers },
              { id: 'pricing', label: 'Pricing', icon: DollarSign },
              { id: 'dates', label: 'Dates & Retro', icon: Calendar },
              { id: 'enhancements', label: 'Enhancements', icon: Settings2 },
              { id: 'documents', label: 'Documents', icon: FileText },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2.5 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon size={14}/>
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB CONTENT */}
          <div className="flex-1 overflow-auto p-4 bg-gray-50">

            {/* STRUCTURE TAB */}
            {activeTab === 'structure' && (
              <div className="max-w-3xl space-y-4">

                {/* Tower Table */}
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 uppercase">Tower Structure</span>
                    <button
                      onClick={() => setTowerEditMode(!towerEditMode)}
                      className={`text-xs px-2 py-1 rounded ${
                        towerEditMode ? 'bg-purple-600 text-white' : 'text-slate-500 hover:bg-gray-100'
                      }`}
                    >
                      {towerEditMode ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="text-left px-4 py-2">Carrier</th>
                        <th className="text-right px-3 py-2">Limit</th>
                        <th className="text-right px-3 py-2">Attach</th>
                        <th className="text-right px-3 py-2">Premium</th>
                        <th className="text-right px-3 py-2">RPM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {towerLayers.map((layer, idx) => (
                        <tr key={idx} className={layer.isCMAI ? 'bg-purple-50' : ''}>
                          <td className="px-4 py-2">
                            {layer.isCMAI ? (
                              <span className="font-bold text-purple-700">CMAI (Us)</span>
                            ) : towerEditMode ? (
                              <input defaultValue={layer.carrier} className="w-full bg-transparent border-b border-gray-300 outline-none"/>
                            ) : (
                              <span className="text-slate-700">{layer.carrier}</span>
                            )}
                          </td>
                          <td className="text-right px-3 py-2 font-mono text-slate-600">
                            {formatCurrency(layer.limit)}
                          </td>
                          <td className="text-right px-3 py-2 font-mono text-slate-600">
                            {formatCurrency(layer.attach)}
                          </td>
                          <td className="text-right px-3 py-2 font-mono">
                            {layer.premium ? formatCurrency(layer.premium) : '—'}
                          </td>
                          <td className="text-right px-3 py-2 font-mono text-slate-500">
                            {layer.rpm ? `$${layer.rpm}K` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Policy Config */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="text-xs font-bold text-slate-600 uppercase mb-3">Policy Configuration</div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Policy Limit</label>
                      <div className="text-sm font-medium text-slate-900">$5,000,000</div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Retention</label>
                      <select className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded">
                        <option>$5,000,000 (Underlying)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Policy Form</label>
                      <div className="text-sm font-medium text-slate-900">FF-CYBER-2024</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PRICING TAB */}
            {activeTab === 'pricing' && (
              <div className="max-w-3xl">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="text-xs font-bold text-slate-600 uppercase mb-4">Premium</div>
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Technical Premium</label>
                      <div className="text-lg font-mono text-slate-600">$58,000</div>
                    </div>
                    <div className="bg-purple-50 -mx-2 px-2 py-2 rounded">
                      <label className="text-xs text-purple-600 block mb-1">Risk-Adjusted</label>
                      <div className="text-lg font-mono font-bold text-purple-700">
                        {formatCurrency(selectedQuote?.riskAdjusted)}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Sold Premium</label>
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">$</span>
                        <input
                          type="text"
                          defaultValue={selectedQuote?.soldPremium?.toLocaleString() || ''}
                          placeholder="Enter sold"
                          className="text-lg font-mono font-bold bg-transparent border-b-2 border-dashed border-slate-300 focus:border-purple-500 outline-none w-24"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Commission %</label>
                        <input
                          type="text"
                          defaultValue="15.0"
                          className="px-2 py-1.5 text-sm border border-gray-300 rounded w-24"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Net Premium</label>
                        <div className="text-sm font-medium text-slate-900">$44,625</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DATES TAB */}
            {activeTab === 'dates' && (
              <div className="max-w-3xl space-y-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="text-xs font-bold text-slate-600 uppercase mb-3">Policy Period</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Effective Date</label>
                      <input type="date" defaultValue="2026-12-30" className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"/>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Expiration Date</label>
                      <input type="date" defaultValue="2027-12-30" className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded"/>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">12 month policy period</span>
                    <button className="text-xs text-purple-600 hover:underline">Clear dates</button>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-600 uppercase">Retroactive Dates</span>
                    <button className="text-xs text-purple-600 hover:underline">Apply to All</button>
                  </div>
                  <div className="space-y-2">
                    {['Cyber Liability', 'Privacy Liability', 'Network Security'].map((cov, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-sm text-slate-700">{cov}</span>
                        <select className="text-xs px-2 py-1 border border-gray-300 rounded bg-white">
                          <option>Full Prior Acts</option>
                          <option>Inception</option>
                          <option>Custom Date</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ENHANCEMENTS TAB */}
            {activeTab === 'enhancements' && (
              <div className="max-w-3xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-600 uppercase">Enhancements & Modifications</span>
                  <button className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1">
                    <Plus size={12}/> Add
                  </button>
                </div>

                <div className="space-y-2">
                  {[
                    { name: 'Additional Insured Schedule', summary: 'ABC Corp, XYZ Inc (+1)', linked: 'END-AI-001' },
                    { name: 'Modified ERP Terms', summary: '60 days basic, 90 supplemental', linked: 'END-ERP-001' },
                  ].map((enh, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
                          <Zap size={14} className="text-amber-600"/>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{enh.name}</div>
                          <div className="text-xs text-slate-500">{enh.summary}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{enh.linked}</span>
                        <button className="text-xs text-purple-600 hover:underline">Edit</button>
                        <button className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {activeTab === 'documents' && (
              <div className="max-w-3xl">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="text-xs font-bold text-slate-600 uppercase mb-4">Generate Documents</div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button className="p-3 border border-gray-200 rounded-lg hover:border-purple-300 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText size={16} className="text-slate-500"/>
                        <span className="font-medium text-slate-900">Quote Only</span>
                      </div>
                      <span className="text-xs text-slate-500">Generate quote letter PDF</span>
                    </button>

                    <button className="p-3 border-2 border-purple-200 bg-purple-50 rounded-lg hover:border-purple-400 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <Layers size={16} className="text-purple-600"/>
                        <span className="font-medium text-purple-900">Full Package</span>
                      </div>
                      <span className="text-xs text-purple-700">Quote + Endorsements + Specimen</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" defaultChecked className="accent-purple-600"/>
                      <span>Endorsement Package (3 endorsements)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" defaultChecked className="accent-purple-600"/>
                      <span>Policy Specimen</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" className="accent-purple-600"/>
                      <span>Claims Contact Sheet</span>
                    </label>
                  </div>

                  <button className="mt-4 w-full py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700">
                    Generate Package
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* RIGHT: Matrix Sidebar */}
        <aside className="w-72 bg-white border-l border-gray-200 flex flex-col shrink-0">

          {/* Matrix Section Selector */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setMatrixSection('endorsements')}
              className={`flex-1 py-2.5 text-xs font-medium ${
                matrixSection === 'endorsements'
                  ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/50'
                  : 'text-slate-500 hover:bg-gray-50'
              }`}
            >
              Endorsements
            </button>
            <button
              onClick={() => setMatrixSection('subjectivities')}
              className={`flex-1 py-2.5 text-xs font-medium ${
                matrixSection === 'subjectivities'
                  ? 'text-purple-700 border-b-2 border-purple-600 bg-purple-50/50'
                  : 'text-slate-500 hover:bg-gray-50'
              }`}
            >
              Subjectivities
            </button>
          </div>

          {/* Matrix Header */}
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center">
              <div className="flex-1 text-[10px] font-bold text-slate-500 uppercase">Item</div>
              {quotes.map((q) => (
                <div
                  key={q.id}
                  className={`w-8 text-center text-[10px] font-bold ${
                    q.id === selectedQuoteId ? 'text-purple-700' : 'text-slate-400'
                  }`}
                >
                  {q.id}
                </div>
              ))}
            </div>
          </div>

          {/* Matrix Content */}
          <div className="flex-1 overflow-auto">

            {matrixSection === 'endorsements' && (
              <div className="divide-y divide-gray-50">
                {endorsements.map((item) => (
                  <div key={item.id} className={`px-3 py-2 flex items-center ${item.type === 'required' ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-1">
                        {item.type === 'required' && <Lock size={10} className="text-slate-400 shrink-0"/>}
                        {item.type === 'auto' && <Zap size={10} className="text-amber-500 shrink-0"/>}
                        <span className="text-xs text-slate-700 truncate">{item.name}</span>
                      </div>
                    </div>
                    {quotes.map((q) => (
                      <div key={q.id} className={`w-8 flex justify-center ${q.id === selectedQuoteId ? 'bg-purple-50' : ''}`}>
                        {item.type === 'required' ? (
                          <Check size={14} className="text-slate-300"/>
                        ) : (
                          <input
                            type="checkbox"
                            checked={item.assigned[q.id]}
                            onChange={() => {}}
                            className="accent-purple-600 w-3.5 h-3.5"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {matrixSection === 'subjectivities' && (
              <div className="divide-y divide-gray-50">
                {subjectivities.map((item) => (
                  <div key={item.id} className="px-3 py-2 flex items-center hover:bg-gray-50">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="text-xs text-slate-700 truncate">{item.text}</div>
                      <span className={`text-[10px] px-1 py-0.5 rounded ${
                        item.status === 'received' ? 'bg-green-100 text-green-700' :
                        item.status === 'waived' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    {quotes.map((q) => (
                      <div key={q.id} className={`w-8 flex justify-center ${q.id === selectedQuoteId ? 'bg-purple-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={item.assigned[q.id]}
                          onChange={() => {}}
                          className="accent-purple-600 w-3.5 h-3.5"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Matrix Actions */}
          <div className="p-3 border-t border-gray-200 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <input
                type="text"
                placeholder={`Add ${matrixSection === 'endorsements' ? 'endorsement' : 'subjectivity'}...`}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
              />
              <button className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-slate-600">
                <Plus size={14}/>
              </button>
            </div>
            <button className="w-full py-1.5 text-xs text-purple-600 border border-purple-200 rounded hover:bg-purple-50">
              Add to All Options
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default QuoteCompactCommand;
