import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubmission, updateSubmission } from '../api/client';

// Decision badge component
function DecisionBadge({ decision }) {
  const config = {
    accept: { label: 'Accept', class: 'badge-quoted' },
    decline: { label: 'Decline', class: 'badge-declined' },
    refer: { label: 'Refer', class: 'badge-renewal' },
    pending: { label: 'Pending Review', class: 'badge-pending' },
  };

  const { label, class: badgeClass } = config[decision] || config.pending;
  return <span className={`badge ${badgeClass}`}>{label}</span>;
}

// Parse markdown-like text into formatted sections
function FormattedText({ text }) {
  if (!text || typeof text !== 'string') return <p className="text-gray-500 italic">No content available</p>;

  // Split by headers and format
  const lines = text.split('\n');

  return (
    <div className="space-y-3">
      {lines.map((line, idx) => {
        if (line.startsWith('## ')) {
          return (
            <h4 key={idx} className="font-semibold text-gray-900 mt-4">
              {line.replace('## ', '')}
            </h4>
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
            <div key={idx} className="flex gap-2 text-gray-700">
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

export default function ReviewPage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();
  const [decisionReason, setDecisionReason] = useState('');
  const [hasInitialized, setHasInitialized] = useState(false);

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  // Initialize decision reason from existing data
  if (submission?.decision_reason && !hasInitialized) {
    setDecisionReason(submission.decision_reason);
    setHasInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['submission', submissionId]);
    },
  });

  const handleDecision = (decision) => {
    updateMutation.mutate({
      decision_tag: decision,
      decision_reason: decisionReason || null,
    });
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  // Extract recommendation decision from AI text
  const aiDecision = submission?.ai_recommendation?.includes('**Decision**: Accept')
    ? 'accept'
    : submission?.ai_recommendation?.includes('**Decision**: Decline')
    ? 'decline'
    : submission?.ai_recommendation?.includes('**Decision**: Refer')
    ? 'refer'
    : null;

  return (
    <div className="space-y-6">
      {/* Decision Status Banner */}
      <div className={`card ${
        submission?.decision_tag === 'accept' ? 'bg-green-50 border-green-200' :
        submission?.decision_tag === 'decline' ? 'bg-red-50 border-red-200' :
        submission?.decision_tag === 'refer' ? 'bg-yellow-50 border-yellow-200' :
        ''
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900">Underwriting Decision</h3>
            <DecisionBadge decision={submission?.decision_tag} />
          </div>
          {submission?.decided_at && (
            <span className="text-sm text-gray-500">
              Decided {new Date(submission.decided_at).toLocaleDateString()}
              {submission.decided_by && ` by ${submission.decided_by}`}
            </span>
          )}
        </div>
        {submission?.decision_reason && (
          <p className="mt-3 text-gray-700">{submission.decision_reason}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* AI Recommendation */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="form-section-title mb-0 pb-0 border-0">AI Recommendation</h3>
            {aiDecision && <DecisionBadge decision={aiDecision} />}
          </div>
          <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
            <FormattedText text={submission?.ai_recommendation} />
          </div>
        </div>

        {/* Make Decision */}
        <div className="card">
          <h3 className="form-section-title">Make Decision</h3>

          <div className="space-y-4">
            <div>
              <label className="form-label">Decision Reason (Optional)</label>
              <textarea
                className="form-input h-24 resize-none"
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
                ✓ Accept
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
                → Refer
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
                ✕ Decline
              </button>
            </div>

            {updateMutation.isPending && (
              <p className="text-sm text-gray-500">Saving decision...</p>
            )}
            {updateMutation.isSuccess && (
              <p className="text-sm text-green-600">Decision saved successfully</p>
            )}
            {updateMutation.isError && (
              <p className="text-sm text-red-600">Error saving decision. Please try again.</p>
            )}
          </div>
        </div>
      </div>

      {/* Guideline Citations */}
      {submission?.ai_guideline_citations && (
        <div className="card">
          <h3 className="form-section-title">Guideline Citations</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <FormattedText text={submission.ai_guideline_citations} />
          </div>
        </div>
      )}

      {/* Quick Facts */}
      <div className="card">
        <h3 className="form-section-title">Quick Facts</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="metric-card">
            <div className="metric-label">Applicant</div>
            <div className="text-lg font-semibold text-gray-900">{submission?.applicant_name}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Industry</div>
            <div className="text-lg font-semibold text-gray-900 truncate">
              {submission?.naics_primary_title || '—'}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Revenue</div>
            <div className="text-lg font-semibold text-gray-900">
              {submission?.annual_revenue
                ? `$${(submission.annual_revenue / 1_000_000).toFixed(0)}M`
                : '—'}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Status</div>
            <div className="text-lg font-semibold text-gray-900">
              {submission?.status?.replace(/_/g, ' ') || '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
