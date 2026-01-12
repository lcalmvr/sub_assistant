import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
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
  ChevronRight,
  Layers,
  Settings,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Zap,
  Edit3,
  Download,
  Eye,
  FileSignature,
  X,
  Clock,
  Bell
} from 'lucide-react';

const QuoteDashboardOverview = () => {
  const [selectedQuoteId, setSelectedQuoteId] = useState(1);
  const [activeTab, setActiveTab] = useState('structure');
  const [showSidebar, setShowSidebar] = useState(true);
  const [expandedEnhancements, setExpandedEnhancements] = useState({});
  const [editingRetro, setEditingRetro] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Mock data
  const quotes = [
    { id: 1, name: '$5M xs $5M', premium: '$50,000', limit: '$5M', position: 'excess', status: 'draft', descriptor: 'Standard Annual', tower: '$5M xs $5M' },
    { id: 2, name: '$5M xs $5M', premium: '$75,000', limit: '$5M', position: 'excess', status: 'quoted', descriptor: '18 Month (ODDL)', tower: '$5M xs $5M' },
    { id: 3, name: '$2M x $25K', premium: '$35,000', limit: '$2M', position: 'primary', status: 'draft', descriptor: 'Primary Option', tower: '$2M x $25K' },
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
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800">
      
      {/* Header */}
      <nav className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Karbon Steel</h1>
          <p className="text-xs text-slate-500">Quote Options</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">
            View All Documents
          </button>
        </div>
      </nav>

      <div className="flex">
        {/* Main Content */}
        <div className="flex-1">
          
          {/* Quote Options Grid */}
          <div className="p-6">
            <div className="grid grid-cols-3 gap-4 mb-6">
              {quotes.map((quote) => (
                <div
                  key={quote.id}
                  onClick={() => setSelectedQuoteId(quote.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedQuoteId === quote.id
                      ? 'border-purple-500 bg-purple-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-base font-bold text-slate-900">{quote.name}</div>
                      {quote.descriptor && (
                        <div className="text-xs text-slate-500 mt-0.5">{quote.descriptor}</div>
                      )}
                    </div>
                    {getStatusBadge(quote.status)}
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <div>
                      <div className="text-xs text-slate-500">Premium</div>
                      <div className="font-semibold text-slate-900">{quote.premium}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Limit</div>
                      <div className="font-semibold text-slate-900">{quote.limit}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Tower</div>
                      <div className="font-semibold text-slate-900 text-xs">{quote.tower}</div>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Add New Quote Card */}
              <div
                onClick={() => setShowCreateModal(true)}
                className="p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-purple-400 hover:bg-purple-50 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[120px]"
              >
                <Plus size={24} className="text-gray-400 mb-2"/>
                <span className="text-sm font-medium text-gray-600">New Quote</span>
              </div>
            </div>

            {/* Detail Panel (Expandable) */}
            {selectedQuote && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {/* Tab Navigation */}
                <div className="border-b border-gray-200 flex gap-6 px-6">
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
                    onClick={() => setActiveTab('pricing')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'pricing'
                        ? 'border-purple-600 text-purple-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Pricing
                  </button>
                  <button
                    onClick={() => setActiveTab('endorsements')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'endorsements'
                        ? 'border-purple-600 text-purple-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Endorsements
                  </button>
                  <button
                    onClick={() => setActiveTab('subjectivities')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'subjectivities'
                        ? 'border-purple-600 text-purple-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Subjectivities
                  </button>
                  <button
                    onClick={() => setActiveTab('documents')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'documents'
                        ? 'border-purple-600 text-purple-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Documents
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                  
                  {/* STRUCTURE TAB */}
                  {activeTab === 'structure' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-slate-900">Tower Structure</h3>
                        <button className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1">
                          <Edit3 size={14}/> Edit Tower
                        </button>
                      </div>

                      {/* Visual Tower Stack */}
                      <div className="flex items-center gap-12">
                        <div className="w-48 flex flex-col relative">
                          <div className="absolute -left-12 top-0 bottom-0 flex flex-col justify-between py-2 text-[10px] text-slate-400 font-mono text-right pr-2 border-r border-gray-100">
                            <span>$20M</span>
                            <span>$10M</span>
                            <span>$5M</span>
                            <span>$0</span>
                          </div>
                          <div className="space-y-1 w-full">
                            {towerLayers.map((layer) => (
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
                                <th className="pb-3 text-right">Premium</th>
                                <th className="pb-3 text-right">RPM</th>
                                <th className="pb-3 text-right">ILF</th>
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
                                      <span className="font-medium text-slate-700">{layer.carrier}</span>
                                    )}
                                  </td>
                                  <td className="py-3 font-medium">{layer.limit}</td>
                                  <td className="py-3 font-medium">{layer.attach}</td>
                                  <td className="py-3 text-right">
                                    {layer.premium ? `$${layer.premium.toLocaleString()}` : '—'}
                                  </td>
                                  <td className="py-3 text-right">
                                    {layer.rpm ? `$${layer.rpm}K` : '—'}
                                  </td>
                                  <td className="py-3 text-right">
                                    {layer.ilf ? layer.ilf.toFixed(2) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* POLICY & DATES TAB */}
                  {activeTab === 'policy' && (
                    <div className="space-y-6">
                      {/* Policy Dates Section */}
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 mb-4">Policy Dates</h3>
                        <div className="grid grid-cols-2 gap-4 mb-4">
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
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
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
                      <div>
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
                    <div>
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
                  )}

                  {/* Other tabs placeholder */}
                  {activeTab === 'pricing' && (
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-4">Pricing</h3>
                      <p className="text-sm text-slate-500">Pricing configuration...</p>
                    </div>
                  )}

                  {activeTab === 'endorsements' && (
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-4">Endorsements</h3>
                      <p className="text-sm text-slate-500">Endorsement management...</p>
                    </div>
                  )}

                  {activeTab === 'subjectivities' && (
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-4">Subjectivities</h3>
                      <p className="text-sm text-slate-500">Subjectivity management...</p>
                    </div>
                  )}

                  {activeTab === 'documents' && (
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-4">Documents</h3>
                      <div className="flex gap-2">
                        <button className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                          Generate Quote
                        </button>
                        <button className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">
                          Generate Full Package
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar (Collapsible) */}
        {showSidebar && (
          <aside className="w-80 bg-white border-l border-gray-200 flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">Quick Reference</h3>
              <button
                onClick={() => setShowSidebar(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16}/>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Submission Summary */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Submission</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-slate-500">Applicant</div>
                    <div className="font-medium text-slate-900">Karbon Steel</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Revenue</div>
                    <div className="font-medium text-slate-900">$5.0B</div>
                  </div>
                </div>
              </div>

              {/* Latest Document */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Latest Document</h4>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="text-sm font-medium text-slate-900 mb-1">Quote Document</div>
                  <div className="text-xs text-slate-500 mb-2">Dec 30, 2026</div>
                  <button className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                    <Eye size={12}/> View PDF
                  </button>
                </div>
              </div>

              {/* Pending Actions */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Pending Actions</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                    <Bell size={14} className="text-amber-600"/>
                    <span className="text-amber-800">2 pending subjectivities</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                    <Clock size={14} className="text-blue-600"/>
                    <span className="text-blue-800">Review quote Option 2</span>
                  </div>
                </div>
              </div>

              {/* Recent Changes */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Recent Changes</h4>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                    <span>Updated tower structure</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    <span>Added enhancement</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        {!showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 border-r-0 rounded-l-lg px-2 py-4 shadow-md hover:bg-gray-50"
          >
            <ChevronRight size={16} className="text-slate-400"/>
          </button>
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 flex items-center justify-center z-50"
      >
        <Plus size={24}/>
      </button>

      {/* Create Modal (placeholder) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create New Quote Option</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20}/>
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">Quote creation form would go here...</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteDashboardOverview;

