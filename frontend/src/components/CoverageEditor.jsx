import { useState, useEffect } from 'react';
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
  if (!value) return '—';
  if (value >= 1_000_000) return `$${value / 1_000_000}M`;
  if (value >= 1_000) return `$${value / 1_000}K`;
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
 *
 * Props:
 * - coverages: Current coverage values { aggregate_coverages: {}, sublimit_coverages: {} }
 * - aggregateLimit: Current aggregate limit
 * - onSave: Callback when coverages change (receives updated coverages object)
 * - mode: 'quote' (default) or 'endorsement'
 * - newAggregateLimit: For endorsement mode, the new aggregate limit (if changing)
 * - showBatchEdit: Whether to show batch edit panel (default true for quote mode)
 * - allQuotes: All quote options (for batch edit)
 * - submissionId: Submission ID (for batch edit)
 * - readOnly: If true, display only without editing
 * - originalCoverages: For endorsement mode, the original coverages to compare against
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
  quote, // Legacy prop - extract coverages from quote if not provided directly
  originalCoverages: propOriginalCoverages, // Original coverages for endorsement diff
}) {
  const [activeTab, setActiveTab] = useState('variable');
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchCoverages, setBatchCoverages] = useState([{ id: '', value: 0 }]);
  const [selectedQuotes, setSelectedQuotes] = useState({});
  const [customMode, setCustomMode] = useState({});
  const [customInputs, setCustomInputs] = useState({});
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

  // Sublimit options - use effective aggregate for percentage-based options
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

  // Aggregate options
  const aggregateOptions = [
    { label: 'Full Limits', value: 'full' },
    { label: '$1M', value: 1000000 },
    { label: 'No Coverage', value: 0 },
    { label: 'Custom...', value: 'custom' },
  ];

  // Check if a value matches any preset option
  const isCustomSublimitValue = (value) => {
    const presetValues = [100000, 250000, 500000, 1000000, Math.floor(effectiveAggregateLimit / 2), effectiveAggregateLimit, 0];
    return value !== undefined && !presetValues.includes(value);
  };

  const isCustomAggregateValue = (value) => {
    return value !== undefined && value !== 0 && value !== 1000000 && value !== effectiveAggregateLimit;
  };

  const handleSublimitChange = (covId, value) => {
    const updated = {
      ...coverages,
      sublimit_coverages: {
        ...coverages.sublimit_coverages,
        [covId]: value,
      },
    };
    onSave(updated);
  };

  const handleAggregateChange = (covId, value) => {
    // Resolve 'full' to actual limit (use effective for endorsements)
    const actualValue = value === 'full' ? effectiveAggregateLimit : value;
    const updated = {
      ...coverages,
      aggregate_coverages: {
        ...coverages.aggregate_coverages,
        [covId]: actualValue,
      },
    };
    onSave(updated);
  };

  const getSublimitValue = (covId, defaultVal) => {
    const val = coverages.sublimit_coverages?.[covId];
    if (val !== undefined) return val;
    return defaultVal;
  };

  const getAggregateValue = (covId, policyForm = 'cyber') => {
    const val = coverages.aggregate_coverages?.[covId];
    if (val !== undefined) return val;
    const def = AGGREGATE_COVERAGES.find(c => c.id === covId);
    if (def && def[policyForm] === 'aggregate') return aggregateLimit;
    return 0;
  };

  // Get the NEW aggregate value (for endorsement display)
  const getNewAggregateValue = (covId, policyForm = 'cyber') => {
    const currentVal = getAggregateValue(covId, policyForm);
    // If current value equals old aggregate, it follows full limits
    if (currentVal === aggregateLimit && isAggregateChanging) {
      return effectiveAggregateLimit;
    }
    return currentVal;
  };

  // Map value to dropdown option
  const getAggregateDropdownValue = (covId) => {
    const val = getAggregateValue(covId);
    if (val === effectiveAggregateLimit) return 'full';
    if (val === 1000000) return 1000000;
    return 0;
  };

  // All coverage options for batch edit dropdown
  const allCoverageOptions = [
    ...SUBLIMIT_COVERAGES.map(c => ({ ...c, type: 'sublimit' })),
    ...AGGREGATE_COVERAGES.map(c => ({ ...c, type: 'aggregate' })),
  ];

  // Primary quotes for batch selection
  const primaryQuotes = (allQuotes || []).filter(q => q.position !== 'excess');

  // Initialize selected quotes when batch edit opens
  useEffect(() => {
    if (showBatchEdit && primaryQuotes.length > 0) {
      const initial = {};
      primaryQuotes.forEach(q => { initial[q.id] = true; });
      setSelectedQuotes(initial);
    }
  }, [showBatchEdit]);

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

  // For endorsement mode, check if a coverage has changed (manual or automatic)
  const willCoverageChange = (covId, type = 'aggregate') => {
    if (mode !== 'endorsement') return false;

    if (type === 'aggregate') {
      const currentVal = getAggregateValue(covId);
      const originalVal = originalCoverages.aggregate_coverages?.[covId];

      // Check for manual change (current value differs from original)
      if (originalVal !== undefined && currentVal !== originalVal) {
        return true;
      }

      // Check for automatic change due to aggregate limit change
      if (isAggregateChanging && currentVal === aggregateLimit) {
        return true;
      }
    } else if (type === 'sublimit') {
      const cov = SUBLIMIT_COVERAGES.find(c => c.id === covId);
      const currentVal = getSublimitValue(covId, cov?.default);
      const originalVal = originalCoverages.sublimit_coverages?.[covId];

      // If original exists and differs, it's a change
      if (originalVal !== undefined && currentVal !== originalVal) {
        return true;
      }
    }

    return false;
  };

  // Get the original value for display
  const getOriginalAggregateValue = (covId) => {
    const val = originalCoverages.aggregate_coverages?.[covId];
    if (val !== undefined) return val;
    // Default to aggregate limit if not set
    const def = AGGREGATE_COVERAGES.find(c => c.id === covId);
    if (def && def['cyber'] === 'aggregate') return aggregateLimit;
    return 0;
  };

  const getOriginalSublimitValue = (covId, defaultVal) => {
    const val = originalCoverages.sublimit_coverages?.[covId];
    if (val !== undefined) return val;
    return defaultVal;
  };

  return (
    <div className={mode === 'endorsement' ? '' : 'card'}>
      <div className="flex items-center justify-between mb-4">
        <h4 className={`${mode === 'endorsement' ? 'font-medium text-gray-900' : 'form-section-title'} mb-0`}>
          Coverage Schedule
          {isAggregateChanging && (
            <span className="ml-2 text-sm font-normal text-purple-600">
              (Aggregate: {formatCompact(aggregateLimit)} → {formatCompact(effectiveAggregateLimit)})
            </span>
          )}
        </h4>
        {mode === 'quote' && showBatchEditProp && primaryQuotes.length > 1 && (
          <button
            className="btn btn-secondary text-sm"
            onClick={() => setShowBatchEdit(!showBatchEdit)}
          >
            {showBatchEdit ? 'Close Batch Edit' : 'Batch Edit'}
          </button>
        )}
      </div>

      {/* Batch Edit Panel - Only in quote mode */}
      {mode === 'quote' && showBatchEdit && (
        <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-purple-800">
              Update coverages across multiple quote options
            </div>
            <div className="flex gap-2">
              <button
                className="text-sm text-purple-600 hover:text-purple-800 underline"
                onClick={() => {
                  const rows = [];
                  SUBLIMIT_COVERAGES.forEach(cov => {
                    const val = getSublimitValue(cov.id, cov.default);
                    rows.push({ id: cov.id, value: val });
                  });
                  AGGREGATE_COVERAGES.forEach(cov => {
                    const val = getAggregateDropdownValue(cov.id);
                    rows.push({ id: cov.id, value: val });
                  });
                  setBatchCoverages(rows);
                }}
              >
                Load Current Settings
              </button>
              <button
                className="text-sm text-gray-500 hover:text-gray-700 underline"
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
                    className="form-select text-sm"
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
                      className="form-input text-sm"
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
                        if (parsed !== null && parsed >= 0) {
                          newBatch[idx] = { ...newBatch[idx], value: parsed, customMode: false, customInput: undefined };
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
                      className="form-select text-sm"
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
            className="text-sm text-purple-600 hover:text-purple-800 mb-4"
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
              className="btn btn-primary text-sm"
              onClick={handleBatchApply}
              disabled={batchMutation.isPending || batchCoverages.every(bc => !bc.id)}
            >
              {batchMutation.isPending ? 'Applying...' : 'Apply to Selected'}
            </button>
            <button
              className="btn btn-secondary text-sm"
              onClick={() => {
                const all = {};
                primaryQuotes.forEach(q => { all[q.id] = true; });
                setSelectedQuotes(all);
              }}
            >
              Select All
            </button>
            <button
              className="btn btn-secondary text-sm"
              onClick={() => setSelectedQuotes({})}
            >
              Select None
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'variable'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('variable')}
        >
          Variable Limits
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'standard'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('standard')}
        >
          Standard Limits
        </button>
      </div>

      {/* Variable Limits - Table layout */}
      {activeTab === 'variable' && (
        <table className="w-full text-sm">
          <tbody>
            {SUBLIMIT_COVERAGES.map(cov => {
              const value = getSublimitValue(cov.id, cov.default);
              const originalValue = getOriginalSublimitValue(cov.id, cov.default);
              const isChanging = willCoverageChange(cov.id, 'sublimit');
              const isEditing = customMode[cov.id];
              const isCustomValue = isCustomSublimitValue(value);

              const options = [...sublimitOptions];
              if (isCustomValue) {
                options.splice(options.length - 1, 0, {
                  label: formatCurrency(value),
                  value: value
                });
              }

              return (
                <tr key={cov.id} className={`border-b border-gray-100 ${isChanging ? 'bg-purple-50' : ''}`}>
                  <td className="py-2 pr-4 text-gray-700">
                    {cov.label}
                    {isChanging && (
                      <span className="ml-2 text-xs text-purple-600">
                        ({formatCompact(originalValue)} → {formatCompact(value)})
                      </span>
                    )}
                  </td>
                  <td className="py-2 w-40">
                    {readOnly ? (
                      <span className="text-gray-900">{formatCompact(value)}</span>
                    ) : isEditing ? (
                      <input
                        type="text"
                        className="form-input text-sm py-1 w-full"
                        placeholder="Enter amount"
                        autoFocus
                        value={customInputs[cov.id] ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          const formatted = raw ? formatNumberWithCommas(Number(raw)) : '';
                          setCustomInputs({ ...customInputs, [cov.id]: formatted });
                        }}
                        onBlur={(e) => {
                          const parsed = parseFormattedNumber(e.target.value);
                          if (parsed !== null && parsed >= 0) {
                            handleSublimitChange(cov.id, parsed);
                          }
                          setCustomMode({ ...customMode, [cov.id]: false });
                          setCustomInputs({ ...customInputs, [cov.id]: undefined });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.target.blur();
                          if (e.key === 'Escape') {
                            setCustomMode({ ...customMode, [cov.id]: false });
                            setCustomInputs({ ...customInputs, [cov.id]: undefined });
                          }
                        }}
                      />
                    ) : (
                      <select
                        className="form-select text-sm py-1 w-full"
                        value={value}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setCustomMode({ ...customMode, [cov.id]: true });
                          } else {
                            handleSublimitChange(cov.id, Number(e.target.value));
                          }
                        }}
                      >
                        {options.map(opt => (
                          <option key={opt.label} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Standard Limits - Table layout */}
      {activeTab === 'standard' && (
        <table className="w-full text-sm">
          <tbody>
            {AGGREGATE_COVERAGES.map(cov => {
              const actualValue = getAggregateValue(cov.id);
              const originalValue = getOriginalAggregateValue(cov.id);
              const newValue = getNewAggregateValue(cov.id);
              const isChanging = willCoverageChange(cov.id, 'aggregate');
              const isEditing = customMode[`agg_${cov.id}`];
              const isCustomValue = isCustomAggregateValue(actualValue);
              const dropdownValue = getAggregateDropdownValue(cov.id);

              // Determine what values to show in the change indicator
              // For automatic changes: original → new (effective aggregate)
              // For manual changes: original → current
              const displayOldValue = originalValue;
              const displayNewValue = isAggregateChanging && actualValue === aggregateLimit
                ? effectiveAggregateLimit  // Automatic change to new aggregate
                : actualValue;  // Manual change

              const options = [...aggregateOptions];
              if (isCustomValue) {
                options.splice(options.length - 1, 0, {
                  label: formatCurrency(actualValue),
                  value: actualValue
                });
              }

              return (
                <tr key={cov.id} className={`border-b border-gray-100 ${isChanging ? 'bg-purple-50' : ''}`}>
                  <td className="py-2 pr-4 text-gray-700">
                    {cov.label}
                    {isChanging && (
                      <span className="ml-2 text-xs text-purple-600">
                        ({formatCompact(displayOldValue)} → {formatCompact(displayNewValue)})
                      </span>
                    )}
                  </td>
                  <td className="py-2 w-40">
                    {readOnly ? (
                      <span className="text-gray-900">
                        {actualValue === aggregateLimit ? 'Full Limits' : formatCompact(actualValue)}
                      </span>
                    ) : isEditing ? (
                      <input
                        type="text"
                        className="form-input text-sm py-1 w-full"
                        placeholder="Enter amount"
                        autoFocus
                        value={customInputs[`agg_${cov.id}`] ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          const formatted = raw ? formatNumberWithCommas(Number(raw)) : '';
                          setCustomInputs({ ...customInputs, [`agg_${cov.id}`]: formatted });
                        }}
                        onBlur={(e) => {
                          const parsed = parseFormattedNumber(e.target.value);
                          if (parsed !== null && parsed >= 0) {
                            handleAggregateChange(cov.id, parsed);
                          }
                          setCustomMode({ ...customMode, [`agg_${cov.id}`]: false });
                          setCustomInputs({ ...customInputs, [`agg_${cov.id}`]: undefined });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.target.blur();
                          if (e.key === 'Escape') {
                            setCustomMode({ ...customMode, [`agg_${cov.id}`]: false });
                            setCustomInputs({ ...customInputs, [`agg_${cov.id}`]: undefined });
                          }
                        }}
                      />
                    ) : (
                      <select
                        className="form-select text-sm py-1 w-full"
                        value={isCustomValue ? actualValue : dropdownValue}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setCustomMode({ ...customMode, [`agg_${cov.id}`]: true });
                          } else {
                            const val = e.target.value === 'full' ? 'full' : Number(e.target.value);
                            handleAggregateChange(cov.id, val);
                          }
                        }}
                      >
                        {options.map(opt => (
                          <option key={opt.label} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
