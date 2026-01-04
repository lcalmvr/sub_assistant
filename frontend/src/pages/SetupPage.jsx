import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubmission,
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

function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────
// HITL Verification Checklist
// ─────────────────────────────────────────────────────────────

function VerificationChecklist({ submission, onVerify }) {
  // Local state for verification (can be persisted to DB later)
  const [verified, setVerified] = useState({});

  const items = [
    {
      key: 'company',
      label: 'Company Identity',
      value: submission?.applicant_name,
      description: 'AI analyzed the correct company',
    },
    {
      key: 'revenue',
      label: 'Revenue',
      value: submission?.annual_revenue ? formatCompact(submission.annual_revenue) : null,
      description: 'Extracted amount matches source',
    },
    {
      key: 'broker',
      label: 'Broker',
      value: submission?.broker_name || submission?.broker_email,
      description: 'Correct broker contact linked',
    },
    {
      key: 'policy_period',
      label: 'Policy Period',
      value: submission?.effective_date && submission?.expiration_date
        ? `${formatDate(submission.effective_date)} – ${formatDate(submission.expiration_date)}`
        : null,
      description: 'Dates are accurate',
    },
    {
      key: 'industry',
      label: 'Industry',
      value: submission?.naics_primary_title,
      description: 'Classification is correct',
    },
  ];

  const handleToggle = (key) => {
    setVerified(prev => {
      const next = { ...prev, [key]: !prev[key] };
      onVerify?.(next);
      return next;
    });
  };

  const verifiedCount = Object.values(verified).filter(Boolean).length;
  const totalCount = items.filter(i => i.value).length;
  const allVerified = verifiedCount === totalCount && totalCount > 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="form-section-title mb-0 pb-0 border-0">Verification Checklist</h3>
        <div className="flex items-center gap-2">
          {allVerified ? (
            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
              All verified
            </span>
          ) : (
            <span className="text-sm text-gray-500">
              {verifiedCount} of {totalCount} verified
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const hasValue = item.value != null;
          const isVerified = verified[item.key];

          return (
            <div
              key={item.key}
              onClick={() => hasValue && handleToggle(item.key)}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                !hasValue
                  ? 'bg-gray-50 border-gray-200 opacity-50'
                  : isVerified
                    ? 'bg-green-50 border-green-200 cursor-pointer hover:bg-green-100'
                    : 'bg-white border-gray-200 cursor-pointer hover:bg-gray-50'
              }`}
            >
              {/* Checkbox */}
              <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                !hasValue
                  ? 'border-gray-300 bg-gray-100'
                  : isVerified
                    ? 'border-green-500 bg-green-500'
                    : 'border-gray-300 bg-white'
              }`}>
                {isVerified && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Label and value */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${isVerified ? 'text-green-800' : 'text-gray-900'}`}>
                    {item.label}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">{item.description}</span>
                </div>
                <div className={`text-sm mt-0.5 truncate ${isVerified ? 'text-green-700' : 'text-gray-600'}`}>
                  {hasValue ? item.value : 'Not extracted'}
                </div>
              </div>

              {/* Edit hint */}
              {hasValue && !isVerified && (
                <span className="text-xs text-gray-400">Click to verify</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Verify each item before proceeding to analysis. Click any item to mark as verified.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Application Quality Card (formerly Credibility)
// ─────────────────────────────────────────────────────────────

function ApplicationQualityCard({ credibility }) {
  if (!credibility?.has_score) {
    return (
      <div className="card bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="form-section-title mb-0 pb-0 border-0">Application Quality</h3>
          <span className="text-sm text-gray-500">Pending</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Quality assessment will be available after document processing.
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

  // Capitalize dimension names
  const formatDimensionName = (name) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <div className={`card ${getBgColor(total_score)}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="form-section-title mb-0 pb-0 border-0">Application Quality</h3>
          <p className="text-xs text-gray-500 mt-1">How complete and consistent is this application?</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${getScoreColor(total_score)}`}>
            {Math.round(total_score)}
          </span>
          <span className={`px-2 py-1 text-sm font-medium rounded ${getBgColor(total_score)} ${getScoreColor(total_score)}`}>
            {label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        {dimensions && Object.entries(dimensions).map(([name, score]) => (
          <div key={name} className="bg-white/50 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-gray-700 truncate">
                {formatDimensionName(name)}
              </span>
              <span className={`text-sm font-semibold ${getScoreColor(score)} flex-shrink-0`}>
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

      {issue_count > 0 && total_score < 80 && (
        <div className="mt-3 p-2 bg-white/50 rounded-lg">
          <p className="text-sm text-gray-700">
            <span className="font-medium">{issue_count} flag{issue_count !== 1 ? 's' : ''}</span>
            <span className="text-gray-500"> — review recommended</span>
          </p>
        </div>
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

  // Show empty state instead of hiding
  if (!conflicts || conflicts.pending_count === 0) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="form-section-title mb-0 pb-0 border-0">Conflicts</h3>
          <span className="text-sm text-green-600 font-medium">No conflicts</span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-green-700">All extracted data has been verified with no conflicts.</p>
        </div>
      </div>
    );
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

function DocumentSelector({ documents, selectedId, onSelect, onUpload, isUploading, showUploadOnly = false }) {
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

  // Upload-only mode for empty state
  if (showUploadOnly) {
    return (
      <>
        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
          isUploading
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-purple-600 hover:bg-purple-700 text-white'
        }`}>
          {isUploading ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Upload Document</span>
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

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Document</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-2">Selected file:</p>
                  <p className="font-medium text-gray-900">{selectedFile?.name}</p>
                </div>
                <div>
                  <label className="form-label">Document Type</label>
                  <select
                    className="form-select"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    {documentTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={handleCancel} className="btn btn-secondary flex-1">Cancel</button>
                  <button onClick={handleUpload} className="btn btn-primary flex-1">Upload</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

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
  const handleSelectDocument = (doc) => {
    let url = `/api/documents/${doc.id}/file`; // Default fallback

    if (doc.url) {
      // Check if it's an external URL (e.g., Supabase storage) - use as-is
      if (doc.url.startsWith('https://') && !doc.url.includes('localhost')) {
        url = doc.url;
      }
      // Localhost URL - convert to relative path for Vite proxy
      else if (doc.url.includes('localhost')) {
        try {
          const parsed = new URL(doc.url);
          url = parsed.pathname;
        } catch {
          url = doc.url;
        }
      }
      // Already a relative path
      else if (doc.url.startsWith('/')) {
        url = doc.url;
      }
    }

    setSelectedDocument({ ...doc, url });
  };

  const handleShowSource = async (pageNumber, documentId, value, sourceText, bbox = null, answer_bbox = null, question_bbox = null) => {
    let targetDocId = documentId;
    if (documentId && documents?.documents?.length > 0) {
      const targetDoc = documents.documents.find(d => d.id === documentId);
      if (targetDoc) {
        handleSelectDocument(targetDoc);
        targetDocId = targetDoc.id;
      }
    }

    if (!selectedDocument && documents?.documents?.length > 0) {
      const primary = documents.documents.find(d => d.is_priority) || documents.documents[0];
      handleSelectDocument(primary);
      targetDocId = primary.id;
    }

    const targetPage = answer_bbox?.page || question_bbox?.page || bbox?.page || pageNumber;
    setHighlightPage(targetPage);
    setScrollTrigger(prev => prev + 1);

    // Question-only highlighting - more reliable since question text is cleaner in Textract
    let selectedBbox = null;

    // Use question_bbox (most reliable)
    if (question_bbox?.left != null) {
      selectedBbox = question_bbox;
    }
    // Legacy fallback
    else if (bbox?.left != null) {
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

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  const hasExtractions = extractions?.sections && Object.keys(extractions.sections).length > 0;

  return (
    <div className="space-y-6">
      {/* Section 1: Verification Checklist + Application Quality */}
      <div className="grid grid-cols-2 gap-6">
        <VerificationChecklist submission={submission} />
        <ApplicationQualityCard credibility={credibility} />
      </div>

      {/* Section 2: Conflicts - always show even if empty */}
      <ConflictsList conflicts={conflicts} submissionId={submissionId} />

      {/* Section 3: Document Verification - Always show */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
          <h3 className="font-semibold text-gray-900">Document Verification</h3>
          {(hasExtractions || documents?.count > 0) && (
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
          )}
        </div>

        {/* Empty state when no documents */}
        {!hasExtractions && (!documents || documents.count === 0) ? (
          <div className="p-8 text-center bg-gray-50" style={{ minHeight: '300px' }}>
            <div className="max-w-md mx-auto">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Documents Uploaded</h4>
              <p className="text-gray-500 mb-4">Upload submission documents to extract and verify application data.</p>
              <DocumentSelector
                documents={documents}
                selectedId={null}
                onSelect={() => {}}
                onUpload={handleDocumentUpload}
                isUploading={uploadDocumentMutation.isPending}
                showUploadOnly
              />
            </div>
          </div>
        ) : (
          <div className={`grid ${viewMode === 'split' ? 'grid-cols-2' : 'grid-cols-1'} divide-x overflow-hidden`} style={{ height: '500px' }}>
            {/* Document Viewer */}
            {(viewMode === 'split' || viewMode === 'documents') && (
              <div className="flex flex-col h-full overflow-hidden">
                <DocumentSelector
                  documents={documents}
                  selectedId={selectedDocument?.id}
                  onSelect={handleSelectDocument}
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
        )}
      </div>
    </div>
  );
}
