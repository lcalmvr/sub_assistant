import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubmission, updateSubmission, saveFeedback, getLossHistory, updateClaimNotes } from '../api/client';

// Editable section component for AI-generated content
function EditableSection({ title, value, fieldName, submissionId, onSave, children }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [showSaved, setShowSaved] = useState(false);
  const [editStartTime, setEditStartTime] = useState(null);
  const textareaRef = useRef(null);
  const queryClient = useQueryClient();

  // Update edit value when prop changes (after save)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value || '');
    }
  }, [value, isEditing]);

  // Focus textarea and track edit start time when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      setEditStartTime(Date.now());
    }
  }, [isEditing]);

  // Mutation for saving feedback (fire and forget)
  const feedbackMutation = useMutation({
    mutationFn: (feedback) => saveFeedback(submissionId, feedback),
  });

  const saveMutation = useMutation({
    mutationFn: (newValue) => updateSubmission(submissionId, { [fieldName]: newValue }),
    onSuccess: () => {
      // Track feedback if the value actually changed
      if (editValue !== value) {
        const timeToEdit = editStartTime
          ? Math.round((Date.now() - editStartTime) / 1000)
          : null;

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

  const handleSave = () => {
    saveMutation.mutate(editValue);
  };

  const handleCancel = () => {
    setEditValue(value || '');
    setIsEditing(false);
    setEditStartTime(null);
  };

  const handleKeyDown = (e) => {
    // Cmd/Ctrl+Enter to save
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="form-section-title mb-0 pb-0 border-0">{title}</h3>
        <div className="flex items-center gap-2">
          {showSaved && (
            <span className="text-sm text-green-600">Saved</span>
          )}
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
              title="Edit this section"
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="text-sm text-gray-500 hover:text-gray-700"
                disabled={saveMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div>
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="form-input w-full h-64 font-mono text-sm resize-y"
            placeholder={`Enter ${title.toLowerCase()}...`}
          />
          <p className="text-xs text-gray-500 mt-1">
            Tip: Cmd/Ctrl+Enter to save, Escape to cancel
          </p>
          {saveMutation.isError && (
            <p className="text-sm text-red-600 mt-1">Error saving. Please try again.</p>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// Format currency compact
function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

// Parse markdown-like text into formatted sections
function FormattedText({ text }) {
  if (!text || typeof text !== 'string') return <p className="text-gray-500 italic">No data available</p>;

  const lines = text.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        if (line.startsWith('## ')) {
          return (
            <h4 key={idx} className="font-semibold text-gray-900 mt-4 first:mt-0">
              {line.replace('## ', '')}
            </h4>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h5 key={idx} className="font-medium text-gray-800 mt-3">
              {line.replace('### ', '')}
            </h5>
          );
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return (
            <p key={idx} className="font-semibold text-gray-800">
              {line.replace(/\*\*/g, '')}
            </p>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <div key={idx} className="flex gap-2 text-gray-700 ml-2">
              <span className="text-gray-400">•</span>
              <span>{line.replace('- ', '').replace(/\*\*/g, '')}</span>
            </div>
          );
        }
        if (line.trim()) {
          return <p key={idx} className="text-gray-700">{line}</p>;
        }
        return null;
      })}
    </div>
  );
}

// Risk indicator badge
function RiskBadge({ level }) {
  const config = {
    low: { label: 'Low Risk', class: 'badge-quoted' },
    medium: { label: 'Medium Risk', class: 'badge-renewal' },
    high: { label: 'High Risk', class: 'badge-declined' },
  };
  const { label, class: badgeClass } = config[level] || config.medium;
  return <span className={`badge ${badgeClass}`}>{label}</span>;
}

// NIST Control card
function ControlCard({ name, status, description }) {
  const statusColors = {
    implemented: 'bg-green-100 text-green-800 border-green-200',
    partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    not_implemented: 'bg-red-100 text-red-800 border-red-200',
    unknown: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  const statusLabels = {
    implemented: 'Implemented',
    partial: 'Partial',
    not_implemented: 'Not Implemented',
    unknown: 'Unknown',
  };

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-gray-900 text-sm">{name}</span>
        <span className={`text-xs px-2 py-0.5 rounded border ${statusColors[status] || statusColors.unknown}`}>
          {statusLabels[status] || status}
        </span>
      </div>
      {description && (
        <p className="text-xs text-gray-600">{description}</p>
      )}
    </div>
  );
}

// Cyber exposure item
function ExposureItem({ exposure }) {
  if (typeof exposure === 'string') {
    return (
      <div className="flex gap-2 text-gray-700">
        <span className="text-purple-500">•</span>
        <span>{exposure}</span>
      </div>
    );
  }

  return (
    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-purple-900">{exposure.name || exposure.type}</span>
        {exposure.severity && <RiskBadge level={exposure.severity} />}
      </div>
      {exposure.description && (
        <p className="text-sm text-purple-700">{exposure.description}</p>
      )}
    </div>
  );
}

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

// Claim Row with expandable notes
function ClaimRow({ claim, submissionId }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(claim.uw_notes || '');
  const [expectedTotal, setExpectedTotal] = useState(claim.expected_total || '');
  const [noteSource, setNoteSource] = useState(claim.note_source || '');
  const [showSaved, setShowSaved] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data) => updateClaimNotes(claim.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loss-history', submissionId] });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    },
  });

  const handleSave = () => {
    mutation.mutate({
      uw_notes: notes || null,
      expected_total: expectedTotal ? parseFloat(expectedTotal) : null,
      note_source: noteSource || null,
    });
  };

  const hasNotes = claim.uw_notes || claim.expected_total || claim.note_source;

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-purple-50' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="table-cell text-gray-600">
          {claim.loss_date ? new Date(claim.loss_date).toLocaleDateString() : '—'}
        </td>
        <td className="table-cell">{claim.loss_type || '—'}</td>
        <td className="table-cell text-gray-600 max-w-[200px]">
          <div className="flex items-center gap-2">
            <span className="truncate" title={claim.description}>{claim.description || '—'}</span>
            {hasNotes && (
              <span className="flex-shrink-0 w-2 h-2 bg-purple-500 rounded-full" title="Has UW notes" />
            )}
          </div>
        </td>
        <td className="table-cell">
          <span className={`badge ${
            claim.status?.toUpperCase() === 'CLOSED' ? 'badge-quoted' :
            claim.status?.toUpperCase() === 'OPEN' ? 'badge-pending' :
            'badge-received'
          }`}>
            {claim.status || '—'}
          </span>
        </td>
        <td className="table-cell text-right font-medium">
          <div>
            {formatCurrency(claim.paid_amount)}
            {claim.expected_total && claim.expected_total !== claim.paid_amount && (
              <div className="text-xs text-orange-600">
                Est: {formatCurrency(claim.expected_total)}
              </div>
            )}
          </div>
        </td>
        <td className="table-cell text-gray-600">{claim.carrier || '—'}</td>
      </tr>
      {isExpanded && (
        <tr className="bg-purple-50">
          <td colSpan={6} className="px-4 py-3">
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="form-label">UW Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add context from broker calls, emails, etc..."
                    className="form-input w-full h-20 text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="form-label">Expected Total</label>
                    <input
                      type="number"
                      value={expectedTotal}
                      onChange={(e) => setExpectedTotal(e.target.value)}
                      placeholder="e.g., 1000000"
                      className="form-input w-full text-sm"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <p className="text-xs text-gray-400 mt-1">UW estimate if different from formal</p>
                  </div>
                  <div>
                    <label className="form-label">Source</label>
                    <input
                      type="text"
                      value={noteSource}
                      onChange={(e) => setNoteSource(e.target.value)}
                      placeholder="e.g., Call with broker 1/3/25"
                      className="form-input w-full text-sm"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  {claim.note_updated_at && (
                    <>Last updated: {new Date(claim.note_updated_at).toLocaleString()}</>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {showSaved && <span className="text-sm text-green-600">Saved</span>}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSave(); }}
                    disabled={mutation.isPending}
                    className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                  >
                    {mutation.isPending ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Loss History Section
function LossHistorySection({ submissionId }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: lossData, isLoading } = useQuery({
    queryKey: ['loss-history', submissionId],
    queryFn: () => getLossHistory(submissionId).then(res => res.data),
  });

  const summary = lossData?.summary;
  const claims = lossData?.claims || [];
  const claimsWithNotes = claims.filter(c => c.uw_notes || c.expected_total).length;

  return (
    <div className="card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between"
      >
        <div>
          <h3 className="form-section-title mb-0 pb-0 border-0">Loss History</h3>
          <p className="text-xs text-gray-500 mt-1">Click a claim row to add UW notes</p>
        </div>
        <div className="flex items-center gap-3">
          {claimsWithNotes > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {claimsWithNotes} with notes
            </span>
          )}
          {lossData?.count > 0 && (
            <span className="text-sm text-gray-500">{lossData.count} claims</span>
          )}
          <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4">
          {isLoading ? (
            <p className="text-gray-500">Loading...</p>
          ) : claims.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <p className="text-gray-500">No loss history records found for this submission.</p>
            </div>
          ) : (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="metric-card">
                  <div className="metric-label">Total Paid</div>
                  <div className="metric-value text-lg">{formatCurrency(summary?.total_paid)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Total Incurred</div>
                  <div className="metric-value text-lg">{formatCurrency(summary?.total_incurred)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Closed Claims</div>
                  <div className="metric-value text-lg">{summary?.closed_claims || 0}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Avg per Claim</div>
                  <div className="metric-value text-lg">{formatCurrency(summary?.avg_paid)}</div>
                </div>
              </div>

              {/* Claims Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="table-header">Date</th>
                      <th className="table-header">Type</th>
                      <th className="table-header">Description</th>
                      <th className="table-header">Status</th>
                      <th className="table-header text-right">Paid</th>
                      <th className="table-header">Carrier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {claims.map((claim) => (
                      <ClaimRow key={claim.id} claim={claim} submissionId={submissionId} />
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

export default function UWPage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  // Local state for editable fields
  const [hazardOverride, setHazardOverride] = useState('');
  const [controlAdj, setControlAdj] = useState(0);
  const [hasInitialized, setHasInitialized] = useState(false);

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  // Initialize from submission data
  useEffect(() => {
    if (submission && !hasInitialized) {
      setHazardOverride(submission.hazard_override?.toString() || '');
      if (submission.control_overrides?.overall) {
        setControlAdj(submission.control_overrides.overall);
      }
      setHasInitialized(true);
    }
  }, [submission, hasInitialized]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['submission', submissionId]);
    },
  });

  // Handle hazard change
  const handleHazardChange = (value) => {
    setHazardOverride(value);
    const newHazard = value === '' ? null : Number(value);
    updateMutation.mutate({ hazard_override: newHazard });
  };

  // Handle control adjustment change
  const handleControlAdjChange = (value) => {
    const newAdj = Number(value);
    setControlAdj(newAdj);
    updateMutation.mutate({
      control_overrides: { overall: newAdj }
    });
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  // Parse cyber exposures (could be JSON object, array, or string)
  let cyberExposures = [];
  if (submission?.cyber_exposures) {
    if (Array.isArray(submission.cyber_exposures)) {
      cyberExposures = submission.cyber_exposures;
    } else if (typeof submission.cyber_exposures === 'object') {
      cyberExposures = Object.entries(submission.cyber_exposures).map(([key, value]) => ({
        name: key,
        ...value,
      }));
    } else if (typeof submission.cyber_exposures === 'string') {
      cyberExposures = submission.cyber_exposures.split('\n').filter(Boolean);
    }
  }

  // Parse NIST controls (could be JSON object or array)
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

  // Hazard options
  const hazardOptions = [
    { value: '', label: 'Auto-detect' },
    { value: '1', label: '1 - Low' },
    { value: '2', label: '2 - Below Average' },
    { value: '3', label: '3 - Average' },
    { value: '4', label: '4 - Above Average' },
    { value: '5', label: '5 - High' },
  ];

  // Control adjustment options
  const adjOptions = [
    { value: -0.20, label: '-20% (Strong Controls)' },
    { value: -0.15, label: '-15%' },
    { value: -0.10, label: '-10%' },
    { value: -0.05, label: '-5%' },
    { value: 0, label: 'No Adjustment' },
    { value: 0.05, label: '+5%' },
    { value: 0.10, label: '+10%' },
    { value: 0.15, label: '+15%' },
    { value: 0.20, label: '+20% (Weak Controls)' },
  ];

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
          <div className="metric-value text-base">
            {submission?.status?.replace(/_/g, ' ') || '—'}
          </div>
        </div>
      </div>

      {/* Rating Overrides - Editable */}
      <div className="card">
        <h3 className="form-section-title">Underwriting Adjustments</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="form-label">Hazard Class Override</label>
            <select
              className="form-select"
              value={hazardOverride}
              onChange={(e) => handleHazardChange(e.target.value)}
            >
              {hazardOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Override the industry-based hazard classification
            </p>
          </div>
          <div>
            <label className="form-label">Control Quality Adjustment</label>
            <select
              className="form-select"
              value={controlAdj}
              onChange={(e) => handleControlAdjChange(e.target.value)}
            >
              {adjOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Adjust premium based on security control quality
            </p>
          </div>
        </div>
        {updateMutation.isPending && (
          <p className="text-sm text-gray-500 mt-2">Saving...</p>
        )}
        {updateMutation.isSuccess && (
          <p className="text-sm text-green-600 mt-2">Saved</p>
        )}
      </div>

      {/* Loss History */}
      <LossHistorySection submissionId={submissionId} />

      <div className="grid grid-cols-2 gap-6">
        {/* Business Summary */}
        <EditableSection
          title="Business Summary"
          value={submission?.business_summary}
          fieldName="business_summary"
          submissionId={submissionId}
        >
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {submission?.business_summary || 'No business summary available'}
            </p>
          </div>
        </EditableSection>

        {/* Key Points */}
        <EditableSection
          title="Key Points"
          value={submission?.bullet_point_summary}
          fieldName="bullet_point_summary"
          submissionId={submissionId}
        >
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <FormattedText text={submission?.bullet_point_summary} />
          </div>
        </EditableSection>
      </div>

      {/* Cyber Exposures */}
      <EditableSection
        title="Cyber Exposures"
        value={typeof submission?.cyber_exposures === 'string' ? submission.cyber_exposures : JSON.stringify(submission?.cyber_exposures, null, 2)}
        fieldName="cyber_exposures"
        submissionId={submissionId}
      >
        <div className="flex items-center justify-end mb-2">
          {cyberExposures.length > 0 && (
            <span className="text-sm text-gray-500">{cyberExposures.length} identified</span>
          )}
        </div>
        {cyberExposures.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {cyberExposures.map((exposure, idx) => (
              <ExposureItem key={idx} exposure={exposure} />
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-500">No cyber exposures identified</p>
          </div>
        )}
      </EditableSection>

      {/* NIST Controls Summary */}
      <EditableSection
        title="Security Controls Assessment"
        value={submission?.nist_controls_summary}
        fieldName="nist_controls_summary"
        submissionId={submissionId}
      >
        {submission?.nist_controls_summary ? (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <FormattedText text={submission.nist_controls_summary} />
          </div>
        ) : null}

        {nistControls.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {nistControls.map((control, idx) => (
              <ControlCard
                key={idx}
                name={control.name}
                status={control.status}
                description={control.description}
              />
            ))}
          </div>
        ) : !submission?.nist_controls_summary ? (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-500">No security controls data available</p>
          </div>
        ) : null}
      </EditableSection>

      {/* AI Recommendation Preview */}
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
