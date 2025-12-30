import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getStatsSummary,
  getUpcomingRenewals,
  getRenewalsNotReceived,
  getRetentionMetrics,
} from '../api/client';

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

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

// Format month
function formatMonth(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

// Metric card component
function MetricCard({ label, value, subValue, color }) {
  const colorClasses = {
    default: 'bg-gray-50',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    blue: 'bg-blue-50 border-blue-200',
    yellow: 'bg-yellow-50 border-yellow-200',
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color] || colorClasses.default}`}>
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subValue && <div className="text-xs text-gray-500 mt-1">{subValue}</div>}
    </div>
  );
}

// Status Summary Section
function StatusSummary() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['stats-summary'],
    queryFn: () => getStatsSummary().then(res => res.data),
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading summary...</div>;
  }

  const { total, in_progress, quoted, declined, breakdown } = summary || {};

  return (
    <div className="space-y-4">
      {/* Top level metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total Submissions" value={total || 0} />
        <MetricCard label="In Progress" value={in_progress || 0} color="blue" />
        <MetricCard label="Quoted" value={quoted || 0} color="green" />
        <MetricCard label="Declined" value={declined || 0} color="red" />
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="Received" value={breakdown?.received || 0} />
        <MetricCard label="Pending Info" value={breakdown?.pending_info || 0} />
        <MetricCard label="Waiting" value={breakdown?.waiting || 0} color="yellow" />
        <MetricCard label="Bound" value={breakdown?.bound || 0} color="green" />
        <MetricCard label="Lost" value={breakdown?.lost || 0} color="red" />
      </div>
    </div>
  );
}

// Upcoming Renewals Tab
function UpcomingRenewalsTab() {
  const [daysAhead, setDaysAhead] = useState(90);

  const { data: renewals, isLoading } = useQuery({
    queryKey: ['upcoming-renewals', daysAhead],
    queryFn: () => getUpcomingRenewals(daysAhead).then(res => res.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-600">Show renewals due in:</label>
        <select
          className="form-select w-32"
          value={daysAhead}
          onChange={(e) => setDaysAhead(Number(e.target.value))}
        >
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
          <option value={120}>120 days</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading renewals...</div>
      ) : !renewals || renewals.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No policies expiring in the next {daysAhead} days.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-gray-500 mb-4">
            Found {renewals.length} upcoming renewals
          </div>
          {renewals.map((renewal) => {
            const days = renewal.days_until_expiry;
            let urgency = 'text-green-600';
            let urgencyIcon = '🟢';
            if (days <= 30) {
              urgency = 'text-red-600';
              urgencyIcon = '🔴';
            } else if (days <= 60) {
              urgency = 'text-yellow-600';
              urgencyIcon = '🟡';
            }

            return (
              <div
                key={renewal.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span>{urgencyIcon}</span>
                  <Link
                    to={`/submissions/${renewal.id}/account`}
                    className="font-medium text-purple-600 hover:text-purple-800"
                  >
                    {renewal.applicant_name}
                  </Link>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-gray-500">
                    Expires: {formatDate(renewal.expiration_date)}
                  </span>
                  <span className={`font-medium ${urgency}`}>
                    {days} days
                  </span>
                  <span className="text-gray-600">
                    {formatCurrency(renewal.sold_premium)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Renewals Not Received Tab
function NotReceivedTab() {
  const { data: notReceived, isLoading } = useQuery({
    queryKey: ['renewals-not-received'],
    queryFn: () => getRenewalsNotReceived().then(res => res.data),
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!notReceived || notReceived.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
        No missed renewals.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-500 mb-4">
        Found {notReceived.length} missed renewals
      </div>
      {notReceived.map((renewal) => (
        <div
          key={renewal.id}
          className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <span className="text-red-500">✕</span>
            <Link
              to={`/submissions/${renewal.id}/account`}
              className="font-medium text-purple-600 hover:text-purple-800"
            >
              {renewal.applicant_name}
            </Link>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-500">
              Expected: {formatDate(renewal.effective_date)}
            </span>
            <span className="text-gray-600 max-w-xs truncate">
              {renewal.outcome_reason || '—'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Retention Metrics Tab
function RetentionMetricsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['retention-metrics'],
    queryFn: () => getRetentionMetrics().then(res => res.data),
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading metrics...</div>;
  }

  const { monthly, rate_changes } = data || {};

  // Calculate totals
  const totalReceived = monthly?.reduce((sum, m) => sum + (m.renewals_received || 0), 0) || 0;
  const totalBound = monthly?.reduce((sum, m) => sum + (m.renewals_bound || 0), 0) || 0;
  const totalLost = monthly?.reduce((sum, m) => sum + (m.renewals_lost || 0), 0) || 0;
  const retentionRate = totalReceived > 0 ? (totalBound / totalReceived * 100) : 0;

  // Calculate rate change totals
  let totalCurrentPremium = 0;
  let totalPriorPremium = 0;
  rate_changes?.forEach((rc) => {
    if (rc.current_premium && rc.prior_premium) {
      totalCurrentPremium += rc.current_premium;
      totalPriorPremium += rc.prior_premium;
    }
  });
  const overallRateChange = totalPriorPremium > 0
    ? ((totalCurrentPremium - totalPriorPremium) / totalPriorPremium * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Renewals Received" value={totalReceived} />
        <MetricCard label="Renewals Bound" value={totalBound} color="green" />
        <MetricCard label="Renewals Lost" value={totalLost} color="red" />
        <MetricCard
          label="Retention Rate"
          value={`${retentionRate.toFixed(1)}%`}
          color={retentionRate >= 80 ? 'green' : retentionRate >= 60 ? 'yellow' : 'red'}
        />
      </div>

      {/* Monthly breakdown */}
      {monthly && monthly.length > 0 && (
        <div className="card">
          <h4 className="form-section-title">Monthly Breakdown</h4>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Month</th>
                  <th className="table-header text-right">Received</th>
                  <th className="table-header text-right">Bound</th>
                  <th className="table-header text-right">Lost</th>
                  <th className="table-header text-right">Retention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthly.map((row, idx) => {
                  const rate = row.renewals_received > 0
                    ? (row.renewals_bound / row.renewals_received * 100)
                    : 0;
                  return (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">{formatMonth(row.month)}</td>
                      <td className="table-cell text-right">{row.renewals_received || 0}</td>
                      <td className="table-cell text-right text-green-600">{row.renewals_bound || 0}</td>
                      <td className="table-cell text-right text-red-600">{row.renewals_lost || 0}</td>
                      <td className="table-cell text-right">{rate.toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rate change analysis */}
      {rate_changes && rate_changes.length > 0 && (
        <div className="card">
          <h4 className="form-section-title">Rate Change Analysis</h4>
          <div className="space-y-2 mb-4">
            {rate_changes.map((rc) => {
              if (!rc.current_premium || !rc.prior_premium) return null;
              const change = ((rc.current_premium - rc.prior_premium) / rc.prior_premium) * 100;
              const isPositive = change > 0;

              return (
                <div
                  key={rc.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span>{isPositive ? '📈' : change < 0 ? '📉' : '➡️'}</span>
                    <Link
                      to={`/submissions/${rc.id}/account`}
                      className="text-purple-600 hover:text-purple-800"
                    >
                      {rc.applicant_name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-gray-500">Prior: {formatCurrency(rc.prior_premium)}</span>
                    <span className="text-gray-500">Current: {formatCurrency(rc.current_premium)}</span>
                    <span className={`font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : ''}{change.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overall rate change */}
          {totalPriorPremium > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">Overall Rate Change</span>
                <div className="text-right">
                  <div className={`text-xl font-bold ${overallRateChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {overallRateChange > 0 ? '+' : ''}{overallRateChange.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatCurrency(totalCurrentPremium - totalPriorPremium)} change
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(!monthly || monthly.length === 0) && (!rate_changes || rate_changes.length === 0) && (
        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
          No renewal data available yet.
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState('upcoming');

  const tabs = [
    { id: 'upcoming', label: 'Upcoming Renewals' },
    { id: 'not-received', label: 'Not Received' },
    { id: 'metrics', label: 'Retention Metrics' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Underwriting Portal</h1>
          <nav className="flex items-center gap-6">
            <Link to="/" className="nav-link">Submissions</Link>
            <span className="nav-link-active">Statistics</span>
            <span className="nav-link">Settings</span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Submission Statistics</h2>

        {/* Status Summary */}
        <div className="card mb-6">
          <StatusSummary />
        </div>

        {/* Tabs */}
        <div className="card">
          <div className="flex border-b border-gray-200 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'upcoming' && <UpcomingRenewalsTab />}
          {activeTab === 'not-received' && <NotReceivedTab />}
          {activeTab === 'metrics' && <RetentionMetricsTab />}
        </div>
      </main>
    </div>
  );
}
