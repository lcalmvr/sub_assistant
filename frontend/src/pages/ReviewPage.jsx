import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubmission, updateSubmission, getCredibility, getConflicts, resolveConflict, getSubmissionDocuments, getExtractions } from '../api/client';
import DocumentViewer from '../components/review/DocumentViewer';
import ExtractionPanel from '../components/review/ExtractionPanel';

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

// Credibility score display component
function CredibilityCard({ credibility }) {
  if (!credibility?.has_score) {
    return (
      <div className="card bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Application Credibility</h3>
          <span className="text-sm text-gray-500">Not calculated</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Credibility score will be calculated when the application is processed.
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

  return (
    <div className={`card ${getBgColor(total_score)}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Application Credibility</h3>
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${getScoreColor(total_score)}`}>
            {Math.round(total_score)}
          </span>
          <span className={`px-2 py-1 text-sm font-medium rounded ${getBgColor(total_score)} ${getScoreColor(total_score)}`}>
            {label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {dimensions && Object.entries(dimensions).map(([name, score]) => (
          <div key={name} className="bg-white/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700 capitalize">{name}</span>
              <span className={`text-sm font-semibold ${getScoreColor(score)}`}>
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

      {issue_count > 0 && (
        <p className="text-sm text-gray-600 mt-3">
          {issue_count} issue{issue_count !== 1 ? 's' : ''} detected
        </p>
      )}
    </div>
  );
}

// Conflict list component
function ConflictsList({ conflicts, submissionId }) {
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: ({ conflictId, status }) => resolveConflict(submissionId, conflictId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conflicts', submissionId] });
    },
  });

  if (!conflicts || conflicts.pending_count === 0) {
    return null;
  }

  const priorityColors = {
    high: 'border-l-red-500 bg-red-50',
    medium: 'border-l-yellow-500 bg-yellow-50',
    low: 'border-l-blue-500 bg-blue-50',
  };

  const priorityBadge = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
  };

  const typeLabels = {
    VALUE_MISMATCH: 'Value Mismatch',
    LOW_CONFIDENCE: 'Low Confidence',
    MISSING_REQUIRED: 'Missing Required',
    CROSS_FIELD: 'Cross-Field Conflict',
    APPLICATION_CONTRADICTION: 'Contradiction',
    VERIFICATION_REQUIRED: 'Needs Verification',
    DUPLICATE_SUBMISSION: 'Duplicate',
    OUTLIER_VALUE: 'Outlier Value',
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="form-section-title mb-0 pb-0 border-0">Conflicts Requiring Review</h3>
        <div className="flex items-center gap-2">
          {conflicts.high_priority_count > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
              {conflicts.high_priority_count} high priority
            </span>
          )}
          <span className="text-sm text-gray-500">
            {conflicts.pending_count} pending
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {conflicts.pending.map((conflict) => (
          <div
            key={conflict.id}
            className={`border-l-4 rounded-lg p-4 ${priorityColors[conflict.priority]}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityBadge[conflict.priority]}`}>
                    {conflict.priority}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {typeLabels[conflict.type] || conflict.type}
                  </span>
                  {conflict.field && (
                    <span className="text-sm text-gray-500">
                      — {conflict.field}
                    </span>
                  )}
                </div>
                {conflict.details?.message && (
                  <p className="text-sm text-gray-700">{conflict.details.message}</p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => resolveMutation.mutate({ conflictId: conflict.id, status: 'approved' })}
                  disabled={resolveMutation.isPending}
                  className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => resolveMutation.mutate({ conflictId: conflict.id, status: 'deferred' })}
                  disabled={resolveMutation.isPending}
                  className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                >
                  Defer
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Document selector for the split view
function DocumentSelector({ documents, selectedId, onSelect }) {
  if (!documents || documents.count === 0) {
    return (
      <div className="text-sm text-gray-500 p-4">
        No documents available
      </div>
    );
  }

  const typeIcons = {
    'Application Form': '📋',
    'Loss Runs': '📊',
    'Financial Statement': '💰',
    'Email': '📧',
    'Other': '📄',
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 border-b">
      {documents.documents.map((doc) => (
        <button
          key={doc.id}
          onClick={() => onSelect(doc)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            selectedId === doc.id
              ? 'bg-purple-100 text-purple-700 border border-purple-300'
              : 'bg-white hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <span>{typeIcons[doc.type] || typeIcons.Other}</span>
          <span className="font-medium">{doc.filename}</span>
          {doc.is_priority && (
            <span className="px-1 py-0.5 text-xs bg-purple-200 text-purple-700 rounded">Primary</span>
          )}
        </button>
      ))}
    </div>
  );
}

// Parse markdown-like text into formatted sections
function FormattedText({ text }) {
  if (!text || typeof text !== 'string') return <p className="text-gray-500 italic">No content available</p>;

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
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [highlightPage, setHighlightPage] = useState(null);
  const [viewMode, setViewMode] = useState('split'); // 'split', 'documents', 'extractions'

  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  const { data: credibility } = useQuery({
    queryKey: ['credibility', submissionId],
    queryFn: () => getCredibility(submissionId).then(res => res.data),
  });

  const { data: conflicts } = useQuery({
    queryKey: ['conflicts', submissionId],
    queryFn: () => getConflicts(submissionId).then(res => res.data),
  });

  const { data: documents } = useQuery({
    queryKey: ['documents', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(res => res.data),
  });

  const { data: extractions, isLoading: extractionsLoading } = useQuery({
    queryKey: ['extractions', submissionId],
    queryFn: () => getExtractions(submissionId).then(res => res.data),
  });

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
    const payload = {
      decision_tag: decision,
      decision_reason: decisionReason || null,
    };

    if (decision === 'decline') {
      payload.submission_status = 'declined';
      payload.submission_outcome = 'declined';
      payload.outcome_reason = decisionReason || 'Declined by underwriter';
    }

    updateMutation.mutate(payload);
  };

  const handleShowSource = (pageNumber) => {
    setHighlightPage(pageNumber);
    // Auto-select primary document if none selected
    if (!selectedDocument && documents?.documents?.length > 0) {
      const primary = documents.documents.find(d => d.is_priority) || documents.documents[0];
      setSelectedDocument(primary);
    }
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  const aiDecision = submission?.ai_recommendation?.includes('**Decision**: Accept')
    ? 'accept'
    : submission?.ai_recommendation?.includes('**Decision**: Decline')
    ? 'decline'
    : submission?.ai_recommendation?.includes('**Decision**: Refer')
    ? 'refer'
    : null;

  const hasExtractions = extractions?.sections && Object.keys(extractions.sections).length > 0;

  return (
    <div className="space-y-6">
      {/* Top section: Credibility and Conflicts */}
      <div className="grid grid-cols-2 gap-6">
        <CredibilityCard credibility={credibility} />
        <ConflictsList conflicts={conflicts} submissionId={submissionId} />
      </div>

      {/* Document & Extraction Split View */}
      {(hasExtractions || documents?.count > 0) && (
        <div className="card p-0 overflow-hidden">
          {/* View mode toggle */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
            <h3 className="font-semibold text-gray-900">Source Verification</h3>
            <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-1">
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 text-sm rounded ${
                  viewMode === 'split' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Split
              </button>
              <button
                onClick={() => setViewMode('documents')}
                className={`px-3 py-1 text-sm rounded ${
                  viewMode === 'documents' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Documents
              </button>
              <button
                onClick={() => setViewMode('extractions')}
                className={`px-3 py-1 text-sm rounded ${
                  viewMode === 'extractions' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Extractions
              </button>
            </div>
          </div>

          <div className={`grid ${viewMode === 'split' ? 'grid-cols-2' : 'grid-cols-1'} divide-x`} style={{ height: '500px' }}>
            {/* Document Viewer */}
            {(viewMode === 'split' || viewMode === 'documents') && (
              <div className="flex flex-col h-full">
                <DocumentSelector
                  documents={documents}
                  selectedId={selectedDocument?.id}
                  onSelect={setSelectedDocument}
                />
                {selectedDocument ? (
                  selectedDocument.url ? (
                    // PDF viewer with iframe when URL is available
                    <div className="flex-1 flex flex-col bg-gray-100">
                      <div className="flex items-center justify-between px-3 py-2 bg-white border-b">
                        <span className="text-sm font-medium text-gray-700">
                          {selectedDocument.filename}
                        </span>
                        <div className="flex items-center gap-2">
                          {highlightPage && (
                            <span className="text-xs text-purple-600">
                              Page {highlightPage}
                            </span>
                          )}
                          <a
                            href={selectedDocument.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                          >
                            Open in new tab
                          </a>
                        </div>
                      </div>
                      <iframe
                        src={`${selectedDocument.url}${highlightPage ? `#page=${highlightPage}` : ''}`}
                        className="flex-1 w-full border-0"
                        title={selectedDocument.filename}
                      />
                    </div>
                  ) : (
                    // Placeholder when no URL available
                    <div className="flex-1 flex items-center justify-center bg-gray-100 p-8">
                      <div className="text-center text-gray-500">
                        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="font-medium">{selectedDocument.filename}</p>
                        <p className="text-sm mt-2">
                          {selectedDocument.page_count} pages · {selectedDocument.type || 'Document'}
                        </p>
                        {highlightPage && (
                          <p className="text-sm mt-2 text-purple-600">
                            Jump to page {highlightPage}
                          </p>
                        )}
                        <p className="text-xs mt-4 text-gray-400">
                          Document not uploaded to storage
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-gray-100">
                    <p className="text-gray-500">Select a document to view</p>
                  </div>
                )}
              </div>
            )}

            {/* Extraction Panel */}
            {(viewMode === 'split' || viewMode === 'extractions') && (
              <ExtractionPanel
                extractions={extractions?.sections}
                isLoading={extractionsLoading}
                onShowSource={handleShowSource}
                className="h-full"
              />
            )}
          </div>
        </div>
      )}

      {/* Decision Section */}
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
