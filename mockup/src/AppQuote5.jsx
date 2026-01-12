import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Search,
  Calendar,
  DollarSign,
  FileText,
  Lock,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Zap,
  Download,
  FileSignature,
  X,
  Copy,
  MoreVertical,
  Layers,
  Settings2,
  Eye,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  Link2,
  Unlink
} from 'lucide-react';

/**
 * AppQuote5 - "Command Center" Design
 *
 * Key innovations:
 * 1. Quote options as horizontal tabs (like browser tabs) - always visible
 * 2. Persistent right sidebar showing cross-option assignment matrix
 * 3. Main content area for selected quote's details
 * 4. Clear visual indicators for "shared" vs "option-specific" settings
 *
 * Addresses pain point: "Managing options and sharing settings between them"
 * by making cross-option visibility always accessible.
 */
const QuoteCommandCenter = () => {
  const [selectedQuoteId, setSelectedQuoteId] = useState(1);
  const [activeSection, setActiveSection] = useState('structure');
  const [showMatrix, setShowMatrix] = useState(true);
  const [matrixTab, setMatrixTab] = useState('endorsements');
  const [towerEditMode, setTowerEditMode] = useState(false);
  const [showQS, setShowQS] = useState(false);

  // Mock data representing actual system capabilities
  const quotes = [
    {
      id: 1,
      name: '$5M xs $5M',
      descriptor: 'Standard Annual',
      position: 'excess',
      status: 'quoted',
      soldPremium: 52500,
      riskAdjusted: 55000,
      technical: 58000,
      retention: 5000000,
      policyForm: 'FF-CYBER-2024'
    },
    {
      id: 2,
      name: '$5M xs $5M',
      descriptor: '18 Month ODDL',
      position: 'excess',
      status: 'draft',
      soldPremium: null,
      riskAdjusted: 78750,
      technical: 82500,
      retention: 5000000,
      policyForm: 'FF-CYBER-2024'
    },
    {
      id: 3,
      name: '$2M x $25K',
      descriptor: 'Primary Option',
      position: 'primary',
      status: 'draft',
      soldPremium: null,
      riskAdjusted: 38500,
      technical: 42000,
      retention: 25000,
      policyForm: 'CM-CYBER-2024'
    },
  ];

  const selectedQuote = quotes.find(q => q.id === selectedQuoteId) || quotes[0];

  // Tower layers with quota share support
  const towerLayers = selectedQuote.position === 'excess' ? [
    { id: 1, carrier: 'TBD', limit: 10000000, attach: 10000000, quotaShare: null, premium: null, rpm: null },
    { id: 2, carrier: 'CMAI', limit: 2500000, attach: 5000000, quotaShare: 5000000, premium: 26250, rpm: 10.5 },
    { id: 3, carrier: 'Partner Re', limit: 2500000, attach: 5000000, quotaShare: 5000000, premium: 26250, rpm: 10.5 },
    { id: 4, carrier: 'Beazley', limit: 5000000, attach: 0, quotaShare: null, premium: null, rpm: null },
  ] : [
    { id: 1, carrier: 'CMAI', limit: 2000000, attach: 25000, quotaShare: null, premium: 38500, rpm: 19.25, isCMAI: true },
  ];

  // Endorsements with per-quote assignment
  const endorsements = [
    { id: 1, code: 'END-WAR-001', name: 'War & Terrorism Exclusion', type: 'required', positions: ['primary', 'excess'], assignedTo: [1, 2, 3] },
    { id: 2, code: 'END-OFAC-001', name: 'OFAC Sanctions Compliance', type: 'required', positions: ['primary', 'excess'], assignedTo: [1, 2, 3] },
    { id: 3, code: 'END-BIO-001', name: 'Biometric Exclusion', type: 'optional', positions: ['primary', 'excess'], assignedTo: [2], autoReason: null },
    { id: 4, code: 'END-AI-001', name: 'Additional Insured Schedule', type: 'auto', positions: ['primary', 'excess'], assignedTo: [1], autoReason: 'Enhancement: Additional Insureds' },
    { id: 5, code: 'END-ERP-001', name: 'Extended Reporting Period', type: 'auto', positions: ['primary', 'excess'], assignedTo: [2], autoReason: 'Enhancement: Modified ERP' },
  ];

  // Subjectivities with per-quote assignment and status
  const subjectivities = [
    { id: 1, text: 'Copy of Underlying Policies', status: 'pending', assignedTo: [1, 2], isTemplate: true },
    { id: 2, text: 'Year 2 Financials (for extended term)', status: 'pending', assignedTo: [2], isTemplate: false },
    { id: 3, text: 'Signed Application', status: 'received', assignedTo: [1, 2, 3], isTemplate: true },
    { id: 4, text: 'Prior Acts Warranty', status: 'waived', assignedTo: [3], isTemplate: true },
  ];

  // Enhancements with auto-attach indication
  const enhancements = [
    { id: 1, type: 'ADD-INSURED', name: 'Additional Insured Schedule', summary: 'ABC Corp, XYZ Inc (+1 more)', linkedEndorsement: 'END-AI-001' },
    { id: 2, type: 'MOD-ERP', name: 'Modified ERP Terms', summary: '60 days basic, 90 days supplemental', linkedEndorsement: 'END-ERP-001' },
  ];

  const formatCurrency = (val) => {
    if (!val) return '—';
    return '$' + val.toLocaleString();
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'bound': return 'bg-green-100 text-green-800';
      case 'quoted': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getSubjStatusStyle = (status) => {
    switch (status) {
      case 'received': return 'bg-green-100 text-green-700';
      case 'waived': return 'bg-blue-100 text-blue-700';
      default: return 'bg-amber-100 text-amber-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">

      {/* TOP BAR: Submission Context + Actions */}
      <nav className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-sm font-bold text-slate-900">Karbon Steel Industries</div>
            <div className="text-xs text-slate-500">$5.0B Revenue · Tech Manufacturing · New Business</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1">
            <Eye size={14}/> Preview
          </button>
          <button className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1">
            <Download size={14}/> Generate PDF
          </button>
          {selectedQuote.status === 'quoted' && (
            <button className="px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1">
              <FileSignature size={14}/> Bind
            </button>
          )}
        </div>
      </nav>

      {/* QUOTE OPTION TABS - Always visible, browser-tab style */}
      <div className="bg-white border-b border-gray-200 px-4 flex items-end gap-1 pt-2">
        {quotes.map((quote) => (
          <button
            key={quote.id}
            onClick={() => setSelectedQuoteId(quote.id)}
            className={`group px-4 py-2.5 rounded-t-lg border-t border-x flex items-center gap-3 transition-all ${
              selectedQuoteId === quote.id
                ? 'bg-white border-gray-200 -mb-px'
                : 'bg-gray-50 border-gray-100 text-slate-500 hover:bg-gray-100'
            }`}
          >
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${selectedQuoteId === quote.id ? 'text-slate-900' : 'text-slate-600'}`}>
                  {quote.name}
                </span>
                {quote.status === 'bound' && <CheckCircle2 size={14} className="text-green-600"/>}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  quote.position === 'excess' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
                }`}>
                  {quote.position === 'excess' ? 'XS' : 'PRI'}
                </span>
              </div>
              {quote.descriptor && (
                <span className="text-[10px] text-slate-400">{quote.descriptor}</span>
              )}
            </div>
            <span className={`text-xs font-bold ${selectedQuoteId === quote.id ? 'text-purple-700' : 'text-slate-500'}`}>
              {formatCurrency(quote.soldPremium || quote.riskAdjusted)}
            </span>
            <button
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 ml-1"
              onClick={(e) => { e.stopPropagation(); }}
            >
              <MoreVertical size={14}/>
            </button>
          </button>
        ))}

        {/* Add New Option */}
        <button className="px-3 py-2 text-xs text-slate-500 hover:text-purple-600 flex items-center gap-1">
          <Plus size={14}/> New Option
        </button>

        {/* Clone Current */}
        <button className="px-3 py-2 text-xs text-slate-500 hover:text-purple-600 flex items-center gap-1">
          <Copy size={14}/> Clone
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Section Nav (scrollable if needed) */}
          <div className="bg-white border-b border-gray-100 px-6 flex gap-1 overflow-x-auto">
            {[
              { id: 'structure', label: 'Structure' },
              { id: 'pricing', label: 'Pricing' },
              { id: 'dates', label: 'Dates & Retro' },
              { id: 'coverages', label: 'Coverages' },
              { id: 'enhancements', label: 'Enhancements' },
              { id: 'documents', label: 'Documents' },
            ].map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeSection === section.id
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto p-6 bg-slate-50">

            {/* STRUCTURE SECTION */}
            {activeSection === 'structure' && (
              <div className="space-y-6 max-w-4xl">

                {/* Premium Summary Card */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Premium Summary</h3>
                    <span className={`text-xs px-2 py-1 rounded font-bold ${getStatusStyle(selectedQuote.status)}`}>
                      {selectedQuote.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Technical Premium</div>
                      <div className="text-lg font-mono text-slate-600">{formatCurrency(selectedQuote.technical)}</div>
                    </div>
                    <div className="bg-purple-50 -mx-2 px-2 py-1 rounded">
                      <div className="text-xs text-purple-600 mb-1">Risk-Adjusted</div>
                      <div className="text-lg font-mono font-bold text-purple-700">{formatCurrency(selectedQuote.riskAdjusted)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Sold Premium</div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">$</span>
                        <input
                          type="text"
                          defaultValue={selectedQuote.soldPremium?.toLocaleString() || ''}
                          placeholder="Enter sold premium"
                          className="text-lg font-mono font-bold text-slate-900 bg-transparent border-b-2 border-dashed border-slate-300 focus:border-purple-500 outline-none w-28"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tower Structure */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-3">
                      <Layers size={18} className="text-slate-500"/>
                      <h3 className="text-sm font-bold text-slate-700">Tower Structure</h3>
                      {showQS && (
                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Quota Share Active</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showQS}
                          onChange={() => setShowQS(!showQS)}
                          className="accent-purple-600"
                        />
                        Show QS
                      </label>
                      <button
                        onClick={() => setTowerEditMode(!towerEditMode)}
                        className={`px-3 py-1 text-xs rounded ${
                          towerEditMode
                            ? 'bg-purple-600 text-white'
                            : 'border border-gray-300 text-slate-600 hover:bg-gray-50'
                        }`}
                      >
                        {towerEditMode ? 'Done' : 'Edit'}
                      </button>
                    </div>
                  </div>

                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="text-left px-5 py-3 w-1/4">Carrier</th>
                        <th className="text-right px-3 py-3">Limit</th>
                        {showQS && <th className="text-right px-3 py-3">Part Of</th>}
                        <th className="text-right px-3 py-3">Attach</th>
                        <th className="text-right px-3 py-3">Premium</th>
                        <th className="text-right px-3 py-3">RPM</th>
                        {towerEditMode && <th className="w-12"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {towerLayers.map((layer, idx) => {
                        const isCMAI = layer.carrier === 'CMAI';
                        const isQSIncomplete = layer.quotaShare && (
                          towerLayers.filter(l => l.attach === layer.attach && l.quotaShare === layer.quotaShare)
                            .reduce((sum, l) => sum + l.limit, 0) < layer.quotaShare
                        );

                        return (
                          <tr
                            key={layer.id}
                            className={`${isCMAI ? 'bg-purple-50' : ''} ${isQSIncomplete ? 'bg-amber-50' : ''}`}
                          >
                            <td className="px-5 py-3">
                              {isCMAI ? (
                                <span className="font-bold text-purple-700 flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-purple-600"></div>
                                  CMAI (Us)
                                </span>
                              ) : towerEditMode ? (
                                <input
                                  type="text"
                                  defaultValue={layer.carrier}
                                  className="w-full bg-transparent border-b border-gray-300 focus:border-purple-500 outline-none"
                                />
                              ) : (
                                <span className="text-slate-700">{layer.carrier}</span>
                              )}
                            </td>
                            <td className="text-right px-3 py-3 font-mono">
                              {towerEditMode ? (
                                <select className="text-right bg-transparent border-b border-gray-300 outline-none">
                                  <option>{formatCurrency(layer.limit)}</option>
                                </select>
                              ) : formatCurrency(layer.limit)}
                            </td>
                            {showQS && (
                              <td className={`text-right px-3 py-3 font-mono ${isQSIncomplete ? 'text-amber-700' : ''}`}>
                                {layer.quotaShare ? (
                                  <>
                                    {formatCurrency(layer.quotaShare)}
                                    {isQSIncomplete && <AlertTriangle size={12} className="inline ml-1 text-amber-600"/>}
                                  </>
                                ) : '—'}
                              </td>
                            )}
                            <td className="text-right px-3 py-3 font-mono text-slate-600">
                              {formatCurrency(layer.attach)}
                            </td>
                            <td className="text-right px-3 py-3 font-mono">
                              {layer.premium ? formatCurrency(layer.premium) : '—'}
                            </td>
                            <td className="text-right px-3 py-3 font-mono text-slate-500">
                              {layer.rpm ? `$${layer.rpm}K` : '—'}
                            </td>
                            {towerEditMode && (
                              <td className="px-2">
                                <button className="text-slate-400 hover:text-red-500">
                                  <Trash2 size={14}/>
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {towerEditMode && (
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
                      <button className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                        <Plus size={12}/> Add Layer Above
                      </button>
                      <button className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                        <Plus size={12}/> Add Layer Below
                      </button>
                    </div>
                  )}
                </div>

                {/* Primary-specific: Retention selector */}
                {selectedQuote.position === 'primary' && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-3">Policy Configuration</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Policy Limit</label>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency(2000000)}</div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Retention</label>
                        <select className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                          <option>$25,000</option>
                          <option>$50,000</option>
                          <option>$100,000</option>
                          <option>$150,000</option>
                          <option>$250,000</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Policy Form</label>
                        <div className="text-sm font-medium text-slate-900">{selectedQuote.policyForm}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ENHANCEMENTS SECTION */}
            {activeSection === 'enhancements' && (
              <div className="space-y-4 max-w-4xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Enhancements & Modifications</h3>
                    <p className="text-sm text-slate-500">Data components that auto-attach endorsements</p>
                  </div>
                  <button className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1">
                    <Plus size={14}/> Add Enhancement
                  </button>
                </div>

                <div className="space-y-2">
                  {enhancements.map((enh) => (
                    <div key={enh.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                            <Zap size={16} className="text-amber-600"/>
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{enh.name}</div>
                            <div className="text-xs text-slate-500">{enh.summary}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                            <Link2 size={12}/>
                            {enh.linkedEndorsement}
                          </div>
                          <button className="text-xs text-purple-600 hover:text-purple-800">Edit</button>
                          <button className="text-slate-400 hover:text-red-500">
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {enhancements.length === 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
                    <div className="text-slate-400 mb-2">No enhancements added</div>
                    <button className="text-sm text-purple-600 hover:text-purple-800">+ Add your first enhancement</button>
                  </div>
                )}
              </div>
            )}

            {/* DOCUMENTS SECTION */}
            {activeSection === 'documents' && (
              <div className="space-y-6 max-w-4xl">
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-4">Generate Documents</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 cursor-pointer transition-colors">
                      <div className="flex items-center gap-3 mb-2">
                        <FileText size={20} className="text-slate-500"/>
                        <div className="font-medium text-slate-900">Quote Only</div>
                      </div>
                      <p className="text-xs text-slate-500">Generate just the quote letter PDF</p>
                    </div>

                    <div className="border-2 border-purple-200 bg-purple-50 rounded-lg p-4 hover:border-purple-400 cursor-pointer transition-colors">
                      <div className="flex items-center gap-3 mb-2">
                        <Layers size={20} className="text-purple-600"/>
                        <div className="font-medium text-purple-900">Full Package</div>
                      </div>
                      <p className="text-xs text-purple-700">Quote + Endorsements + Specimen</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="text-xs font-medium text-slate-700 mb-2">Package Options:</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="checkbox" defaultChecked className="accent-purple-600"/>
                        Endorsement Package (3 endorsements)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="checkbox" defaultChecked className="accent-purple-600"/>
                        Policy Specimen
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="checkbox" className="accent-purple-600"/>
                        Claims Contact Sheet
                      </label>
                    </div>
                  </div>

                  <button className="mt-4 w-full py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700">
                    Generate Package
                  </button>
                </div>
              </div>
            )}

            {/* Other sections placeholder */}
            {['pricing', 'dates', 'coverages'].includes(activeSection) && (
              <div className="max-w-4xl">
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-2 capitalize">{activeSection}</h3>
                  <p className="text-sm text-slate-500">Content for {activeSection} section...</p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* RIGHT SIDEBAR: Assignment Matrix (Always Visible) */}
        {showMatrix && (
          <aside className="w-[380px] bg-white border-l border-gray-200 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-slate-500"/>
                <h3 className="text-xs font-bold text-slate-700 uppercase">Cross-Option Matrix</h3>
              </div>
              <button
                onClick={() => setShowMatrix(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={14}/>
              </button>
            </div>

            {/* Matrix Tab Selector */}
            <div className="flex border-b border-gray-200">
              {['endorsements', 'subjectivities'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMatrixTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-medium capitalize ${
                    matrixTab === tab
                      ? 'text-purple-700 border-b-2 border-purple-600'
                      : 'text-slate-500'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Matrix Content */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-500">Item</th>
                    {quotes.map((q) => (
                      <th
                        key={q.id}
                        className={`px-2 py-2 text-center w-12 ${
                          q.id === selectedQuoteId ? 'bg-purple-100' : ''
                        }`}
                      >
                        <span className={`text-[10px] ${q.id === selectedQuoteId ? 'text-purple-700 font-bold' : 'text-slate-500'}`}>
                          {q.name.split(' ')[0]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">

                  {matrixTab === 'endorsements' && endorsements.map((item) => (
                    <tr key={item.id} className={item.type === 'required' ? 'bg-gray-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {item.type === 'required' && <Lock size={10} className="text-slate-400"/>}
                          {item.type === 'auto' && <Zap size={10} className="text-amber-500"/>}
                          <span className={`${item.type === 'required' ? 'text-slate-500' : 'text-slate-700'}`}>
                            {item.name}
                          </span>
                        </div>
                        {item.autoReason && (
                          <div className="text-[10px] text-amber-600 mt-0.5">{item.autoReason}</div>
                        )}
                      </td>
                      {quotes.map((q) => {
                        const isAssigned = item.assignedTo.includes(q.id);
                        const isPositionMatch = item.positions.includes(q.position);

                        return (
                          <td key={q.id} className={`text-center px-2 py-2 ${q.id === selectedQuoteId ? 'bg-purple-50' : ''}`}>
                            {!isPositionMatch ? (
                              <span className="text-slate-300">—</span>
                            ) : item.type === 'required' ? (
                              <Check size={14} className="mx-auto text-slate-400"/>
                            ) : (
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                className="accent-purple-600 w-3.5 h-3.5 cursor-pointer"
                                onChange={() => {}}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {matrixTab === 'subjectivities' && subjectivities.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {item.isTemplate && <Zap size={10} className="text-amber-500"/>}
                          <span className="text-slate-700">{item.text}</span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block ${getSubjStatusStyle(item.status)}`}>
                          {item.status}
                        </span>
                      </td>
                      {quotes.map((q) => {
                        const isAssigned = item.assignedTo.includes(q.id);
                        return (
                          <td key={q.id} className={`text-center px-2 py-2 ${q.id === selectedQuoteId ? 'bg-purple-50' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              className="accent-purple-600 w-3.5 h-3.5 cursor-pointer"
                              onChange={() => {}}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Quick Add */}
            <div className="p-3 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2">
                <Search size={14} className="text-slate-400"/>
                <input
                  type="text"
                  placeholder={`Add ${matrixTab === 'endorsements' ? 'endorsement' : 'subjectivity'}...`}
                  className="flex-1 text-xs bg-transparent outline-none"
                />
              </div>
            </div>

            {/* Apply Actions */}
            <div className="p-3 border-t border-gray-200 space-y-2">
              <button className="w-full py-2 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700">
                Apply to All Options
              </button>
              <button className="w-full py-2 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50 text-slate-600">
                Copy from Another Option
              </button>
            </div>
          </aside>
        )}

        {/* Matrix Toggle (when hidden) */}
        {!showMatrix && (
          <button
            onClick={() => setShowMatrix(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 border-r-0 rounded-l-lg px-2 py-6 shadow-md hover:bg-gray-50"
          >
            <ChevronRight size={16} className="text-slate-400 rotate-180"/>
          </button>
        )}
      </div>
    </div>
  );
};

export default QuoteCommandCenter;
