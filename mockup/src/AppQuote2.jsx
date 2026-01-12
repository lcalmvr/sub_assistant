import React, { useState } from 'react';
import { 
  Layers, 
  Plus, 
  Settings, 
  Shield, 
  Check,
  Search,
  Calendar,
  DollarSign,
  Percent,
  FileText,
  Trash2,
  Lock,
  Copy
} from 'lucide-react';

const QuoteMatrixDesign = () => {
  const [activeTab, setActiveTab] = useState('endorsements');
  
  // State: Are we in "Multi-Option" mode?
  // If false, the UI is simple. If true, the Matrix columns appear.
  const [isMultiOption, setIsMultiOption] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 p-8 pb-32">
      
      {/* 1. TOP NAV: Structure Selector (unchanged, keeps context) */}
      <div className="mb-6 flex gap-4">
        <div className="w-64 p-3 bg-white rounded-lg border-2 border-purple-600 shadow-sm relative ring-2 ring-purple-50 cursor-pointer">
           <div className="flex justify-between"><span className="text-xs font-bold text-purple-700 uppercase">Option 1</span><span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded font-bold">Configuring</span></div>
           <div className="text-lg font-bold text-slate-900 mt-1">$5M xs $5M</div>
        </div>
        <div className="w-64 p-3 bg-white rounded-lg border border-gray-200 hover:border-purple-300 cursor-pointer opacity-60 hover:opacity-100 transition-opacity">
           <div className="flex justify-between"><span className="text-xs font-bold text-slate-500 uppercase">Option 2</span></div>
           <div className="text-lg font-bold text-slate-900 mt-1">$5M Limit (Primary)</div>
        </div>
        <button className="px-4 rounded-lg border border-dashed border-gray-300 text-slate-400 hover:text-purple-600 hover:border-purple-400 hover:bg-white text-xs font-bold flex items-center gap-2">
          <Plus size={16}/> New Structure
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6 items-start">
        
        {/* 2. LEFT SIDEBAR: The "Structure Editor" (Making the Graphic Functional) */}
        {/* REPLACES: The static graphic. Now this IS the input form. */}
        <div className="col-span-3 space-y-6">
           <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Structure & Term</h3>
               <button className="text-xs text-purple-600 hover:underline">Reset</button>
             </div>
             
             {/* Functional Visualizer */}
             <div className="relative mb-6">
               <div className="space-y-1">
                 {/* Excess Input */}
                 <div className="flex items-stretch h-12">
                   <div className="w-8 bg-slate-100 border-y border-l border-slate-300 rounded-l flex items-center justify-center"><Layers size={12} className="text-slate-400"/></div>
                   <input type="text" value="$10,000,000" className="w-full text-xs text-slate-500 bg-slate-50 border border-slate-300 rounded-r px-2 text-center" disabled/>
                 </div>
                 
                 {/* Our Layer Input (Editable) */}
                 <div className="flex items-stretch h-20 group relative">
                   <div className="w-8 bg-purple-600 rounded-l flex items-center justify-center text-white font-bold text-xs shadow-sm">US</div>
                   <div className="flex-1 flex flex-col border-y border-r border-purple-300 rounded-r bg-purple-50 overflow-hidden">
                      <div className="flex-1 border-b border-purple-100 flex items-center px-2">
                        <span className="text-[10px] text-purple-400 w-12 font-bold uppercase">Limit</span>
                        <input type="text" value="$5,000,000" className="w-full bg-transparent font-bold text-purple-900 outline-none text-sm"/>
                      </div>
                      <div className="flex-1 flex items-center px-2">
                        <span className="text-[10px] text-purple-400 w-12 font-bold uppercase">Attach</span>
                        <input type="text" value="$5,000,000" className="w-full bg-transparent font-bold text-purple-900 outline-none text-sm"/>
                      </div>
                   </div>
                 </div>

                 {/* Underlying Input */}
                 <div className="flex items-stretch h-12">
                   <div className="w-8 bg-slate-200 border-y border-l border-slate-300 rounded-l flex items-center justify-center"><Layers size={12} className="text-slate-500"/></div>
                   <input type="text" value="$5,000,000" className="w-full text-xs text-slate-600 bg-slate-100 border border-slate-300 rounded-r px-2 text-center font-medium"/>
                 </div>
               </div>
             </div>

             {/* Dates Section */}
             <div className="space-y-3 pt-4 border-t border-gray-100">
               <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Effective Date</label>
                  <div className="relative">
                    <Calendar size={14} className="absolute left-2 top-2 text-slate-400"/>
                    <input type="text" value="12/30/2026" className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded font-medium text-slate-700"/>
                  </div>
               </div>
               <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Retro Date (Cyber)</label>
                  <select className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded font-medium text-slate-700 bg-white">
                    <option>Full Prior Acts</option>
                    <option>Inception</option>
                  </select>
               </div>
             </div>
           </div>
        </div>


        {/* 3. RIGHT COLUMN: Pricing & The Matrix */}
        <div className="col-span-9 space-y-6">

          {/* A. PRICING & VARIATIONS (Simplified) */}
          {/* REPLACES: The big table. Now it's just cards. */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <h3 className="font-bold text-slate-900 text-sm">Pricing & Terms</h3>
                 <p className="text-xs text-slate-500">Configure financial terms for this structure.</p>
               </div>
               {/* The Toggle to enable Complexity */}
               <button onClick={() => setIsMultiOption(!isMultiOption)} className="text-xs font-bold text-purple-600 border border-purple-200 bg-purple-50 px-3 py-1.5 rounded hover:bg-purple-100 flex items-center gap-1">
                 <Copy size={12}/> {isMultiOption ? 'Remove Variations' : 'Add Term Variation'}
               </button>
             </div>

             <div className="flex gap-4 items-start">
               
               {/* Variation A (Always here) */}
               <div className="flex-1 bg-white border-2 border-purple-100 rounded-lg p-3 relative group hover:border-purple-300 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">Option A (Standard)</span>
                    <button className="text-slate-300 hover:text-purple-600"><Settings size={12}/></button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                      <label className="text-[10px] uppercase text-slate-400 font-bold">Premium</label>
                      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
                        <DollarSign size={12} className="text-slate-400"/>
                        <input type="text" value="50,000" className="w-full font-bold text-slate-900 outline-none"/>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-400 font-bold">Comm %</label>
                      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
                        <input type="text" value="15.0" className="w-full font-bold text-slate-900 outline-none text-right"/>
                        <Percent size={10} className="text-slate-400"/>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 bg-gray-50 p-1.5 rounded flex items-center justify-center gap-2">
                     <Calendar size={12}/> 12 Months
                  </div>
               </div>

               {/* Variation B (Shown only if Multi-Option is true) */}
               {isMultiOption && (
                 <div className="flex-1 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3 relative group">
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 cursor-pointer text-slate-400 hover:text-red-500"><Trash2 size={12}/></div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-purple-600 uppercase bg-purple-100 px-1.5 rounded">Option B (Long Term)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <div>
                        <label className="text-[10px] uppercase text-slate-400 font-bold">Premium</label>
                        <div className="flex items-center gap-1 border-b border-slate-300 pb-1">
                          <DollarSign size={12} className="text-slate-400"/>
                          <input type="text" value="75,000" className="w-full font-bold text-slate-900 bg-transparent outline-none"/>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-slate-400 font-bold">Comm %</label>
                        <div className="flex items-center gap-1 border-b border-slate-300 pb-1">
                          <input type="text" value="20.0" className="w-full font-bold text-amber-600 bg-transparent outline-none text-right"/>
                          <Percent size={10} className="text-slate-400"/>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-purple-700 bg-purple-100 border border-purple-200 p-1.5 rounded flex items-center justify-center gap-2 font-medium cursor-pointer hover:bg-white">
                       <Calendar size={12}/> 18 Months (Edit)
                    </div>
                 </div>
               )}
             </div>
          </section>


          {/* B. THE ASSIGNMENT MATRIX (The Big Fix) */}
          {/* REPLACES: The list with toggle buttons. Now a clean grid. */}
          <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
             
             {/* Matrix Header */}
             <div className="px-5 py-3 border-b border-gray-200 flex justify-between items-end bg-gray-50">
               <div className="flex gap-6">
                 <button onClick={() => setActiveTab('endorsements')} className={`pb-2 text-sm font-bold border-b-2 ${activeTab === 'endorsements' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`}>Endorsements</button>
                 <button onClick={() => setActiveTab('subjectivities')} className={`pb-2 text-sm font-bold border-b-2 ${activeTab === 'subjectivities' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`}>Subjectivities</button>
                 <button onClick={() => setActiveTab('coverages')} className={`pb-2 text-sm font-bold border-b-2 ${activeTab === 'coverages' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`}>Coverages</button>
               </div>
               
               {/* Quick Add */}
               <div className="flex items-center gap-2">
                 <div className="bg-white border border-gray-200 rounded px-2 py-1 flex items-center gap-2 w-64">
                   <Search size={14} className="text-slate-400"/>
                   <input type="text" placeholder={`Add ${activeTab}...`} className="text-xs outline-none w-full"/>
                 </div>
               </div>
             </div>

             {/* The Matrix Table */}
             <table className="w-full text-sm text-left">
               <thead className="bg-white text-xs text-slate-500 uppercase font-semibold border-b border-gray-100">
                 <tr>
                   <th className="px-5 py-3 w-1/2">Item Name</th>
                   {/* DYNAMIC COLUMNS based on Options */}
                   <th className="px-2 py-3 text-center border-l border-gray-50 w-24">
                     <span className="block text-slate-800">Option A</span>
                     <span className="text-[9px] text-slate-400">Standard</span>
                   </th>
                   {isMultiOption && (
                     <th className="px-2 py-3 text-center border-l border-gray-50 w-24 bg-purple-50/30">
                       <span className="block text-purple-700">Option B</span>
                       <span className="text-[9px] text-purple-400">Long Term</span>
                     </th>
                   )}
                   <th className="px-4 py-3 text-right w-16"></th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                 
                 {/* Item 1: Mandatory (Locked) */}
                 <tr className="bg-gray-50/50">
                   <td className="px-5 py-3">
                     <div className="flex items-center gap-3">
                       <Lock size={14} className="text-slate-400"/>
                       <span className="font-medium text-slate-700">War & Terrorism Exclusion</span>
                     </div>
                   </td>
                   <td className="px-2 py-3 text-center border-l border-gray-100"><Check size={16} className="mx-auto text-slate-300"/></td>
                   {isMultiOption && <td className="px-2 py-3 text-center border-l border-gray-100 bg-purple-50/10"><Check size={16} className="mx-auto text-slate-300"/></td>}
                   <td className="px-4 py-3 text-right"></td>
                 </tr>

                 {/* Item 2: Variable Scope (Checked in both) */}
                 <tr className="hover:bg-gray-50">
                   <td className="px-5 py-3">
                     <div className="flex items-center gap-3">
                       <FileText size={14} className="text-slate-400"/>
                       <span className="font-medium text-slate-900">Excess Follow Form</span>
                     </div>
                   </td>
                   <td className="px-2 py-3 text-center border-l border-gray-100">
                     <input type="checkbox" checked className="accent-purple-600 w-4 h-4 rounded cursor-pointer"/>
                   </td>
                   {isMultiOption && (
                     <td className="px-2 py-3 text-center border-l border-gray-100 bg-purple-50/10">
                       <input type="checkbox" checked className="accent-purple-600 w-4 h-4 rounded cursor-pointer"/>
                     </td>
                   )}
                   <td className="px-4 py-3 text-right"><button className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button></td>
                 </tr>

                 {/* Item 3: Specific Scope (Checked in B only) */}
                 <tr className="hover:bg-gray-50">
                   <td className="px-5 py-3">
                     <div className="flex items-center gap-3">
                       <Shield size={14} className="text-amber-500"/>
                       <div>
                         <span className="font-medium text-slate-900 block">Biometric Exclusion</span>
                         <span className="text-[10px] text-amber-600 font-bold">Recommended for Long Term</span>
                       </div>
                     </div>
                   </td>
                   <td className="px-2 py-3 text-center border-l border-gray-100">
                     <input type="checkbox" className="accent-purple-600 w-4 h-4 rounded cursor-pointer opacity-50"/>
                   </td>
                   {isMultiOption && (
                     <td className="px-2 py-3 text-center border-l border-gray-100 bg-purple-50/10">
                       <input type="checkbox" checked className="accent-purple-600 w-4 h-4 rounded cursor-pointer"/>
                     </td>
                   )}
                   <td className="px-4 py-3 text-right"><button className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button></td>
                 </tr>
               </tbody>
             </table>
          </section>

        </div>
      </div>
    </div>
  );
};

export default QuoteMatrixDesign;

