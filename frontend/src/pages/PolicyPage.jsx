import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPolicyData,
  unbindQuoteOption,
  generateBinderDocument,
  generatePolicyDocument,
  createEndorsement,
  issueEndorsement,
  voidEndorsement,
  reinstateEndorsement,
  deleteEndorsement,
} from '../api/client';

// Endorsement type definitions
const ENDORSEMENT_TYPES = [
  { value: 'extension', label: 'Policy Extension' },
  { value: 'name_change', label: 'Named Insured Change' },
  { value: 'address_change', label: 'Address Change' },
  { value: 'cancellation', label: 'Cancellation' },
  { value: 'reinstatement', label: 'Reinstatement' },
  { value: 'erp', label: 'Extended Reporting Period', disabled: true },
  { value: 'coverage_change', label: 'Coverage Change', disabled: true },
  { value: 'bor_change', label: 'Broker of Record Change', disabled: true },
  { value: 'other', label: 'Other' },
];

// Cancellation reasons
const CANCELLATION_REASONS = [
  { value: 'insured_request', label: 'Insured Request' },
  { value: 'non_payment', label: 'Non-Payment of Premium' },
  { value: 'underwriting', label: 'Underwriting Reasons' },
  { value: 'material_change', label: 'Material Change in Risk' },
  { value: 'other', label: 'Other' },
];

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

