import React, { useState } from 'react';
import { 
  FileText, 
  User, 
  MapPin, 
  Building2, 
  Briefcase, 
  ChevronDown, 
  Layout, 
  Maximize2, 
  CheckCircle2, 
  AlertCircle,
  Search,
  MoreHorizontal,
  ArrowRight
} from 'lucide-react';

const UnderwritingPortal = () => {
  const [activeTab, setActiveTab] = useState('Setup');

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      
      {/* 1. GLOBAL TOP NAV: Simple, Dark for contrast against the app */}
      <nav className="h-12 bg-slate-900 text-slate-300 flex items-center justify-between px-4 text-sm">
        <div className="flex items-center space-x-4">
          <span className="font-semibold text-white">Underwriting Portal</span>
          <span className="text-slate-600">/</span>
          <span className="text-white">Moog Inc</span>
          <span className="px-2 py-0.5 bg-blue-900 text-blue-200 text-xs rounded-full border border-blue-700">
            Status: Received
          </span>
        </div>
        <div className="flex items-center space-x-4">
          <span>Sarah (Underwriter)</span>
        </div>
      </nav>

      {/* 2. CONTEXT HEADER (The "Risk"): Clean, minimal color, high data density */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex justify-between items-start">
          
          {/* Left: Company Info */}
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-slate-900">Moog Inc</h1>
              <span className="text-sm font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">ID: 336414</span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-slate-600 mt-2">
              <div className="flex items-center gap-1.5">
                <MapPin size={14} />
                <span>New York, NY 10010</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Building2 size={14} />
                <span>Aerospace & Defense</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-emerald-600">$3.0B Rev</span>
              </div>
            </div>
          </div>

          {/* Center: Broker Info (Crucial context often missed) */}
          <div className="flex items-start gap-3 pl-6 border-l border-gray-200">
            <div className="bg-purple-100 p-2 rounded-full text-purple-700">
              <User size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Jane Austin</p>
              <p className="text-xs text-slate-500">Central Brokers Inc</p>
              <a href="#" className="text-xs text-blue-600 hover:underline">jane@centralbrokers.com</a>
            </div>
          </div>

          {/* Right: Primary Actions */}
          <div>
            <button className="bg-white border border-gray-300 text-slate-700 px-4 py-2 rounded-md text-sm font-medium shadow-sm hover:bg-gray-50">
              Edit Submission
            </button>
          </div>
        </div>

        {/* 3. STAGE NAVIGATION: Tabs that look like tabs, not just text */}
        <div className="flex space-x-6 mt-6 border-b border-gray-100 -mb-4">
          {['Setup', 'Analyze', 'Quote', 'Policy'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab 
                  ? 'border-purple-600 text-purple-700' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* 4. WORKSPACE (The "Setup" Tab View) */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT SIDEBAR: File List (Replaces horizontal chips) */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col z-10">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-700 text-sm">Documents</h3>
            <button className="text-purple-600 text-xs font-medium hover:bg-purple-50 px-2 py-1 rounded">+ Add</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* File Item: Active */}
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-md cursor-pointer group">
              <div className="flex justify-between items-start">
                <div className="flex gap-2">
                  <FileText size={16} className="text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Moog At Bay Ranso...</p>
                    <p className="text-xs text-slate-500">Added today</p>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                 <span className="text-[10px] bg-white border border-blue-200 text-blue-700 px-1.5 rounded">Supplemental</span>
              </div>
            </div>

            {/* File Item: Inactive */}
            <div className="p-3 hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-md cursor-pointer transition-all">
              <div className="flex gap-2">
                <FileText size={16} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-700">application.standard.pdf</p>
                  <p className="text-xs text-slate-400">Main App</p>
                </div>
              </div>
            </div>

             {/* File Item: Inactive */}
             <div className="p-3 hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-md cursor-pointer transition-all">
              <div className="flex gap-2">
                <FileText size={16} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-700">email_thread.txt</p>
                  <p className="text-xs text-slate-400">Correspondence</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 bg-gray-50">
             <div className="flex justify-between text-xs text-slate-500 mb-2">
               <span>Required Docs</span>
               <span>0/7</span>
             </div>
             <div className="w-full bg-gray-200 rounded-full h-1.5">
               <div className="bg-orange-400 h-1.5 rounded-full w-[10%]"></div>
             </div>
          </div>
        </aside>

        {/* RIGHT AREA: Document Preview & Extraction Tools */}
        <div className="flex-1 flex flex-col bg-slate-100 p-4">
          
          {/* Action Bar for the active document */}
          <div className="bg-white rounded-t-lg border-b border-gray-200 p-3 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-4">
               <h2 className="font-semibold text-sm">Moog At Bay Ransomware Supplemental</h2>
               <span className="text-xs text-slate-400">PDF • 1.2 MB</span>
            </div>
            
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-slate-700 text-xs font-medium rounded transition-colors shadow-sm">
                <Layout size={14} />
                Extract Data
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded shadow-sm transition-colors">
                <CheckCircle2 size={14} />
                Mark Reviewed
              </button>
            </div>
          </div>

          {/* PDF Viewer Placeholder */}
          <div className="flex-1 bg-white border border-t-0 border-gray-200 rounded-b-lg shadow-sm flex items-center justify-center relative">
             <div className="text-center">
               <div className="w-16 h-20 bg-gray-100 border border-gray-300 mx-auto mb-4 flex items-center justify-center">
                 <span className="text-xs font-bold text-gray-400">PDF</span>
               </div>
               <p className="text-sm text-gray-500">PDF Viewer Component Renders Here</p>
               <div className="mt-8 mx-auto w-2/3 border-t border-blue-500 pt-4">
                  <p className="font-serif text-lg text-slate-800">at bay</p>
                  <p className="font-bold text-slate-900 mt-2">Ransomware Supplemental Application</p>
               </div>
             </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default UnderwritingPortal;


