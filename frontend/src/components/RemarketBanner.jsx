import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { findPriorSubmissions, linkPriorSubmission, getRemarketStatus } from '../api/client';

/**
 * RemarketBanner - Shows when a submission matches a prior account
 *
 * Displays "We've seen this account before" with options to:
 * - View prior submission details
 * - Import data from prior submission
 * - Dismiss the banner
 */
export default function RemarketBanner({ submissionId }) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPrior, setSelectedPrior] = useState(null);
  const queryClient = useQueryClient();

  // Check remarket status
  const { data: status } = useQuery({
    queryKey: ['remarketStatus', submissionId],
    queryFn: () => getRemarketStatus(submissionId).then(res => res.data),
    staleTime: 30000,
  });

  // Fetch prior submissions if detected
  const { data: priorData, isLoading } = useQuery({
    queryKey: ['priorSubmissions', submissionId],
    queryFn: () => findPriorSubmissions(submissionId).then(res => res.data),
    enabled: status?.status === 'detected' && !isDismissed,
    staleTime: 60000,
  });

  // Link/import mutation
  const linkMutation = useMutation({
    mutationFn: (priorSubmissionId) => linkPriorSubmission(submissionId, priorSubmissionId),
    onSuccess: () => {
      queryClient.invalidateQueries(['remarketStatus', submissionId]);
      queryClient.invalidateQueries(['submission', submissionId]);
      setShowDetails(false);
    },
  });

  // Don't show if dismissed, already imported, or no matches
  if (isDismissed) return null;
  if (!status || status.status === 'none') return null;
  if (status.status === 'imported') return null;
  if (status.status === 'linked') return null;

  // Show compact "imported" confirmation if just imported
  if (linkMutation.isSuccess) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
        <div className="flex items-center gap-2 text-green-800">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">Prior submission data imported</span>
          <span className="text-green-600 text-sm">
            ({linkMutation.data?.data?.values_imported || 0} fields imported)
          </span>
        </div>
      </div>
    );
  }

  const priorSubmissions = priorData?.prior_submissions || [];
  const bestMatch = priorSubmissions[0];

  if (!bestMatch) return null;

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown date';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Format premium
  const formatPremium = (premium) => {
    if (!premium) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(premium);
  };

  // Get outcome badge color
  const getOutcomeBadge = (outcome) => {
    const colors = {
      pending: 'bg-gray-100 text-gray-700',
      quoted: 'bg-blue-100 text-blue-700',
      declined: 'bg-red-100 text-red-700',
      lost: 'bg-orange-100 text-orange-700',
      bound: 'bg-green-100 text-green-700',
    };
    return colors[outcome] || colors.pending;
  };

  // Match type labels
  const matchTypeLabel = {
    fein: 'FEIN match',
    website: 'Website match',
    name_exact: 'Exact name match',
    name_fuzzy: 'Similar name',
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg mb-4 overflow-hidden">
      {/* Main banner */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            {/* Content */}
            <div>
              <h3 className="font-medium text-amber-900">
                We've seen this account before
              </h3>
              <p className="text-sm text-amber-700 mt-0.5">
                {bestMatch.insured_name} was submitted in {formatDate(bestMatch.submission_date)}
                {bestMatch.quoted_premium && (
                  <span> · Quoted {formatPremium(bestMatch.quoted_premium)}</span>
                )}
                <span className="text-amber-600"> · {matchTypeLabel[bestMatch.match_type] || bestMatch.match_type}</span>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-amber-700 hover:text-amber-900 font-medium"
            >
              {showDetails ? 'Hide' : 'View'}
            </button>
            <button
              onClick={() => {
                setSelectedPrior(bestMatch.submission_id);
                linkMutation.mutate(bestMatch.submission_id);
              }}
              disabled={linkMutation.isPending}
              className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
            >
              {linkMutation.isPending ? 'Importing...' : 'Import Data'}
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 text-amber-400 hover:text-amber-600"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {showDetails && (
        <div className="border-t border-amber-200 bg-amber-50/50 px-4 py-3">
          <div className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-2">
            Prior Submissions ({priorSubmissions.length})
          </div>
          <div className="space-y-2">
            {priorSubmissions.map((prior) => (
              <div
                key={prior.submission_id}
                className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-amber-100"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {prior.insured_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(prior.submission_date)}
                      {prior.insured_website && (
                        <span> · {prior.insured_website}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {prior.quoted_premium && (
                    <span className="text-sm font-medium text-gray-700">
                      {formatPremium(prior.quoted_premium)}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getOutcomeBadge(prior.submission_outcome)}`}>
                    {prior.submission_outcome}
                  </span>
                  <span className="text-xs text-gray-400">
                    {prior.match_confidence}%
                  </span>
                  <button
                    onClick={() => {
                      setSelectedPrior(prior.submission_id);
                      linkMutation.mutate(prior.submission_id);
                    }}
                    disabled={linkMutation.isPending && selectedPrior === prior.submission_id}
                    className="text-xs px-2 py-1 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded"
                  >
                    {linkMutation.isPending && selectedPrior === prior.submission_id ? '...' : 'Import'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-600 mt-2">
            Importing will copy extracted values and UW notes from the prior submission. Values will be marked for confirmation.
          </p>
        </div>
      )}
    </div>
  );
}
