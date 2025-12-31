import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getQuoteOptions,
  getSubmission,
  createQuoteOption,
  updateQuoteOption,
  cloneQuoteOption,
  bindQuoteOption,
  unbindQuoteOption,
  generateQuoteDocument,
  getQuoteDocuments,
  getPackageDocuments,
  getQuoteEndorsements,
  generateQuotePackage,
  getLatestDocument,
  getSubmissionDocuments,
} from '../api/client';

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

// Get limit from tower_json (returns CMAI's participation - always the limit field)
// With new model: limit = participation, quota_share = full layer size (when QS)
function getTowerLimit(quote) {
  if (!quote.tower_json || !quote.tower_json.length) return null;
  const cmaiLayer = quote.tower_json.find(l => l.carrier === 'CMAI') || quote.tower_json[0];
  // Always return limit (the carrier's participation/written amount)
  return cmaiLayer?.limit;
}

// Calculate attachment for a specific layer index
// Handles quota share: consecutive layers with same quota_share (full layer size) are ONE layer
// All carriers in a QS group share the same attachment point
// Data model: limit = participation, quota_share = full layer size (when QS)
function calculateAttachment(layers, targetIdx) {
  if (!layers || layers.length === 0 || targetIdx <= 0) return 0;

  // If this layer is part of a QS group, find the first layer of the group
  // All layers in a QS group should have the same attachment
  let effectiveIdx = targetIdx;
  const targetLayer = layers[targetIdx];

  if (targetLayer?.quota_share) {
    const qsFullLayer = targetLayer.quota_share;
    // Walk backwards to find the start of this QS group (same quota_share value)
    while (effectiveIdx > 0 &&
           layers[effectiveIdx - 1]?.quota_share === qsFullLayer) {
      effectiveIdx--;
    }
  }

  // Now calculate attachment by summing layers below effectiveIdx
  // Treat consecutive QS groups as single layers
  let attachment = 0;
  let i = 0;

  while (i < effectiveIdx) {
    const layer = layers[i];

    if (layer.quota_share) {
      // This is a QS layer - add the full layer size (quota_share) once
      const qsFullLayer = layer.quota_share;
      attachment += qsFullLayer;
      // Skip all consecutive QS layers with the same quota_share
      while (i < effectiveIdx && layers[i]?.quota_share === qsFullLayer) {
        i++;
      }
    } else {
      // Regular layer - add its limit (which is the full amount when not QS)
      attachment += layer.limit || 0;
      i++;
    }
  }

  return attachment;
}

// Calculate QS layer fill status for a given layer
// Returns { filled, total, gap, isComplete } or null if not a QS layer
function getQsLayerStatus(layers, layerIdx) {
  const layer = layers[layerIdx];
  if (!layer?.quota_share) return null;

  const qsTotal = layer.quota_share;

  // Find all consecutive layers with the same quota_share value
  // Look backwards and forwards from this layer
  let startIdx = layerIdx;
  let endIdx = layerIdx;

  // Walk backwards
  while (startIdx > 0 && layers[startIdx - 1]?.quota_share === qsTotal) {
    startIdx--;
  }
  // Walk forwards
  while (endIdx < layers.length - 1 && layers[endIdx + 1]?.quota_share === qsTotal) {
    endIdx++;
  }

  // Sum all participations in this QS group
  let filled = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    filled += layers[i].limit || 0;
  }

  const gap = qsTotal - filled;
  const isComplete = gap <= 0;

  return { filled, total: qsTotal, gap, isComplete, startIdx, endIdx };
}

// Recalculate attachments for tower layers
// Attachment = sum of all limits below the layer
// Primary layer (index 0) has attachment = 0
function recalculateAttachments(layers) {
  if (!layers || layers.length === 0) return layers;

  return layers.map((layer, idx) => {
    const attachment = calculateAttachment(layers, idx);
    return { ...layer, attachment };
  });
}

