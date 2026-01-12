import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  Check, 
  Search,
  Calendar,
  DollarSign,
  Percent,
  FileText,
  Lock,
  Shield,
  ChevronDown,
  ChevronUp,
  Layers,
  Settings,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Zap,
  Edit3,
  Download,
  Eye,
  FileSignature
} from 'lucide-react';

const QuoteSplitViewMatrix = () => {
  const [selectedQuoteId, setSelectedQuoteId] = useState(1);
  const [activeTab, setActiveTab] = useState('structure');
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const [assignmentTab, setAssignmentTab] = useState('endorsements');
  const [expandedEnhancements, setExpandedEnhancements] = useState({});
  const [editingRetro, setEditingRetro] = useState(false);

  // Mock data
  const quotes = [
    { id: 1, name: '$5M xs $5M', premium: '$50,000', limit: '$5M', position: 'excess', status: 'draft', descriptor: 'Standard Annual' },
    { id: 2, name: '$5M xs $5M', premium: '$75,000', limit: '$5M', position: 'excess', status: 'quoted', descriptor: '18 Month (ODDL)' },
    { id: 3, name: '$2M x $25K', premium: '$35,000', limit: '$2M', position: 'primary', status: 'draft', descriptor: 'Primary Option' },
  ];

  const selectedQuote = quotes.find(q => q.id === selectedQuoteId) || quotes[0];

  const towerLayers = [
    { id: 1, carrier: 'TBD', limit: '$10,000,000', attach: '$10,000,000', type: 'excess', premium: null, rpm: null, ilf: null },
    { id: 2, carrier: 'CMAI', limit: '$5,000,000', attach: '$5,000,000', type: 'ours', premium: 50000, rpm: 10, ilf: 1.0 },
    { id: 3, carrier: 'Beazley', limit: '$5,000,000', attach: '$0', type: 'underlying', premium: null, rpm: null, ilf: null },
  ];

  const enhancements = [
    { id: 1, type: 'Additional Insured', summary: 'ABC Corp, XYZ Inc', autoEndorsement: 'END-AI-001' },
    { id: 2, type: 'Modified ERP', summary: 'Extended Reporting Period: 60 months', autoEndorsement: 'END-ERP-002' },
  ];

  const retroSchedule = [
    { coverage: 'Cyber Liability', retro: 'Full Prior Acts' },
    { coverage: 'Privacy Liability', retro: 'Inception' },
    { coverage: 'Network Security', retro: 'Date', date: '01/01/2020' },
  ];

  const endorsements = [
    { id: 1, name: 'War & Terrorism Exclusion', type: 'required', assignedTo: [1, 2] },
    { id: 2, name: 'Biometric Exclusion', type: 'optional', assignedTo: [2] },
    { id: 3, name: 'Excess Follow Form', type: 'optional', assignedTo: [1, 2] },
  ];

  const subjectivities = [
    { id: 1, text: 'Copy of Underlying Policies', assignedTo: [1, 2], status: 'pending' },
    { id: 2, text: 'Year 2 Financials', assignedTo: [2], status: 'pending' },
  ];

  const getStatusBadge = (status) => {
    const badges = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'DRAFT' },
      quoted: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'QUOTED' },
      bound: { bg: 'bg-green-100', text: 'text-green-700', label: 'BOUND' },
    };
    const badge = badges[status] || badges.draft;
    return (
      <span className={`text-xs font-bold px-2 py-0.5 rounded ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      
      {/* TOP BAR: Context Header */}
      <nav className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-sm font-bold text-slate-900">Karbon Steel</div>
            <div className="text-xs text-slate-500">{selectedQuote.name} {selectedQuote.descriptor && `- ${selectedQuote.descriptor}`}</div>
          </div>
          <input 
            type="text" 
            placeholder="descriptor"
            className="text-xs px-2 py-1 border border-transparent hover:border-gray-300 rounded focus:border-purple-500 focus:outline-none"
            defaultValue={selectedQuote.descriptor}
          />
          {getStatusBadge(selectedQuote.status)}
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1">
            <Download size={14}/> Generate PDF
          </button>
          {selectedQuote.status === 'quoted' && (
            <button className="px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1">
              <FileSignature size={14}/> Bind
            </button>
          )}
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL: Quote Options Selector */}
        <aside className="w-[380px] bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <button className="w-full px-3 py-2 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center justify-center gap-2">
              <Plus size={14}/> New Option
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <div className="p-2 space-y-2">
              {quotes.map((quote) => (
                <button
                  key={quote.id}
                  onClick={() => setSelectedQuoteId(quote.id)}
                  className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                    selectedQuoteId === quote.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">{quote.name}</div>
                      {quote.descriptor && (
                        <div className="text-xs text-slate-500 mt-0.5">{quote.descriptor}</div>
                      )}
                    </div>
                    {getStatusBadge(quote.status)}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    <span className="text-slate-600">{quote.premium}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">{quote.limit}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      quote.position === 'excess' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {quote.position === 'excess' ? 'XS' : 'PRIMARY'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* RIGHT PANEL: Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          
          {/* Tab Navigation */}
          <div className="bg-white border-b border-gray-200 px-6 flex gap-6">
            <button
              onClick={() => setActiveTab('structure')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'structure'
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Structure
            </button>
            <button
              onClick={() => setActiveTab('policy')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'policy'
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Policy & Dates
            </button>
            <button
              onClick={() => setActiveTab('enhancements')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'enhancements'
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Enhancements
            </button>
            <button
              onClick={() => setActiveTab('assignment')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'assignment'
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Assignment Matrix
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto p-6">
            
            {/* STRUCTURE TAB */}
            {activeTab === 'structure' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900">Tower Structure</h3>
                    <button
                      onClick={() => setShowAdvancedMetrics(!showAdvancedMetrics)}
                      className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                    >
                      {showAdvancedMetrics ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                      {showAdvancedMetrics ? 'Hide' : 'Show'} Advanced Metrics
                    </button>
                  </div>

                  {/* Visual Tower Stack */}
                  <div className="mb-6">
                    <div className="flex items-center gap-12">
                      {/* Visual Stack */}
                      <div className="w-48 flex flex-col relative">
                        <div className="absolute -left-12 top-0 bottom-0 flex flex-col justify-between py-2 text-[10px] text-slate-400 font-mono text-right pr-2 border-r border-gray-100">
                          <span>$20M</span>
                          <span>$10M</span>
                          <span>$5M</span>
                          <span>$0</span>
                        </div>
                        <div className="space-y-1 w-full">
                          {towerLayers.map((layer, idx) => (
                            <div
                              key={layer.id}
                              className={`h-16 flex flex-col items-center justify-center text-xs rounded border ${
                                layer.type === 'ours'
                                  ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-4 ring-purple-50'
                                  : layer.type === 'excess'
                                  ? 'bg-slate-100 border-slate-300 text-slate-500'
                                  : 'bg-slate-200 border-slate-300 text-slate-600'
                              }`}
                            >
                              {layer.type === 'ours' && (
                                <span className="text-[10px] uppercase font-bold tracking-wider opacity-80 mb-1">Our Layer</span>
                              )}
                              <span className="font-bold">{layer.limit}</span>
                              {layer.type !== 'excess' && (
                                <span className="text-[10px] opacity-75">xs {layer.attach}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Details Table */}
                      <div className="flex-1 border-l border-gray-100 pl-8">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs text-slate-400 uppercase font-semibold">
                            <tr>
                              <th className="pb-3 pl-2">Carrier</th>
                              <th className="pb-3">Limit</th>
                              <th className="pb-3">Attach</th>
                              {showAdvancedMetrics && (
                                <>
                                  <th className="pb-3 text-right">Premium</th>
                                  <th className="pb-3 text-right">RPM</th>
                                  <th className="pb-3 text-right">ILF</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-slate-700">
                            {towerLayers.map((layer) => (
                              <tr key={layer.id} className={layer.type === 'ours' ? 'bg-purple-50/50' : 'hover:bg-gray-50'}>
                                <td className="py-3 pl-2">
                                  {layer.type === 'ours' ? (
                                    <span className="font-bold text-purple-700 flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-purple-600"></div> CMAI (Ours)
                                    </span>
                                  ) : (
                                    <input
                                      type="text"
                                      defaultValue={layer.carrier}
                                      className="w-full bg-transparent outline-none font-medium text-slate-700 focus:bg-white border border-transparent focus:border-purple-300 rounded px-2 py-1"
                                    />
                                  )}
                                </td>
                                <td className="py-3">
                                  <input
                                    type="text"
                                    defaultValue={layer.limit}
                                    className="w-24 bg-transparent outline-none font-mono text-slate-600 focus:bg-white border border-transparent focus:border-purple-300 rounded px-1"
                                  />
                                </td>
                                <td className="py-3">
                                  <input
                                    type="text"
                                    defaultValue={layer.attach}
                                    className="w-24 bg-transparent outline-none font-mono text-slate-600 focus:bg-white border border-transparent focus:border-purple-300 rounded px-1"
                                  />
                                </td>
                                {showAdvancedMetrics && (
                                  <>
                                    <td className="py-3 text-right">
                                      {layer.premium ? `$${layer.premium.toLocaleString()}` : '—'}
                                    </td>
                                    <td className="py-3 text-right">
                                      {layer.rpm ? `$${layer.rpm}K` : '—'}
                                    </td>
                                    <td className="py-3 text-right">
                                      {layer.ilf ? layer.ilf.toFixed(2) : '—'}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Policy Dates (in Structure tab, using AppQuote2 design) */}
                  <div className="pt-6 border-t border-gray-100">
                    <h4 className="text-sm font-bold text-slate-700 mb-3">Policy Dates</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Effective Date</label>
                        <div className="relative">
                          <Calendar size={14} className="absolute left-2 top-2.5 text-slate-400"/>
                          <input 
                            type="text" 
                            defaultValue="12/30/2026"
                            className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded font-medium text-slate-700"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Expiration Date</label>
                        <div className="relative">
                          <Calendar size={14} className="absolute left-2 top-2.5 text-slate-400"/>
                          <input 
                            type="text" 
                            defaultValue="12/30/2027"
                            className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded font-medium text-slate-700"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <button className="text-xs text-purple-600 hover:text-purple-800">Clear dates</button>
                        <span className="text-xs text-slate-400">or use</span>
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">12 month policy period</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* POLICY & DATES TAB */}
            {activeTab === 'policy' && (
              <div className="space-y-6">
                {/* Policy Dates Section */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Policy Dates</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Effective Date</label>
                      <input 
                        type="date" 
                        defaultValue="2026-12-30"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Expiration Date</label>
                      <input 
                        type="date" 
                        defaultValue="2027-12-30"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">Policy Period:</span>
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded">
                          12 month policy period
                        </span>
                        <span className="text-xs text-gray-500">(dates to be determined)</span>
                      </div>
                      <button className="text-sm text-purple-600 hover:text-purple-800 font-medium">
                        Set specific dates
                      </button>
                    </div>
                  </div>
                </div>

                {/* Retro Schedule Editor */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900">Retroactive Dates</h3>
                    <div className="flex gap-2">
                      <button className="text-xs px-3 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100">
                        Apply to All
                      </button>
                      <button
                        onClick={() => setEditingRetro(!editingRetro)}
                        className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        {editingRetro ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">Per-coverage retro schedule</p>
                  
                  {editingRetro ? (
                    <div className="space-y-3">
                      {retroSchedule.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-4 p-3 border border-gray-200 rounded-lg">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-700 mb-2">{item.coverage}</div>
                            <div className="flex flex-wrap gap-2">
                              {['Full Prior Acts', 'Inception', 'Date', 'Follow Form'].map((option) => (
                                <button
                                  key={option}
                                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                                    item.retro === option
                                      ? 'border-purple-500 bg-purple-50 text-purple-700 font-medium'
                                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                                  }`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                            {item.retro === 'Date' && (
                              <input
                                type="date"
                                defaultValue={item.date ? item.date.replace(/\//g, '-') : ''}
                                className="mt-2 px-2 py-1 text-xs border border-gray-300 rounded"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {retroSchedule.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-4 py-2">
                          <span className="w-32 text-sm font-medium text-slate-700">{item.coverage}</span>
                          <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                            {item.retro} {item.date && `(${item.date})`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Retro Notes</label>
                    <textarea
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      rows={3}
                      placeholder="Additional notes about retroactive coverage..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ENHANCEMENTS TAB */}
            {activeTab === 'enhancements' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900">Enhancements & Modifications</h3>
                    <button className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1">
                      <Plus size={14}/> Add Enhancement
                    </button>
                  </div>

                  <div className="space-y-2">
                    {enhancements.map((enh) => (
                      <div key={enh.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="p-3 bg-gray-50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Zap size={16} className="text-amber-500"/>
                            <div>
                              <div className="text-sm font-medium text-slate-900">{enh.type}</div>
                              <div className="text-xs text-slate-500">{enh.summary}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {enh.autoEndorsement && (
                              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                                Auto: {enh.autoEndorsement}
                              </span>
                            )}
                            <button
                              onClick={() => setExpandedEnhancements({
                                ...expandedEnhancements,
                                [enh.id]: !expandedEnhancements[enh.id]
                              })}
                              className="text-xs text-purple-600 hover:text-purple-800"
                            >
                              {expandedEnhancements[enh.id] ? 'Collapse' : 'Edit'}
                            </button>
                            <button className="text-red-500 hover:text-red-700">
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </div>
                        {expandedEnhancements[enh.id] && (
                          <div className="p-4 bg-white border-t border-gray-200">
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Details</label>
                                <input
                                  type="text"
                                  defaultValue={enh.summary}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700">
                                  Save Changes
                                </button>
                                <button
                                  onClick={() => setExpandedEnhancements({
                                    ...expandedEnhancements,
                                    [enh.id]: false
                                  })}
                                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {enhancements.length === 0 && (
                    <div className="text-center text-gray-500 py-8 text-sm">
                      No enhancements added yet.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ASSIGNMENT MATRIX TAB */}
            {activeTab === 'assignment' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {/* Matrix Header */}
                  <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-end bg-gray-50">
                    <div className="flex gap-6">
                      <button
                        onClick={() => setAssignmentTab('endorsements')}
                        className={`pb-2 text-sm font-bold border-b-2 ${
                          assignmentTab === 'endorsements'
                            ? 'border-purple-600 text-purple-700'
                            : 'border-transparent text-slate-500'
                        }`}
                      >
                        Endorsements
                      </button>
                      <button
                        onClick={() => setAssignmentTab('subjectivities')}
                        className={`pb-2 text-sm font-bold border-b-2 ${
                          assignmentTab === 'subjectivities'
                            ? 'border-purple-600 text-purple-700'
                            : 'border-transparent text-slate-500'
                        }`}
                      >
                        Subjectivities
                      </button>
                      <button
                        onClick={() => setAssignmentTab('coverages')}
                        className={`pb-2 text-sm font-bold border-b-2 ${
                          assignmentTab === 'coverages'
                            ? 'border-purple-600 text-purple-700'
                            : 'border-transparent text-slate-500'
                        }`}
                      >
                        Coverages
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-white border border-gray-200 rounded px-2 py-1 flex items-center gap-2 w-64">
                        <Search size={14} className="text-slate-400"/>
                        <input
                          type="text"
                          placeholder={`Add ${assignmentTab}...`}
                          className="text-xs outline-none w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Matrix Table */}
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white text-xs text-slate-500 uppercase font-semibold border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3 w-1/2">Item Name</th>
                        {quotes.map((quote) => (
                          <th key={quote.id} className={`px-2 py-3 text-center border-l border-gray-50 w-24 ${
                            selectedQuoteId === quote.id ? 'bg-purple-50/30' : ''
                          }`}>
                            <span className="block text-slate-800">{quote.name}</span>
                            <span className="text-[9px] text-slate-400">{quote.descriptor}</span>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {assignmentTab === 'endorsements' && endorsements.map((item) => (
                        <tr key={item.id} className={item.type === 'required' ? 'bg-gray-50/50' : 'hover:bg-gray-50'}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              {item.type === 'required' ? (
                                <Lock size={14} className="text-slate-400"/>
                              ) : (
                                <FileText size={14} className="text-slate-400"/>
                              )}
                              <span className="font-medium text-slate-700">{item.name}</span>
                              {item.type === 'required' && (
                                <span className="text-[10px] text-slate-400">Mandatory</span>
                              )}
                            </div>
                          </td>
                          {quotes.map((quote) => (
                            <td key={quote.id} className={`px-2 py-3 text-center border-l border-gray-100 ${
                              selectedQuoteId === quote.id ? 'bg-purple-50/10' : ''
                            }`}>
                              {item.type === 'required' ? (
                                <Check size={16} className="mx-auto text-slate-300"/>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={item.assignedTo.includes(quote.id)}
                                  className="accent-purple-600 w-4 h-4 rounded cursor-pointer"
                                />
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right">
                            {item.type !== 'required' && (
                              <button className="text-slate-400 hover:text-red-500">
                                <Trash2 size={14}/>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {assignmentTab === 'subjectivities' && subjectivities.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-amber-500">⚡</span>
                              <div>
                                <span className="font-medium text-slate-900 block">{item.text}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  item.status === 'received' ? 'bg-green-100 text-green-800' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {item.status}
                                </span>
                              </div>
                            </div>
                          </td>
                          {quotes.map((quote) => (
                            <td key={quote.id} className={`px-2 py-3 text-center border-l border-gray-100 ${
                              selectedQuoteId === quote.id ? 'bg-purple-50/10' : ''
                            }`}>
                              <input
                                type="checkbox"
                                checked={item.assignedTo.includes(quote.id)}
                                className="accent-purple-600 w-4 h-4 rounded cursor-pointer"
                              />
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right">
                            <button className="text-slate-400 hover:text-red-500">
                              <Trash2 size={14}/>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* BOTTOM STICKY BAR */}
      <div className="h-16 bg-white border-t border-gray-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-slate-500">Total Premium</div>
            <div className="text-lg font-bold text-slate-900">$160,000</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Pending Subjectivities</div>
            <div className="text-lg font-bold text-amber-600">2</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 text-xs font-medium border border-gray-300 rounded hover:bg-gray-50">
            Apply to All Quotes
          </button>
          <button className="px-4 py-2 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700">
            Save All Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuoteSplitViewMatrix;

