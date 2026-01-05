import React, { useState } from 'react';
import { 
  FileText, 
  User, 
  MapPin, 
  Building2, 
  Briefcase, 
  ChevronLeft,
  ChevronRight,
  Layout, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  X,
  Check
} from 'lucide-react';

const UnderwritingPortal = () => {
  const [activeTab, setActiveTab] = useState('Setup');
  
  // This state simulates clicking that "Extract Data" button
  const [isExtractionMode, setIsExtractionMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      
      {/* 1. GLOBAL TOP NAV */}
      <nav className="h-12 bg-slate-900 text-slate-300 flex items-center justify-between px-4 text-sm shrink-0">
        <div className="flex items-center space-x-4">
          <span className="font-semibold text-white">Underwriting Portal</span>
          <span className="text-slate-600">/</span>
          <span className="text-white">Moog Inc</span>
          <span className="px-2 py-0.5 bg-blue-900 text-blue-200 text-xs rounded-full border border-blue-700">
            Status: Received
          </span>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setIsExtractionMode(!isExtractionMode)}
            className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1 rounded text-white"
          >
            Toggle Extraction Mode
          </button>
          <span>Sarah (Underwriter)</span>
        </div>
      </nav>

      {/* 2. CONTEXT HEADER */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm shrink-0">
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-slate-900">Moog Inc</h1>
              <span className="text-sm font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">ID: 336414</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-600 mt-2">
              <div className="flex items-center gap-1.5"><MapPin size={14} /><span>New York, NY</span></div>
              <div className="flex items-center gap-1.5"><Building2 size={14} /><span>Aerospace</span></div>
              <div className="flex items-center gap-1.5"><span className="font-semibold text-emerald-600">$3.0B Rev</span></div>
            </div>
          </div>
          <div className="flex items-start gap-3 pl-6 border-l border-gray-200">
             <div className="bg-purple-100 p-2 rounded-full text-purple-700"><User size={18} /></div>
             <div>
               <p className="text-sm font-semibold text-slate-900">Jane Austin</p>
               <p className="text-xs text-slate-500">Central Brokers</p>
             </div>
          </div>
        </div>
        <div className="flex space-x-6 mt-6 border-b border-gray-100 -mb-4">
          {['Setup', 'Analyze', 'Quote', 'Policy'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`}>{tab}</button>
          ))}
        </div>
      </header>

      {/* 3. WORKSPACE - FLEX ROW TO HOLD 3 COLUMNS */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* COLUMN 1: FILES SIDEBAR */}
        <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out shrink-0`}>
          <div className="p-3 border-b border-gray-100 flex justify-between items-center h-12">
            {!sidebarCollapsed && <h3 className="font-semibold text-slate-700 text-sm">Documents</h3>}
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1 hover:bg-gray-100 rounded text-slate-400">
               {sidebarCollapsed ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
             {/* File 1 */}
            <div className={`p-2 bg-blue-50 border border-blue-100 rounded-md cursor-pointer flex gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <FileText size={18} className="text-blue-600 shrink-0 mt-0.5" />
              {!sidebarCollapsed && <div className="overflow-hidden"><p className="text-sm font-medium truncate">Ransomware Supp...</p></div>}
            </div>
            {/* File 2 */}
            <div className={`p-2 hover:bg-gray-50 border border-transparent rounded-md cursor-pointer flex gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <FileText size={18} className="text-slate-400 shrink-0 mt-0.5" />
              {!sidebarCollapsed && <div className="overflow-hidden"><p className="text-sm text-slate-700 truncate">Application.pdf</p></div>}
            </div>
          </div>
        </aside>


        {/* COLUMN 2: EXTRACTION & CONFLICTS (Only shows when needed) */}
        {isExtractionMode && (
          <aside className="w-96 bg-white border-r border-gray-200 flex flex-col shadow-lg z-10 shrink-0">
            <div className="p-3 bg-amber-50 border-b border-amber-100 flex justify-between items-center h-12">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle size={16} />
                <span className="text-sm font-semibold">5 Conflicts Found</span>
              </div>
              <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">3/7 Resolved</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/50">
              
              {/* Conflict Card 1 */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Endpoint Security</span>
                  <span className="text-xs text-purple-600 font-medium">Page 5</span>
                </div>
                
                <div className="p-3 space-y-3">
                  {/* Option A */}
                  <div className="flex items-start gap-3 p-2 rounded border border-blue-200 bg-blue-50/50">
                    <div className="mt-0.5"><Layout size={14} className="text-blue-500"/></div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">CrowdStrike</p>
                      <p className="text-xs text-slate-500">From: Ransomware Supp.</p>
                    </div>
                    <button className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">Accept</button>
                  </div>
                  
                  {/* Divider */}
                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-gray-200"></div>
                    <span className="flex-shrink-0 mx-2 text-xs text-gray-400">VS</span>
                    <div className="flex-grow border-t border-gray-200"></div>
                  </div>

                  {/* Option B */}
                  <div className="flex items-start gap-3 p-2 rounded border border-gray-200 hover:border-gray-300">
                    <div className="mt-0.5"><Layout size={14} className="text-slate-400"/></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700">Windows Defender</p>
                      <p className="text-xs text-slate-400">From: Main App</p>
                    </div>
                    <button className="text-xs border border-gray-300 text-slate-600 px-2 py-1 rounded hover:bg-gray-50">Accept</button>
                  </div>
                </div>
              </div>

               {/* Conflict Card 2 */}
               <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Applicant Name</span>
                  <span className="text-xs text-purple-600 font-medium">Page 1</span>
                </div>
                <div className="p-3">
                  <div className="flex items-start gap-3 p-2">
                     <div className="flex-1">
                       <p className="text-sm font-semibold text-slate-900">Smartly Inc.</p>
                       <p className="text-xs text-slate-500">Matches 2 docs</p>
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


        {/* COLUMN 3: PDF VIEWER (Flexible width) */}
        <div className="flex-1 flex flex-col bg-slate-100 p-4 min-w-0">
          <div className="bg-white rounded-t-lg border-b border-gray-200 p-3 flex justify-between items-center shadow-sm">
            <h2 className="font-semibold text-sm truncate">Moog At Bay Ransomware Supplemental.pdf</h2>
            <div className="flex items-center gap-2 shrink-0">
               <button className="px-2 py-1 bg-gray-100 text-xs rounded border border-gray-200">Fit Width</button>
            </div>
          </div>
          <div className="flex-1 bg-white border border-t-0 border-gray-200 rounded-b-lg shadow-sm flex items-center justify-center overflow-auto relative">
             <div className="w-full h-full p-8 overflow-y-auto">
               <div className="max-w-3xl mx-auto bg-white shadow-lg min-h-[800px] border p-8">
                  {/* PDF Content Placeholder */}
                  <div className="border-b-2 border-blue-600 pb-4 mb-8">
                    <h1 className="text-2xl font-bold text-slate-800">Ransomware Supplemental Application</h1>
                    <p className="text-sm text-slate-500 mt-2">Please complete all sections regarding endpoint security.</p>
                  </div>
                  <div className="space-y-6">
                    <div className="bg-yellow-100/50 border border-yellow-300 p-2 -mx-2 rounded">
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Endpoint Security</label>
                      <p className="font-mono text-lg">CrowdStrike</p>
                    </div>
                     <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-1">MFA Provider</label>
                      <p className="font-mono text-lg text-slate-300">_________________</p>
                    </div>
                  </div>
               </div>
             </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default UnderwritingPortal;


