import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSubmissions } from '../api/client';

// Status badge component
function StatusBadge({ status, isBound }) {
  // If bound, show bound badge regardless of status
  if (isBound) {
    return <span className="badge badge-quoted">Bound</span>;
  }

  const statusMap = {
    received: { label: 'Received', class: 'badge-received' },
    quoted: { label: 'Quoted', class: 'badge-pending' },
    bound: { label: 'Bound', class: 'badge-quoted' },
    declined: { label: 'Declined', class: 'badge-declined' },
    pending: { label: 'Pending', class: 'badge-pending' },
    pending_info: { label: 'Pending Info', class: 'badge-info-required' },
    renewal_expected: { label: 'Renewal Expected', class: 'badge-renewal' },
  };

  const config = statusMap[status] || { label: status || '—', class: 'badge-received' };

  return <span className={`badge ${config.class}`}>{config.label}</span>;
}

// Decision badge component
function DecisionBadge({ decision }) {
  if (!decision) return null;

  const config = {
    accept: { label: 'Accept', class: 'badge-quoted' },
    decline: { label: 'Decline', class: 'badge-declined' },
    refer: { label: 'Refer', class: 'badge-renewal' },
  };

  const { label, class: badgeClass } = config[decision] || {};
  if (!label) return null;

  return <span className={`badge ${badgeClass} ml-2`}>{label}</span>;
}

// Format currency
function formatCurrency(value) {
  if (!value) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Format date
function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SubmissionsListPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [boundFilter, setBoundFilter] = useState('');

  const { data: submissions, isLoading, error } = useQuery({
    queryKey: ['submissions'],
    queryFn: () => getSubmissions().then(res => res.data),
  });

  // Filter submissions
  const filteredSubmissions = submissions?.filter(sub => {
    if (statusFilter && sub.status !== statusFilter) return false;
    if (boundFilter === 'bound' && !sub.has_bound_quote) return false;
    if (boundFilter === 'unbound' && sub.has_bound_quote) return false;
    return true;
  });

  // Get unique statuses for filter dropdown
  const statuses = [...new Set(submissions?.map(s => s.status).filter(Boolean) || [])];

  // Count bound submissions
  const boundCount = submissions?.filter(s => s.has_bound_quote).length || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="text-gray-500">Loading submissions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="text-red-500">Error loading submissions. Is the API running?</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Underwriting Portal</h1>
          <nav className="flex items-center gap-6">
            <Link to="/" className="nav-link-active">Submissions</Link>
            <Link to="/stats" className="nav-link">Statistics</Link>
            <Link to="/admin" className="nav-link">Admin</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Submissions</h2>
          <div className="text-sm text-gray-500">
            {submissions?.length || 0} total, {boundCount} bound
          </div>
        </div>

        {/* Filters */}
        <div className="card mb-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                {statuses.map(status => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Bound Status</label>
              <select
                className="form-select"
                value={boundFilter}
                onChange={(e) => setBoundFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="bound">Bound Only</option>
                <option value="unbound">Not Bound</option>
              </select>
            </div>
            <div>
              <label className="form-label">Outcome</label>
              <select className="form-select">
                <option value="">All Outcomes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submissions Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Account</th>
                <th className="table-header">Status</th>
                <th className="table-header">Decision</th>
                <th className="table-header">Industry</th>
                <th className="table-header">Date Received</th>
                <th className="table-header">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSubmissions?.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-cell">
                    <Link
                      to={`/submissions/${sub.id}/account`}
                      className="table-link"
                    >
                      {sub.applicant_name}
                    </Link>
                    {sub.has_bound_quote && sub.bound_quote_name && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {sub.bound_quote_name}
                      </div>
                    )}
                  </td>
                  <td className="table-cell">
                    <StatusBadge status={sub.status} isBound={sub.has_bound_quote} />
                  </td>
                  <td className="table-cell">
                    <DecisionBadge decision={sub.decision_tag} />
                  </td>
                  <td className="table-cell text-gray-600 max-w-[200px] truncate">
                    {sub.naics_primary_title || '—'}
                  </td>
                  <td className="table-cell text-gray-600">
                    {formatDate(sub.created_at)}
                  </td>
                  <td className="table-cell text-gray-600">
                    {formatCurrency(sub.annual_revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(!filteredSubmissions || filteredSubmissions.length === 0) && (
            <div className="px-6 py-12 text-center text-gray-500">
              No submissions found
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
