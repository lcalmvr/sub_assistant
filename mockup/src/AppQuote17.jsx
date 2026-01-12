import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Plus,
  Copy,
  Trash2,
  Calendar,
  DollarSign,
  Shield,
  Clock,
  Lock,
  Unlock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  ChevronRight,
  Search,
  Zap,
  Flag,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockRetroSchedules = {
  excess: [
    { coverage: 'Cyber Liability', retroDate: 'Full Prior Acts' },
    { coverage: 'Privacy Liability', retroDate: 'Inception' },
    { coverage: 'Network Security', retroDate: '01/01/2020' },
  ],
  primary: [
    { coverage: 'Cyber Liability', retroDate: 'Inception' },
    { coverage: 'Privacy Liability', retroDate: 'Inception' },
  ],
};

const mockStructures = [
  {
    id: 'struct-1',
    name: '$5M xs $5M',
    position: 'excess',
    defaults: {
      termMonths: 12,
      effectiveDate: '2025-12-21',
      expirationDate: '2026-12-21',
      policyFormKey: 'standard-excess',
      policyFormLabel: 'Standard Excess Form',
      retroSchedule: mockRetroSchedules.excess,
      coverageSummary: '6 coverages',
      defaultEndorsements: 4,
      defaultSubjectivities: 3,
    },
    tower: [
      { carrier: 'Underlying Carrier', limit: 5000000, attachment: 0, retention: 25000, premium: 45000 },
      { carrier: 'CMAI', limit: 5000000, attachment: 5000000, premium: 52000, rpm: 10400, ilf: 0.65 },
    ],
    variations: [
      {
        id: 'var-1a',
        label: 'A',
        name: 'Standard Annual',
        periodMonths: 12,
        effectiveDate: '2025-12-21',
        expirationDate: '2026-12-21',
        commission: null,
        premium: 52000,
        status: 'quoted',
      },
      {
        id: 'var-1b',
        label: 'B',
        name: '18-Month Extended',
        periodMonths: 18,
        effectiveDate: '2025-12-21',
        expirationDate: '2027-06-21',
        commission: 20,
        premium: 78000,
        status: 'draft',
      },
    ],
  },
  {
    id: 'struct-2',
    name: '$2M x $25K',
    position: 'primary',
    defaults: {
      termMonths: 12,
      effectiveDate: '2025-12-21',
      expirationDate: '2026-12-21',
      policyFormKey: 'standard-primary',
      policyFormLabel: 'Standard Primary Form',
      retroSchedule: mockRetroSchedules.primary,
      coverageSummary: '8 coverages',
      defaultEndorsements: 3,
      defaultSubjectivities: 2,
    },
    tower: [
      { carrier: 'CMAI', limit: 2000000, attachment: 0, retention: 25000, premium: 38000, rpm: 19000, ilf: 1.0 },
    ],
    variations: [
      {
        id: 'var-2a',
        label: 'A',
        name: 'Standard',
        periodMonths: 12,
        effectiveDate: '2025-12-21',
        expirationDate: '2026-12-21',
        commission: null,
        premium: 38000,
        status: 'draft',
      },
    ],
  },
];

const mockEndorsements = [
  { id: 'e1', code: 'END-WAR-001', name: 'War & Terrorism Exclusion', type: 'required', assignedTo: ['var-1a', 'var-1b', 'var-2a'] },
  { id: 'e2', code: 'END-OFAC-001', name: 'OFAC Sanctions Compliance', type: 'required', assignedTo: ['var-1a', 'var-1b', 'var-2a'] },
  { id: 'e3', code: 'END-BIO-001', name: 'Biometric Data Exclusion', type: 'auto', assignedTo: ['var-1a', 'var-1b'] },
  { id: 'e4', code: 'END-AI-001', name: 'Additional Insured Schedule', type: 'manual', assignedTo: ['var-1a'] },
  { id: 'e5', code: 'END-ERP-001', name: 'Extended Reporting Period', type: 'auto', assignedTo: ['var-1b'] },
  { id: 'e6', code: 'END-TEO-001', name: 'Tech E&O Extension', type: 'manual', assignedTo: ['var-1a', 'var-2a'] },
  { id: 'e7', code: 'END-PRIM-001', name: 'Primary Coverage Territory', type: 'auto', assignedTo: ['var-2a'] },
];

