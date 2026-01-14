import React, { useState } from 'react';
import { Check, Circle, AlertCircle, X, Edit2, ChevronDown } from 'lucide-react';

// Inline expandable card component with smooth animation
function ExpandableCard({ title, action = 'Manage', isExpanded, onToggle, preview, children, className = '' }) {
  const contentRef = React.useRef(null);
  const previewRef = React.useRef(null);
  const [height, setHeight] = React.useState('auto');

  React.useEffect(() => {
    if (isExpanded && contentRef.current) {
      setHeight(contentRef.current.scrollHeight + 'px');
    } else if (previewRef.current) {
      setHeight(previewRef.current.scrollHeight + 'px');
    }
  }, [isExpanded]);

  return (
    <div className={`border rounded-lg overflow-hidden bg-white transition-all duration-300 ${
      isExpanded ? 'border-purple-300 shadow-md' : 'border-gray-200'
    } ${className}`}>
      <div className={`px-4 py-2 border-b flex justify-between items-center transition-colors duration-200 ${
        isExpanded ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'
      }`}>
        <h3 className={`text-xs font-bold uppercase transition-colors duration-200 ${
          isExpanded ? 'text-purple-600' : 'text-gray-500'
        }`}>{title}</h3>
        <button
          onClick={onToggle}
          className="text-xs text-purple-600 hover:text-purple-700 font-medium"
        >
          {isExpanded ? 'Done' : action}
        </button>
      </div>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? '800px' : '200px' }}
      >
        <div className="p-4">
          <div
            className={`transition-all duration-300 ${isExpanded ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}
            ref={previewRef}
          >
            {!isExpanded && preview}
          </div>
          <div
            className={`transition-all duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}
            ref={contentRef}
          >
            {isExpanded && children}
          </div>
        </div>
      </div>
    </div>
  );
}

// Clickable KPI Card with animation
function KPICard({ label, value, highlight, isEditing, onEdit, onClose, children }) {
  return (
    <div
      className={`rounded-lg p-4 border text-left transition-all duration-300 ${
        isEditing
          ? 'border-purple-400 bg-purple-50 shadow-md scale-[1.02]'
          : highlight
            ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200 hover:border-purple-300 hover:shadow-sm cursor-pointer'
            : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-sm cursor-pointer'
      }`}
      onClick={!isEditing ? onEdit : undefined}
    >
      <div className={`text-xs uppercase font-semibold mb-1 flex items-center justify-between transition-colors duration-200 ${
        isEditing ? 'text-purple-600' : highlight ? 'text-green-600' : 'text-gray-500'
      }`}>
        {label}
        {isEditing ? (
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        ) : (
          <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-50" />
        )}
      </div>
      <div className={`transition-all duration-300 overflow-hidden ${isEditing ? 'max-h-40 opacity-100' : 'max-h-10 opacity-100'}`}>
        {isEditing ? (
          <div className="transition-opacity duration-300">{children}</div>
        ) : (
          <div className={`text-2xl font-bold transition-all duration-300 ${highlight ? 'text-green-700' : 'text-gray-800'}`}>{value}</div>
        )}
      </div>
    </div>
  );
}

// Tower Preview
function TowerPreview() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-2 bg-purple-50 rounded border border-purple-200">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 bg-purple-600 rounded text-white text-xs flex items-center justify-center font-bold">1</span>
          <span className="text-sm font-medium text-purple-900">CMAI</span>
          <span className="text-xs bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded">Ours</span>
        </div>
        <div className="text-sm text-purple-700">$1M x $25K · $35,000</div>
      </div>
    </div>
  );
}

