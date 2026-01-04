import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubmission,
  updateSubmission,
  saveFeedback,
  getLossHistory,
  updateClaimNotes,
  calculatePremium,
  createQuoteOption,
  getComparables,
} from '../api/client';
import CompsPage from './CompsPage';

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ─────────────────────────────────────────────────────────────
// Editable Section Component
// ─────────────────────────────────────────────────────────────

function EditableSection({ title, value, fieldName, submissionId, onSave, children }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [showSaved, setShowSaved] = useState(false);
  const [editStartTime, setEditStartTime] = useState(null);
  const textareaRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isEditing) {
      setEditValue(value || '');
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      setEditStartTime(Date.now());
    }
  }, [isEditing]);

  const feedbackMutation = useMutation({
    mutationFn: (feedback) => saveFeedback(submissionId, feedback),
  });

  const saveMutation = useMutation({
    mutationFn: (newValue) => updateSubmission(submissionId, { [fieldName]: newValue }),
    onSuccess: () => {
      if (editValue !== value) {
        const timeToEdit = editStartTime ? Math.round((Date.now() - editStartTime) / 1000) : null;
        feedbackMutation.mutate({
          field_name: fieldName,
          original_value: value,
          edited_value: editValue,
          edit_type: value ? 'modification' : 'addition',
          time_to_edit_seconds: timeToEdit,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['submission', submissionId] });
      setIsEditing(false);
      setEditStartTime(null);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
      onSave?.(fieldName, editValue);
    },
  });

  const handleSave = () => saveMutation.mutate(editValue);
  const handleCancel = () => { setEditValue(value || ''); setIsEditing(false); setEditStartTime(null); };
  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') handleCancel();
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="form-section-title mb-0 pb-0 border-0">{title}</h3>
        <div className="flex items-center gap-2">
          {showSaved && <span className="text-sm text-green-600">Saved</span>}
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="text-sm text-purple-600 hover:text-purple-800 font-medium">Edit</button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-700" disabled={saveMutation.isPending}>Cancel</button>
              <button onClick={handleSave} className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>
      {isEditing ? (
        <div>
          <textarea ref={textareaRef} value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleKeyDown}
            className="form-input w-full h-64 font-mono text-sm resize-y" placeholder={`Enter ${title.toLowerCase()}...`} />
          <p className="text-xs text-gray-500 mt-1">Tip: Cmd/Ctrl+Enter to save, Escape to cancel</p>
        </div>
      ) : children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Formatted Text Component
// ─────────────────────────────────────────────────────────────

function FormattedText({ text }) {
  if (!text || typeof text !== 'string') return <p className="text-gray-500 italic">No data available</p>;
  const lines = text.split('\n');
  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        if (line.startsWith('## ')) return <h4 key={idx} className="font-semibold text-gray-900 mt-4 first:mt-0">{line.replace('## ', '')}</h4>;
        if (line.startsWith('### ')) return <h5 key={idx} className="font-medium text-gray-800 mt-3">{line.replace('### ', '')}</h5>;
        if (line.startsWith('**') && line.endsWith('**')) return <p key={idx} className="font-semibold text-gray-800">{line.replace(/\*\*/g, '')}</p>;
        if (line.startsWith('- ')) return <div key={idx} className="flex gap-2 text-gray-700 ml-2"><span className="text-gray-400">•</span><span>{line.replace('- ', '').replace(/\*\*/g, '')}</span></div>;
        if (line.trim()) return <p key={idx} className="text-gray-700">{line}</p>;
        return null;
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Control Card Component
// ─────────────────────────────────────────────────────────────

function ControlCard({ name, status, description }) {
  const statusColors = {
    implemented: 'bg-green-100 text-green-800 border-green-200',
    partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    not_implemented: 'bg-red-100 text-red-800 border-red-200',
    unknown: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  const statusLabels = { implemented: 'Implemented', partial: 'Partial', not_implemented: 'Not Implemented', unknown: 'Unknown' };

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-gray-900 text-sm">{name}</span>
        <span className={`text-xs px-2 py-0.5 rounded border ${statusColors[status] || statusColors.unknown}`}>{statusLabels[status] || status}</span>
      </div>
      {description && <p className="text-xs text-gray-600">{description}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Loss History Section
// ─────────────────────────────────────────────────────────────

function LossHistorySection({ submissionId }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: lossData, isLoading } = useQuery({
    queryKey: ['loss-history', submissionId],
    queryFn: () => getLossHistory(submissionId).then(res => res.data),
  });

  const summary = lossData?.summary;
  const claims = lossData?.claims || [];

  return (
    <div className="card">
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between">
        <div>
          <h3 className="form-section-title mb-0 pb-0 border-0">Loss History</h3>
          <p className="text-xs text-gray-500 mt-1">Click to expand claims</p>
        </div>
        <div className="flex items-center gap-3">
          {lossData?.count > 0 && <span className="text-sm text-gray-500">{lossData.count} claims</span>}
          <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4">
          {isLoading ? <p className="text-gray-500">Loading...</p> : claims.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-6 text-center"><p className="text-gray-500">No loss history records found.</p></div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="metric-card"><div className="metric-label">Total Paid</div><div className="metric-value text-lg">{formatCurrency(summary?.total_paid)}</div></div>
                <div className="metric-card"><div className="metric-label">Total Incurred</div><div className="metric-value text-lg">{formatCurrency(summary?.total_incurred)}</div></div>
                <div className="metric-card"><div className="metric-label">Closed Claims</div><div className="metric-value text-lg">{summary?.closed_claims || 0}</div></div>
                <div className="metric-card"><div className="metric-label">Avg per Claim</div><div className="metric-value text-lg">{formatCurrency(summary?.avg_paid)}</div></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header">Type</th>
                      <th className="table-header">Description</th>
                      <th className="table-header">Status</th>
                      <th className="table-header text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {claims.map((claim) => (
                      <tr key={claim.id} className="hover:bg-gray-50">
                        <td className="table-cell text-gray-600">{claim.loss_date ? new Date(claim.loss_date).toLocaleDateString() : '—'}</td>
                        <td className="table-cell">{claim.loss_type || '—'}</td>
                        <td className="table-cell text-gray-600 max-w-[200px] truncate">{claim.description || '—'}</td>
                        <td className="table-cell"><span className={`badge ${claim.status?.toUpperCase() === 'CLOSED' ? 'badge-quoted' : 'badge-pending'}`}>{claim.status || '—'}</span></td>
                        <td className="table-cell text-right font-medium">{formatCurrency(claim.paid_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pricing Section (Rating + Comps)
// ─────────────────────────────────────────────────────────────

function PricingSection({ submissionId, submission }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Rating state
  const [retention, setRetention] = useState(25000);
  const [hazard, setHazard] = useState(null);
  const [controlAdj, setControlAdj] = useState(0);
  const [premiumGrid, setPremiumGrid] = useState({});
  const [calculating, setCalculating] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Comps modal state
  const [showCompsModal, setShowCompsModal] = useState(false);

  // Comps summary query
  const { data: comparables } = useQuery({
    queryKey: ['comparables', submissionId, 'primary'],
    queryFn: () => getComparables(submissionId, { layer: 'primary', limit: 20 }).then(res => res.data),
    enabled: !!submissionId,
  });

  // Initialize from submission
  useEffect(() => {
    if (submission && !hasInitialized) {
      setHazard(submission.hazard_override || null);
      if (submission.control_overrides?.overall) setControlAdj(submission.control_overrides.overall);
      setHasInitialized(true);
    }
  }, [submission, hasInitialized]);

  // Calculate premiums
  useEffect(() => {
    if (!submissionId || !hasInitialized) return;
    const calculateGrid = async () => {
      setCalculating(true);
      const limits = [1_000_000, 2_000_000, 3_000_000, 5_000_000];
      const results = {};
      try {
        for (const limit of limits) {
          const res = await calculatePremium(submissionId, { limit, retention, hazard_override: hazard, control_adjustment: controlAdj });
          results[limit] = res.data;
        }
        setPremiumGrid(results);
      } catch (err) {
        console.error('Premium calculation error:', err);
      } finally {
        setCalculating(false);
      }
    };
    calculateGrid();
  }, [submissionId, retention, hazard, controlAdj, hasInitialized]);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => queryClient.invalidateQueries(['submission', submissionId]),
  });

  const createQuoteMutation = useMutation({
    mutationFn: (data) => createQuoteOption(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['quotes', submissionId]);
      navigate(`/submissions/${submissionId}/quote`);
    },
  });

  const handleHazardChange = (value) => {
    const newHazard = value === '' ? null : Number(value);
    setHazard(newHazard);
    updateMutation.mutate({ hazard_override: newHazard });
  };

  const handleControlAdjChange = (value) => {
    const newAdj = Number(value);
    setControlAdj(newAdj);
    updateMutation.mutate({ control_overrides: { overall: newAdj } });
  };

  const handleCreateQuote = (limit) => {
    const premium = premiumGrid[limit];
    createQuoteMutation.mutate({
      quote_name: `$${limit / 1_000_000}M Primary @ ${formatCompact(retention)} Retention`,
      primary_retention: retention,
      policy_form: 'claims_made',
      tower_json: [{ carrier: 'CMAI', limit, attachment: 0, premium: premium?.risk_adjusted_premium || null }],
    });
  };

  // Comps summary stats
  const boundComps = comparables?.filter(c => c.is_bound) || [];
  const avgRate = boundComps.length > 0 ? boundComps.reduce((sum, c) => sum + (c.rate_per_mil || 0), 0) / boundComps.length : null;
  const rateRange = boundComps.length > 0 ? {
    min: Math.min(...boundComps.map(c => c.rate_per_mil).filter(Boolean)),
    max: Math.max(...boundComps.map(c => c.rate_per_mil).filter(Boolean)),
  } : null;

  const retentionOptions = [
    { value: 25000, label: '$25K' }, { value: 50000, label: '$50K' }, { value: 100000, label: '$100K' },
    { value: 150000, label: '$150K' }, { value: 250000, label: '$250K' },
  ];
  const hazardOptions = [
    { value: '', label: 'Auto-detect' }, { value: 1, label: '1 - Low' }, { value: 2, label: '2 - Below Avg' },
    { value: 3, label: '3 - Average' }, { value: 4, label: '4 - Above Avg' }, { value: 5, label: '5 - High' },
  ];
  const adjOptions = [
    { value: -0.15, label: '-15%' }, { value: -0.10, label: '-10%' }, { value: -0.05, label: '-5%' },
    { value: 0, label: 'None' }, { value: 0.05, label: '+5%' }, { value: 0.10, label: '+10%' }, { value: 0.15, label: '+15%' },
  ];

  const limits = [1_000_000, 2_000_000, 3_000_000, 5_000_000];
  const detectedHazard = Object.values(premiumGrid)[0]?.breakdown?.hazard_class;

  return (
    <div className="card">
      <h3 className="form-section-title">Pricing</h3>

      {/* Rating Parameters */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <label className="form-label">Retention</label>
          <select className="form-select" value={retention} onChange={(e) => setRetention(Number(e.target.value))}>
            {retentionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Hazard Class</label>
          <select className="form-select" value={hazard ?? ''} onChange={(e) => handleHazardChange(e.target.value)}>
            {hazardOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          {!hazard && detectedHazard && <p className="text-xs text-gray-500 mt-1">Detected: {detectedHazard}</p>}
        </div>
        <div>
          <label className="form-label">Control Adjustment</label>
          <select className="form-select" value={controlAdj} onChange={(e) => handleControlAdjChange(e.target.value)}>
            {adjOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>

      {/* Two-column: Calculated vs Market */}
      <div className="grid grid-cols-2 gap-6">
        {/* Calculated Premium */}
        <div className="bg-gray-50 rounded-lg p-4 border">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900">Calculated Premium</h4>
            {calculating && <span className="text-xs text-gray-500">Calculating...</span>}
          </div>
          {!submission?.annual_revenue ? (
            <p className="text-sm text-yellow-700">Set revenue on Setup tab to calculate.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">Limit</th>
                  <th className="pb-2 text-right">Premium</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {limits.map(limit => {
                  const result = premiumGrid[limit] || {};
                  return (
                    <tr key={limit} className="border-t border-gray-200">
                      <td className="py-2 font-medium">{formatCompact(limit)}</td>
                      <td className="py-2 text-right text-blue-600 font-medium">
                        {calculating ? '...' : formatCurrency(result.risk_adjusted_premium)}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleCreateQuote(limit)}
                          disabled={calculating || createQuoteMutation.isPending}
                          className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                        >
                          Create
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Market Benchmark (Comps Summary) */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900">Market Benchmark</h4>
            <span className="text-xs text-gray-500">{comparables?.length || 0} comps</span>
          </div>
          {boundComps.length > 0 ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Avg Rate (bound)</span>
                <span className="font-medium text-blue-700">${avgRate?.toFixed(0)}/mil</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Rate Range</span>
                <span className="font-medium text-blue-700">${rateRange?.min?.toFixed(0)} - ${rateRange?.max?.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Bound Comps</span>
                <span className="font-medium">{boundComps.length}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No bound comparables found</p>
          )}
          <button
            onClick={() => setShowCompsModal(true)}
            className="mt-4 w-full text-sm text-purple-600 hover:text-purple-800 font-medium py-2 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
          >
            View Full Comp Analysis →
          </button>
        </div>
      </div>

      {/* Comps Modal */}
      {showCompsModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowCompsModal(false)} />
          <div className="fixed inset-4 md:inset-8 lg:inset-12 bg-white rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">Comparable Analysis</h2>
              <button onClick={() => setShowCompsModal(false)} className="p-2 hover:bg-gray-200 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <CompsPage />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Analyze Page Component
// ─────────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const { submissionId } = useParams();

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  // Parse NIST controls
  let nistControls = [];
  if (submission?.nist_controls) {
    if (Array.isArray(submission.nist_controls)) {
      nistControls = submission.nist_controls;
    } else if (typeof submission.nist_controls === 'object') {
      nistControls = Object.entries(submission.nist_controls).map(([key, value]) => ({
        name: key,
        ...(typeof value === 'object' ? value : { status: value }),
      }));
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="metric-card">
          <div className="metric-label">Revenue</div>
          <div className="metric-value">{formatCompact(submission?.annual_revenue)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Industry</div>
          <div className="metric-value text-base truncate" title={submission?.naics_primary_title}>
            {submission?.naics_primary_title || '—'}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">NAICS Code</div>
          <div className="metric-value">{submission?.naics_primary_code || '—'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Status</div>
          <div className="metric-value text-base">{submission?.status?.replace(/_/g, ' ') || '—'}</div>
        </div>
      </div>

      {/* Pricing Section (Calculated + Market Benchmark) */}
      <PricingSection submissionId={submissionId} submission={submission} />

      {/* Loss History */}
      <LossHistorySection submissionId={submissionId} />

      {/* Business Summary + Key Points */}
      <div className="grid grid-cols-2 gap-6">
        <EditableSection title="Business Summary" value={submission?.business_summary} fieldName="business_summary" submissionId={submissionId}>
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{submission?.business_summary || 'No business summary available'}</p>
          </div>
        </EditableSection>
        <EditableSection title="Key Points" value={submission?.bullet_point_summary} fieldName="bullet_point_summary" submissionId={submissionId}>
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <FormattedText text={submission?.bullet_point_summary} />
          </div>
        </EditableSection>
      </div>

      {/* Security Controls */}
      <EditableSection title="Security Controls Assessment" value={submission?.nist_controls_summary} fieldName="nist_controls_summary" submissionId={submissionId}>
        {submission?.nist_controls_summary && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <FormattedText text={submission.nist_controls_summary} />
          </div>
        )}
        {nistControls.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {nistControls.map((control, idx) => <ControlCard key={idx} name={control.name} status={control.status} description={control.description} />)}
          </div>
        ) : !submission?.nist_controls_summary ? (
          <div className="bg-gray-50 rounded-lg p-4 text-center"><p className="text-gray-500">No security controls data available</p></div>
        ) : null}
      </EditableSection>

      {/* AI Recommendation */}
      {submission?.ai_recommendation && (
        <div className="card">
          <h3 className="form-section-title">AI Recommendation</h3>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <FormattedText text={submission.ai_recommendation} />
          </div>
        </div>
      )}

      {/* Guideline Citations */}
      {submission?.ai_guideline_citations && (
        <div className="card">
          <h3 className="form-section-title">Guideline Citations</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <FormattedText text={submission.ai_guideline_citations} />
          </div>
        </div>
      )}
    </div>
  );
}
