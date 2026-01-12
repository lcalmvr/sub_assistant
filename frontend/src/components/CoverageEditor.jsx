import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateQuoteOption } from '../api/client';

// Format currency
function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Format number with commas for input display
function formatNumberWithCommas(value) {
  if (!value && value !== 0) return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('en-US').format(num);
}

// Parse number from formatted input (removes commas)
function parseFormattedNumber(value) {
  if (!value) return '';
  const cleaned = value.replace(/[^0-9.]/g, '');
  return cleaned;
}

// Format compact currency (e.g., $5M, $25K)
function formatCompact(value) {
  if (!value && value !== 0) return '—';
  if (value >= 1_000_000) return `$${value / 1_000_000}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

// Get limit from tower_json
function getTowerLimit(quote) {
  if (!quote?.tower_json || !quote.tower_json.length) return null;
  const cmaiLayer = quote.tower_json.find(l => l.carrier === 'CMAI') || quote.tower_json[0];
  return cmaiLayer?.limit;
}

// Coverage definitions matching Streamlit coverage_defaults.yml
export const AGGREGATE_COVERAGES = [
  { id: 'tech_eo', label: 'Tech E&O', cyber: 0, cyber_tech: 'aggregate', tech: 'aggregate' },
  { id: 'network_security_privacy', label: 'Network Security & Privacy Liability', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'privacy_regulatory', label: 'Privacy Regulatory Proceedings', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'pci', label: 'Payment Card Industry (PCI)', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'media_liability', label: 'Media Liability', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'business_interruption', label: 'Business Interruption', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'system_failure', label: 'System Failure', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'dependent_bi', label: 'Dependent Business Interruption', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'cyber_extortion', label: 'Cyber Extortion', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'data_recovery', label: 'Data Recovery', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'reputational_harm', label: 'Reputational Harm', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
];

export const SUBLIMIT_COVERAGES = [
  { id: 'dependent_system_failure', label: 'Dependent System Failure', default: 1000000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'social_engineering', label: 'Social Engineering', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'invoice_manipulation', label: 'Invoice Manipulation', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'funds_transfer_fraud', label: 'Funds Transfer Fraud', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'telecom_fraud', label: 'Telecommunications Fraud', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'cryptojacking', label: 'Cryptojacking', default: 500000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
];

// Standard limit options
export const AGGREGATE_LIMIT_OPTIONS = [1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000];
export const RETENTION_OPTIONS = [25_000, 50_000, 100_000, 150_000, 250_000, 500_000];

/**
 * CoverageEditor component for editing coverage schedules
 * Tower-style table with click-to-edit and arrow key navigation
 */
export default function CoverageEditor({
  coverages: propCoverages,
  aggregateLimit,
  onSave,
  mode = 'quote',
  newAggregateLimit,
  showBatchEdit: showBatchEditProp = true,
  allQuotes,
  submissionId,
  readOnly = false,
  quote,
  originalCoverages: propOriginalCoverages,
  embedded = false,
  setEditControls,
}) {
  const [activeTab, setActiveTab] = useState('variable');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchCoverages, setBatchCoverages] = useState([{ id: '', value: 0 }]);
  const [selectedQuotes, setSelectedQuotes] = useState({});
  const tableRef = useRef(null);
  const treatmentRefs = useRef({});
  const limitInputRefs = useRef({});
  const queryClient = useQueryClient();

  // Support both direct coverages prop and legacy quote prop
  const coverages = propCoverages || quote?.coverages || {
    aggregate_coverages: {},
    sublimit_coverages: {},
  };

  // Original coverages for endorsement comparison
  const originalCoverages = propOriginalCoverages || {
    aggregate_coverages: {},
    sublimit_coverages: {},
  };

  // For endorsement mode, determine effective aggregate limit
  const effectiveAggregateLimit = newAggregateLimit || aggregateLimit;
  const isAggregateChanging = mode === 'endorsement' && newAggregateLimit && newAggregateLimit !== aggregateLimit;

  // Primary quotes for batch selection (filter out excess)
  const primaryQuotes = (allQuotes || []).filter(q => q.position !== 'excess');

  // All coverage options for batch edit dropdown
  const allCoverageOptions = [
    ...SUBLIMIT_COVERAGES.map(c => ({ ...c, type: 'sublimit' })),
    ...AGGREGATE_COVERAGES.map(c => ({ ...c, type: 'aggregate' })),
  ];

  // Sublimit options for batch edit
  const sublimitOptions = [
    { label: '$100K', value: 100000 },
    { label: '$250K', value: 250000 },
    { label: '$500K', value: 500000 },
    { label: '$1M', value: 1000000 },
    { label: '50% Agg', value: Math.floor(effectiveAggregateLimit / 2) },
    { label: 'Aggregate', value: effectiveAggregateLimit },
    { label: 'None', value: 0 },
    { label: 'Custom...', value: 'custom' },
  ];

  // Aggregate options for batch edit
  const aggregateOptions = [
    { label: 'Full Limits', value: 'full' },
    { label: '$1M', value: 1000000 },
    { label: 'No Coverage', value: 0 },
    { label: 'Custom...', value: 'custom' },
  ];

  // Initialize selected quotes when batch edit opens
  useEffect(() => {
    if (showBatchEdit && primaryQuotes.length > 0) {
      const initial = {};
      primaryQuotes.forEach(q => { initial[q.id] = true; });
      setSelectedQuotes(initial);
    }
  }, [showBatchEdit]);

  // Get tower limit for a quote
  const getTowerLimit = (q) => {
    const tower = q?.tower_json || [];
    const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI')) || tower[0];
    return cmaiLayer?.limit || 1000000;
  };

  // Batch edit mutation
  const batchMutation = useMutation({
    mutationFn: async ({ coverageUpdates, quoteIds, quotesData }) => {
      const results = [];
      for (const qId of quoteIds) {
        const targetQuote = quotesData.find(q => q.id === qId);
        if (!targetQuote) continue;

        const targetLimit = getTowerLimit(targetQuote) || 1000000;
        const existingCoverages = targetQuote.coverages || {};

        const updatedCoverages = {
          ...existingCoverages,
          aggregate_coverages: { ...(existingCoverages.aggregate_coverages || {}) },
          sublimit_coverages: { ...(existingCoverages.sublimit_coverages || {}) },
        };

        coverageUpdates.forEach(({ id, value, type }) => {
          const actualValue = value === 'full' ? targetLimit : value;
          if (type === 'sublimit') {
            updatedCoverages.sublimit_coverages[id] = actualValue;
          } else {
            updatedCoverages.aggregate_coverages[id] = actualValue;
          }
        });

        const result = await updateQuoteOption(qId, { coverages: updatedCoverages });
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      setShowBatchEdit(false);
      setBatchCoverages([{ id: '', value: 0 }]);
    },
  });

  const handleBatchApply = () => {
    const selectedIds = Object.entries(selectedQuotes)
      .filter(([_, selected]) => selected)
      .map(([id]) => id);

    const coverageUpdates = batchCoverages
      .filter(bc => bc.id)
      .map(bc => {
        const covDef = allCoverageOptions.find(c => c.id === bc.id);
        return { id: bc.id, value: bc.value, type: covDef?.type || 'sublimit' };
      });

    if (selectedIds.length > 0 && coverageUpdates.length > 0) {
      batchMutation.mutate({
        coverageUpdates,
        quoteIds: selectedIds,
        quotesData: allQuotes || primaryQuotes
      });
    }
  };

  // Reset editing state when coverages change externally
  useEffect(() => {
    setIsEditing(false);
    setDraft({});
    treatmentRefs.current = {};
    limitInputRefs.current = {};
  }, [quote?.id]);

  // Initialize draft from coverages when entering edit mode
  const enterEditMode = (focusIdx = 0) => {
    const initialDraft = {};
    const currentCoverages = activeTab === 'variable' ? SUBLIMIT_COVERAGES : AGGREGATE_COVERAGES;
    currentCoverages.forEach((cov, idx) => {
      if (activeTab === 'variable') {
        const val = coverages.sublimit_coverages?.[cov.id];
        initialDraft[cov.id] = val !== undefined ? val : cov.default;
      } else {
        const val = coverages.aggregate_coverages?.[cov.id];
        initialDraft[cov.id] = val !== undefined ? val : effectiveAggregateLimit;
      }
    });
    setDraft(initialDraft);
    setIsEditing(true);
    setTimeout(() => {
      if (limitInputRefs.current[focusIdx]) {
        limitInputRefs.current[focusIdx].focus();
        limitInputRefs.current[focusIdx].select();
      }
    }, 0);
  };

  // Arrow key navigation - supports both vertical (up/down) and horizontal (left/right)
  const handleArrowNav = (e, rowIdx, column = 'limit') => {
    const currentCoverages = activeTab === 'variable' ? SUBLIMIT_COVERAGES : AGGREGATE_COVERAGES;
    const maxIdx = currentCoverages.length - 1;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = rowIdx - 1;
      if (prevIdx >= 0) {
        const ref = column === 'treatment' ? treatmentRefs.current[prevIdx] : limitInputRefs.current[prevIdx];
        if (ref) {
          ref.focus();
          if (column === 'limit') ref.select();
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = rowIdx + 1;
      if (nextIdx <= maxIdx) {
        const ref = column === 'treatment' ? treatmentRefs.current[nextIdx] : limitInputRefs.current[nextIdx];
        if (ref) {
          ref.focus();
          if (column === 'limit') ref.select();
        }
      }
    } else if (e.key === 'ArrowLeft') {
      // Move from Limit to Treatment in same row
      if (column === 'limit' && treatmentRefs.current[rowIdx]) {
        e.preventDefault();
        treatmentRefs.current[rowIdx].focus();
      }
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      // Move from Treatment to Limit in same row
      if (column === 'treatment' && limitInputRefs.current[rowIdx]) {
        e.preventDefault();
        limitInputRefs.current[rowIdx].focus();
        limitInputRefs.current[rowIdx].select();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Move to next row, same column
      const nextIdx = rowIdx + 1;
      if (nextIdx <= maxIdx) {
        const ref = column === 'treatment' ? treatmentRefs.current[nextIdx] : limitInputRefs.current[nextIdx];
        if (ref) {
          ref.focus();
          if (column === 'limit') ref.select();
        }
      }
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Click outside to save
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        handleSave();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsEditing(false);
        setDraft({});
        setEditControls?.(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing, draft, activeTab]);

  const handleSave = () => {
    const updated = { ...coverages };
    if (activeTab === 'variable') {
      updated.sublimit_coverages = { ...coverages.sublimit_coverages, ...draft };
    } else {
      updated.aggregate_coverages = { ...coverages.aggregate_coverages, ...draft };
    }
    onSave(updated);
    setIsEditing(false);
    setDraft({});
    setEditControls?.(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraft({});
    setEditControls?.(null);
  };

  // Update edit controls when editing state changes (for embedded mode)
  useEffect(() => {
    if (embedded && isEditing) {
      setEditControls?.(
        <>
          <button onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
          <button onClick={handleSave} className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">Save</button>
        </>
      );
    } else if (embedded) {
      setEditControls?.(null);
    }
    return () => embedded && setEditControls?.(null);
  }, [isEditing, embedded]);

  const getSublimitValue = (covId, defaultVal) => {
    if (isEditing && draft[covId] !== undefined) return draft[covId];
    const val = coverages.sublimit_coverages?.[covId];
    if (val !== undefined) return val;
    return defaultVal;
  };

  const getAggregateValue = (covId) => {
    if (isEditing && draft[covId] !== undefined) return draft[covId];
    const val = coverages.aggregate_coverages?.[covId];
    if (val !== undefined) return val;
    return effectiveAggregateLimit;
  };

  // Get treatment label
  const getTreatment = (covId, type) => {
    if (type === 'variable') {
      const cov = SUBLIMIT_COVERAGES.find(c => c.id === covId);
      const value = getSublimitValue(covId, cov?.default);
      if (value === 0) return 'Excluded';
      if (value === cov?.default) return 'Default';
      return 'Custom';
    } else {
      const value = getAggregateValue(covId);
      if (value === 0) return 'Excluded';
      if (value === effectiveAggregateLimit) return 'Full';
      return 'Custom';
    }
  };

  const getTreatmentStyle = (treatment) => {
    switch (treatment) {
      case 'Default':
      case 'Full':
        return 'border-green-300 bg-green-50 text-green-700';
      case 'Excluded':
        return 'border-gray-300 bg-gray-50 text-gray-500';
      default:
        return 'border-purple-300 bg-purple-50 text-purple-700';
    }
  };

  const currentCoverages = activeTab === 'variable' ? SUBLIMIT_COVERAGES : AGGREGATE_COVERAGES;

  return (
    <div ref={tableRef} className="bg-white">
      {/* Header with Batch Edit button */}
      {mode === 'quote' && showBatchEditProp && primaryQuotes.length > 1 && !embedded && (
        <div className="flex items-center justify-end py-2 border-b border-gray-100">
          <button
            className="text-xs text-purple-600 hover:text-purple-700 font-medium"
            onClick={() => setShowBatchEdit(!showBatchEdit)}
          >
            {showBatchEdit ? 'Close Batch Edit' : 'Batch Edit'}
          </button>
        </div>
      )}

      {/* Batch Edit Panel */}
      {mode === 'quote' && showBatchEdit && (
        <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-purple-800">
              Update coverages across multiple quote options
            </div>
            <div className="flex gap-2">
              <button
                className="text-xs text-purple-600 hover:text-purple-800 underline"
                onClick={() => {
                  const rows = [];
                  SUBLIMIT_COVERAGES.forEach(cov => {
                    const val = getSublimitValue(cov.id, cov.default);
                    rows.push({ id: cov.id, value: val });
                  });
                  AGGREGATE_COVERAGES.forEach(cov => {
                    const val = getAggregateValue(cov.id);
                    rows.push({ id: cov.id, value: val === effectiveAggregateLimit ? 'full' : val });
                  });
                  setBatchCoverages(rows);
                }}
              >
                Load Current Settings
              </button>
              <button
                className="text-xs text-gray-500 hover:text-gray-700 underline"
                onClick={() => setBatchCoverages([{ id: '', value: 0 }])}
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_140px_32px] gap-2 mb-1 text-xs text-gray-500 font-medium px-1">
            <div>Coverage</div>
            <div>New Value</div>
            <div></div>
          </div>

          {/* Coverage rows */}
          <div className="space-y-2 mb-4">
            {batchCoverages.map((bc, idx) => {
              const isAggregate = allCoverageOptions.find(c => c.id === bc.id)?.type === 'aggregate';
              const baseOptions = isAggregate ? aggregateOptions : sublimitOptions;
              const isBatchEditing = bc.customMode;

              const presetValues = isAggregate
                ? ['full', 1000000, 0]
                : [100000, 250000, 500000, 1000000, Math.floor(effectiveAggregateLimit / 2), effectiveAggregateLimit, 0];
              const isCustomValue = bc.value !== 'full' && typeof bc.value === 'number' && !presetValues.includes(bc.value);

              const options = [...baseOptions];
              if (isCustomValue) {
                options.splice(options.length - 1, 0, {
                  label: formatCurrency(bc.value),
                  value: bc.value
                });
              }

              return (
                <div key={idx} className="grid grid-cols-[1fr_140px_32px] gap-2 items-center">
                  <select
                    className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-purple-400"
                    value={bc.id}
                    onChange={(e) => {
                      const newBatch = [...batchCoverages];
                      const covDef = allCoverageOptions.find(c => c.id === e.target.value);
                      newBatch[idx] = {
                        id: e.target.value,
                        value: covDef?.type === 'aggregate' ? 'full' : (covDef?.default || 250000)
                      };
                      setBatchCoverages(newBatch);
                    }}
                  >
                    <option value="">Select coverage...</option>
                    <optgroup label="Variable Limits">
                      {SUBLIMIT_COVERAGES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Standard Limits">
                      {AGGREGATE_COVERAGES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </optgroup>
                  </select>
                  {isBatchEditing ? (
                    <input
                      type="text"
                      className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-purple-400"
                      placeholder="Enter amount"
                      autoFocus
                      value={bc.customInput || ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        const formatted = raw ? formatNumberWithCommas(Number(raw)) : '';
                        const newBatch = [...batchCoverages];
                        newBatch[idx] = { ...newBatch[idx], customInput: formatted };
                        setBatchCoverages(newBatch);
                      }}
                      onBlur={(e) => {
                        const parsed = parseFormattedNumber(e.target.value);
                        const newBatch = [...batchCoverages];
                        if (parsed && Number(parsed) >= 0) {
                          newBatch[idx] = { ...newBatch[idx], value: Number(parsed), customMode: false, customInput: undefined };
                        } else {
                          newBatch[idx] = { ...newBatch[idx], customMode: false, customInput: undefined };
                        }
                        setBatchCoverages(newBatch);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                        if (e.key === 'Escape') {
                          const newBatch = [...batchCoverages];
                          newBatch[idx] = { ...newBatch[idx], customMode: false, customInput: undefined };
                          setBatchCoverages(newBatch);
                        }
                      }}
                    />
                  ) : (
                    <select
                      className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-purple-400"
                      value={bc.value}
                      onChange={(e) => {
                        const newBatch = [...batchCoverages];
                        if (e.target.value === 'custom') {
                          newBatch[idx] = { ...newBatch[idx], customMode: true, customInput: '' };
                        } else {
                          const val = e.target.value === 'full' ? 'full' : Number(e.target.value);
                          newBatch[idx] = { ...newBatch[idx], value: val };
                        }
                        setBatchCoverages(newBatch);
                      }}
                    >
                      {options.map(opt => (
                        <option key={opt.label} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                  <button
                    className="text-red-500 hover:text-red-700 text-lg"
                    onClick={() => {
                      if (batchCoverages.length > 1) {
                        setBatchCoverages(batchCoverages.filter((_, i) => i !== idx));
                      } else {
                        setBatchCoverages([{ id: '', value: 0 }]);
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <button
            className="text-xs text-purple-600 hover:text-purple-800 mb-4"
            onClick={() => setBatchCoverages([...batchCoverages, { id: '', value: 0 }])}
          >
            + Add coverage
          </button>

          {/* Quote selection */}
          <div className="text-sm font-medium text-gray-700 mb-2">Apply to:</div>
          <div className="flex flex-wrap gap-3 mb-4">
            {primaryQuotes.map(q => (
              <label key={q.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedQuotes[q.id] || false}
                  onChange={(e) => setSelectedQuotes({ ...selectedQuotes, [q.id]: e.target.checked })}
                  className="rounded border-gray-300 text-purple-600"
                />
                {q.quote_name || 'Unnamed'}
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 disabled:opacity-50"
              onClick={handleBatchApply}
              disabled={batchMutation.isPending || batchCoverages.every(bc => !bc.id)}
            >
              {batchMutation.isPending ? 'Applying...' : 'Apply to Selected'}
            </button>
            <button
              className="text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-50"
              onClick={() => {
                const all = {};
                primaryQuotes.forEach(q => { all[q.id] = true; });
                setSelectedQuotes(all);
              }}
            >
              Select All
            </button>
            <button
              className="text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-50"
              onClick={() => setSelectedQuotes({})}
            >
              Select None
            </button>
          </div>
        </div>
      )}

      {/* Edit controls - shown when editing (not in embedded mode where controls are in parent) */}
      {isEditing && !embedded && (
        <div className="flex items-center justify-end gap-2 py-2 border-b border-gray-100">
          {isAggregateChanging && (
            <span className="mr-auto text-sm text-purple-600">
              Aggregate: {formatCompact(aggregateLimit)} → {formatCompact(effectiveAggregateLimit)}
            </span>
          )}
          <button
            onClick={handleCancel}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700"
          >
            Save
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-100">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'variable'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => { setActiveTab('variable'); handleCancel(); }}
        >
          Variable Limits
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'standard'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => { setActiveTab('standard'); handleCancel(); }}
        >
          Standard Limits
        </button>
      </div>

      {/* Table */}
      <div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Coverage</th>
              <th className="px-4 py-2.5 text-right font-semibold">
                {activeTab === 'variable' ? 'Default' : 'Standard'}
              </th>
              <th className="px-4 py-2.5 text-center font-semibold">Treatment</th>
              <th className="px-4 py-2.5 text-right font-semibold">Limit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {currentCoverages.map((cov, idx) => {
              const value = activeTab === 'variable'
                ? getSublimitValue(cov.id, cov.default)
                : getAggregateValue(cov.id);
              const defaultValue = activeTab === 'variable' ? cov.default : effectiveAggregateLimit;
              const treatment = getTreatment(cov.id, activeTab);
              const isExcluded = value === 0;

              return (
                <tr
                  key={cov.id}
                  className={`${isEditing ? 'bg-blue-50/30' : 'hover:bg-gray-50 cursor-pointer'}`}
                  onClick={() => {
                    if (!isEditing && !readOnly) {
                      enterEditMode(idx);
                    }
                  }}
                >
                  {/* Coverage Name */}
                  <td className={`px-4 py-3 ${isExcluded ? 'text-gray-400' : 'text-gray-900'}`}>
                    {cov.label}
                  </td>

                  {/* Default/Standard Value */}
                  <td className="px-4 py-3 text-right text-gray-500">
                    {formatCompact(defaultValue)}
                  </td>

                  {/* Treatment */}
                  <td className="px-4 py-3 text-center">
                    {isEditing && !readOnly ? (
                      <select
                        ref={(el) => { treatmentRefs.current[idx] = el; }}
                        className="text-xs border border-gray-200 rounded px-2 py-1 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 outline-none bg-white"
                        value={treatment}
                        onChange={(e) => {
                          const newTreatment = e.target.value;
                          if (newTreatment === 'Excluded') {
                            setDraft({ ...draft, [cov.id]: 0 });
                          } else if (newTreatment === 'Default' || newTreatment === 'Full') {
                            setDraft({ ...draft, [cov.id]: defaultValue });
                          }
                          // Custom keeps current value
                        }}
                        onKeyDown={(e) => handleArrowNav(e, idx, 'treatment')}
                      >
                        <option value={activeTab === 'variable' ? 'Default' : 'Full'}>
                          {activeTab === 'variable' ? 'Default' : 'Full'}
                        </option>
                        <option value="Custom">Custom</option>
                        <option value="Excluded">Excluded</option>
                      </select>
                    ) : (
                      <span className={`inline-block px-3 py-1 text-xs rounded border ${getTreatmentStyle(treatment)}`}>
                        {treatment}
                      </span>
                    )}
                  </td>

                  {/* Limit Value */}
                  <td className="px-4 py-3 text-right">
                    {isEditing && !readOnly ? (
                      <input
                        ref={(el) => { limitInputRefs.current[idx] = el; }}
                        type="text"
                        className="w-28 text-sm text-right font-medium text-green-600 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 outline-none"
                        value={formatNumberWithCommas(value)}
                        onChange={(e) => {
                          const raw = parseFormattedNumber(e.target.value);
                          setDraft({ ...draft, [cov.id]: raw ? Number(raw) : 0 });
                        }}
                        onKeyDown={(e) => handleArrowNav(e, idx, 'limit')}
                      />
                    ) : (
                      <span className={`font-medium ${isExcluded ? 'text-gray-400' : 'text-green-600'}`}>
                        {isExcluded ? 'Excluded' : formatCompact(value)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