// Tower Editor
function TowerEditor() {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase">
              <th className="text-left py-2 font-medium">Carrier</th>
              <th className="text-left py-2 font-medium">Limit</th>
              <th className="text-left py-2 font-medium">Retention</th>
              <th className="text-right py-2 font-medium">Premium</th>
              <th className="text-right py-2 font-medium">RPM</th>
              <th className="text-right py-2 font-medium">ILF</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-purple-50 border border-purple-200 rounded">
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-purple-900">CMAI</span>
                  <span className="text-xs bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded">Ours</span>
                </div>
              </td>
              <td className="py-2 px-2">
                <select className="border border-purple-300 rounded px-2 py-1 text-sm bg-white">
                  <option>$1M</option>
                  <option>$2M</option>
                  <option>$3M</option>
                  <option>$5M</option>
                </select>
              </td>
              <td className="py-2 px-2">
                <select className="border border-purple-300 rounded px-2 py-1 text-sm bg-white">
                  <option>$25K</option>
                  <option>$50K</option>
                  <option>$100K</option>
                </select>
              </td>
              <td className="py-2 px-2 text-right">
                <input type="text" defaultValue="35,000" className="w-20 border border-purple-300 rounded px-2 py-1 text-sm text-right" />
                <div className="text-xs text-gray-400 mt-0.5">$4,507</div>
              </td>
              <td className="py-2 px-2 text-right">
                <input type="text" defaultValue="4,507" className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
              </td>
              <td className="py-2 px-2 text-right">
                <input type="text" defaultValue="100" className="w-14 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" className="rounded border-gray-300" />
          Quota Share
        </label>
        <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">+ Add Underlying Layer</button>
      </div>
    </div>
  );
}

// Preview components
function PolicyTermsPreview() {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">Effective</span>
        <span className="text-gray-900 font-medium">Dec 21, 2025</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">Expiration</span>
        <span className="text-gray-900 font-medium">Feb 6, 2026</span>
      </div>
    </div>
  );
}

function RetroPreview() {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Cyber</span>
        <span className="font-medium text-gray-800">Full Prior Acts</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Tech E&O</span>
        <span className="font-medium text-gray-800">Inception</span>
      </div>
    </div>
  );
}

function PolicyFormPreview() {
  return (
    <div className="flex items-center gap-2 text-sm text-green-600">
      <Check className="w-4 h-4" />
      <span>Standard Primary Form</span>
    </div>
  );
}

function ExceptionsPreview() {
  return (
    <div className="flex items-center gap-2 text-sm text-green-600">
      <Check className="w-4 h-4" />
      <span>All standard limits</span>
    </div>
  );
}

function EndorsementsPreview() {
  const endorsements = [
    'War & Terrorism Exclusion',
    'OFAC Sanctions Compliance',
    'Nuclear Exclusion',
    'Crypto & Digital Asset Exclusion',
    'Manuscript One',
  ];
  return (
    <div className="space-y-1">
      {endorsements.map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <Circle className="w-2 h-2 fill-amber-400 text-amber-400 flex-shrink-0" />
          <span className="text-gray-700 truncate">{e}</span>
        </div>
      ))}
    </div>
  );
}

function SubjectivitiesPreview() {
  const items = [
    { text: 'Terrorism exclusion confirmation', status: 'pending' },
    { text: 'Security Services contact', status: 'received' },
    { text: 'MFA attestation', status: 'pending' },
  ];
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          {item.status === 'received' ? (
            <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          )}
          <span className="text-gray-700 truncate">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

// Editor components
function PolicyTermsEditor() {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Effective Date</label>
        <input type="date" defaultValue="2025-12-21" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Expiration Date</label>
        <input type="date" defaultValue="2026-02-06" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
      </div>
    </div>
  );
}

function RetroEditor() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Cyber</span>
        <select className="border border-gray-300 rounded px-2 py-1 text-sm">
          <option>Full Prior Acts</option>
          <option>Inception</option>
          <option>Specific Date</option>
        </select>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Tech E&O</span>
        <select className="border border-gray-300 rounded px-2 py-1 text-sm">
          <option>Full Prior Acts</option>
          <option selected>Inception</option>
          <option>Specific Date</option>
        </select>
      </div>
    </div>
  );
}

