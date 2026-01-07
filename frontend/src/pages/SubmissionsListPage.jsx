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
    pending_decline: { label: 'Pending Decline', class: 'badge-declined' },
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

// Workflow stage badge component
function WorkflowStageBadge({ stage, assignedTo }) {
  if (!stage) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const stageConfig = {
    intake: { label: 'Intake', color: 'bg-gray-100 text-gray-600', icon: '○' },
    pre_screen: { label: 'Pre-Screen', color: 'bg-blue-100 text-blue-700', icon: '◐' },
    uw_work: { label: 'UW Work', color: 'bg-yellow-100 text-yellow-700', icon: '◑' },
    formal: { label: 'Formal', color: 'bg-purple-100 text-purple-700', icon: '◕' },
    complete: { label: 'Complete', color: 'bg-green-100 text-green-700', icon: '●' },
  };

  const config = stageConfig[stage] || { label: stage, color: 'bg-gray-100 text-gray-600', icon: '○' };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

// Assignment badge component
function AssignmentBadge({ assignedTo, currentUser }) {
  if (!assignedTo) {
    return <span className="text-xs text-gray-400">Unassigned</span>;
  }

  const isMe = assignedTo === currentUser;

  return (
    <span className={`text-xs ${isMe ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
      {isMe ? 'Me' : assignedTo}
    </span>
  );
}

// Team users (same as in SubmissionLayout)
const TEAM_USERS = ['Sarah', 'Mike', 'Tom'];

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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [boundFilter, setBoundFilter] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState(''); // '', 'mine', 'unassigned', or UW name
  const [currentUser, setCurrentUser] = useState(() =>
    localStorage.getItem('currentUser') || 'Sarah'
  );

  // Persist current user to localStorage
  const handleUserChange = (user) => {
    setCurrentUser(user);
    localStorage.setItem('currentUser', user);
  };

  const { data: submissions, isLoading, error } = useQuery({
    queryKey: ['submissions'],
    queryFn: () => getSubmissions().then(res => res.data),
  });

  // Filter submissions
  const filteredSubmissions = submissions?.filter(sub => {
    // Search filter - check applicant name and industry
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const nameMatch = sub.applicant_name?.toLowerCase().includes(search);
      const industryMatch = sub.naics_primary_title?.toLowerCase().includes(search);
      if (!nameMatch && !industryMatch) return false;
    }
    if (statusFilter && sub.status !== statusFilter) return false;
    if (boundFilter === 'bound' && !sub.has_bound_quote) return false;
    if (boundFilter === 'unbound' && sub.has_bound_quote) return false;
    if (workflowFilter && sub.workflow_stage !== workflowFilter) return false;
    // Assignment filter
    if (assignmentFilter === 'mine' && sub.assigned_to_name !== currentUser) return false;
    if (assignmentFilter === 'unassigned' && sub.assigned_to_name) return false;
    if (assignmentFilter && assignmentFilter !== 'mine' && assignmentFilter !== 'unassigned' && sub.assigned_to_name !== assignmentFilter) return false;
    return true;
  });

  // Count my assigned submissions
  const myCount = submissions?.filter(s => s.assigned_to_name === currentUser).length || 0;
  const unassignedCount = submissions?.filter(s => !s.assigned_to_name).length || 0;

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
            <Link to="/vote-queue" className="nav-link flex items-center gap-1">
              <span>Vote Queue</span>
            </Link>
            <Link to="/stats" className="nav-link">Statistics</Link>
            <Link to="/admin" className="nav-link">Admin</Link>
            <Link to="/compliance" className="nav-link">Compliance</Link>
            <Link to="/uw-guide" className="nav-link">UW Guide</Link>
            <Link to="/brokers" className="nav-link">Brokers</Link>
            <Link to="/coverage-catalog" className="nav-link">Coverage Catalog</Link>
            <Link to="/accounts" className="nav-link">Accounts</Link>
            <Link to="/document-library" className="nav-link">Docs</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Submissions</h2>
          <div className="text-sm text-gray-500">
            {filteredSubmissions?.length !== submissions?.length
              ? `${filteredSubmissions?.length || 0} of ${submissions?.length || 0} submissions`
              : `${submissions?.length || 0} submissions`}
            {boundCount > 0 && ` · ${boundCount} bound`}
          </div>
        </div>

        {/* Quick Filters - My Queue */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Viewing as:</span>
            <select
              className="form-select py-1 px-2 text-sm"
              value={currentUser}
              onChange={(e) => handleUserChange(e.target.value)}
            >
              {TEAM_USERS.map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <div className="flex gap-2">
            <button
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                assignmentFilter === '' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setAssignmentFilter('')}
            >
              All ({submissions?.length || 0})
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                assignmentFilter === 'mine' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
              onClick={() => setAssignmentFilter('mine')}
            >
              My Queue ({myCount})
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                assignmentFilter === 'unassigned' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
              }`}
              onClick={() => setAssignmentFilter('unassigned')}
            >
              Unassigned ({unassignedCount})
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="card mb-6">
          <div className="mb-4">
            <input
              type="text"
              className="form-input w-full text-lg"
              placeholder="Search by account name or industry..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-4 gap-4">
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
              <label className="form-label">Workflow Stage</label>
              <select
                className="form-select"
                value={workflowFilter}
                onChange={(e) => setWorkflowFilter(e.target.value)}
              >
                <option value="">All Stages</option>
                <option value="pre_screen">Pre-Screen</option>
                <option value="uw_work">UW Work</option>
                <option value="formal">Formal Review</option>
                <option value="complete">Complete</option>
              </select>
            </div>
            <div>
              <label className="form-label">Assigned To</label>
              <select
                className="form-select"
                value={assignmentFilter}
                onChange={(e) => setAssignmentFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="mine">My Queue</option>
                <option value="unassigned">Unassigned</option>
                {TEAM_USERS.filter(u => u !== currentUser).map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
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
                <th className="table-header">Assigned</th>
                <th className="table-header">Workflow</th>
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
                    <AssignmentBadge assignedTo={sub.assigned_to_name} currentUser={currentUser} />
                  </td>
                  <td className="table-cell">
                    <WorkflowStageBadge stage={sub.workflow_stage} />
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
