import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubmission, updateSubmission } from '../api/client';

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

  // Form state
  const [formData, setFormData] = useState({
    applicant_name: '',
    website: '',
    broker_email: '',
    annual_revenue: '',
    naics_primary_title: '',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize form from submission data
  useEffect(() => {
    if (submission && !hasInitialized) {
      setFormData({
        applicant_name: submission.applicant_name || '',
        website: submission.website || '',
        broker_email: submission.broker_email || '',
        annual_revenue: submission.annual_revenue ? formatCurrency(submission.annual_revenue) : '',
        naics_primary_title: submission.naics_primary_title || '',
      });
      setHasInitialized(true);
    }
  }, [submission, hasInitialized]);

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
    if (formData.naics_primary_title !== (submission?.naics_primary_title || '')) {
      updates.naics_primary_title = formData.naics_primary_title || null;
    }

    // Parse revenue
    const newRevenue = parseCurrency(formData.annual_revenue);
    if (newRevenue !== submission?.annual_revenue) {
      updates.annual_revenue = newRevenue;
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
        broker_email: submission.broker_email || '',
        annual_revenue: submission.annual_revenue ? formatCurrency(submission.annual_revenue) : '',
        naics_primary_title: submission.naics_primary_title || '',
      });
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

      {/* Contact Information */}
      <div className="card">
        <h3 className="form-section-title">Contact Information</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="form-label">Broker Email</label>
            <input
              type="email"
              className="form-input"
              value={formData.broker_email}
              onChange={(e) => handleChange('broker_email', e.target.value)}
              placeholder="broker@example.com"
            />
          </div>
          <div>
            <label className="form-label">Submission Status</label>
            <input
              type="text"
              className="form-input bg-gray-50"
              value={submission?.status?.replace(/_/g, ' ') || '—'}
              readOnly
            />
          </div>
        </div>
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
