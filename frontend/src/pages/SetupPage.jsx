import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubmission,
  updateSubmission,
  getSubmissionDocuments,
  getExtractions,
  getFieldVerifications,
  updateFieldVerification,
  uploadSubmissionDocument,
  acceptExtraction,
  unacceptExtraction,
  createAiResearchTask,
  getAiResearchTasks,
  reviewAiResearchTask,
} from '../api/client';
import PdfHighlighter from '../components/review/PdfHighlighter';
import BrokerSelector from '../components/BrokerSelector';
import DateRangePicker from '../components/DateRangePicker';

// ─────────────────────────────────────────────────────────────
// Submission Summary Card (orientation/context for UW)
// Single edit mode for all fields
// ─────────────────────────────────────────────────────────────

const btnPrimary = "px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors";
const btnSecondary = "px-4 py-2 text-sm font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors";
const inputBase = "px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none";

function SubmissionSummaryCard({ submission, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [brokerDraft, setBrokerDraft] = useState(null);

  if (!submission) return null;

  // --- Formatting helpers ---
  const formatRevenueDisplay = (value) => {
    if (!value) return null;
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  // Format date WITHOUT timezone issues - parse YYYY-MM-DD directly
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[month - 1]} ${day}, ${year}`;
  };

  const policyPeriod = submission.effective_date && submission.expiration_date
    ? `${formatDate(submission.effective_date)} – ${formatDate(submission.expiration_date)}`
    : null;

  const formatAddress = () => {
    const parts = [];
    if (submission.address_street) parts.push(submission.address_street);
    if (submission.address_street2) parts.push(submission.address_street2);
    const cityStateZip = [
      submission.address_city,
      submission.address_state,
      submission.address_zip
    ].filter(Boolean).join(submission.address_city && submission.address_state ? ', ' : ' ');
    if (cityStateZip) parts.push(cityStateZip);
    return parts.length > 0 ? parts : null;
  };

  const addressParts = formatAddress();

  // --- Edit mode handlers ---
  const handleStartEdit = () => {
    const hasDates = submission.effective_date && submission.expiration_date;
    setDraft({
      address_street: submission.address_street || '',
      address_city: submission.address_city || '',
      address_state: submission.address_state || '',
      address_zip: submission.address_zip || '',
      annual_revenue: submission.annual_revenue ? submission.annual_revenue.toLocaleString() : '',
      effective_date: submission.effective_date || '',
      expiration_date: submission.expiration_date || '',
      dates_tbd: !hasDates,
    });
    setBrokerDraft(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setBrokerDraft(null);
  };

  const handleSave = () => {
    const updates = {};

    // Address
    if (draft.address_street !== (submission.address_street || '')) updates.address_street = draft.address_street || null;
    if (draft.address_city !== (submission.address_city || '')) updates.address_city = draft.address_city || null;
    if (draft.address_state !== (submission.address_state || '')) updates.address_state = draft.address_state || null;
    if (draft.address_zip !== (submission.address_zip || '')) updates.address_zip = draft.address_zip || null;

    // Revenue
    const parsedRevenue = parseInt(draft.annual_revenue.replace(/[^0-9]/g, ''), 10) || null;
    if (parsedRevenue !== submission.annual_revenue) updates.annual_revenue = parsedRevenue;

    // Dates
    if (draft.dates_tbd) {
      if (submission.effective_date) updates.effective_date = null;
      if (submission.expiration_date) updates.expiration_date = null;
    } else {
      if (draft.effective_date !== (submission.effective_date || '')) updates.effective_date = draft.effective_date || null;
      if (draft.expiration_date !== (submission.expiration_date || '')) updates.expiration_date = draft.expiration_date || null;
    }

    // Broker
    if (brokerDraft) {
      updates.broker_employment_id = brokerDraft.employment_id;
      updates.broker_email = brokerDraft.email;
    }

    if (Object.keys(updates).length > 0) {
      onUpdate?.(updates);
    }
    setIsEditing(false);
    setBrokerDraft(null);
  };

  const handleEffectiveChange = (value) => {
    const newDraft = { ...draft, effective_date: value, dates_tbd: false };
    // Auto-set expiration to +1 year
    if (value) {
      const [year, month, day] = value.split('-').map(Number);
      newDraft.expiration_date = `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    setDraft(newDraft);
  };

  const handleRevenueChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setDraft(prev => ({ ...prev, annual_revenue: raw ? parseInt(raw, 10).toLocaleString() : '' }));
  };

  // --- Render ---
  if (isEditing) {
    return (
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100 px-6 py-5">
        <div className="space-y-4">
          {/* Row 1: Address */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Address</label>
            <div className="flex items-center gap-3 flex-wrap">
              <input type="text" placeholder="Street address" value={draft.address_street}
                onChange={(e) => setDraft(prev => ({ ...prev, address_street: e.target.value }))}
                className={`${inputBase} flex-1 min-w-[200px]`} />
              <input type="text" placeholder="City" value={draft.address_city}
                onChange={(e) => setDraft(prev => ({ ...prev, address_city: e.target.value }))}
                className={`${inputBase} w-36`} />
              <input type="text" placeholder="ST" value={draft.address_state}
                onChange={(e) => setDraft(prev => ({ ...prev, address_state: e.target.value.toUpperCase().slice(0, 2) }))}
                className={`${inputBase} w-16 uppercase text-center`} />
              <input type="text" placeholder="ZIP" value={draft.address_zip}
                onChange={(e) => setDraft(prev => ({ ...prev, address_zip: e.target.value }))}
                className={`${inputBase} w-24`} />
            </div>
          </div>

          {/* Row 2: Revenue, Broker, Policy Period */}
          <div className="grid grid-cols-3 gap-6">
            {/* Revenue */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Revenue</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input type="text" value={draft.annual_revenue} onChange={handleRevenueChange}
                  placeholder="12,000,000" className={`${inputBase} w-full pl-7`} />
              </div>
            </div>

            {/* Broker */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Broker</label>
              <BrokerSelector
                value={submission.broker_employment_id}
                brokerEmail={submission.broker_email}
                brokerName={submission.broker_name}
                onChange={setBrokerDraft}
                compact
                placeholder="Search brokers..."
              />
              {brokerDraft && (
                <div className="text-xs text-green-600 mt-1">Will change to: {brokerDraft.person_name}</div>
              )}
            </div>

            {/* Policy Period */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Policy Period</label>
              <label className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <input type="checkbox" checked={draft.dates_tbd}
                  onChange={(e) => setDraft(prev => ({ ...prev, dates_tbd: e.target.checked, effective_date: '', expiration_date: '' }))}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <span>12 month term (TBD)</span>
              </label>
              {!draft.dates_tbd && (
                <div className="flex items-center gap-2">
                  <input type="date" value={draft.effective_date}
                    onChange={(e) => handleEffectiveChange(e.target.value)}
                    className={`${inputBase} flex-1`} />
                  <span className="text-gray-400 text-sm">to</span>
                  <input type="date" value={draft.expiration_date}
                    onChange={(e) => setDraft(prev => ({ ...prev, expiration_date: e.target.value }))}
                    className={`${inputBase} flex-1`} />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-purple-100">
            <button type="button" onClick={handleCancel} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={handleSave} className={btnPrimary}>Save Changes</button>
          </div>
        </div>
      </div>
    );
  }

  // --- View mode ---
  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100 px-6 py-4">
      <div className="flex items-start justify-between gap-6">
        {/* Left: Company info */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Company name & website */}
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {submission.applicant_name || 'Unnamed Submission'}
            </h2>
            {submission.website && (
              <a
                href={submission.website.startsWith('http') ? submission.website : `https://${submission.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1 flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {submission.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            )}
            {/* Edit button */}
            <button type="button" onClick={handleStartEdit}
              className="ml-auto text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-purple-100 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit
            </button>
          </div>

          {/* Address */}
          <div className="text-sm text-gray-600">
            {addressParts ? addressParts.join(' · ') : <span className="text-gray-400 italic">No address</span>}
          </div>

          {/* Industry */}
          {submission.naics_primary_title && (
            <p className="text-xs text-gray-500 truncate">{submission.naics_primary_title}</p>
          )}
        </div>

        {/* Right: Key metrics */}
        <div className="flex items-start gap-8 flex-shrink-0">
          {/* Revenue */}
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Revenue</div>
            <div className={`text-sm font-semibold ${submission.annual_revenue ? 'text-gray-900' : 'text-gray-400'}`}>
              {submission.annual_revenue ? formatRevenueDisplay(submission.annual_revenue) : '—'}
            </div>
          </div>

          {/* Broker */}
          <div className="text-center border-l border-purple-200/50 pl-8">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Broker</div>
            <div className={`text-sm font-medium ${submission.broker_name ? 'text-gray-900' : 'text-gray-400'}`}>
              {submission.broker_name || submission.broker_company || '—'}
            </div>
            {submission.broker_name && submission.broker_company && (
              <div className="text-xs text-gray-500">{submission.broker_company}</div>
            )}
            {/* Broker contact - show actual values */}
            {(submission.broker_contact_email || submission.broker_phone) && (
              <div className="mt-1.5 space-y-0.5">
                {submission.broker_contact_email && (
                  <a href={`mailto:${submission.broker_contact_email}`}
                    className="text-xs text-purple-600 hover:text-purple-800 block truncate max-w-[180px]"
                    title={submission.broker_contact_email}>
                    {submission.broker_contact_email}
                  </a>
                )}
                {submission.broker_phone && (
                  <div className="text-xs text-gray-500">{submission.broker_phone}</div>
                )}
              </div>
            )}
          </div>

          {/* Policy Period */}
          <div className="text-center border-l border-purple-200/50 pl-8">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Policy Period</div>
            <div className={`text-sm font-medium ${policyPeriod ? 'text-gray-900' : 'text-purple-600'}`}>
              {policyPeriod || '12 month term'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header Bar (View Mode + Document Selector combined)
// ─────────────────────────────────────────────────────────────

function HeaderBar({
  mode,
  onModeChange,
  verificationProgress,
  conflictCount,
  documents,
  selectedDocId,
  onSelectDoc,
  onUpload,
  isUploading,
}) {
  const allVerified = verificationProgress?.completed === verificationProgress?.total && verificationProgress?.total > 0;
  const hasConflicts = conflictCount > 0;

  // Document selector expand/collapse state
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [hasWrapped, setHasWrapped] = useState(false);
  const docsContainerRef = useRef(null);

  // Check if documents have wrapped to multiple lines
  useLayoutEffect(() => {
    const container = docsContainerRef.current;
    if (!container) return;

    // Compare scroll height to client height to detect wrapping
    const checkWrap = () => {
      const firstChild = container.firstElementChild;
      if (!firstChild) return;

      // Get all child elements and check if any are on different rows
      const children = Array.from(container.children);
      if (children.length <= 1) {
        setHasWrapped(false);
        return;
      }

      const firstTop = children[0]?.getBoundingClientRect().top;
      const wrapped = children.some(child => child.getBoundingClientRect().top > firstTop);
      setHasWrapped(wrapped);
    };

    checkWrap();
    window.addEventListener('resize', checkWrap);
    return () => window.removeEventListener('resize', checkWrap);
  }, [documents?.documents?.length, docsExpanded]);

  const typeIcons = {
    'application': '📋', 'Application Form': '📋',
    'loss_run': '📊', 'Loss Runs': '📊',
    'financial': '💰', 'Financial Statement': '💰',
    'policy': '📜', 'Email': '📧', 'other': '📄', 'Other': '📄',
  };

  return (
    <div className="px-4 py-2 bg-gray-100 border-b">
      <div className="flex items-start justify-between gap-4">
        {/* Left: View mode toggles */}
        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
          {/* Docs only */}
          <button
            onClick={() => onModeChange('docs')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              mode === 'docs'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            Docs
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          {/* Split options */}
          <button
            onClick={() => onModeChange('extract')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              mode === 'extract'
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            + Extract
          </button>

          <button
            onClick={() => onModeChange('required')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              mode === 'required'
                ? 'bg-white shadow text-gray-900'
                : allVerified
                  ? 'bg-green-50 text-green-700 hover:bg-green-100'
                  : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {allVerified && (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span>+ Required</span>
            {verificationProgress && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                allVerified ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'
              }`}>
                {verificationProgress.completed}/{verificationProgress.total}
              </span>
            )}
          </button>

          {hasConflicts && (
            <button
              onClick={() => onModeChange('conflicts')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                mode === 'conflicts'
                  ? 'bg-white shadow text-gray-900'
                  : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
              }`}
            >
              <span>+ Conflicts</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-orange-200 text-orange-800">
                {conflictCount}
              </span>
            </button>
          )}
        </div>

        {/* Right: Document selector with wrap support */}
        <div className="flex items-start gap-2 min-w-0 flex-1 justify-end">
          <div
            ref={docsContainerRef}
            className={`flex flex-wrap gap-2 justify-end ${
              !docsExpanded && hasWrapped ? 'max-h-[38px] overflow-hidden' : ''
            }`}
          >
            {documents?.documents?.map((doc) => (
              <button
                key={doc.id}
                onClick={() => onSelectDoc(doc)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                  selectedDocId === doc.id
                    ? 'bg-purple-100 text-purple-700 border border-purple-300'
                    : 'bg-white hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <span className="text-base">{typeIcons[doc.type] || '📄'}</span>
                <span className="font-medium truncate max-w-[120px]">{doc.filename}</span>
              </button>
            ))}

            <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm cursor-pointer whitespace-nowrap ${
              isUploading
                ? 'bg-gray-100 text-gray-400'
                : 'bg-white hover:bg-purple-50 border border-dashed border-purple-300 text-purple-600'
            }`}>
              {isUploading ? (
                <span className="animate-spin h-3.5 w-3.5 border-2 border-purple-600 border-t-transparent rounded-full"></span>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
              <span>{isUploading ? 'Uploading...' : 'Add'}</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpload(file, null);
                }}
                disabled={isUploading}
              />
            </label>
          </div>

          {/* Expand/collapse toggle - only show when wrapped */}
          {hasWrapped && (
            <button
              onClick={() => setDocsExpanded(!docsExpanded)}
              className="flex-shrink-0 p-1.5 text-gray-500 hover:bg-gray-200 rounded transition-colors"
              title={docsExpanded ? 'Collapse' : 'Expand'}
            >
              <svg
                className={`w-4 h-4 transition-transform ${docsExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Business Description Verification Component
// ─────────────────────────────────────────────────────────────

function BusinessDescriptionVerification({
  value,
  status,
  submissionId,
  onVerify,
  onUnverify,
  onFlag,
  pendingTask,
  onReviewTask,
}) {
  const [showModal, setShowModal] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagType, setFlagType] = useState(null);
  const [flagContext, setFlagContext] = useState('');
  const [showTaskResult, setShowTaskResult] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isVerified = status === 'confirmed' || status === 'corrected';
  // Single line truncation - roughly 60 chars for the narrow panel
  const truncatedValue = value?.length > 60 ? value.slice(0, 60) + '...' : value;

  const handleSubmitFlag = async () => {
    setIsSubmitting(true);
    try {
      await onFlag(flagType, flagContext);
      setShowFlagModal(false);
      setFlagType(null);
      setFlagContext('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if there's a pending or completed task
  const hasPendingTask = pendingTask?.status === 'pending' || pendingTask?.status === 'processing';
  const hasCompletedTask = pendingTask?.status === 'completed' && !pendingTask?.review_outcome;

  return (
    <>
      {/* Compact card matching other verification items */}
      <div className={`p-4 rounded-lg border transition-colors ${
        hasCompletedTask ? 'bg-purple-50 border-purple-300' :
        hasPendingTask ? 'bg-yellow-50 border-yellow-300' :
        isVerified ? 'bg-green-50 border-green-200' :
        value ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${
                hasCompletedTask ? 'text-purple-800' :
                hasPendingTask ? 'text-yellow-800' :
                isVerified ? 'text-green-800' : 'text-gray-900'
              }`}>
                Business Description
              </span>
              {hasPendingTask && (
                <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700 flex items-center gap-1">
                  <span className="animate-spin h-3 w-3 border-2 border-yellow-600 border-t-transparent rounded-full"></span>
                  AI Researching
                </span>
              )}
              {hasCompletedTask && (
                <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
                  AI Proposal Ready
                </span>
              )}
              {isVerified && !hasPendingTask && !hasCompletedTask && (
                <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700">
                  Verified
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`text-sm truncate ${value ? (isVerified ? 'text-green-700' : 'text-gray-700') : 'text-gray-400 italic'}`}>
                {truncatedValue || 'Not extracted'}
              </span>
              {value && !hasPendingTask && !hasCompletedTask && (
                <button
                  onClick={() => setShowModal(true)}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium flex-shrink-0"
                >
                  Review
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {hasCompletedTask && (
              <button
                onClick={() => setShowTaskResult(true)}
                className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Review AI Proposal
              </button>
            )}
            {!hasPendingTask && !hasCompletedTask && value && !isVerified && (
              <>
                <button
                  onClick={onVerify}
                  className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                >
                  Verify
                </button>
                <button
                  onClick={() => setShowFlagModal(true)}
                  className="text-xs px-2 py-1 text-orange-600 hover:bg-orange-50 rounded"
                >
                  Flag
                </button>
              </>
            )}
            {isVerified && !hasPendingTask && !hasCompletedTask && (
              <div className="flex items-center gap-1">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <button
                  onClick={onUnverify}
                  className="text-xs px-1.5 py-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  title="Undo verification"
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full description review modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Business Description</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {value || 'No description available'}
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
              {!isVerified ? (
                <>
                  <button
                    onClick={() => { setShowModal(false); setShowFlagModal(true); }}
                    className="px-4 py-2 text-sm text-orange-700 hover:bg-orange-100 rounded"
                  >
                    Flag Issue
                  </button>
                  <button
                    onClick={() => { onVerify(); setShowModal(false); }}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Looks Right
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Flag modal with AI conversation context */}
      {showFlagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Flag Business Description</h3>
              <button onClick={() => setShowFlagModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">What's the issue?</label>
                <div className="space-y-2">
                  <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    flagType === 'wrong_company' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="flagType"
                      checked={flagType === 'wrong_company'}
                      onChange={() => setFlagType('wrong_company')}
                      className="text-orange-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Wrong company</span>
                      <p className="text-xs text-gray-500">This description is for a different company</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    flagType === 'inaccurate' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="flagType"
                      checked={flagType === 'inaccurate'}
                      onChange={() => setFlagType('inaccurate')}
                      className="text-orange-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Inaccurate description</span>
                      <p className="text-xs text-gray-500">The description is outdated or incorrect</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    flagType === 'other' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="flagType"
                      checked={flagType === 'other'}
                      onChange={() => setFlagType('other')}
                      className="text-orange-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Other issue</span>
                      <p className="text-xs text-gray-500">Something else needs attention</p>
                    </div>
                  </label>
                </div>
              </div>

              {flagType && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Help AI understand the issue
                  </label>
                  <textarea
                    value={flagContext}
                    onChange={(e) => setFlagContext(e.target.value)}
                    placeholder={
                      flagType === 'wrong_company'
                        ? "What company is this actually? Any details that might help identify the correct business..."
                        : flagType === 'inaccurate'
                        ? "What's incorrect? What should the description say instead..."
                        : "Describe the issue..."
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    AI will use this to research and propose a corrected description
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setShowFlagModal(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitFlag}
                disabled={!flagType || isSubmitting}
                className="px-4 py-2 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting && (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                )}
                {isSubmitting ? 'Submitting...' : 'Submit for AI Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Proposal Review Modal */}
      {showTaskResult && pendingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-purple-50">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">AI Proposed Description</h3>
                <p className="text-sm text-gray-500">Review and accept, modify, or reject</p>
              </div>
              <button onClick={() => setShowTaskResult(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
              {/* Original vs Proposed comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Original</label>
                  <div className="p-3 bg-gray-50 rounded border text-sm text-gray-700 max-h-32 overflow-y-auto">
                    {pendingTask.original_value || 'No original value'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-purple-600 mb-1">AI Proposed</label>
                  <div className="p-3 bg-purple-50 rounded border border-purple-200 text-sm text-gray-900 max-h-32 overflow-y-auto">
                    {pendingTask.proposed_value || 'No proposal'}
                  </div>
                </div>
              </div>

              {/* AI reasoning */}
              {pendingTask.ai_reasoning && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">AI Reasoning</label>
                  <div className="p-3 bg-blue-50 rounded border border-blue-200 text-sm text-gray-700">
                    {pendingTask.ai_reasoning}
                  </div>
                </div>
              )}

              {/* Confidence */}
              {pendingTask.confidence != null && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Confidence:</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                    pendingTask.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                    pendingTask.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {Math.round(pendingTask.confidence * 100)}%
                  </span>
                </div>
              )}

              {/* Sources */}
              {pendingTask.sources_consulted?.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Sources</label>
                  <div className="flex flex-wrap gap-1">
                    {pendingTask.sources_consulted.map((source, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-between gap-2">
              <button
                onClick={() => {
                  onReviewTask(pendingTask.id, 'rejected');
                  setShowTaskResult(false);
                }}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded border border-red-200"
              >
                Reject
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTaskResult(false)}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded"
                >
                  Review Later
                </button>
                <button
                  onClick={() => {
                    onReviewTask(pendingTask.id, 'accepted');
                    setShowTaskResult(false);
                  }}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Accept Proposal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Policy Period Edit Component
// ─────────────────────────────────────────────────────────────

function PolicyPeriodEdit({ submission, onSave, onCancel, hasExtraction }) {
  const [effective, setEffective] = useState(submission?.effective_date || '');
  const [expiration, setExpiration] = useState(submission?.expiration_date || '');
  const [isTbd, setIsTbd] = useState(!submission?.effective_date && !hasExtraction);

  // Auto-calculate expiration as effective + 1 year
  const handleEffectiveChange = (value) => {
    setEffective(value);
    if (value) {
      const effectiveDate = new Date(value);
      const expirationDate = new Date(effectiveDate);
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);
      setExpiration(expirationDate.toISOString().split('T')[0]);
      setIsTbd(false);
    }
  };

  const handleTbdChange = (checked) => {
    setIsTbd(checked);
    if (checked) {
      setEffective('');
      setExpiration('');
    }
  };

  const handleSave = () => {
    if (isTbd) {
      onSave({ effective_date: null, expiration_date: null });
    } else {
      onSave({ effective_date: effective || null, expiration_date: expiration || null });
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {/* TBD checkbox - only show if no extraction */}
      {!hasExtraction && (
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={isTbd}
            onChange={(e) => handleTbdChange(e.target.checked)}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span>TBD (dates not yet determined)</span>
        </label>
      )}

      {/* Date inputs */}
      {!isTbd && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={effective}
            onChange={(e) => handleEffectiveChange(e.target.value)}
            className="px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
            className="px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Required Verification Item (with proper edit components)
// ─────────────────────────────────────────────────────────────

function RequiredVerificationItem({
  fieldKey,
  label,
  value,
  displayValue,
  description,
  status,
  extraction,
  submission,
  submissionId,
  onShowSource,
  onUpdate,
  onAcceptValue,
  onClearAcceptedValue,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [pendingBroker, setPendingBroker] = useState(null);
  const queryClient = useQueryClient();

  // Check if this field has multiple extracted values (conflicts)
  // Always show conflict UI if multiple values exist, regardless of has_conflict flag
  const hasMultipleValues = extraction?.all_values?.length > 1;
  const acceptedConflictValue = extraction?.all_values?.find(v => v.is_accepted);
  const hasUnresolvedConflict = hasMultipleValues && !acceptedConflictValue;
  // hasConflict = unresolved conflict (needs action), used for orange styling/badge
  const hasConflict = hasUnresolvedConflict;

  const verifyMutation = useMutation({
    mutationFn: (data) => updateFieldVerification(submissionId, fieldKey, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['verifications', submissionId]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['submission', submissionId]);
      queryClient.invalidateQueries(['verifications', submissionId]);
      setIsEditing(false);
      onUpdate?.();
    },
  });

  const handleVerify = () => {
    verifyMutation.mutate({
      status: 'confirmed',
      original_value: String(value || ''),
    });
  };

  const handleUnverify = async () => {
    // Reset verification status
    verifyMutation.mutate({
      status: 'pending',
      original_value: null,
      corrected_value: null,
    });
    // Also clear any accepted extraction to restore conflict state
    if (acceptedConflictValue?.id) {
      await onClearAcceptedValue?.(acceptedConflictValue.id);
    }
  };

  // Handle accepting a conflict value - update field, accept extraction, AND verify
  const handleAcceptConflictValue = async (extractionId, acceptedValue) => {
    // Map field key to database field
    const fieldMap = {
      company_name: 'applicant_name',
      revenue: 'annual_revenue',
      business_description: 'business_summary',
      website: 'website',
      industry: 'naics_primary_title',
    };
    const dbField = fieldMap[fieldKey];

    // Update the submission field with the accepted value
    if (dbField) {
      let saveValue = acceptedValue;
      if (fieldKey === 'revenue' && typeof acceptedValue === 'string') {
        saveValue = parseInt(acceptedValue.replace(/[^0-9]/g, ''), 10) || null;
      }
      await updateMutation.mutateAsync({ [dbField]: saveValue });
    }

    // Accept the extraction
    await onAcceptValue?.(extractionId);

    // Verify the field
    verifyMutation.mutate({
      status: 'confirmed',
      original_value: String(acceptedValue || ''),
    });
  };

  const handleStartEdit = () => {
    setEditValue(value || '');
    setIsEditing(true);
  };

  const handleSaveText = () => {
    const fieldMap = {
      company_name: 'applicant_name',
      revenue: 'annual_revenue',
      business_description: 'business_summary',
      website: 'website',
      industry: 'naics_primary_title',
    };
    const dbField = fieldMap[fieldKey];
    if (!dbField) return;

    let saveValue = editValue;
    if (fieldKey === 'revenue') {
      saveValue = parseInt(editValue.replace(/[^0-9]/g, ''), 10) || null;
    }

    updateMutation.mutate({ [dbField]: saveValue });
    verifyMutation.mutate({
      status: 'corrected',
      original_value: String(value || ''),
      corrected_value: String(saveValue || ''),
    });
  };

  const handleBrokerSelect = (employment) => {
    // Just store the selection, don't save yet
    setPendingBroker(employment);
  };

  const handleBrokerSave = () => {
    if (!pendingBroker) return;
    updateMutation.mutate({
      broker_employment_id: pendingBroker.employment_id,
      broker_email: pendingBroker.email,
    });
    verifyMutation.mutate({
      status: 'corrected',
      original_value: submission?.broker_name || submission?.broker_email || '',
      corrected_value: `${pendingBroker.person_name} - ${pendingBroker.org_name}`,
    });
    setPendingBroker(null);
    setIsEditing(false);
  };

  const handleDateChange = ({ effective_date, expiration_date }) => {
    updateMutation.mutate({ effective_date, expiration_date });
    verifyMutation.mutate({
      status: 'corrected',
      original_value: displayValue || '',
      corrected_value: `${effective_date} to ${expiration_date}`,
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
    setPendingBroker(null);
  };

  const hasValue = value != null && value !== '';
  const isVerified = status === 'confirmed' || status === 'corrected';
  const hasSource = extraction?.page != null;

  // Render edit component based on field type
  const renderEditComponent = () => {
    if (fieldKey === 'broker') {
      return (
        <div className="mt-2 space-y-2">
          <div className="flex-1">
            <BrokerSelector
              value={pendingBroker?.employment_id || submission?.broker_employment_id}
              brokerEmail={pendingBroker?.email || submission?.broker_email}
              brokerName={pendingBroker ? `${pendingBroker.person_name} - ${pendingBroker.org_name}` : submission?.broker_name}
              onChange={handleBrokerSelect}
              compact
              placeholder="Search broker..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBrokerSave}
              disabled={!pendingBroker || updateMutation.isPending}
              className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>
      );
    }

    if (fieldKey === 'policy_period') {
      return <PolicyPeriodEdit
        submission={submission}
        onSave={handleDateChange}
        onCancel={handleCancel}
        hasExtraction={!!extraction}
      />;
    }

    // Revenue: formatted number input
    if (fieldKey === 'revenue') {
      const formatNumberWithCommas = (num) => {
        if (!num) return '';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      };
      const parseFormattedNumber = (str) => {
        return str.replace(/[^0-9]/g, '');
      };

      return (
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
            <input
              type="text"
              value={formatNumberWithCommas(editValue)}
              onChange={(e) => setEditValue(parseFormattedNumber(e.target.value))}
              className="w-full text-sm border rounded pl-5 pr-2 py-1 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveText();
                if (e.key === 'Escape') handleCancel();
              }}
            />
          </div>
          <button
            onClick={handleSaveText}
            disabled={updateMutation.isPending}
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
      );
    }

    // Default: text input
    return (
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="flex-1 text-sm border rounded px-2 py-1 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveText();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <button
          onClick={handleSaveText}
          disabled={updateMutation.isPending}
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
    );
  };

  const formatConflictValue = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') {
      if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    }
    return String(val);
  };

  return (
    <div
      className={`p-4 rounded-lg border transition-colors ${
        hasConflict
          ? 'bg-orange-50 border-orange-300'
          : isVerified
            ? 'bg-green-50 border-green-200'
            : hasValue
              ? 'bg-white border-gray-200'
              : 'bg-gray-50 border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium ${isVerified ? 'text-green-800' : hasConflict ? 'text-orange-800' : 'text-gray-900'}`}>
              {label}
            </span>
            {hasConflict && (
              <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-orange-200 text-orange-800">
                Conflict
              </span>
            )}
            {isVerified && !hasConflict && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {status === 'confirmed' ? 'Verified' : 'Corrected'}
              </span>
            )}
          </div>

          {/* Value or edit component */}
          {isEditing ? (
            renderEditComponent()
          ) : (
            <div className="mt-1">
              <span className={`text-sm ${hasValue ? (isVerified ? 'text-green-700' : hasConflict ? 'text-orange-700' : 'text-gray-700') : 'text-gray-400 italic'}`}>
                {displayValue || 'Not extracted'}
              </span>
            </div>
          )}

          {/* Conflict resolution UI - always show when there are multiple values */}
          {hasMultipleValues && !isEditing && (
            <div className={`mt-2 p-2 rounded text-sm ${
              acceptedConflictValue
                ? 'bg-green-50 border border-green-200'
                : 'bg-white border border-orange-200'
            }`}>
              <div className="mb-2">
                <span className={`text-xs font-medium ${acceptedConflictValue ? 'text-green-700' : 'text-orange-700'}`}>
                  {acceptedConflictValue
                    ? `Selected from ${extraction.all_values.length} values found:`
                    : `${extraction.all_values.length} different values found - select one:`}
                </span>
              </div>
              {extraction.all_values.map((val, idx) => (
                <div key={idx} className={`py-1.5 ${idx > 0 ? `border-t ${acceptedConflictValue ? 'border-green-100' : 'border-orange-100'}` : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className={`font-medium ${val.is_accepted ? 'text-green-700' : 'text-gray-900'}`}>
                        {formatConflictValue(val.value)}
                      </span>
                      <span className="text-gray-500 ml-2 text-xs">
                        from {val.document_name || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {val.page && (
                        <button
                          onClick={() => onShowSource?.(val.page, val.document_id, val.value, val.source_text, val.bbox, val.answer_bbox, val.question_bbox)}
                          className="text-xs px-2 py-0.5 text-purple-600 hover:bg-purple-50 rounded"
                        >
                          View
                        </button>
                      )}
                      {val.is_accepted ? (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Selected
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAcceptConflictValue(val.id, val.value)}
                          className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Description */}
          <p className="text-xs text-gray-500 mt-2">{description}</p>

          {/* Source reference */}
          {hasSource && !isEditing && !hasConflict && (
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
              className="text-xs text-purple-600 hover:text-purple-800 mt-1"
            >
              View source (p.{extraction.page})
            </button>
          )}
        </div>

        {/* Actions */}
        {!isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleStartEdit}
              className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-100 rounded"
            >
              Edit
            </button>
            {hasValue && !isVerified && !hasConflict && (
              <button
                onClick={handleVerify}
                disabled={verifyMutation.isPending}
                className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                Verify
              </button>
            )}
            {isVerified && !hasConflict && (
              <div className="flex items-center gap-1">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <button
                  onClick={handleUnverify}
                  disabled={verifyMutation.isPending}
                  className="text-xs px-1.5 py-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  title="Undo verification"
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Required Verifications Panel
// ─────────────────────────────────────────────────────────────

function RequiredVerificationsPanel({ submission, extractions, verifications, submissionId, onShowSource, onAcceptValue, onClearAcceptedValue }) {
  const queryClient = useQueryClient();

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

  // Search for extraction by field name patterns across all sections (including _unmapped)
  const findExtraction = (...fieldPatterns) => {
    if (!extractions?.sections) return null;

    // Normalize pattern for comparison (lowercase, remove underscores/spaces/dots)
    const normalize = (str) => str.toLowerCase().replace(/[_\s.]/g, '');
    const normalizedPatterns = fieldPatterns.map(normalize);

    // Search all sections for matching field (including _unmapped where most extractions live)
    for (const [sectionName, fields] of Object.entries(extractions.sections)) {
      for (const [fieldName, extraction] of Object.entries(fields)) {
        const normalizedField = normalize(fieldName);

        // Check if field matches any pattern
        if (normalizedPatterns.some(pattern =>
          normalizedField.includes(pattern) || pattern.includes(normalizedField)
        )) {
          // Only return if extraction has page/bbox data
          if (extraction.page || extraction.bbox || extraction.question_bbox) {
            return extraction;
          }
        }
      }
    }
    return null;
  };

  const items = [
    {
      key: 'company_name',
      label: 'Company Name',
      value: submission?.applicant_name,
      displayValue: submission?.applicant_name,
      description: 'Verify AI identified the correct company',
      extraction: findExtraction('companyName', 'applicantName', 'namedInsured', 'insuredName'),
    },
    {
      key: 'revenue',
      label: 'Revenue',
      value: submission?.annual_revenue,
      displayValue: formatCompact(submission?.annual_revenue),
      description: 'Confirm revenue matches source documents',
      extraction: findExtraction('annualRevenue', 'revenue', 'grossRevenue'),
    },
    {
      key: 'business_description',
      label: 'Business Description',
      value: submission?.business_summary,
      displayValue: submission?.business_summary ?
        (submission.business_summary.length > 80 ? submission.business_summary.slice(0, 80) + '...' : submission.business_summary)
        : null,
      description: 'Summary of company operations',
      extraction: findExtraction('businessDescription', 'description', 'natureOfBusiness', 'businessOperations'),
    },
    {
      key: 'website',
      label: 'Website',
      value: submission?.website,
      displayValue: submission?.website,
      description: 'Company website URL',
      extraction: findExtraction('website', 'webAddress', 'primaryWebsite', 'emailDomains'),
    },
    {
      key: 'broker',
      label: 'Broker',
      value: submission?.broker_name || submission?.broker_email,
      displayValue: submission?.broker_name || submission?.broker_email,
      description: 'Verify correct broker contact is linked',
      extraction: findExtraction('brokerName', 'producerName', 'agentName', 'broker'),
    },
    {
      key: 'policy_period',
      label: 'Policy Period',
      // Value is 'set' if dates exist, 'tbd' if verified without dates, null otherwise
      value: submission?.effective_date && submission?.expiration_date
        ? 'set'
        : verifications?.verifications?.policy_period?.status === 'confirmed' || verifications?.verifications?.policy_period?.status === 'corrected'
          ? 'tbd'
          : null,
      displayValue: submission?.effective_date && submission?.expiration_date
        ? `${formatDate(submission.effective_date)} – ${formatDate(submission.expiration_date)}`
        : verifications?.verifications?.policy_period?.status === 'confirmed' || verifications?.verifications?.policy_period?.status === 'corrected'
          ? 'TBD (dates not yet determined)'
          : null,
      description: submission?.effective_date && submission?.expiration_date
        ? 'Confirm effective and expiration dates'
        : 'Set policy dates or confirm as TBD',
      extraction: findExtraction('effectiveDate', 'policyPeriod', 'inceptionDate'),
    },
    {
      key: 'industry',
      label: 'Industry',
      value: submission?.naics_primary_title,
      displayValue: submission?.naics_primary_title,
      description: 'Verify industry classification is correct',
      extraction: findExtraction('primaryIndustry', 'industry', 'naicsCode', 'businessType'),
    },
  ];

  const handleUpdate = () => {
    queryClient.invalidateQueries(['submission', submissionId]);
    queryClient.invalidateQueries(['verifications', submissionId]);
  };

  // Query for AI research tasks (for business description corrections)
  const { data: aiTasks } = useQuery({
    queryKey: ['ai-research-tasks', submissionId],
    queryFn: () => getAiResearchTasks(submissionId).then(res => res.data),
    refetchInterval: (data) => {
      // Poll every 3s if there are pending/processing tasks
      const hasPending = data?.tasks?.some(t => t.status === 'pending' || t.status === 'processing');
      return hasPending ? 3000 : false;
    },
  });

  // Get the most recent business_description task that needs attention
  const businessDescTask = aiTasks?.tasks?.find(
    t => t.task_type === 'business_description' &&
      (t.status === 'pending' || t.status === 'processing' ||
       (t.status === 'completed' && !t.review_outcome))
  );

  // Mutation for business description verification
  const verifyMutation = useMutation({
    mutationFn: (data) => updateFieldVerification(submissionId, 'business_description', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['verifications', submissionId]);
    },
  });

  // Mutation for creating AI research tasks
  const createTaskMutation = useMutation({
    mutationFn: ({ flagType, context }) =>
      createAiResearchTask(submissionId, 'business_description', flagType, context, submission?.business_summary),
    onSuccess: () => {
      queryClient.invalidateQueries(['ai-research-tasks', submissionId]);
    },
  });

  // Mutation for reviewing AI research task results
  const reviewTaskMutation = useMutation({
    mutationFn: ({ taskId, outcome, finalValue }) =>
      reviewAiResearchTask(taskId, outcome, finalValue),
    onSuccess: () => {
      queryClient.invalidateQueries(['ai-research-tasks', submissionId]);
      queryClient.invalidateQueries(['submission', submissionId]);
      queryClient.invalidateQueries(['verifications', submissionId]);
    },
  });

  const handleBusinessDescriptionVerify = () => {
    verifyMutation.mutate({
      status: 'confirmed',
      original_value: submission?.business_summary || '',
    });
  };

  const handleBusinessDescriptionUnverify = () => {
    verifyMutation.mutate({
      status: 'pending',
      original_value: null,
      corrected_value: null,
    });
  };

  const handleBusinessDescriptionFlag = async (flagType, context) => {
    await createTaskMutation.mutateAsync({ flagType, context });
  };

  const handleReviewTask = (taskId, outcome, finalValue = null) => {
    reviewTaskMutation.mutate({ taskId, outcome, finalValue });
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-3">
        {items.map((item) => {
          // Special rendering for business_description
          if (item.key === 'business_description') {
            return (
              <BusinessDescriptionVerification
                key={item.key}
                value={item.value}
                status={verifications?.verifications?.[item.key]?.status || 'pending'}
                submissionId={submissionId}
                onVerify={handleBusinessDescriptionVerify}
                onUnverify={handleBusinessDescriptionUnverify}
                onFlag={handleBusinessDescriptionFlag}
                pendingTask={businessDescTask}
                onReviewTask={handleReviewTask}
              />
            );
          }

          return (
            <RequiredVerificationItem
              key={item.key}
              fieldKey={item.key}
              label={item.label}
              value={item.value}
              displayValue={item.displayValue}
              description={item.description}
              status={verifications?.verifications?.[item.key]?.status || 'pending'}
              extraction={item.extraction}
              submission={submission}
              submissionId={submissionId}
              onAcceptValue={onAcceptValue}
              onClearAcceptedValue={onClearAcceptedValue}
              onShowSource={onShowSource}
              onUpdate={handleUpdate}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Extraction Panel (simplified, no required items mixed in)
// ─────────────────────────────────────────────────────────────

function ExtractionPanel({ extractions, isLoading, onShowSource, onAcceptValue, conflictsOnly = false }) {
  const [expandedSections, setExpandedSections] = useState({});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!extractions?.sections || Object.keys(extractions.sections).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <svg className="w-12 h-12 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-500">No extraction data available</p>
      </div>
    );
  }

  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({ ...prev, [sectionName]: !prev[sectionName] }));
  };

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

  const formatSectionName = (name) => {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  // Filter sections based on mode
  const sectionsToShow = Object.entries(extractions.sections).filter(([sectionName, fields]) => {
    if (conflictsOnly) {
      // Only show sections that have conflicts (including _unmapped)
      return Object.values(fields).some(f => f.has_conflict && f.all_values?.length > 1);
    }
    return true;
  });

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      {sectionsToShow.map(([sectionName, fields]) => {
        const presentFields = Object.entries(fields).filter(([_, f]) => f.is_present);
        const conflictFields = presentFields.filter(([_, f]) => f.has_conflict && f.all_values?.length > 1);

        // In conflicts mode, only show conflict fields
        const fieldsToShow = conflictsOnly
          ? conflictFields
          : presentFields;

        if (fieldsToShow.length === 0) return null;

        // Auto-expand in conflicts mode, otherwise use state
        const isExpanded = conflictsOnly || (expandedSections[sectionName] ?? false);
        const isUnmapped = sectionName === '_unmapped';

        return (
          <div key={sectionName} className={`border rounded-lg overflow-hidden ${isUnmapped ? 'border-amber-300 bg-amber-50/30' : ''}`}>
            <button
              onClick={() => toggleSection(sectionName)}
              className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                isUnmapped ? 'bg-amber-50 hover:bg-amber-100' : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium text-gray-900">
                  {isUnmapped ? 'Legacy / Unmapped Fields' : formatSectionName(sectionName)}
                </span>
                <span className="text-xs text-gray-500">{fieldsToShow.length} fields</span>
              </div>
              {conflictFields.length > 0 && (
                <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                  {conflictFields.length} conflict{conflictFields.length !== 1 ? 's' : ''}
                </span>
              )}
            </button>

            {isExpanded && (
              <div className="px-4 py-2 divide-y divide-gray-100">
                {fieldsToShow.map(([fieldName, extraction]) => {
                  const hasConflict = extraction.has_conflict && extraction.all_values?.length > 1;
                  const displayName = fieldName
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();

                  return (
                    <div key={fieldName} className={`py-2 ${hasConflict ? 'bg-orange-50 -mx-4 px-4' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">{displayName}</span>
                            {extraction.confidence != null && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                extraction.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                                extraction.confidence >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {Math.round(extraction.confidence * 100)}%
                              </span>
                            )}
                            {hasConflict && (
                              <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">
                                Conflict
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-900 mt-0.5">
                            {formatValue(extraction.value)}
                          </div>
                        </div>
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
                            className="text-xs px-2 py-1 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded ml-2"
                          >
                            p.{extraction.page}
                          </button>
                        )}
                      </div>

                      {/* Conflict resolution */}
                      {hasConflict && (
                        <div className="mt-2 p-2 bg-white border border-orange-200 rounded text-sm">
                          <p className="text-xs font-medium text-orange-700 mb-2">Different values found:</p>
                          {extraction.all_values.map((val, idx) => (
                            <div key={idx} className="flex items-center justify-between py-1">
                              <span>
                                <span className="font-medium">{formatValue(val.value)}</span>
                                <span className="text-gray-500 ml-2 text-xs">
                                  from {val.document_name || 'Unknown'}
                                </span>
                              </span>
                              <div className="flex gap-1">
                                {val.page && (
                                  <button
                                    onClick={() => onShowSource?.(val.page, val.document_id, val.value, val.source_text, val.bbox, val.answer_bbox, val.question_bbox)}
                                    className="text-xs px-2 py-0.5 text-purple-600 hover:bg-purple-50 rounded"
                                  >
                                    View
                                  </button>
                                )}
                                {!val.is_accepted && (
                                  <button
                                    onClick={() => onAcceptValue?.(val.id)}
                                    className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                                  >
                                    Accept
                                  </button>
                                )}
                                {val.is_accepted && (
                                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Accepted</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Document Selector
// ─────────────────────────────────────────────────────────────

function DocumentSelector({ documents, selectedId, onSelect, onUpload, isUploading }) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedType, setSelectedType] = useState('');

  const typeIcons = {
    'application': '📋', 'Application Form': '📋',
    'loss_run': '📊', 'Loss Runs': '📊',
    'financial': '💰', 'Financial Statement': '💰',
    'policy': '📜', 'Email': '📧', 'other': '📄', 'Other': '📄',
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
            <span>{typeIcons[doc.type] || '📄'}</span>
            <span className="font-medium truncate max-w-[150px]">{doc.filename}</span>
          </button>
        ))}

        <label className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer ${
          isUploading ? 'bg-gray-100 text-gray-400' : 'bg-white hover:bg-purple-50 border border-dashed border-purple-300 text-purple-600'
        }`}>
          {isUploading ? (
            <span className="animate-spin h-4 w-4 border-2 border-purple-600 border-t-transparent rounded-full"></span>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          <span>{isUploading ? 'Uploading...' : 'Add Document'}</span>
          <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileSelect} disabled={isUploading} />
        </label>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Document</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                <span className="text-sm text-gray-900 truncate flex-1">{selectedFile?.name}</span>
                <span className="text-xs text-gray-500">{selectedFile && (selectedFile.size / 1024).toFixed(0)} KB</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  {documentTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowUploadModal(false); setSelectedFile(null); }} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleUpload} className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg">Upload</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Setup Page
// ─────────────────────────────────────────────────────────────

export default function SetupPage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState('extract');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [highlightPage, setHighlightPage] = useState(null);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [activeHighlight, setActiveHighlight] = useState(null);

  // Queries
  const { data: submission, isLoading } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  const { data: documents } = useQuery({
    queryKey: ['documents', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(res => res.data),
  });

  const { data: extractions, isLoading: extractionsLoading } = useQuery({
    queryKey: ['extractions', submissionId],
    queryFn: () => getExtractions(submissionId).then(res => res.data),
  });

  const { data: verifications } = useQuery({
    queryKey: ['verifications', submissionId],
    queryFn: () => getFieldVerifications(submissionId).then(res => res.data),
  });

  // Calculate conflict count
  const conflictCount = extractions?.sections
    ? Object.values(extractions.sections).reduce((total, section) => {
        return total + Object.values(section).filter(f => f.has_conflict && f.all_values?.length > 1).length;
      }, 0)
    : 0;

  // Mutations
  const uploadDocumentMutation = useMutation({
    mutationFn: ({ file, documentType }) => uploadSubmissionDocument(submissionId, file, documentType),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['documents', submissionId]);
      if (response?.data) {
        setSelectedDocument({
          id: response.data.id,
          filename: response.data.filename,
          url: `/api/documents/${response.data.id}/file`,
        });
      }
    },
  });

  const acceptExtractionMutation = useMutation({
    mutationFn: (extractionId) => acceptExtraction(extractionId),
    onSuccess: () => {
      queryClient.invalidateQueries(['extractions', submissionId]);
    },
  });

  const unacceptExtractionMutation = useMutation({
    mutationFn: (extractionId) => unacceptExtraction(extractionId),
    onSuccess: () => {
      queryClient.invalidateQueries(['extractions', submissionId]);
    },
  });

  const updateSubmissionMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['submission', submissionId]);
    },
  });

  // Handler for summary card updates (broker, dates)
  const handleSummaryUpdate = (updates) => {
    updateSubmissionMutation.mutate(updates);
  };

  // Handlers
  const handleSelectDocument = (doc) => {
    let url = `/api/documents/${doc.id}/file`;
    if (doc.url?.startsWith('https://') && !doc.url.includes('localhost')) {
      url = doc.url;
    } else if (doc.url?.includes('localhost')) {
      try { url = new URL(doc.url).pathname; } catch { url = doc.url; }
    } else if (doc.url?.startsWith('/')) {
      url = doc.url;
    }
    setSelectedDocument({ ...doc, url });
  };

  const handleShowSource = (pageNumber, documentId, value, sourceText, bbox, answer_bbox, question_bbox) => {
    if (documentId && documents?.documents?.length > 0) {
      const targetDoc = documents.documents.find(d => d.id === documentId);
      if (targetDoc) handleSelectDocument(targetDoc);
    }
    if (!selectedDocument && documents?.documents?.length > 0) {
      handleSelectDocument(documents.documents[0]);
    }

    const targetPage = answer_bbox?.page || question_bbox?.page || bbox?.page || pageNumber;
    setHighlightPage(targetPage);
    setScrollTrigger(prev => prev + 1);

    let selectedBbox = question_bbox?.left != null ? question_bbox : (bbox?.left != null ? bbox : null);
    if (selectedBbox) {
      setActiveHighlight({
        highlights: [{
          page: selectedBbox.page || targetPage,
          bbox: { left: selectedBbox.left, top: selectedBbox.top, width: selectedBbox.width, height: selectedBbox.height },
          type: 'question',
        }]
      });
    } else {
      setActiveHighlight(null);
    }
    // PDF is always visible in all modes, no mode switch needed
  };

  // Auto-select first document when documents load
  useEffect(() => {
    if (!selectedDocument && documents?.documents?.length > 0) {
      handleSelectDocument(documents.documents[0]);
    }
  }, [documents?.documents]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const hasDocuments = documents?.count > 0;

  // Empty state - show summary card + upload prompt
  if (!hasDocuments) {
    return (
      <div className="space-y-4">
        {/* Summary card - always show for context */}
        <div className="card p-0 overflow-hidden">
          <SubmissionSummaryCard submission={submission} onUpdate={handleSummaryUpdate} />
        </div>

        {/* Upload prompt */}
        <div className="card p-8 text-center">
          <div className="max-w-md mx-auto">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h4 className="text-lg font-medium text-gray-900 mb-2">No Documents Uploaded</h4>
            <p className="text-gray-500 mb-4">Upload submission documents to extract and verify application data.</p>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer bg-purple-600 hover:bg-purple-700 text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Upload Document</span>
              <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadDocumentMutation.mutate({ file, documentType: null });
              }} />
            </label>
          </div>
        </div>
      </div>
    );
  }

  // View mode: 'docs' = single screen, 'extract/required/conflicts' = split screen
  const isSplitScreen = viewMode !== 'docs';
  const showExtractions = viewMode === 'extract';
  const showRequired = viewMode === 'required';
  const showConflicts = viewMode === 'conflicts';

  return (
    <div className="card p-0 overflow-hidden" style={{ height: 'calc(100vh - 180px)', minHeight: '600px' }}>
      {/* Submission Summary - orientation context */}
      <SubmissionSummaryCard submission={submission} onUpdate={handleSummaryUpdate} />

      {/* Header: View mode toggles + Document selector in one row */}
      <HeaderBar
        mode={viewMode}
        onModeChange={setViewMode}
        verificationProgress={verifications?.progress}
        conflictCount={conflictCount}
        documents={documents}
        selectedDocId={selectedDocument?.id}
        onSelectDoc={handleSelectDocument}
        onUpload={(file, type) => uploadDocumentMutation.mutate({ file, documentType: type })}
        isUploading={uploadDocumentMutation.isPending}
      />

      {/* Content area - Left panel (narrower) + PDF viewer on right (wider) */}
      <div className={`grid ${isSplitScreen ? 'grid-cols-[2fr_3fr]' : 'grid-cols-1'} divide-x h-full`} style={{ height: 'calc(100% - 49px)' }}>
        {/* Left panel based on mode (only in split screen) */}
        {showRequired && (
          <RequiredVerificationsPanel
            submission={submission}
            extractions={extractions}
            verifications={verifications}
            submissionId={submissionId}
            onShowSource={handleShowSource}
            onAcceptValue={(id) => acceptExtractionMutation.mutate(id)}
            onClearAcceptedValue={(id) => unacceptExtractionMutation.mutateAsync(id)}
          />
        )}

        {showConflicts && (
          <ExtractionPanel
            extractions={extractions}
            isLoading={extractionsLoading}
            onShowSource={handleShowSource}
            onAcceptValue={(id) => acceptExtractionMutation.mutate(id)}
            conflictsOnly
          />
        )}

        {showExtractions && (
          <ExtractionPanel
            extractions={extractions}
            isLoading={extractionsLoading}
            onShowSource={handleShowSource}
            onAcceptValue={(id) => acceptExtractionMutation.mutate(id)}
          />
        )}

        {/* PDF Viewer (right side in split, full width in docs mode) */}
        <div className="flex flex-col h-full overflow-hidden">
          {selectedDocument?.url ? (
            <div className="flex-1 min-h-0 overflow-hidden">
              {/\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(selectedDocument.filename) ? (
                <div className="h-full overflow-auto p-4 flex items-start justify-center">
                  <img src={selectedDocument.url} alt={selectedDocument.filename} className="max-w-full h-auto shadow-lg" />
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
      </div>
    </div>
  );
}
