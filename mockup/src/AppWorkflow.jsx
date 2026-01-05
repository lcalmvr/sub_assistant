import React, { useState } from 'react';
import { 
  CheckCircle2, ArrowRight, FileSearch, ShieldAlert, ScrollText, FileSignature,
  AlertTriangle, Layout, ShieldCheck, Building2, Activity, History, ChevronDown, 
  ChevronRight, FileText, X, Check, Search, ArrowUpRight, AlertCircle, DollarSign
} from 'lucide-react';

const UnderwritingWorkflow = () => {
  // State to track which step in the linear flow is active
  const [currentStep, setCurrentStep] = useState('verify'); // Options: verify, assess, structure, bind

  // Definition of the 4 Linear Steps
  const steps = [
    { id: 'verify', label: '1. Verify Data', icon: FileSearch, desc: 'Resolve conflicts' },
    { id: 'assess', label: '2. Assess Risk', icon: ShieldAlert, desc: 'Review controls' },
    { id: 'structure', label: '3. Structure Quote', icon: ScrollText, desc: 'Pricing & terms' },
    { id: 'bind', label: '4. Bind Policy', icon: FileSignature, desc: 'Issue docs' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-800 flex flex-col">
      
      {/* 1. GLOBAL NAV (Dark) */}
      <nav className="h-14 bg-slate-900 text-slate-300 flex items-center justify-between px-6 text-sm shrink-0 shadow-md">
         <div className="flex items-center gap-4">
           <span className="font-semibold text-white text-lg tracking-tight">Underwriting Portal</span>
           <span className="text-slate-600">|</span>
           <span className="font-medium text-white">Karbon Steel</span>
         </div>
         <div className="flex items-center gap-4">
           <span>Sarah (Underwriter)</span>
           <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">S</div>
         </div>
      </nav>

      {/* 2. LINEAR STEPPER HEADER (The "Track") */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 shadow-sm relative z-20">
        <div className="max-w-6xl mx-auto flex items-center w-full">
          {steps.map((step, index) => {
            const isActive = currentStep === step.id;
            const isCompleted = steps.findIndex(s => s.id === currentStep) > index;
            
            return (
              <div key={step.id} className="flex-1 flex items-center relative group cursor-pointer" onClick={() => setCurrentStep(step.id)}>
                {/* Connector Line */}
                {index !== steps.length - 1 && (
                  <div className={`absolute left-12 right-0 top-6 h-0.5 ${isCompleted ? 'bg-purple-600' : 'bg-gray-100'} z-0`}></div>
                )}
                
                <div className={`flex items-center gap-3 py-3 relative z-10 w-full px-4 rounded-lg transition-all ${isActive ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                  {/* Step Icon Bubble */}
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all shadow-sm
                    ${isActive ? 'bg-purple-600 border-purple-600 text-white scale-110' : ''}
                    ${isCompleted ? 'bg-white border-purple-600 text-purple-600' : ''}
                    ${!isActive && !isCompleted ? 'bg-white border-gray-200 text-gray-300' : ''}
                  `}>
                    {isCompleted ? <CheckCircle2 size={20} /> : <step.icon size={18} />}
                  </div>
                  
                  {/* Step Labels */}
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-purple-900' : isCompleted ? 'text-purple-700' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                    <span className={`text-[10px] ${isActive ? 'text-purple-600 font-medium' : 'text-slate-400'}`}>
                      {step.desc}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. CONTEXTUAL ACTION BAR (The "Gatekeeper") */}
      <div className="bg-white border-b border-gray-200 px-8 py-3 flex justify-between items-center shrink-0 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
        <div className="text-sm">
           {/* Dynamic Message based on Step */}
           {currentStep === 'verify' && (
             <div className="flex items-center gap-3 text-amber-700 bg-amber-50 px-4 py-1.5 rounded-full border border-amber-100">
               <AlertTriangle size={16} className="text-amber-600"/>
               <span><strong>3 Conflicts</strong> require resolution before assessing risk.</span>
             </div>
           )}
           {currentStep === 'assess' && (
             <div className="flex items-center gap-3 text-purple-700 bg-purple-50 px-4 py-1.5 rounded-full border border-purple-100">
               <Layout size={16} className="text-purple-600"/>
               <span><strong>AI Recommendation:</strong> Refer (due to missing MFA controls).</span>
             </div>
           )}
           {currentStep === 'structure' && (
             <div className="text-slate-500 font-medium">Configure options based on <span className="text-slate-900 font-bold">Refer</span> decision.</div>
           )}
        </div>

        {/* Primary Navigation Button */}
        <button 
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:transform active:scale-95"
          onClick={() => { 
            const idx = steps.findIndex(s => s.id === currentStep); 
            if (idx < steps.length - 1) setCurrentStep(steps[idx + 1].id); 
          }}
        >
          {currentStep === 'verify' ? 'Confirm Data & Continue' : 
           currentStep === 'assess' ? 'Confirm Assessment' : 
           currentStep === 'structure' ? 'Finalize Quote' : 'Finish'}
          <ArrowRight size={16} />
        </button>
      </div>

      {/* 4. MAIN CONTENT AREA (Switches Component Based on State) */}
      <div className="flex-1 overflow-hidden relative bg-gray-50/50">
        {currentStep === 'verify' && <VerifyStepContent />}
        {currentStep === 'assess' && <AssessStepContent />}
        {currentStep === 'structure' && <StructureStepContent />}
        {currentStep === 'bind' && <BindStepContent />}
      </div>
    </div>
  );
};


// ==========================================
// SUB-COMPONENT: STEP 1 - VERIFY (Setup)
// Replaces: Screenshot 2026-01-05 at 2.01.32 PM.jpg
// ==========================================
const VerifyStepContent = () => (
  <div className="h-full flex flex-col">
    {/* Editable Header */}
    <header className="bg-white border-b border-gray-200 px-8 py-5 shrink-0">
      <div className="flex justify-between items-start max-w-7xl mx-auto w-full">
        <div>
           <div className="flex items-center gap-3 mb-1">
             <h1 className="text-2xl font-bold text-slate-900">Karbon Steel</h1>
             <span className="bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded border border-gray-200">Editable Mode</span>
           </div>
           <p className="text-sm text-slate-500">Fabricated Structural Metal Mfg (332312)</p>
        </div>
        <div className="text-right">
           <div className="text-2xl font-bold text-slate-900 flex items-center justify-end gap-2">
             $5.0B 
             <button className="p-1 hover:bg-gray-100 rounded text-slate-400"><FileText size={14}/></button>
           </div>
           <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Annual Revenue</div>
        </div>
      </div>
    </header>

    <div className="flex-1 flex overflow-hidden max-w-[1920px] mx-auto w-full">
      {/* LEFT: CONFLICTS PANEL */}
      <aside className="w-[450px] bg-white border-r border-gray-200 flex flex-col z-10 shrink-0">
        <div className="p-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center">
          <div className="flex items-center gap-2 text-amber-800 font-semibold">
            <AlertTriangle size={18} />
            <span>Data Conflicts</span>
          </div>
          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full">3 Found</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          {/* Conflict 1: Endpoint Security */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden group hover:border-amber-300 transition-colors">
            <div className="px-4 py-3 border-b border-gray-100 bg-white flex justify-between items-center">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Endpoint Security</span>
              <span className="text-xs text-purple-600 font-medium bg-purple-50 px-2 py-0.5 rounded border border-purple-100">Page 5</span>
            </div>
            <div className="p-4 space-y-3">
              {/* Option A */}
              <div className="flex items-start gap-3 p-3 rounded-md border border-blue-200 bg-blue-50/50 cursor-pointer">
                <div className="mt-1"><Layout size={16} className="text-blue-600"/></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">CrowdStrike Falcon</p>
                  <p className="text-xs text-slate-500 mt-0.5">Source: Ransomware Supp.</p>
                </div>
                <button className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-medium shadow-sm hover:bg-blue-700">Accept</button>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="h-px bg-gray-200 flex-1"></div>
                <span className="text-[10px] font-bold text-gray-400 uppercase">Conflict</span>
                <div className="h-px bg-gray-200 flex-1"></div>
              </div>

              {/* Option B */}
              <div className="flex items-start gap-3 p-3 rounded-md border border-gray-200 bg-white opacity-70 hover:opacity-100 transition-opacity cursor-pointer hover:border-gray-300">
                <div className="mt-1"><Layout size={16} className="text-slate-400"/></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">Windows Defender</p>
                  <p className="text-xs text-slate-500 mt-0.5">Source: Main App</p>
                </div>
                <button className="text-xs border border-gray-300 text-slate-600 px-3 py-1.5 rounded hover:bg-gray-50 font-medium">Accept</button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT: PDF VIEWER (Simulated) */}
      <div className="flex-1 bg-slate-100 p-6 overflow-hidden flex flex-col">
        <div className="bg-white rounded-t-xl border border-gray-200 border-b-0 p-3 flex justify-between items-center shadow-sm">
          <span className="font-semibold text-sm text-slate-700 flex items-center gap-2">
            <FileText size={16} className="text-purple-600"/> 
            Moog At Bay Ransomware Supplemental.pdf
          </span>
          <div className="flex gap-2">
            <button className="p-1.5 hover:bg-gray-100 rounded text-slate-500"><Search size={16}/></button>
          </div>
        </div>
        <div className="flex-1 bg-white border border-gray-200 rounded-b-xl shadow-inner overflow-y-auto p-12 flex justify-center">
            <div className="max-w-[800px] w-full bg-white shadow-2xl min-h-[1000px] border border-gray-100 p-16 relative">
               {/* Simulated Highlight Overlay */}
               <div className="absolute top-[380px] left-[60px] w-[240px] h-[50px] bg-amber-200/40 border-2 border-amber-400 rounded cursor-pointer animate-pulse"></div>
               
               {/* PDF Content */}
               <h1 className="text-3xl font-serif text-slate-900 mb-8 border-b-2 border-slate-900 pb-4">Supplemental Application</h1>
               <div className="space-y-8">
                 <div className="bg-slate-50 p-4 border border-slate-100 rounded">
                   <h3 className="text-sm font-bold uppercase text-slate-500 mb-2">Applicant Details</h3>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div><span className="block text-slate-400 text-xs">Name</span><span className="font-medium">Karbon Steel Inc</span></div>
                     <div><span className="block text-slate-400 text-xs">Revenue</span><span className="font-medium">$5,000,000,000</span></div>
                   </div>
                 </div>
                 
                 <div>
                   <h3 className="text-sm font-bold uppercase text-slate-500 mb-4">IV. Endpoint Security</h3>
                   <div className="space-y-6 font-serif">
                     <div>
                       <p className="mb-1 text-slate-800 font-medium">1. Do you use an Endpoint Detection & Response (EDR) tool?</p>
                       <p className="text-lg text-slate-900 ml-4">☑ Yes &nbsp;&nbsp; ☐ No</p>
                     </div>
                     <div>
                       <p className="mb-1 text-slate-800 font-medium">If yes, please list provider:</p>
                       <p className="text-xl text-slate-900 font-bold ml-4 font-mono">CrowdStrike Falcon</p>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
        </div>
      </div>
    </div>
  </div>
);


// ==========================================
// SUB-COMPONENT: STEP 2 - ASSESS (Analyze)
// Replaces: Screenshot 2026-01-05 at 4.01.28 PM.jpg
// ==========================================
const AssessStepContent = () => (
  <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
    {/* Read-Only Header */}
    <header className="bg-white border-b border-gray-200 px-8 py-5 shrink-0">
      <div className="flex justify-between items-start max-w-7xl mx-auto w-full">
        <div>
           <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
             <ShieldCheck size={24} className="text-green-600"/> 
             Karbon Steel 
             <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-gray-200 flex items-center gap-1">
               <Check size={12}/> Verified
             </span>
           </h1>
           <p className="text-sm text-slate-500 mt-1">Fabricated Structural Metal Mfg (332312)</p>
        </div>
        <div className="text-right">
           <div className="text-2xl font-bold text-slate-900">$5.0B</div>
           <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Annual Revenue</div>
        </div>
      </div>
    </header>
    
    <div className="flex-1 overflow-y-auto">
      <main className="max-w-7xl mx-auto w-full p-8 grid grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: THE CASE FILE */}
        <div className="col-span-8 space-y-8">
          
          {/* Business Summary */}
          <section>
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Building2 size={14}/> Business Summary (AI Generated)</h3>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <p className="text-sm text-slate-700 leading-relaxed">
                Karbon Steel is a structural engineering and steel fabrication company. It designs, fabricates, and assembles heavy and precision steel structures and pre-engineered buildings for industrial and infrastructure projects.
                <br/><br/>
                Its work includes structural steel fabrication for bullet train bridges, refineries, and data centers.
              </p>
            </div>
          </section>

          {/* Controls Analysis - Color Coded */}
          <section>
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2"><ShieldCheck size={14}/> Security Controls</h3>
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-100">
                {/* Identify - Partial */}
                <div className="p-4 bg-amber-50/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm text-slate-800 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Identify</span>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Partial</span>
                  </div>
                  <p className="text-xs text-slate-600 pl-4">Internal IT team, but no formal risk assessment documentation found.</p>
                </div>
                {/* Detect - Good */}
                <div className="p-4 bg-green-50/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm text-slate-800 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span> Detect</span>
                    <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">Implemented</span>
                  </div>
                  <p className="text-xs text-slate-600 pl-4">CrowdStrike deployed on 98% of endpoints with 24/7 MDR coverage.</p>
                </div>
                 {/* Recover - Bad */}
                 <div className="p-4 bg-red-50/40">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm text-slate-800 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500"></span> Recover</span>
                    <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">Not Implemented</span>
                  </div>
                  <p className="text-xs text-slate-600 pl-4">No evidence of offline/immutable backups in submission.</p>
                </div>
              </div>
            </div>
          </section>

           {/* Loss History - From Screenshot */}
           <section className="pb-10">
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2"><History size={14}/> Loss History</h3>
             <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
               <div className="grid grid-cols-4 gap-4 p-6 bg-slate-50 border-b border-gray-200 text-center">
                 <div><div className="text-[10px] text-slate-500 uppercase font-bold">Total Paid</div><div className="text-xl font-bold text-slate-900">$69,205</div></div>
                 <div><div className="text-[10px] text-slate-500 uppercase font-bold">Total Incurred</div><div className="text-xl font-bold text-slate-900">$0</div></div>
                 <div><div className="text-[10px] text-slate-500 uppercase font-bold">Claims</div><div className="text-xl font-bold text-slate-900">5</div></div>
                 <div><div className="text-[10px] text-slate-500 uppercase font-bold">Avg Claim</div><div className="text-xl font-bold text-slate-900">$13,841</div></div>
               </div>
               <table className="w-full text-sm text-left">
                 <thead className="bg-white text-xs uppercase text-slate-500 font-semibold border-b border-gray-100">
                   <tr>
                     <th className="px-6 py-3">Date</th>
                     <th className="px-6 py-3">Type</th>
                     <th className="px-6 py-3">Paid</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   <tr><td className="px-6 py-3 text-slate-600">6/29/19</td><td className="px-6 py-3"><span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">SUIT</span></td><td className="px-6 py-3 font-medium">$29,409</td></tr>
                   <tr><td className="px-6 py-3 text-slate-600">8/3/19</td><td className="px-6 py-3"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">CLAIM</span></td><td className="px-6 py-3 font-medium">$15,357</td></tr>
                   <tr><td className="px-6 py-3 text-slate-600">7/19/18</td><td className="px-6 py-3"><span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">SUIT</span></td><td className="px-6 py-3 font-medium">$16,985</td></tr>
                 </tbody>
               </table>
             </div>
           </section>
        </div>

        {/* RIGHT COLUMN: STICKY WORKBENCH */}
        <div className="col-span-4 space-y-6 sticky top-6">
          
          {/* AI Rationale - The "Why" */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
             <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-white border-b border-purple-100 flex items-center gap-2">
               <div className="p-1 bg-purple-100 rounded text-purple-600"><Layout size={14}/></div>
               <span className="font-bold text-sm text-purple-900">AI Analysis</span>
               <span className="ml-auto text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">REFER</span>
             </div>
             <div className="p-5 space-y-4">
               <div className="flex gap-3">
                 <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                 <p className="text-sm text-slate-700 leading-snug">
                   Cannot determine compliance due to missing critical data on §1.1 (MFA) and §1.3 (Backups).
                 </p>
               </div>
               <div className="text-xs bg-gray-50 p-3 rounded text-slate-600 border border-gray-100">
                 <strong className="block mb-1 text-slate-800">Missing Critical Data:</strong>
                 <ul className="list-disc pl-4 space-y-1">
                   <li>MFA for remote access</li>
                   <li>Offline/Immutable backups</li>
                   <li>EDR Coverage % (Confirmed 98% in Verify step)</li>
                 </ul>
               </div>
             </div>
          </div>

          {/* Decision Widget - The "Action" */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-md p-5 border-t-4 border-t-amber-400">
             <h3 className="text-sm font-bold text-slate-900 mb-3">Your Decision</h3>
             <textarea 
               className="w-full text-sm border border-gray-300 rounded-md p-3 h-28 mb-4 focus:ring-2 focus:ring-purple-500 outline-none resize-none bg-slate-50" 
               placeholder="Add notes explaining your decision to Refer..."
             ></textarea>
             
             <div className="grid grid-cols-3 gap-2">
               <button className="py-2.5 rounded-md text-sm font-semibold border border-gray-200 text-slate-400 cursor-not-allowed bg-gray-50">Decline</button>
               <button className="py-2.5 rounded-md text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 shadow-md">Refer</button>
               <button className="py-2.5 rounded-md text-sm font-semibold border border-gray-200 text-slate-400 cursor-not-allowed bg-gray-50">Accept</button>
             </div>
          </div>
        </div>
      </main>
    </div>
  </div>
);


// ==========================================
// SUB-COMPONENT: STEP 3 - STRUCTURE (Quote)
// Replaces: Screenshot 2026-01-05 at 4.17.46 PM.png
// ==========================================
const StructureStepContent = () => (
  <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
     <header className="bg-white border-b border-gray-200 px-8 py-5 shrink-0">
      <div className="flex justify-between items-start max-w-7xl mx-auto w-full">
        <div><h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">Karbon Steel <span className="text-sm font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">Decision: REFER</span></h1></div>
      </div>
    </header>

    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* CONFIG BAR */}
        <div className="bg-white border border-gray-200 rounded-t-lg p-6 border-b-0 shadow-sm flex gap-6 items-end">
          <div className="flex-1">
             <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Retention</label>
             <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-medium bg-white"><option>$25,000</option><option>$50,000</option></select>
          </div>
          <div className="flex-1">
             <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Hazard Class</label>
             <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-medium bg-white"><option>3 - Average</option></select>
          </div>
          <div className="flex-1">
             <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Control Adjustment</label>
             <select className="w-full border border-amber-300 rounded-md px-3 py-2 text-sm font-bold bg-amber-50 text-amber-800"><option>+15% (Weak Controls)</option></select>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-0 border border-gray-200 rounded-b-lg shadow-sm bg-white overflow-hidden">
          
          {/* LEFT: CALCULATED PREMIUMS */}
          <div className="col-span-7 border-r border-gray-200 p-6">
             <h3 className="text-sm font-bold text-slate-900 mb-4">Calculated Premium</h3>
             <div className="space-y-3">
               {[
                 { limit: '$1M', premium: '$3,054,974', active: false },
                 { limit: '$2M', premium: '$5,193,457', active: true },
                 { limit: '$3M', premium: '$7,026,442', active: false },
                 { limit: '$5M', premium: '$9,775,920', active: false },
               ].map((opt) => (
                 <div key={opt.limit} className={`flex justify-between items-center p-3 rounded-lg border transition-all ${opt.active ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-200' : 'bg-white border-gray-100 hover:border-gray-300'}`}>
                   <span className="font-bold text-slate-900">{opt.limit}</span>
                   <div className="flex items-center gap-4">
                     <span className={`font-mono font-medium ${opt.active ? 'text-purple-700 font-bold' : 'text-slate-600'}`}>{opt.premium}</span>
                     <button className={`text-xs px-4 py-1.5 rounded-md font-bold transition-colors ${opt.active ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-slate-500 hover:bg-gray-200'}`}>
                       {opt.active ? 'Selected' : 'Select'}
                     </button>
                   </div>
                 </div>
               ))}
             </div>
          </div>

          {/* RIGHT: MARKET BENCHMARK */}
          <div className="col-span-5 p-6 bg-slate-50/50">
             <div className="flex justify-between items-center mb-6">
               <h3 className="text-sm font-bold text-slate-900">Market Benchmark</h3>
               <span className="text-xs font-medium text-slate-500">5 comps</span>
             </div>
             
             <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Avg Rate</span>
                  <span className="font-bold text-blue-600">$1,869,986 / mil</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Range</span>
                  <span>$1.7M - $2.0M</span>
                </div>
             </div>

             <div className="space-y-3">
               <p className="text-xs font-bold text-slate-500 uppercase">Top Matches</p>
               <ul className="text-sm space-y-3 text-slate-600">
                 <li className="flex justify-between items-center">
                   <span>Karbon Steel (Bound)</span>
                   <span className="font-mono text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">$2.0M / mil</span>
                 </li>
                 <li className="flex justify-between items-center opacity-60">
                   <span>Structura Inc</span>
                   <span className="font-mono text-xs">–</span>
                 </li>
               </ul>
             </div>

             <button className="w-full mt-6 py-2.5 bg-white border border-purple-200 text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-50 flex justify-center items-center gap-2 shadow-sm transition-colors">
               View Full Comp Analysis <ArrowUpRight size={14}/>
             </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ==========================================
// SUB-COMPONENT: STEP 4 - BIND (Finish)
// ==========================================
const BindStepContent = () => (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden items-center justify-center p-8 text-center">
       <div className="bg-white p-16 rounded-2xl shadow-xl border border-gray-200 max-w-xl w-full">
         <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
           <FileSignature size={40}/>
         </div>
         <h2 className="text-3xl font-bold text-slate-900 mb-4">Ready to Bind</h2>
         <p className="text-slate-600 mb-10 text-lg">Quote options have been finalized for <strong className="text-slate-900">Karbon Steel</strong>.</p>
         
         <div className="bg-slate-50 p-6 rounded-xl text-left mb-10 border border-gray-200 shadow-sm">
           <div className="grid grid-cols-2 gap-4 mb-4 border-b border-gray-200 pb-4">
             <span className="text-slate-500 text-sm font-medium">Selected Option</span>
             <span className="font-bold text-slate-900 text-right">$2M Limit / $50k RET</span>
           </div>
           <div className="grid grid-cols-2 gap-4">
             <span className="text-slate-500 text-sm font-medium">Final Premium</span>
             <span className="font-bold text-2xl text-purple-700 text-right">$5,193,457</span>
           </div>
         </div>
         
         <button className="bg-green-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-green-700 shadow-lg hover:shadow-xl transition-all w-full text-lg flex items-center justify-center gap-2">
           <CheckCircle2 size={24}/>
           Issue Binder & Invoice
         </button>
       </div>
    </div>
);

export default UnderwritingWorkflow;