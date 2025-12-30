import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCoverageCatalogStats,
  getCoverageStandardTags,
  getCoveragePendingReviews,
  getCoverageCarriers,
  getCoverageByCarrier,
  lookupCoverageMapping,
  approveCoverageMapping,
  rejectCoverageMapping,
  resetCoverageMapping,
  updateCoverageTags,
  deleteCoverageMapping,
  deleteRejectedCoverages,
} from '../api/client';

// ─────────────────────────────────────────────────────────────
// Stats Overview Section
// ─────────────────────────────────────────────────────────────

function StatsOverview() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['coverage-catalog-stats'],
    queryFn: () => getCoverageCatalogStats().then(res => res.data),
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading stats...</div>;
  }

  return (
    <div className="grid grid-cols-5 gap-4 mb-6">
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold text-gray-900">{stats?.total || 0}</div>
        <div className="text-sm text-gray-600">Total Mappings</div>
      </div>
      <div className={`rounded-lg p-4 text-center ${stats?.pending > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
        <div className={`text-2xl font-bold ${stats?.pending > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>
          {stats?.pending || 0}
        </div>
        <div className="text-sm text-gray-600">Pending Review</div>
      </div>
      <div className="bg-green-50 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold text-green-600">{stats?.approved || 0}</div>
        <div className="text-sm text-gray-600">Approved</div>
      </div>
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold text-gray-900">{stats?.carriers || 0}</div>
        <div className="text-sm text-gray-600">Carriers</div>
      </div>
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <div className="text-2xl font-bold text-gray-900">{stats?.unique_tags || 0}</div>
        <div className="text-sm text-gray-600">Unique Tags</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pending Review Tab
// ─────────────────────────────────────────────────────────────

function PendingReviewTab() {
  const queryClient = useQueryClient();

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ['coverage-pending'],
    queryFn: () => getCoveragePendingReviews().then(res => res.data),
  });

  const { data: standardTags = [] } = useQuery({
    queryKey: ['coverage-standard-tags'],
    queryFn: () => getCoverageStandardTags().then(res => res.data),
  });

  const approveMutation = useMutation({
    mutationFn: approveCoverageMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-pending'] });
      queryClient.invalidateQueries({ queryKey: ['coverage-catalog-stats'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectCoverageMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-pending'] });
      queryClient.invalidateQueries({ queryKey: ['coverage-catalog-stats'] });
    },
  });

  const updateTagsMutation = useMutation({
    mutationFn: ({ id, tags }) => updateCoverageTags(id, tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-pending'] });
    },
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading pending reviews...</div>;
  }

  if (pending.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center text-blue-700">
        No coverage mappings pending review.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Pending Review ({pending.length})</h3>
      {pending.map((item) => (
        <PendingReviewCard
          key={item.id}
          item={item}
          standardTags={standardTags}
          onApprove={() => approveMutation.mutate(item.id)}
          onReject={() => rejectMutation.mutate(item.id)}
          onUpdateTags={(tags) => updateTagsMutation.mutate({ id: item.id, tags })}
          isApproving={approveMutation.isPending}
          isRejecting={rejectMutation.isPending}
        />
      ))}
    </div>
  );
}

function PendingReviewCard({ item, standardTags, onApprove, onReject, onUpdateTags, isApproving, isRejecting }) {
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [selectedTags, setSelectedTags] = useState(() => {
    const tags = item.coverage_normalized;
    if (Array.isArray(tags)) return tags;
    if (typeof tags === 'string') return tags ? [tags] : [];
    return [];
  });

  const currentTags = Array.isArray(item.coverage_normalized)
    ? item.coverage_normalized
    : (item.coverage_normalized ? [item.coverage_normalized] : []);

  const handleSaveTags = () => {
    onUpdateTags(selectedTags);
    setIsEditingTags(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-medium text-gray-900">{item.carrier_name}</span>
          {item.policy_form && (
            <span className="text-gray-500 ml-2">· {item.policy_form}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm font-medium"
            onClick={onApprove}
            disabled={isApproving}
          >
            {isApproving ? '...' : '✓ Approve'}
          </button>
          <button
            className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium"
            onClick={onReject}
            disabled={isRejecting}
          >
            {isRejecting ? '...' : '✗ Reject'}
          </button>
        </div>
      </div>

      {/* Coverage mapping */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="text-sm text-gray-500 mb-1">Original Coverage</div>
          <div className="text-gray-900 italic">{item.coverage_original}</div>
        </div>
        <div className="text-gray-400 self-center">→</div>
        <div className="flex-1">
          <div className="text-sm text-gray-500 mb-1">Normalized Tags</div>
          {isEditingTags ? (
            <div className="space-y-2">
              <select
                multiple
                className="form-select w-full h-32"
                value={selectedTags}
                onChange={(e) => {
                  const options = Array.from(e.target.selectedOptions, opt => opt.value);
                  setSelectedTags(options);
                }}
              >
                {standardTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  className="btn btn-primary text-sm"
                  onClick={handleSaveTags}
                >
                  Save
                </button>
                <button
                  className="btn btn-secondary text-sm"
                  onClick={() => {
                    setSelectedTags(currentTags);
                    setIsEditingTags(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {currentTags.length > 0 ? (
                <ul className="list-disc list-inside text-gray-900">
                  {currentTags.map((tag, idx) => (
                    <li key={idx}>{tag}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-gray-400">No tags assigned</span>
              )}
              <button
                className="text-purple-600 hover:text-purple-800 text-sm mt-2"
                onClick={() => setIsEditingTags(true)}
              >
                Edit tags
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      {(item.submitted_by || item.submitted_at || item.notes) && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
          {[
            item.submitted_by && `by ${item.submitted_by}`,
            item.submitted_at && String(item.submitted_at).substring(0, 10),
            item.notes && (item.notes.length > 40 ? item.notes.substring(0, 40) + '...' : item.notes),
          ].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Browse by Carrier Tab
// ─────────────────────────────────────────────────────────────

function BrowseByCarrierTab() {
  const [selectedCarrier, setSelectedCarrier] = useState('');
  const queryClient = useQueryClient();

  const { data: carriers = [] } = useQuery({
    queryKey: ['coverage-carriers'],
    queryFn: () => getCoverageCarriers().then(res => res.data),
  });

  const { data: coverages = [], isLoading: loadingCoverages } = useQuery({
    queryKey: ['coverage-by-carrier', selectedCarrier],
    queryFn: () => selectedCarrier ? getCoverageByCarrier(selectedCarrier).then(res => res.data) : Promise.resolve([]),
    enabled: !!selectedCarrier,
  });

  const resetMutation = useMutation({
    mutationFn: resetCoverageMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-by-carrier'] });
      queryClient.invalidateQueries({ queryKey: ['coverage-catalog-stats'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCoverageMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-by-carrier'] });
      queryClient.invalidateQueries({ queryKey: ['coverage-catalog-stats'] });
    },
  });

  const deleteRejectedMutation = useMutation({
    mutationFn: deleteRejectedCoverages,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-by-carrier'] });
      queryClient.invalidateQueries({ queryKey: ['coverage-catalog-stats'] });
    },
  });

  // Group coverages by policy form
  const byPolicyForm = coverages.reduce((acc, cov) => {
    const form = cov.policy_form || 'Unknown Form';
    if (!acc[form]) acc[form] = [];
    acc[form].push(cov);
    return acc;
  }, {});

  if (carriers.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center text-blue-700">
        No carriers in the catalog yet. Coverage mappings will appear here as documents are processed.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Carrier selector + Clear rejected */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <select
            className="form-select w-full"
            value={selectedCarrier}
            onChange={(e) => setSelectedCarrier(e.target.value)}
          >
            <option value="">Select Carrier...</option>
            {carriers.map(carrier => (
              <option key={carrier} value={carrier}>{carrier}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-secondary text-sm"
          onClick={() => {
            if (confirm('Delete all rejected mappings?')) {
              deleteRejectedMutation.mutate();
            }
          }}
          disabled={deleteRejectedMutation.isPending}
        >
          {deleteRejectedMutation.isPending ? 'Deleting...' : 'Clear Rejected'}
        </button>
      </div>

      {/* Coverages by policy form */}
      {selectedCarrier && (
        loadingCoverages ? (
          <div className="text-gray-500">Loading coverages...</div>
        ) : coverages.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
            No coverages found for {selectedCarrier}
          </div>
        ) : (
          Object.entries(byPolicyForm).map(([form, formCoverages]) => (
            <div key={form} className="border border-gray-200 rounded-lg">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 font-medium">
                {form} ({formCoverages.length} coverages)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="table-header">Original Name</th>
                      <th className="table-header">Normalized Tags</th>
                      <th className="table-header w-24">Status</th>
                      <th className="table-header w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {formCoverages.map((cov) => {
                      const tags = Array.isArray(cov.coverage_normalized)
                        ? cov.coverage_normalized
                        : (cov.coverage_normalized ? [cov.coverage_normalized] : []);

                      return (
                        <tr key={cov.id} className="hover:bg-gray-50">
                          <td className="table-cell">{cov.coverage_original}</td>
                          <td className="table-cell text-sm">
                            {tags.length > 0 ? tags.join(', ') : <span className="text-gray-400">No tags</span>}
                          </td>
                          <td className="table-cell">
                            <span className={`px-2 py-1 text-xs rounded ${
                              cov.status === 'approved' ? 'bg-green-100 text-green-700' :
                              cov.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {cov.status}
                            </span>
                          </td>
                          <td className="table-cell">
                            {cov.status === 'rejected' && (
                              <div className="flex gap-1">
                                <button
                                  className="text-purple-600 hover:text-purple-800 text-sm"
                                  onClick={() => resetMutation.mutate(cov.id)}
                                  title="Reset to pending"
                                >
                                  ↩
                                </button>
                                <button
                                  className="text-red-600 hover:text-red-800 text-sm"
                                  onClick={() => deleteMutation.mutate(cov.id)}
                                  title="Delete"
                                >
                                  🗑
                                </button>
                              </div>
                            )}
                            {cov.status === 'pending' && (
                              <button
                                className="text-red-600 hover:text-red-800 text-sm"
                                onClick={() => deleteMutation.mutate(cov.id)}
                                title="Delete"
                              >
                                🗑
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Search Tab
// ─────────────────────────────────────────────────────────────

function SearchTab() {
  const [carrierName, setCarrierName] = useState('');
  const [coverageName, setCoverageName] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ['coverage-lookup', carrierName, coverageName],
    queryFn: () => lookupCoverageMapping(carrierName, coverageName).then(res => res.data),
    enabled: searchTriggered && !!carrierName && !!coverageName,
  });

  const handleSearch = () => {
    if (carrierName && coverageName) {
      setSearchTriggered(true);
    }
  };

  const tags = result ? (
    Array.isArray(result.coverage_normalized)
      ? result.coverage_normalized
      : (result.coverage_normalized ? [result.coverage_normalized] : [])
  ) : [];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Search Coverage Mappings</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Carrier Name</label>
          <input
            type="text"
            className="form-input w-full"
            placeholder="e.g., BCS Insurance"
            value={carrierName}
            onChange={(e) => { setCarrierName(e.target.value); setSearchTriggered(false); }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Coverage Name</label>
          <input
            type="text"
            className="form-input w-full"
            placeholder="e.g., Multimedia Liability"
            value={coverageName}
            onChange={(e) => { setCoverageName(e.target.value); setSearchTriggered(false); }}
          />
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSearch}
        disabled={!carrierName || !coverageName}
      >
        Search
      </button>

      {isLoading && <div className="text-gray-500">Searching...</div>}

      {searchTriggered && !isLoading && result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="font-medium text-green-700 mb-3">Found matching coverage mapping:</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500 mb-1">Original</div>
              <div className="text-gray-900">{result.coverage_original}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Normalized Tags</div>
              {tags.length > 0 ? (
                <ul className="list-disc list-inside">
                  {tags.map((tag, idx) => (
                    <li key={idx}>{tag}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-gray-400">No tags</span>
              )}
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            Carrier: {result.carrier_name} · Form: {result.policy_form || 'N/A'} · Status: {result.status}
          </div>
        </div>
      )}

      {searchTriggered && !isLoading && !result && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-700">
          No matching coverage found in the catalog.
        </div>
      )}

      {!searchTriggered && carrierName && coverageName && (
        <div className="text-sm text-gray-500">
          Click Search to find the coverage mapping.
        </div>
      )}

      {(!carrierName || !coverageName) && (
        <div className="text-sm text-gray-500">
          Enter both carrier name and coverage name to search.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────

export default function CoverageCatalogPage() {
  const [activeTab, setActiveTab] = useState('pending');

  const tabs = [
    { id: 'pending', label: 'Pending Review' },
    { id: 'browse', label: 'Browse by Carrier' },
    { id: 'search', label: 'Search' },
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
            <span className="nav-link-active">Coverage Catalog</span>
            <Link to="/accounts" className="nav-link">Accounts</Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Coverage Catalog</h2>
          <p className="text-sm text-gray-500">Manage carrier-specific coverage mappings to standardized tags</p>
        </div>

        {/* Stats Overview */}
        <StatsOverview />

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
          {activeTab === 'pending' && <PendingReviewTab />}
          {activeTab === 'browse' && <BrowseByCarrierTab />}
          {activeTab === 'search' && <SearchTab />}
        </div>
      </main>
    </div>
  );
}
