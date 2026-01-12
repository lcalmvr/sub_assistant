import React, { useState } from 'react';
import { 
  Layers, 
  Plus, 
  Calendar, 
  Settings, 
  Shield, 
  Check,
  ToggleLeft,
  ToggleRight,
  ArrowRight,
  AlertCircle,
  Clock,
  Unlock,
  Lock,
  Copy
} from 'lucide-react';

const QuoteConfigRefined = () => {
  // Simulating state for Scope Toggles
  const [variations] = useState([
    { id: 'A', label: 'Standard', period: '12 Months', premium: '$50,000' },
    { id: 'B', label: 'Long Term', period: '18 Months', premium: '$75,000' }
  ]);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 p-8 pb-32">
      
      {/* 1. TOP NAV: Structure Selector */}
      <div className="mb-6 flex items-end justify-between">
        <div className="flex gap-4">
          <div className="w-64 p-4 bg-white rounded-xl border-2 border-purple-600 shadow-md relative ring-4 ring-purple-50">
            <div className="absolute top-0 right-0 bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-bl font-bold">CONFIGURING</div>
            <div className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded w-max mb-1">Excess Layer</div>
            <div className="text-xl font-bold text-slate-900">$5M xs $5M</div>
             <div className="text-xs text-slate-500 mt-1">2 Active Variations</div>
          </div>
          <div className="w-64 p-4 bg-white rounded-xl border border-gray-200 opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
             <div className="text-xs font-bold text-slate-500 bg-gray-100 px-2 py-0.5 rounded w-max mb-1">Primary</div>
             <div className="text-xl font-bold text-slate-900">$5M Limit</div>
             <div className="text-xs text-slate-500 mt-1">1 Variation</div>
          </div>
          <button className="h-full px-6 rounded-xl border-2 border-dashed border-gray-300 text-slate-400 hover:border-purple-400 hover:text-purple-600 transition-colors flex flex-col items-center justify-center">
            <Plus size={20}/>
            <span className="text-xs font-bold mt-1">Add Option</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start">
        
        {/* 2. LEFT SIDEBAR: The "Common Denominators" */}
        {/* SOLUTION: Fills the empty space with "Structure Defaults" */}
        <div className="col-span-3 space-y-6">
           
           {/* A. Visual Confirmation */}
           <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4 flex items-center gap-2">
               <Layers size={14}/> Tower Position
             </h3>
             <div className="flex flex-col-reverse w-full max-w-[160px] mx-auto space-y-1 space-y-reverse">
               <div className="bg-slate-100 border border-slate-300 text-slate-500 h-12 rounded flex items-center justify-center text-xs font-medium">Underlying ($5M)</div>
               <div className="bg-purple-600 text-white h-20 rounded shadow-md flex flex-col items-center justify-center text-sm font-bold z-10 relative">
                 <span className="text-[10px] uppercase font-normal opacity-80">Our Layer</span>
                 <span>$5M xs $5M</span>
               </div>
               <div className="h-8 border-x border-dashed border-slate-300 flex justify-center"><div className="w-px h-full bg-slate-300"></div></div>
             </div>
           </div>

           {/* B. STRUCTURE DEFAULTS (The "Parent" Settings) */}
           {/* This ensures they don't have to duplicate effort for Retros/Commission */}
           <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
             <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
               <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Structure Defaults</h3>
               <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">Applies to All</span>
             </div>
             
             <div className="p-4 space-y-4">
               
               {/* Retro Date Default */}
               <div>
                 <label className="text-xs font-semibold text-slate-500 mb-1 block">Retroactive Date</label>
                 <div className="flex items-center gap-2">
                   <div className="flex-1 bg-white border border-gray-300 rounded px-2 py-1.5 text-sm font-medium text-slate-900">
                     Full Prior Acts
                   </div>
                   <button className="text-slate-400 hover:text-purple-600"><Settings size={14}/></button>
                 </div>
                 <p className="text-[10px] text-slate-400 mt-1">Applies to Variations A & B unless overridden.</p>
               </div>

               {/* Commission Default */}
               <div>
                 <label className="text-xs font-semibold text-slate-500 mb-1 block">Commission</label>
                 <div className="flex items-center gap-2">
                   <div className="flex-1 bg-white border border-gray-300 rounded px-2 py-1.5 text-sm font-medium text-slate-900">
                     15.0%
                   </div>
                   <Lock size={14} className="text-slate-300"/>
                 </div>
               </div>

                {/* Subjectivity Default */}
               <div>
                 <label className="text-xs font-semibold text-slate-500 mb-1 block">Standard Subj.</label>
                 <div className="flex items-center gap-2 text-xs text-slate-600 bg-gray-50 p-2 rounded border border-gray-100">
                   <Check size={12} className="text-green-600"/>
                   <span>Underlying Binders Required</span>
                 </div>
               </div>

             </div>
           </div>
        </div>


        {/* 3. MAIN AREA: Variations & Configuration */}
        <div className="col-span-9 space-y-6">

          {/* A. VARIATIONS TABLE (Pricing & Overrides) */}
          <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={16} className="text-purple-600"/> 
                Variations (Terms & Pricing)
              </h3>
            </div>
            
            <table className="w-full text-sm text-left">
              <thead className="bg-white text-xs text-slate-500 uppercase font-semibold border-b border-gray-100">
                <tr>
                  <th className="pl-6 py-3 w-8">#</th>
                  <th className="py-3">Label</th>
                  <th className="py-3">Policy Period</th>
                  <th className="py-3">Commission</th>
                  <th className="py-3">Premium</th>
                  <th className="pr-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                
                {/* Variation A: Inherits Everything */}
                <tr className="hover:bg-purple-50 group transition-colors">
                  <td className="pl-6 py-4 font-mono text-slate-400">A</td>
                  <td className="py-4 font-medium text-slate-900">Standard Annual</td>
                  <td className="py-4 text-slate-600">
                    12 Months <span className="text-xs text-slate-400">(12/30/26 - 12/30/27)</span>
                  </td>
                  <td className="py-4">
                    <span className="text-slate-400 italic text-xs">15% (Default)</span>
                  </td>
                  <td className="py-4 font-bold text-slate-900 bg-purple-50/50 px-2 rounded w-max">$50,000</td>
                  <td className="pr-6 py-4 text-right">
                    <button className="text-xs font-medium text-slate-500 hover:text-purple-600">Edit</button>
                  </td>
                </tr>

                {/* Variation B: OVERRIDES Commission */}
                <tr className="hover:bg-purple-50 group transition-colors bg-amber-50/30">
                  <td className="pl-6 py-4 font-mono text-slate-400">B</td>
                  <td className="py-4 font-medium text-slate-900">Long Term (ODDL)</td>
                  <td className="py-4 text-slate-600">
                    <span className="text-purple-600 font-semibold">18 Months</span> <span className="text-xs text-slate-400">(12/30/26 - 06/30/28)</span>
                  </td>
                  <td className="py-4">
                     {/* Visual cue for Override */}
                     <div className="flex items-center gap-1 text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded text-xs w-max">
                       <Unlock size={10}/> 20%
                     </div>
                  </td>
                  <td className="py-4 font-bold text-slate-900 bg-purple-50/50 px-2 rounded w-max">$75,000</td>
                  <td className="pr-6 py-4 text-right">
                    <button className="text-xs font-medium text-slate-500 hover:text-purple-600">Edit</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <button className="w-full py-2 bg-gray-50 border-t border-gray-100 text-xs font-bold text-slate-500 hover:text-purple-600 hover:bg-gray-100 flex items-center justify-center gap-1 transition-colors">
              <Plus size={14}/> Add Term Variation
            </button>
          </section>


          {/* B. CONFIGURATION: The "Scope" Matrix */}
          {/* SOLUTION: Solves the "2 out of 3" problem via Scope Toggles */}
          <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
             <div className="px-6 border-b border-gray-200 flex gap-8">
               <button className="py-4 text-sm font-bold border-b-2 border-purple-600 text-purple-700">Endorsements</button>
               <button className="py-4 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800">Subjectivities</button>
             </div>

             <div className="p-6">
                
                {/* Search Bar */}
                <div className="flex gap-2 mb-6">
                  <div className="flex-1 bg-white rounded-lg border border-gray-200 px-3 py-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-purple-100 transition-all">
                    <Shield size={16} className="text-slate-400"/>
                    <input type="text" placeholder="Add endorsement (e.g. War Exclusion)..." className="w-full text-sm outline-none placeholder:text-slate-400"/>
                  </div>
                  <button className="bg-slate-900 text-white px-4 rounded-lg font-bold text-sm hover:bg-slate-800">Add Global</button>
                </div>

                <div className="space-y-3">
                   
                   {/* Item 1: GLOBAL (Applied to All) */}
                   <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-white">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-slate-500 font-bold text-xs">ALL</div>
                         <div>
                            <span className="text-sm font-semibold text-slate-800 block">END-WAR-001 - War & Terrorism Exclusion</span>
                            <span className="text-[10px] text-slate-400">Mandatory • Inherited by A, B</span>
                         </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <span className="text-[10px] font-bold text-slate-400 uppercase bg-gray-100 px-2 py-1 rounded">Global Scope</span>
                      </div>
                   </div>

                   {/* Item 2: MIXED SCOPE (The "2 out of 3" Solution) */}
                   <div className="flex items-center justify-between p-3 border border-purple-200 rounded-lg bg-purple-50/20">
                      <div className="flex items-center gap-3">
                         {/* Visual indicator that this is split */}
                         <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xs"><ToggleRight size={16}/></div>
                         <div>
                            <span className="text-sm font-semibold text-slate-900 block">EXC-001 - Excess Follow Form</span>
                            <span className="text-[10px] text-purple-600">Custom Scope Active</span>
                         </div>
                      </div>
                      
                      {/* THE SCOPE TOGGLES: Direct Action, no Modals */}
                      <div className="flex items-center gap-2">
                         <span className="text-[10px] font-bold text-slate-400 uppercase mr-2">Apply To:</span>
                         
                         {/* Toggle for A */}
                         <button className="flex items-center gap-1.5 px-2 py-1 rounded border border-purple-200 bg-purple-100 text-purple-800 text-xs font-bold hover:bg-purple-200 transition-colors">
                           <Check size={12}/> Var A
                         </button>

                         {/* Toggle for B (Unselected example) */}
                         <button className="flex items-center gap-1.5 px-2 py-1 rounded border border-gray-200 bg-white text-slate-400 text-xs hover:border-gray-300 transition-colors opacity-60 hover:opacity-100">
                           Var B
                         </button>
                      </div>
                   </div>

                </div>

             </div>
          </section>

        </div>
      </div>
    </div>
  );
};

export default QuoteConfigRefined;

