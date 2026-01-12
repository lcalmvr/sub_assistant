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
  Unlink,
  ArrowRight,
  RefreshCw,
  Grid3X3,
  List,
  LayoutGrid,
  PanelLeftClose,
  PanelLeft,
  Maximize2,
  Minimize2,
  GitCompare
} from 'lucide-react';

/**
 * AppQuote6 - "Split Comparison" Design
 *
 * Key innovations:
 * 1. Split-pane view: Edit one option while viewing another side-by-side
 * 2. Visual diff highlighting for changes between options
 * 3. Bulk actions toolbar for cross-option operations
 * 4. Collapsible option list on left, comparison pane on right
 *
 * Addresses pain point: "Managing options and sharing settings between them"
 * by enabling direct visual comparison and targeted syncing.
 */
const QuoteSplitComparison = () => {
  const [primaryQuoteId, setPrimaryQuoteId] = useState(1);
  const [compareQuoteId, setCompareQuoteId] = useState(2);
  const [showCompare, setShowCompare] = useState(false);
  const [viewMode, setViewMode] = useState('split'); // 'split', 'single', 'matrix'
  const [activeSection, setActiveSection] = useState('overview');
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState([]);

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
      policyForm: 'FF-CYBER-2024',
      effectiveDate: '2026-12-30',
      expirationDate: '2027-12-30',
      endorsementCount: 4,
      subjectivityCount: 2,
      enhancementCount: 2
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
      policyForm: 'FF-CYBER-2024',
      effectiveDate: '2026-12-30',
      expirationDate: '2028-06-30',
      endorsementCount: 5,
      subjectivityCount: 3,
      enhancementCount: 1
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
      policyForm: 'CM-CYBER-2024',
      effectiveDate: null,
      expirationDate: null,
      endorsementCount: 3,
      subjectivityCount: 2,
      enhancementCount: 0
    },
  ];

  const primaryQuote = quotes.find(q => q.id === primaryQuoteId);
  const compareQuote = quotes.find(q => q.id === compareQuoteId);

  // Sample data for comparison
  const endorsementData = {
    1: ['END-WAR-001', 'END-OFAC-001', 'END-AI-001', 'END-FF-001'],
    2: ['END-WAR-001', 'END-OFAC-001', 'END-BIO-001', 'END-ERP-001', 'END-FF-001'],
    3: ['END-WAR-001', 'END-OFAC-001', 'END-CM-001'],
  };

  const subjectivityData = {
    1: [
      { text: 'Copy of Underlying Policies', status: 'pending' },
      { text: 'Signed Application', status: 'received' },
    ],
    2: [
      { text: 'Copy of Underlying Policies', status: 'pending' },
      { text: 'Year 2 Financials', status: 'pending' },
      { text: 'Signed Application', status: 'received' },
    ],
    3: [
      { text: 'Signed Application', status: 'received' },
      { text: 'Prior Acts Warranty', status: 'waived' },
    ],
  };

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

  const formatDate = (date) => {
    if (!date) return '12 month period';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const toggleQuoteSelection = (id) => {
    if (selectedQuoteIds.includes(id)) {
      setSelectedQuoteIds(selectedQuoteIds.filter(qid => qid !== id));
    } else {
      setSelectedQuoteIds([...selectedQuoteIds, id]);
    }
  };

  // Compare value helper - highlights differences
  const CompareValue = ({ primary, compare, format = 'text' }) => {
    const isDifferent = primary !== compare;
    const primaryVal = format === 'currency' ? formatCurrency(primary) : (format === 'date' ? formatDate(primary) : primary);
    const compareVal = format === 'currency' ? formatCurrency(compare) : (format === 'date' ? formatDate(compare) : compare);

    return (
      <div className={`${isDifferent && showCompare ? 'bg-amber-50 border-l-2 border-amber-400 pl-2 -ml-2' : ''}`}>
        <span className="font-medium">{primaryVal || '—'}</span>
        {showCompare && isDifferent && (
          <span className="text-xs text-amber-600 block">vs {compareVal}</span>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">

      {/* TOP BAR */}
      <nav className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-sm font-bold text-slate-900">Karbon Steel Industries</div>
            <div className="text-xs text-slate-500">$5.0B Revenue · Tech Manufacturing</div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => { setViewMode('single'); setShowCompare(false); }}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
              viewMode === 'single' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <List size={14} className="inline mr-1"/> Single
          </button>
          <button
            onClick={() => { setViewMode('split'); setShowCompare(true); }}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
              viewMode === 'split' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <GitCompare size={14} className="inline mr-1"/> Compare
          </button>
          <button
            onClick={() => setViewMode('matrix')}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
              viewMode === 'matrix' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Grid3X3 size={14} className="inline mr-1"/> Matrix
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-gray-300 rounded hover:bg-gray-50">
            <Download size={14} className="inline mr-1"/> Generate
          </button>
        </div>
      </nav>

      {/* Bulk Action Toolbar (appears when in bulk mode or items selected) */}
      {(bulkSelectMode || selectedQuoteIds.length > 0) && (
        <div className="h-12 bg-purple-700 text-white px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm">{selectedQuoteIds.length} option(s) selected</span>
            <button
              onClick={() => setSelectedQuoteIds(quotes.map(q => q.id))}
              className="text-xs text-purple-200 hover:text-white"
            >
              Select all
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 text-xs bg-white/20 hover:bg-white/30 rounded flex items-center gap-1">
              <RefreshCw size={12}/> Sync Settings
            </button>
            <button className="px-3 py-1 text-xs bg-white/20 hover:bg-white/30 rounded flex items-center gap-1">
              <Copy size={12}/> Copy Endorsements
            </button>
            <button className="px-3 py-1 text-xs bg-white/20 hover:bg-white/30 rounded flex items-center gap-1">
              <Copy size={12}/> Copy Subjectivities
            </button>
            <button
              onClick={() => { setBulkSelectMode(false); setSelectedQuoteIds([]); }}
              className="ml-4 text-xs text-purple-200 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">

        {/* LEFT PANEL: Quote Options List */}
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <span className="text-xs font-bold text-slate-700 uppercase">Quote Options</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setBulkSelectMode(!bulkSelectMode)}
                className={`p-1.5 rounded text-xs ${
                  bulkSelectMode ? 'bg-purple-100 text-purple-700' : 'text-slate-500 hover:bg-gray-100'
                }`}
              >
                <CheckCircle2 size={14}/>
              </button>
              <button className="p-1.5 rounded text-slate-500 hover:bg-gray-100">
                <Plus size={14}/>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {quotes.map((quote) => {
              const isSelected = quote.id === primaryQuoteId;
              const isComparing = quote.id === compareQuoteId && showCompare;
              const isBulkSelected = selectedQuoteIds.includes(quote.id);

              return (
                <div
                  key={quote.id}
                  onClick={() => !bulkSelectMode && setPrimaryQuoteId(quote.id)}
                  className={`p-3 border-b border-gray-100 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-purple-50 border-l-4 border-l-purple-600'
                      : isComparing
                      ? 'bg-amber-50 border-l-4 border-l-amber-400'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {bulkSelectMode && (
                      <input
                        type="checkbox"
                        checked={isBulkSelected}
                        onChange={() => toggleQuoteSelection(quote.id)}
                        className="mt-1 accent-purple-600"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-slate-900 truncate">{quote.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          quote.position === 'excess' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
                        }`}>
                          {quote.position === 'excess' ? 'XS' : 'PRI'}
                        </span>
                      </div>
                      {quote.descriptor && (
                        <div className="text-xs text-slate-500 mb-2">{quote.descriptor}</div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900">
                          {formatCurrency(quote.soldPremium || quote.riskAdjusted)}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getStatusStyle(quote.status)}`}>
                          {quote.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Compare toggle */}
                    {!bulkSelectMode && quote.id !== primaryQuoteId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompareQuoteId(quote.id);
                          setShowCompare(true);
                          setViewMode('split');
                        }}
                        className={`p-1 rounded text-xs ${
                          isComparing ? 'bg-amber-200 text-amber-800' : 'text-slate-400 hover:bg-gray-100'
                        }`}
                        title="Compare with selected"
                      >
                        <GitCompare size={12}/>
                      </button>
                    )}
                  </div>

                  {/* Quick stats */}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                    <span>{quote.endorsementCount} endorsements</span>
                    <span>·</span>
                    <span>{quote.subjectivityCount} subjectivities</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* New Option Button */}
          <div className="p-3 border-t border-gray-200">
            <button className="w-full py-2 text-xs font-medium border border-dashed border-gray-300 rounded-lg text-slate-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors">
              <Plus size={14} className="inline mr-1"/> New Quote Option
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT: Split or Single View */}
        <main className="flex-1 flex overflow-hidden">

          {/* Primary Quote Panel */}
          <div className={`flex-1 flex flex-col overflow-hidden ${viewMode === 'split' && showCompare ? 'border-r border-gray-200' : ''}`}>

            {/* Panel Header */}
            <div className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-purple-600"></div>
                <span className="font-bold text-slate-900">{primaryQuote?.name}</span>
                {primaryQuote?.descriptor && (
                  <span className="text-xs text-slate-500">({primaryQuote.descriptor})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="text-xs text-slate-500 hover:text-purple-600 flex items-center gap-1">
                  <Copy size={12}/> Clone
                </button>
                {primaryQuote?.status === 'quoted' && (
                  <button className="px-3 py-1 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700">
                    Bind
                  </button>
                )}
              </div>
            </div>

            {/* Section Tabs */}
            <div className="bg-white border-b border-gray-100 px-4 flex gap-1 overflow-x-auto shrink-0">
              {['overview', 'tower', 'coverages', 'endorsements', 'subjectivities', 'documents'].map((section) => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`px-3 py-2.5 text-xs font-medium capitalize whitespace-nowrap ${
                    activeSection === section
                      ? 'text-purple-700 border-b-2 border-purple-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {section}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 bg-slate-50">

              {activeSection === 'overview' && (
                <div className="space-y-4">
                  {/* Premium Card */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Premium</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-slate-500">Technical</div>
                        <CompareValue
                          primary={primaryQuote?.technical}
                          compare={compareQuote?.technical}
                          format="currency"
                        />
                      </div>
                      <div className="bg-purple-50 -mx-2 px-2 py-1 rounded">
                        <div className="text-xs text-purple-600">Risk-Adjusted</div>
                        <CompareValue
                          primary={primaryQuote?.riskAdjusted}
                          compare={compareQuote?.riskAdjusted}
                          format="currency"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Sold</div>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 text-sm">$</span>
                          <input
                            type="text"
                            defaultValue={primaryQuote?.soldPremium?.toLocaleString() || ''}
                            placeholder="—"
                            className="font-medium bg-transparent border-b border-dashed border-slate-300 focus:border-purple-500 outline-none w-20"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Policy Period Card */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Policy Period</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-slate-500">Effective</div>
                        <CompareValue
                          primary={primaryQuote?.effectiveDate}
                          compare={compareQuote?.effectiveDate}
                          format="date"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Expiration</div>
                        <CompareValue
                          primary={primaryQuote?.expirationDate}
                          compare={compareQuote?.expirationDate}
                          format="date"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase">Endorsements</span>
                        <span className="text-lg font-bold text-slate-900">{primaryQuote?.endorsementCount}</span>
                      </div>
                      {showCompare && compareQuote?.endorsementCount !== primaryQuote?.endorsementCount && (
                        <div className="text-xs text-amber-600">vs {compareQuote?.endorsementCount}</div>
                      )}
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase">Subjectivities</span>
                        <span className="text-lg font-bold text-slate-900">{primaryQuote?.subjectivityCount}</span>
                      </div>
                      {showCompare && compareQuote?.subjectivityCount !== primaryQuote?.subjectivityCount && (
                        <div className="text-xs text-amber-600">vs {compareQuote?.subjectivityCount}</div>
                      )}
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase">Enhancements</span>
                        <span className="text-lg font-bold text-slate-900">{primaryQuote?.enhancementCount}</span>
                      </div>
                      {showCompare && compareQuote?.enhancementCount !== primaryQuote?.enhancementCount && (
                        <div className="text-xs text-amber-600">vs {compareQuote?.enhancementCount}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'endorsements' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-900">Endorsements</h3>
                    <button className="text-xs text-purple-600 hover:text-purple-800">+ Add Endorsement</button>
                  </div>
                  {endorsementData[primaryQuoteId]?.map((code, idx) => {
                    const inCompare = endorsementData[compareQuoteId]?.includes(code);
                    return (
                      <div
                        key={idx}
                        className={`p-3 bg-white border rounded-lg ${
                          showCompare && !inCompare
                            ? 'border-l-4 border-l-purple-400 border-purple-200 bg-purple-50'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-900">{code}</span>
                          {showCompare && !inCompare && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                              Only in this option
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Show items only in compare quote */}
                  {showCompare && endorsementData[compareQuoteId]?.filter(
                    code => !endorsementData[primaryQuoteId]?.includes(code)
                  ).map((code, idx) => (
                    <div
                      key={`compare-${idx}`}
                      className="p-3 bg-amber-50 border border-l-4 border-l-amber-400 border-amber-200 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-900 opacity-60">{code}</span>
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                          Only in compare
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeSection === 'subjectivities' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-900">Subjectivities</h3>
                    <button className="text-xs text-purple-600 hover:text-purple-800">+ Add Subjectivity</button>
                  </div>
                  {subjectivityData[primaryQuoteId]?.map((subj, idx) => {
                    const compareSubj = subjectivityData[compareQuoteId]?.find(s => s.text === subj.text);
                    const onlyInPrimary = showCompare && !compareSubj;
                    const statusDiff = showCompare && compareSubj && compareSubj.status !== subj.status;

                    return (
                      <div
                        key={idx}
                        className={`p-3 bg-white border rounded-lg ${
                          onlyInPrimary
                            ? 'border-l-4 border-l-purple-400 border-purple-200 bg-purple-50'
                            : statusDiff
                            ? 'border-l-4 border-l-amber-400'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm text-slate-900">{subj.text}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                subj.status === 'received' ? 'bg-green-100 text-green-700' :
                                subj.status === 'waived' ? 'bg-blue-100 text-blue-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {subj.status}
                              </span>
                              {statusDiff && (
                                <span className="text-[10px] text-amber-600">
                                  vs {compareSubj.status}
                                </span>
                              )}
                            </div>
                          </div>
                          {onlyInPrimary && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                              Only in this option
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Other sections placeholder */}
              {['tower', 'coverages', 'documents'].includes(activeSection) && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-2 capitalize">{activeSection}</h3>
                  <p className="text-sm text-slate-500">Content for {activeSection}...</p>
                </div>
              )}
            </div>
          </div>

          {/* Compare Quote Panel (when in split view) */}
          {viewMode === 'split' && showCompare && compareQuote && (
            <div className="flex-1 flex flex-col overflow-hidden bg-amber-50/30">

              {/* Panel Header */}
              <div className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <span className="font-bold text-slate-900">{compareQuote.name}</span>
                  {compareQuote.descriptor && (
                    <span className="text-xs text-slate-500">({compareQuote.descriptor})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      // Swap primary and compare
                      const temp = primaryQuoteId;
                      setPrimaryQuoteId(compareQuoteId);
                      setCompareQuoteId(temp);
                    }}
                    className="text-xs text-slate-500 hover:text-purple-600 flex items-center gap-1"
                  >
                    <RefreshCw size={12}/> Swap
                  </button>
                  <button
                    onClick={() => setShowCompare(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={16}/>
                  </button>
                </div>
              </div>

              {/* Same tabs but for compare view */}
              <div className="bg-white border-b border-gray-100 px-4 flex gap-1 overflow-x-auto shrink-0">
                {['overview', 'tower', 'coverages', 'endorsements', 'subjectivities', 'documents'].map((section) => (
                  <button
                    key={section}
                    onClick={() => setActiveSection(section)}
                    className={`px-3 py-2.5 text-xs font-medium capitalize whitespace-nowrap ${
                      activeSection === section
                        ? 'text-amber-700 border-b-2 border-amber-500'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {section}
                  </button>
                ))}
              </div>

              {/* Compare Content - mirrors primary but read-only */}
              <div className="flex-1 overflow-auto p-4 bg-slate-50/50">

                {activeSection === 'overview' && (
                  <div className="space-y-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Premium</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs text-slate-500">Technical</div>
                          <div className="font-medium">{formatCurrency(compareQuote.technical)}</div>
                        </div>
                        <div className="bg-amber-50 -mx-2 px-2 py-1 rounded">
                          <div className="text-xs text-amber-600">Risk-Adjusted</div>
                          <div className="font-medium">{formatCurrency(compareQuote.riskAdjusted)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Sold</div>
                          <div className="font-medium">{formatCurrency(compareQuote.soldPremium)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Policy Period</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-slate-500">Effective</div>
                          <div className="font-medium">{formatDate(compareQuote.effectiveDate)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Expiration</div>
                          <div className="font-medium">{formatDate(compareQuote.expirationDate)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === 'endorsements' && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-900 mb-4">Endorsements</h3>
                    {endorsementData[compareQuoteId]?.map((code, idx) => {
                      const inPrimary = endorsementData[primaryQuoteId]?.includes(code);
                      return (
                        <div
                          key={idx}
                          className={`p-3 bg-white border rounded-lg ${
                            !inPrimary
                              ? 'border-l-4 border-l-amber-400 border-amber-200 bg-amber-50'
                              : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-900">{code}</span>
                            {!inPrimary && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                                Only here
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeSection === 'subjectivities' && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-900 mb-4">Subjectivities</h3>
                    {subjectivityData[compareQuoteId]?.map((subj, idx) => {
                      const primarySubj = subjectivityData[primaryQuoteId]?.find(s => s.text === subj.text);
                      const onlyInCompare = !primarySubj;

                      return (
                        <div
                          key={idx}
                          className={`p-3 bg-white border rounded-lg ${
                            onlyInCompare
                              ? 'border-l-4 border-l-amber-400 border-amber-200 bg-amber-50'
                              : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm text-slate-900">{subj.text}</span>
                              <div className="mt-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  subj.status === 'received' ? 'bg-green-100 text-green-700' :
                                  subj.status === 'waived' ? 'bg-blue-100 text-blue-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>
                                  {subj.status}
                                </span>
                              </div>
                            </div>
                            {onlyInCompare && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                                Only here
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {['tower', 'coverages', 'documents'].includes(activeSection) && (
                  <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-slate-900 mb-2 capitalize">{activeSection}</h3>
                    <p className="text-sm text-slate-500">Compare content for {activeSection}...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Matrix View (alternative to split) */}
        {viewMode === 'matrix' && (
          <div className="fixed inset-0 bg-white z-50 overflow-auto">
            <div className="h-14 border-b border-gray-200 px-4 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="font-bold text-slate-900">Cross-Option Matrix</h2>
              <button
                onClick={() => setViewMode('single')}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                <X size={14} className="inline mr-1"/> Close Matrix
              </button>
            </div>

            <div className="p-6">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-3 bg-gray-50 border border-gray-200 font-semibold text-slate-700">
                      Endorsements & Subjectivities
                    </th>
                    {quotes.map((q) => (
                      <th key={q.id} className="p-3 bg-gray-50 border border-gray-200 text-center min-w-[120px]">
                        <div className="font-semibold text-slate-900">{q.name}</div>
                        <div className="text-xs text-slate-500">{q.descriptor}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Endorsements */}
                  <tr>
                    <td colSpan={quotes.length + 1} className="p-2 bg-slate-100 text-xs font-bold text-slate-600 uppercase">
                      Endorsements
                    </td>
                  </tr>
                  {['END-WAR-001', 'END-OFAC-001', 'END-AI-001', 'END-BIO-001', 'END-ERP-001', 'END-FF-001', 'END-CM-001'].map((code) => (
                    <tr key={code} className="hover:bg-gray-50">
                      <td className="p-3 border border-gray-200 text-sm text-slate-700">{code}</td>
                      {quotes.map((q) => {
                        const hasIt = endorsementData[q.id]?.includes(code);
                        return (
                          <td key={q.id} className="p-3 border border-gray-200 text-center">
                            <input
                              type="checkbox"
                              checked={hasIt}
                              className="accent-purple-600 w-4 h-4"
                              onChange={() => {}}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Subjectivities */}
                  <tr>
                    <td colSpan={quotes.length + 1} className="p-2 bg-slate-100 text-xs font-bold text-slate-600 uppercase">
                      Subjectivities
                    </td>
                  </tr>
                  {['Copy of Underlying Policies', 'Year 2 Financials', 'Signed Application', 'Prior Acts Warranty'].map((text) => (
                    <tr key={text} className="hover:bg-gray-50">
                      <td className="p-3 border border-gray-200 text-sm text-slate-700">{text}</td>
                      {quotes.map((q) => {
                        const hasIt = subjectivityData[q.id]?.some(s => s.text === text);
                        return (
                          <td key={q.id} className="p-3 border border-gray-200 text-center">
                            <input
                              type="checkbox"
                              checked={hasIt}
                              className="accent-purple-600 w-4 h-4"
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
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteSplitComparison;