function ExceptionsEditor() {
  const sublimits = [
    { coverage: 'Dependent System Failure', default: '$1M', treatment: 'default', limit: '$1M' },
    { coverage: 'Social Engineering', default: '$250K', treatment: 'custom', limit: '$500K' },
    { coverage: 'Invoice Manipulation', default: '$250K', treatment: 'default', limit: '$250K' },
    { coverage: 'Funds Transfer Fraud', default: '$250K', treatment: 'default', limit: '$250K' },
    { coverage: 'Telecommunications Fraud', default: '$250K', treatment: 'default', limit: '$250K' },
    { coverage: 'Cryptojacking', default: '$500K', treatment: 'default', limit: '$500K' },
  ];
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs border-b border-gray-200 pb-2">
        <button className="text-purple-600 font-medium border-b-2 border-purple-600 pb-1">Variable Limits</button>
        <button className="text-gray-500 hover:text-gray-700">Standard Limits</button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase">
            <th className="text-left py-1 font-medium">Coverage</th>
            <th className="text-right py-1 font-medium hidden sm:table-cell">Default</th>
            <th className="text-center py-1 font-medium">Treatment</th>
            <th className="text-right py-1 font-medium">Limit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sublimits.map((item) => (
            <tr key={item.coverage} className="group">
              <td className="py-2 text-gray-700">{item.coverage}</td>
              <td className="py-2 text-right text-gray-500 hidden sm:table-cell">{item.default}</td>
              <td className="py-2 text-center">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  item.treatment === 'custom'
                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}>
                  {item.treatment === 'custom' ? 'Custom' : 'Default'}
                </span>
              </td>
              <td className="py-2 text-right font-medium text-purple-600">{item.limit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndorsementsEditor() {
  const endorsements = [
    { name: 'War & Terrorism Exclusion Endorsement', code: 'END-WAR-001', locked: true, shared: true },
    { name: 'OFAC Sanctions Compliance Endorsement', code: 'END-OFAC-001', locked: true, shared: true },
    { name: 'Endorsement - Nuclear Exclusion', code: 'EXC-NUC', shared: true },
    { name: 'Cryptocurrency and Digital Asset Exclusion', code: 'END-CRYPTO-001' },
    { name: 'Manuscript One', code: 'MS-MKBGOLEI' },
  ];
  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase">
            <th className="w-8"></th>
            <th className="text-left py-1 font-medium">Code</th>
            <th className="text-left py-1 font-medium">Title</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {endorsements.map((e) => (
            <tr key={e.code} className="group hover:bg-gray-50">
              <td className="py-2 text-center">
                {e.locked ? (
                  <span className="text-amber-500">🔒</span>
                ) : (
                  <span className="text-gray-300 group-hover:text-gray-400">+</span>
                )}
              </td>
              <td className="py-2 text-gray-500 font-mono text-xs">{e.code}</td>
              <td className="py-2">
                <span className="text-gray-700">{e.name}</span>
                {e.shared && (
                  <span className="ml-2 inline-block px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs border border-gray-200">
                    Shared
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">+ Add Endorsement</button>
    </div>
  );
}

function SubjectivitiesEditor() {
  const items = [
    { text: 'Terrorism exclusion confirmation', status: 'pending' },
    { text: 'Security Services contact', status: 'received' },
    { text: 'MFA attestation', status: 'pending' },
  ];
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className={`p-2 rounded-lg border ${item.status === 'received' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm truncate">{item.text}</span>
            <select className="text-xs border rounded px-1 py-0.5 bg-white flex-shrink-0" defaultValue={item.status}>
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="waived">Waived</option>
            </select>
          </div>
        </div>
      ))}
      <button className="mt-1 text-sm text-purple-600 hover:text-purple-700 font-medium">+ Add</button>
    </div>
  );
}

// Pricing Preview - compact view of key numbers
function PricingPreview() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="text-xs text-gray-500 uppercase">Premium</div>
        <div className="text-lg font-bold text-green-600">$35,000</div>
      </div>
      <div>
        <div className="text-xs text-gray-500 uppercase">Our Limit</div>
        <div className="text-lg font-bold text-gray-800">$1M</div>
      </div>
      <div>
        <div className="text-xs text-gray-500 uppercase">Retention</div>
        <div className="text-lg font-bold text-gray-800">$25K</div>
      </div>
      <div>
        <div className="text-xs text-gray-500 uppercase">Commission</div>
        <div className="text-lg font-bold text-gray-800">20%</div>
      </div>
    </div>
  );
}

// Pricing Editor
function PricingEditor() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-gray-500 uppercase mb-1">Premium</label>
        <input type="text" defaultValue="35,000" className="w-full border border-gray-300 rounded px-3 py-2 font-bold" />
        <div className="text-xs text-gray-400 mt-1">Base: $4,507 · ILF: 100</div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 uppercase mb-1">Our Limit</label>
        <select className="w-full border border-gray-300 rounded px-3 py-2 font-bold">
          <option>$1M</option>
          <option>$2M</option>
          <option>$3M</option>
          <option>$5M</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 uppercase mb-1">Retention</label>
        <select className="w-full border border-gray-300 rounded px-3 py-2 font-bold">
          <option>$25K</option>
          <option>$50K</option>
          <option>$100K</option>
          <option>$150K</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 uppercase mb-1">Commission</label>
        <div className="flex items-center gap-2">
          <input type="number" defaultValue="20" className="w-full border border-gray-300 rounded px-3 py-2 font-bold" />
          <span className="font-bold">%</span>
        </div>
      </div>
    </div>
  );
}

export default function AppQuoteAccordion() {
  const [expanded, setExpanded] = useState(null);
  const [openPanel, setOpenPanel] = useState(null);

  const toggle = (section) => {
    setExpanded(expanded === section ? null : section);
  };

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <h1 className="font-semibold text-gray-900">Smartly Test</h1>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">Draft</span>
              <span className="text-sm text-gray-500 hidden sm:inline">Media Buying Agencies</span>
              <span className="text-sm text-green-600 font-medium">$60M</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <button className="hover:text-gray-700">Docs</button>
              <button className="hover:text-gray-700">AI</button>
              <span className="text-gray-300">|</span>
              <span>Lauren M.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-4 sm:gap-6 overflow-x-auto">
            <button className="py-3 text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">Setup</button>
            <button className="py-3 text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">Analyze</button>
            <button className="py-3 text-sm text-purple-600 font-medium border-b-2 border-purple-600 whitespace-nowrap">Quote</button>
            <button className="py-3 text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">Policy</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Three Button Bar */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Button 1: Option Switcher */}
          <div className="relative">
            <button
              onClick={() => setOpenPanel(openPanel === 'options' ? null : 'options')}
              className={`w-full bg-white rounded-lg border p-3 text-left hover:border-purple-300 transition-all ${
                openPanel === 'options' ? 'border-purple-400 shadow-md' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400 uppercase font-medium">Option</div>
                  <div className="font-semibold text-gray-900">A - $1M x $25K</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">3 options</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${openPanel === 'options' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </button>
            {openPanel === 'options' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-20 p-2">
                <div className="space-y-1">
                  <button className="w-full text-left px-3 py-2 rounded bg-purple-50 text-purple-700 font-medium text-sm">Option A - $1M x $25K</button>
                  <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 text-sm">Option B - $2M x $50K</button>
                  <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 text-sm">Option C - $3M x $100K</button>
                </div>
                <div className="border-t border-gray-200 mt-2 pt-2">
                  <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 text-sm text-purple-600 font-medium flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                    Grid View / Sharing
                  </button>
                  <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-50 text-sm text-gray-600 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    New Option
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Button 2: Documents */}
          <div className="relative">
            <button
              onClick={() => setOpenPanel(openPanel === 'docs' ? null : 'docs')}
              className={`w-full bg-white rounded-lg border p-3 text-left hover:border-purple-300 transition-all ${
                openPanel === 'docs' ? 'border-purple-400 shadow-md' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400 uppercase font-medium">Documents</div>
                  <div className="font-semibold text-gray-900">4 files</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">2 ready</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${openPanel === 'docs' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </button>
            {openPanel === 'docs' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-20 p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>
                      <div>
                        <div className="text-sm font-medium">Quote_Package_v2.pdf</div>
                        <div className="text-xs text-gray-400">Generated Jan 14</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Ready</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>
                      <div>
                        <div className="text-sm font-medium">Binder_Certificate.pdf</div>
                        <div className="text-xs text-gray-400">Draft</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Draft</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>
                      <div>
                        <div className="text-sm font-medium">Policy_Form.pdf</div>
                        <div className="text-xs text-gray-400">Standard form</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Ready</span>
                  </div>
                </div>
                <div className="border-t border-gray-200 mt-3 pt-2">
                  <button className="w-full text-left px-2 py-2 rounded hover:bg-gray-50 text-sm text-purple-600 font-medium">+ Upload Document</button>
                </div>
              </div>
            )}
          </div>

          {/* Button 3: Actions */}
          <div className="relative">
            <button
              onClick={() => setOpenPanel(openPanel === 'actions' ? null : 'actions')}
              className={`w-full bg-white rounded-lg border p-3 text-left hover:border-purple-300 transition-all ${
                openPanel === 'actions' ? 'border-purple-400 shadow-md' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400 uppercase font-medium">Actions</div>
                  <div className="font-semibold text-gray-900">Ready to generate</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${openPanel === 'actions' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </button>
            {openPanel === 'actions' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-20 p-3">
                <div className="space-y-2">
                  <button className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    <div className="text-left">
                      <div>Preview Quote</div>
                      <div className="text-xs text-gray-400 font-normal">View before generating</div>
                    </div>
                  </button>
                  <button className="w-full px-4 py-3 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <div className="text-left">
                      <div>Generate Package</div>
                      <div className="text-xs text-green-200 font-normal">Create quote PDF</div>
                    </div>
                  </button>
                  <button className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div className="text-left">
                      <div>Bind Policy</div>
                      <div className="text-xs text-purple-200 font-normal">Finalize and issue</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Three Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Left Column: Pricing, Policy Terms, Retro, Policy Form */}
          <div className="space-y-4">
            <ExpandableCard
              title="Pricing"
              action="Edit"
              isExpanded={expanded === 'pricing'}
              onToggle={() => toggle('pricing')}
              preview={<PricingPreview />}
            >
              <PricingEditor />
            </ExpandableCard>

            <ExpandableCard
              title="Policy Terms"
              action="Edit"
              isExpanded={expanded === 'terms'}
              onToggle={() => toggle('terms')}
              preview={<PolicyTermsPreview />}
            >
              <PolicyTermsEditor />
            </ExpandableCard>

            <ExpandableCard
              title="Retro Dates"
              action="Edit"
              isExpanded={expanded === 'retro'}
              onToggle={() => toggle('retro')}
              preview={<RetroPreview />}
            >
              <RetroEditor />
            </ExpandableCard>

            <ExpandableCard
              title="Policy Form"
              action="Edit"
              isExpanded={expanded === 'form'}
              onToggle={() => toggle('form')}
              preview={<PolicyFormPreview />}
            >
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input type="radio" name="form" defaultChecked className="text-purple-600" />
                  <span className="text-sm">Standard Primary</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="form" className="text-purple-600" />
                  <span className="text-sm">Standard Excess</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="form" className="text-purple-600" />
                  <span className="text-sm">Manuscript</span>
                </label>
              </div>
            </ExpandableCard>
          </div>

          {/* Middle Column: Tower, Coverages, Docs */}
          <div className="space-y-4">
            <ExpandableCard
              title="Tower"
              action="Edit"
              isExpanded={expanded === 'tower'}
              onToggle={() => toggle('tower')}
              preview={<TowerPreview />}
            >
              <TowerEditor />
            </ExpandableCard>

            <ExpandableCard
              title="Coverages / Exceptions"
              action="Manage"
              isExpanded={expanded === 'exceptions'}
              onToggle={() => toggle('exceptions')}
              preview={<ExceptionsPreview />}
            >
              <ExceptionsEditor />
            </ExpandableCard>
          </div>

          {/* Right Column: Endorsements, Subjectivities, Notes, Sharing */}
          <div className="space-y-4">
            <ExpandableCard
              title="Endorsements"
              action="Manage"
              isExpanded={expanded === 'endorsements'}
              onToggle={() => toggle('endorsements')}
              preview={<EndorsementsPreview />}
            >
              <EndorsementsEditor />
            </ExpandableCard>

            <ExpandableCard
              title="Subjectivities"
              action="Manage"
              isExpanded={expanded === 'subjectivities'}
              onToggle={() => toggle('subjectivities')}
              preview={<SubjectivitiesPreview />}
            >
              <SubjectivitiesEditor />
            </ExpandableCard>

            <ExpandableCard
              title="Notes"
              action="Edit"
              isExpanded={expanded === 'notes'}
              onToggle={() => toggle('notes')}
              preview={<p className="text-sm text-gray-400 italic">No notes added</p>}
            >
              <textarea
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none"
                rows={3}
                placeholder="Add notes..."
              />
            </ExpandableCard>

            <ExpandableCard
              title="Sharing"
              action="Manage"
              isExpanded={expanded === 'sharing'}
              onToggle={() => toggle('sharing')}
              preview={<span className="text-sm text-gray-500">Not shared</span>}
            >
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-2">Share structure with other options:</p>
                {['Option A (this)', 'Option B', 'Option C', 'Option D'].map((opt, i) => (
                  <label key={opt} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" defaultChecked={i === 0} disabled={i === 0} className="rounded border-gray-300 text-purple-600" />
                    <span className={i === 0 ? 'text-gray-400' : ''}>{opt}</span>
                  </label>
                ))}
              </div>
            </ExpandableCard>
          </div>
        </div>
      </div>

      {/* Hint */}
      <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-xs sm:text-sm">
        Click cards to edit inline
      </div>
    </div>
  );
}
