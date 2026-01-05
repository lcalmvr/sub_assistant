import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateFieldVerification, acceptExtraction } from '../../api/client';

// ─────────────────────────────────────────────────────────────
// Utility Components
// ─────────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence, size = 'sm' }) {
  if (confidence === null || confidence === undefined) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const percent = Math.round(confidence * 100);

  let colorClass;
  if (percent >= 80) {
    colorClass = 'bg-green-100 text-green-700';
  } else if (percent >= 50) {
    colorClass = 'bg-yellow-100 text-yellow-700';
  } else {
    colorClass = 'bg-red-100 text-red-700';
  }

  const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <span className={`${sizeClass} rounded font-medium ${colorClass}`} title={`${percent}% confidence`}>
      {percent}%
    </span>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-gray-100 text-gray-600',
    confirmed: 'bg-green-100 text-green-700',
    corrected: 'bg-blue-100 text-blue-700',
  };

  const labels = {
    pending: 'Pending',
    confirmed: 'Verified',
    corrected: 'Corrected',
  };

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${styles[status] || styles.pending}`}>
      {labels[status] || 'Pending'}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Required Verification Item
// ─────────────────────────────────────────────────────────────

function RequiredVerificationItem({
  fieldName,
  label,
  value,
  displayValue,
  description,
  status,
  extraction,
  submissionId,
  onShowSource,
  onVerificationUpdate,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const queryClient = useQueryClient();

  const verifyMutation = useMutation({
    mutationFn: (data) => updateFieldVerification(submissionId, fieldName, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['verifications', submissionId]);
      queryClient.invalidateQueries(['submission', submissionId]);
      onVerificationUpdate?.();
    },
  });

  const handleVerify = () => {
    verifyMutation.mutate({
      status: 'confirmed',
      original_value: String(value || ''),
    });
  };

  const handleStartEdit = () => {
    setEditValue(displayValue || '');
    setIsEditing(true);
  };

  const handleSave = () => {
    verifyMutation.mutate({
      status: 'corrected',
      original_value: String(value || ''),
      corrected_value: editValue,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const hasValue = value != null && value !== '';
  const isVerified = status === 'confirmed' || status === 'corrected';
  const hasSource = extraction?.page != null;

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        !hasValue
          ? 'bg-gray-50 border-gray-200 opacity-60'
          : isVerified
            ? 'bg-green-50 border-green-200'
            : 'bg-white border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isVerified ? 'text-green-800' : 'text-gray-900'}`}>
              {label}
            </span>
            {status && status !== 'pending' && <StatusBadge status={status} />}
            {extraction?.confidence != null && (
              <ConfidenceBadge confidence={extraction.confidence} />
            )}
          </div>

          {/* Value or edit field */}
          {isEditing ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 text-sm border rounded px-2 py-1"
                autoFocus
              />
              <button
                onClick={handleSave}
                disabled={verifyMutation.isPending}
                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="mt-1">
              <span className={`text-sm ${hasValue ? (isVerified ? 'text-green-700' : 'text-gray-700') : 'text-gray-400 italic'}`}>
                {displayValue || 'Not extracted'}
              </span>
            </div>
          )}

          {/* Description */}
          <p className="text-xs text-gray-500 mt-1">{description}</p>

          {/* Source reference */}
          {hasSource && (
            <button
              onClick={() => onShowSource?.(
                extraction.page,
                extraction.document_id,
                extraction.value,
                extraction.source_text,
                extraction.bbox,
                extraction.answer_bbox,
                extraction.question_bbox
              )}
              className="text-xs text-purple-600 hover:text-purple-800 mt-1 flex items-center gap-1"
            >
              <span>View source (p.{extraction.page})</span>
              {extraction.document_name && (
                <span className="text-gray-400">· {extraction.document_name.slice(0, 25)}...</span>
              )}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {hasValue && !isVerified && !isEditing && (
            <>
              <button
                onClick={handleStartEdit}
                className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
              >
                Edit
              </button>
              <button
                onClick={handleVerify}
                disabled={verifyMutation.isPending}
                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                {verifyMutation.isPending ? '...' : 'Verify'}
              </button>
            </>
          )}
          {isVerified && (
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Required Verifications Section
// ─────────────────────────────────────────────────────────────

function RequiredVerificationsSection({
  submission,
  extractions,
  verifications,
  submissionId,
  onShowSource,
  onVerificationUpdate,
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Format helpers
  const formatCompact = (value) => {
    if (!value) return null;
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Find extraction for a field from the extractions data
  const findExtraction = (sectionKey, fieldKey) => {
    if (!extractions?.sections) return null;
    const section = extractions.sections[sectionKey];
    if (!section) return null;
    return section[fieldKey] || null;
  };

  // Build the required verification items
  const items = [
    {
      key: 'company_name',
      label: 'Company Name',
      value: submission?.applicant_name,
      displayValue: submission?.applicant_name,
      description: 'AI analyzed the correct company',
      extraction: findExtraction('companyInfo', 'companyName') || findExtraction('companyInfo', 'applicantName'),
    },
    {
      key: 'revenue',
      label: 'Revenue',
      value: submission?.annual_revenue,
      displayValue: formatCompact(submission?.annual_revenue),
      description: 'Extracted amount matches source',
      extraction: findExtraction('companyInfo', 'annualRevenue') || findExtraction('financials', 'annualRevenue'),
    },
    {
      key: 'business_description',
      label: 'Business Description',
      value: submission?.business_summary,
      displayValue: submission?.business_summary ?
        (submission.business_summary.length > 100 ? submission.business_summary.slice(0, 100) + '...' : submission.business_summary)
        : null,
      description: 'Company operations summary',
      extraction: findExtraction('companyInfo', 'businessDescription'),
    },
    {
      key: 'website',
      label: 'Website',
      value: submission?.website,
      displayValue: submission?.website,
      description: 'Company website URL',
      extraction: findExtraction('companyInfo', 'website'),
    },
    {
      key: 'broker',
      label: 'Broker',
      value: submission?.broker_name || submission?.broker_email,
      displayValue: submission?.broker_name || submission?.broker_email,
      description: 'Correct broker contact linked',
      extraction: findExtraction('brokerInfo', 'brokerName') || findExtraction('brokerInfo', 'producerName'),
    },
    {
      key: 'policy_period',
      label: 'Policy Period',
      value: submission?.effective_date && submission?.expiration_date ? 'set' : null,
      displayValue: submission?.effective_date && submission?.expiration_date
        ? `${formatDate(submission.effective_date)} – ${formatDate(submission.expiration_date)}`
        : null,
      description: 'Dates are accurate',
      extraction: findExtraction('policyInfo', 'effectiveDate') || findExtraction('policyDetails', 'effectiveDate'),
    },
    {
      key: 'industry',
      label: 'Industry',
      value: submission?.naics_primary_title,
      displayValue: submission?.naics_primary_title,
      description: 'Classification is correct',
      extraction: findExtraction('companyInfo', 'industry') || findExtraction('companyInfo', 'naicsCode'),
    },
  ];

  // Calculate progress
  const itemsWithValue = items.filter(i => i.value != null && i.value !== '');
  const verifiedCount = items.filter(i => {
    const v = verifications?.verifications?.[i.key];
    return v?.status === 'confirmed' || v?.status === 'corrected';
  }).length;

  const progress = {
    completed: verifiedCount,
    total: itemsWithValue.length,
  };

  const allVerified = progress.completed === progress.total && progress.total > 0;

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
          allVerified ? 'bg-green-50 hover:bg-green-100' : 'bg-purple-50 hover:bg-purple-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-4 h-4 transition-transform ${allVerified ? 'text-green-600' : 'text-purple-600'} ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={`font-semibold ${allVerified ? 'text-green-800' : 'text-purple-800'}`}>
            Required Verifications
          </span>
          <span className={`text-sm ${allVerified ? 'text-green-600' : 'text-purple-600'}`}>
            ({progress.completed}/{progress.total})
          </span>
        </div>
        {allVerified ? (
          <span className="flex items-center gap-1 text-sm text-green-700 font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            All verified
          </span>
        ) : (
          <span className="text-sm text-purple-600">
            {progress.total - progress.completed} remaining
          </span>
        )}
      </button>

      {/* Items */}
      {isExpanded && (
        <div className="p-4 space-y-2 bg-gray-50/50">
          {items.map((item) => (
            <RequiredVerificationItem
              key={item.key}
              fieldName={item.key}
              label={item.label}
              value={item.value}
              displayValue={item.displayValue}
              description={item.description}
              status={verifications?.verifications?.[item.key]?.status || 'pending'}
              extraction={item.extraction}
              submissionId={submissionId}
              onShowSource={onShowSource}
              onVerificationUpdate={onVerificationUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Extraction Field Row (reused from ExtractionPanel)
// ─────────────────────────────────────────────────────────────

function ExtractionFieldRow({ fieldName, extraction, onShowSource, onAcceptValue }) {
  const [showConflict, setShowConflict] = useState(false);

  const displayName = fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();

  const formatValue = (value) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ') || '—';
    if (typeof value === 'number') {
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return value.toString();
    }
    return String(value);
  };

  const handleAccept = async (extractionId) => {
    if (onAcceptValue) {
      await onAcceptValue(extractionId);
      setShowConflict(false);
    }
  };

  if (!extraction.is_present) {
    return null;
  }

  const hasConflict = extraction.has_conflict && extraction.all_values?.length > 1;

  return (
    <div className={`py-2 border-b border-gray-100 ${hasConflict ? 'bg-orange-50' : 'hover:bg-gray-50'} group`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">{displayName}</span>
            <ConfidenceBadge confidence={extraction.confidence} />
            {hasConflict && (
              <button
                onClick={() => setShowConflict(!showConflict)}
                className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium hover:bg-orange-200"
              >
                Conflict
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-sm ${extraction.value !== null ? 'text-gray-900' : 'text-gray-400 italic'}`}>
              {formatValue(extraction.value)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2">
          {extraction.page && (
            <button
              onClick={() => onShowSource?.(
                extraction.page,
                extraction.document_id,
                extraction.value,
                extraction.source_text,
                extraction.bbox,
                extraction.answer_bbox,
                extraction.question_bbox
              )}
              className="text-xs px-2 py-1 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded"
            >
              p.{extraction.page}
            </button>
          )}
        </div>
      </div>

      {/* Conflict resolution panel */}
      {showConflict && hasConflict && (
        <div className="mt-2 ml-4 p-2 bg-white border border-orange-200 rounded">
          <p className="text-xs font-medium text-orange-700 mb-2">
            Different values found:
          </p>
          <div className="space-y-2">
            {extraction.all_values.map((val, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                <div className="flex-1">
                  <span className="font-medium">{formatValue(val.value)}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    from {val.document_name || 'Unknown'}
                  </span>
                  {val.is_accepted && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                      Accepted
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {val.page && (
                    <button
                      onClick={() => onShowSource?.(
                        val.page,
                        val.document_id,
                        val.value,
                        val.source_text,
                        val.bbox,
                        val.answer_bbox,
                        val.question_bbox
                      )}
                      className="text-xs px-2 py-1 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded"
                    >
                      View
                    </button>
                  )}
                  {!val.is_accepted && (
                    <button
                      onClick={() => handleAccept(val.id)}
                      className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      Accept
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Extraction Section
// ─────────────────────────────────────────────────────────────

function ExtractionSection({ sectionName, fields, onShowSource, onAcceptValue, defaultExpanded = false }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const displayName = sectionName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();

  // Count present fields and conflicts
  const presentFields = Object.values(fields).filter(f => f.is_present);
  const conflictCount = presentFields.filter(f => f.has_conflict && f.all_values?.length > 1).length;

  if (presentFields.length === 0) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-gray-900">{displayName}</span>
          <span className="text-xs text-gray-500">
            {presentFields.length} field{presentFields.length !== 1 ? 's' : ''}
          </span>
        </div>
        {conflictCount > 0 && (
          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
            {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="px-4 py-2">
          {Object.entries(fields).map(([fieldName, extraction]) => (
            <ExtractionFieldRow
              key={fieldName}
              fieldName={fieldName}
              extraction={extraction}
              onShowSource={onShowSource}
              onAcceptValue={onAcceptValue}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Unified Extraction Panel
// ─────────────────────────────────────────────────────────────

export default function UnifiedExtractionPanel({
  submission,
  extractions,
  verifications,
  submissionId,
  isLoading = false,
  onShowSource,
  onVerificationUpdate,
  className = '',
}) {
  const queryClient = useQueryClient();

  const acceptExtractionMutation = useMutation({
    mutationFn: (extractionId) => acceptExtraction(extractionId),
    onSuccess: () => {
      queryClient.invalidateQueries(['extractions', submissionId]);
    },
  });

  const handleAcceptValue = async (extractionId) => {
    await acceptExtractionMutation.mutateAsync(extractionId);
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const hasExtractions = extractions?.sections && Object.keys(extractions.sections).length > 0;

  if (!hasExtractions && !submission) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-center p-8 ${className}`}>
        <div className="text-gray-400 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-gray-500">No data available</p>
        <p className="text-sm text-gray-400 mt-1">Extract data from documents to see results here</p>
      </div>
    );
  }

  // Calculate total conflict count
  const totalConflicts = hasExtractions
    ? Object.values(extractions.sections).reduce((total, section) => {
        return total + Object.values(section).filter(f => f.has_conflict && f.all_values?.length > 1).length;
      }, 0)
    : 0;

  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Extraction Review</h3>
          <div className="flex items-center gap-3 text-sm">
            {verifications?.progress && (
              <span className={`font-medium ${
                verifications.progress.completed === verifications.progress.total
                  ? 'text-green-600'
                  : 'text-purple-600'
              }`}>
                {verifications.progress.completed}/{verifications.progress.total} verified
              </span>
            )}
            {totalConflicts > 0 && (
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                {totalConflicts} conflict{totalConflicts !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* Required Verifications - always at top */}
        <RequiredVerificationsSection
          submission={submission}
          extractions={extractions}
          verifications={verifications}
          submissionId={submissionId}
          onShowSource={onShowSource}
          onVerificationUpdate={onVerificationUpdate}
        />

        {/* All Extractions */}
        {hasExtractions && Object.entries(extractions.sections)
          .filter(([sectionName]) => sectionName !== '_unmapped')
          .map(([sectionName, fields]) => (
            <ExtractionSection
              key={sectionName}
              sectionName={sectionName}
              fields={fields}
              onShowSource={onShowSource}
              onAcceptValue={handleAcceptValue}
            />
          ))}

        {/* Unmapped fields */}
        {hasExtractions && extractions.sections._unmapped &&
         Object.keys(extractions.sections._unmapped).length > 0 && (
          <div className="border border-amber-300 rounded-lg overflow-hidden bg-amber-50/30">
            <ExtractionSection
              sectionName="Legacy / Unmapped Fields"
              fields={extractions.sections._unmapped}
              onShowSource={onShowSource}
              onAcceptValue={handleAcceptValue}
            />
          </div>
        )}
      </div>
    </div>
  );
}
