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
  getCredibility,
} from '../api/client';
import CompsPage from './CompsPage';

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
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
// Application Quality Card
// ─────────────────────────────────────────────────────────────

function ApplicationQualityCard({ credibility }) {
  if (!credibility?.has_score) {
    return (
      <div className="card bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="form-section-title mb-0 pb-0 border-0">Application Quality</h3>
          <span className="text-sm text-gray-500">Pending</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Quality assessment will be available after document processing.
        </p>
      </div>
    );
  }

  const { total_score, label, dimensions, issue_count } = credibility;

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBgColor = (score) => {
    if (score >= 80) return 'bg-green-50 border-green-200';
    if (score >= 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getBarColor = (score) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatDimensionName = (name) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <div className={`card ${getBgColor(total_score)}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="form-section-title mb-0 pb-0 border-0">Application Quality</h3>
          <p className="text-xs text-gray-500 mt-1">How complete and consistent is this application?</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${getScoreColor(total_score)}`}>
            {Math.round(total_score)}
          </span>
          <span className={`px-2 py-1 text-sm font-medium rounded ${getBgColor(total_score)} ${getScoreColor(total_score)}`}>
            {label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        {dimensions && Object.entries(dimensions).map(([name, score]) => (
          <div key={name} className="bg-white/50 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-gray-700 truncate">
                {formatDimensionName(name)}
              </span>
              <span className={`text-sm font-semibold ${getScoreColor(score)} flex-shrink-0`}>
                {score ? Math.round(score) : '—'}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${getBarColor(score)}`}
                style={{ width: `${score || 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {issue_count > 0 && total_score < 80 && (
        <div className="mt-3 p-2 bg-white/50 rounded-lg">
          <p className="text-sm text-gray-700">
            <span className="font-medium">{issue_count} flag{issue_count !== 1 ? 's' : ''}</span>
            <span className="text-gray-500"> — review recommended</span>
          </p>
        </div>
      )}
    </div>
  );
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
// Decision Badge Component
// ─────────────────────────────────────────────────────────────

function DecisionBadge({ decision }) {
  const config = {
    accept: { label: 'Accepted', class: 'bg-green-100 text-green-700 border-green-200' },
    decline: { label: 'Declined', class: 'bg-red-100 text-red-700 border-red-200' },
    refer: { label: 'Referred', class: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    pending: { label: 'Pending', class: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const { label, class: badgeClass } = config[decision] || config.pending;
  return <span className={`px-2 py-1 text-xs font-medium rounded border ${badgeClass}`}>{label}</span>;
}

// ─────────────────────────────────────────────────────────────
// Underwriting Decision Section
// ─────────────────────────────────────────────────────────────

function DecisionSection({ submission, submissionId }) {
  const [decisionReason, setDecisionReason] = useState(submission?.decision_reason || '');
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => queryClient.invalidateQueries(['submission', submissionId]),
  });

  const handleDecision = (decision) => {
    const payload = {
      decision_tag: decision,
      decision_reason: decisionReason || null,
    };
    if (decision === 'decline') {
      payload.submission_status = 'declined';
      payload.submission_outcome = 'declined';
      payload.outcome_reason = decisionReason || 'Declined by underwriter';
    } else if (decision === 'accept') {
      // Clear declined status if previously declined
      payload.submission_status = 'pending_decision';
      payload.submission_outcome = 'pending';
      payload.outcome_reason = null;
    } else if (decision === 'refer') {
      payload.submission_status = 'pending_decision';
      payload.submission_outcome = 'pending';
    }
    updateMutation.mutate(payload);
  };

  return (
    <div className={`card ${
      submission?.decision_tag === 'accept' ? 'bg-green-50 border-green-200' :
      submission?.decision_tag === 'decline' ? 'bg-red-50 border-red-200' :
      submission?.decision_tag === 'refer' ? 'bg-yellow-50 border-yellow-200' : ''
    }`}>
      <h3 className="form-section-title">Underwriting Decision</h3>

      {/* Show decision badge if already decided */}
      {submission?.decision_tag && submission.decision_tag !== 'pending' && (
        <div className="flex items-center gap-2 mb-4">
          <DecisionBadge decision={submission.decision_tag} />
          {submission?.decided_at && (
            <span className="text-sm text-gray-500">
              {new Date(submission.decided_at).toLocaleDateString()}
              {submission.decided_by && ` by ${submission.decided_by}`}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* AI Recommendation */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">AI Recommendation</h4>
          {submission?.ai_recommendation ? (
            <FormattedText text={submission.ai_recommendation} />
          ) : (
            <p className="text-gray-500 italic">No AI recommendation available</p>
          )}
          {/* Inline Guideline Citations */}
          {submission?.ai_guideline_citations && (
            <details className="mt-4 pt-3 border-t border-gray-200">
              <summary className="text-sm text-purple-600 cursor-pointer hover:text-purple-800">
                View Guideline Citations
              </summary>
              <div className="mt-2 text-sm">
                <FormattedText text={submission.ai_guideline_citations} />
              </div>
            </details>
          )}
        </div>

        {/* Your Decision */}
        <div className="bg-purple-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Your Decision</h4>
          <div className="space-y-4">
            <div>
              <label className="form-label">Notes</label>
              <textarea
                className="form-input h-20 resize-none bg-white"
                placeholder="Add notes about your decision..."
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button
                className={`btn flex-1 text-white ${
                  submission?.decision_tag === 'accept'
                    ? 'bg-green-700 ring-2 ring-green-400'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
                onClick={() => handleDecision('accept')}
                disabled={updateMutation.isPending}
              >
                Accept
              </button>
              <button
                className={`btn flex-1 text-white ${
                  submission?.decision_tag === 'refer'
                    ? 'bg-yellow-600 ring-2 ring-yellow-400'
                    : 'bg-yellow-500 hover:bg-yellow-600'
                }`}
                onClick={() => handleDecision('refer')}
                disabled={updateMutation.isPending}
              >
                Refer
              </button>
              <button
                className={`btn flex-1 text-white ${
                  submission?.decision_tag === 'decline'
                    ? 'bg-red-700 ring-2 ring-red-400'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
                onClick={() => handleDecision('decline')}
                disabled={updateMutation.isPending}
              >
                Decline
              </button>
            </div>
            {updateMutation.isPending && <p className="text-sm text-gray-500 mt-2">Saving...</p>}
            {updateMutation.isSuccess && <p className="text-sm text-green-600 mt-2">Decision saved</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cyber Exposures Section
// ─────────────────────────────────────────────────────────────

function CyberExposuresSection({ submission, submissionId }) {
  // Handle multiple data formats: array, JSON string, or markdown string
  let content = null;
  let exposures = [];

  if (submission?.cyber_exposures) {
    if (Array.isArray(submission.cyber_exposures)) {
      exposures = submission.cyber_exposures;
    } else if (typeof submission.cyber_exposures === 'string') {
      // Try parsing as JSON first
      try {
        const parsed = JSON.parse(submission.cyber_exposures);
        if (Array.isArray(parsed)) {
          exposures = parsed;
        } else {
          // JSON object - just display as markdown
          content = submission.cyber_exposures;
        }
      } catch {
        // Not JSON - treat as markdown string
        content = submission.cyber_exposures;
      }
    }
  }

  return (
    <div className="card h-full">
      <h3 className="form-section-title">Cyber Exposures</h3>
      {content ? (
        // Markdown string content - no max-height, flows naturally
        <FormattedText text={content} />
      ) : exposures.length > 0 ? (
        // Array of exposures
        <div className="space-y-2">
          {exposures.map((exposure, idx) => {
            if (typeof exposure === 'string') {
              return (
                <div key={idx} className="flex gap-2 text-gray-700 p-2 bg-purple-50 rounded">
                  <span className="text-purple-500">•</span>
                  <span>{exposure}</span>
                </div>
              );
            }
            return (
              <div key={idx} className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-purple-900">{exposure.name || exposure.type}</span>
                  {exposure.severity && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      exposure.severity === 'high' ? 'bg-red-100 text-red-700' :
                      exposure.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{exposure.severity}</span>
                  )}
                </div>
                {exposure.description && <p className="text-sm text-purple-700">{exposure.description}</p>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-500 italic">No cyber exposures identified</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Security Controls Section (with symbols)
// ─────────────────────────────────────────────────────────────

function SecurityControlsSection({ submission, submissionId }) {
  // Parse NIST controls - could be array or object with emoji statuses
  let controls = [];
  if (submission?.nist_controls) {
    if (Array.isArray(submission.nist_controls)) {
      controls = submission.nist_controls;
    } else if (typeof submission.nist_controls === 'object') {
      controls = Object.entries(submission.nist_controls).map(([key, value]) => ({
        name: key,
        ...(typeof value === 'object' ? value : { status: value }),
      }));
    }
  }

  // Normalize status - handle both text and emoji formats
  const normalizeStatus = (status) => {
    if (!status) return 'unknown';
    const s = String(status).toLowerCase().trim();
    // Handle emoji statuses
    if (s.includes('✅') || s.includes('✓') || s === 'implemented' || s === 'yes' || s === 'true') return 'implemented';
    if (s.includes('⚠') || s === 'partial' || s === 'warning') return 'partial';
    if (s.includes('❌') || s.includes('✗') || s === 'not_implemented' || s === 'no' || s === 'false') return 'not_implemented';
    if (s.includes('—') || s === 'not_asked' || s === 'n/a') return 'not_asked';
    return 'unknown';
  };

  const getStatusDisplay = (status) => {
    const normalized = normalizeStatus(status);
    const config = {
      implemented: { icon: '✓', color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: 'Implemented' },
      partial: { icon: '⚠', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'Partial' },
      not_implemented: { icon: '✗', color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Not Implemented' },
      not_asked: { icon: '—', color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200', label: 'Not Asked' },
      unknown: { icon: '?', color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200', label: 'Unknown' },
    };
    return config[normalized] || config.unknown;
  };

  return (
    <div className="card h-full">
      <h3 className="form-section-title">Security Controls</h3>
      {submission?.nist_controls_summary && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm max-h-48 overflow-y-auto">
          <FormattedText text={submission.nist_controls_summary} />
        </div>
      )}
      {controls.length > 0 ? (
        <div className="space-y-2">
          {controls.map((control, idx) => {
            const statusDisplay = getStatusDisplay(control.status);
            return (
              <div key={idx} className={`flex items-center justify-between p-2 rounded border ${statusDisplay.bg}`}>
                <div className="flex items-center gap-2">
                  <span className={`${statusDisplay.color} font-bold`} title={statusDisplay.label}>
                    {statusDisplay.icon}
                  </span>
                  <span className="font-medium text-sm capitalize">{control.name}</span>
                  {control.priority === 'high' && <span className="text-yellow-500" title="High Priority">★</span>}
                </div>
                <span className="text-xs text-gray-500">{statusDisplay.label}</span>
              </div>
            );
          })}
        </div>
      ) : !submission?.nist_controls_summary ? (
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-gray-500">No security controls data available</p>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Incumbent Carrier Section
// ─────────────────────────────────────────────────────────────

function IncumbentCarrierSection({ submission }) {
  const hasIncumbent = submission?.incumbent_carrier || submission?.expiring_premium || submission?.years_with_carrier;

  return (
    <div className="card">
      <h3 className="form-section-title">Incumbent Carrier</h3>
      {hasIncumbent ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-500">Carrier</div>
              <div className="font-medium text-gray-900">{submission?.incumbent_carrier || '—'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Expiring Premium</div>
              <div className="font-medium text-gray-900">{formatCurrency(submission?.expiring_premium)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Years with Carrier</div>
              <div className="font-medium text-gray-900">{submission?.years_with_carrier || '—'}</div>
            </div>
          </div>
          {submission?.expiring_limits && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-gray-500 mb-1">Expiring Limits</div>
              <div className="font-medium text-gray-900">{submission.expiring_limits}</div>
            </div>
          )}
        </>
      ) : (
        <p className="text-gray-500 italic">No incumbent carrier information available</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Control Card Component (legacy - kept for compatibility)
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
      <h3 className="form-section-title">Loss History</h3>
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between text-left">
        <p className="text-sm text-gray-600">
          {lossData?.count > 0 ? `${lossData.count} claims on file` : 'Click to view claims'}
        </p>
        <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
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

  // Comps summary stats - use all comps with rate data
  const compsWithRates = comparables?.filter(c => c.rate_per_mil) || [];
  const boundComps = comparables?.filter(c => c.is_bound) || [];
  const avgRate = compsWithRates.length > 0 ? compsWithRates.reduce((sum, c) => sum + c.rate_per_mil, 0) / compsWithRates.length : null;
  const rateRange = compsWithRates.length > 0 ? {
    min: Math.min(...compsWithRates.map(c => c.rate_per_mil)),
    max: Math.max(...compsWithRates.map(c => c.rate_per_mil)),
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
          {comparables?.length > 0 ? (
            <div className="space-y-3">
              {/* Summary stats on top */}
              {compsWithRates.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Avg Rate</span>
                    <span className="font-medium text-blue-700">${avgRate?.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mil</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Range</span>
                    <span className="font-medium text-blue-700">${rateRange?.min?.toLocaleString(undefined, { maximumFractionDigits: 0 })} - ${rateRange?.max?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              )}
              {/* Top 3 matches */}
              <div className="pt-3 border-t border-blue-200">
                <div className="text-xs text-gray-500 mb-2">Top 3 Matches</div>
                <div className="space-y-2">
                  {comparables.slice(0, 3).map((comp, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm">
                      <span className="text-gray-700 truncate flex-1 mr-2">{comp.applicant_name || comp.company_name || 'Unknown'}</span>
                      <span className="text-blue-700 font-medium flex-shrink-0">
                        {comp.rate_per_mil ? `$${comp.rate_per_mil.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mil` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No comparables found</p>
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
// Quick Metrics Row Component (4 cards: Revenue, Industry, Policy Period, App Quality)
// ─────────────────────────────────────────────────────────────

function QuickMetricsRow({ submission, credibility, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [qualityExpanded, setQualityExpanded] = useState(false);

  // Parse industry tags
  let industryTags = [];
  if (submission?.industry_tags) {
    if (Array.isArray(submission.industry_tags)) {
      industryTags = submission.industry_tags;
    } else if (typeof submission.industry_tags === 'string') {
      try { industryTags = JSON.parse(submission.industry_tags); } catch { industryTags = []; }
    }
  }

  const handleClick = () => setIsEditing(true);

  // Application Quality helpers
  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-green-100 text-green-700';
    if (score >= 60) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const getBarColor = (score) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatDimensionName = (name) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-4">
        {/* Revenue Card */}
        <div className="metric-card">
          <div className="metric-label">Revenue</div>
          {isEditing ? (
            <input
              type="text"
              className="form-input mt-1"
              defaultValue={submission?.annual_revenue?.toLocaleString() || ''}
              onBlur={(e) => {
                const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10);
                if (!isNaN(val) && val !== submission?.annual_revenue) {
                  onUpdate({ annual_revenue: val });
                }
              }}
              placeholder="e.g., 50000000"
            />
          ) : (
            <div
              className="metric-value text-base cursor-pointer hover:text-purple-600 transition-colors"
              onClick={handleClick}
            >
              {formatCompact(submission?.annual_revenue)}
            </div>
          )}
        </div>

        {/* Industry Card */}
        <div className="metric-card">
          <div className="metric-label">Industry</div>
          {isEditing ? (
            <div className="mt-1 space-y-1">
              {submission?.naics_primary_code && (
                <div className="text-sm">
                  <span className="text-gray-500">Primary:</span>{' '}
                  <span className="font-medium">{submission.naics_primary_code} - {submission.naics_primary_title}</span>
                </div>
              )}
              {submission?.naics_secondary_code && (
                <div className="text-sm">
                  <span className="text-gray-500">Secondary:</span>{' '}
                  <span className="font-medium">{submission.naics_secondary_code} - {submission.naics_secondary_title}</span>
                </div>
              )}
              {industryTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {industryTags.map((tag, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {!submission?.naics_primary_code && (
                <p className="text-sm text-gray-500 italic">No classification</p>
              )}
            </div>
          ) : (
            <div
              className="metric-value text-base leading-snug cursor-pointer hover:text-purple-600 transition-colors"
              onClick={handleClick}
            >
              {submission?.naics_primary_title || '—'}
            </div>
          )}
        </div>

        {/* Policy Period Card */}
        <div className="metric-card">
          <div className="metric-label">Policy Period</div>
          {isEditing ? (
            <div className="grid grid-cols-2 gap-2 mt-1">
              <input
                type="date"
                className="form-input text-sm"
                value={submission?.effective_date || ''}
                onChange={(e) => onUpdate({ effective_date: e.target.value })}
              />
              <input
                type="date"
                className="form-input text-sm"
                value={submission?.expiration_date || ''}
                onChange={(e) => onUpdate({ expiration_date: e.target.value })}
              />
            </div>
          ) : (
            <div
              className="metric-value text-base cursor-pointer hover:text-purple-600 transition-colors"
              onClick={handleClick}
            >
              {submission?.effective_date && submission?.expiration_date
                ? `${new Date(submission.effective_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(submission.expiration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}`
                : '—'}
            </div>
          )}
        </div>

        {/* Application Quality Card (click to expand) */}
        <div
          className={`metric-card cursor-pointer transition-colors ${qualityExpanded ? 'ring-2 ring-purple-300' : 'hover:bg-gray-50'}`}
          onClick={() => credibility?.has_score && setQualityExpanded(!qualityExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="metric-label">Application Quality</div>
            {credibility?.has_score && (
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${qualityExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
          {credibility?.has_score ? (
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-2xl font-bold ${getScoreColor(credibility.total_score)}`}>
                {Math.round(credibility.total_score)}
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${getScoreBg(credibility.total_score)}`}>
                {credibility.label}
              </span>
            </div>
          ) : (
            <div className="metric-value text-base text-gray-400">Pending</div>
          )}
        </div>

        {/* Done button spans all 4 columns when editing */}
        {isEditing && (
          <div className="col-span-4">
            <button
              onClick={() => setIsEditing(false)}
              className="w-full py-2 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded border border-purple-200 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Expanded Application Quality Details */}
      {qualityExpanded && credibility?.has_score && (
        <div className="card bg-gray-50 border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600">How complete and consistent is this application?</p>
            <button
              onClick={() => setQualityExpanded(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Collapse
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {credibility.dimensions && Object.entries(credibility.dimensions).map(([name, score]) => (
              <div key={name} className="bg-white rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {formatDimensionName(name)}
                  </span>
                  <span className={`text-sm font-semibold ${getScoreColor(score)} flex-shrink-0`}>
                    {score ? Math.round(score) : '—'}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getBarColor(score)}`}
                    style={{ width: `${score || 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {credibility.issue_count > 0 && credibility.total_score < 80 && (
            <div className="mt-3 p-2 bg-white rounded-lg border border-yellow-200">
              <p className="text-sm text-gray-700">
                <span className="font-medium text-yellow-700">{credibility.issue_count} flag{credibility.issue_count !== 1 ? 's' : ''}</span>
                <span className="text-gray-500"> — review recommended</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Analyze Page Component
// ─────────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  const { data: credibility } = useQuery({
    queryKey: ['credibility', submissionId],
    queryFn: () => getCredibility(submissionId).then(res => res.data),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => queryClient.invalidateQueries(['submission', submissionId]),
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Quick Metrics - Revenue, Industry, Policy Period, App Quality (click any to edit all) */}
      <QuickMetricsRow
        submission={submission}
        credibility={credibility}
        onUpdate={(data) => updateMutation.mutate(data)}
      />

      {/* Underwriting Decision - full width */}
      <DecisionSection submission={submission} submissionId={submissionId} />

      {/* Pricing Section (Calculated + Market Benchmark) */}
      <PricingSection submissionId={submissionId} submission={submission} />

      {/* Business Summary - Full width, larger box */}
      <EditableSection title="Business Summary" value={submission?.business_summary} fieldName="business_summary" submissionId={submissionId}>
        <div className="bg-gray-50 rounded-lg p-4 min-h-[120px] max-h-[300px] overflow-y-auto">
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{submission?.business_summary || 'No business summary available'}</p>
        </div>
      </EditableSection>

      {/* Risk Profile: Cyber Exposures + Security Controls side by side */}
      <div className="grid grid-cols-2 gap-6">
        <CyberExposuresSection submission={submission} submissionId={submissionId} />
        <SecurityControlsSection submission={submission} submissionId={submissionId} />
      </div>

      {/* Loss History */}
      <LossHistorySection submissionId={submissionId} />

      {/* Incumbent Carrier */}
      <IncumbentCarrierSection submission={submission} />
    </div>
  );
}
