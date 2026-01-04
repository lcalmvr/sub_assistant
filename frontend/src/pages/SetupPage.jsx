import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubmission,
  updateSubmission,
  getBrkrEmployments,
  getCredibility,
  getConflicts,
  resolveConflict,
  getSubmissionDocuments,
  getExtractions,
  acceptExtraction,
  uploadSubmissionDocument,
} from '../api/client';
import PdfHighlighter from '../components/review/PdfHighlighter';
import ExtractionPanel from '../components/review/ExtractionPanel';

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

function formatCurrency(value) {
  if (!value) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function parseCurrency(str) {
  if (!str) return null;
  const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? null : num;
}

// ─────────────────────────────────────────────────────────────
// Credibility Score Card
// ─────────────────────────────────────────────────────────────

function CredibilityCard({ credibility }) {
  if (!credibility?.has_score) {
    return (
      <div className="card bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Application Credibility</h3>
          <span className="text-sm text-gray-500">Not calculated</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Credibility score will be calculated when the application is processed.
        </p>
      </div>
    );
  }

  const { total_score, label, dimensions, issue_count } = credibility;

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBgColor = (score) => {
    if (score >= 80) return 'bg-green-50 border-green-200';
    if (score >= 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getBarColor = (score) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className={`card ${getBgColor(total_score)}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Application Credibility</h3>
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${getScoreColor(total_score)}`}>
            {Math.round(total_score)}
          </span>
          <span className={`px-2 py-1 text-sm font-medium rounded ${getBgColor(total_score)} ${getScoreColor(total_score)}`}>
            {label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {dimensions && Object.entries(dimensions).map(([name, score]) => (
          <div key={name} className="bg-white/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700 capitalize">{name}</span>
              <span className={`text-sm font-semibold ${getScoreColor(score)}`}>
                {score ? Math.round(score) : '—'}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${getBarColor(score)}`}
                style={{ width: `${score || 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {issue_count > 0 && (
        <p className="text-sm text-gray-600 mt-3">
          {issue_count} issue{issue_count !== 1 ? 's' : ''} detected
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Conflicts List
// ─────────────────────────────────────────────────────────────

function ConflictsList({ conflicts, submissionId }) {
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: ({ conflictId, status }) => resolveConflict(submissionId, conflictId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conflicts', submissionId] });
    },
  });

  if (!conflicts || conflicts.pending_count === 0) {
    return null;
  }

  const priorityColors = {
    high: 'border-l-red-500 bg-red-50',
    medium: 'border-l-yellow-500 bg-yellow-50',
    low: 'border-l-blue-500 bg-blue-50',
  };

  const priorityBadge = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
  };

  const typeLabels = {
    VALUE_MISMATCH: 'Value Mismatch',
    LOW_CONFIDENCE: 'Low Confidence',
    MISSING_REQUIRED: 'Missing Required',
    CROSS_FIELD: 'Cross-Field Conflict',
    APPLICATION_CONTRADICTION: 'Contradiction',
    VERIFICATION_REQUIRED: 'Needs Verification',
    DUPLICATE_SUBMISSION: 'Duplicate',
    OUTLIER_VALUE: 'Outlier Value',
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="form-section-title mb-0 pb-0 border-0">Conflicts Requiring Review</h3>
        <div className="flex items-center gap-2">
          {conflicts.high_priority_count > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
              {conflicts.high_priority_count} high priority
            </span>
          )}
          <span className="text-sm text-gray-500">
            {conflicts.pending_count} pending
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {conflicts.pending.map((conflict) => (
          <div
            key={conflict.id}
            className={`border-l-4 rounded-lg p-4 ${priorityColors[conflict.priority]}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityBadge[conflict.priority]}`}>
                    {conflict.priority}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {typeLabels[conflict.type] || conflict.type}
                  </span>
                  {conflict.field && (
                    <span className="text-sm text-gray-500">
                      — {conflict.field}
                    </span>
                  )}
                </div>
                {conflict.details?.message && (
                  <p className="text-sm text-gray-700">{conflict.details.message}</p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => resolveMutation.mutate({ conflictId: conflict.id, status: 'approved' })}
                  disabled={resolveMutation.isPending}
                  className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => resolveMutation.mutate({ conflictId: conflict.id, status: 'deferred' })}
                  disabled={resolveMutation.isPending}
                  className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                >
                  Defer
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Document Selector with Upload
// ─────────────────────────────────────────────────────────────

function DocumentSelector({ documents, selectedId, onSelect, onUpload, isUploading }) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedType, setSelectedType] = useState('');

  const typeIcons = {
    'Application Form': '📋',
    'application': '📋',
    'Loss Runs': '📊',
    'loss_run': '📊',
    'Financial Statement': '💰',
    'financial': '💰',
    'policy': '📜',
    'Email': '📧',
    'Other': '📄',
    'other': '📄',
  };

  const documentTypes = [
    { value: '', label: 'Auto-detect' },
    { value: 'application', label: 'Application' },
    { value: 'policy', label: 'Policy' },
    { value: 'loss_run', label: 'Loss Run' },
    { value: 'financial', label: 'Financial Statement' },
    { value: 'other', label: 'Other' },
  ];

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setShowUploadModal(true);
    }
  };

  const handleUpload = () => {
    if (selectedFile && onUpload) {
      onUpload(selectedFile, selectedType || null);
      setShowUploadModal(false);
      setSelectedFile(null);
      setSelectedType('');
    }
  };

  const handleCancel = () => {
    setShowUploadModal(false);
    setSelectedFile(null);
    setSelectedType('');
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 border-b">
        {documents?.documents?.map((doc) => (
          <button
            key={doc.id}
            onClick={() => onSelect(doc)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedId === doc.id
                ? 'bg-purple-100 text-purple-700 border border-purple-300'
                : 'bg-white hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <span>{typeIcons[doc.type] || typeIcons.Other}</span>
            <span className="font-medium truncate max-w-[150px]">{doc.filename}</span>
            {doc.is_scanned && (
              <span className="px-1 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">OCR</span>
            )}
          </button>
        ))}

        {/* Upload button */}
        <label className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
          isUploading
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-white hover:bg-purple-50 border border-dashed border-purple-300 text-purple-600'
        }`}>
          {isUploading ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-purple-600 border-t-transparent rounded-full"></span>
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Document</span>
            </>
          )}
          <input
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileSelect}
            disabled={isUploading}
          />
        </label>

        {(!documents || documents.count === 0) && (
          <span className="text-sm text-gray-500 ml-2">No documents yet</span>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Document</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm text-gray-900 truncate">{selectedFile?.name}</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {selectedFile && (selectedFile.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {documentTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg"
              >
                Upload & Process
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Account Profile Form
// ─────────────────────────────────────────────────────────────

function AccountProfileForm({ submission, onSave, isSaving }) {
  const { data: brokerEmployments } = useQuery({
    queryKey: ['brkr-employments'],
    queryFn: () => getBrkrEmployments({ active_only: true }).then(res => res.data),
  });

  const [formData, setFormData] = useState({
    applicant_name: '',
    website: '',
    broker_employment_id: '',
    broker_email: '',
    annual_revenue: '',
    naics_primary_title: '',
    effective_date: '',
    expiration_date: '',
    opportunity_notes: '',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [brokerSearch, setBrokerSearch] = useState('');
  const [showBrokerDropdown, setShowBrokerDropdown] = useState(false);

  // Initialize form from submission
  useEffect(() => {
    if (submission && !hasInitialized) {
      setFormData({
        applicant_name: submission.applicant_name || '',
        website: submission.website || '',
        broker_employment_id: submission.broker_employment_id || '',
        broker_email: submission.broker_email || '',
        annual_revenue: submission.annual_revenue ? formatCurrency(submission.annual_revenue) : '',
        naics_primary_title: submission.naics_primary_title || '',
        effective_date: submission.effective_date || '',
        expiration_date: submission.expiration_date || '',
        opportunity_notes: submission.opportunity_notes || '',
      });
      // Set broker search display
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

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

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

  const filteredEmployments = brokerEmployments?.filter(emp => {
    const search = brokerSearch.toLowerCase();
    return (
      (emp.email || '').toLowerCase().includes(search) ||
      (emp.person_name || '').toLowerCase().includes(search) ||
      (emp.org_name || '').toLowerCase().includes(search)
    );
  }) || [];

  const handleSave = () => {
    const updates = {};

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
    if (formData.effective_date !== (submission?.effective_date || '')) {
      updates.effective_date = formData.effective_date || null;
    }
    if (formData.expiration_date !== (submission?.expiration_date || '')) {
      updates.expiration_date = formData.expiration_date || null;
    }
    if (formData.opportunity_notes !== (submission?.opportunity_notes || '')) {
      updates.opportunity_notes = formData.opportunity_notes || null;
    }

    const newRevenue = parseCurrency(formData.annual_revenue);
    if (newRevenue !== submission?.annual_revenue) {
      updates.annual_revenue = newRevenue;
    }

    if (Object.keys(updates).length > 0) {
      onSave(updates);
      setHasChanges(false);
    } else {
      setHasChanges(false);
    }
  };

  const handleCancel = () => {
    setHasInitialized(false); // Force re-init
    setHasChanges(false);
  };

  return (
    <div className="space-y-6">
      {/* Save Bar */}
      {hasChanges && (
        <div className="sticky top-0 z-10 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-blue-800 text-sm font-medium">You have unsaved changes</span>
          <div className="flex gap-2">
            <button
              className="btn bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
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
                      <div className="font-medium text-gray-900">{emp.person_name}</div>
                      <div className="text-sm text-gray-500">{emp.email} · {emp.org_name}</div>
                    </button>
                  ))
                ) : brokerSearch ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-sm text-gray-500 mb-2">No matching brokers found</p>
                    <Link to="/brokers" className="text-sm text-purple-600 hover:text-purple-800 font-medium">
                      Go to Broker Management to add new
                    </Link>
                  </div>
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    Start typing to search...
                  </div>
                )}
              </div>
            )}
            {showBrokerDropdown && (
              <div className="fixed inset-0 z-10" onClick={() => setShowBrokerDropdown(false)} />
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

      {/* Policy Period */}
      <div className="card">
        <h3 className="form-section-title">Policy Period</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="form-label">Effective Date</label>
            <input
              type="date"
              className="form-input"
              value={formData.effective_date}
              onChange={(e) => handleChange('effective_date', e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Expiration Date</label>
            <input
              type="date"
              className="form-input"
              value={formData.expiration_date}
              onChange={(e) => handleChange('expiration_date', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Opportunity Notes */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="form-section-title mb-0">Opportunity / Broker Request</h3>
          <span className="text-xs text-gray-400">Displayed in pre-screen voting cards</span>
        </div>
        <textarea
          className="form-input min-h-[100px]"
          value={formData.opportunity_notes}
          onChange={(e) => handleChange('opportunity_notes', e.target.value)}
          placeholder="Enter opportunity details from broker request..."
          rows={4}
        />
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

      {/* Submission Metadata - read only */}
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
              {submission?.created_at ? new Date(submission.created_at).toLocaleDateString() : '—'}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">NAICS Code</div>
            <div className="text-sm text-gray-900">{submission?.naics_primary_code || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Setup Page Component
// ─────────────────────────────────────────────────────────────

export default function SetupPage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  // State for document viewer
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [highlightPage, setHighlightPage] = useState(null);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [viewMode, setViewMode] = useState('split');

  // Queries
  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  const { data: credibility } = useQuery({
    queryKey: ['credibility', submissionId],
    queryFn: () => getCredibility(submissionId).then(res => res.data),
  });

  const { data: conflicts } = useQuery({
    queryKey: ['conflicts', submissionId],
    queryFn: () => getConflicts(submissionId).then(res => res.data),
  });

  const { data: documents } = useQuery({
    queryKey: ['documents', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(res => res.data),
  });

  const { data: extractions, isLoading: extractionsLoading } = useQuery({
    queryKey: ['extractions', submissionId],
    queryFn: () => getExtractions(submissionId).then(res => res.data),
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['submission', submissionId]);
    },
  });

  const acceptExtractionMutation = useMutation({
    mutationFn: (extractionId) => acceptExtraction(extractionId),
    onSuccess: () => {
      queryClient.invalidateQueries(['extractions', submissionId]);
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: ({ file, documentType }) => uploadSubmissionDocument(submissionId, file, documentType),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['documents', submissionId]);
      if (response?.data) {
        setSelectedDocument({
          id: response.data.id,
          filename: response.data.filename,
          type: response.data.document_type,
          page_count: response.data.page_count,
          url: response.data.file_path ? `/api/documents/${response.data.id}/file` : null,
        });
      }
    },
  });

  // Handlers
  const handleShowSource = async (pageNumber, documentId, value, sourceText, bbox = null, answer_bbox = null, question_bbox = null) => {
    let targetDocId = documentId;
    if (documentId && documents?.documents?.length > 0) {
      const targetDoc = documents.documents.find(d => d.id === documentId);
      if (targetDoc) {
        setSelectedDocument(targetDoc);
        targetDocId = targetDoc.id;
      }
    }

    if (!selectedDocument && documents?.documents?.length > 0) {
      const primary = documents.documents.find(d => d.is_priority) || documents.documents[0];
      setSelectedDocument(primary);
      targetDocId = primary.id;
    }

    const targetPage = answer_bbox?.page || question_bbox?.page || bbox?.page || pageNumber;
    setHighlightPage(targetPage);
    setScrollTrigger(prev => prev + 1);

    let selectedBbox = null;
    if (question_bbox?.left != null) {
      selectedBbox = question_bbox;
    } else if (bbox?.left != null) {
      selectedBbox = bbox;
    }

    if (selectedBbox) {
      const highlights = [{
        page: selectedBbox.page || targetPage,
        bbox: {
          left: selectedBbox.left,
          top: selectedBbox.top,
          width: selectedBbox.width,
          height: selectedBbox.height,
        },
        type: 'question',
      }];
      setActiveHighlight({ highlights });
    } else {
      setActiveHighlight(null);
    }

    if (viewMode === 'extractions') {
      setViewMode('split');
    }
  };

  const handleAcceptValue = async (extractionId) => {
    await acceptExtractionMutation.mutateAsync(extractionId);
  };

  const handleDocumentUpload = (file, documentType) => {
    uploadDocumentMutation.mutate({ file, documentType });
  };

  const handleAccountSave = (updates) => {
    updateMutation.mutate(updates);
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  const hasExtractions = extractions?.sections && Object.keys(extractions.sections).length > 0;

  return (
    <div className="space-y-6">
      {/* Section 1: Credibility + Conflicts */}
      <div className="grid grid-cols-2 gap-6">
        <CredibilityCard credibility={credibility} />
        <ConflictsList conflicts={conflicts} submissionId={submissionId} />
      </div>

      {/* Section 2: Document Verification */}
      {(hasExtractions || documents?.count > 0) && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
            <h3 className="font-semibold text-gray-900">Document Verification</h3>
            <div className="flex items-center gap-1 bg-gray-200 rounded-lg p-1">
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 text-sm rounded ${
                  viewMode === 'split' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Split
              </button>
              <button
                onClick={() => setViewMode('documents')}
                className={`px-3 py-1 text-sm rounded ${
                  viewMode === 'documents' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Documents
              </button>
              <button
                onClick={() => setViewMode('extractions')}
                className={`px-3 py-1 text-sm rounded ${
                  viewMode === 'extractions' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Extractions
              </button>
            </div>
          </div>

          <div className={`grid ${viewMode === 'split' ? 'grid-cols-2' : 'grid-cols-1'} divide-x overflow-hidden`} style={{ height: '500px' }}>
            {/* Document Viewer */}
            {(viewMode === 'split' || viewMode === 'documents') && (
              <div className="flex flex-col h-full overflow-hidden">
                <DocumentSelector
                  documents={documents}
                  selectedId={selectedDocument?.id}
                  onSelect={setSelectedDocument}
                  onUpload={handleDocumentUpload}
                  isUploading={uploadDocumentMutation.isPending}
                />
                {selectedDocument?.url ? (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(selectedDocument.filename) ? (
                      <div className="flex-1 overflow-auto p-4 flex items-start justify-center h-full">
                        <img
                          src={selectedDocument.url}
                          alt={selectedDocument.filename}
                          className="max-w-full h-auto shadow-lg bg-white"
                          style={{ maxHeight: '100%', objectFit: 'contain' }}
                        />
                      </div>
                    ) : (
                      <PdfHighlighter
                        url={selectedDocument.url}
                        initialPage={highlightPage || 1}
                        scrollTrigger={scrollTrigger}
                        highlight={activeHighlight}
                        className="h-full"
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-gray-100">
                    <p className="text-gray-500">Select a document to view</p>
                  </div>
                )}
              </div>
            )}

            {/* Extraction Panel */}
            {(viewMode === 'split' || viewMode === 'extractions') && (
              <div className="h-full overflow-hidden">
                <ExtractionPanel
                  extractions={extractions?.sections}
                  isLoading={extractionsLoading}
                  onShowSource={handleShowSource}
                  onAcceptValue={handleAcceptValue}
                  className="h-full"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 3: Account Profile Form */}
      <AccountProfileForm
        submission={submission}
        onSave={handleAccountSave}
        isSaving={updateMutation.isPending}
      />
    </div>
  );
}