// Coverage definitions matching Streamlit coverage_defaults.yml
const AGGREGATE_COVERAGES = [
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

const SUBLIMIT_COVERAGES = [
  { id: 'dependent_system_failure', label: 'Dependent System Failure', default: 1000000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'social_engineering', label: 'Social Engineering', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'invoice_manipulation', label: 'Invoice Manipulation', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'funds_transfer_fraud', label: 'Funds Transfer Fraud', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'telecom_fraud', label: 'Telecommunications Fraud', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'cryptojacking', label: 'Cryptojacking', default: 500000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
];

// Coverage Editor component with table layout and batch edit
function CoverageEditor({ quote, aggregateLimit, onSave, allQuotes, submissionId }) {
  const [activeTab, setActiveTab] = useState('variable');
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchCoverages, setBatchCoverages] = useState([{ id: '', value: 0 }]);
  const [selectedQuotes, setSelectedQuotes] = useState({});
  const [customMode, setCustomMode] = useState({}); // Track which coverages are in custom input mode
  const [customInputs, setCustomInputs] = useState({}); // Track custom input values
  const queryClient = useQueryClient();

  // Get coverages from quote or initialize empty
  const coverages = quote.coverages || {
    aggregate_coverages: {},
    sublimit_coverages: {},
  };

  // Sublimit options
  const sublimitOptions = [
    { label: '$100K', value: 100000 },
    { label: '$250K', value: 250000 },
    { label: '$500K', value: 500000 },
    { label: '$1M', value: 1000000 },
    { label: '50% Agg', value: Math.floor(aggregateLimit / 2) },
    { label: 'Aggregate', value: aggregateLimit },
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
    const presetValues = [100000, 250000, 500000, 1000000, Math.floor(aggregateLimit / 2), aggregateLimit, 0];
    return value !== undefined && !presetValues.includes(value);
  };

  const isCustomAggregateValue = (value) => {
    return value !== undefined && value !== 0 && value !== 1000000 && value !== aggregateLimit;
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
    // Resolve 'full' to actual limit
    const actualValue = value === 'full' ? aggregateLimit : value;
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

  // Map value to dropdown option
  const getAggregateDropdownValue = (covId) => {
    const val = getAggregateValue(covId);
    if (val === aggregateLimit) return 'full';
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

        // Build updated coverages
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

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h4 className="form-section-title mb-0">Coverage Schedule</h4>
        {primaryQuotes.length > 1 && (
          <button
            className="btn btn-secondary text-sm"
            onClick={() => setShowBatchEdit(!showBatchEdit)}
          >
            {showBatchEdit ? 'Close Batch Edit' : 'Batch Edit'}
          </button>
        )}
      </div>

      {/* Batch Edit Panel */}
      {showBatchEdit && (
        <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-purple-800">
              Update coverages across multiple quote options
            </div>
            <div className="flex gap-2">
              <button
                className="text-sm text-purple-600 hover:text-purple-800 underline"
                onClick={() => {
                  // Load ALL coverages using the same logic as the display
                  const rows = [];
                  // Add all sublimit coverages (use getSublimitValue for defaults)
                  SUBLIMIT_COVERAGES.forEach(cov => {
                    const val = getSublimitValue(cov.id, cov.default);
                    rows.push({ id: cov.id, value: val });
                  });
                  // Add all aggregate coverages (use getAggregateDropdownValue for defaults)
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

              // Check if current value is custom (not in preset options)
              const presetValues = isAggregate
                ? ['full', 1000000, 0]
                : [100000, 250000, 500000, 1000000, Math.floor(aggregateLimit / 2), aggregateLimit, 0];
              const isCustomValue = bc.value !== 'full' && typeof bc.value === 'number' && !presetValues.includes(bc.value);

              // Build options including custom value if present
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
              const isEditing = customMode[cov.id];
              const isCustomValue = isCustomSublimitValue(value);

              // Build options including custom value if present
              const options = [...sublimitOptions];
              if (isCustomValue) {
                // Insert custom value option before "Custom..."
                options.splice(options.length - 1, 0, {
                  label: formatCurrency(value),
                  value: value
                });
              }

              return (
                <tr key={cov.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4 text-gray-700">{cov.label}</td>
                  <td className="py-2 w-40">
                    {isEditing ? (
                      <input
                        type="text"
                        className="form-input text-sm py-1 w-full"
                        placeholder="Enter amount"
                        autoFocus
                        value={customInputs[cov.id] ?? ''}
                        onChange={(e) => {
                          // Format with commas as user types
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
              const isEditing = customMode[`agg_${cov.id}`];
              const isCustomValue = isCustomAggregateValue(actualValue);
              const dropdownValue = getAggregateDropdownValue(cov.id);

              // Build options including custom value if present
              const options = [...aggregateOptions];
              if (isCustomValue) {
                // Insert custom value option before "Custom..."
                options.splice(options.length - 1, 0, {
                  label: formatCurrency(actualValue),
                  value: actualValue
                });
              }

              return (
                <tr key={cov.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4 text-gray-700">{cov.label}</td>
                  <td className="py-2 w-40">
                    {isEditing ? (
                      <input
                        type="text"
                        className="form-input text-sm py-1 w-full"
                        placeholder="Enter amount"
                        autoFocus
                        value={customInputs[`agg_${cov.id}`] ?? ''}
                        onChange={(e) => {
                          // Format with commas as user types
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

// Compact quote option tab
function QuoteOptionTab({ quote, isSelected, onSelect }) {
  const premium = quote.sold_premium || quote.risk_adjusted_premium;
  const isBound = quote.is_bound;
  const isExcess = quote.position === 'excess';

  return (
    <button
      onClick={onSelect}
      className={`px-4 py-2 rounded-lg border-2 text-left transition-all ${
        isSelected
          ? isBound
            ? 'border-green-500 bg-green-50'
            : 'border-purple-500 bg-purple-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2">
        {isBound && <span className="text-green-600">✓</span>}
        <span className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
          {quote.quote_name || 'Option'}
        </span>
        {isExcess && (
          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">XS</span>
        )}
      </div>
      <div className="text-sm text-gray-500 mt-0.5">
        {premium ? formatCurrency(premium) : '—'}
      </div>
    </button>
  );
}

// Create Quote Modal
function CreateQuoteModal({ isOpen, onClose, onSubmit, isPending }) {
  const [quoteName, setQuoteName] = useState('');
  const [retention, setRetention] = useState(25000);
  const [limit, setLimit] = useState(1000000);
  const [attachment, setAttachment] = useState(1000000);
  const [position, setPosition] = useState('primary');
  const [policyForm, setPolicyForm] = useState('claims_made');
  const [underlyingCarrier, setUnderlyingCarrier] = useState('Primary Carrier');

  if (!isOpen) return null;

  // Auto-generate quote name based on parameters
  const generateName = () => {
    const limitStr = limit >= 1000000 ? `$${limit / 1000000}M` : `$${limit / 1000}K`;
    const retentionStr = retention >= 1000000 ? `$${retention / 1000000}M` : `$${retention / 1000}K`;
    if (position === 'excess') {
      const attachStr = attachment >= 1000000 ? `$${attachment / 1000000}M` : `$${attachment / 1000}K`;
      return `${limitStr} xs ${attachStr} x ${retentionStr}`;
    }
    return `${limitStr} x ${retentionStr}`;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalName = quoteName.trim() || generateName();

    if (position === 'excess') {
      // Excess quote: CMAI sits above the attachment point
      onSubmit({
        quote_name: finalName,
        primary_retention: retention,
        policy_form: policyForm,
        position: 'excess',
        underlying_carrier: underlyingCarrier,
        tower_json: [
          { carrier: 'CMAI', limit, attachment, premium: null }
        ],
      });
    } else {
      // Primary quote: CMAI at ground level
      onSubmit({
        quote_name: finalName,
        primary_retention: retention,
        policy_form: policyForm,
        position: 'primary',
        tower_json: [
          { carrier: 'CMAI', limit, attachment: 0, premium: null }
        ],
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Quote Option</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Position Toggle */}
          <div>
            <label className="form-label">Position</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                  position === 'primary'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
                onClick={() => setPosition('primary')}
              >
                Primary
              </button>
              <button
                type="button"
                className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                  position === 'excess'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
                onClick={() => setPosition('excess')}
              >
                Excess
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Our Limit</label>
              <select
                className="form-select"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                <option value={1000000}>$1M</option>
                <option value={2000000}>$2M</option>
                <option value={3000000}>$3M</option>
                <option value={5000000}>$5M</option>
                <option value={10000000}>$10M</option>
              </select>
            </div>
            <div>
              <label className="form-label">Retention</label>
              <select
                className="form-select"
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
              >
                <option value={25000}>$25K</option>
                <option value={50000}>$50K</option>
                <option value={100000}>$100K</option>
                <option value={150000}>$150K</option>
                <option value={250000}>$250K</option>
              </select>
            </div>
          </div>

          {/* Excess-specific fields */}
          {position === 'excess' && (
            <>
              <div>
                <label className="form-label">Attachment Point (xs)</label>
                <select
                  className="form-select"
                  value={attachment}
                  onChange={(e) => setAttachment(Number(e.target.value))}
                >
                  <option value={1000000}>$1M</option>
                  <option value={2000000}>$2M</option>
                  <option value={3000000}>$3M</option>
                  <option value={5000000}>$5M</option>
                  <option value={10000000}>$10M</option>
                  <option value={15000000}>$15M</option>
                  <option value={25000000}>$25M</option>
                </select>
              </div>
              <div>
                <label className="form-label">Underlying Carrier</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Primary Carrier, AIG, Chubb"
                  value={underlyingCarrier}
                  onChange={(e) => setUnderlyingCarrier(e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <label className="form-label">Policy Form</label>
            <select
              className="form-select"
              value={policyForm}
              onChange={(e) => setPolicyForm(e.target.value)}
            >
              <option value="claims_made">Claims Made</option>
              <option value="occurrence">Occurrence</option>
            </select>
          </div>

          <div>
            <label className="form-label">Quote Name (optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder={generateName()}
              value={quoteName}
              onChange={(e) => setQuoteName(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">Leave blank to auto-generate</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              className="btn btn-outline flex-1"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={isPending}
            >
              {isPending ? 'Creating...' : 'Create Quote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

// Document type label
function getDocTypeLabel(type) {
  const labels = {
    quote_primary: 'Quote (Primary)',
    quote_excess: 'Quote (Excess)',
  };
  return labels[type] || type;
}

// Quote detail panel
function QuoteDetailPanel({ quote, submission, onRefresh, allQuotes }) {
  const queryClient = useQueryClient();
  const [editedRetention, setEditedRetention] = useState(quote.primary_retention);
  const [editedSoldPremium, setEditedSoldPremium] = useState(quote.sold_premium || '');
  const [packageType, setPackageType] = useState('quote_only');
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [showPackageOptions, setShowPackageOptions] = useState(false);
  const [includeEndorsements, setIncludeEndorsements] = useState(true);
  const [includeSpecimen, setIncludeSpecimen] = useState(true);
  const [editingTower, setEditingTower] = useState(false);
  const [towerLayers, setTowerLayers] = useState(quote.tower_json || []);
  // QS column shown if any layer has quota_share set
  const hasAnyQs = (quote.tower_json || []).some(l => l.quota_share);
  const [showQsColumn, setShowQsColumn] = useState(hasAnyQs);

  // Reset tower layers when quote changes
  useEffect(() => {
    setTowerLayers(quote.tower_json || []);
    setEditingTower(false);
    // Auto-show QS column if any layer has quota share
    setShowQsColumn((quote.tower_json || []).some(l => l.quota_share));
  }, [quote.id]);

  const limit = getTowerLimit(quote);
  const position = quote.position || 'primary';

  // Query for quote documents
  const { data: quoteDocuments } = useQuery({
    queryKey: ['quoteDocuments', quote.id],
    queryFn: () => getQuoteDocuments(quote.id).then(res => res.data),
  });

  // Query for available package documents
  const { data: packageDocsData } = useQuery({
    queryKey: ['packageDocuments', position],
    queryFn: () => getPackageDocuments(position).then(res => res.data),
    enabled: showPackageOptions,
  });

  // Query for quote's endorsements
  const { data: quoteEndorsementsData } = useQuery({
    queryKey: ['quoteEndorsements', quote.id],
    queryFn: () => getQuoteEndorsements(quote.id).then(res => res.data),
    enabled: showPackageOptions,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateQuoteOption(quote.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
    },
  });

  // Bind mutation
  const bindMutation = useMutation({
    mutationFn: () => bindQuoteOption(quote.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['policy', submission.id] });
    },
  });

  // Unbind mutation
  const unbindMutation = useMutation({
    mutationFn: () => unbindQuoteOption(quote.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['policy', submission.id] });
    },
  });

  // Clone mutation
  const cloneMutation = useMutation({
    mutationFn: () => cloneQuoteOption(quote.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
    },
  });

  // Generate quote document/package mutation
  const generateDocMutation = useMutation({
    mutationFn: () => {
      if (packageType === 'full_package') {
        // Combine endorsement IDs (if checkbox checked) with selected additional documents
        const endorsementIds = includeEndorsements ? (quoteEndorsementsData?.matched_library_ids || []) : [];
        const allDocuments = [...endorsementIds, ...selectedDocuments];

        return generateQuotePackage(quote.id, {
          package_type: 'full_package',
          selected_documents: allDocuments,
          include_specimen: includeSpecimen,
        });
      }
      return generateQuoteDocument(quote.id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['quoteDocuments', quote.id] });
      queryClient.invalidateQueries({ queryKey: ['latestDocument', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['submissionDocuments', submission.id] });
      // Open the PDF in a new tab if available
      if (data.data?.pdf_url) {
        window.open(data.data.pdf_url, '_blank');
      }
    },
  });

  // Toggle document selection
  const toggleDocument = (docId) => {
    setSelectedDocuments(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  // Get document type labels
  const docTypeLabels = packageDocsData?.document_types || {
    claims_sheet: 'Claims Sheets',
    marketing: 'Marketing Materials',
  };

  // Count endorsements from the quote (not library matches)
  const quoteEndorsementCount = quoteEndorsementsData?.endorsements?.length || 0;

  // Count total docs that will be included
  const endorsementDocsCount = includeEndorsements ? quoteEndorsementCount : 0;
  const specimenCount = includeSpecimen ? 1 : 0;
  const totalDocsInPackage = endorsementDocsCount + selectedDocuments.length + specimenCount;

  const handleSaveConfig = () => {
    const updates = {};
    if (editedRetention !== quote.primary_retention) {
      updates.primary_retention = editedRetention;
    }
    if (editedSoldPremium && editedSoldPremium !== quote.sold_premium) {
      updates.sold_premium = Number(editedSoldPremium);
    }
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const hasChanges =
    editedRetention !== quote.primary_retention ||
    (editedSoldPremium && Number(editedSoldPremium) !== quote.sold_premium);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-900">{quote.quote_name}</h3>
        <div className="flex gap-2">
          {quote.is_bound ? (
            <span className="badge badge-bound">BOUND</span>
          ) : (
            <span className="badge badge-quoted">QUOTED</span>
          )}
        </div>
      </div>

      {/* Premium Summary - Only for Primary quotes */}
      {position === 'primary' && (
        <div className="card">
          <h4 className="form-section-title">Premium Summary</h4>
          <div className="grid grid-cols-3 gap-6">
            <div className="metric-card">
              <div className="metric-label">Technical Premium</div>
              <div className="metric-value">{formatCurrency(quote.technical_premium)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Risk-Adjusted Premium</div>
              <div className="metric-value text-blue-600">{formatCurrency(quote.risk_adjusted_premium)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Sold Premium</div>
              <input
                type="text"
                inputMode="numeric"
                className="form-input text-green-600 font-semibold text-lg"
                value={formatNumberWithCommas(editedSoldPremium)}
                onChange={(e) => setEditedSoldPremium(parseFormattedNumber(e.target.value))}
                placeholder="Enter sold premium"
              />
            </div>
          </div>
        </div>
      )}

      {/* Policy Configuration - Only for Primary quotes */}
      {position === 'primary' && (
        <div className="card">
          <h4 className="form-section-title">Policy Configuration</h4>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="form-label">Policy Limit</label>
              <input
                type="text"
                className="form-input bg-gray-50"
                value={formatCompact(limit)}
                readOnly
              />
            </div>
            <div>
              <label className="form-label">Retention/Deductible</label>
              <select
                className="form-select"
                value={editedRetention}
                onChange={(e) => setEditedRetention(Number(e.target.value))}
              >
                <option value={25000}>$25K</option>
                <option value={50000}>$50K</option>
                <option value={100000}>$100K</option>
                <option value={150000}>$150K</option>
                <option value={250000}>$250K</option>
              </select>
            </div>
          </div>
          {hasChanges && (
            <div className="mt-4 flex items-center gap-3">
              <button
                className="btn btn-primary"
                onClick={handleSaveConfig}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
              {updateMutation.isSuccess && (
                <span className="text-sm text-green-600">Saved!</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tower Structure - Only for Excess quotes */}
      {position !== 'primary' && (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h4 className="form-section-title mb-0">Tower Structure</h4>
          {!editingTower ? (
            <button
              className="text-sm text-purple-600 hover:text-purple-800"
              onClick={() => setEditingTower(true)}
            >
              Edit Tower
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setTowerLayers(quote.tower_json || []);
                  setEditingTower(false);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  // Recalculate attachments before saving
                  const recalculated = recalculateAttachments(towerLayers);
                  updateMutation.mutate({ tower_json: recalculated });
                  setEditingTower(false);
                }}
              >
                Save Tower
              </button>
            </div>
          )}
        </div>

        {editingTower ? (
          <div className="space-y-3">
            {/* QS Toggle + Column Headers */}
            <div className="flex items-center gap-4 px-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showQsColumn}
                  onChange={(e) => {
                    setShowQsColumn(e.target.checked);
                    // Clear quota_share from all layers when hiding column
                    if (!e.target.checked) {
                      setTowerLayers(towerLayers.map(l => {
                        const { quota_share, ...rest } = l;
                        return rest;
                      }));
                    }
                  }}
                  className="rounded border-gray-300 text-purple-600 w-3 h-3"
                />
                Quota Share
              </label>
            </div>
            <div className={`grid ${showQsColumn ? 'grid-cols-8' : 'grid-cols-7'} gap-3 px-4 text-xs text-gray-500 font-medium`}>
              <div>Carrier</div>
              <div>Limit</div>
              {showQsColumn && <div>Part of</div>}
              <div>Ret/Attach</div>
              <div>Premium</div>
              <div>RPM</div>
              <div>ILF</div>
              <div></div>
            </div>

            {/* Show layers from top to bottom (reversed for visual stacking) */}
            {[...towerLayers].reverse().map((layer, displayIdx) => {
              const actualIdx = towerLayers.length - 1 - displayIdx;
              const isCMAI = layer.carrier === 'CMAI';
              const isPrimary = actualIdx === 0; // First layer in array is primary (ground level)

              // Calculate attachment for this layer (handles quota share correctly)
              const calculatedAttachment = calculateAttachment(towerLayers, actualIdx);

              // Calculate QS layer fill status (if this is a QS layer)
              const qsStatus = getQsLayerStatus(towerLayers, actualIdx);

              // Calculate RPM (use limit which is the carrier's participation)
              const rpm = layer.premium && layer.limit
                ? layer.premium / (layer.limit / 1000000)
                : null;

              // Calculate ILF (relative to layer below, primary = 1.00)
              let ilf = null;
              if (isPrimary && rpm) {
                ilf = 1.00;
              } else if (rpm && actualIdx > 0) {
                const belowLayer = towerLayers[actualIdx - 1];
                if (belowLayer?.premium && belowLayer?.limit) {
                  const belowRpm = belowLayer.premium / (belowLayer.limit / 1000000);
                  if (belowRpm > 0) {
                    ilf = rpm / belowRpm;
                  }
                }
              }

              return (
                <div
                  key={actualIdx}
                  className={`p-3 rounded-lg border-2 ${
                    isCMAI ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className={`grid ${showQsColumn ? 'grid-cols-8' : 'grid-cols-7'} gap-3 items-center`}>
                    {/* Carrier */}
                    <div>
                      {isCMAI ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-purple-700">CMAI</span>
                          <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded">Ours</span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="form-input text-sm py-1"
                          value={layer.carrier || ''}
                          placeholder="Carrier name"
                          onChange={(e) => {
                            const newLayers = [...towerLayers];
                            newLayers[actualIdx] = { ...newLayers[actualIdx], carrier: e.target.value };
                            setTowerLayers(newLayers);
                          }}
                        />
                      )}
                    </div>

                    {/* Limit (carrier's participation) */}
                    <div>
                      <select
                        className="form-select text-sm py-1"
                        value={layer.limit || 1000000}
                        onChange={(e) => {
                          const newLayers = [...towerLayers];
                          newLayers[actualIdx] = { ...newLayers[actualIdx], limit: Number(e.target.value) };
                          setTowerLayers(newLayers);
                        }}
                      >
                        <option value={1000000}>$1M</option>
                        <option value={2000000}>$2M</option>
                        <option value={2500000}>$2.5M</option>
                        <option value={3000000}>$3M</option>
                        <option value={5000000}>$5M</option>
                        <option value={7500000}>$7.5M</option>
                        <option value={10000000}>$10M</option>
                        <option value={15000000}>$15M</option>
                        <option value={25000000}>$25M</option>
                      </select>
                    </div>

                    {/* Part of (full layer size) - only when QS column shown */}
                    {showQsColumn && (
                      <div className="flex items-center gap-1">
                        <select
                          className={`form-select text-sm py-1 flex-1 ${qsStatus && !qsStatus.isComplete ? 'border-orange-400 bg-orange-50' : ''}`}
                          value={layer.quota_share || ''}
                          title={qsStatus ? `${formatCompact(qsStatus.filled)} of ${formatCompact(qsStatus.total)} filled${!qsStatus.isComplete ? ` (${formatCompact(qsStatus.gap)} gap)` : ''}` : ''}
                          onChange={(e) => {
                            const newLayers = [...towerLayers];
                            const val = e.target.value ? Number(e.target.value) : null;
                            if (val) {
                              newLayers[actualIdx] = { ...newLayers[actualIdx], quota_share: val };
                            } else {
                              const { quota_share, ...rest } = newLayers[actualIdx];
                              newLayers[actualIdx] = rest;
                            }
                            setTowerLayers(newLayers);
                          }}
                        >
                          <option value="">—</option>
                          <option value={5000000}>$5M</option>
                          <option value={10000000}>$10M</option>
                          <option value={15000000}>$15M</option>
                          <option value={25000000}>$25M</option>
                        </select>
                        {/* Small indicator for incomplete QS */}
                        {qsStatus && !qsStatus.isComplete && (
                          <span className="text-orange-500 text-xs font-medium" title={`${formatCompact(qsStatus.gap)} remaining`}>
                            !
                          </span>
                        )}
                      </div>
                    )}

                    {/* Retention (primary) or Attachment (excess) */}
                    <div>
                      {isPrimary && !isCMAI ? (
                        // Primary layer shows retention dropdown
                        <select
                          className="form-select text-sm py-1"
                          value={layer.retention || quote.primary_retention || 25000}
                          onChange={(e) => {
                            const newLayers = [...towerLayers];
                            newLayers[actualIdx] = { ...newLayers[actualIdx], retention: Number(e.target.value) };
                            setTowerLayers(newLayers);
                          }}
                        >
                          <option value={10000}>$10K ret</option>
                          <option value={25000}>$25K ret</option>
                          <option value={50000}>$50K ret</option>
                          <option value={100000}>$100K ret</option>
                          <option value={250000}>$250K ret</option>
                        </select>
                      ) : (
                        // Excess layers show auto-calculated attachment (read-only)
                        <span className="text-sm font-medium text-gray-700">
                          xs {formatCompact(calculatedAttachment)}
                        </span>
                      )}
                    </div>

                    {/* Premium */}
                    <div>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-input text-sm py-1"
                        value={layer.premium ? formatNumberWithCommas(layer.premium) : ''}
                        placeholder="$"
                        onChange={(e) => {
                          const newLayers = [...towerLayers];
                          const parsed = parseFormattedNumber(e.target.value);
                          newLayers[actualIdx] = {
                            ...newLayers[actualIdx],
                            premium: parsed ? Number(parsed) : null
                          };
                          setTowerLayers(newLayers);
                        }}
                      />
                    </div>

                    {/* RPM (calculated) */}
                    <div className="text-sm text-gray-600">
                      {rpm ? (rpm >= 1000 ? `$${(rpm / 1000).toFixed(1)}K` : `$${Math.round(rpm)}`) : '—'}
                    </div>

                    {/* ILF (calculated) */}
                    <div className="text-sm text-gray-600">
                      {ilf !== null ? ilf.toFixed(2) : '—'}
                    </div>

                    {/* Actions */}
                    <div className="text-right">
                      {!isCMAI && (
                        <button
                          className="text-red-500 hover:text-red-700 text-sm"
                          onClick={() => {
                            setTowerLayers(towerLayers.filter((_, i) => i !== actualIdx));
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add Layer Button */}
            <button
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600"
              onClick={() => {
                // Find CMAI layer index (new layer goes just below CMAI)
                const cmaiIdx = towerLayers.findIndex(l => l.carrier === 'CMAI');

                // Search for any incomplete QS layer in the stack (excluding CMAI)
                // Start from the top (just below CMAI) and work down
                let inheritedQs = null;
                const searchStart = cmaiIdx > 0 ? cmaiIdx - 1 : towerLayers.length - 1;
                for (let i = searchStart; i >= 0; i--) {
                  const layer = towerLayers[i];
                  if (layer?.quota_share) {
                    const qsStatus = getQsLayerStatus(towerLayers, i);
                    if (qsStatus && !qsStatus.isComplete) {
                      inheritedQs = layer.quota_share;
                      break; // Found the topmost incomplete QS
                    }
                  }
                }

                const newLayer = {
                  carrier: '',
                  limit: 5000000,
                  attachment: 0,
                  premium: null,
                  ...(inheritedQs && { quota_share: inheritedQs }),
                };

                // Insert before CMAI (so CMAI stays at top)
                if (cmaiIdx > 0) {
                  const newLayers = [...towerLayers];
                  newLayers.splice(cmaiIdx, 0, newLayer);
                  setTowerLayers(newLayers);
                } else {
                  // If no CMAI or CMAI is first, add at beginning
                  setTowerLayers([newLayer, ...towerLayers]);
                }
              }}
            >
              + Add Underlying Layer
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {towerLayers.length > 0 ? (
              <>
                {/* Column Headers for read-only view */}
                <div className="grid grid-cols-[2fr_1fr_auto_1fr_1fr_1fr_1fr] gap-x-3 px-3 text-xs text-gray-400 font-medium">
                  <div>Carrier</div>
                  <div>Limit</div>
                  <div></div>
                  <div>Attach</div>
                  <div>Premium</div>
                  <div>RPM</div>
                  <div>ILF</div>
                </div>
                {[...towerLayers].reverse().map((layer, displayIdx) => {
                  const actualIdx = towerLayers.length - 1 - displayIdx;
                  const isCMAI = layer.carrier === 'CMAI';
                  const isPrimary = actualIdx === 0;

                  // Calculate attachment (handles quota share correctly)
                  const calculatedAttachment = calculateAttachment(towerLayers, actualIdx);

                  // Calculate RPM (use limit which is the carrier's participation)
                  const rpm = layer.premium && layer.limit
                    ? layer.premium / (layer.limit / 1000000)
                    : null;

                  // Calculate ILF (relative to layer below, primary = 1.00)
                  let ilf = null;
                  if (isPrimary && rpm) {
                    ilf = 1.00;
                  } else if (rpm && actualIdx > 0) {
                    const belowLayer = towerLayers[actualIdx - 1];
                    if (belowLayer?.premium && belowLayer?.limit) {
                      const belowRpm = belowLayer.premium / (belowLayer.limit / 1000000);
                      if (belowRpm > 0) {
                        ilf = rpm / belowRpm;
                      }
                    }
                  }

                  return (
                    <div
                      key={displayIdx}
                      className={`p-3 rounded-lg border-2 ${
                        isCMAI ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="grid grid-cols-[2fr_1fr_auto_1fr_1fr_1fr_1fr] gap-x-3 items-center text-sm">
                        {/* Carrier */}
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${isCMAI ? 'text-purple-700' : 'text-gray-700'}`}>
                            {layer.carrier || 'Unnamed'}
                          </span>
                          {isCMAI && (
                            <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded">
                              Ours
                            </span>
                          )}
                        </div>
                        {/* Limit - show participation, and "po X" if quota share */}
                        <div className="text-gray-600">
                          {formatCompact(layer.limit)}
                          {layer.quota_share && (
                            <span className="text-gray-400 text-xs ml-1">po {formatCompact(layer.quota_share)}</span>
                          )}
                        </div>
                        {/* xs/ret label */}
                        <div className="text-gray-400 text-xs w-6">
                          {isPrimary && !isCMAI ? '' : 'xs'}
                        </div>
                        {/* Attachment/Retention value */}
                        <div className="text-gray-600">
                          {isPrimary && !isCMAI
                            ? `${formatCompact(layer.retention || quote.primary_retention)} ret`
                            : formatCompact(calculatedAttachment)
                          }
                        </div>
                        {/* Premium */}
                        <div className="text-green-600 font-medium">
                          {layer.premium ? formatCurrency(layer.premium) : '—'}
                        </div>
                        {/* RPM */}
                        <div className="text-gray-500">
                          {rpm ? (rpm >= 1000 ? `$${(rpm / 1000).toFixed(1)}K` : `$${Math.round(rpm)}`) : '—'}
                        </div>
                        {/* ILF */}
                        <div className="text-gray-500">
                          {ilf !== null ? ilf.toFixed(2) : '—'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <p className="text-gray-500 text-sm">No tower layers configured</p>
            )}
          </div>
        )}
      </div>
      )}

      {/* Coverage Schedule - Only for Primary quotes */}
      {position === 'primary' && (
        <CoverageEditor
          quote={quote}
          aggregateLimit={limit || 1000000}
          onSave={(updatedCoverages) => {
            updateMutation.mutate({ coverages: updatedCoverages });
          }}
          allQuotes={allQuotes}
          submissionId={submission.id}
        />
      )}

      {/* Document Generation */}
      <div className="card">
        <h4 className="form-section-title">Generate Document</h4>

        {/* Package Type Selection */}
        <div className="mb-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="packageType"
                value="quote_only"
                checked={packageType === 'quote_only'}
                onChange={() => {
                  setPackageType('quote_only');
                  setSelectedDocuments([]);
                }}
                className="w-4 h-4 min-w-[16px] text-purple-600"
              />
              <span className="text-sm font-medium text-gray-700">Quote Only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="packageType"
                value="full_package"
                checked={packageType === 'full_package'}
                onChange={() => {
                  setPackageType('full_package');
                  setShowPackageOptions(true);
                }}
                className="w-4 h-4 min-w-[16px] text-purple-600"
              />
              <span className="text-sm font-medium text-gray-700">Full Package</span>
            </label>
          </div>
        </div>

        {/* Package Options (shown when Full Package selected) */}
        {packageType === 'full_package' && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="space-y-3">
              {/* Quote Specimens Section */}
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase mb-1">
                  Quote Specimens
                </div>
                <div className="space-y-1">
                  {/* Endorsement Package */}
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={includeEndorsements}
                      onChange={(e) => setIncludeEndorsements(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <span className="text-sm text-gray-700">
                      Endorsement Package
                      {quoteEndorsementCount > 0 && (
                        <span className="ml-1 text-gray-500">
                          ({quoteEndorsementCount} endorsement{quoteEndorsementCount !== 1 ? 's' : ''})
                        </span>
                      )}
                    </span>
                  </label>

                  {/* Policy Specimen */}
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={includeSpecimen}
                      onChange={(e) => setIncludeSpecimen(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Policy Specimen</span>
                  </label>
                </div>
              </div>

              {/* Claims Sheets, Marketing, etc. from library */}
              {packageDocsData?.documents && Object.entries(packageDocsData.documents).map(([dtype, docs]) => (
                <div key={dtype}>
                  <div className="text-xs font-medium text-gray-500 uppercase mb-1">
                    {docTypeLabels[dtype] || dtype}
                  </div>
                  <div className="space-y-1">
                    {docs.map((doc) => (
                      <label
                        key={doc.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocuments.includes(doc.id)}
                          onChange={() => toggleDocument(doc.id)}
                          className="w-4 h-4 text-purple-600 rounded"
                        />
                        <span className="text-sm text-gray-700">
                          <span className="font-mono text-xs text-gray-500">{doc.code}</span>
                          {' '}{doc.title}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-600">
                Package will include: Quote
                {endorsementDocsCount > 0 && ` + ${endorsementDocsCount} endorsement${endorsementDocsCount !== 1 ? 's' : ''}`}
                {includeSpecimen && ' + Specimen'}
                {selectedDocuments.length > 0 && ` + ${selectedDocuments.length} other`}
              </p>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex gap-3 flex-wrap">
          <button
            className="btn btn-primary"
            onClick={() => generateDocMutation.mutate()}
            disabled={generateDocMutation.isPending}
          >
            {generateDocMutation.isPending
              ? 'Generating...'
              : packageType === 'full_package'
                ? `Generate Package${totalDocsInPackage > 0 ? ` (${totalDocsInPackage} docs)` : ''}`
                : 'Generate Quote'}
          </button>
        </div>

        {generateDocMutation.isSuccess && (
          <p className="text-sm text-green-600 mt-2">
            {packageType === 'full_package' ? 'Package' : 'Quote'} generated!
          </p>
        )}
        {generateDocMutation.isError && (
          <p className="text-sm text-red-600 mt-2">
            Error: {generateDocMutation.error?.response?.data?.detail || 'Failed to generate document'}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="card">
        <h4 className="form-section-title">Quote Actions</h4>
        <div className="flex gap-3 flex-wrap">
          {quote.is_bound ? (
            <button
              className="btn bg-red-100 text-red-700 hover:bg-red-200"
              onClick={() => unbindMutation.mutate()}
              disabled={unbindMutation.isPending}
            >
              {unbindMutation.isPending ? 'Unbinding...' : 'Unbind Quote'}
            </button>
          ) : (
            <button
              className="btn bg-green-600 text-white hover:bg-green-700"
              onClick={() => bindMutation.mutate()}
              disabled={bindMutation.isPending}
            >
              {bindMutation.isPending ? 'Binding...' : 'Bind Quote'}
            </button>
          )}
          <button
            className="btn btn-outline"
            onClick={() => cloneMutation.mutate()}
            disabled={cloneMutation.isPending}
          >
            {cloneMutation.isPending ? 'Cloning...' : 'Clone Option'}
          </button>
        </div>
        {bindMutation.isSuccess && (
          <p className="text-sm text-green-600 mt-2">Quote bound successfully!</p>
        )}
        {unbindMutation.isSuccess && (
          <p className="text-sm text-yellow-600 mt-2">Quote unbound.</p>
        )}
        {cloneMutation.isSuccess && (
          <p className="text-sm text-blue-600 mt-2">Quote cloned!</p>
        )}
      </div>
    </div>
  );
}

export default function QuotePage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: submission } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes', submissionId],
    queryFn: () => getQuoteOptions(submissionId).then(res => res.data),
  });

  // Query for latest document across all options
  const { data: latestDoc } = useQuery({
    queryKey: ['latestDocument', submissionId],
    queryFn: () => getLatestDocument(submissionId).then(res => res.data),
  });

  // Query for all submission documents
  const { data: allDocs } = useQuery({
    queryKey: ['submissionDocuments', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(res => res.data),
  });

  // Create quote mutation
  const createMutation = useMutation({
    mutationFn: (data) => createQuoteOption(submissionId, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      setShowCreateModal(false);
      // Select the newly created quote
      if (response.data?.id) {
        setSelectedQuoteId(response.data.id);
      }
    },
  });

  // Auto-select first quote if none selected
  const selectedQuote = quotes?.find(q => q.id === selectedQuoteId) || quotes?.[0];

  if (isLoading) {
    return <div className="text-gray-500">Loading quotes...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Quote Options</h2>
          {submission && (
            <p className="text-sm text-gray-500 mt-1">{submission.applicant_name}</p>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + New Option
        </button>
      </div>

      {/* Latest Generated Quote Banner */}
      {latestDoc && (
        <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-purple-600 uppercase">Latest Quote</span>
            <span className="font-semibold text-gray-900">{latestDoc.quote_name || 'Quote'}</span>
            <span className="text-sm text-gray-500">{formatDate(latestDoc.created_at)}</span>
            {latestDoc.document_number && (
              <span className="text-xs font-mono text-gray-400">{latestDoc.document_number}</span>
            )}
          </div>
          {latestDoc.pdf_url && (
            <a
              href={latestDoc.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:text-purple-800 font-medium text-sm"
            >
              View PDF →
            </a>
          )}
        </div>
      )}

      {quotes?.length > 0 ? (
        <div className="space-y-6">
          {/* Quote Options Tabs - Horizontal */}
          <div className="flex flex-wrap gap-2">
            {quotes.map((quote) => (
              <QuoteOptionTab
                key={quote.id}
                quote={quote}
                isSelected={selectedQuote?.id === quote.id}
                onSelect={() => setSelectedQuoteId(quote.id)}
              />
            ))}
          </div>

          {/* Selected Quote Details */}
          {selectedQuote && (
            <QuoteDetailPanel
              key={selectedQuote.id}
              quote={selectedQuote}
              submission={submission}
              allQuotes={quotes}
            />
          )}

          {/* All Generated Documents */}
          {allDocs && allDocs.length > 0 && (
            <div className="card">
              <h4 className="form-section-title">All Generated Documents</h4>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-header">Quote Option</th>
                      <th className="table-header">Position</th>
                      <th className="table-header">Document #</th>
                      <th className="table-header">Generated</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="table-cell">
                          <span className="font-medium text-gray-900">
                            {doc.quote_name || 'Unnamed Option'}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            doc.position === 'excess'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {doc.position === 'excess' ? 'Excess' : 'Primary'}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className="text-xs font-mono text-gray-500">{doc.document_number}</span>
                        </td>
                        <td className="table-cell text-gray-600 text-sm">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="table-cell text-right">
                          {doc.pdf_url && (
                            <a
                              href={doc.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-600 hover:text-purple-800 font-medium text-sm"
                            >
                              View PDF
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No quote options yet</p>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            Create First Option
          </button>
        </div>
      )}

      {/* Create Quote Modal */}
      <CreateQuoteModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}