// Endorsement status dropdown - clickable badge with status options
function EndorsementStatusDropdown({ endorsement, onIssue, onVoid, onReinstate, onDelete, isLoading }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);

  const statusConfig = {
    draft: { label: 'draft', class: 'badge-pending' },
    issued: { label: 'issued', class: 'badge-quoted' },
    void: { label: 'voided', class: 'badge-declined' },
  };

  const status = endorsement.status || 'draft';
  const config = statusConfig[status] || statusConfig.draft;

  // Determine available actions based on current status
  const getActions = () => {
    switch (status) {
      case 'draft':
        return [
          { label: 'Issue', action: onIssue, class: 'text-green-600 hover:bg-green-50' },
          { label: 'Delete', action: onDelete, class: 'text-red-600 hover:bg-red-50' },
        ];
      case 'issued':
        return [
          { label: 'Void', action: () => setShowVoidConfirm(true), class: 'text-red-600 hover:bg-red-50' },
        ];
      case 'void':
        return [
          { label: 'Reinstate', action: onReinstate, class: 'text-purple-600 hover:bg-purple-50' },
        ];
      default:
        return [];
    }
  };

  const actions = getActions();

  // If no actions available, just show the badge
  if (actions.length === 0) {
    return (
      <span className={`badge ${config.class}`}>
        {config.label}
      </span>
    );
  }

  return (
    <>
      {/* Void Confirmation Modal */}
      {showVoidConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Void Endorsement?</h3>
            <p className="text-gray-600 mb-6">
              This will void the endorsement and reverse its premium impact. The record will be kept for audit purposes.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="btn bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setShowVoidConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  onVoid();
                  setShowVoidConfirm(false);
                }}
              >
                Void Endorsement
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative inline-block">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className={`badge ${config.class} cursor-pointer`}
        >
          {config.label}
          <span className="ml-1 text-xs opacity-50">▾</span>
        </button>

        {isOpen && (
          <>
            {/* Backdrop to close dropdown */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            {/* Dropdown menu - opens upward */}
            <div className="absolute left-0 bottom-full mb-1 w-24 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
              {actions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => {
                    action.action();
                    setIsOpen(false);
                  }}
                  disabled={isLoading}
                  className={`w-full px-3 py-2 text-left text-sm font-medium ${action.class} first:rounded-t-lg last:rounded-b-lg`}
                >
                  {isLoading ? '...' : action.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
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

// Premium methods
const PREMIUM_METHODS = [
  { value: 'pro_rata', label: 'Pro-Rata (calculated)' },
  { value: 'flat', label: 'Flat (override)' },
];

// Types that handle premium differently (no standard premium section)
const NO_PREMIUM_TYPES = ['bor_change', 'cancellation', 'address_change'];

// Calculate days between two dates
function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
}

// Format number with commas (no decimals)
function formatNumber(num) {
  return Math.round(num).toLocaleString();
}

// Parse formatted number string back to number
function parseNumber(str) {
  return parseInt(str.replace(/,/g, ''), 10) || 0;
}

// Add Endorsement Modal Component
function AddEndorsementModal({ isOpen, onClose, submission, boundOption, onSuccess }) {
  const [endorsementType, setEndorsementType] = useState('extension');
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Premium fields
  const [premiumMethod, setPremiumMethod] = useState('pro_rata');
  const [annualRate, setAnnualRate] = useState(0);
  const [flatAmount, setFlatAmount] = useState(0);

  // Type-specific fields
  const [newExpirationDate, setNewExpirationDate] = useState('');
  const [oldName, setOldName] = useState('');
  const [newName, setNewName] = useState('');
  const [lapseDays, setLapseDays] = useState(0);
  const [description, setDescription] = useState('');
  const [cancellationReason, setCancellationReason] = useState('insured_request');
  // Address change fields
  const [oldAddress, setOldAddress] = useState({ street: '', city: '', state: '', zip: '' });
  const [newAddress, setNewAddress] = useState({ street: '', city: '', state: '', zip: '' });

  // Get base premium from bound option
  const basePremium = parseFloat(boundOption?.sold_premium || boundOption?.risk_adjusted_premium || 0);

  // Calculate days remaining based on type and dates
  const calculateDaysRemaining = () => {
    if (endorsementType === 'extension' && newExpirationDate && submission?.expiration_date) {
      // For extensions: days in the extension period
      const days = daysBetween(submission.expiration_date, newExpirationDate);
      return Math.max(0, days); // Can't be negative
    } else if (effectiveDate && submission?.expiration_date) {
      // For others: days from effective date to expiration
      const days = daysBetween(effectiveDate, submission.expiration_date);
      return Math.max(0, days); // Can't be negative
    }
    return 0;
  };

  const daysRemaining = calculateDaysRemaining();

  // Calculate pro-rata premium (always calculated for reference, no decimals)
  // For cancellation, this is a return premium (negative)
  const proRataPremium = daysRemaining > 0
    ? Math.round(annualRate * (daysRemaining / 365))
    : 0;

  // For cancellation, premium is negative (return premium)
  const isCancellation = endorsementType === 'cancellation';
  const calculatedPremium = isCancellation ? -proRataPremium : proRataPremium;

  // Final premium based on method
  const premiumChange = premiumMethod === 'pro_rata' ? calculatedPremium : (isCancellation ? -Math.abs(flatAmount) : flatAmount);

  // Set defaults when modal opens
  const resetForm = () => {
    setEndorsementType('extension');
    setEffectiveDate(new Date().toISOString().split('T')[0]);
    setPremiumMethod('pro_rata');
    // Extension auto-populates premium
    setAnnualRate(basePremium);
    setFlatAmount(0);
    setNotes('');
    // Set default new expiration to 30 days after current
    if (submission?.expiration_date) {
      const [y, m, d] = submission.expiration_date.split('-').map(Number);
      const newDate = new Date(y, m - 1, d + 30);
      const yyyy = newDate.getFullYear();
      const mm = String(newDate.getMonth() + 1).padStart(2, '0');
      const dd = String(newDate.getDate()).padStart(2, '0');
      setNewExpirationDate(`${yyyy}-${mm}-${dd}`);
    } else {
      setNewExpirationDate('');
    }
    setOldName(submission?.applicant_name || '');
    setNewName('');
    setLapseDays(0);
    setDescription('');
    setCancellationReason('insured_request');
    setOldAddress({ street: '', city: '', state: '', zip: '' });
    setNewAddress({ street: '', city: '', state: '', zip: '' });
    setError(null);
  };

  // Types that should auto-populate annual premium
  const autoPopulatePremiumTypes = ['extension', 'cancellation'];

  // Set old values when type changes
  const handleTypeChange = (type) => {
    setEndorsementType(type);
    if (type === 'name_change') {
      setOldName(submission?.applicant_name || '');
    }
    if (type === 'address_change') {
      setOldAddress({
        street: submission?.mailing_address || submission?.address || '',
        city: submission?.mailing_city || submission?.city || '',
        state: submission?.mailing_state || submission?.state || '',
        zip: submission?.mailing_zip || submission?.zip || '',
      });
    }
    // Set default new expiration date for extension (30 days after current)
    if (type === 'extension' && submission?.expiration_date) {
      const [y, m, d] = submission.expiration_date.split('-').map(Number);
      const newDate = new Date(y, m - 1, d + 30);
      const yyyy = newDate.getFullYear();
      const mm = String(newDate.getMonth() + 1).padStart(2, '0');
      const dd = String(newDate.getDate()).padStart(2, '0');
      setNewExpirationDate(`${yyyy}-${mm}-${dd}`);
    }
    // Auto-populate annual rate for extension/cancellation
    if (autoPopulatePremiumTypes.includes(type)) {
      setAnnualRate(basePremium);
    } else {
      setAnnualRate(0);
    }
    setFlatAmount(0);
  };

  // Show premium section for most types
  const showPremiumSection = !NO_PREMIUM_TYPES.includes(endorsementType);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    // Build change_details based on type
    let changeDetails = {};
    let desc = description;

    switch (endorsementType) {
      case 'extension':
        if (!newExpirationDate) {
          setError('New expiration date is required');
          setIsSubmitting(false);
          return;
        }
        // Validate that new expiration is after current expiration
        if (submission?.expiration_date && newExpirationDate <= submission.expiration_date) {
          setError('New expiration date must be after current expiration');
          setIsSubmitting(false);
          return;
        }
        changeDetails = {
          new_expiration_date: newExpirationDate,
          original_expiration_date: submission?.expiration_date,
        };
        desc = `Policy extended to ${newExpirationDate}`;
        break;

      case 'name_change':
        if (!newName) {
          setError('New name is required');
          setIsSubmitting(false);
          return;
        }
        changeDetails = {
          old_name: oldName,
          new_name: newName,
        };
        desc = `Named insured changed to ${newName}`;
        break;

      case 'address_change':
        if (!newAddress.street || !newAddress.city || !newAddress.state || !newAddress.zip) {
          setError('All new address fields are required');
          setIsSubmitting(false);
          return;
        }
        changeDetails = {
          old_address: oldAddress,
          new_address: newAddress,
        };
        desc = `Address changed to ${newAddress.street}, ${newAddress.city}, ${newAddress.state} ${newAddress.zip}`;
        break;

      case 'reinstatement':
        changeDetails = {
          lapse_period_days: lapseDays,
        };
        desc = lapseDays > 0
          ? `Policy reinstatement (${lapseDays} day lapse)`
          : 'Policy reinstatement';
        break;

      case 'cancellation':
        changeDetails = {
          cancellation_reason: cancellationReason,
          cancellation_date: effectiveDate,
          original_expiration_date: submission?.expiration_date,
        };
        const reasonLabel = CANCELLATION_REASONS.find(r => r.value === cancellationReason)?.label || cancellationReason;
        desc = `Policy cancelled - ${reasonLabel}`;
        break;

      case 'other':
        if (!description) {
          setError('Description is required');
          setIsSubmitting(false);
          return;
        }
        break;

      default:
        break;
    }

    try {
      const response = await createEndorsement(submission?.id, {
        endorsement_type: endorsementType,
        effective_date: effectiveDate,
        description: desc || description,
        change_details: changeDetails,
        premium_change: premiumChange,
        notes: notes || null,
      });

      if (response.data?.id) {
        onSuccess?.();
        onClose();
        resetForm();
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create endorsement');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedType = ENDORSEMENT_TYPES.find(t => t.value === endorsementType);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Add Midterm Endorsement
        </h3>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <span className="text-red-800 text-sm">{error}</span>
          </div>
        )}

        {/* Type + Effective Date - side by side */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="form-label">Type</label>
            <select
              className="form-select"
              value={endorsementType}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              {ENDORSEMENT_TYPES.map((type) => (
                <option
                  key={type.value}
                  value={type.value}
                  disabled={type.disabled}
                >
                  {type.label}{type.disabled ? ' (coming soon)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Effective Date</label>
            <input
              type="date"
              className="form-input"
              style={{ colorScheme: 'light' }}
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
        </div>

        {/* Type-specific fields */}
        {endorsementType === 'extension' && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Extension Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label text-gray-500">Current Expiration</label>
                <div className="form-input bg-gray-100 text-gray-700">
                  {submission?.expiration_date ? formatDate(submission.expiration_date) : '—'}
                </div>
              </div>
              <div>
                <label className="form-label">New Expiration *</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ colorScheme: 'light' }}
                  value={newExpirationDate}
                  onChange={(e) => setNewExpirationDate(e.target.value)}
                  min={submission?.expiration_date || ''}
                />
              </div>
            </div>
            {daysRemaining > 0 && (
              <p className="text-xs text-gray-500 mt-2">Extension period: {daysRemaining} days</p>
            )}
          </div>
        )}

        {endorsementType === 'name_change' && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Name Change</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label text-gray-500">Current Name</label>
                <div className="form-input bg-gray-100 text-gray-700">
                  {oldName || '—'}
                </div>
              </div>
              <div>
                <label className="form-label">New Name *</label>
                <input
                  type="text"
                  className="form-input text-gray-900"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter new name"
                />
              </div>
            </div>
          </div>
        )}

        {endorsementType === 'address_change' && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Address Change</h4>
            <div className="space-y-4">
              {/* Current Address - read only */}
              <div>
                <label className="form-label text-gray-500">Current Address</label>
                <div className="form-input bg-gray-100 text-gray-700">
                  {oldAddress.street || oldAddress.city || oldAddress.state || oldAddress.zip ? (
                    <>
                      {oldAddress.street && <div>{oldAddress.street}</div>}
                      <div>
                        {[oldAddress.city, oldAddress.state, oldAddress.zip].filter(Boolean).join(', ')}
                      </div>
                    </>
                  ) : (
                    <span className="text-gray-400">No address on file</span>
                  )}
                </div>
              </div>
              {/* New Address */}
              <div>
                <label className="form-label">New Address *</label>
                <div className="grid grid-cols-1 gap-2">
                  <input
                    type="text"
                    className="form-input"
                    value={newAddress.street}
                    onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })}
                    placeholder="Street address"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      className="form-input"
                      value={newAddress.city}
                      onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                      placeholder="City"
                    />
                    <input
                      type="text"
                      className="form-input"
                      value={newAddress.state}
                      onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                      placeholder="State"
                      maxLength={2}
                    />
                    <input
                      type="text"
                      className="form-input"
                      value={newAddress.zip}
                      onChange={(e) => setNewAddress({ ...newAddress, zip: e.target.value })}
                      placeholder="ZIP"
                      maxLength={10}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">No premium change for address endorsements</p>
            </div>
          </div>
        )}

        {endorsementType === 'reinstatement' && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Reinstatement Details</h4>
            <label className="form-label">Lapse Period (days)</label>
            <input
              type="number"
              className="form-input w-32"
              value={lapseDays}
              onChange={(e) => setLapseDays(parseInt(e.target.value) || 0)}
              min={0}
            />
          </div>
        )}

        {endorsementType === 'cancellation' && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Cancellation Details</h4>
            <div className="space-y-4">
              <div>
                <label className="form-label">Reason *</label>
                <select
                  className="form-select"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                >
                  {CANCELLATION_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label text-gray-500">Current Expiration</label>
                  <div className="form-input bg-gray-100 text-gray-700">
                    {submission?.expiration_date ? formatDate(submission.expiration_date) : '—'}
                  </div>
                </div>
                <div>
                  <label className="form-label">New Expiration *</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ colorScheme: 'light' }}
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    max={submission?.expiration_date || ''}
                  />
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-red-800 font-medium">Return Premium</span>
                  <span className="text-red-700 font-bold text-lg">
                    {formatCurrency(Math.abs(proRataPremium))}
                  </span>
                </div>
                <p className="text-xs text-red-600 mt-1">
                  {daysRemaining} days remaining · {formatNumber(annualRate)} x {daysRemaining} / 365 = {formatNumber(proRataPremium)}
                </p>
              </div>
            </div>
          </div>
        )}

        {endorsementType === 'other' && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Details</h4>
            <label className="form-label">Description *</label>
            <input
              type="text"
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description"
            />
          </div>
        )}

        {/* Premium Section */}
        {showPremiumSection && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Premium</h4>

            {/* Two column layout */}
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className={`form-label ${autoPopulatePremiumTypes.includes(endorsementType) ? 'text-gray-500' : ''}`}>
                  Annual Rate
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  {autoPopulatePremiumTypes.includes(endorsementType) ? (
                    <div className="form-input pl-8 bg-gray-100 text-gray-700 text-right">
                      {formatNumber(annualRate)}
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="form-input pl-8 text-right"
                      value={formatNumber(annualRate)}
                      onChange={(e) => setAnnualRate(parseNumber(e.target.value))}
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="form-label text-gray-500">Pro-Rata Premium</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <div className="form-input pl-8 bg-gray-100 text-gray-700 text-right">
                    {formatNumber(proRataPremium)}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {formatNumber(annualRate)} x {daysRemaining} / 365
                </p>
              </div>
            </div>

            {/* Override row */}
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={premiumMethod === 'flat'}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setPremiumMethod('flat');
                      setFlatAmount(proRataPremium);
                    } else {
                      setPremiumMethod('pro_rata');
                    }
                  }}
                  className="rounded text-purple-600"
                />
                <span className="text-sm text-gray-700">Override with flat amount</span>
              </label>
              {premiumMethod === 'flat' && (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    className="form-input pl-8 text-right"
                    value={formatNumber(flatAmount)}
                    onChange={(e) => setFlatAmount(parseNumber(e.target.value))}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mb-6">
          <label className="form-label">Notes (optional)</label>
          <textarea
            className="form-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes..."
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            className="btn bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={() => {
              onClose();
              resetForm();
            }}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PolicyPage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  // Modal states
  const [showUnbindConfirm, setShowUnbindConfirm] = useState(false);
  const [showAddEndorsement, setShowAddEndorsement] = useState(false);

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

  // Issue endorsement mutation
  const issueMutation = useMutation({
    mutationFn: (endorsementId) => issueEndorsement(endorsementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', submissionId] });
    },
  });

  // Void endorsement mutation
  const voidMutation = useMutation({
    mutationFn: (endorsementId) => voidEndorsement(endorsementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', submissionId] });
    },
    onError: (error) => {
      console.error('Void error:', error);
      alert('Failed to void endorsement: ' + (error.response?.data?.detail || error.message));
    },
  });

  // Reinstate endorsement mutation
  const reinstateMutation = useMutation({
    mutationFn: (endorsementId) => reinstateEndorsement(endorsementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', submissionId] });
    },
    onError: (error) => {
      console.error('Reinstate error:', error);
      alert('Failed to reinstate endorsement: ' + (error.response?.data?.detail || error.message));
    },
  });

  // Delete endorsement mutation
  const deleteMutation = useMutation({
    mutationFn: (endorsementId) => deleteEndorsement(endorsementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy', submissionId] });
    },
    onError: (error) => {
      console.error('Delete error:', error);
      alert('Failed to delete endorsement: ' + (error.response?.data?.detail || error.message));
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

      {/* Add Endorsement Modal */}
      <AddEndorsementModal
        isOpen={showAddEndorsement}
        onClose={() => setShowAddEndorsement(false)}
        submission={submission}
        boundOption={boundOption}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['policy', submissionId] });
        }}
      />

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

      {/* Midterm Endorsements */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="form-section-title mb-0 pb-0 border-0">Midterm Endorsements</h3>
          <button
            className="btn btn-outline text-sm"
            onClick={() => setShowAddEndorsement(true)}
          >
            + Add Endorsement
          </button>
        </div>
        {endorsements && endorsements.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">Description</th>
                  <th className="table-header">Effective</th>
                  <th className="table-header">Premium</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {endorsements.map((endorsement) => {
                  const isVoided = endorsement.status === 'void';
                  return (
                  <tr key={endorsement.id} className={`hover:bg-gray-50 ${isVoided ? 'opacity-60' : ''}`}>
                    <td className={`table-cell font-medium ${isVoided ? 'text-gray-400' : 'text-gray-900'}`}>
                      {endorsement.endorsement_number || '—'}
                    </td>
                    <td className={`table-cell ${isVoided ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                      {endorsement.formal_title || endorsement.description || '—'}
                    </td>
                    <td className={`table-cell ${isVoided ? 'text-gray-400' : 'text-gray-600'}`}>
                      {formatDate(endorsement.effective_date)}
                    </td>
                    <td className="table-cell">
                      {endorsement.premium_change ? (
                        <span className={isVoided
                          ? 'text-gray-400 line-through'
                          : (endorsement.premium_change > 0 ? 'text-green-600' : 'text-red-600')
                        }>
                          {endorsement.premium_change > 0 ? '+' : ''}
                          {formatCurrency(endorsement.premium_change)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <EndorsementStatusDropdown
                        endorsement={endorsement}
                        onIssue={() => issueMutation.mutate(endorsement.id)}
                        onVoid={() => voidMutation.mutate(endorsement.id)}
                        onReinstate={() => reinstateMutation.mutate(endorsement.id)}
                        onDelete={() => deleteMutation.mutate(endorsement.id)}
                        isLoading={issueMutation.isPending || voidMutation.isPending || reinstateMutation.isPending || deleteMutation.isPending}
                      />
                    </td>
                    <td className="table-cell">
                      {endorsement.document_url ? (
                        <a
                          href={endorsement.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={isVoided ? 'text-gray-400' : 'text-purple-600 hover:text-purple-800 font-medium'}
                        >
                          View PDF
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-gray-500">No midterm endorsements</p>
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
