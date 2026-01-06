import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getRenewalComparison } from '../api/client';

/**
 * RenewalContextBadge - Shows key renewal changes as a compact badge
 *
 * Display modes:
 * - 'compact': Small badge with key metrics (for header)
 * - 'inline': Inline text for embedding in other components
 */
export default function RenewalContextBadge({ submissionId, mode = 'compact', className = '' }) {
  const { data, isLoading } = useQuery({
    queryKey: ['renewal-comparison', submissionId],
    queryFn: () => getRenewalComparison(submissionId).then(res => res.data),
    enabled: !!submissionId,
    staleTime: 60000, // Cache for 1 minute
  });

  if (isLoading || !data?.is_renewal) {
    return null;
  }

  const { changes, loss_history, prior } = data;

  // Build change indicators
  const indicators = [];

  if (changes.revenue) {
    const pct = changes.revenue.pct_change;
    indicators.push({
      label: 'Revenue',
      value: `${pct > 0 ? '+' : ''}${pct}%`,
      color: Math.abs(pct) > 25 ? 'text-amber-600' : 'text-gray-600',
    });
  }

  if (loss_history?.count > 0) {
    indicators.push({
      label: 'Claims',
      value: loss_history.count.toString(),
      color: 'text-red-600',
    });
  }

  if (changes.premium) {
    const pct = changes.premium.pct_change;
    indicators.push({
      label: 'Rate',
      value: `${pct > 0 ? '+' : ''}${pct}%`,
      color: pct > 10 ? 'text-green-600' : pct < -10 ? 'text-red-600' : 'text-gray-600',
    });
  }

  if (mode === 'inline') {
    if (indicators.length === 0) return null;
    return (
      <span className={`text-xs text-gray-500 ${className}`}>
        {indicators.map((ind, i) => (
          <span key={ind.label}>
            {i > 0 && ' · '}
            <span className={ind.color}>{ind.label} {ind.value}</span>
          </span>
        ))}
      </span>
    );
  }

  // Compact mode - badge with link
  return (
    <Link
      to={`/submissions/${submissionId}/renewal`}
      className={`inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors ${className}`}
    >
      <span className="text-xs font-medium text-blue-700">Renewal</span>
      {indicators.length > 0 && (
        <span className="flex items-center gap-1.5">
          {indicators.slice(0, 3).map((ind, i) => (
            <span key={ind.label} className={`text-xs font-medium ${ind.color}`}>
              {ind.value}
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

/**
 * Hook to get renewal context data for use in other components
 */
export function useRenewalContext(submissionId) {
  const { data, isLoading } = useQuery({
    queryKey: ['renewal-comparison', submissionId],
    queryFn: () => getRenewalComparison(submissionId).then(res => res.data),
    enabled: !!submissionId,
    staleTime: 60000,
  });

  return {
    isRenewal: data?.is_renewal || false,
    isLoading,
    prior: data?.prior,
    changes: data?.changes || {},
    lossHistory: data?.loss_history,
    renewalChain: data?.renewal_chain || [],
  };
}
