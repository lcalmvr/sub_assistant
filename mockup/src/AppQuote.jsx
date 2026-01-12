import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  GripVertical, 
  Check, 
  Search,
  MoreHorizontal,
  ArrowRight
} from 'lucide-react';

const QuoteMatrixWorkbench = () => {
  // Simulating the "Tower" layers
  const [layers, setLayers] = useState([
    { id: 1, type: 'Excess', carrier: 'TBD', limit: '$10,000,000', attach: '$10,000,000', status: 'excess' },
    { id: 2, type: 'Our Layer', carrier: 'CMAI', limit: '$5,000,000', attach: '$5,000,000', status: 'ours' },
    { id: 3, type: 'Underlying', carrier: 'Beazley', limit: '$5,000,000', attach: '$0', status: 'underlying' },
  ]);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      
      {/* HEADER: Quick Context */}
      <nav className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
         <div className="flex items-center gap-4 text-sm">
           <span className="font-bold text-slate-900">Karbon Steel</span>
           <span className="text-slate-400">|</span>
           <span className="font-mono text-xs text-slate-500">Quote Config</span>
         </div>
         <div className="flex gap-2">
            <button className="px-3 py-1.5 text-xs font-bold border border-gray-300 rounded hover:bg-gray-50">Save Draft</button>
            <button className="px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded hover:bg-purple-700">Generate PDF</button>
         </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        
        {/* =====================================================================================
            LEFT PANEL: THE TOWER BUILDER (Utility Focused)
            "Can't build coverage towers" -> Solved. A raw, editable grid to stack layers.
           ===================================================================================== */}
        <aside className="w-[400px] bg-white border-r border-gray-200 flex flex-col z-10">
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-700 uppercase">Tower Structure</h3>
            <span className="text-xs font-mono text-slate-500">Total Capacity: $20M</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
             {/* The Layer Table */}
             <div className="border border-gray-200 rounded-lg overflow-hidden">
               <table className="w-full text-xs text-left">
                 <thead className="bg-gray-50 text-slate-500 font-semibold border-b border-gray-200">
                   <tr>
                     <th className="w-8"></th>
                     <th className="py-2 pl-2">Carrier/Layer</th>
                     <th className="py-2">Limit</th>
                     <th className="py-2">Attach</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {layers.map((layer) => (
                     <tr key={layer.id} className={`group ${layer.status === 'ours' ? 'bg-purple-50' : 'bg-white'}`}>
                       <td className="text-center text-slate-300 cursor-move"><GripVertical size={12} className="mx-auto"/></td>
                       <td className="py-2 pl-2">
                         {layer.status === 'ours' ? (
                           <div className="font-bold text-purple-700">CMAI (Us)</div>
                         ) : (
                           <input type="text" defaultValue={layer.carrier} className="w-full bg-transparent outline-none font-medium text-slate-700 focus:bg-white"/>
                         )}
                       </td>
                       <td className="py-2">
                         <input type="text" defaultValue={layer.limit} className="w-20 bg-transparent outline-none font-mono text-slate-600 focus:bg-white border border-transparent focus:border-purple-300 rounded px-1"/>
                       </td>
                       <td className="py-2">
                         <input type="text" defaultValue={layer.attach} className="w-20 bg-transparent outline-none font-mono text-slate-600 focus:bg-white border border-transparent focus:border-purple-300 rounded px-1"/>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               
               {/* Builder Actions */}
               <div className="flex divide-x divide-gray-200 border-t border-gray-200">
                  <button className="flex-1 py-2 text-xs font-medium text-slate-600 hover:bg-gray-50 flex justify-center items-center gap-1">
                    <Plus size={12}/> Add Excess
                  </button>
                  <button className="flex-1 py-2 text-xs font-medium text-slate-600 hover:bg-gray-50 flex justify-center items-center gap-1">
                    <Plus size={12}/> Add Underlying
                  </button>
               </div>
             </div>
          </div>
        </aside>


        {/* =====================================================================================
            RIGHT PANEL: THE MASTER MATRIX (High Density)
            "Manage assignments without clicking into every option" -> Solved. Columns = Options.
           ===================================================================================== */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          
          <div className="flex-1 overflow-auto">
            <div className="min-w-[800px] p-6">
              
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left border-collapse">
                  
                  {/* --- HEADER: THE OPTIONS --- */}
                  <thead>
                    <tr>
                      <th className="w-1/3 p-4 bg-white border-b border-r border-gray-200 align-bottom">
                         <div className="text-lg font-bold text-slate-900">Quote Options</div>
                         <div className="text-xs text-slate-500 font-normal mt-1">Manage multiple terms side-by-side</div>
                      </th>
                      
                      {/* OPTION 1 COLUMN */}
                      <th className="w-1/4 p-0 border-b border-r border-gray-200 bg-purple-50/10 min-w-[200px]">
                        <div className="p-3 border-b border-purple-100 bg-purple-50 flex justify-between items-center">
                          <span className="text-xs font-bold text-purple-700 uppercase">Option 1</span>
                          <button className="text-slate-400 hover:text-red-500"><Trash2 size={12}/></button>
                        </div>
                        <div className="p-3">
                           <div className="text-base font-bold text-slate-900 mb-1">$5M xs $5M</div>
                           <div className="text-xs text-slate-500">Standard Annual</div>
                        </div>
                      </th>

                      {/* OPTION 2 COLUMN */}
                      <th className="w-1/4 p-0 border-b border-r border-gray-200 min-w-[200px]">
                        <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500 uppercase">Option 2</span>
                          <button className="text-slate-400 hover:text-red-500"><Trash2 size={12}/></button>
                        </div>
                        <div className="p-3">
                           <div className="text-base font-bold text-slate-900 mb-1">$5M xs $5M</div>
                           <div className="text-xs text-slate-500">18 Month (ODDL)</div>
                        </div>
                      </th>

                      {/* ADD COLUMN */}
                      <th className="w-24 p-0 border-b border-gray-200 bg-gray-50/50 hover:bg-gray-100 transition-colors cursor-pointer text-center align-middle">
                         <div className="flex flex-col items-center justify-center h-full text-slate-400">
                           <Plus size={20}/>
                           <span className="text-[10px] font-bold mt-1 uppercase">Add Option</span>
                         </div>
                      </th>
                    </tr>
                  </thead>


                  {/* --- BODY: THE DATA --- */}
                  <tbody className="divide-y divide-gray-100">

                    {/* SECTION: FINANCIALS */}
                    <tr className="bg-gray-50/50"><td colSpan={4} className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-gray-200">Financials & Terms</td></tr>
                    
                    {/* Premium Row */}
                    <tr>
                      <td className="px-4 py-3 border-r border-gray-200 font-medium text-slate-600">Premium</td>
                      <td className="p-0 border-r border-gray-200 bg-purple-50/5">
                        <input type="text" className="w-full h-full px-4 py-3 bg-transparent outline-none font-bold text-slate-900" defaultValue="$50,000" />
                      </td>
                      <td className="p-0 border-r border-gray-200">
                        <input type="text" className="w-full h-full px-4 py-3 bg-transparent outline-none font-bold text-slate-900" defaultValue="$75,000" />
                      </td>
                      <td className="bg-gray-50"></td>
                    </tr>

                    {/* Commission Row */}
                    <tr>
                      <td className="px-4 py-3 border-r border-gray-200 font-medium text-slate-600">Commission %</td>
                      <td className="p-0 border-r border-gray-200 bg-purple-50/5">
                        <input type="text" className="w-full h-full px-4 py-3 bg-transparent outline-none font-medium text-slate-700" defaultValue="15.0%" />
                      </td>
                      <td className="p-0 border-r border-gray-200">
                        <input type="text" className="w-full h-full px-4 py-3 bg-transparent outline-none font-bold text-amber-600 bg-amber-50" defaultValue="20.0%" />
                      </td>
                      <td className="bg-gray-50"></td>
                    </tr>

                    {/* Dates Row */}
                    <tr>
                      <td className="px-4 py-3 border-r border-gray-200 font-medium text-slate-600">Policy Period</td>
                      <td className="px-4 py-3 border-r border-gray-200 text-xs text-slate-600 bg-purple-50/5">
                        12/30/2026 - 12/30/2027
                      </td>
                      <td className="px-4 py-3 border-r border-gray-200 text-xs text-purple-700 font-medium bg-purple-50">
                        12/30/2026 - 06/30/2028
                      </td>
                      <td className="bg-gray-50"></td>
                    </tr>


                    {/* SECTION: ENDORSEMENTS (Bulk Assign) */}
                    <tr className="bg-gray-50/50">
                      <td colSpan={4} className="px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Endorsements</span>
                        <div className="flex items-center gap-2">
                           <input type="text" placeholder="Add endorsement..." className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-48"/>
                        </div>
                      </td>
                    </tr>

                    {/* Endorsement 1: Global */}
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3 border-r border-gray-200">
                        <div className="font-medium text-slate-700 text-sm">War & Terrorism Exclusion</div>
                        <div className="text-[10px] text-slate-400">Mandatory</div>
                      </td>
                      {/* Checkbox for Opt 1 */}
                      <td className="border-r border-gray-200 text-center bg-purple-50/5">
                         <input type="checkbox" checked className="w-4 h-4 accent-purple-600 cursor-pointer" />
                      </td>
                      {/* Checkbox for Opt 2 */}
                      <td className="border-r border-gray-200 text-center">
                         <input type="checkbox" checked className="w-4 h-4 accent-purple-600 cursor-pointer" />
                      </td>
                      <td className="bg-gray-50"></td>
                    </tr>

                    {/* Endorsement 2: Mixed */}
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3 border-r border-gray-200">
                        <div className="font-medium text-slate-700 text-sm">Biometric Exclusion</div>
                        <div className="text-[10px] text-slate-400">Optional</div>
                      </td>
                      {/* Checkbox for Opt 1 (Unchecked) */}
                      <td className="border-r border-gray-200 text-center bg-purple-50/5">
                         <input type="checkbox" className="w-4 h-4 accent-purple-600 cursor-pointer opacity-50" />
                      </td>
                      {/* Checkbox for Opt 2 (Checked) */}
                      <td className="border-r border-gray-200 text-center">
                         <input type="checkbox" checked className="w-4 h-4 accent-purple-600 cursor-pointer" />
                      </td>
                      <td className="bg-gray-50"></td>
                    </tr>


                    {/* SECTION: SUBJECTIVITIES */}
                    <tr className="bg-gray-50/50"><td colSpan={4} className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-gray-200">Subjectivities</td></tr>
                    
                    <tr className="hover:bg-gray-50">
                       <td className="px-4 py-3 border-r border-gray-200">
                        <div className="font-medium text-slate-700 text-sm">Copy of Underlying Policies</div>
                      </td>
                      <td className="border-r border-gray-200 text-center bg-purple-50/5">
                         <input type="checkbox" checked className="w-4 h-4 accent-purple-600 cursor-pointer" />
                      </td>
                      <td className="border-r border-gray-200 text-center">
                         <input type="checkbox" checked className="w-4 h-4 accent-purple-600 cursor-pointer" />
                      </td>
                      <td className="bg-gray-50"></td>
                    </tr>
                     <tr className="hover:bg-gray-50">
                       <td className="px-4 py-3 border-r border-gray-200">
                        <div className="font-medium text-slate-700 text-sm">Year 2 Financials</div>
                        <div className="text-[10px] text-slate-400">For 18mo Term Only</div>
                      </td>
                      <td className="border-r border-gray-200 text-center bg-purple-50/5">
                         <div className="w-4 h-1 bg-slate-200 mx-auto rounded"></div> {/* N/A indicator */}
                      </td>
                      <td className="border-r border-gray-200 text-center">
                         <input type="checkbox" checked className="w-4 h-4 accent-purple-600 cursor-pointer" />
                      </td>
                      <td className="bg-gray-50"></td>
                    </tr>

                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </main>

      </div>
    </div>
  );
};

export default QuoteMatrixWorkbench;