import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getComparables, getComparablesMetrics, getSubmission } from '../api/client';

// Format compact currency
function formatCompact(value) {
  if (!value && value !== 0) return '—';
  const num = Number(value);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${Math.round(num / 1_000)}K`;
  return `$${num.toLocaleString()}`;
}

// Format RPM
function formatRPM(value) {
  if (!value) return '—';
  return `$${Math.round(value).toLocaleString()}`;
}

// Stage badge component
function StageBadge({ stage }) {
  const config = {
    Bound: { class: 'badge-quoted' },
    Quoted: { class: 'badge-pending' },
    Lost: { class: 'badge-declined' },
    Declined: { class: 'badge-declined' },
    Received: { class: 'badge-received' },
  };
  const { class: badgeClass } = config[stage] || config.Received;
  return <span className={`badge ${badgeClass}`}>{stage}</span>;
}

// Metrics card component
function MetricCard({ label, value, subtext }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {subtext && <div className="text-xs text-gray-500 mt-1">{subtext}</div>}
    </div>
  );
}

// Comparison row for detail view
function ComparisonRow({ label, currentValue, compValue, highlight = false }) {
  return (
    <div className={`grid grid-cols-3 gap-4 py-2 ${highlight ? 'bg-blue-50 -mx-4 px-4' : ''}`}>
      <div className="text-gray-600 font-medium">{label}</div>
      <div className="text-gray-900">{currentValue}</div>
      <div className="text-gray-900">{compValue}</div>
    </div>
  );
}

export default function CompsPage() {
  const { submissionId } = useParams();

  // Filter state
  const [layer, setLayer] = useState('primary');
  const [months, setMonths] = useState(24);
  const [revenueTolerance, setRevenueTolerance] = useState(0.5);
  const [stageFilter, setStageFilter] = useState('all');
  const [industrySearch, setIndustrySearch] = useState('');
  const [simMin, setSimMin] = useState(null); // Exposure similarity threshold
  const [controlsMin, setControlsMin] = useState(null); // Controls similarity threshold
  const [attachmentRange, setAttachmentRange] = useState('any'); // For excess layer filtering
  const [customAttachMin, setCustomAttachMin] = useState(10); // Custom min in millions
  const [customAttachMax, setCustomAttachMax] = useState(20); // Custom max in millions
  const [showAdvanced, setShowAdvanced] = useState(false); // Advanced filters toggle

  // Selection state
  const [selectedCompId, setSelectedCompId] = useState(null);

  // Sort state
  const [sortColumn, setSortColumn] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');

  // Get current submission for context
  const { data: submission } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  // Attachment range presets (in millions)
  const attachmentRangeOptions = [
    { value: 'any', label: 'Any', min: null, max: null },
    { value: '0-5', label: '0-5M', min: 0, max: 5 },
    { value: '5-10', label: '5-10M', min: 5, max: 10 },
    { value: '10-20', label: '10-20M', min: 10, max: 20 },
    { value: '20-30', label: '20-30M', min: 20, max: 30 },
    { value: '30-50', label: '30-50M', min: 30, max: 50 },
    { value: '50-75', label: '50-75M', min: 50, max: 75 },
    { value: '75-100', label: '75-100M', min: 75, max: 100 },
    { value: '100-150', label: '100-150M', min: 100, max: 150 },
    { value: '150-200', label: '150-200M', min: 150, max: 200 },
    { value: '200-300', label: '200-300M', min: 200, max: 300 },
    { value: '300-500', label: '300-500M', min: 300, max: 500 },
    { value: 'custom', label: 'Custom...', min: null, max: null },
  ];

  // Get attachment bounds from selected range (use custom values if custom selected)
  const getAttachmentBounds = () => {
    if (attachmentRange === 'any') return { min: null, max: null };
    if (attachmentRange === 'custom') {
      const minVal = customAttachMin > 0 ? customAttachMin * 1_000_000 : null;
      const maxVal = customAttachMax > 0 ? customAttachMax * 1_000_000 : null;
      return { min: minVal, max: maxVal };
    }
    const preset = attachmentRangeOptions.find(o => o.value === attachmentRange);
    return {
      min: preset?.min ? preset.min * 1_000_000 : null,
      max: preset?.max ? preset.max * 1_000_000 : null,
    };
  };
  const { min: attachmentMin, max: attachmentMax } = getAttachmentBounds();

  // When preset selected, update custom values to match
  const handleAttachmentRangeChange = (value) => {
    setAttachmentRange(value);
    const preset = attachmentRangeOptions.find(o => o.value === value);
    if (preset?.min !== null && preset?.max !== null) {
      setCustomAttachMin(preset.min);
      setCustomAttachMax(preset.max);
    }
  };

  // When custom values change, switch to custom mode
  const handleCustomMinChange = (value) => {
    setCustomAttachMin(Number(value) || 0);
    if (attachmentRange !== 'custom' && attachmentRange !== 'any') {
      setAttachmentRange('custom');
    }
  };
  const handleCustomMaxChange = (value) => {
    setCustomAttachMax(Number(value) || 0);
    if (attachmentRange !== 'custom' && attachmentRange !== 'any') {
      setAttachmentRange('custom');
    }
  };

  // Get comparables with filters
  const { data: comparables, isLoading } = useQuery({
    queryKey: ['comparables', submissionId, layer, months, revenueTolerance, attachmentRange, customAttachMin, customAttachMax],
    queryFn: () => getComparables(submissionId, {
      layer,
      months,
      revenue_tolerance: revenueTolerance,
      ...(layer === 'excess' && attachmentMin !== null && { attachment_min: attachmentMin }),
      ...(layer === 'excess' && attachmentMax !== null && { attachment_max: attachmentMax }),
    }).then(res => res.data),
  });

  // Get metrics
  const { data: metrics } = useQuery({
    queryKey: ['comparables-metrics', submissionId],
    queryFn: () => getComparablesMetrics(submissionId).then(res => res.data),
  });

  // Apply client-side filters
  let filteredComps = comparables || [];

  // Stage filter
  if (stageFilter !== 'all') {
    filteredComps = filteredComps.filter(c => c.stage?.toLowerCase() === stageFilter);
  }

  // Industry search
  if (industrySearch.trim()) {
    const needle = industrySearch.toLowerCase();
    filteredComps = filteredComps.filter(c =>
      (c.naics_primary_title || '').toLowerCase().includes(needle)
    );
  }

  // Exposure similarity threshold
  if (simMin !== null) {
    filteredComps = filteredComps.filter(c =>
      c.similarity_score != null && c.similarity_score >= simMin
    );
  }

  // Controls similarity threshold
  if (controlsMin !== null) {
    filteredComps = filteredComps.filter(c =>
      c.controls_similarity != null && c.controls_similarity >= controlsMin
    );
  }

  // Sort
  filteredComps = [...filteredComps].sort((a, b) => {
    let aVal, bVal;
    switch (sortColumn) {
      case 'company':
        aVal = a.applicant_name || '';
        bVal = b.applicant_name || '';
        break;
      case 'date':
        aVal = a.effective_date || a.date_received || '';
        bVal = b.effective_date || b.date_received || '';
        break;
      case 'revenue':
        aVal = a.annual_revenue || 0;
        bVal = b.annual_revenue || 0;
        break;
      case 'rpm':
        aVal = a.rate_per_mil || 0;
        bVal = b.rate_per_mil || 0;
        break;
      case 'limit':
        aVal = a.policy_limit || 0;
        bVal = b.policy_limit || 0;
        break;
      case 'sim':
        aVal = a.similarity_score || 0;
        bVal = b.similarity_score || 0;
        break;
      case 'controls':
        aVal = a.controls_similarity || 0;
        bVal = b.controls_similarity || 0;
        break;
      default:
        return 0;
    }
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Handle column header click for sorting
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Get selected comparable
  const selectedComp = selectedCompId
    ? filteredComps.find(c => c.id === selectedCompId)
    : null;

  // Sort indicator
  const SortIndicator = ({ column }) => {
    if (sortColumn !== column) return null;
    return <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // Filter options
  const layerOptions = [
    { value: 'primary', label: 'Primary' },
    { value: 'excess', label: 'Excess' },
  ];

  const monthOptions = [
    { value: 12, label: 'Last 12 months' },
    { value: 24, label: 'Last 24 months' },
    { value: 36, label: 'Last 36 months' },
    { value: 60, label: 'Last 60 months' },
  ];

  const revenueOptions = [
    { value: 0.25, label: '±25%' },
    { value: 0.5, label: '±50%' },
    { value: 1.0, label: '±100%' },
    { value: 0, label: 'Any size' },
  ];

  const stageOptions = [
    { value: 'all', label: 'All Stages' },
    { value: 'bound', label: 'Bound' },
    { value: 'quoted', label: 'Quoted' },
    { value: 'lost', label: 'Lost' },
    { value: 'declined', label: 'Declined' },
    { value: 'received', label: 'Received' },
  ];

  const similarityOptions = [
    { value: null, label: 'Any' },
    { value: 0.9, label: '≥ 90%' },
    { value: 0.8, label: '≥ 80%' },
    { value: 0.7, label: '≥ 70%' },
    { value: 0.6, label: '≥ 60%' },
    { value: 0.5, label: '≥ 50%' },
  ];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card">
        <h3 className="form-section-title">Filters</h3>
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <label className="form-label">Layer</label>
            <div className="flex gap-2">
              <select
                className="form-select"
                value={layer}
                onChange={(e) => {
                  setLayer(e.target.value);
                  if (e.target.value === 'primary') setAttachmentRange('any');
                }}
              >
                {layerOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {layer === 'excess' && (
                <select
                  className="form-select"
                  value={attachmentRange}
                  onChange={(e) => handleAttachmentRangeChange(e.target.value)}
                  title="Attachment Range"
                >
                  {attachmentRangeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="form-label">Date Window</label>
            <select
              className="form-select"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              {monthOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Revenue Range</label>
            <select
              className="form-select"
              value={revenueTolerance}
              onChange={(e) => setRevenueTolerance(Number(e.target.value))}
            >
              {revenueOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Industry</label>
            <input
              type="text"
              className="form-input"
              placeholder="Search industry..."
              value={industrySearch}
              onChange={(e) => setIndustrySearch(e.target.value)}
            />
          </div>
        </div>

        {/* Advanced filters toggle */}
        <button
          type="button"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mt-3"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▶</span>
          Advanced {showAdvanced ? '' : `(${[simMin, controlsMin, stageFilter !== 'all'].filter(Boolean).length} active)`}
        </button>

        {/* Advanced filters - collapsible */}
        {showAdvanced && (
          <>
            <div className="grid grid-cols-4 gap-4 mt-3">
              <div>
                <label className="form-label">Exposure Similarity</label>
                <select
                  className="form-select"
                  value={simMin ?? ''}
                  onChange={(e) => setSimMin(e.target.value === '' ? null : Number(e.target.value))}
                >
                  {similarityOptions.map(opt => (
                    <option key={opt.value ?? 'any'} value={opt.value ?? ''}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Controls Similarity</label>
                <select
                  className="form-select"
                  value={controlsMin ?? ''}
                  onChange={(e) => setControlsMin(e.target.value === '' ? null : Number(e.target.value))}
                >
                  {similarityOptions.map(opt => (
                    <option key={opt.value ?? 'any'} value={opt.value ?? ''}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Stage</label>
                <select
                  className="form-select"
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                >
                  {stageOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div></div>
            </div>

            {/* Custom attachment range inputs for excess */}
            {layer === 'excess' && (
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div>
                  <label className="form-label">Attachment Min (M)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={customAttachMin}
                    onChange={(e) => handleCustomMinChange(e.target.value)}
                    min={0}
                    step={1}
                    disabled={attachmentRange === 'any'}
                  />
                </div>
                <div>
                  <label className="form-label">Attachment Max (M)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={customAttachMax}
                    onChange={(e) => handleCustomMaxChange(e.target.value)}
                    min={0}
                    step={1}
                    disabled={attachmentRange === 'any'}
                  />
                </div>
                <div></div>
                <div></div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Comparables"
          value={metrics?.count || 0}
          subtext={metrics?.bound_count ? `${metrics.bound_count} bound` : null}
        />
        <MetricCard
          label="Avg RPM (Bound)"
          value={formatRPM(metrics?.avg_rpm_bound)}
        />
        <MetricCard
          label="Avg RPM (All)"
          value={formatRPM(metrics?.avg_rpm_all)}
        />
        <MetricCard
          label="Rate Range (Bound)"
          value={metrics?.rate_range
            ? `${formatRPM(metrics.rate_range[0])} – ${formatRPM(metrics.rate_range[1])}`
            : '—'
          }
        />
      </div>

      {/* Current Submission Context */}
      {submission && (
        <div className="flex gap-2 items-center">
          <span className="text-sm text-gray-500">Current:</span>
          <span className="info-pill">{submission.applicant_name}</span>
          <span className="info-pill">{formatCompact(submission.annual_revenue)}</span>
          <span className="info-pill">{submission.naics_primary_title || 'Unknown Industry'}</span>
        </div>
      )}

      {/* Comparables Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="form-section-title mb-0 pb-0 border-0">Comparable Accounts</h3>
          <div className="flex items-center gap-4">
            {selectedCompId && (
              <button
                className="text-sm text-blue-600 hover:text-blue-800"
                onClick={() => setSelectedCompId(null)}
              >
                Clear selection
              </button>
            )}
            <span className="text-sm text-gray-500">{filteredComps.length} results</span>
          </div>
        </div>

        {isLoading ? (
          <div className="text-gray-500 py-8 text-center">Loading comparables...</div>
        ) : filteredComps.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="table-header cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('company')}
                  >
                    Company<SortIndicator column="company" />
                  </th>
                  <th
                    className="table-header cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('date')}
                  >
                    Date<SortIndicator column="date" />
                  </th>
                  <th
                    className="table-header cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('revenue')}
                  >
                    Revenue<SortIndicator column="revenue" />
                  </th>
                  <th className="table-header">Industry</th>
                  <th
                    className="table-header cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('sim')}
                    title="Exposure Similarity"
                  >
                    Exp<SortIndicator column="sim" />
                  </th>
                  <th
                    className="table-header cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('controls')}
                    title="Controls Similarity"
                  >
                    Ctrl<SortIndicator column="controls" />
                  </th>
                  <th className="table-header">{layer === 'excess' ? 'Carrier' : 'Primary'}</th>
                  <th
                    className="table-header cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('limit')}
                  >
                    Limit<SortIndicator column="limit" />
                  </th>
                  {layer === 'excess' && <th className="table-header">Att</th>}
                  <th className="table-header">SIR</th>
                  <th
                    className="table-header cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('rpm')}
                  >
                    RPM<SortIndicator column="rpm" />
                  </th>
                  <th className="table-header">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredComps.map((comp) => (
                  <tr
                    key={comp.id}
                    className={`cursor-pointer transition-colors ${
                      selectedCompId === comp.id
                        ? 'bg-blue-50 hover:bg-blue-100'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedCompId(selectedCompId === comp.id ? null : comp.id)}
                  >
                    <td className="table-cell">
                      <span className="font-medium text-gray-900 truncate max-w-[160px] block">
                        {comp.applicant_name || 'Unknown'}
                      </span>
                    </td>
                    <td className="table-cell text-gray-600">
                      {comp.effective_date
                        ? new Date(comp.effective_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit'
                          })
                        : comp.date_received
                        ? new Date(comp.date_received).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit'
                          })
                        : '—'
                      }
                    </td>
                    <td className="table-cell text-gray-600">
                      {formatCompact(comp.annual_revenue)}
                    </td>
                    <td className="table-cell text-gray-600 truncate max-w-[140px]">
                      {comp.naics_primary_title || '—'}
                    </td>
                    <td className="table-cell text-gray-600">
                      {comp.similarity_score != null
                        ? `${Math.round(comp.similarity_score * 100)}%`
                        : '—'}
                    </td>
                    <td className="table-cell text-gray-600">
                      {comp.controls_similarity != null
                        ? `${Math.round(comp.controls_similarity * 100)}%`
                        : '—'}
                    </td>
                    <td className="table-cell text-gray-600">
                      {comp.carrier || '—'}
                    </td>
                    <td className="table-cell text-gray-600">
                      {formatCompact(comp.policy_limit)}
                    </td>
                    {layer === 'excess' && (
                      <td className="table-cell text-gray-600">
                        {formatCompact(comp.attachment_point)}
                      </td>
                    )}
                    <td className="table-cell text-gray-600">
                      {formatCompact(comp.primary_retention)}
                    </td>
                    <td className="table-cell font-medium text-blue-600">
                      {formatRPM(comp.rate_per_mil)}
                    </td>
                    <td className="table-cell">
                      <StageBadge stage={comp.stage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-gray-500">
              No comparable submissions found.
              {revenueTolerance > 0 && ' Try widening the revenue range or date window.'}
            </p>
          </div>
        )}
      </div>

      {/* Detail Comparison */}
      <div className="card">
        <h3 className="form-section-title">Detail Comparison</h3>
        {selectedComp ? (
          <div className="space-y-1">
            {/* Header row */}
            <div className="grid grid-cols-3 gap-4 py-2 border-b border-gray-200 font-medium">
              <div className="text-gray-600">Attribute</div>
              <div className="text-blue-600">Current Submission</div>
              <div className="text-green-600">Selected Comparable</div>
            </div>

            <ComparisonRow
              label="Company"
              currentValue={submission?.applicant_name || '—'}
              compValue={selectedComp.applicant_name || '—'}
            />
            <ComparisonRow
              label="Industry"
              currentValue={submission?.naics_primary_title || '—'}
              compValue={selectedComp.naics_primary_title || '—'}
            />
            <ComparisonRow
              label="Revenue"
              currentValue={formatCompact(submission?.annual_revenue)}
              compValue={formatCompact(selectedComp.annual_revenue)}
              highlight
            />
            <ComparisonRow
              label="Policy Limit"
              currentValue="—"
              compValue={formatCompact(selectedComp.policy_limit)}
            />
            <ComparisonRow
              label="Retention"
              currentValue="—"
              compValue={formatCompact(selectedComp.primary_retention)}
            />
            <ComparisonRow
              label="Rate/Million"
              currentValue="—"
              compValue={formatRPM(selectedComp.rate_per_mil)}
              highlight
            />
            <ComparisonRow
              label="Premium"
              currentValue="—"
              compValue={formatCompact(selectedComp.sold_premium || selectedComp.risk_adjusted_premium)}
            />
            <ComparisonRow
              label="Stage"
              currentValue={submission?.status?.replace(/_/g, ' ') || '—'}
              compValue={selectedComp.stage || '—'}
            />
            <ComparisonRow
              label="Effective Date"
              currentValue="—"
              compValue={selectedComp.effective_date
                ? new Date(selectedComp.effective_date).toLocaleDateString()
                : '—'
              }
            />
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <p className="text-gray-500">
              Click a row in the table above to see a detailed side-by-side comparison
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
