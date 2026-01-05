import React, { useState } from 'react';
import { 
  X,
  Layout, 
  Search,
  Filter,
  ArrowRight,
  ChevronDown,
  MoreHorizontal,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Activity,
  History,
  AlertCircle
} from 'lucide-react';

const AnalyzeTabInteractive = () => {
  // State to manage the "Drill Down" views
  const [showCompsModal, setShowCompsModal] = useState(false);
  const [selectedLimit, setSelectedLimit] = useState('$2M'); // Default to $2M as shown in image

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col relative">
      
      {/* GLOBAL HEADER */}
      <nav className="h-12 bg-slate-900 text-slate-300 flex items-center px-4 text-sm shrink-0">
         <span className="font-semibold text-white mr-4">Underwriting Portal</span>
         <span className="text-white">Karbon Steel</span>
         <span className="ml-4 px-2 py-0.5 bg-green-900 text-green-200 text-xs rounded-full border border-green-700">Bound</span>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 grid grid-cols-12 gap-8 items-start">
        
        {/* ==================================================================================
            LEFT COLUMN: THE CASE FILE (Scrollable Evidence) 
            Contains: Risk Header, Business Summary, Exposures, Controls, Loss History
           ================================================================================== */}
        <div className="col-span-8 space-y-8">
          
          {/* 1. COMPACT HEADER & APP QUALITY */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
            <div className="flex justify-between items-start mb-4">
               <div>
                 <h1 className="text-xl font-bold text-slate-900">Karbon Steel</h1>
                 <p className="text-sm text-slate-500">Fabricated Structural Metal Mfg (332312)</p>
               </div>
               <div className="text-right">
                 <div className="text-2xl font-bold text-slate-900">$5.0B</div>
                 <div className="text-xs text-slate-500 uppercase font-medium">Annual Revenue</div>
               </div>
            </div>
            
            {/* Quality Indicators */}
            <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
               <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                 <ShieldCheck size={16}/>
                 <span>App Quality: 100/100</span>
               </div>
               <div className="flex gap-2">
                 {['Industrial Infrastructure', 'Steel Fab'].map(tag => (
                   <span key={tag} className="px-2 py-1 bg-gray-100 text-slate-600 text-xs rounded border border-gray-200">{tag}</span>
                 ))}
               </div>
            </div>
          </div>

          {/* 2. BUSINESS SUMMARY (AI Generated Context) */}
          <section>
             <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Building2 size={16} className="text-slate-400"/> Business Summary
            </h3>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 relative group">
              <p className="text-sm text-slate-700 leading-relaxed">
                Karbon Steel (Karbonsteel Engineering Limited) is a structural engineering and steel fabrication company. 
                It designs, fabricates, and assembles heavy and precision steel structures and pre-engineered buildings for industrial and infrastructure projects.
                Its work includes structural steel fabrication for bullet train bridges, refineries, and data centers.
              </p>
              <button className="absolute top-3 right-3 text-xs text-purple-600 opacity-0 group-hover:opacity-100 font-medium hover:underline">Edit Summary</button>
            </div>
          </section>

          {/* 3. SECURITY CONTROLS (NIST Framework Visualization) */}
          <section>
             <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
              <ShieldCheck size={16} className="text-slate-400"/> NIST Security Controls
            </h3>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="grid grid-cols-1 divide-y divide-gray-100">
                
                {/* Identify - Warning */}
                <div className="p-4 bg-amber-50/30">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      <span className="font-semibold text-sm text-slate-800">Identify</span>
                    </div>
                    <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Partial / Inconsistent</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Defined hybrid on-prem/cloud environment. No information on formal risk assessments or data classification.
                  </p>
                </div>

                {/* Detect - Good */}
                <div className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="font-semibold text-sm text-slate-800">Detect</span>
                    </div>
                    <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">Implemented</span>
                  </div>
                  <p className="text-xs text-slate-500">24/7 MDR coverage implies detection capabilities are active.</p>
                </div>

                 {/* Protect - Warning */}
                 <div className="p-4 bg-amber-50/30">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      <span className="font-semibold text-sm text-slate-800">Protect</span>
                    </div>
                    <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Partial</span>
                  </div>
                </div>

                {/* Recover - Bad */}
                <div className="p-4 bg-red-50/30">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500"></div>
                      <span className="font-semibold text-sm text-slate-800">Recover</span>
                    </div>
                    <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">Not Implemented</span>
                  </div>
                  <p className="text-xs text-slate-600">No evidence of offline/immutable backups in submission.</p>
                </div>

              </div>
            </div>
          </section>

          {/* 4. CYBER EXPOSURES (Structured Cards instead of Text Wall) */}
          <section>
             <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Activity size={16} className="text-slate-400"/> Key Exposures
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                 <h4 className="text-sm font-semibold text-purple-700 mb-2">Operational Disruption</h4>
                 <p className="text-xs text-slate-600">Reliance on design systems and production control. Downtime could delay critical infrastructure components.</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                 <h4 className="text-sm font-semibold text-purple-700 mb-2">Design/Tech E&O</h4>
                 <p className="text-xs text-slate-600">Corruption of CAD models or engineering calcs could lead to defective steel structures and liability.</p>
              </div>
               <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                 <h4 className="text-sm font-semibold text-purple-700 mb-2">Supply Chain</h4>
                 <p className="text-xs text-slate-600">Logistics partner delays via cyber incident could trigger cascading claims from counterparties.</p>
              </div>
            </div>
          </section>

           {/* 5. LOSS HISTORY */}
           <section className="pb-10">
             <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
              <History size={16} className="text-slate-400"/> Loss History
            </h3>
             <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
               <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 border-b border-gray-200 text-center">
                 <div>
                   <div className="text-xs text-slate-500 uppercase">Total Paid</div>
                   <div className="font-bold text-slate-900">$69,205</div>
                 </div>
                 <div>
                   <div className="text-xs text-slate-500 uppercase">Claims</div>
                   <div className="font-bold text-slate-900">5</div>
                 </div>
                 <div>
                   <div className="text-xs text-slate-500 uppercase">Open</div>
                   <div className="font-bold text-slate-900">0</div>
                 </div>
                  <div>
                   <div className="text-xs text-slate-500 uppercase">Avg Claim</div>
                   <div className="font-bold text-slate-900">$13.8k</div>
                 </div>
               </div>
               <table className="w-full text-sm text-left">
                 <thead className="bg-gray-50 text-xs uppercase text-slate-500 font-semibold">
                   <tr>
                     <th className="px-4 py-3">Date</th>
                     <th className="px-4 py-3">Type</th>
                     <th className="px-4 py-3">Description</th>
                     <th className="px-4 py-3 text-right">Paid</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   <tr>
                     <td className="px-4 py-3 text-slate-600">Jun 29, 2023</td>
                     <td className="px-4 py-3"><span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs border border-purple-100">Suit</span></td>
                     <td className="px-4 py-3 text-slate-600 truncate max-w-xs">Alleged breaches of venue provisions...</td>
                     <td className="px-4 py-3 text-right font-medium">$29,409</td>
                   </tr>
                    <tr>
                     <td className="px-4 py-3 text-slate-600">Aug 03, 2022</td>
                     <td className="px-4 py-3"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs border border-blue-100">Claim</span></td>
                     <td className="px-4 py-3 text-slate-600 truncate max-w-xs">Alleged violations of FDCPA and RICO...</td>
                     <td className="px-4 py-3 text-right font-medium">$15,357</td>
                   </tr>
                 </tbody>
               </table>
             </div>
           </section>

        </div>


        {/* RIGHT COLUMN: THE WORKBENCH (Sticky) */}
        <div className="col-span-4 space-y-6 sticky top-6">
          
          {/* 1. AI RATIONALE (Refer) */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 border-l-4 border-l-amber-500">
             <div className="flex justify-between items-center mb-2">
               <span className="font-bold text-sm text-slate-900">AI Recommendation</span>
               <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Refer</span>
             </div>
             <p className="text-sm text-slate-600">
               Cannot determine compliance. Missing critical data on §1.1 (MFA) and §1.3 (Backups).
             </p>
          </div>

          {/* 2. PRICING & BENCHMARKING (The Matrix) */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
             
             {/* Header Inputs */}
             <div className="p-4 border-b border-gray-100 bg-gray-50/50 space-y-3">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Pricing Configuration</h3>
               <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Retention</label>
                   <select className="w-full bg-white border border-gray-300 rounded text-sm py-1.5 px-2 text-slate-700 font-medium">
                     <option>$25,000</option>
                     <option>$50,000</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Control Adj</label>
                   <select className="w-full bg-white border border-gray-300 rounded text-sm py-1.5 px-2 text-slate-700 font-medium">
                     <option>+15%</option>
                   </select>
                 </div>
               </div>
             </div>

             {/* The Matrix & Benchmark Split */}
             <div className="divide-y divide-gray-100">
               
               {/* A. The Quote Matrix */}
               <div className="p-4">
                  <h4 className="text-xs font-semibold text-slate-900 mb-3">Calculated Options</h4>
                  <div className="space-y-2">
                    {[
                      { limit: '$1M', premium: '$3,054,974' },
                      { limit: '$2M', premium: '$5,193,457' },
                      { limit: '$3M', premium: '$7,026,442' },
                      { limit: '$5M', premium: '$9,775,920' },
                    ].map((opt) => {
                      const isActive = selectedLimit === opt.limit;
                      return (
                        <div key={opt.limit} className={`flex justify-between items-center p-2 rounded ${isActive ? 'bg-purple-50 border border-purple-100' : 'hover:bg-gray-50 border border-transparent'}`}>
                          <span className="font-medium text-sm text-slate-700">{opt.limit}</span>
                          <div className="flex items-center gap-3">
                            <span className={`font-mono text-sm ${isActive ? 'font-bold text-purple-700' : 'text-slate-600'}`}>{opt.premium}</span>
                            <button 
                              onClick={() => setSelectedLimit(opt.limit)}
                              className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                                isActive 
                                ? 'bg-purple-600 text-white' 
                                : 'bg-white border border-gray-200 text-purple-600 hover:bg-purple-50'
                              }`}
                            >
                              {isActive ? 'Selected' : 'Select'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
               </div>

               {/* B. Market Benchmark Summary */}
               <div className="p-4 bg-slate-50">
                 <div className="flex justify-between items-center mb-2">
                   <h4 className="text-xs font-semibold text-slate-900">Market Benchmark</h4>
                   <span className="text-[10px] text-slate-500">5 comps</span>
                 </div>
                 
                 <div className="flex justify-between items-baseline mb-1">
                   <span className="text-xs text-slate-500">Avg Rate</span>
                   <span className="text-sm font-bold text-slate-700">$1.8M / mil</span>
                 </div>
                 <div className="flex justify-between items-baseline mb-4">
                   <span className="text-xs text-slate-500">Range</span>
                   <span className="text-xs text-slate-600">$1.7M - $2.0M</span>
                 </div>

                 <button 
                   onClick={() => setShowCompsModal(true)}
                   className="w-full py-2 bg-white border border-purple-200 text-purple-700 text-xs font-medium rounded hover:bg-purple-50 flex justify-center items-center gap-2 shadow-sm"
                 >
                   View Full Comp Analysis <ArrowRight size={12} />
                 </button>
               </div>
             </div>
          </div>

          {/* 3. DECISION WIDGET */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
             <h3 className="text-sm font-bold text-slate-900 mb-3">Decision</h3>
             <textarea 
               className="w-full text-sm border border-gray-300 rounded p-2 h-20 mb-3 focus:ring-2 focus:ring-purple-500 outline-none"
               placeholder="Add underwriting notes..."
             ></textarea>
             <div className="grid grid-cols-3 gap-2">
               <button className="py-2 rounded text-sm font-medium border border-gray-200 text-slate-600 hover:bg-gray-50">Decline</button>
               <button className="py-2 rounded text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 shadow-sm">Refer</button>
               <button className="py-2 rounded text-sm font-medium border border-green-200 text-green-700 hover:bg-green-50">Accept</button>
             </div>
          </div>
        </div>

      </main>


      {/* =====================================================================================
          THE "SLIDE-OVER" MODAL (Simulating the Full Page View without leaving the context)
          Matches: Screenshot 2026-01-05 at 4.18.47 PM.jpg
         ===================================================================================== */}
      {showCompsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end">
          
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setShowCompsModal(false)}
          ></div>

          {/* Slide-over Panel */}
          <div className="relative w-full max-w-5xl h-[90vh] bg-white shadow-2xl rounded-t-xl sm:rounded-l-xl sm:rounded-tr-none flex flex-col transform transition-transform">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Comparable Analysis</h2>
                <p className="text-sm text-slate-500">Benchmarking against 8 bound accounts in Fabricated Metal Mfg.</p>
              </div>
              <button 
                onClick={() => setShowCompsModal(false)}
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-slate-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              
              {/* Filters (Matches screenshot) */}
              <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6 flex gap-4 items-end">
                <div className="flex-1">
                   <label className="text-xs font-semibold text-slate-500 mb-1 block">Layer</label>
                   <div className="relative">
                      <select className="w-full text-sm border border-gray-300 rounded px-2 py-2"><option>Primary</option></select>
                   </div>
                </div>
                <div className="flex-1">
                   <label className="text-xs font-semibold text-slate-500 mb-1 block">Date Window</label>
                   <select className="w-full text-sm border border-gray-300 rounded px-2 py-2"><option>Last 24 months</option></select>
                </div>
                <div className="flex-1">
                   <label className="text-xs font-semibold text-slate-500 mb-1 block">Revenue Range</label>
                   <select className="w-full text-sm border border-gray-300 rounded px-2 py-2"><option>± 50%</option></select>
                </div>
                <div className="flex-[2]">
                   <label className="text-xs font-semibold text-slate-500 mb-1 block">Industry</label>
                   <div className="relative">
                     <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                     <input type="text" className="w-full text-sm border border-gray-300 rounded pl-9 py-2" placeholder="Search industry..." />
                   </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded border border-gray-200">
                  <div className="text-xs text-slate-500 uppercase">Comparables</div>
                  <div className="text-2xl font-bold text-slate-900">8</div>
                  <div className="text-xs text-green-600">1 bound</div>
                </div>
                <div className="bg-white p-4 rounded border border-gray-200">
                  <div className="text-xs text-slate-500 uppercase">Avg RPM (All)</div>
                  <div className="text-2xl font-bold text-slate-900">$1.8M</div>
                </div>
                 <div className="bg-white p-4 rounded border border-gray-200">
                  <div className="text-xs text-slate-500 uppercase">Avg Retention</div>
                  <div className="text-2xl font-bold text-slate-900">$45K</div>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-xs text-slate-500 uppercase font-semibold border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Rev</th>
                      <th className="px-4 py-3">Exp</th>
                      <th className="px-4 py-3">Ctrl</th>
                      <th className="px-4 py-3">Limit</th>
                      <th className="px-4 py-3">SIR</th>
                      <th className="px-4 py-3">RPM</th>
                      <th className="px-4 py-3">Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr className="hover:bg-purple-50 cursor-pointer transition-colors group">
                      <td className="px-4 py-3 font-medium text-slate-900 group-hover:text-purple-700 flex items-center gap-2">
                        Karbon Steel <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100"/>
                      </td>
                      <td className="px-4 py-3 text-slate-500">Nov 22, 25</td>
                      <td className="px-4 py-3 text-slate-900">$5B</td>
                      <td className="px-4 py-3 text-slate-600">99%</td>
                      <td className="px-4 py-3 text-slate-600">98%</td>
                      <td className="px-4 py-3 text-slate-600">$5M</td>
                      <td className="px-4 py-3 text-slate-600">$50k</td>
                      <td className="px-4 py-3 font-mono text-slate-900">$2,032,222</td>
                      <td className="px-4 py-3"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs border border-green-200 font-bold">Bound</span></td>
                    </tr>
                     <tr className="hover:bg-purple-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">Umbergaon Inc</td>
                      <td className="px-4 py-3 text-slate-500">Nov 03, 25</td>
                      <td className="px-4 py-3 text-slate-900">$4.2B</td>
                      <td className="px-4 py-3 text-slate-600">98%</td>
                      <td className="px-4 py-3 text-slate-600">85%</td>
                      <td className="px-4 py-3 text-slate-600">$3M</td>
                      <td className="px-4 py-3 text-slate-600">$50k</td>
                      <td className="px-4 py-3 font-mono text-slate-900">$1,707,750</td>
                      <td className="px-4 py-3"><span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs border border-blue-100">Received</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
            
            {/* Modal Footer */}
            <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowCompsModal(false)} className="px-4 py-2 bg-white border border-gray-300 rounded text-slate-700 text-sm hover:bg-gray-50">Close</button>
              <button className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 shadow-sm">Apply Benchmark Adjustments</button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AnalyzeTabInteractive;

