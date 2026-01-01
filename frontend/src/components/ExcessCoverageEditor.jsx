import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

// Format compact currency (e.g., $5M, $25K)
function formatCompact(value) {
  if (!value && value !== 0) return '—';
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

// Build tower context for proportional calculations
function buildTowerContext(towerJson) {
  if (!towerJson || !towerJson.length) {
    return {
      tower_layers: [],
      cmai_layer_idx: null,
      our_aggregate_limit: 0,
      our_aggregate_attachment: 0,
      layers_below_count: 0,
      primary_aggregate_limit: 0,
    };
  }

  let cmaiIdx = null;
  for (let i = 0; i < towerJson.length; i++) {
    if (towerJson[i].carrier?.toUpperCase().includes('CMAI')) {
      cmaiIdx = i;
      break;
    }
  }

  const primaryAggLimit = towerJson[0]?.limit || 0;
  const ourAggLimit = cmaiIdx !== null ? (towerJson[cmaiIdx]?.limit || 0) : primaryAggLimit;
  const layersBelowCount = cmaiIdx !== null ? cmaiIdx : towerJson.length;
  const ourAggAttachment = towerJson
    .slice(0, layersBelowCount)
    .reduce((sum, l) => sum + (l.limit || 0), 0);

  return {
    tower_layers: towerJson,
    cmai_layer_idx: cmaiIdx,
    our_aggregate_limit: ourAggLimit,
    our_aggregate_attachment: ourAggAttachment,
    layers_below_count: layersBelowCount,
    primary_aggregate_limit: primaryAggLimit,
  };
}

// Calculate proportional sublimit and attachment
function calcProportional(primarySublimit, ctx) {
  const { primary_aggregate_limit, our_aggregate_limit, tower_layers, layers_below_count } = ctx;

  if (!primary_aggregate_limit || !primarySublimit) {
    return { limit: primarySublimit || 0, attachment: 0 };
  }

  const ratio = primarySublimit / primary_aggregate_limit;
  const ourLimit = Math.round(ratio * our_aggregate_limit);

  let ourAttachment = 0;
  for (const layer of (tower_layers || []).slice(0, layers_below_count)) {
    ourAttachment += Math.round((layer.limit || 0) * ratio);
  }

  return { limit: ourLimit, attachment: ourAttachment };
}

// Limit dropdown options
const LIMIT_OPTIONS = [
  { label: '$100K', value: 100_000 },
  { label: '$250K', value: 250_000 },
  { label: '$500K', value: 500_000 },
  { label: '$1M', value: 1_000_000 },
  { label: '$2M', value: 2_000_000 },
  { label: '$3M', value: 3_000_000 },
  { label: '$5M', value: 5_000_000 },
];

const ATTACHMENT_OPTIONS = [
  { label: '$0', value: 0 },
  ...LIMIT_OPTIONS,
];

const TREATMENT_OPTIONS = [
  { label: 'Follow Form', value: 'follow_form' },
  { label: 'Different', value: 'different' },
  { label: 'No Coverage', value: 'no_coverage' },
];

/**
 * ExcessCoverageEditor - Coverage schedule editor for excess quotes
 */
export default function ExcessCoverageEditor({
  sublimits: propSublimits,
  towerJson,
  onSave,
  readOnly = false,
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState(null);
  const fileInputRef = useRef(null);

  const sublimits = propSublimits || [];
  const ctx = buildTowerContext(towerJson);

  // Document extraction mutation
  const extractMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_URL}/api/extract-coverages`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Extraction failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setExtractedPreview(data);
    },
  });

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      extractMutation.mutate(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Apply extracted coverages
  const handleApplyExtracted = () => {
    if (!extractedPreview?.sublimits) return;

    const newSublimits = extractedPreview.sublimits.map(sub => ({
      coverage: sub.coverage,
      primary_limit: sub.primary_limit,
      treatment: 'follow_form',
      our_limit: null,
      our_attachment: null,
      coverage_normalized: sub.coverage_normalized,
    }));

    onSave(newSublimits);
    setExtractedPreview(null);
  };

  // Add new coverage row
  const handleAddCoverage = () => {
    const updated = [
      ...sublimits,
      {
        coverage: '',
        primary_limit: 1_000_000,
        treatment: 'follow_form',
        our_limit: null,
        our_attachment: null,
      },
    ];
    onSave(updated);
  };

  // Delete coverage row
  const handleDeleteCoverage = (idx) => {
    const updated = sublimits.filter((_, i) => i !== idx);
    onSave(updated);
  };

  // Update a coverage field
  const handleUpdateCoverage = (idx, field, value) => {
    const updated = sublimits.map((cov, i) => {
      if (i !== idx) return cov;

      const newCov = { ...cov, [field]: value };

      if (field === 'treatment' && value !== 'different') {
        newCov.our_limit = null;
        newCov.our_attachment = null;
      }

      return newCov;
    });
    onSave(updated);
  };

  // Get effective values (stored or proportional)
  const getEffectiveValues = (cov) => {
    if (cov.treatment === 'no_coverage') {
      return { limit: null, attachment: null };
    }

    const prop = calcProportional(cov.primary_limit, ctx);

    return {
      limit: cov.our_limit ?? prop.limit,
      attachment: cov.our_attachment ?? prop.attachment,
    };
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h4 className="form-section-title mb-0">Coverage Schedule (Excess)</h4>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                className="btn btn-secondary text-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={extractMutation.isPending}
              >
                {extractMutation.isPending ? 'Scanning...' : 'Scan Document'}
              </button>
              <button
                className="btn btn-secondary text-sm"
                onClick={handleAddCoverage}
              >
                + Add
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tower context info */}
      {ctx.cmai_layer_idx !== null && (
        <div className="text-xs text-gray-500 mb-3">
          CMAI: {formatCompact(ctx.our_aggregate_limit)} xs {formatCompact(ctx.our_aggregate_attachment)} ·
          Primary agg: {formatCompact(ctx.primary_aggregate_limit)}
        </div>
      )}

      {/* Extraction error */}
      {extractMutation.isError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {extractMutation.error?.message || 'Failed to extract coverages'}
        </div>
      )}

      {/* Extraction preview */}
      {extractedPreview && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium text-green-800">
              Extracted {extractedPreview.sublimits?.length || 0} coverages
              {extractedPreview.carrier_name && ` from ${extractedPreview.carrier_name}`}
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-primary text-sm"
                onClick={handleApplyExtracted}
              >
                Apply
              </button>
              <button
                className="btn btn-secondary text-sm"
                onClick={() => setExtractedPreview(null)}
              >
                Cancel
              </button>
            </div>
          </div>
          <div className="text-sm text-green-700 space-y-1 max-h-48 overflow-y-auto">
            {extractedPreview.sublimits?.map((sub, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{sub.coverage}</span>
                <span className="font-medium">{formatCompact(sub.primary_limit)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sublimits.length === 0 && !extractedPreview ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-gray-500 mb-3">No coverages defined yet.</p>
          <p className="text-sm text-gray-400 mb-4">
            Upload a primary carrier quote/binder to auto-extract coverages, or add manually.
          </p>
          {!readOnly && (
            <div className="flex gap-2 justify-center">
              <button
                className="btn btn-primary text-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={extractMutation.isPending}
              >
                Scan Document
              </button>
              <button
                className="btn btn-secondary text-sm"
                onClick={handleAddCoverage}
              >
                Add Manually
              </button>
            </div>
          )}
        </div>
      ) : sublimits.length > 0 && (
        <>
          {/* Details toggle */}
          <div className="mb-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showDetails}
                onChange={(e) => setShowDetails(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show treatment & override columns
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Coverage</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600 w-24">Primary</th>
                  {showDetails && (
                    <>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 w-28">Treatment</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 w-24">Our Limit</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-600 w-24">Our Attach</th>
                    </>
                  )}
                  <th className="text-left py-2 px-2 font-medium text-gray-600 w-28">Ours</th>
                  {!readOnly && <th className="w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {sublimits.map((cov, idx) => {
                  const effective = getEffectiveValues(cov);
                  const isNoCoverage = cov.treatment === 'no_coverage';
                  const prop = calcProportional(cov.primary_limit, ctx);

                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      {/* Coverage Name */}
                      <td className="py-2 px-2">
                        {readOnly ? (
                          <span className="text-gray-900">{cov.coverage || 'Unnamed'}</span>
                        ) : (
                          <input
                            type="text"
                            className="form-input text-sm py-1 w-full"
                            placeholder="Coverage name"
                            value={cov.coverage || ''}
                            onChange={(e) => handleUpdateCoverage(idx, 'coverage', e.target.value)}
                          />
                        )}
                      </td>

                      {/* Primary Limit */}
                      <td className="py-2 px-2">
                        {readOnly ? (
                          <span className="text-gray-600">{formatCompact(cov.primary_limit)}</span>
                        ) : (
                          <select
                            className="form-select text-sm py-1 w-full"
                            value={cov.primary_limit}
                            onChange={(e) => handleUpdateCoverage(idx, 'primary_limit', Number(e.target.value))}
                          >
                            {LIMIT_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* Details columns (hidden by default) */}
                      {showDetails && (
                        <>
                          {/* Treatment */}
                          <td className="py-2 px-2">
                            {readOnly ? (
                              <span className="text-gray-600">
                                {TREATMENT_OPTIONS.find(o => o.value === cov.treatment)?.label}
                              </span>
                            ) : (
                              <select
                                className="form-select text-sm py-1 w-full"
                                value={cov.treatment || 'follow_form'}
                                onChange={(e) => handleUpdateCoverage(idx, 'treatment', e.target.value)}
                              >
                                {TREATMENT_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* Our Limit */}
                          <td className="py-2 px-2">
                            {isNoCoverage ? (
                              <span className="text-gray-400">—</span>
                            ) : readOnly ? (
                              <span className="text-gray-600">{formatCompact(effective.limit)}</span>
                            ) : (
                              <select
                                className="form-select text-sm py-1 w-full"
                                value={cov.our_limit ?? 'prop'}
                                onChange={(e) => {
                                  const val = e.target.value === 'prop' ? null : Number(e.target.value);
                                  handleUpdateCoverage(idx, 'our_limit', val);
                                  if (val !== null && cov.treatment === 'follow_form') {
                                    handleUpdateCoverage(idx, 'treatment', 'different');
                                  }
                                }}
                              >
                                <option value="prop">Prop ({formatCompact(prop.limit)})</option>
                                {LIMIT_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* Our Attachment */}
                          <td className="py-2 px-2">
                            {isNoCoverage ? (
                              <span className="text-gray-400">—</span>
                            ) : readOnly ? (
                              <span className="text-gray-600">{formatCompact(effective.attachment)}</span>
                            ) : (
                              <select
                                className="form-select text-sm py-1 w-full"
                                value={cov.our_attachment ?? 'prop'}
                                onChange={(e) => {
                                  const val = e.target.value === 'prop' ? null : Number(e.target.value);
                                  handleUpdateCoverage(idx, 'our_attachment', val);
                                  if (val !== null && cov.treatment === 'follow_form') {
                                    handleUpdateCoverage(idx, 'treatment', 'different');
                                  }
                                }}
                              >
                                <option value="prop">Prop ({formatCompact(prop.attachment)})</option>
                                {ATTACHMENT_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        </>
                      )}

                      {/* Summary */}
                      <td className="py-2 px-2">
                        {isNoCoverage ? (
                          <span className="text-gray-400 text-xs">No Coverage</span>
                        ) : (
                          <span className="font-medium text-gray-900">
                            {formatCompact(effective.limit)} xs {formatCompact(effective.attachment)}
                          </span>
                        )}
                      </td>

                      {/* Delete */}
                      {!readOnly && (
                        <td className="py-2 px-2">
                          <button
                            className="text-red-500 hover:text-red-700 text-lg"
                            onClick={() => handleDeleteCoverage(idx)}
                            title="Remove coverage"
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
