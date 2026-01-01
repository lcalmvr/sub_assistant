import { useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

// Fetch standard coverage tags
async function fetchStandardTags() {
  const res = await fetch(`${API_URL}/api/coverage-catalog/standard-tags`);
  if (!res.ok) throw new Error('Failed to fetch tags');
  return res.json();
}

// Submit coverage mappings to catalog
async function submitToCatalog(carrierName, coverages) {
  const res = await fetch(`${API_URL}/api/coverage-catalog/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carrier_name: carrierName,
      coverages: coverages.map(c => ({
        coverage: c.coverage,
        coverage_normalized: c.coverage_normalized || [],
      })),
    }),
  });
  return res.json();
}

// Look up coverage mapping from catalog
async function lookupCoverage(carrierName, coverageOriginal) {
  const params = new URLSearchParams({ carrier_name: carrierName, coverage_original: coverageOriginal });
  const res = await fetch(`${API_URL}/api/coverage-catalog/lookup?${params}`);
  if (!res.ok) return null;
  return res.json();
}

// Format compact currency
function formatCompact(value) {
  if (!value && value !== 0) return '—';
  if (value >= 1_000_000) return `$${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

// Build tower context for proportional calculations (handles quota share)
function buildTowerContext(towerJson) {
  if (!towerJson || !towerJson.length) {
    return { our_aggregate_limit: 0, our_aggregate_attachment: 0, primary_aggregate_limit: 0, layers_below_count: 0, tower_layers: [], cmai_qs: null };
  }

  let cmaiIdx = null;
  let cmaiLayer = null;
  for (let i = 0; i < towerJson.length; i++) {
    if (towerJson[i].carrier?.toUpperCase().includes('CMAI')) {
      cmaiIdx = i;
      cmaiLayer = towerJson[i];
      break;
    }
  }

  // Primary aggregate limit: use quota_share if QS layer, else limit
  const primaryLayer = towerJson[0];
  const primaryAggLimit = primaryLayer?.quota_share || primaryLayer?.limit || 0;

  // Our aggregate limit: CMAI's participation
  const ourAggLimit = cmaiLayer?.limit || primaryAggLimit;

  // Check if CMAI is in a quota share layer
  const cmaiQs = cmaiLayer?.quota_share || null;

  // Calculate effective layers below count (for QS, find start of QS group)
  let layersBelowCount = cmaiIdx !== null ? cmaiIdx : towerJson.length;
  if (cmaiQs && cmaiIdx !== null) {
    let effectiveIdx = cmaiIdx;
    while (effectiveIdx > 0 && towerJson[effectiveIdx - 1]?.quota_share === cmaiQs) {
      effectiveIdx--;
    }
    layersBelowCount = effectiveIdx;
  }

  // Calculate our aggregate attachment (handles QS layers)
  let ourAggAttachment = 0;
  let i = 0;
  while (i < layersBelowCount) {
    const layer = towerJson[i];
    const layerQs = layer.quota_share;
    if (layerQs) {
      // QS layer - add full layer size once, skip others in same QS
      ourAggAttachment += layerQs;
      while (i < layersBelowCount && towerJson[i]?.quota_share === layerQs) {
        i++;
      }
    } else {
      ourAggAttachment += layer.limit || 0;
      i++;
    }
  }

  return {
    tower_layers: towerJson,
    our_aggregate_limit: ourAggLimit,
    our_aggregate_attachment: ourAggAttachment,
    layers_below_count: layersBelowCount,
    primary_aggregate_limit: primaryAggLimit,
    cmai_qs: cmaiQs,
  };
}

// Calculate proportional sublimit (handles quota share)
function calcProportional(primarySublimit, ctx) {
  const { primary_aggregate_limit, our_aggregate_limit, tower_layers, layers_below_count } = ctx;
  if (!primary_aggregate_limit || !primarySublimit) return { limit: primarySublimit || 0, attachment: 0 };

  const ratio = primarySublimit / primary_aggregate_limit;
  const ourLimit = Math.round(ratio * our_aggregate_limit);

  // Calculate attachment - handle QS layers properly
  let ourAttachment = 0;
  let i = 0;
  while (i < layers_below_count) {
    const layer = tower_layers[i];
    const layerQs = layer?.quota_share;
    if (layerQs) {
      // QS layer - add full layer size once, skip others in same QS
      ourAttachment += Math.round(layerQs * ratio);
      while (i < layers_below_count && tower_layers[i]?.quota_share === layerQs) {
        i++;
      }
    } else {
      ourAttachment += Math.round((layer?.limit || 0) * ratio);
      i++;
    }
  }

  return { limit: ourLimit, attachment: ourAttachment };
}

const LIMIT_OPTIONS = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000];

export default function ExcessCoverageEditor({ sublimits: propSublimits, towerJson, onSave, readOnly = false }) {
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [extractedPreview, setExtractedPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const sublimits = propSublimits || [];
  const ctx = buildTowerContext(towerJson);

  // Fetch standard tags for mapping
  const { data: tagsData } = useQuery({
    queryKey: ['standard-coverage-tags'],
    queryFn: fetchStandardTags,
    staleTime: Infinity,
  });
  const standardTags = tagsData?.tags || [];

  // Document extraction
  const extractMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_URL}/api/extract-coverages`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error((await response.json()).detail || 'Extraction failed');
      return response.json();
    },
    onSuccess: (data) => setExtractedPreview(data),
  });

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) extractMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e) => { e.preventDefault(); if (!readOnly) setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && ['pdf', 'docx', 'doc'].includes(file.name.split('.').pop()?.toLowerCase())) {
      extractMutation.mutate(file);
    }
  };

  const handleApplyExtracted = async () => {
    if (!extractedPreview?.sublimits) return;
    const carrierName = extractedPreview.carrier_name || 'Unknown';

    // Look up existing mappings from catalog
    const newSublimits = await Promise.all(
      extractedPreview.sublimits.map(async (sub) => {
        let coverageNormalized = [];
        try {
          const mapping = await lookupCoverage(carrierName, sub.coverage);
          if (mapping?.coverage_normalized) {
            coverageNormalized = Array.isArray(mapping.coverage_normalized)
              ? mapping.coverage_normalized
              : [];
          }
        } catch (e) {
          console.warn('Catalog lookup failed for:', sub.coverage);
        }
        return {
          coverage: sub.coverage,
          primary_limit: sub.primary_limit,
          treatment: 'follow_form',
          our_limit: null,
          our_attachment: null,
          coverage_normalized: coverageNormalized,
        };
      })
    );
    onSave(newSublimits);
    setExtractedPreview(null);
  };

  const handleAddCoverage = () => {
    onSave([...sublimits, { coverage: '', primary_limit: 1_000_000, treatment: 'follow_form', our_limit: null, our_attachment: null, coverage_normalized: [] }]);
  };

  const handleDeleteCoverage = (idx) => {
    onSave(sublimits.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  };

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

  // Bulk actions
  const handleSetAllTreatment = (treatment) => {
    const updated = sublimits.map(cov => ({
      ...cov,
      treatment,
      our_limit: treatment === 'different' ? cov.our_limit : null,
      our_attachment: treatment === 'different' ? cov.our_attachment : null,
    }));
    onSave(updated);
  };

  const getEffectiveValues = (cov) => {
    if (cov.treatment === 'no_coverage') return { limit: null, attachment: null };
    const prop = calcProportional(cov.primary_limit, ctx);
    return { limit: cov.our_limit ?? prop.limit, attachment: cov.our_attachment ?? prop.attachment };
  };

  const isException = (cov) => cov.treatment !== 'follow_form';
  const exceptionCount = sublimits.filter(isException).length;

  return (
    <div
      className={`card relative ${isDragging ? 'ring-2 ring-purple-400 ring-offset-2' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 bg-purple-50 bg-opacity-90 flex items-center justify-center z-10 rounded-lg">
          <div className="text-purple-600 font-medium">Drop PDF or DOCX to scan</div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="form-section-title mb-0">Coverage Schedule</h4>
          {ctx.primary_aggregate_limit > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              Primary: {formatCompact(ctx.primary_aggregate_limit)} · Ours: {formatCompact(ctx.our_aggregate_limit)}
              {ctx.cmai_qs && <span className="text-purple-600"> po {formatCompact(ctx.cmai_qs)}</span>}
              {' '}xs {formatCompact(ctx.our_aggregate_attachment)}
            </div>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc" onChange={handleFileSelect} className="hidden" />
            <button className="btn btn-secondary text-sm" onClick={() => fileInputRef.current?.click()} disabled={extractMutation.isPending}>
              {extractMutation.isPending ? 'Scanning...' : 'Scan Doc'}
            </button>
            <button className="btn btn-secondary text-sm" onClick={handleAddCoverage}>+ Add</button>
          </div>
        )}
      </div>

      {/* Error */}
      {extractMutation.isError && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {extractMutation.error?.message}
        </div>
      )}

      {/* Extraction preview */}
      {extractedPreview && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-green-800">
              Found {extractedPreview.sublimits?.length || 0} coverages
              {extractedPreview.carrier_name && ` from ${extractedPreview.carrier_name}`}
            </span>
            <div className="flex gap-2">
              <button className="btn btn-primary text-sm" onClick={handleApplyExtracted}>Apply</button>
              <button className="btn btn-secondary text-sm" onClick={() => setExtractedPreview(null)}>Cancel</button>
            </div>
          </div>
          <div className="text-sm text-green-700 max-h-32 overflow-y-auto space-y-0.5">
            {extractedPreview.sublimits?.map((sub, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="truncate mr-2">{sub.coverage}</span>
                <span className="font-medium whitespace-nowrap">{formatCompact(sub.primary_limit)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {sublimits.length === 0 && !extractedPreview ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-gray-500 mb-2">No coverages defined</p>
          <p className="text-sm text-gray-400 mb-4">Drop a primary quote PDF to extract coverages</p>
          {!readOnly && (
            <div className="flex gap-2 justify-center">
              <button className="btn btn-primary text-sm" onClick={() => fileInputRef.current?.click()}>Scan Document</button>
              <button className="btn btn-secondary text-sm" onClick={handleAddCoverage}>Add Manually</button>
            </div>
          )}
        </div>
      ) : sublimits.length > 0 && (
        <>
          {/* Bulk actions */}
          {!readOnly && sublimits.length > 1 && (
            <div className="flex items-center gap-3 mb-3 text-sm">
              <span className="text-gray-500">Set all:</span>
              <button
                className="text-purple-600 hover:text-purple-800 hover:underline"
                onClick={() => handleSetAllTreatment('follow_form')}
              >
                Follow Form
              </button>
              <span className="text-gray-300">|</span>
              <button
                className="text-gray-600 hover:text-gray-800 hover:underline"
                onClick={() => handleSetAllTreatment('no_coverage')}
              >
                No Coverage
              </button>
              {exceptionCount > 0 && (
                <span className="ml-auto text-xs text-amber-600">
                  {exceptionCount} exception{exceptionCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          {/* Coverage list */}
          <div className="space-y-1">
            {sublimits.map((cov, idx) => {
              const effective = getEffectiveValues(cov);
              const isNoCoverage = cov.treatment === 'no_coverage';
              const isExpanded = expandedIdx === idx;
              const hasException = isException(cov);
              const prop = calcProportional(cov.primary_limit, ctx);

              return (
                <div
                  key={idx}
                  className={`border rounded-lg transition-colors ${
                    hasException ? 'border-amber-200 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Collapsed row */}
                  <div
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  >
                    <span className="text-gray-400 text-xs w-4">{isExpanded ? '▼' : '▶'}</span>
                    <div className={`flex-1 min-w-0 ${isNoCoverage ? 'text-gray-400' : ''}`}>
                      <span className={`truncate block ${isNoCoverage ? 'line-through' : 'text-gray-900'}`}>
                        {cov.coverage || 'Unnamed coverage'}
                      </span>
                      {cov.coverage_normalized?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {cov.coverage_normalized.slice(0, 3).map((tag, tidx) => (
                            <span key={tidx} className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                              {tag}
                            </span>
                          ))}
                          {cov.coverage_normalized.length > 3 && (
                            <span className="text-xs text-gray-500">+{cov.coverage_normalized.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-gray-500 text-sm whitespace-nowrap">
                      {formatCompact(cov.primary_limit)}
                    </span>
                    <span className="text-gray-300">→</span>
                    <span className={`font-medium text-sm whitespace-nowrap ${isNoCoverage ? 'text-gray-400' : 'text-gray-900'}`}>
                      {isNoCoverage ? 'Excluded' : (
                        <>
                          {formatCompact(effective.limit)}
                          {ctx.cmai_qs && (
                            <span className="text-purple-600"> po {formatCompact(Math.round((cov.primary_limit / ctx.primary_aggregate_limit) * ctx.cmai_qs))}</span>
                          )}
                          {' '}xs {formatCompact(effective.attachment)}
                        </>
                      )}
                    </span>
                    {!readOnly && (
                      <button
                        className="text-red-400 hover:text-red-600 ml-1"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCoverage(idx); }}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Expanded details */}
                  {isExpanded && !readOnly && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-white rounded-b-lg">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Coverage Name</label>
                          <input
                            type="text"
                            className="form-input text-sm py-1.5 w-full"
                            value={cov.coverage || ''}
                            onChange={(e) => handleUpdateCoverage(idx, 'coverage', e.target.value)}
                            placeholder="Coverage name"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">Primary Limit</label>
                          <select
                            className="form-select text-sm py-1.5 w-full"
                            value={cov.primary_limit}
                            onChange={(e) => handleUpdateCoverage(idx, 'primary_limit', Number(e.target.value))}
                          >
                            {LIMIT_OPTIONS.map(v => <option key={v} value={v}>{formatCompact(v)}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="text-xs text-gray-500 mb-1 block">Treatment</label>
                        <div className="flex gap-2">
                          {[
                            { value: 'follow_form', label: 'Follow Form', desc: 'Proportional limits' },
                            { value: 'different', label: 'Different', desc: 'Custom limits' },
                            { value: 'no_coverage', label: 'Exclude', desc: 'No coverage' },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              className={`flex-1 py-2 px-3 rounded border text-sm transition-colors ${
                                cov.treatment === opt.value
                                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
                              }`}
                              onClick={() => handleUpdateCoverage(idx, 'treatment', opt.value)}
                            >
                              <div className="font-medium">{opt.label}</div>
                              <div className="text-xs opacity-70">{opt.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom overrides for "different" treatment */}
                      {cov.treatment === 'different' && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Our Limit</label>
                            <select
                              className="form-select text-sm py-1.5 w-full"
                              value={cov.our_limit ?? 'prop'}
                              onChange={(e) => handleUpdateCoverage(idx, 'our_limit', e.target.value === 'prop' ? null : Number(e.target.value))}
                            >
                              <option value="prop">Proportional ({formatCompact(prop.limit)})</option>
                              {LIMIT_OPTIONS.map(v => <option key={v} value={v}>{formatCompact(v)}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Our Attachment</label>
                            <select
                              className="form-select text-sm py-1.5 w-full"
                              value={cov.our_attachment ?? 'prop'}
                              onChange={(e) => handleUpdateCoverage(idx, 'our_attachment', e.target.value === 'prop' ? null : Number(e.target.value))}
                            >
                              <option value="prop">Proportional ({formatCompact(prop.attachment)})</option>
                              <option value={0}>$0</option>
                              {LIMIT_OPTIONS.map(v => <option key={v} value={v}>{formatCompact(v)}</option>)}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Standard Tags */}
                      <div className="mt-3">
                        <label className="text-xs text-gray-500 mb-1 block">Standard Coverage Tags</label>
                        <div className="flex flex-wrap gap-1.5">
                          {standardTags.map(tag => {
                            const isSelected = cov.coverage_normalized?.includes(tag);
                            return (
                              <button
                                key={tag}
                                className={`text-xs px-2 py-1 rounded border transition-colors ${
                                  isSelected
                                    ? 'bg-purple-100 border-purple-300 text-purple-700'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                                }`}
                                onClick={() => {
                                  const current = cov.coverage_normalized || [];
                                  const updated = isSelected
                                    ? current.filter(t => t !== tag)
                                    : [...current, tag];
                                  handleUpdateCoverage(idx, 'coverage_normalized', updated);
                                }}
                              >
                                {isSelected && '✓ '}{tag}
                              </button>
                            );
                          })}
                        </div>
                        {standardTags.length === 0 && (
                          <p className="text-xs text-gray-400 italic">Loading tags...</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
