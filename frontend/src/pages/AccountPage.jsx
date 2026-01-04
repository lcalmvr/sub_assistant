import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubmission, updateSubmission, getBrkrEmployments } from '../api/client';

// Format currency for display
function formatCurrency(value) {
  if (!value) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Parse currency string to number
function parseCurrency(str) {
  if (!str) return null;
  const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? null : num;
}

export default function AccountPage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  const { data: submission, isLoading, error } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  // Fetch broker employments for dropdown
  const { data: brokerEmployments } = useQuery({
    queryKey: ['brkr-employments'],
    queryFn: () => getBrkrEmployments({ active_only: true }).then(res => res.data),
  });

  // Form state
  const [formData, setFormData] = useState({
    applicant_name: '',
    website: '',
    broker_employment_id: '',
    broker_email: '',
    annual_revenue: '',
    naics_primary_title: '',
    opportunity_notes: '',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Broker selector state
  const [brokerSearch, setBrokerSearch] = useState('');
  const [showBrokerDropdown, setShowBrokerDropdown] = useState(false);

  // Initialize form from submission data
  useEffect(() => {
    if (submission && !hasInitialized) {
      setFormData({
        applicant_name: submission.applicant_name || '',
        website: submission.website || '',
        broker_employment_id: submission.broker_employment_id || '',
        broker_email: submission.broker_email || '',
        annual_revenue: submission.annual_revenue ? formatCurrency(submission.annual_revenue) : '',
        naics_primary_title: submission.naics_primary_title || '',
        opportunity_notes: submission.opportunity_notes || '',
      });
      // Set search display to show current broker
      if (submission.broker_employment_id || submission.broker_email) {
        const emp = brokerEmployments?.find(e =>
          e.employment_id === submission.broker_employment_id ||
          e.email === submission.broker_email
        );
        if (emp) {
          setBrokerSearch(`${emp.person_name} - ${emp.org_name}`);
        } else if (submission.broker_email) {
          setBrokerSearch(submission.broker_email);
        }
      }
      setHasInitialized(true);
    }
  }, [submission, hasInitialized, brokerEmployments]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['submission', submissionId]);
      setHasChanges(false);
    },
  });

  // Handle form field change
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Handle broker selection
  const handleSelectBroker = (employment) => {
    setFormData(prev => ({
      ...prev,
      broker_employment_id: employment.employment_id,
      broker_email: employment.email,
    }));
    setBrokerSearch(`${employment.person_name} - ${employment.org_name}`);
    setShowBrokerDropdown(false);
    setHasChanges(true);
  };

  // Filter broker employments based on search
  const filteredEmployments = brokerEmployments?.filter(emp => {
    const search = brokerSearch.toLowerCase();
    return (
      (emp.email || '').toLowerCase().includes(search) ||
      (emp.person_name || '').toLowerCase().includes(search) ||
      (emp.org_name || '').toLowerCase().includes(search)
    );
  }) || [];

  // Handle save
  const handleSave = () => {
    const updates = {};

    // Only include changed fields
    if (formData.applicant_name !== (submission?.applicant_name || '')) {
      updates.applicant_name = formData.applicant_name || null;
    }
    if (formData.website !== (submission?.website || '')) {
      updates.website = formData.website || null;
    }
    if (formData.broker_email !== (submission?.broker_email || '')) {
      updates.broker_email = formData.broker_email || null;
    }
    if (formData.broker_employment_id !== (submission?.broker_employment_id || '')) {
      updates.broker_employment_id = formData.broker_employment_id || null;
    }
    if (formData.naics_primary_title !== (submission?.naics_primary_title || '')) {
      updates.naics_primary_title = formData.naics_primary_title || null;
    }

    // Parse revenue
    const newRevenue = parseCurrency(formData.annual_revenue);
    if (newRevenue !== submission?.annual_revenue) {
      updates.annual_revenue = newRevenue;
    }

    // Opportunity notes
    if (formData.opportunity_notes !== (submission?.opportunity_notes || '')) {
      updates.opportunity_notes = formData.opportunity_notes || null;
    }

    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    } else {
      setHasChanges(false);
    }
  };

  // Handle cancel - reset form
  const handleCancel = () => {
    if (submission) {
      setFormData({
        applicant_name: submission.applicant_name || '',
        website: submission.website || '',
        broker_employment_id: submission.broker_employment_id || '',
        broker_email: submission.broker_email || '',
        annual_revenue: submission.annual_revenue ? formatCurrency(submission.annual_revenue) : '',
        naics_primary_title: submission.naics_primary_title || '',
        opportunity_notes: submission.opportunity_notes || '',
      });
      // Reset broker search display
      if (submission.broker_employment_id || submission.broker_email) {
        const emp = brokerEmployments?.find(e =>
          e.employment_id === submission.broker_employment_id ||
          e.email === submission.broker_email
        );
        if (emp) {
          setBrokerSearch(`${emp.person_name} - ${emp.org_name}`);
        } else if (submission.broker_email) {
          setBrokerSearch(submission.broker_email);
        }
      } else {
        setBrokerSearch('');
      }
    }
    setHasChanges(false);
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error loading submission</div>;
  }

  return (
    <div className="space-y-6">
      {/* Save Bar - appears when there are changes */}
      {hasChanges && (
        <div className="sticky top-0 z-10 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-blue-800 text-sm font-medium">You have unsaved changes</span>
          <div className="flex gap-2">
            <button
              className="btn bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={handleCancel}
              disabled={updateMutation.isPending}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Success message */}
      {updateMutation.isSuccess && !hasChanges && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <span className="text-green-800 text-sm">Changes saved successfully</span>
        </div>
      )}

      {/* Error message */}
      {updateMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <span className="text-red-800 text-sm">
            Error saving changes: {updateMutation.error?.response?.data?.detail || 'Please try again'}
          </span>
        </div>
      )}

      {/* Company Information */}
      <div className="card">
        <h3 className="form-section-title">Company Information</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="form-label">Applicant Name</label>
            <input
              type="text"
              className="form-input"
              value={formData.applicant_name}
              onChange={(e) => handleChange('applicant_name', e.target.value)}
              placeholder="Company name"
            />
          </div>
          <div>
            <label className="form-label">Website</label>
            <input
              type="text"
              className="form-input"
              value={formData.website}
              onChange={(e) => handleChange('website', e.target.value)}
              placeholder="example.com"
            />
          </div>
        </div>
      </div>

      {/* Broker Selection */}
      <div className="card">
        <h3 className="form-section-title">Broker</h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="relative">
            <label className="form-label">Broker Contact</label>
            <input
              type="text"
              className="form-input"
              value={brokerSearch}
              onChange={(e) => {
                setBrokerSearch(e.target.value);
                setShowBrokerDropdown(true);
              }}
              onFocus={() => setShowBrokerDropdown(true)}
              placeholder="Search by name, email, or organization..."
            />
            {/* Dropdown */}
            {showBrokerDropdown && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                {filteredEmployments.length > 0 ? (
                  filteredEmployments.map(emp => (
                    <button
                      key={emp.employment_id}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      onClick={() => handleSelectBroker(emp)}
                    >
                      <div className="font-medium text-gray-900">
                        {emp.person_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {emp.email} · {emp.org_name}
                      </div>
                    </button>
                  ))
                ) : brokerSearch ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-sm text-gray-500 mb-2">No matching brokers found</p>
                    <Link
                      to="/brokers"
                      className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                    >
                      Go to Broker Management to add new
                    </Link>
                  </div>
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    Start typing to search...
                  </div>
                )}
                {filteredEmployments.length > 0 && (
                  <div className="border-t border-gray-200 px-3 py-2">
                    <Link
                      to="/brokers"
                      className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                    >
                      Manage brokers
                    </Link>
                  </div>
                )}
              </div>
            )}
            {/* Click outside to close */}
            {showBrokerDropdown && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowBrokerDropdown(false)}
              />
            )}
          </div>
          <div>
            <label className="form-label">Submission Status</label>
            <input
              type="text"
              className="form-input bg-gray-50"
              value={submission?.submission_status?.replace(/_/g, ' ') || '—'}
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Opportunity / Broker Request */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="form-section-title mb-0">Opportunity / Broker Request</h3>
          <span className="text-xs text-gray-400">Displayed in pre-screen voting cards</span>
        </div>
        <textarea
          className="form-input min-h-[100px]"
          value={formData.opportunity_notes}
          onChange={(e) => handleChange('opportunity_notes', e.target.value)}
          placeholder="Enter opportunity details from broker request: expiring coverage, expected pricing, why they're shopping, any special circumstances..."
          rows={4}
        />
        <p className="text-xs text-gray-500 mt-2">
          This summary appears on pre-screen voting cards to help UWs make quick decisions.
          Can be extracted from broker emails or entered manually.
        </p>
      </div>

      {/* Financial Information */}
      <div className="card">
        <h3 className="form-section-title">Financial Information</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="form-label">Annual Revenue</label>
            <input
              type="text"
              className="form-input"
              value={formData.annual_revenue}
              onChange={(e) => {
                // Allow typing but format on blur
                const raw = e.target.value.replace(/[^0-9]/g, '');
                handleChange('annual_revenue', raw ? formatCurrency(parseInt(raw, 10)) : '');
              }}
              placeholder="$0"
            />
            <p className="text-xs text-gray-500 mt-1">Used for premium calculations</p>
          </div>
          <div>
            <label className="form-label">Industry (NAICS)</label>
            <input
              type="text"
              className="form-input"
              value={formData.naics_primary_title}
              onChange={(e) => handleChange('naics_primary_title', e.target.value)}
              placeholder="e.g., Software Publishers"
            />
            <p className="text-xs text-gray-500 mt-1">Used for hazard class mapping</p>
          </div>
        </div>
      </div>

      {/* Business Summary - read only */}
      <div className="card">
        <h3 className="form-section-title">Business Summary</h3>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
            {submission?.business_summary || 'No summary available'}
          </p>
        </div>
      </div>

      {/* Key Points - read only */}
      {submission?.bullet_point_summary && (
        <div className="card">
          <h3 className="form-section-title">Key Points</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {submission.bullet_point_summary}
            </p>
          </div>
        </div>
      )}

      {/* Submission Metadata */}
      <div className="card">
        <h3 className="form-section-title">Submission Details</h3>
        <div className="grid grid-cols-3 gap-6">
          <div className="metric-card">
            <div className="metric-label">Submission ID</div>
            <div className="text-sm font-mono text-gray-600 truncate" title={submission?.id}>
              {submission?.id?.slice(0, 8)}...
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Created</div>
            <div className="text-sm text-gray-900">
              {submission?.created_at
                ? new Date(submission.created_at).toLocaleDateString()
                : '—'}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">NAICS Code</div>
            <div className="text-sm text-gray-900">
              {submission?.naics_primary_code || '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
