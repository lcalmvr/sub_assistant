import { useQuery } from '@tanstack/react-query';
import { getTowerComparison } from '../api/client';

/**
 * Format currency for display
 */
function formatMoney(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format large numbers with K/M suffix
 */
function formatShort(value) {
  if (value == null) return '—';
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return formatMoney(value);
}

/**
 * Change indicator with arrow and percentage
 */
function ChangeIndicator({ change, changePct, inverse = false }) {
  if (change == null && changePct == null) return null;

  // For some metrics, lower is better (premium, retention)
  const isPositive = inverse ? change < 0 : change > 0;
  const isNegative = inverse ? change > 0 : change < 0;

  const color = isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-500';
  const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';

  return (
    <span className={`text-xs ${color} ml-1`}>
      {arrow} {changePct != null ? `${changePct > 0 ? '+' : ''}${changePct}%` : ''}
    </span>
  );
}

/**
 * Single comparison row
 */
function ComparisonRow({ label, expiring, proposed, change, changePct, inverse = false }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-gray-100 last:border-0">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-sm text-gray-700">{expiring}</div>
      <div className="text-sm text-gray-900 font-medium">
        {proposed}
        <ChangeIndicator change={change} changePct={changePct} inverse={inverse} />
      </div>
    </div>
  );
}

/**
 * TowerComparison - Side-by-side expiring vs proposed coverage comparison
 *
 * Shows for renewals with expiring tower data:
 * - Incumbent carrier info
 * - Limit, retention, premium comparison
 * - Rate per million comparison
 * - Coverage form comparison
 */
export default function TowerComparison({ submissionId }) {
  const { data: comparison, isLoading } = useQuery({
    queryKey: ['tower-comparison', submissionId],
    queryFn: () => getTowerComparison(submissionId).then(res => res.data),
    enabled: !!submissionId,
  });

  // Don't render if no expiring tower
  if (isLoading) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <div className="text-sm text-amber-600">Loading expiring coverage...</div>
      </div>
    );
  }

  if (!comparison?.has_expiring) {
    return null;
  }

  const { expiring, proposed, changes } = comparison;

  // Calculate rate per million for expiring
  const expiringRPM = expiring?.limit && expiring?.premium
    ? (expiring.premium / (expiring.limit / 1_000_000))
    : null;

  // Calculate rate per million for proposed
  const proposedRPM = proposed?.limit && proposed?.premium
    ? (proposed.premium / (proposed.limit / 1_000_000))
    : null;

  // RPM change
  const rpmChange = expiringRPM && proposedRPM ? proposedRPM - expiringRPM : null;
  const rpmChangePct = expiringRPM && proposedRPM
    ? Math.round((rpmChange / expiringRPM) * 100 * 10) / 10
    : null;

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-amber-800">
          Expiring Coverage Comparison
        </h3>
        {expiring?.carrier && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
            Incumbent: {expiring.carrier}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 gap-4 pb-2 border-b border-amber-200 mb-1">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Metric</div>
        <div className="text-xs font-medium text-amber-600 uppercase tracking-wide">Expiring</div>
        <div className="text-xs font-medium text-gray-900 uppercase tracking-wide">
          {proposed?.quote_name || 'Proposed'}
          {proposed?.is_bound && (
            <span className="ml-1 text-green-600">(Bound)</span>
          )}
        </div>
      </div>

      {/* Comparison rows */}
      <ComparisonRow
        label="Aggregate Limit"
        expiring={formatShort(expiring?.limit)}
        proposed={formatShort(proposed?.limit)}
        change={changes?.limit_change}
        changePct={changes?.limit_change_pct}
      />

      <ComparisonRow
        label="Retention"
        expiring={formatShort(expiring?.retention)}
        proposed={formatShort(proposed?.retention)}
        change={changes?.retention_change}
        inverse={true}
      />

      <ComparisonRow
        label="Annual Premium"
        expiring={formatMoney(expiring?.premium)}
        proposed={formatMoney(proposed?.premium)}
        change={changes?.premium_change}
        changePct={changes?.premium_change_pct}
        inverse={true}
      />

      <ComparisonRow
        label="Rate per $1M"
        expiring={expiringRPM ? formatMoney(expiringRPM) : '—'}
        proposed={proposedRPM ? formatMoney(proposedRPM) : '—'}
        change={rpmChange}
        changePct={rpmChangePct}
        inverse={true}
      />

      {(expiring?.policy_form || proposed?.policy_form) && (
        <ComparisonRow
          label="Policy Form"
          expiring={expiring?.policy_form?.replace('_', ' + ') || '—'}
          proposed={proposed?.policy_form?.replace('_', ' + ') || '—'}
        />
      )}

      {/* Expiration date */}
      {expiring?.expiration_date && (
        <div className="mt-3 pt-2 border-t border-amber-200">
          <span className="text-xs text-amber-600">
            Expiring: {new Date(expiring.expiration_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </span>
        </div>
      )}
    </div>
  );
}
