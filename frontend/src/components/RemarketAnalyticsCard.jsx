import { useQuery } from '@tanstack/react-query';
import { getRemarketAnalytics } from '../api/client';

/**
 * RemarketAnalyticsCard - Shows remarket performance metrics
 *
 * Displays:
 * - Win rate comparison (remarket vs new business)
 * - Time-to-remarket metrics
 * - Return reason breakdown
 * - Recent remarkets list
 */
export default function RemarketAnalyticsCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['remarketAnalytics'],
    queryFn: () => getRemarketAnalytics().then(res => res.data),
    staleTime: 60000, // Cache for 1 minute
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <p className="text-red-600 text-sm">Failed to load analytics</p>
      </div>
    );
  }

  const { summary, performance, time_stats, return_reasons, recent_remarkets } = data || {};

  // Get performance data
  const newBusiness = performance?.find(p => p.submission_type === 'new_business') || {};
  const remarket = performance?.find(p => p.submission_type === 'remarket') || {};

  // Format currency
  const formatCurrency = (val) => {
    if (!val) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">Remarket Analytics</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Performance comparison: remarkets vs new business
        </p>
      </div>

      {/* Summary Stats */}
      <div className="px-6 py-4 grid grid-cols-4 gap-4 border-b">
        <div>
          <div className="text-2xl font-bold text-gray-900">
            {summary?.total_remarkets || 0}
          </div>
          <div className="text-xs text-gray-500">Total Remarkets</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">
            {summary?.remarket_pct || 0}%
          </div>
          <div className="text-xs text-gray-500">of Submissions</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600">
            {summary?.remarkets_bound || 0}
          </div>
          <div className="text-xs text-gray-500">Remarkets Bound</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600">
            {time_stats?.avg_months_between || '-'}
          </div>
          <div className="text-xs text-gray-500">Avg Months Between</div>
        </div>
      </div>

      {/* Win Rate Comparison */}
      <div className="px-6 py-4 border-b">
        <div className="text-sm font-medium text-gray-700 mb-3">Win Rate Comparison</div>
        <div className="grid grid-cols-2 gap-4">
          {/* New Business */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">New Business</span>
              <span className="text-lg font-bold text-gray-900">
                {newBusiness.win_rate_pct || 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${newBusiness.win_rate_pct || 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>{newBusiness.bound_count || 0} bound</span>
              <span>{newBusiness.total_submissions || 0} total</span>
            </div>
          </div>

          {/* Remarket */}
          <div className="bg-amber-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-amber-700">Remarket</span>
              <span className="text-lg font-bold text-amber-900">
                {remarket.win_rate_pct || 0}%
              </span>
            </div>
            <div className="w-full bg-amber-200 rounded-full h-2">
              <div
                className="bg-amber-600 h-2 rounded-full"
                style={{ width: `${remarket.win_rate_pct || 0}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-amber-600">
              <span>{remarket.bound_count || 0} bound</span>
              <span>{remarket.total_submissions || 0} total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Return Reasons */}
      {return_reasons?.length > 0 && (
        <div className="px-6 py-4 border-b">
          <div className="text-sm font-medium text-gray-700 mb-3">Why Accounts Return</div>
          <div className="space-y-2">
            {return_reasons.map((reason, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="capitalize text-gray-700">
                    {reason.return_category.replace('_', ' ')}
                  </span>
                  <span className="text-gray-400">({reason.total_returns})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-medium">
                    {reason.conversion_rate_pct}% converted
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Remarkets */}
      {recent_remarkets?.length > 0 && (
        <div className="px-6 py-4">
          <div className="text-sm font-medium text-gray-700 mb-3">Recent Remarkets</div>
          <div className="space-y-2">
            {recent_remarkets.slice(0, 5).map((rm, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1">
                <div>
                  <span className="font-medium text-gray-900">{rm.applicant_name}</span>
                  {rm.days_between && (
                    <span className="text-gray-400 ml-2">
                      ({rm.days_between} days since prior)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {rm.remarket_quoted && (
                    <span className="text-gray-600">{formatCurrency(rm.remarket_quoted)}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    rm.submission_outcome === 'bound' ? 'bg-green-100 text-green-700' :
                    rm.submission_outcome === 'pending' ? 'bg-gray-100 text-gray-600' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {rm.submission_outcome}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
