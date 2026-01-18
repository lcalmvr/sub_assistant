import React, { useState } from 'react';
import { Check, Clock, Ban, ChevronDown, ChevronUp, X, Plus } from 'lucide-react';

// Sample data
const sampleSubjectivities = [
  { id: 1, text: 'Terrorism exclusion confirmation', status: 'pending' },
  { id: 2, text: 'Security Services vendor contact information', status: 'received' },
  { id: 3, text: 'MFA attestation for all remote access', status: 'pending' },
  { id: 4, text: 'Backup and recovery attestation', status: 'waived' },
  { id: 5, text: 'Employee security training certification', status: 'pending' },
];

const sampleEndorsements = [
  { id: 1, title: 'CY 001 - Cyber Terrorism Exclusion', category: 'exclusion' },
  { id: 2, title: 'CY 002 - War Exclusion', category: 'exclusion' },
  { id: 3, title: 'CY 010 - Retroactive Date', category: 'coverage' },
];

const sampleTerms = {
  premium: '$125,000',
  limit: '$5,000,000',
  retention: '$100,000',
  retroDate: '01/01/2020',
};

// Status icon helper
function StatusIcon({ status, size = 'sm' }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  if (status === 'received') return <Check className={`${sizeClass} text-green-500`} />;
  if (status === 'waived') return <Ban className={`${sizeClass} text-gray-400`} />;
  return <Clock className={`${sizeClass} text-amber-500`} />;
}

// Compact preview for sidebar
function CompactPreview({ items, type }) {
  const pendingCount = items.filter(i => i.status === 'pending' || !i.status).length;
  return (
    <div className="space-y-1">
      {items.slice(0, 3).map(item => (
        <div key={item.id} className="flex items-center gap-2 text-xs text-gray-600">
          {type === 'subjectivity' && <StatusIcon status={item.status} />}
          <span className="truncate">{item.text || item.title}</span>
        </div>
      ))}
      {items.length > 3 && (
        <div className="text-xs text-gray-400">+{items.length - 3} more</div>
      )}
      {type === 'subjectivity' && pendingCount > 0 && (
        <div className="text-xs text-amber-600 mt-1">{pendingCount} pending</div>
      )}
    </div>
  );
}

