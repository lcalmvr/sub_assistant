import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPolicyData,
  unbindQuoteOption,
  generateBinderDocument,
  generatePolicyDocument,
} from '../api/client';

// Format currency
function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Format compact currency
function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

// Policy status badge
function PolicyStatusBadge({ status }) {
  const config = {
    active: { label: 'Active', class: 'badge-quoted', icon: '' },
    cancelled: { label: 'Cancelled', class: 'badge-declined', icon: '' },
    erp: { label: 'ERP Active', class: 'badge-renewal', icon: '' },
    pending: { label: 'Not Bound', class: 'badge-pending', icon: '' },
  };
  const { label, class: badgeClass, icon } = config[status] || config.pending;
  return (
    <span className={`badge ${badgeClass}`}>
      {icon} {label}
    </span>
  );
}

// Subjectivity status badge
function SubjectivityBadge({ status }) {
  const config = {
    pending: { label: 'Pending', class: 'badge-pending' },
    received: { label: 'Received', class: 'badge-quoted' },
    waived: { label: 'Waived', class: 'badge-renewal' },
  };
  const { label, class: badgeClass } = config[status] || config.pending;
  return <span className={`badge ${badgeClass} text-xs`}>{label}</span>;
}

// Document type label
function getDocTypeLabel(type) {
  const labels = {
    binder: 'Binder',
    policy: 'Policy',
    endorsement: 'Endorsement',
    quote_primary: 'Quote (Primary)',
    quote_excess: 'Quote (Excess)',
    quote: 'Quote',
  };
  return labels[type] || type;
}

