import React, { useState } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  TrendingUp, 
  Building2, 
  Tag, 
  CheckCircle2, 
  FileText,
  DollarSign,
  ChevronDown,
  Layout,
  Search,
  Activity,
  History,
  AlertCircle
} from 'lucide-react';

const AnalyzeTabFull = () => {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      
      {/* GLOBAL HEADER (Simplified for context) */}
      <nav className="h-12 bg-slate-900 text-slate-300 flex items-center px-4 text-sm shrink-0">
         <span className="font-semibold text-white mr-4">Underwriting Portal</span>
         <span className="text-white">Karbon Steel</span>
         <span className="ml-4 px-2 py-0.5 bg-green-900 text-green-200 text-xs rounded-full border border-green-700">Bound</span>
      </nav>

      {/* MAIN LAYOUT GRID */}
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


        {/* ==================================================================================
            RIGHT COLUMN: THE WORKBENCH (Sticky)
            Contains: AI Rationale, Pricing, Decision
           ================================================================================== */}
        <div className="col-span-4 space-y-6 sticky top-6">
          
          {/* 1. AI RATIONALE CARD */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
             <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-white border-b border-purple-100 flex items-center gap-2">
               <div className="p-1 bg-purple-100 rounded text-purple-600"><Layout size={14}/></div>
               <span className="font-semibold text-sm text-purple-900">AI Analysis</span>
               <span className="ml-auto text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Refer</span>
             </div>
             <div className="p-4 space-y-3">
               <div className="flex gap-3">
                 <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                 <p className="text-sm text-slate-700">
                   Cannot determine compliance with minimum security controls. Missing critical data on §1.1 (MFA) and §1.3 (Backups).
                 </p>
               </div>
               <div className="text-xs bg-gray-50 p-3 rounded text-slate-600 border border-gray-100">
                 <strong>Missing:</strong>
                 <ul className="list-disc pl-4 mt-1 space-y-1">
                   <li>MFA for remote access</li>
                   <li>Offline/Immutable backups</li>
                 </ul>
               </div>
             </div>
          </div>

          {/* 2. PRICING CALCULATOR */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Pricing & Terms</h3>
             
             {/* Controls */}
             <div className="space-y-3 mb-4">
               <div>
                 <label className="block text-xs text-slate-500 mb-1">Retention</label>
                 <select className="w-full border border-gray-300 rounded text-sm p-2"><option>$25,000</option></select>
               </div>
               <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Hazard Class</label>
                    <select className="w-full border border-gray-300 rounded text-sm p-2"><option>Class 3</option></select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Adjustment</label>
                    <select className="w-full border border-gray-300 rounded text-sm p-2"><option>+15%</option></select>
                  </div>
               </div>
             </div>

             {/* Dynamic Output */}
             <div className="bg-slate-50 border border-slate-100 rounded p-3">
               <div className="flex justify-between items-center mb-1">
                 <span className="text-sm text-slate-600">$1M Limit</span>
                 <span className="font-mono font-bold text-slate-900">$3,054,974</span>
               </div>
               <div className="flex justify-between items-center text-xs text-slate-400">
                 <span>Market Benchmark</span>
                 <span>$1.8M - $2.0M</span>
               </div>
             </div>
          </div>

          {/* 3. DECISION WIDGET (Always visible at bottom of sticky col) */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 border-t-4 border-t-amber-400">
             <h3 className="text-sm font-bold text-slate-900 mb-3">Make Decision</h3>
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
    </div>
  );
};

export default AnalyzeTabFull;

