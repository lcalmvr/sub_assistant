import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRenewalComparison } from '../api/client';

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

// Format compact currency
function formatCompact(value) {
  if (!value && value !== 0) return '—';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return formatCurrency(value);
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year.slice(2)}`;
  }
  return dateStr;
}

// Change indicator badge
function ChangeBadge({ change, suffix = '' }) {
  if (!change && change !== 0) return null;
  const isPositive = change > 0;
  const isNegative = change < 0;
  return (
    <span className={`text-xs font-medium ${
      isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-500'
    }`}>
      {isPositive ? '+' : ''}{typeof change === 'number' && Math.abs(change) >= 1000
        ? formatCompact(change)
        : change.toLocaleString()}{suffix}
    </span>
  );
}

// Comparison row component
function CompareRow({ label, prior, current, change, formatFn = (v) => v }) {
  return (
    <div className="flex items-center py-2 border-b border-gray-100 last:border-0">
      <div className="w-32 text-sm text-gray-500">{label}</div>
      <div className="w-32 text-sm text-gray-700">{formatFn(prior)}</div>
      <div className="w-32 text-sm font-medium text-gray-900">{formatFn(current)}</div>
      <div className="flex-1">
        {change && <ChangeBadge change={change.pct_change} suffix="%" />}
      </div>
    </div>
  );
}

export default function RenewalPage() {
  const { submissionId } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['renewal-comparison', submissionId],
    queryFn: () => getRenewalComparison(submissionId).then(res => res.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load renewal comparison</p>
      </div>
    );
  }

  if (!data?.is_renewal) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-600">This is not a renewal submission.</p>
        <p className="text-sm text-gray-500 mt-2">
          Renewal comparison is only available for submissions linked to a prior policy.
        </p>
      </div>
    );
  }

  const { prior, current, changes, loss_history, renewal_chain } = data;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Renewal Summary</h1>
          <p className="text-sm text-gray-500 mt-1">
            Comparing to policy period {formatDate(prior?.effective_date)} - {formatDate(prior?.expiration_date)}
          </p>
        </div>
        {prior?.id && (
          <Link
            to={`/submissions/${prior.id}/policy`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            View Expiring Policy
          </Link>
        )}
      </div>

      {/* Key Changes Alert */}
      {Object.keys(changes).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-amber-800 mb-2">Key Changes from Prior Year</h3>
          <div className="flex flex-wrap gap-3">
            {changes.revenue && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-amber-200">
                <span className="text-xs text-gray-500">Revenue</span>
                <ChangeBadge change={changes.revenue.pct_change} suffix="%" />
              </div>
            )}
            {changes.employees && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-amber-200">
                <span className="text-xs text-gray-500">Employees</span>
                <ChangeBadge change={changes.employees.pct_change} suffix="%" />
              </div>
            )}
            {changes.premium && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-amber-200">
                <span className="text-xs text-gray-500">Premium</span>
                <ChangeBadge change={changes.premium.pct_change} suffix="%" />
              </div>
            )}
            {changes.limit && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded border border-amber-200">
                <span className="text-xs text-gray-500">Limit</span>
                <span className="text-xs font-medium text-gray-700">
                  {formatCompact(changes.limit.old)} → {formatCompact(changes.limit.new)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Left Column: Prior Year Summary */}
        <div className="space-y-6">
          {/* Expiring Policy Card */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-900">Expiring Policy</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Policy Period</span>
                <span className="text-sm font-medium">
                  {formatDate(prior?.effective_date)} - {formatDate(prior?.expiration_date)}
                </span>
              </div>
              {prior?.tower && (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Bound Premium</span>
                    <span className="text-sm font-medium">{formatCurrency(prior.tower.premium)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Policy Form</span>
                    <span className="text-sm font-medium capitalize">{prior.tower.policy_form || '—'}</span>
                  </div>
                  {prior.tower.structure && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Total Limit</span>
                        <span className="text-sm font-medium">{formatCompact(prior.tower.structure.total_limit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Retention</span>
                        <span className="text-sm font-medium">{formatCompact(prior.tower.structure.retention)}</span>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Revenue (at bind)</span>
                <span className="text-sm font-medium">{formatCompact(prior?.annual_revenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Employees (at bind)</span>
                <span className="text-sm font-medium">{prior?.employee_count?.toLocaleString() || '—'}</span>
              </div>
            </div>
          </div>

          {/* Prior UW Notes */}
          {prior?.uw_notes && (
            <div className="bg-white rounded-lg border">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h3 className="font-semibold text-gray-900">Prior Year UW Notes</h3>
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{prior.uw_notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Loss History & Renewal Status */}
        <div className="space-y-6">
          {/* Loss History Card */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Loss History (During Term)</h3>
              {loss_history?.loss_ratio !== null && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                  loss_history.loss_ratio > 0.6 ? 'bg-red-100 text-red-700' :
                  loss_history.loss_ratio > 0.3 ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {(loss_history.loss_ratio * 100).toFixed(0)}% Loss Ratio
                </span>
              )}
            </div>
            <div className="p-4">
              {loss_history?.count === 0 ? (
                <div className="text-center py-4">
                  <div className="text-green-600 font-medium">No Claims</div>
                  <p className="text-sm text-gray-500 mt-1">Clean loss history during policy term</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-3 pb-3 border-b">
                    <div className="text-center">
                      <div className="text-xl font-bold text-gray-900">{loss_history?.count || 0}</div>
                      <div className="text-xs text-gray-500">Claims</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-gray-900">{formatCompact(loss_history?.total_paid)}</div>
                      <div className="text-xs text-gray-500">Total Paid</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-gray-900">{formatCompact(loss_history?.total_incurred)}</div>
                      <div className="text-xs text-gray-500">Incurred</div>
                    </div>
                  </div>

                  {/* Individual Claims */}
                  {loss_history?.claims?.slice(0, 5).map((claim, i) => (
                    <div key={claim.id || i} className="flex items-center justify-between text-sm py-1">
                      <div>
                        <span className="font-medium text-gray-900">{claim.loss_type || 'Claim'}</span>
                        <span className="text-gray-400 mx-2">·</span>
                        <span className="text-gray-500">{formatDate(claim.loss_date)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-700">{formatCurrency(claim.paid_amount)}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          claim.status?.toLowerCase() === 'closed'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {claim.status || 'Open'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Current Renewal Status */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-900">Renewal Status</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <span className={`text-sm font-medium capitalize ${
                  current?.outcome === 'bound' ? 'text-green-600' :
                  current?.outcome === 'lost' ? 'text-red-600' :
                  'text-gray-700'
                }`}>
                  {current?.status?.replace('_', ' ') || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Proposed Period</span>
                <span className="text-sm font-medium">
                  {formatDate(current?.effective_date)} - {formatDate(current?.expiration_date)}
                </span>
              </div>
              {current?.tower && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">
                    {current.tower.is_bound ? 'Bound Premium' : 'Proposed Premium'}
                  </span>
                  <span className="text-sm font-medium">{formatCurrency(current.tower.premium)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Current Revenue</span>
                <span className="text-sm font-medium">
                  {formatCompact(current?.annual_revenue)}
                  {changes.revenue && (
                    <span className="ml-2">
                      <ChangeBadge change={changes.revenue.pct_change} suffix="%" />
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Premium History (if multiple years) */}
      {renewal_chain?.length > 1 && (
        <div className="bg-white rounded-lg border">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-900">Premium History</h3>
          </div>
          <div className="p-4">
            <div className="flex items-end gap-2 h-32">
              {renewal_chain.map((year, i) => {
                const maxPremium = Math.max(...renewal_chain.map(y => y.premium || 0));
                const height = maxPremium > 0 ? ((year.premium || 0) / maxPremium) * 100 : 0;
                const isCurrent = year.id === submissionId;
                return (
                  <div key={year.id} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t transition-all ${
                        isCurrent ? 'bg-blue-500' :
                        year.outcome === 'bound' ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                    <div className="text-xs font-medium text-gray-700">
                      {formatCompact(year.premium)}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {year.effective_date?.slice(0, 4) || '—'}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-4 mt-3 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-500"></div>
                <span>Bound</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-blue-500"></div>
                <span>Current</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-gray-300"></div>
                <span>Other</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Comparison */}
      <div className="bg-white rounded-lg border">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">Detailed Comparison</h3>
        </div>
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center py-2 border-b-2 border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="w-32">Metric</div>
            <div className="w-32">Expiring</div>
            <div className="w-32">Renewal</div>
            <div className="flex-1">Change</div>
          </div>

          {/* Rows */}
          <CompareRow
            label="Revenue"
            prior={prior?.annual_revenue}
            current={current?.annual_revenue}
            change={changes.revenue}
            formatFn={formatCompact}
          />
          <CompareRow
            label="Employees"
            prior={prior?.employee_count}
            current={current?.employee_count}
            change={changes.employees}
            formatFn={(v) => v?.toLocaleString() || '—'}
          />
          {prior?.tower && current?.tower && (
            <>
              <CompareRow
                label="Premium"
                prior={prior.tower.premium}
                current={current.tower.premium}
                change={changes.premium}
                formatFn={formatCurrency}
              />
              <CompareRow
                label="Total Limit"
                prior={prior.tower.structure?.total_limit}
                current={current.tower.structure?.total_limit}
                change={changes.limit}
                formatFn={formatCompact}
              />
              <CompareRow
                label="Retention"
                prior={prior.tower.structure?.retention}
                current={current.tower.structure?.retention}
                change={changes.retention}
                formatFn={formatCompact}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