export default function PolicyPage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  // Confirmation modal state
  const [showUnbindConfirm, setShowUnbindConfirm] = useState(false);

  const { data: policyData, isLoading } = useQuery({
    queryKey: ['policy', submissionId],
    queryFn: () => getPolicyData(submissionId).then(res => res.data),
  });

  // Unbind mutation
  const unbindMutation = useMutation({
    mutationFn: (quoteId) => unbindQuoteOption(quoteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      setShowUnbindConfirm(false);
    },
  });

  // Generate binder mutation
  const binderMutation = useMutation({
    mutationFn: (quoteId) => generateBinderDocument(quoteId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['policy', submissionId] });
      // Open the PDF in a new tab
      if (data.data?.pdf_url) {
        window.open(data.data.pdf_url, '_blank');
      }
    },
  });

  // Generate policy mutation
  const policyMutation = useMutation({
    mutationFn: (quoteId) => generatePolicyDocument(quoteId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['policy', submissionId] });
      // Open the PDF in a new tab
      if (data.data?.pdf_url) {
        window.open(data.data.pdf_url, '_blank');
      }
    },
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading policy data...</div>;
  }

  const {
    submission,
    bound_option: boundOption,
    documents,
    subjectivities,
    endorsements,
    effective_premium: effectivePremium,
    is_issued: isIssued,
  } = policyData || {};

  // Determine policy status
  let policyStatus = 'pending';
  if (boundOption) {
    policyStatus = 'active';
  }

  // Get tower info from bound option
  const towerJson = boundOption?.tower_json || [];
  const primaryLayer = towerJson[0] || {};
  const limit = primaryLayer.limit || 0;
  const retention = boundOption?.primary_retention || 0;
  const policyForm = boundOption?.policy_form || '—';

  // Count pending subjectivities
  const pendingSubjectivities = (subjectivities || []).filter(s => s.status === 'pending');

  // Check if binder exists
  const hasBinder = (documents || []).some(d => d.document_type === 'binder');

  if (!boundOption) {
    return (
      <div className="space-y-6">
        <div className="card text-center py-12">
          <PolicyStatusBadge status="pending" />
          <h3 className="text-lg font-semibold text-gray-900 mt-4">No Bound Policy</h3>
          <p className="text-gray-500 mt-2">
            Bind a quote option on the Quote tab to manage the policy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unbind Confirmation Modal */}
      {showUnbindConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Unbind Policy?</h3>
            <p className="text-gray-600 mb-6">
              This will unbind the quote option. Any generated documents will remain but the policy will no longer be active.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="btn bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setShowUnbindConfirm(false)}
                disabled={unbindMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="btn bg-red-600 text-white hover:bg-red-700"
                onClick={() => unbindMutation.mutate(boundOption.id)}
                disabled={unbindMutation.isPending}
              >
                {unbindMutation.isPending ? 'Unbinding...' : 'Unbind Policy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error messages */}
      {(unbindMutation.isError || binderMutation.isError || policyMutation.isError) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <span className="text-red-800 text-sm">
            Error: {unbindMutation.error?.response?.data?.detail ||
                    binderMutation.error?.response?.data?.detail ||
                    policyMutation.error?.response?.data?.detail ||
                    'An error occurred'}
          </span>
        </div>
      )}

      {/* Policy Summary */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="form-section-title mb-0 pb-0 border-0">Policy Summary</h3>
          <PolicyStatusBadge status={policyStatus} />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left: Policy details card */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Effective Date</span>
              <span className="font-medium text-gray-900">
                {formatDate(submission?.effective_date)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Expiration Date</span>
              <span className="font-medium text-gray-900">
                {formatDate(submission?.expiration_date)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Policy Limit</span>
              <span className="font-medium text-gray-900">{formatCompact(limit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Retention</span>
              <span className="font-medium text-gray-900">{formatCompact(retention)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Policy Form</span>
              <span className="font-medium text-gray-900 capitalize">
                {policyForm?.replace(/_/g, ' ') || '—'}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-3 mt-3">
              <div className="flex justify-between">
                <span className="text-gray-900 font-semibold">Effective Premium</span>
                <span className="font-bold text-green-600 text-lg">
                  {formatCurrency(effectivePremium)}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="space-y-4">
            <div className="bg-purple-50 rounded-lg p-4">
              <h4 className="font-medium text-purple-900 mb-2">Named Insured</h4>
              <p className="text-purple-800">{submission?.applicant_name || '—'}</p>
            </div>

            {boundOption?.quote_name && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-2">Bound Option</h4>
                <p className="text-gray-900">{boundOption.quote_name}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="btn btn-primary flex-1"
                onClick={() => binderMutation.mutate(boundOption.id)}
                disabled={binderMutation.isPending}
              >
                {binderMutation.isPending ? 'Generating...' : hasBinder ? 'Regenerate Binder' : 'Generate Binder'}
              </button>
              <button
                className="btn btn-outline flex-1"
                onClick={() => setShowUnbindConfirm(true)}
              >
                Unbind Policy
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Policy Documents */}
      <div className="card">
        <h3 className="form-section-title">Policy Documents</h3>
        {documents && documents.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Document</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <span className="font-medium text-gray-900">
                        {getDocTypeLabel(doc.document_type)}
                      </span>
                      {doc.document_number && (
                        <span className="text-gray-500 text-sm ml-2">({doc.document_number})</span>
                      )}
                    </td>
                    <td className="table-cell text-gray-600">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="table-cell">
                      {doc.pdf_url ? (
                        <a
                          href={doc.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-600 hover:text-purple-800 font-medium"
                        >
                          View PDF
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-500">No policy documents generated yet</p>
            <button
              className="btn btn-primary mt-3"
              onClick={() => binderMutation.mutate(boundOption.id)}
              disabled={binderMutation.isPending}
            >
              {binderMutation.isPending ? 'Generating...' : 'Generate Binder'}
            </button>
          </div>
        )}
      </div>

      {/* Policy Issuance */}
      <div className="card">
        <h3 className="form-section-title">Policy Issuance</h3>
        {isIssued ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-green-600 text-xl">✓</span>
              <div>
                <p className="font-semibold text-green-800">Policy Issued</p>
                <p className="text-green-700 text-sm">
                  Policy document has been generated and is available above
                </p>
              </div>
            </div>
          </div>
        ) : pendingSubjectivities.length > 0 ? (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">
                <span className="font-semibold">Cannot issue policy:</span>{' '}
                {pendingSubjectivities.length} subjectivit{pendingSubjectivities.length === 1 ? 'y' : 'ies'} pending
              </p>
            </div>

            {/* Pending subjectivities list */}
            <div className="space-y-2">
              {pendingSubjectivities.map((subj) => (
                <div key={subj.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-700">{subj.text}</span>
                  <div className="flex gap-2">
                    <button className="btn btn-outline text-sm py-1">Received</button>
                    <button className="btn btn-outline text-sm py-1">Waive</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800">
                {hasBinder ? 'Binder generated. ' : ''}Ready to issue policy.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                className="btn btn-primary"
                onClick={() => policyMutation.mutate(boundOption.id)}
                disabled={policyMutation.isPending}
              >
                {policyMutation.isPending ? 'Issuing...' : 'Issue Policy'}
              </button>
              <span className="text-sm text-gray-500 self-center">
                Generates Dec Page + Policy Form + Endorsements
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Subjectivities */}
      {subjectivities && subjectivities.length > 0 && (
        <div className="card">
          <h3 className="form-section-title">Subjectivities</h3>
          <div className="space-y-2">
            {subjectivities.map((subj) => (
              <div
                key={subj.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  subj.status === 'pending' ? 'bg-yellow-50' :
                  subj.status === 'received' ? 'bg-green-50' : 'bg-gray-50'
                }`}
              >
                <span className="text-gray-700">{subj.text}</span>
                <SubjectivityBadge status={subj.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Endorsements */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="form-section-title mb-0 pb-0 border-0">Endorsements</h3>
          <button className="btn btn-outline text-sm">
            + Add Endorsement
          </button>
        </div>
        {endorsements && endorsements.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Type</th>
                  <th className="table-header">Description</th>
                  <th className="table-header">Effective</th>
                  <th className="table-header">Premium Change</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {endorsements.map((endorsement) => (
                  <tr key={endorsement.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium text-gray-900">
                      {endorsement.endorsement_type || '—'}
                    </td>
                    <td className="table-cell text-gray-600">
                      {endorsement.description || '—'}
                    </td>
                    <td className="table-cell text-gray-600">
                      {formatDate(endorsement.effective_date)}
                    </td>
                    <td className="table-cell">
                      {endorsement.premium_change ? (
                        <span className={endorsement.premium_change > 0 ? 'text-green-600' : 'text-red-600'}>
                          {endorsement.premium_change > 0 ? '+' : ''}
                          {formatCurrency(endorsement.premium_change)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${
                        endorsement.status === 'applied' ? 'badge-quoted' :
                        endorsement.status === 'pending' ? 'badge-pending' : 'badge-received'
                      }`}>
                        {endorsement.status || 'draft'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-500">No endorsements</p>
          </div>
        )}
      </div>

      {/* Renewal */}
      <div className="card">
        <h3 className="form-section-title">Renewal</h3>
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-gray-500">
            Renewal options will appear 90 days before expiration
          </p>
          {submission?.expiration_date && (
            <p className="text-sm text-gray-400 mt-2">
              Policy expires: {formatDate(submission.expiration_date)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
