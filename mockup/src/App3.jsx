import React, { useState } from 'react';
import {
  FileText,
  User,
  MapPin,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Layout,
  CheckCircle2,
  AlertTriangle,
  X,
  Check,
  Mail,
  Phone,
  ExternalLink
} from 'lucide-react';

/**
 * App3 - Consolidated design addressing:
 * 1. Combined nav+header (less vertical space)
 * 2. Broker info in popover (not always visible)
 * 3. Document-centric Setup view
 * 4. Cleaner visual hierarchy
 */
const UnderwritingPortal = () => {
  const [activeTab, setActiveTab] = useState('Setup');
  const [isExtractionMode, setIsExtractionMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showBrokerPopover, setShowBrokerPopover] = useState(false);

  const tabs = ['Setup', 'Analyze', 'Quote', 'Policy'];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">

      {/* UNIFIED HEADER - Nav + Context in one row */}
      <header className="bg-slate-900 text-white px-4 py-0 shrink-0">
        <div className="flex items-center h-14 gap-6">

          {/* Left: Company Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-lg font-semibold truncate">Moog Inc</h1>
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30 whitespace-nowrap">
              Received
            </span>
          </div>

          {/* Center: Quick Context Pills */}
          <div className="hidden md:flex items-center gap-3 text-sm text-slate-400">
            <div className="flex items-center gap-1.5">
              <MapPin size={12} />
              <span>New York, NY</span>
            </div>
            <span className="text-slate-600">·</span>
            <div className="flex items-center gap-1.5">
              <Building2 size={12} />
              <span>Aerospace</span>
            </div>
            <span className="text-slate-600">·</span>
            <span className="text-emerald-400 font-medium">$3.0B</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right: Broker + User */}
          <div className="flex items-center gap-4">
            {/* Broker Popover Trigger */}
            <div className="relative">
              <button
                onClick={() => setShowBrokerPopover(!showBrokerPopover)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors text-sm"
              >
                <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center">
                  <User size={12} className="text-purple-300" />
                </div>
                <span className="text-slate-300 hidden sm:inline">Jane Austin</span>
                <ChevronDown size={14} className={`text-slate-500 transition-transform ${showBrokerPopover ? 'rotate-180' : ''}`} />
              </button>

              {/* Broker Popover */}
              {showBrokerPopover && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowBrokerPopover(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
                    <div className="bg-purple-50 px-4 py-3 border-b border-purple-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <User size={18} className="text-purple-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">Jane Austin</p>
                          <p className="text-sm text-slate-500">Central Brokers Inc</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      <a href="mailto:jane@centralbrokers.com" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 text-sm text-slate-700">
                        <Mail size={14} className="text-slate-400" />
                        <span>jane@centralbrokers.com</span>
                        <ExternalLink size={12} className="text-slate-300 ml-auto" />
                      </a>
                      <a href="tel:+15551234567" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 text-sm text-slate-700">
                        <Phone size={14} className="text-slate-400" />
                        <span>(555) 123-4567</span>
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-slate-700" />

            {/* User */}
            <span className="text-sm text-slate-400">Sarah</span>
          </div>
        </div>

        {/* Stage Tabs - Part of header but visually separated */}
        <div className="flex gap-1 -mb-px">
          {tabs.map((tab, idx) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg ${
                activeTab === tab
                  ? 'bg-gray-50 text-slate-900'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center ${
                  activeTab === tab
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {idx + 1}
                </span>
                {tab}
              </span>
            </button>
          ))}
        </div>
      </header>

      {/* WORKSPACE */}
      <main className="flex-1 flex overflow-hidden">

        {/* Show different layouts based on active tab */}
        {activeTab === 'Setup' ? (
          <SetupWorkspace
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            isExtractionMode={isExtractionMode}
            setIsExtractionMode={setIsExtractionMode}
          />
        ) : activeTab === 'Analyze' ? (
          <AnalyzeWorkspace />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <p className="text-gray-400">[ {activeTab} page content ]</p>
          </div>
        )}
      </main>
    </div>
  );
};

/**
 * Setup Workspace - Document-centric view
 */
function SetupWorkspace({ sidebarCollapsed, setSidebarCollapsed, isExtractionMode, setIsExtractionMode }) {
  return (
    <>
      {/* FILES SIDEBAR */}
      <aside className={`${sidebarCollapsed ? 'w-14' : 'w-60'} bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ease-out shrink-0`}>
        <div className="p-3 border-b border-gray-100 flex justify-between items-center h-11">
          {!sidebarCollapsed && <h3 className="font-medium text-slate-700 text-sm">Documents</h3>}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`p-1 hover:bg-gray-100 rounded text-slate-400 ${sidebarCollapsed ? 'mx-auto' : ''}`}
          >
            {sidebarCollapsed ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Active File */}
          <div className={`p-2 bg-purple-50 border border-purple-200 rounded-lg cursor-pointer ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
            <div className="flex items-start gap-2">
              <FileText size={16} className="text-purple-600 shrink-0 mt-0.5" />
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">Ransomware Supp.pdf</p>
                  <p className="text-xs text-slate-500">Supplemental</p>
                </div>
              )}
            </div>
          </div>

          {/* Other Files */}
          {['Application.pdf', 'Loss Runs.pdf', 'Email Thread.txt'].map((file) => (
            <div
              key={file}
              className={`p-2 hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg cursor-pointer ${sidebarCollapsed ? 'flex justify-center' : ''}`}
            >
              <div className="flex items-start gap-2">
                <FileText size={16} className="text-slate-400 shrink-0 mt-0.5" />
                {!sidebarCollapsed && (
                  <p className="text-sm text-slate-600 truncate">{file}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Progress Footer */}
        {!sidebarCollapsed && (
          <div className="p-3 border-t border-gray-100 bg-gray-50">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>Required</span>
              <span>2/7</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '28%' }}></div>
            </div>
          </div>
        )}
      </aside>

      {/* EXTRACTION CONFLICTS PANEL */}
      {isExtractionMode && (
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-3 bg-amber-50 border-b border-amber-100 flex justify-between items-center h-11">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle size={14} />
              <span className="text-sm font-medium">3 Conflicts</span>
            </div>
            <button
              onClick={() => setIsExtractionMode(false)}
              className="p-1 hover:bg-amber-100 rounded text-amber-600"
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {/* Conflict Card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Endpoint Security</span>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 p-2 rounded border-2 border-purple-300 bg-purple-50">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">CrowdStrike</p>
                    <p className="text-xs text-slate-500">Ransomware Supp.</p>
                  </div>
                  <button className="p-1 text-green-600 hover:bg-green-50 rounded">
                    <Check size={16}/>
                  </button>
                </div>
                <div className="flex items-center gap-2 p-2 rounded border border-gray-200 hover:border-gray-300">
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">Windows Defender</p>
                    <p className="text-xs text-slate-400">Application.pdf</p>
                  </div>
                  <button className="p-1 text-slate-400 hover:bg-gray-50 rounded">
                    <Check size={16}/>
                  </button>
                </div>
              </div>
            </div>

            {/* Another conflict */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">MFA Provider</span>
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 p-2 rounded border border-gray-200">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">Duo Security</p>
                    <p className="text-xs text-slate-500">Ransomware Supp.</p>
                  </div>
                  <div className="flex gap-1">
                    <button className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={16}/></button>
                    <button className="p-1 text-red-500 hover:bg-red-50 rounded"><X size={16}/></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* PDF VIEWER */}
      <div className="flex-1 flex flex-col bg-slate-100 min-w-0">
        {/* Document Action Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex justify-between items-center h-11 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-medium text-sm text-slate-900 truncate">Ransomware Supplemental.pdf</h2>
            <span className="text-xs text-slate-400 hidden sm:inline">PDF · 1.2 MB</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isExtractionMode && (
              <button
                onClick={() => setIsExtractionMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm"
              >
                <Layout size={12} />
                Extract
              </button>
            )}
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 shadow-sm">
              <CheckCircle2 size={12} />
              Mark Reviewed
            </button>
          </div>
        </div>

        {/* PDF Content Area */}
        <div className="flex-1 p-4 overflow-auto">
          <div className="max-w-3xl mx-auto bg-white shadow-lg rounded-sm min-h-[600px] border border-gray-200">
            {/* Fake PDF content */}
            <div className="p-8">
              <div className="border-b-2 border-blue-600 pb-4 mb-6">
                <p className="text-xl font-serif text-slate-700">at bay</p>
                <h1 className="text-lg font-bold text-slate-900 mt-2">Ransomware Supplemental Application</h1>
              </div>
              <div className="space-y-4">
                <div className={`p-3 rounded ${isExtractionMode ? 'bg-yellow-50 border border-yellow-300' : ''}`}>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Endpoint Security</label>
                  <p className="font-mono">CrowdStrike</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">MFA Provider</label>
                  <p className="font-mono">Duo Security</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Backup Frequency</label>
                  <p className="font-mono text-slate-300">_________________</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Analyze Workspace - Content-centric view (no document sidebar)
 */
function AnalyzeWorkspace() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Quick Metrics Row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Revenue</div>
            <div className="text-xl font-bold text-gray-900">$3.0B</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Policy Period</div>
            <div className="text-sm font-semibold text-gray-900">Jan 1 - Jan 1, '27</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Industry</div>
            <div className="text-sm text-gray-700">Aerospace & Defense</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">App Quality</div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-green-600">87</span>
              <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700">Good</span>
            </div>
          </div>
        </div>

        {/* Decision Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">Underwriting Decision</h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-2 text-sm">AI Recommendation</h4>
              <p className="text-sm text-gray-600">Strong cyber security posture with enterprise-grade endpoint protection. Recommend acceptance with standard terms.</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-2 text-sm">Your Decision</h4>
              <div className="flex gap-2">
                <button className="flex-1 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700">Accept</button>
                <button className="flex-1 py-2 text-sm font-medium text-white bg-yellow-500 rounded hover:bg-yellow-600">Refer</button>
                <button className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700">Decline</button>
              </div>
            </div>
          </div>
        </div>

        {/* Business Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">Business Summary</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Moog Inc. is a worldwide designer, manufacturer, and integrator of precision control components and systems.
            The company operates through five segments: Aircraft Controls, Space and Defense Controls, Industrial Systems,
            Components, and Medical Devices. Annual revenue of $3.0B with 13,000+ employees globally.
          </p>
        </div>

        {/* Risk Profile */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">Cyber Exposures</h3>
            <div className="space-y-2">
              {['Supply chain risk from defense contracts', 'Legacy industrial control systems', 'Global operations increase attack surface'].map((item, i) => (
                <div key={i} className="flex gap-2 text-sm text-gray-600 p-2 bg-purple-50 rounded">
                  <span className="text-purple-500">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">Security Controls</h3>
            <div className="space-y-2">
              {[
                { name: 'Endpoint Protection', status: 'implemented' },
                { name: 'MFA', status: 'implemented' },
                { name: 'Backup & Recovery', status: 'partial' },
                { name: 'Security Training', status: 'implemented' },
              ].map((control, i) => (
                <div key={i} className={`flex items-center justify-between p-2 rounded border ${
                  control.status === 'implemented' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <span className="text-sm font-medium text-gray-700">{control.name}</span>
                  <span className={`text-sm ${control.status === 'implemented' ? 'text-green-600' : 'text-yellow-600'}`}>
                    {control.status === 'implemented' ? '✓' : '⚠'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default UnderwritingPortal;
