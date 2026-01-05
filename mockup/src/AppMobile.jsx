import React, { useState } from 'react';
import { 
  FileText, 
  User, 
  MapPin, 
  Building2, 
  X,
  ChevronUp,
  Layout, 
  CheckCircle2,
} from 'lucide-react';

/**
 * Mobile-responsive version showing how the mockup translates to mobile
 * Compare this to the desktop version in App.jsx
 */
const UnderwritingPortalMobile = () => {
  const [activeTab, setActiveTab] = useState('Setup');
  const [docDrawerOpen, setDocDrawerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState('Moog At Bay Ranso...');

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      
      {/* MOBILE: Compact Header (vs full header on desktop) */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 md:hidden">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Moog Inc</h1>
            <p className="text-xs text-slate-500">ID: 336414</p>
          </div>
          <button className="text-purple-600 text-sm font-medium">Edit</button>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <MapPin size={12} />
            <span>NY, NY</span>
          </div>
          <div className="flex items-center gap-1">
            <Building2 size={12} />
            <span>Aerospace</span>
          </div>
        </div>
      </header>

      {/* DESKTOP: Full header (hidden on mobile) */}
      <header className="hidden md:block bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        {/* Same as App.jsx - full context header */}
        <div className="flex justify-between items-start">
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
          <div className="flex items-start gap-3 pl-6 border-l border-gray-200">
            <div className="bg-purple-100 p-2 rounded-full text-purple-700">
              <User size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Jane Austin</p>
              <p className="text-xs text-slate-500">Central Brokers Inc</p>
            </div>
          </div>
          <div>
            <button className="bg-white border border-gray-300 text-slate-700 px-4 py-2 rounded-md text-sm font-medium shadow-sm hover:bg-gray-50">
              Edit Submission
            </button>
          </div>
        </div>
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

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* DESKTOP: Sidebar (hidden on mobile) */}
        <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col z-10">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-700 text-sm">Documents</h3>
            <button className="text-purple-600 text-xs font-medium hover:bg-purple-50 px-2 py-1 rounded">+ Add</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-md cursor-pointer">
              <div className="flex gap-2">
                <FileText size={16} className="text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Moog At Bay Ranso...</p>
                  <p className="text-xs text-slate-500">Added today</p>
                </div>
              </div>
              <div className="mt-2">
                <span className="text-[10px] bg-white border border-blue-200 text-blue-700 px-1.5 rounded">Supplemental</span>
              </div>
            </div>
            <div className="p-3 hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-md cursor-pointer">
              <div className="flex gap-2">
                <FileText size={16} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-700">application.standard.pdf</p>
                  <p className="text-xs text-slate-400">Main App</p>
                </div>
              </div>
            </div>
            <div className="p-3 hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-md cursor-pointer">
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

        {/* PDF Viewer Area */}
        <div className="flex-1 flex flex-col bg-slate-100 p-2 md:p-4">
          
          {/* Action Bar */}
          <div className="bg-white rounded-t-lg border-b border-gray-200 p-3 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <h2 className="font-semibold text-sm truncate">{selectedDoc}</h2>
              <span className="hidden md:inline text-xs text-slate-400">PDF • 1.2 MB</span>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <button className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-slate-700 text-xs font-medium rounded transition-colors shadow-sm">
                <Layout size={14} />
                Extract Data
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded shadow-sm transition-colors">
                <CheckCircle2 size={14} />
                <span className="hidden md:inline">Mark Reviewed</span>
                <span className="md:hidden">Review</span>
              </button>
            </div>
          </div>

          {/* PDF Viewer */}
          <div className="flex-1 bg-white border border-t-0 border-gray-200 rounded-b-lg shadow-sm flex items-center justify-center relative">
            <div className="text-center p-4">
              <div className="w-16 h-20 bg-gray-100 border border-gray-300 mx-auto mb-4 flex items-center justify-center">
                <span className="text-xs font-bold text-gray-400">PDF</span>
              </div>
              <p className="text-sm text-gray-500">PDF Viewer Component</p>
              <div className="mt-8 mx-auto w-2/3 border-t border-blue-500 pt-4">
                <p className="font-serif text-lg text-slate-800">at bay</p>
                <p className="font-bold text-slate-900 mt-2">Ransomware Supplemental Application</p>
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE: Floating Document Button */}
        <button
          onClick={() => setDocDrawerOpen(true)}
          className="md:hidden fixed bottom-20 right-4 bg-purple-600 text-white p-4 rounded-full shadow-lg z-50 flex items-center justify-center"
        >
          <FileText size={24} />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold">
            3
          </span>
        </button>
      </main>

      {/* MOBILE: Bottom Navigation (replaces tabs) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around shadow-lg z-40">
        {['Setup', 'Analyze', 'Quote', 'Policy'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-xs font-medium transition-colors ${
              activeTab === tab 
                ? 'text-purple-600 border-t-2 border-purple-600 pt-2' 
                : 'text-gray-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* MOBILE: Document Drawer (Bottom Sheet) */}
      {docDrawerOpen && (
        <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50" onClick={() => setDocDrawerOpen(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
            </div>
            
            {/* Drawer Header */}
            <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="font-semibold text-slate-900">Documents</h3>
              <div className="flex items-center gap-2">
                <button className="text-purple-600 text-xs font-medium px-2 py-1 rounded">+ Add</button>
                <button onClick={() => setDocDrawerOpen(false)} className="p-1">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>
            
            {/* Document List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* Active Document */}
              <div 
                onClick={() => {
                  setSelectedDoc('Moog At Bay Ranso...');
                  setDocDrawerOpen(false);
                }}
                className="p-4 bg-blue-50 border border-blue-100 rounded-lg cursor-pointer"
              >
                <div className="flex gap-3">
                  <FileText size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">Moog At Bay Ransomware Supplemental</p>
                    <p className="text-xs text-slate-500 mt-1">Added today • PDF • 1.2 MB</p>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-[10px] bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded">Supplemental</span>
                </div>
              </div>

              {/* Inactive Documents */}
              <div 
                onClick={() => {
                  setSelectedDoc('application.standard.pdf');
                  setDocDrawerOpen(false);
                }}
                className="p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <div className="flex gap-3">
                  <FileText size={20} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">application.standard.pdf</p>
                    <p className="text-xs text-slate-400 mt-1">Main App • PDF • 2.1 MB</p>
                  </div>
                </div>
              </div>

              <div 
                onClick={() => {
                  setSelectedDoc('email_thread.txt');
                  setDocDrawerOpen(false);
                }}
                className="p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
              >
                <div className="flex gap-3">
                  <FileText size={20} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">email_thread.txt</p>
                    <p className="text-xs text-slate-400 mt-1">Correspondence • TXT • 45 KB</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Footer */}
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                <span>Required Docs</span>
                <span>0/7</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-orange-400 h-2 rounded-full w-[10%]"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnderwritingPortalMobile;


