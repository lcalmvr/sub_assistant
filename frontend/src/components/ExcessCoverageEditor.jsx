import { useState } from 'react';

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

  // Find CMAI layer
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
 *
 * Props:
 * - sublimits: Array of coverage objects
 * - towerJson: Tower structure for proportional calculations
 * - onSave: Callback when sublimits change
 * - readOnly: If true, display only
 */
export default function ExcessCoverageEditor({
  sublimits: propSublimits,
  towerJson,
  onSave,
  readOnly = false,
}) {
  const [editingIdx, setEditingIdx] = useState(null);

  const sublimits = propSublimits || [];
  const ctx = buildTowerContext(towerJson);

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

      // Clear overrides when switching away from "different"
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

  // Check if value matches a preset option
  const findOptionValue = (value, options) => {
    const match = options.find(o => o.value === value);
    return match ? value : 'prop';
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h4 className="form-section-title mb-0">Coverage Schedule (Excess)</h4>
        {!readOnly && (
          <button
            className="btn btn-secondary text-sm"
            onClick={handleAddCoverage}
          >
            + Add Coverage
          </button>
        )}
      </div>

      {/* Tower context info */}
      {ctx.cmai_layer_idx !== null && (
        <div className="text-xs text-gray-500 mb-4">
          CMAI: {formatCompact(ctx.our_aggregate_limit)} xs {formatCompact(ctx.our_aggregate_attachment)} ·
          Primary agg: {formatCompact(ctx.primary_aggregate_limit)}
        </div>
      )}

      {sublimits.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-gray-500 mb-3">No coverages defined yet.</p>
          {!readOnly && (
            <button
              className="btn btn-primary text-sm"
              onClick={handleAddCoverage}
            >
              + Add Coverage
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-600">Coverage</th>
                <th className="text-left py-2 px-2 font-medium text-gray-600 w-24">Primary</th>
                <th className="text-left py-2 px-2 font-medium text-gray-600 w-28">Treatment</th>
                <th className="text-left py-2 px-2 font-medium text-gray-600 w-24">Our Limit</th>
                <th className="text-left py-2 px-2 font-medium text-gray-600 w-24">Our Attach</th>
                <th className="text-left py-2 px-2 font-medium text-gray-600 w-28">Ours</th>
                {!readOnly && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {sublimits.map((cov, idx) => {
                const effective = getEffectiveValues(cov);
                const isNoCoverage = cov.treatment === 'no_coverage';
                const isDifferent = cov.treatment === 'different';
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

                    {/* Treatment */}
                    <td className="py-2 px-2">
                      {readOnly ? (
                        <span className="text-gray-600">
                          {TREATMENT_OPTIONS.find(o => o.value === cov.treatment)?.label || cov.treatment}
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
                            // Switch to "different" if setting explicit value
                            if (val !== null && cov.treatment === 'follow_form') {
                              handleUpdateCoverage(idx, 'treatment', 'different');
                            }
                          }}
                          disabled={isNoCoverage}
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
                            // Switch to "different" if setting explicit value
                            if (val !== null && cov.treatment === 'follow_form') {
                              handleUpdateCoverage(idx, 'treatment', 'different');
                            }
                          }}
                          disabled={isNoCoverage}
                        >
                          <option value="prop">Prop ({formatCompact(prop.attachment)})</option>
                          {ATTACHMENT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                    </td>

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
      )}

      {/* Help text */}
      <div className="mt-4 text-xs text-gray-500">
        <strong>Treatment:</strong> Follow Form uses proportional limits based on tower structure.
        Different allows custom overrides. No Coverage excludes this coverage entirely.
      </div>
    </div>
  );
}