// Full editor component
function SubjectivityEditor({ subjectivities, setSubjectivities }) {
  const cycleStatus = (id) => {
    setSubjectivities(prev => prev.map(s => {
      if (s.id !== id) return s;
      const next = s.status === 'pending' ? 'received' : s.status === 'received' ? 'waived' : 'pending';
      return { ...s, status: next };
    }));
  };

  return (
    <div className="space-y-2">
      {subjectivities.map(subj => (
        <div key={subj.id} className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
          subj.status === 'received' ? 'bg-green-50 border-green-200' :
          subj.status === 'waived' ? 'bg-gray-50 border-gray-200' :
          'bg-white border-gray-200'
        }`}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button onClick={() => cycleStatus(subj.id)} className="p-1 hover:bg-gray-100 rounded">
              <StatusIcon status={subj.status} />
            </button>
            <span className="text-sm text-gray-700 truncate">{subj.text}</span>
          </div>
          <select
            value={subj.status}
            onChange={(e) => setSubjectivities(prev => prev.map(s => s.id === subj.id ? { ...s, status: e.target.value } : s))}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
          >
            <option value="pending">Pending</option>
            <option value="received">Received</option>
            <option value="waived">Waived</option>
          </select>
        </div>
      ))}
      <button className="w-full py-2 text-sm text-purple-600 border border-dashed border-purple-300 rounded-lg hover:bg-purple-50">
        <Plus className="w-4 h-4 inline mr-1" /> Add Subjectivity
      </button>
    </div>
  );
}

// ============================================================================
// LAYOUT C1: Card expands in place (1/3 → 2/3)
// ============================================================================
function LayoutC1() {
  const [expanded, setExpanded] = useState(null);
  const [subjectivities, setSubjectivities] = useState(sampleSubjectivities);

  return (
    <div className="p-6 bg-gray-100 min-h-[500px]">
      <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">C1: Expand in Place (1/3 → 2/3)</h3>

      <div className="flex gap-4">
        {/* Subjectivities Card */}
        <div className={`transition-all duration-300 ${expanded === 'subj' ? 'w-2/3' : 'w-1/3'}`}>
          <div className={`border rounded-lg bg-white overflow-hidden transition-all duration-300 ${
            expanded === 'subj' ? 'border-purple-300 shadow-lg' : 'border-gray-200'
          }`}>
            <div className={`px-4 py-3 border-b flex justify-between items-center ${
              expanded === 'subj' ? 'bg-purple-50 border-purple-200' : 'bg-gray-50'
            }`}>
              <h4 className={`text-xs font-bold uppercase ${expanded === 'subj' ? 'text-purple-600' : 'text-gray-500'}`}>
                Subjectivities
              </h4>
              <button
                onClick={() => setExpanded(expanded === 'subj' ? null : 'subj')}
                className="text-xs text-purple-600 hover:text-purple-700 font-medium"
              >
                {expanded === 'subj' ? 'Done' : 'Manage'}
              </button>
            </div>
            <div className="p-4">
              {expanded === 'subj' ? (
                <SubjectivityEditor subjectivities={subjectivities} setSubjectivities={setSubjectivities} />
              ) : (
                <CompactPreview items={subjectivities} type="subjectivity" />
              )}
            </div>
          </div>
        </div>

        {/* Other cards stack in remaining space */}
        <div className={`transition-all duration-300 ${expanded === 'subj' ? 'w-1/3' : 'w-2/3'} space-y-4`}>
          <div className={`transition-all duration-300 ${expanded === 'subj' ? '' : 'flex gap-4'}`}>
            {/* Endorsements Card */}
            <div className={`border rounded-lg bg-white overflow-hidden border-gray-200 ${expanded === 'subj' ? 'mb-4' : 'flex-1'}`}>
              <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
                <h4 className="text-xs font-bold uppercase text-gray-500">Endorsements</h4>
                <button className="text-xs text-purple-600 font-medium">Manage</button>
              </div>
              <div className="p-4">
                <div className="text-sm text-gray-600">{sampleEndorsements.length} endorsements</div>
              </div>
            </div>

            {/* Terms Card */}
            <div className={`border rounded-lg bg-white overflow-hidden border-gray-200 ${expanded === 'subj' ? '' : 'flex-1'}`}>
              <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
                <h4 className="text-xs font-bold uppercase text-gray-500">Terms</h4>
                <button className="text-xs text-purple-600 font-medium">Edit</button>
              </div>
              <div className="p-4">
                <div className="text-sm text-gray-600">{sampleTerms.premium} premium</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LAYOUT C2: Editor slides out below row
// ============================================================================
function LayoutC2() {
  const [expanded, setExpanded] = useState(null);
  const [subjectivities, setSubjectivities] = useState(sampleSubjectivities);

  return (
    <div className="p-6 bg-gray-100 min-h-[500px]">
      <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">C2: Editor Below Row</h3>

      {/* Cards row - always stable */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Subjectivities Card */}
        <div className={`border rounded-lg bg-white overflow-hidden transition-all duration-200 ${
          expanded === 'subj' ? 'border-purple-400 ring-2 ring-purple-200' : 'border-gray-200'
        }`}>
          <div className={`px-4 py-3 border-b flex justify-between items-center ${
            expanded === 'subj' ? 'bg-purple-50 border-purple-200' : 'bg-gray-50'
          }`}>
            <h4 className={`text-xs font-bold uppercase ${expanded === 'subj' ? 'text-purple-600' : 'text-gray-500'}`}>
              Subjectivities
            </h4>
            <button
              onClick={() => setExpanded(expanded === 'subj' ? null : 'subj')}
              className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
            >
              {expanded === 'subj' ? 'Close' : 'Manage'}
              {expanded === 'subj' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
          <div className="p-4">
            <CompactPreview items={subjectivities} type="subjectivity" />
          </div>
        </div>

        {/* Endorsements Card */}
        <div className={`border rounded-lg bg-white overflow-hidden transition-all duration-200 ${
          expanded === 'endt' ? 'border-purple-400 ring-2 ring-purple-200' : 'border-gray-200'
        }`}>
          <div className={`px-4 py-3 border-b flex justify-between items-center ${
            expanded === 'endt' ? 'bg-purple-50 border-purple-200' : 'bg-gray-50'
          }`}>
            <h4 className={`text-xs font-bold uppercase ${expanded === 'endt' ? 'text-purple-600' : 'text-gray-500'}`}>
              Endorsements
            </h4>
            <button
              onClick={() => setExpanded(expanded === 'endt' ? null : 'endt')}
              className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
            >
              {expanded === 'endt' ? 'Close' : 'Manage'}
              {expanded === 'endt' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
          <div className="p-4">
            <div className="text-sm text-gray-600">{sampleEndorsements.length} endorsements</div>
          </div>
        </div>

        {/* Terms Card */}
        <div className={`border rounded-lg bg-white overflow-hidden transition-all duration-200 ${
          expanded === 'terms' ? 'border-purple-400 ring-2 ring-purple-200' : 'border-gray-200'
        }`}>
          <div className={`px-4 py-3 border-b flex justify-between items-center ${
            expanded === 'terms' ? 'bg-purple-50 border-purple-200' : 'bg-gray-50'
          }`}>
            <h4 className={`text-xs font-bold uppercase ${expanded === 'terms' ? 'text-purple-600' : 'text-gray-500'}`}>
              Terms
            </h4>
            <button
              onClick={() => setExpanded(expanded === 'terms' ? null : 'terms')}
              className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
            >
              {expanded === 'terms' ? 'Close' : 'Edit'}
              {expanded === 'terms' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
          <div className="p-4">
            <div className="text-sm text-gray-600">{sampleTerms.premium} premium</div>
          </div>
        </div>
      </div>

      {/* Editor panel - appears below when something is expanded */}
      {expanded && (
        <div className="border border-purple-300 rounded-lg bg-white shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 bg-purple-50 border-b border-purple-200 flex justify-between items-center">
            <h4 className="text-sm font-bold text-purple-600">
              {expanded === 'subj' && 'Edit Subjectivities'}
              {expanded === 'endt' && 'Edit Endorsements'}
              {expanded === 'terms' && 'Edit Terms'}
            </h4>
            <button onClick={() => setExpanded(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4">
            {expanded === 'subj' && (
              <SubjectivityEditor subjectivities={subjectivities} setSubjectivities={setSubjectivities} />
            )}
            {expanded === 'endt' && (
              <div className="text-gray-500 text-sm">Endorsements editor would go here...</div>
            )}
            {expanded === 'terms' && (
              <div className="text-gray-500 text-sm">Terms editor would go here...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LAYOUT C3: Sidebar preview + main editor area
// ============================================================================
function LayoutC3() {
  const [activeSection, setActiveSection] = useState('subj');
  const [subjectivities, setSubjectivities] = useState(sampleSubjectivities);

  const sections = [
    { id: 'subj', label: 'Subjectivities', count: subjectivities.length, pending: subjectivities.filter(s => s.status === 'pending').length },
    { id: 'endt', label: 'Endorsements', count: sampleEndorsements.length },
    { id: 'terms', label: 'Terms', preview: sampleTerms.premium },
    { id: 'retro', label: 'Retro Date', preview: sampleTerms.retroDate },
    { id: 'comm', label: 'Commission', preview: '15%' },
  ];

  return (
    <div className="p-6 bg-gray-100 min-h-[500px]">
      <h3 className="text-sm font-bold text-gray-500 uppercase mb-4">C3: Sidebar + Main Editor</h3>

      <div className="flex gap-4">
        {/* Sidebar - always visible */}
        <div className="w-1/3 space-y-2">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                activeSection === section.id
                  ? 'border-purple-400 bg-purple-50 ring-2 ring-purple-200'
                  : 'border-gray-200 bg-white hover:border-purple-200 hover:bg-purple-50/50'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className={`text-xs font-bold uppercase ${
                  activeSection === section.id ? 'text-purple-600' : 'text-gray-500'
                }`}>
                  {section.label}
                </span>
                {section.count !== undefined && (
                  <span className="text-xs text-gray-400">{section.count}</span>
                )}
              </div>
              {section.pending > 0 && (
                <div className="text-xs text-amber-600 mt-1">{section.pending} pending</div>
              )}
              {section.preview && (
                <div className="text-sm text-gray-600 mt-1">{section.preview}</div>
              )}
            </button>
          ))}
        </div>

        {/* Main editor area - 2/3 */}
        <div className="w-2/3">
          <div className="border border-gray-200 rounded-lg bg-white overflow-hidden h-full">
            <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
              <h4 className="text-sm font-bold text-gray-700">
                {activeSection === 'subj' && 'Subjectivities'}
                {activeSection === 'endt' && 'Endorsements'}
                {activeSection === 'terms' && 'Terms'}
                {activeSection === 'retro' && 'Retroactive Date'}
                {activeSection === 'comm' && 'Commission'}
              </h4>
            </div>
            <div className="p-4">
              {activeSection === 'subj' && (
                <SubjectivityEditor subjectivities={subjectivities} setSubjectivities={setSubjectivities} />
              )}
              {activeSection === 'endt' && (
                <div className="text-gray-500 text-sm py-8 text-center">Endorsements editor would go here...</div>
              )}
              {activeSection === 'terms' && (
                <div className="text-gray-500 text-sm py-8 text-center">Terms editor would go here...</div>
              )}
              {activeSection === 'retro' && (
                <div className="text-gray-500 text-sm py-8 text-center">Retro date editor would go here...</div>
              )}
              {activeSection === 'comm' && (
                <div className="text-gray-500 text-sm py-8 text-center">Commission editor would go here...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP - Tabs to switch between layouts
// ============================================================================
export default function AppLayoutComparison() {
  const [activeLayout, setActiveLayout] = useState('C2');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-800 mb-4">Layout Comparison: Accordion/Inline Expand Options</h1>

        {/* Layout selector */}
        <div className="flex gap-2">
          {['C1', 'C2', 'C3'].map(layout => (
            <button
              key={layout}
              onClick={() => setActiveLayout(layout)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeLayout === layout
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {layout === 'C1' && 'C1: Expand in Place'}
              {layout === 'C2' && 'C2: Editor Below'}
              {layout === 'C3' && 'C3: Sidebar + Main'}
            </button>
          ))}
        </div>
      </div>

      {/* Layout description */}
      <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
        <p className="text-sm text-blue-800">
          {activeLayout === 'C1' && (
            <>
              <strong>C1:</strong> Clicked card expands from 1/3 to 2/3 width. Other cards reflow into remaining space.
              <span className="text-blue-600 ml-2">Pro: Editor gets more space. Con: Layout shifts can feel jarring.</span>
            </>
          )}
          {activeLayout === 'C2' && (
            <>
              <strong>C2:</strong> Cards stay stable in a row. Editor panel slides out below the active card.
              <span className="text-blue-600 ml-2">Pro: Stable layout, clear visual hierarchy. Con: Vertical scrolling increases.</span>
            </>
          )}
          {activeLayout === 'C3' && (
            <>
              <strong>C3:</strong> Permanent sidebar with section list. Clicking loads full editor in 2/3 main area.
              <span className="text-blue-600 ml-2">Pro: Fast switching, always know where you are. Con: Less compact, sidebar always visible.</span>
            </>
          )}
        </p>
      </div>

      {/* Active layout */}
      {activeLayout === 'C1' && <LayoutC1 />}
      {activeLayout === 'C2' && <LayoutC2 />}
      {activeLayout === 'C3' && <LayoutC3 />}

      {/* Comparison notes */}
      <div className="px-6 py-4 bg-white border-t border-gray-200">
        <h3 className="text-sm font-bold text-gray-600 mb-2">Mobile Considerations</h3>
        <div className="grid grid-cols-3 gap-4 text-xs text-gray-500">
          <div>
            <strong>C1:</strong> Cards would stack vertically. Expanded card takes full width. Works but complex transitions.
          </div>
          <div>
            <strong>C2:</strong> Cards stack vertically. Tapping opens editor below (natural scroll). Most mobile-friendly.
          </div>
          <div>
            <strong>C3:</strong> Sidebar becomes a horizontal nav or bottom sheet. Editor takes full width. Requires mode switch.
          </div>
        </div>
      </div>
    </div>
  );
}