const mockSubjectivities = [
  { id: 's1', text: 'Receipt of signed application', status: 'pending', assignedTo: ['var-1a', 'var-1b', 'var-2a'] },
  { id: 's2', text: 'Evidence of underlying coverage', status: 'received', assignedTo: ['var-1a', 'var-1b'] },
  { id: 's3', text: 'Copy of expiring policy', status: 'pending', assignedTo: ['var-1a', 'var-1b', 'var-2a'] },
  { id: 's4', text: 'Year 2 financials (extended term)', status: 'pending', assignedTo: ['var-1b'] },
  { id: 's5', text: 'Primary application supplement', status: 'pending', assignedTo: ['var-2a'] },
];

const brokerDefaultCommission = 15; // From broker organization

// =============================================================================
// HELPERS
// =============================================================================

const formatCompact = (val) => {
  if (!val && val !== 0) return '—';
  if (val >= 1_000_000) return `$${val / 1_000_000}M`;
  if (val >= 1_000) return `$${Math.round(val / 1_000)}K`;
  return `$${val}`;
};

const formatCurrency = (val) => {
  if (!val && val !== 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
};

const formatDate = (val) => {
  if (!val) return '—';
  const date = new Date(`${val}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateRange = (start, end) => {
  if (!start && !end) return '—';
  return `${formatDate(start)} — ${formatDate(end)}`;
};

// =============================================================================
// COMPONENTS
// =============================================================================

// Structure Tab (top-level quote option)
function StructureTab({ structure, isActive, onClick, variationCount }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 rounded-lg border-2 text-left transition-all min-w-[180px] ${
        isActive
          ? 'border-purple-500 bg-purple-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`font-bold text-base ${isActive ? 'text-purple-900' : 'text-gray-800'}`}>
          {structure.name}
        </span>
        {structure.position === 'excess' && (
          <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">XS</span>
        )}
      </div>
      <div className="text-xs text-gray-500">
        {variationCount} variation{variationCount !== 1 ? 's' : ''}
      </div>
    </button>
  );
}

// Tower Visual (v11 style)
function TowerVisual({ tower, position }) {
  const reversedTower = [...tower].reverse();

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
        <Layers size={14} className="text-gray-400" />
        Tower Position
      </h3>
      <div className="space-y-1">
        {position === 'excess' && (
          <div className="h-6 border-x border-dashed border-gray-300 flex justify-center">
            <div className="w-px h-full bg-gray-300" />
          </div>
        )}
        {reversedTower.map((layer, idx) => {
          const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
          return (
            <div
              key={idx}
              className={`rounded flex flex-col items-center justify-center text-xs cursor-pointer transition-all ${
                isCMAI
                  ? 'bg-purple-600 text-white h-16 shadow-md ring-2 ring-purple-200'
                  : 'bg-gray-100 border border-gray-300 text-gray-600 h-12 hover:bg-gray-200'
              }`}
            >
              {isCMAI && (
                <span className="text-[10px] uppercase font-normal opacity-80">Our Layer</span>
              )}
              <span className="font-bold">{formatCompact(layer.limit)}</span>
              {layer.attachment > 0 && (
                <span className="text-[10px] opacity-75">xs {formatCompact(layer.attachment)}</span>
              )}
            </div>
          );
        })}
        {position === 'primary' && (
          <div className="h-4 bg-gray-50 border border-gray-200 rounded flex items-center justify-center">
            <span className="text-[9px] text-gray-400 uppercase">Retention {formatCompact(tower[0]?.retention)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Variation Card
function VariationCard({ variation, isActive, onClick, brokerCommission, structureDefaults }) {
  const statusColors = {
    draft: 'bg-gray-100 text-gray-600',
    quoted: 'bg-purple-100 text-purple-700',
    bound: 'bg-green-100 text-green-700',
  };

  const hasCommissionOverride = variation.commission !== null;
  const effectiveCommission = hasCommissionOverride ? variation.commission : brokerCommission;
  const termOverride = structureDefaults && variation.periodMonths !== structureDefaults.termMonths;
  const datesOverride = structureDefaults && (
    variation.effectiveDate !== structureDefaults.effectiveDate ||
    variation.expirationDate !== structureDefaults.expirationDate
  );
  const overrides = [];
  if (termOverride || datesOverride) overrides.push('Dates');
  if (hasCommissionOverride) overrides.push('Commission');
  const overridesLabel = overrides.length ? `Overrides: ${overrides.join(', ')}` : 'Inherits defaults';
  const overridesStyle = overrides.length ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
        isActive
          ? 'border-purple-500 bg-purple-50/50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
            {variation.label}
          </span>
          <span className="font-semibold text-gray-900">{variation.name}</span>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${statusColors[variation.status]}`}>
          {variation.status.toUpperCase()}
        </span>
      </div>

      <div className={`text-[10px] px-2 py-0.5 rounded font-semibold w-max ${overridesStyle}`}>
        {overridesLabel}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mt-3">
        <div>
          <div className="text-xs text-gray-500">Period</div>
          <div className={`font-medium ${termOverride ? 'text-purple-700' : 'text-gray-900'}`}>
            {variation.periodMonths} months
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Dates</div>
          <div className={`font-medium ${datesOverride ? 'text-purple-700' : 'text-gray-900'}`}>
            {formatDateRange(variation.effectiveDate, variation.expirationDate)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Commission</div>
          <div className={`font-medium flex items-center gap-1 ${hasCommissionOverride ? 'text-amber-700' : 'text-gray-900'}`}>
            {hasCommissionOverride && <Unlock size={12} />}
            {effectiveCommission}%
            {!hasCommissionOverride && <span className="text-xs text-gray-400">(default)</span>}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Premium</div>
          <div className="font-bold text-green-700">{formatCurrency(variation.premium)}</div>
        </div>
      </div>
    </div>
  );
}

// Tower Table
function TowerTable({ tower, position }) {
  const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tower Structure</h3>
        {cmaiLayer && (
          <span className="text-sm font-semibold text-green-600">
            Our Premium: {formatCurrency(cmaiLayer.premium)}
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Carrier</th>
            <th className="px-4 py-2 text-left font-semibold">Limit</th>
            <th className="px-4 py-2 text-left font-semibold">{position === 'primary' ? 'Retention' : 'Attach'}</th>
            <th className="px-4 py-2 text-right font-semibold">Premium</th>
            <th className="px-4 py-2 text-right font-semibold">RPM</th>
            <th className="px-4 py-2 text-right font-semibold">ILF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...tower].reverse().map((layer, idx) => {
            const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
            return (
              <tr key={idx} className={isCMAI ? 'bg-purple-50' : 'hover:bg-gray-50'}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${isCMAI ? 'text-purple-700' : 'text-gray-800'}`}>
                      {layer.carrier}
                    </span>
                    {isCMAI && (
                      <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded">Ours</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">{formatCompact(layer.limit)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {layer.attachment > 0 ? `xs ${formatCompact(layer.attachment)}` : formatCompact(layer.retention)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(layer.premium)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{layer.rpm ? `$${layer.rpm.toLocaleString()}` : '—'}</td>
                <td className="px-4 py-3 text-right text-gray-500">{layer.ilf ? `${(layer.ilf * 100).toFixed(0)}%` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Side Panel Tab Button
function SidePanelTab({ icon: Icon, label, isActive, onClick, badge, badgeColor }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
        isActive
          ? 'bg-purple-100 text-purple-700'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={14} />
      <span>{label}</span>
      {badge !== undefined && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
          badgeColor || (isActive ? 'bg-purple-200 text-purple-800' : 'bg-gray-200 text-gray-600')
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// Matrix Checkbox
function VariationScopeToggle({ label, checked, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
        checked
          ? 'bg-purple-100 border-purple-300 text-purple-700'
          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {label}
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function AppQuote17() {
  const [activeStructureId, setActiveStructureId] = useState('struct-1');
  const [activeVariationId, setActiveVariationId] = useState('var-1a');
  const [sidePanelTab, setSidePanelTab] = useState('terms');
  const [endorsements, setEndorsements] = useState(mockEndorsements);
  const [subjectivities, setSubjectivities] = useState(mockSubjectivities);
  const [policyForm, setPolicyForm] = useState('standard-excess');
  const [customPolicyForm, setCustomPolicyForm] = useState('');

  // Matrix filters
  const [showRequiredOnly, setShowRequiredOnly] = useState(false);
  const [showAutoOnly, setShowAutoOnly] = useState(false);
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  const activeStructure = mockStructures.find(s => s.id === activeStructureId);
  const activeVariation = activeStructure?.variations.find(v => v.id === activeVariationId);
  const activeDefaults = activeStructure?.defaults;
  const isExcess = activeStructure?.position === 'excess';
  const scopeVariations = activeStructure?.variations || [];
  const scopeVariationIds = scopeVariations.map(variation => variation.id);

  const variationLabelMap = useMemo(() => {
    const map = new Map();
    scopeVariations.forEach(variation => {
      map.set(variation.id, variation.label);
    });
    return map;
  }, [scopeVariations]);

  useEffect(() => {
    const defaultForm = activeDefaults?.policyFormKey || (isExcess ? 'standard-excess' : 'standard-primary');
    setPolicyForm(defaultForm);
    setCustomPolicyForm('');
  }, [activeStructureId, activeDefaults, isExcess]);

  const variationDatesOverride = !!(
    activeVariation &&
    activeDefaults &&
    (activeVariation.effectiveDate !== activeDefaults.effectiveDate ||
      activeVariation.expirationDate !== activeDefaults.expirationDate)
  );
  const variationTermOverride = !!(
    activeVariation &&
    activeDefaults &&
    activeVariation.periodMonths !== activeDefaults.termMonths
  );

  // Filter endorsements based on toggles
  const filteredEndorsements = useMemo(() => {
    const scoped = endorsements.filter(e =>
      e.assignedTo.some(id => scopeVariationIds.includes(id))
    );
    return scoped.filter(e => {
      if (showRequiredOnly && e.type !== 'required') return false;
      if (showAutoOnly && e.type !== 'auto') return false;
      if (showDiffOnly) {
        const assignedInScope = e.assignedTo.filter(id => scopeVariationIds.includes(id));
        if (assignedInScope.length === scopeVariationIds.length) return false;
      }
      return true;
    });
  }, [endorsements, showRequiredOnly, showAutoOnly, showDiffOnly, scopeVariationIds]);

  // Filter subjectivities based on toggles
  const filteredSubjectivities = useMemo(() => {
    const scoped = subjectivities.filter(s =>
      s.assignedTo.some(id => scopeVariationIds.includes(id))
    );
    return scoped.filter(s => {
      if (showDiffOnly) {
        const assignedInScope = s.assignedTo.filter(id => scopeVariationIds.includes(id));
        if (assignedInScope.length === scopeVariationIds.length) return false;
      }
      return true;
    });
  }, [subjectivities, showDiffOnly, scopeVariationIds]);

  // Toggle endorsement assignment
  const toggleEndorsement = (endtId, varId) => {
    setEndorsements(prev => prev.map(e => {
      if (e.id !== endtId || e.type === 'required') return e;
      const assigned = e.assignedTo.includes(varId)
        ? e.assignedTo.filter(v => v !== varId)
        : [...e.assignedTo, varId];
      return { ...e, assignedTo: assigned };
    }));
  };

  // Toggle subjectivity assignment
  const toggleSubjectivity = (subjId, varId) => {
    setSubjectivities(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      const assigned = s.assignedTo.includes(varId)
        ? s.assignedTo.filter(v => v !== varId)
        : [...s.assignedTo, varId];
      return { ...s, assignedTo: assigned };
    }));
  };

  const applyEndorsementToAllInScope = (endtId) => {
    setEndorsements(prev => prev.map(e => {
      if (e.id !== endtId || e.type === 'required') return e;
      const assigned = new Set([...e.assignedTo, ...scopeVariationIds]);
      return { ...e, assignedTo: Array.from(assigned) };
    }));
  };

  const applySubjectivityToAllInScope = (subjId) => {
    setSubjectivities(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      const assigned = new Set([...s.assignedTo, ...scopeVariationIds]);
      return { ...s, assignedTo: Array.from(assigned) };
    }));
  };

  const getScopeLabel = (assignedIds) => {
    if (!scopeVariationIds.length) {
      return { label: 'No variations', tone: 'bg-gray-100 text-gray-500' };
    }
    if (assignedIds.length === scopeVariationIds.length) {
      return { label: 'All variations', tone: 'bg-emerald-100 text-emerald-700' };
    }
    if (assignedIds.length === 0) {
      return { label: 'Not applied', tone: 'bg-gray-100 text-gray-500' };
    }
    if (assignedIds.length === 1) {
      const onlyLabel = variationLabelMap.get(assignedIds[0]) || assignedIds[0];
      return { label: `Only ${onlyLabel}`, tone: 'bg-amber-100 text-amber-700' };
    }
    return { label: 'Custom scope', tone: 'bg-amber-100 text-amber-700' };
  };

  // Flags & warnings
  const pendingSubjs = subjectivities.filter(s =>
    s.assignedTo.includes(activeVariationId) && s.status === 'pending'
  ).length;

  const driftWarnings = [
    { type: 'endt', message: 'Primary option missing Biometric Exclusion' },
    { type: 'subj', message: 'Year 2 financials only on 18-month term' },
    { type: 'term', message: 'Variation B extends policy dates by 6 months' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      {/* Header */}
      <nav className="h-12 bg-slate-900 text-slate-300 flex items-center px-4 text-sm">
        <span className="font-semibold text-white mr-4">Underwriting Portal</span>
        <span className="text-white">Karbon Steel Industries</span>
        <span className="ml-4 px-2 py-0.5 bg-purple-900 text-purple-200 text-xs rounded-full border border-purple-700">
          Quoting
        </span>
      </nav>

      <main className="max-w-7xl mx-auto p-6">

        {/* Structure Tabs + Actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-3">
            {mockStructures.map(structure => (
              <StructureTab
                key={structure.id}
                structure={structure}
                isActive={activeStructureId === structure.id}
                onClick={() => {
                  setActiveStructureId(structure.id);
                  setActiveVariationId(structure.variations[0].id);
                }}
                variationCount={structure.variations.length}
              />
            ))}
            <button className="px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-purple-400 hover:text-purple-600 transition-colors flex items-center gap-2">
              <Plus size={18} />
              <span className="text-sm font-medium">New Structure</span>
            </button>
          </div>
          <div className="flex gap-2">
            <button className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="Clone Structure">
              <Copy size={18} />
            </button>
            <button className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="Delete Structure">
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">

          {/* LEFT COLUMN */}
          <div className="col-span-8 space-y-4">

            {/* Tower Visual + Table Row */}
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-1">
                <TowerVisual tower={activeStructure?.tower || []} position={activeStructure?.position} />
              </div>
              <div className="col-span-3">
                <TowerTable tower={activeStructure?.tower || []} position={activeStructure?.position} />
              </div>
            </div>

            {/* Variations */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                    <Calendar size={14} className="text-gray-400" />
                    Term Variations
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Dates, commission, and premium vary. Endts/subjs stay shared unless overridden.
                  </p>
                </div>
                <button className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1">
                  <Plus size={14} /> Add Variation
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {activeStructure?.variations.map(variation => (
                  <VariationCard
                    key={variation.id}
                    variation={variation}
                    isActive={activeVariationId === variation.id}
                    onClick={() => setActiveVariationId(variation.id)}
                    brokerCommission={brokerDefaultCommission}
                    structureDefaults={activeStructure?.defaults}
                  />
                ))}
              </div>
            </div>

            {/* Coverage Schedule (Collapsed) */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                  <Shield size={14} className="text-gray-400" />
                  Coverage Schedule
                </h3>
                <ChevronRight size={18} className="text-gray-400" />
              </button>
            </div>

          </div>

          {/* RIGHT COLUMN - Side Panel */}
          <div className="col-span-4 sticky top-6">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">

              {/* Action Buttons (Top of Panel) */}
              <div className="p-3 border-b border-gray-100 bg-gray-50/50">
                <div className="grid grid-cols-3 gap-2">
                  <button className="py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center justify-center gap-1.5">
                    <Eye size={14} />
                    Preview
                  </button>
                  <button className="py-2 px-3 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 flex items-center justify-center gap-1.5">
                    <FileText size={14} />
                    Generate
                  </button>
                  <button className="py-2 px-3 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 flex items-center justify-center gap-1.5">
                    <CheckCircle2 size={14} />
                    Bind
                  </button>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="px-2 py-2 border-b border-gray-100 flex flex-wrap gap-1">
                <SidePanelTab
                  icon={Calendar}
                  label="Terms"
                  isActive={sidePanelTab === 'terms'}
                  onClick={() => setSidePanelTab('terms')}
                />
                <SidePanelTab
                  icon={DollarSign}
                  label="Premium"
                  isActive={sidePanelTab === 'premium'}
                  onClick={() => setSidePanelTab('premium')}
                />
                <SidePanelTab
                  icon={Shield}
                  label="Endts"
                  isActive={sidePanelTab === 'endorsements'}
                  onClick={() => setSidePanelTab('endorsements')}
                  badge={endorsements.length}
                />
                <SidePanelTab
                  icon={AlertTriangle}
                  label="Subjs"
                  isActive={sidePanelTab === 'subjectivities'}
                  onClick={() => setSidePanelTab('subjectivities')}
                  badge={pendingSubjs}
                  badgeColor={pendingSubjs > 0 ? 'bg-amber-100 text-amber-700' : undefined}
                />
                <SidePanelTab
                  icon={Flag}
                  label="Flags"
                  isActive={sidePanelTab === 'flags'}
                  onClick={() => setSidePanelTab('flags')}
                  badge={driftWarnings.length}
                  badgeColor="bg-amber-100 text-amber-700"
                />
              </div>

              {/* Tab Content */}
              <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/70">
                <div className="text-[9px] text-gray-400 uppercase">Editing</div>
                <div className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                  <span>{activeStructure?.name}</span>
                  <span className="text-[10px] text-gray-500">Variation {activeVariation?.label}</span>
                </div>
              </div>
              <div className="p-4 max-h-[500px] overflow-y-auto">

                {/* TERMS TAB */}
                {sidePanelTab === 'terms' && (
                  <div className="space-y-5">
                    {/* Variation Terms */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Variation Terms</label>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700">
                          This variation
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-400 mb-1 block">Effective</label>
                          <input
                            type="date"
                            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                            defaultValue={activeVariation?.effectiveDate || ''}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 mb-1 block">Expiration</label>
                          <input
                            type="date"
                            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                            defaultValue={activeVariation?.expirationDate || ''}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>Term length: {activeVariation?.periodMonths} months</span>
                        {variationDatesOverride || variationTermOverride ? (
                          <button className="text-purple-600 hover:text-purple-800">Reset to base</button>
                        ) : (
                          <span className="text-gray-400">Matches base</span>
                        )}
                      </div>
                    </div>

                    {/* Policy Form */}
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Policy Form</label>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">
                          All variations
                        </span>
                      </div>
                      <select
                        value={policyForm}
                        onChange={(e) => setPolicyForm(e.target.value)}
                        disabled={!isExcess}
                        className={`w-full text-sm border border-gray-300 rounded px-2 py-1.5 ${
                          !isExcess ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                        }`}
                      >
                        {isExcess ? (
                          <>
                            <option value="standard-excess">Standard Excess Form</option>
                            <option value="follow-form">Follow Form</option>
                            <option value="moi">MOI (Manuscript)</option>
                            <option value="custom">Custom Form...</option>
                          </>
                        ) : (
                          <option value="standard-primary">Standard Primary Form</option>
                        )}
                      </select>
                      {isExcess && policyForm === 'custom' && (
                        <input
                          type="text"
                          placeholder="Enter form name or number"
                          value={customPolicyForm}
                          onChange={(e) => setCustomPolicyForm(e.target.value)}
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                        />
                      )}
                    </div>

                    {/* Retro Schedule */}
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                          <Clock size={12} />
                          Retroactive Schedule
                        </label>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">
                          All variations
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {(activeDefaults?.retroSchedule || []).map((rc, idx) => (
                          <div key={idx} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-xs">
                            <span className="font-medium text-gray-700">{rc.coverage}</span>
                            <span className="text-gray-500">{rc.retroDate}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>Coverage schedule</span>
                        <span className="font-medium text-gray-700">{activeDefaults?.coverageSummary}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PREMIUM TAB */}
                {sidePanelTab === 'premium' && activeVariation && (
                  <div className="space-y-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Technical Premium</div>
                      <div className="text-xl font-bold text-gray-700">$48,000</div>
                    </div>

                    <div className="p-3 bg-blue-50 rounded-lg">
                      <div className="text-xs text-blue-600 uppercase font-semibold mb-1">Risk-Adjusted</div>
                      <div className="text-xl font-bold text-blue-700">{formatCurrency(activeVariation.premium)}</div>
                    </div>

                    <div className="p-3 bg-purple-50 rounded-lg border-2 border-purple-200">
                      <div className="text-xs text-purple-600 uppercase font-semibold mb-1">Sold Premium</div>
                      <input
                        type="text"
                        defaultValue={activeVariation.premium?.toLocaleString()}
                        className="text-xl font-bold text-purple-700 bg-transparent w-full outline-none"
                      />
                    </div>

                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase">Commission</span>
                        {activeVariation.commission !== null ? (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                            <Unlock size={10} /> Override
                          </span>
                        ) : (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">
                            Broker Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          defaultValue={activeVariation.commission ?? brokerDefaultCommission}
                          className="w-20 text-sm border border-gray-300 rounded px-2 py-1.5 text-right"
                        />
                        <span className="text-gray-500">%</span>
                        {activeVariation.commission === null && (
                          <button className="text-xs text-purple-600 hover:text-purple-800 ml-auto">
                            Override
                          </button>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        Net premium: {formatCurrency(activeVariation.premium * (1 - (activeVariation.commission ?? brokerDefaultCommission) / 100))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ENDORSEMENTS TAB */}
                {sidePanelTab === 'endorsements' && (
                  <div className="space-y-3">
                    {/* Search */}
                    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1.5">
                      <Search size={14} className="text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search endorsements..."
                        className="flex-1 text-xs outline-none"
                      />
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setShowRequiredOnly(!showRequiredOnly)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border ${
                          showRequiredOnly ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        {showRequiredOnly ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                        Required
                      </button>
                      <button
                        onClick={() => setShowAutoOnly(!showAutoOnly)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border ${
                          showAutoOnly ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        {showAutoOnly ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                        Auto
                      </button>
                      <button
                        onClick={() => setShowDiffOnly(!showDiffOnly)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border ${
                          showDiffOnly ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        {showDiffOnly ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                        Differences
                      </button>
                    </div>

                    <div className="text-[10px] text-gray-400">
                      Scope: {activeStructure?.name} variations
                    </div>

                    {/* Inline Scope List */}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {filteredEndorsements.map(endt => {
                        const assignedInScope = endt.assignedTo.filter(id => scopeVariationIds.includes(id));
                        const hasDiff = assignedInScope.length !== scopeVariationIds.length;
                        const { label: scopeLabel, tone: scopeTone } = getScopeLabel(assignedInScope);
                        const showSync = hasDiff && endt.type === 'manual';
                        return (
                          <div
                            key={endt.id}
                            className={`p-2 rounded-lg border border-gray-100 ${
                              hasDiff ? 'bg-amber-50/40' : 'bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {endt.type === 'required' && <Lock size={10} className="text-gray-400 flex-shrink-0" />}
                                {endt.type === 'auto' && <Zap size={10} className="text-amber-500 flex-shrink-0" />}
                                {endt.type === 'manual' && <Plus size={10} className="text-gray-300 flex-shrink-0" />}
                                <span className="text-[11px] text-gray-700 truncate" title={endt.name}>
                                  {endt.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap justify-end">
                                {showSync && (
                                  <button
                                    onClick={() => applyEndorsementToAllInScope(endt.id)}
                                    className="text-[10px] text-purple-600 hover:text-purple-800 font-medium"
                                  >
                                    Sync all
                                  </button>
                                )}
                                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${scopeTone}`}>
                                  {scopeLabel}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-2">
                              {scopeVariations.map(variation => (
                                <VariationScopeToggle
                                  key={variation.id}
                                  label={variation.label}
                                  checked={endt.assignedTo.includes(variation.id)}
                                  onClick={() => toggleEndorsement(endt.id, variation.id)}
                                  disabled={endt.type === 'required'}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {filteredEndorsements.length === 0 && (
                        <div className="py-6 text-center text-gray-400 text-xs border border-dashed border-gray-200 rounded-lg">
                          No endorsements match current filters
                        </div>
                      )}
                    </div>

                    <button className="w-full py-2 text-xs text-purple-600 hover:bg-purple-50 rounded border border-dashed border-purple-200 font-medium">
                      + Add Endorsement
                    </button>
                  </div>
                )}

                {/* SUBJECTIVITIES TAB */}
                {sidePanelTab === 'subjectivities' && (
                  <div className="space-y-3">
                    {/* Search */}
                    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1.5">
                      <Search size={14} className="text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search subjectivities..."
                        className="flex-1 text-xs outline-none"
                      />
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setShowDiffOnly(!showDiffOnly)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border ${
                          showDiffOnly ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'
                        }`}
                      >
                        {showDiffOnly ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                        Differences Only
                      </button>
                    </div>

                    <div className="text-[10px] text-gray-400">
                      Scope: {activeStructure?.name} variations
                    </div>

                    {/* Inline Scope List */}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {filteredSubjectivities.map(subj => {
                        const assignedInScope = subj.assignedTo.filter(id => scopeVariationIds.includes(id));
                        const hasDiff = assignedInScope.length !== scopeVariationIds.length;
                        const { label: scopeLabel, tone: scopeTone } = getScopeLabel(assignedInScope);
                        const showSync = hasDiff;
                        return (
                          <div
                            key={subj.id}
                            className={`p-2 rounded-lg border border-gray-100 ${
                              hasDiff ? 'bg-amber-50/40' : 'bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`text-[9px] px-1 py-0.5 rounded flex-shrink-0 ${
                                  subj.status === 'received' ? 'bg-green-100 text-green-700' :
                                  subj.status === 'waived' ? 'bg-gray-100 text-gray-500' :
                                  'bg-amber-100 text-amber-700'
                                }`}>
                                  {subj.status.slice(0, 3).toUpperCase()}
                                </span>
                                <span className="text-[11px] text-gray-700 truncate" title={subj.text}>
                                  {subj.text}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap justify-end">
                                {showSync && (
                                  <button
                                    onClick={() => applySubjectivityToAllInScope(subj.id)}
                                    className="text-[10px] text-purple-600 hover:text-purple-800 font-medium"
                                  >
                                    Sync all
                                  </button>
                                )}
                                <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${scopeTone}`}>
                                  {scopeLabel}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-2">
                              {scopeVariations.map(variation => (
                                <VariationScopeToggle
                                  key={variation.id}
                                  label={variation.label}
                                  checked={subj.assignedTo.includes(variation.id)}
                                  onClick={() => toggleSubjectivity(subj.id, variation.id)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {filteredSubjectivities.length === 0 && (
                        <div className="py-6 text-center text-gray-400 text-xs border border-dashed border-gray-200 rounded-lg">
                          No subjectivities match current filters
                        </div>
                      )}
                    </div>

                    <button className="w-full py-2 text-xs text-purple-600 hover:bg-purple-50 rounded border border-dashed border-purple-200 font-medium">
                      + Add Subjectivity
                    </button>
                  </div>
                )}

                {/* FLAGS TAB */}
                {sidePanelTab === 'flags' && (
                  <div className="space-y-4">
                    {/* Bind Readiness */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Bind Readiness</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                          <CheckCircle2 size={14} className="text-green-600" />
                          <span className="text-green-800">Premium set</span>
                        </div>
                        {pendingSubjs > 0 && (
                          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                            <AlertTriangle size={14} className="text-amber-600" />
                            <span className="text-amber-800">{pendingSubjs} pending subjectivities</span>
                          </div>
                        )}
                        {activeVariation?.status === 'draft' && (
                          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                            <AlertTriangle size={14} className="text-amber-600" />
                            <span className="text-amber-800">Quote document not generated</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Drift Warnings */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Cross-Option Drift</h4>
                      <div className="space-y-2">
                        {driftWarnings.map((warning, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                            <AlertCircle size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="text-blue-800">{warning.message}</span>
                              <button className="block text-blue-600 hover:text-blue-800 mt-1 font-medium">
                                View difference →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
