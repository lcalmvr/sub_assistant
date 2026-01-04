import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAiCorrections, acceptAiCorrection, rejectAiCorrection } from '../api/client';

function formatFieldName(fieldName) {
  // Convert "generalInformation.applicantName" to "Applicant Name"
  const parts = fieldName.split('.');
  const field = parts[parts.length - 1];
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function formatValue(value) {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function CorrectionCard({ correction, onAccept, onReject, isProcessing }) {
  const isPending = correction.status === 'pending';

  return (
    <div className={`border rounded-lg p-4 ${isPending ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-900">
              {formatFieldName(correction.field_name)}
            </span>
            {isPending && (
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                Needs Review
              </span>
            )}
            {correction.status === 'accepted' && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                Accepted
              </span>
            )}
            {correction.status === 'rejected' && (
              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                Rejected
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-2">
            <div>
              <span className="text-xs text-gray-500 block mb-1">Original (OCR)</span>
              <span className="text-sm font-mono bg-white px-2 py-1 rounded border border-gray-200 block">
                {formatValue(correction.original_value)}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block mb-1">AI Corrected</span>
              <span className="text-sm font-mono bg-white px-2 py-1 rounded border border-purple-200 block">
                {formatValue(correction.corrected_value)}
              </span>
            </div>
          </div>

          {correction.correction_reason && (
            <p className="text-xs text-gray-600 italic">
              Reason: {correction.correction_reason}
            </p>
          )}

          {correction.source_text && (
            <p className="text-xs text-gray-500 mt-1 truncate" title={correction.source_text}>
              Source: "{correction.source_text}"
            </p>
          )}
        </div>

        {isPending && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => onAccept(correction.id)}
              disabled={isProcessing}
              className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => onReject(correction.id)}
              disabled={isProcessing}
              className="px-3 py-1.5 text-sm font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiCorrectionsPanel({ submissionId, className = '' }) {
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-corrections', submissionId],
    queryFn: () => getAiCorrections(submissionId).then(res => res.data),
    enabled: !!submissionId,
  });

  const acceptMutation = useMutation({
    mutationFn: acceptAiCorrection,
    onMutate: (id) => setProcessingId(id),
    onSettled: () => setProcessingId(null),
    onSuccess: () => {
      queryClient.invalidateQueries(['ai-corrections', submissionId]);
      queryClient.invalidateQueries(['extractions', submissionId]);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectAiCorrection,
    onMutate: (id) => setProcessingId(id),
    onSettled: () => setProcessingId(null),
    onSuccess: () => {
      queryClient.invalidateQueries(['ai-corrections', submissionId]);
      queryClient.invalidateQueries(['extractions', submissionId]);
    },
  });

  if (isLoading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-gray-500 text-sm">Loading corrections...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-red-500 text-sm">Failed to load corrections</div>
      </div>
    );
  }

  const corrections = data?.corrections || [];
  const pendingCount = data?.pending_count || 0;

  if (corrections.length === 0) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-gray-500 text-sm">No AI corrections to review</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">AI Corrections Review</h3>
          {pendingCount > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
              {pendingCount} pending
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Review corrections where AI adjusted OCR values
        </p>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: '400px' }}>
        {corrections.map((correction) => (
          <CorrectionCard
            key={correction.id}
            correction={correction}
            onAccept={(id) => acceptMutation.mutate(id)}
            onReject={(id) => rejectMutation.mutate(id)}
            isProcessing={processingId === correction.id}
          />
        ))}
      </div>
    </div>
  );
}

// Compact badge version for header display
export function AiCorrectionsBadge({ submissionId, onClick }) {
  const { data } = useQuery({
    queryKey: ['ai-corrections', submissionId],
    queryFn: () => getAiCorrections(submissionId).then(res => res.data),
    enabled: !!submissionId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const pendingCount = data?.pending_count || 0;

  if (pendingCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full hover:bg-amber-200 transition-colors"
      title={`${pendingCount} AI corrections need review`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      {pendingCount} correction{pendingCount !== 1 ? 's' : ''}
    </button>
  );
}
