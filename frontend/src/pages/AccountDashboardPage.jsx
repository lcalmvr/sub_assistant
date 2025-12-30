import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  getSubmissionStatusCounts,
  getDashboardSubmissions,
  getAccountsList,
  getRecentAccounts,
  getAccountDetails,
  getAccountWrittenPremium,
  getAccountSubmissions,
} from '../api/client';

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value) {
  if (!value) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
}

function formatStatus(status) {
  if (!status) return '—';
  return String(status).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────
// Submissions Overview Tab
// ─────────────────────────────────────────────────────────────

function SubmissionsOverviewTab() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  const { data: counts = {} } = useQuery({
    queryKey: ['submission-status-counts'],
    queryFn: () => getSubmissionStatusCounts(30).then(res => res.data),
  });

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['dashboard-submissions', search, statusFilter, outcomeFilter],
    queryFn: () => getDashboardSubmissions({
      search: search || undefined,
      status: statusFilter,
      outcome: outcomeFilter,
      limit: 75,
    }).then(res => res.data),
  });

  const statusOptions = ['all', 'received', 'pending_info', 'quoted', 'declined', 'renewal_expected', 'renewal_not_received'];
  const outcomeOptions = ['all', 'pending', 'waiting_for_response', 'bound', 'lost', 'declined'];

  return (
    <div className="space-y-6">
      {/* Status Counts */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{counts.received || 0}</div>
          <div className="text-sm text-gray-600">Received (30d)</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{counts.pending_info || 0}</div>
          <div className="text-sm text-gray-600">Pending Info (30d)</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{counts.quoted || 0}</div>
          <div className="text-sm text-gray-600">Quoted (30d)</div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{counts.declined || 0}</div>
          <div className="text-sm text-gray-600">Declined (30d)</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="form-input w-full"
            placeholder="Search by company name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-48">
          <select
            className="form-select w-full"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusOptions.map(opt => (
              <option key={opt} value={opt}>{opt === 'all' ? 'All Statuses' : formatStatus(opt)}</option>
            ))}
          </select>
        </div>
        <div className="w-48">
          <select
            className="form-select w-full"
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
          >
            {outcomeOptions.map(opt => (
              <option key={opt} value={opt}>{opt === 'all' ? 'All Outcomes' : formatStatus(opt)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Submissions Table */}
      {isLoading ? (
        <div className="text-gray-500">Loading submissions...</div>
      ) : submissions.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center text-blue-700">
          No submissions match your filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header w-16"></th>
                <th className="table-header w-20">ID</th>
                <th className="table-header">Received</th>
                <th className="table-header">Company</th>
                <th className="table-header">Account</th>
                <th className="table-header">Status</th>
                <th className="table-header">Outcome</th>
                <th className="table-header text-right">Revenue</th>
                <th className="table-header">Industry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {submissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <Link
                      to={`/submissions/${sub.id}/account`}
                      className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                    >
                      Open
                    </Link>
                  </td>
                  <td className="table-cell text-xs text-gray-500 font-mono">
                    {String(sub.id).substring(0, 8)}
                  </td>
                  <td className="table-cell">{formatDate(sub.date_received)}</td>
                  <td className="table-cell font-medium">{sub.applicant_name || '—'}</td>
                  <td className="table-cell">{sub.account_name || '—'}</td>
                  <td className="table-cell">
                    <span className={`px-2 py-1 text-xs rounded ${
                      sub.submission_status === 'quoted' ? 'bg-green-100 text-green-700' :
                      sub.submission_status === 'declined' ? 'bg-red-100 text-red-700' :
                      sub.submission_status === 'pending_info' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {formatStatus(sub.submission_status)}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={`px-2 py-1 text-xs rounded ${
                      sub.submission_outcome === 'bound' ? 'bg-green-100 text-green-700' :
                      sub.submission_outcome === 'lost' || sub.submission_outcome === 'declined' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {formatStatus(sub.submission_outcome)}
                    </span>
                  </td>
                  <td className="table-cell text-right">{formatCompactCurrency(sub.annual_revenue)}</td>
                  <td className="table-cell text-sm text-gray-600 truncate max-w-xs">
                    {sub.naics_primary_title || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Account Drilldown Tab
// ─────────────────────────────────────────────────────────────

function AccountDrilldownTab() {
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [showRecent, setShowRecent] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-list', search],
    queryFn: () => getAccountsList({ search: search || undefined, limit: 50 }).then(res => res.data),
  });

  const { data: recentAccounts = [] } = useQuery({
    queryKey: ['recent-accounts'],
    queryFn: () => getRecentAccounts(10).then(res => res.data),
  });

  const { data: account } = useQuery({
    queryKey: ['account-details', selectedAccountId],
    queryFn: () => getAccountDetails(selectedAccountId).then(res => res.data),
    enabled: !!selectedAccountId,
  });

  const { data: premiumData } = useQuery({
    queryKey: ['account-written-premium', selectedAccountId],
    queryFn: () => getAccountWrittenPremium(selectedAccountId).then(res => res.data),
    enabled: !!selectedAccountId,
  });

  const { data: accountSubmissions = [] } = useQuery({
    queryKey: ['account-submissions', selectedAccountId],
    queryFn: () => getAccountSubmissions(selectedAccountId).then(res => res.data),
    enabled: !!selectedAccountId,
  });

  const accountLabel = (a) => `${a.name} – ${String(a.id).substring(0, 8)}`;

  const buildAddress = () => {
    if (!account) return '';
    const parts = [];
    if (account.address_street) parts.push(account.address_street);
    if (account.address_street2) parts.push(account.address_street2);
    const csz = [account.address_city, account.address_state].filter(Boolean).join(', ');
    if (csz) parts.push(csz + (account.address_zip ? ` ${account.address_zip}` : ''));
    else if (account.address_zip) parts.push(account.address_zip);
    return parts.join(' · ');
  };

  const latestSubmission = accountSubmissions[0];

  return (
    <div className="space-y-6">
      {/* Search + Select */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="form-input w-full"
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <select
            className="form-select w-full"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            <option value="">Select an account...</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{accountLabel(a)}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <button
            className="btn btn-secondary"
            onClick={() => setShowRecent(!showRecent)}
          >
            ...
          </button>
          {showRecent && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
              <div className="p-3 border-b border-gray-100">
                <span className="text-xs text-gray-500 uppercase">Recent Accounts</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {recentAccounts.map(a => (
                  <button
                    key={a.id}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    onClick={() => {
                      setSelectedAccountId(a.id);
                      setShowRecent(false);
                    }}
                  >
                    {accountLabel(a)}
                  </button>
                ))}
              </div>
              <div className="p-2 border-t border-gray-100">
                <button
                  className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                  onClick={() => {
                    setSelectedAccountId('');
                    setShowRecent(false);
                  }}
                >
                  Clear selection
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* No Selection State */}
      {!selectedAccountId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center text-blue-700">
          Search/select an account to see linked submissions.
        </div>
      )}

      {/* Account Details */}
      {account && (
        <>
          {/* Account Summary Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-gray-900">{account.name}</h3>
                <div className="text-sm text-gray-500 mt-1">
                  {[
                    account.website && (
                      <a
                        key="website"
                        href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-800"
                      >
                        {account.website}
                      </a>
                    ),
                    buildAddress(),
                  ].filter(Boolean).map((item, idx) => (
                    <span key={idx}>
                      {idx > 0 && ' · '}
                      {item}
                    </span>
                  ))}
                </div>
                <div className="text-sm text-gray-500 mt-2">
                  {[
                    latestSubmission && `Latest: ${formatStatus(latestSubmission.submission_status)} · ${formatStatus(latestSubmission.submission_outcome)}`,
                    account.naics_title || account.industry,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{accountSubmissions.length}</div>
                  <div className="text-sm text-gray-500">Submissions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(premiumData?.written_premium || 0)}
                  </div>
                  <div className="text-sm text-gray-500">Written Premium</div>
                </div>
                {latestSubmission && (
                  <Link
                    to={`/submissions/${latestSubmission.id}/account`}
                    className="btn btn-primary"
                  >
                    Open Latest
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Account Submissions Table */}
          <div>
            <h4 className="text-lg font-medium text-gray-900 mb-4">Submissions</h4>
            {accountSubmissions.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                No submissions linked to this account yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-header w-16"></th>
                      <th className="table-header w-20">ID</th>
                      <th className="table-header">Received</th>
                      <th className="table-header">Status</th>
                      <th className="table-header">Outcome</th>
                      <th className="table-header text-right">Revenue</th>
                      <th className="table-header">Industry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {accountSubmissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-gray-50">
                        <td className="table-cell">
                          <Link
                            to={`/submissions/${sub.id}/account`}
                            className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                          >
                            Open
                          </Link>
                        </td>
                        <td className="table-cell text-xs text-gray-500 font-mono">
                          {String(sub.id).substring(0, 8)}
                        </td>
                        <td className="table-cell">{formatDate(sub.date_received)}</td>
                        <td className="table-cell">
                          <span className={`px-2 py-1 text-xs rounded ${
                            sub.submission_status === 'quoted' ? 'bg-green-100 text-green-700' :
                            sub.submission_status === 'declined' ? 'bg-red-100 text-red-700' :
                            sub.submission_status === 'pending_info' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {formatStatus(sub.submission_status)}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className={`px-2 py-1 text-xs rounded ${
                            sub.submission_outcome === 'bound' ? 'bg-green-100 text-green-700' :
                            sub.submission_outcome === 'lost' || sub.submission_outcome === 'declined' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {formatStatus(sub.submission_outcome)}
                          </span>
                        </td>
                        <td className="table-cell text-right">{formatCompactCurrency(sub.annual_revenue)}</td>
                        <td className="table-cell text-sm text-gray-600 truncate max-w-xs">
                          {sub.naics_primary_title || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────

export default function AccountDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Submissions Overview' },
    { id: 'account', label: 'Account Drilldown' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Underwriting Portal</h1>
          <nav className="flex items-center gap-6">
            <Link to="/" className="nav-link">Submissions</Link>
            <Link to="/stats" className="nav-link">Statistics</Link>
            <Link to="/admin" className="nav-link">Admin</Link>
            <Link to="/compliance" className="nav-link">Compliance</Link>
            <Link to="/uw-guide" className="nav-link">UW Guide</Link>
            <Link to="/brokers" className="nav-link">Brokers</Link>
            <Link to="/coverage-catalog" className="nav-link">Coverage Catalog</Link>
            <span className="nav-link-active">Accounts</span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Account Dashboard</h2>

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
          {activeTab === 'overview' && <SubmissionsOverviewTab />}
          {activeTab === 'account' && <AccountDrilldownTab />}
        </div>
      </main>
    </div>
  );
}
