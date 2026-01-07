import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getQuoteOptions,
  getSubmission,
  updateSubmission,
  createQuoteOption,
  updateQuoteOption,
  deleteQuoteOption,
  cloneQuoteOption,
  applyToAllQuotes,
  generateQuoteDocument,
  getQuoteDocuments,
  getPackageDocuments,
  getQuoteEndorsements,
  getQuoteAutoEndorsements,
  generateQuotePackage,
  getLatestDocument,
  getSubmissionDocuments,
  getDocumentLibraryEntries,
  getSubjectivityTemplates,
  getQuoteSubjectivities,
  getSubmissionSubjectivities,
  createSubjectivity,
  updateSubjectivity,
  deleteSubjectivity,
  linkSubjectivityToQuote,
  unlinkSubjectivityFromQuote,
  unlinkSubjectivityFromPosition,
  linkEndorsementToQuote,
  unlinkEndorsementFromQuote,
  getSubmissionEndorsements,
  bindQuoteOption,
  unbindQuoteOption,
} from '../api/client';
import CoverageEditor from '../components/CoverageEditor';
import ExcessCoverageEditor from '../components/ExcessCoverageEditor';
import RetroScheduleEditor from '../components/RetroScheduleEditor';
import TowerComparison from '../components/TowerComparison';

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

// Format number with commas for input display
function formatNumberWithCommas(value) {
  if (!value && value !== 0) return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('en-US').format(num);
}

// Parse number from formatted input (removes commas)
function parseFormattedNumber(value) {
  if (!value) return '';
  const cleaned = value.replace(/[^0-9.]/g, '');
  return cleaned;
}

// Format compact currency (e.g., $5M, $25K)
function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${value / 1_000_000}M`;
  if (value >= 1_000) return `$${value / 1_000}K`;
  return `$${value}`;
}

// Get limit from tower_json (returns CMAI's participation - always the limit field)
// With new model: limit = participation, quota_share = full layer size (when QS)
function getTowerLimit(quote) {
  if (!quote.tower_json || !quote.tower_json.length) return null;
  const cmaiLayer = quote.tower_json.find(l => l.carrier?.toUpperCase().includes('CMAI')) || quote.tower_json[0];
  // Always return limit (the carrier's participation/written amount)
  return cmaiLayer?.limit;
}

// Generate auto option name from tower structure
// Format: Primary = "$1M x $25K", Excess = "$1M xs $6M", QS Excess = "$5M po $10M xs $5M"
function generateOptionName(quote) {
  const tower = quote.tower_json || [];
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  const cmaiLayer = cmaiIdx >= 0 ? tower[cmaiIdx] : tower[0];

  if (!cmaiLayer) return 'Option';

  const limit = cmaiLayer.limit || 0;
  const limitStr = formatCompact(limit);

  // Check if CMAI is in a quota share layer
  const cmaiQs = cmaiLayer.quota_share;
  const qsStr = cmaiQs ? ` po ${formatCompact(cmaiQs)}` : '';

  if (quote.position === 'excess' && cmaiIdx >= 0) {
    // Calculate CMAI's attachment using the tower structure
    const attachment = calculateAttachment(tower, cmaiIdx);
    const attachStr = formatCompact(attachment);
    // Excess: no retention (SIR is primary concept)
    return `${limitStr}${qsStr} xs ${attachStr}`;
  }

  // Primary: show retention
  const primaryLayer = tower[0];
  const retention = primaryLayer?.retention || quote.primary_retention || 25000;
  const retentionStr = formatCompact(retention);
  return `${limitStr} x ${retentionStr}`;
}

// Calculate attachment for a specific layer index
// Handles quota share: consecutive layers with same quota_share (full layer size) are ONE layer
// All carriers in a QS group share the same attachment point
// Data model: limit = participation, quota_share = full layer size (when QS)
function calculateAttachment(layers, targetIdx) {
  if (!layers || layers.length === 0) return 0;

  // Special case: if target is index 0 and it's CMAI, calculate from all non-CMAI layers
  // This handles cases where tower order might be wrong in stored data
  const targetLayer = layers[targetIdx];
  if (targetIdx === 0 && targetLayer?.carrier?.toUpperCase().includes('CMAI')) {
    // Sum all non-CMAI layers
    let attachment = 0;
    for (const layer of layers) {
      if (!layer.carrier?.toUpperCase().includes('CMAI')) {
        if (layer.quota_share) {
          attachment += layer.quota_share;
        } else {
          attachment += layer.limit || 0;
        }
      }
    }
    return attachment;
  }

  if (targetIdx <= 0) return 0;

  // If this layer is part of a QS group, find the first layer of the group
  // All layers in a QS group should have the same attachment
  let effectiveIdx = targetIdx;

  if (targetLayer?.quota_share) {
    const qsFullLayer = targetLayer.quota_share;
    // Walk backwards to find the start of this QS group (same quota_share value)
    while (effectiveIdx > 0 &&
           layers[effectiveIdx - 1]?.quota_share === qsFullLayer) {
      effectiveIdx--;
    }
  }

  // Now calculate attachment by summing layers below effectiveIdx
  // Treat consecutive QS groups as single layers
  let attachment = 0;
  let i = 0;

  while (i < effectiveIdx) {
    const layer = layers[i];

    if (layer.quota_share) {
      // This is a QS layer - add the full layer size (quota_share) once
      const qsFullLayer = layer.quota_share;
      attachment += qsFullLayer;
      // Skip all consecutive QS layers with the same quota_share
      while (i < effectiveIdx && layers[i]?.quota_share === qsFullLayer) {
        i++;
      }
    } else {
      // Regular layer - add its limit (which is the full amount when not QS)
      attachment += layer.limit || 0;
      i++;
    }
  }

  return attachment;
}

// Calculate QS layer fill status for a given layer
// Returns { filled, total, gap, isComplete } or null if not a QS layer
function getQsLayerStatus(layers, layerIdx) {
  const layer = layers[layerIdx];
  if (!layer?.quota_share) return null;

  const qsTotal = layer.quota_share;

  // Find all consecutive layers with the same quota_share value
  // Look backwards and forwards from this layer
  let startIdx = layerIdx;
  let endIdx = layerIdx;

  // Walk backwards
  while (startIdx > 0 && layers[startIdx - 1]?.quota_share === qsTotal) {
    startIdx--;
  }
  // Walk forwards
  while (endIdx < layers.length - 1 && layers[endIdx + 1]?.quota_share === qsTotal) {
    endIdx++;
  }

  // Sum all participations in this QS group
  let filled = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    filled += layers[i].limit || 0;
  }

  const gap = qsTotal - filled;
  const isComplete = gap <= 0;

  return { filled, total: qsTotal, gap, isComplete, startIdx, endIdx };
}

// Recalculate attachments for tower layers
// Attachment = sum of all limits below the layer
// Primary layer (index 0) has attachment = 0
function recalculateAttachments(layers) {
  if (!layers || layers.length === 0) return layers;

  return layers.map((layer, idx) => {
    const attachment = calculateAttachment(layers, idx);
    return { ...layer, attachment };
  });
}

// Compact quote option tab
function QuoteOptionTab({ quote, isSelected, onSelect }) {
  const premium = quote.sold_premium || quote.risk_adjusted_premium;
  const isBound = quote.is_bound;
  const isExcess = quote.position === 'excess';

  // Auto-generate name from tower, append descriptor if set
  const autoName = generateOptionName(quote);
  const displayName = quote.option_descriptor
    ? `${autoName} - ${quote.option_descriptor}`
    : autoName;

  return (
    <button
      onClick={onSelect}
      className={`px-4 py-2 rounded-lg border-2 text-left transition-all ${
        isSelected
          ? isBound
            ? 'border-green-500 bg-green-50'
            : 'border-purple-500 bg-purple-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2">
        {isBound && <span className="text-green-600">✓</span>}
        <span className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
          {displayName}
        </span>
        {isExcess && (
          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">XS</span>
        )}
      </div>
      <div className="text-sm text-gray-500 mt-0.5">
        {premium ? formatCurrency(premium) : '—'}
      </div>
    </button>
  );
}

// Create Quote Modal
function CreateQuoteModal({ isOpen, onClose, onSubmit, isPending, selectedQuote, onClone, isCloning }) {
  const [quoteName, setQuoteName] = useState('');
  const [retention, setRetention] = useState(25000);
  const [limit, setLimit] = useState(1000000);
  const [position, setPosition] = useState('primary');
  const [primaryCarrier, setPrimaryCarrier] = useState('');

  if (!isOpen) return null;

  // Auto-generate quote name based on parameters
  const generateName = () => {
    const limitStr = limit >= 1000000 ? `$${limit / 1000000}M` : `$${limit / 1000}K`;
    const retentionStr = retention >= 1000000 ? `$${retention / 1000000}M` : `$${retention / 1000}K`;
    // For excess, attachment unknown - name updates after tower configured
    return `${limitStr} x ${retentionStr}`;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalName = quoteName.trim() || generateName();

    if (position === 'excess') {
      // Excess quote: create tower based on whether primary carrier is known
      const tower = [];
      if (primaryCarrier.trim()) {
        // Primary carrier known - limit is their limit, CMAI defaults to same
        tower.push({ carrier: primaryCarrier.trim(), limit, attachment: 0, retention, premium: null });
        tower.push({ carrier: 'CMAI', limit, attachment: limit, premium: null });
      } else {
        // No primary carrier - limit is our limit
        tower.push({ carrier: 'CMAI', limit, attachment: 0, premium: null });
      }

      onSubmit({
        quote_name: finalName,
        primary_retention: retention,
        policy_form: 'claims_made',
        position: 'excess',
        tower_json: tower,
      });
    } else {
      // Primary quote: CMAI at ground level
      onSubmit({
        quote_name: finalName,
        primary_retention: retention,
        policy_form: 'claims_made',
        position: 'primary',
        tower_json: [
          { carrier: 'CMAI', limit, attachment: 0, premium: null }
        ],
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Quote Option</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Position Toggle - includes Clone if quote selected */}
          <div>
            <label className="form-label">Start From</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                  position === 'primary'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
                onClick={() => setPosition('primary')}
              >
                Primary
              </button>
              <button
                type="button"
                className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                  position === 'excess'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
                onClick={() => setPosition('excess')}
              >
                Excess
              </button>
              {selectedQuote && (
                <button
                  type="button"
                  className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition-colors ${
                    position === 'clone'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                  onClick={() => setPosition('clone')}
                >
                  Clone
                </button>
              )}
            </div>
          </div>

          {/* Clone info */}
          {position === 'clone' && selectedQuote && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200 text-center">
              <p className="text-sm text-green-800">
                Will create a copy of <span className="font-semibold">{selectedQuote.quote_name || 'selected option'}</span>
              </p>
            </div>
          )}

          {/* Primary fields */}
          {position === 'primary' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Our Limit</label>
                <select
                  className="form-select"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  <option value={1000000}>$1M</option>
                  <option value={2000000}>$2M</option>
                  <option value={3000000}>$3M</option>
                  <option value={5000000}>$5M</option>
                  <option value={10000000}>$10M</option>
                </select>
              </div>
              <div>
                <label className="form-label">Retention</label>
                <select
                  className="form-select"
                  value={retention}
                  onChange={(e) => setRetention(Number(e.target.value))}
                >
                  <option value={25000}>$25K</option>
                  <option value={50000}>$50K</option>
                  <option value={100000}>$100K</option>
                  <option value={150000}>$150K</option>
                  <option value={250000}>$250K</option>
                </select>
              </div>
            </div>
          )}

          {/* Excess fields - all optional */}
          {position === 'excess' && (
            <div className="space-y-4">
              <div>
                <label className="form-label">Primary Carrier</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Travelers, Chubb"
                  value={primaryCarrier}
                  onChange={(e) => setPrimaryCarrier(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">
                    {primaryCarrier.trim() ? 'Primary Limit' : 'Our Limit'}
                  </label>
                  <select
                    className="form-select"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                  >
                    <option value={1000000}>$1M</option>
                    <option value={2000000}>$2M</option>
                    <option value={3000000}>$3M</option>
                    <option value={5000000}>$5M</option>
                    <option value={10000000}>$10M</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">SIR</label>
                  <select
                    className="form-select"
                    value={retention}
                    onChange={(e) => setRetention(Number(e.target.value))}
                  >
                    <option value={25000}>$25K</option>
                    <option value={50000}>$50K</option>
                    <option value={100000}>$100K</option>
                    <option value={150000}>$150K</option>
                    <option value={250000}>$250K</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500">Tower structure will be configured after creation</p>
            </div>
          )}

          {/* Quote Name - only for primary/excess, not clone */}
          {position !== 'clone' && (
            <div>
              <label className="form-label">Quote Name (optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder={generateName()}
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Leave blank to auto-generate</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              className="btn btn-outline flex-1"
              onClick={onClose}
              disabled={isPending || isCloning}
            >
              Cancel
            </button>
            {position === 'clone' ? (
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => {
                  onClone();
                  onClose();
                }}
                disabled={isCloning}
              >
                {isCloning ? 'Cloning...' : 'Clone Quote'}
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary flex-1"
                disabled={isPending}
              >
                {isPending ? 'Creating...' : 'Create Quote'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
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

// Document type label
function getDocTypeLabel(type) {
  const labels = {
    quote_primary: 'Quote (Primary)',
    quote_excess: 'Quote (Excess)',
  };
  return labels[type] || type;
}

// Required endorsements - always included on every quote
const REQUIRED_ENDORSEMENT_CODES = [
  "END-OFAC-001",  // OFAC Sanctions Compliance
  "END-WAR-001",   // War & Terrorism Exclusion
];

// Endorsement category display labels
const ENDORSEMENT_CATEGORIES = {
  exclusion: "Exclusions",
  extension: "Extensions",
  cyber: "Cyber",
  general: "General",
  coverage: "Coverage",
  reporting: "Reporting",
  administrative: "Administrative",
  cancellation: "Cancellation",
};

// Subjectivity row with status and overflow menu
function SubjectivityRow({ subj, idx, position, onDelete, onStatusChange, showOptions, allQuoteOptions, linkedQuoteIds, onToggleQuote }) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // Status badge colors
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    received: 'bg-green-100 text-green-800',
    waived: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="py-1">
      <div className="flex items-start gap-2 text-sm">
        <span className="w-5 text-center text-gray-300 mt-0.5 flex-shrink-0">+</span>
        <div className="relative flex-shrink-0">
          <button
            className={`text-xs w-16 text-center py-0.5 rounded cursor-pointer transition-colors ${statusColors[subj.status] || statusColors.pending}`}
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            onBlur={() => setTimeout(() => setShowStatusMenu(false), 150)}
          >
            {subj.status || 'pending'}
          </button>
          {showStatusMenu && (
            <div className="absolute left-0 top-6 bg-white border border-gray-200 rounded shadow-lg py-1 z-20 min-w-[100px]">
              {['pending', 'received', 'waived'].map(status => (
                <button
                  key={status}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${subj.status === status ? 'text-purple-600 font-medium' : 'text-gray-700'}`}
                  onClick={() => { onStatusChange(status); setShowStatusMenu(false); }}
                >
                  {status}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-gray-700">{subj.text}</span>
          {showOptions && allQuoteOptions && allQuoteOptions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {allQuoteOptions.map((opt) => {
                const isLinked = linkedQuoteIds?.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                      isLinked
                        ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    onClick={() => onToggleQuote(subj.id, opt.id, isLinked)}
                    title={isLinked ? `Remove from ${opt.name}` : `Add to ${opt.name}`}
                  >
                    {opt.name}
                  </button>
                );
              })}
              {/* Delete all badge */}
              <button
                className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                onClick={() => {
                  const displayText = subj.text.length > 50 ? `${subj.text.substring(0, 50)}...` : subj.text;
                  if (window.confirm(`Remove "${displayText}" from all options?`)) {
                    onDelete();
                  }
                }}
                title="Remove from all options"
              >
                × all
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Auto-added subjectivity row (from templates) - materializes on interaction
function AutoSubjectivityRow({ template, idx, position, submissionId, quoteId, onCreate, onRefetch, showOptions, allQuoteOptions }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // Create subjectivity with status and link to all quotes of same position
  const materializeWithStatus = async (status) => {
    if (!submissionId || isProcessing) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/submissions/${submissionId}/subjectivities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: template.text, status }),
      });
      if (response.ok) {
        onRefetch();
      }
    } catch (err) {
      console.error('Failed to create subjectivity:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // "Delete" an auto-added means excluding it - we create it with status 'excluded'
  const excludeAutoSubjectivity = async () => {
    if (!submissionId || isProcessing) return;
    const displayText = template.text.length > 50 ? `${template.text.substring(0, 50)}...` : template.text;
    if (!window.confirm(`Remove "${displayText}" from all options?`)) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/submissions/${submissionId}/subjectivities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: template.text, status: 'excluded' }),
      });
      if (response.ok) {
        onRefetch();
      }
    } catch (err) {
      console.error('Failed to exclude subjectivity:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="py-1">
      <div className="flex items-start gap-2 text-sm">
        <span className="w-5 text-center text-amber-500 mt-0.5 flex-shrink-0">⚡</span>
        <div className="relative flex-shrink-0">
          <button
            className="text-xs w-16 text-center py-0.5 rounded bg-yellow-100 text-yellow-800 cursor-pointer transition-colors"
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            onBlur={() => setTimeout(() => setShowStatusMenu(false), 150)}
            disabled={isProcessing}
          >
            {isProcessing ? '...' : 'pending'}
          </button>
          {showStatusMenu && !isProcessing && (
            <div className="absolute left-0 top-6 bg-white border border-gray-200 rounded shadow-lg py-1 z-20 min-w-[100px]">
              {['pending', 'received', 'waived'].map(status => (
                <button
                  key={status}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${status === 'pending' ? 'text-purple-600 font-medium' : 'text-gray-700'}`}
                  onClick={() => { materializeWithStatus(status); setShowStatusMenu(false); }}
                >
                  {status}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-gray-600">{template.text}</span>
          {showOptions && allQuoteOptions && allQuoteOptions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {allQuoteOptions.map((opt) => (
                <span
                  key={opt.id}
                  className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 opacity-60"
                >
                  {opt.name}
                </span>
              ))}
              {/* Delete all badge */}
              <button
                className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                onClick={excludeAutoSubjectivity}
                disabled={isProcessing}
                title="Remove from all options"
              >
                × all
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Quote detail panel
function QuoteDetailPanel({ quote, submission, onRefresh, allQuotes }) {
  const queryClient = useQueryClient();
  const [editedRetention, setEditedRetention] = useState(quote.primary_retention);
  const [editedSoldPremium, setEditedSoldPremium] = useState(quote.sold_premium || '');
  const [editedDescriptor, setEditedDescriptor] = useState(quote.option_descriptor || '');
  const [packageType, setPackageType] = useState('quote_only');
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [showPackageOptions, setShowPackageOptions] = useState(false);
  const [includeEndorsements, setIncludeEndorsements] = useState(true);
  const [includeSpecimen, setIncludeSpecimen] = useState(true);
  const [editingTower, setEditingTower] = useState(false);
  const [towerLayers, setTowerLayers] = useState(quote.tower_json || []);
  // QS column shown if any layer has quota_share set
  const hasAnyQs = (quote.tower_json || []).some(l => l.quota_share);
  const [showQsColumn, setShowQsColumn] = useState(hasAnyQs);

  // Retro schedule editing state
  const [editingRetroSchedule, setEditingRetroSchedule] = useState(false);

  // Subjectivities UI state
  const [customSubjectivity, setCustomSubjectivity] = useState('');
  const [selectedStock, setSelectedStock] = useState('');
  const [openSubjMenu, setOpenSubjMenu] = useState(null); // tracks which menu is open: 'auto-{idx}-status', 'subj-{id}-actions', etc.
  const [showSubjOptions, setShowSubjOptions] = useState(false); // toggle to show which quote options each subjectivity is on

  // Endorsements state
  const [selectedEndorsement, setSelectedEndorsement] = useState('');
  const [showEndorsementOptions, setShowEndorsementOptions] = useState(false);

  // Bind validation state
  const [bindValidationErrors, setBindValidationErrors] = useState([]);
  const [bindValidationWarnings, setBindValidationWarnings] = useState([]);
  const [showBindConfirmation, setShowBindConfirmation] = useState(false);

  // Unbind confirmation state
  const [showUnbindConfirm, setShowUnbindConfirm] = useState(false);
  const [unbindReason, setUnbindReason] = useState('');

  // Reset state when quote changes
  useEffect(() => {
    setTowerLayers(quote.tower_json || []);
    setEditingTower(false);
    setEditedDescriptor(quote.option_descriptor || '');
    setSelectedEndorsement('');
    setEditingRetroSchedule(false);
    // Auto-show QS column if any layer has quota share
    setShowQsColumn((quote.tower_json || []).some(l => l.quota_share));
    // Clear bind validation state
    setBindValidationErrors([]);
    setBindValidationWarnings([]);
    setShowBindConfirmation(false);
  }, [quote.id]);

  const limit = getTowerLimit(quote);
  const position = quote.position || 'primary';

  // Query for quote's linked subjectivities (junction table)
  const { data: quoteSubjectivities = [], refetch: refetchSubjectivities } = useQuery({
    queryKey: ['quoteSubjectivities', quote.id],
    queryFn: () => getQuoteSubjectivities(quote.id).then(res => res.data),
  });

  // Query for subjectivity templates (filtered by position)
  const { data: subjectivityTemplates = [] } = useQuery({
    queryKey: ['subjectivityTemplates', position],
    queryFn: () => getSubjectivityTemplates(position).then(res => res.data),
  });

  // Query for submission-level subjectivities (includes quote_ids for each)
  const { data: submissionSubjectivities = [] } = useQuery({
    queryKey: ['submissionSubjectivities', submission.id],
    queryFn: () => getSubmissionSubjectivities(submission.id).then(res => res.data),
    enabled: showSubjOptions, // only fetch when toggle is on
  });

  // Build quote info for option badges - use generateOptionName for consistency with cards
  const allQuoteOptions = (allQuotes || []).map(q => ({
    id: q.id,
    name: generateOptionName(q),
  }));

  // Build a map of subjectivity text -> linked quote IDs
  const subjQuoteIdsMap = {};
  if (showSubjOptions && submissionSubjectivities.length > 0) {
    submissionSubjectivities.forEach(s => {
      let quoteIds = s.quote_ids || [];
      if (typeof quoteIds === 'string') {
        quoteIds = quoteIds.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
      }
      if (!Array.isArray(quoteIds)) quoteIds = [];
      subjQuoteIdsMap[s.text] = quoteIds;
    });
  }

  // Get subjectivity texts for display (from junction table data)
  const subjectivities = quoteSubjectivities.map(s => s.text);

  // Query for quote documents
  const { data: quoteDocuments } = useQuery({
    queryKey: ['quoteDocuments', quote.id],
    queryFn: () => getQuoteDocuments(quote.id).then(res => res.data),
  });

  // Query for available package documents
  const { data: packageDocsData } = useQuery({
    queryKey: ['packageDocuments', position],
    queryFn: () => getPackageDocuments(position).then(res => res.data),
    enabled: showPackageOptions,
  });

  // Query for quote's endorsements (from junction table)
  const { data: quoteEndorsementsData, refetch: refetchEndorsements } = useQuery({
    queryKey: ['quoteEndorsements', quote.id],
    queryFn: () => getQuoteEndorsements(quote.id).then(res => res.data),
  });

  // Query for available endorsements from document library
  const { data: availableEndorsements } = useQuery({
    queryKey: ['documentLibrary', 'endorsement', position],
    queryFn: () => getDocumentLibraryEntries({
      document_type: 'endorsement',
      position: position,
      status: 'active',
    }).then(res => res.data),
  });

  // Query for auto-attach endorsements based on quote data
  const { data: autoEndorsementsData } = useQuery({
    queryKey: ['autoEndorsements', quote.id],
    queryFn: () => getQuoteAutoEndorsements(quote.id).then(res => res.data),
  });

  // Query for submission-level endorsements (shows all endorsements across all quotes)
  const { data: submissionEndorsementsData, refetch: refetchSubmissionEndorsements } = useQuery({
    queryKey: ['submissionEndorsements', submission.id],
    queryFn: () => getSubmissionEndorsements(submission.id).then(res => res.data),
  });

  // Build map of endorsement_id -> quote_ids
  const endorsementQuoteIdsMap = {};
  if (submissionEndorsementsData?.endorsements) {
    submissionEndorsementsData.endorsements.forEach(e => {
      let quoteIds = e.quote_ids || [];
      if (typeof quoteIds === 'string') {
        quoteIds = quoteIds.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
      }
      endorsementQuoteIdsMap[e.endorsement_id] = quoteIds;
    });
  }

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateQuoteOption(quote.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
    },
  });

  // Update submission mutation (for policy dates)
  const updateSubmissionMutation = useMutation({
    mutationFn: (data) => updateSubmission(submission.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submission', submission.id] });
    },
  });

  // Bind quote mutation
  const bindMutation = useMutation({
    mutationFn: (force = false) => bindQuoteOption(quote.id, force),
    onSuccess: () => {
      setBindValidationErrors([]);
      setBindValidationWarnings([]);
      setShowBindConfirmation(false);
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['submission', submission.id] }); // Sync header pill
      onRefresh?.();
    },
    onError: (error) => {
      const detail = error.response?.data?.detail;
      if (detail && typeof detail === 'object') {
        // Structured validation error
        setBindValidationErrors(detail.errors || []);
        setBindValidationWarnings(detail.warnings || []);
        // If there are only warnings (requires_confirmation), show confirmation dialog
        if (detail.requires_confirmation && (!detail.errors || detail.errors.length === 0)) {
          setShowBindConfirmation(true);
        }
      } else {
        // Generic error
        setBindValidationErrors([{ code: 'unknown', message: detail || 'Failed to bind quote' }]);
        setBindValidationWarnings([]);
      }
    },
  });

  // Handle bind with optional force for warnings
  const handleBind = (force = false) => {
    setBindValidationErrors([]);
    setBindValidationWarnings([]);
    bindMutation.mutate(force);
  };

  // Unbind quote mutation
  const unbindMutation = useMutation({
    mutationFn: (reason) => unbindQuoteOption(quote.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['submission', submission.id] }); // Sync header pill
      setShowUnbindConfirm(false);
      setUnbindReason('');
      onRefresh?.();
    },
  });

  // Apply to all quotes mutation
  const applyToAllMutation = useMutation({
    mutationFn: (data) => applyToAllQuotes(quote.id, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
      // Invalidate subjectivities for all quotes in this submission
      if (response.data?.subjectivities_applied) {
        allQuotes?.forEach(q => {
          queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
        });
      }
      const count = response.data?.updated_count || 0;
      if (count > 0) {
        console.log(`Applied to ${count} other option(s)`);
      }
    },
  });

  // Create subjectivity mutation
  // If template has position, links to that position only; otherwise links to all
  const createSubjectivityMutation = useMutation({
    mutationFn: ({ text, templatePosition }) => createSubjectivity(submission.id, {
      text,
      category: 'general',
      position: templatePosition || null, // null = all options
    }),
    onSuccess: (_, { templatePosition }) => {
      refetchSubjectivities();
      // Invalidate relevant quotes' subjectivities
      if (templatePosition) {
        allQuotes?.filter(q => q.position === templatePosition).forEach(q => {
          queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
        });
      } else {
        allQuotes?.forEach(q => {
          queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
        });
      }
    },
  });

  // Remove subjectivity from this quote only
  const unlinkSubjectivityMutation = useMutation({
    mutationFn: (subjectivityId) => unlinkSubjectivityFromQuote(quote.id, subjectivityId),
    onSuccess: () => {
      refetchSubjectivities();
    },
  });

  // Remove subjectivity from all quotes of this position (primary/excess)
  const unlinkFromPositionMutation = useMutation({
    mutationFn: (subjectivityId) => unlinkSubjectivityFromPosition(subjectivityId, position),
    onSuccess: () => {
      refetchSubjectivities();
      // Invalidate same-position quotes
      allQuotes?.filter(q => q.position === position).forEach(q => {
        queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
      });
    },
  });

  // Delete subjectivity entirely (removes from all quotes)
  const deleteSubjectivityMutation = useMutation({
    mutationFn: (subjectivityId) => deleteSubjectivity(subjectivityId),
    onSuccess: () => {
      refetchSubjectivities();
      // Invalidate all quotes since this deletes from all
      allQuotes?.forEach(q => {
        queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
      });
    },
  });

  // Toggle link between subjectivity and quote option
  const toggleSubjQuoteMutation = useMutation({
    mutationFn: ({ subjectivityId, quoteId, isLinked }) =>
      isLinked
        ? unlinkSubjectivityFromQuote(quoteId, subjectivityId)
        : linkSubjectivityToQuote(quoteId, subjectivityId),
    onSuccess: () => {
      refetchSubjectivities();
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submission.id] });
      allQuotes?.forEach(q => {
        queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
      });
    },
  });

  // Toggle link between endorsement and quote option
  const toggleEndorsementQuoteMutation = useMutation({
    mutationFn: ({ endorsementId, quoteId, isLinked }) =>
      isLinked
        ? unlinkEndorsementFromQuote(quoteId, endorsementId)
        : linkEndorsementToQuote(quoteId, endorsementId),
    onSuccess: () => {
      refetchEndorsements();
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submission.id] });
      allQuotes?.forEach(q => {
        queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', q.id] });
      });
    },
  });

  // Update subjectivity status (received/waived)
  const updateSubjectivityMutation = useMutation({
    mutationFn: ({ id, status }) => updateSubjectivity(id, { status }),
    onSuccess: () => {
      refetchSubjectivities();
      // Status is shared across all linked quotes
      allQuotes?.forEach(q => {
        queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
      });
    },
  });

  // Generate quote document/package mutation
  const generateDocMutation = useMutation({
    mutationFn: () => {
      if (packageType === 'full_package') {
        // Combine endorsement IDs (if checkbox checked) with selected additional documents
        const endorsementIds = includeEndorsements ? (quoteEndorsementsData?.matched_library_ids || []) : [];
        const allDocuments = [...endorsementIds, ...selectedDocuments];

        return generateQuotePackage(quote.id, {
          package_type: 'full_package',
          selected_documents: allDocuments,
          include_specimen: includeSpecimen,
        });
      }
      return generateQuoteDocument(quote.id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['quoteDocuments', quote.id] });
      queryClient.invalidateQueries({ queryKey: ['latestDocument', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['submissionDocuments', submission.id] });
      queryClient.invalidateQueries({ queryKey: ['submission', submission.id] }); // Sync header pill (API updates status to 'quoted')
      // Open the PDF in a new tab if available
      if (data.data?.pdf_url) {
        window.open(data.data.pdf_url, '_blank');
      }
    },
  });

  // Toggle document selection
  const toggleDocument = (docId) => {
    setSelectedDocuments(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  // Get document type labels
  const docTypeLabels = packageDocsData?.document_types || {
    claims_sheet: 'Claims Sheets',
    marketing: 'Marketing Materials',
  };

  // Count endorsements from the quote (not library matches)
  const quoteEndorsementCount = quoteEndorsementsData?.endorsements?.length || 0;

  // Count total docs that will be included
  const endorsementDocsCount = includeEndorsements ? quoteEndorsementCount : 0;
  const specimenCount = includeSpecimen ? 1 : 0;
  const totalDocsInPackage = endorsementDocsCount + selectedDocuments.length + specimenCount;

  const handleSaveConfig = () => {
    const updates = {};
    if (editedRetention !== quote.primary_retention) {
      updates.primary_retention = editedRetention;
      // Also update quote_name to reflect new retention
      const updatedQuote = { ...quote, tower_json: towerLayers, primary_retention: editedRetention };
      updates.quote_name = generateOptionName(updatedQuote);
    }
    if (editedSoldPremium && editedSoldPremium !== quote.sold_premium) {
      updates.sold_premium = Number(editedSoldPremium);
    }
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const hasChanges =
    editedRetention !== quote.primary_retention ||
    (editedSoldPremium && Number(editedSoldPremium) !== quote.sold_premium);

  // Auto-generated name from current tower state (uses local towerLayers for live updates)
  const currentQuoteWithTower = { ...quote, tower_json: towerLayers, primary_retention: editedRetention };
  const autoName = generateOptionName(currentQuoteWithTower);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold text-gray-900 whitespace-nowrap">{autoName}</h3>
          <input
            type="text"
            className="form-input text-sm py-1 px-2 w-32 border-transparent hover:border-gray-300 focus:border-purple-500"
            placeholder="descriptor"
            value={editedDescriptor}
            onChange={(e) => setEditedDescriptor(e.target.value)}
            onBlur={() => {
              if (editedDescriptor !== (quote.option_descriptor || '')) {
                updateMutation.mutate({ option_descriptor: editedDescriptor || null });
              }
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          {quote.is_bound ? (
            <>
              <span className="badge badge-bound">BOUND</span>
              <button
                onClick={() => setShowUnbindConfirm(true)}
                disabled={unbindMutation.isPending}
                className="text-sm text-gray-500 hover:text-red-600 transition-colors"
                title="Unbind this quote option"
              >
                {unbindMutation.isPending ? '...' : 'Unbind'}
              </button>
            </>
          ) : quoteDocuments && quoteDocuments.length > 0 ? (
            <>
              <span className="badge badge-quoted">QUOTED</span>
              <button
                onClick={() => handleBind(false)}
                disabled={bindMutation.isPending}
                className="text-sm text-purple-600 hover:text-purple-800 font-medium transition-colors"
                title="Bind this quote option"
              >
                {bindMutation.isPending ? '...' : 'Bind'}
              </button>
            </>
          ) : (
            <span className="badge badge-draft">DRAFT</span>
          )}
        </div>
      </div>

      {/* Bind Validation Errors */}
      {bindValidationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800">Cannot bind - missing required fields</h4>
              <ul className="mt-2 text-sm text-red-700 space-y-1">
                {bindValidationErrors.map((err, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-red-500 bg-red-100 px-1.5 py-0.5 rounded">{err.tab || 'Quote'}</span>
                    {err.message}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setBindValidationErrors([])}
                className="mt-3 text-xs text-red-600 hover:text-red-800"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bind Confirmation Dialog (warnings only) */}
      {showBindConfirmation && bindValidationWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-amber-800">Confirm bind with warnings</h4>
              <ul className="mt-2 text-sm text-amber-700 space-y-1">
                {bindValidationWarnings.map((warn, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">{warn.tab || 'Quote'}</span>
                    {warn.message}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleBind(true)}
                  disabled={bindMutation.isPending}
                  className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  {bindMutation.isPending ? 'Binding...' : 'Bind Anyway'}
                </button>
                <button
                  onClick={() => {
                    setShowBindConfirmation(false);
                    setBindValidationWarnings([]);
                  }}
                  className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unbind Confirmation Modal */}
      {showUnbindConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Unbind Quote?</h3>
            <p className="text-gray-600 mb-4">
              This will unbind the quote option. Any generated documents will remain but the policy will no longer be active.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for unbinding (required)
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                rows={3}
                placeholder="e.g., Client requested cancellation, Quote error discovered, etc."
                value={unbindReason}
                onChange={(e) => setUnbindReason(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">This will be logged for audit purposes.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                className="px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                onClick={() => {
                  setShowUnbindConfirm(false);
                  setUnbindReason('');
                }}
                disabled={unbindMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                onClick={() => unbindMutation.mutate(unbindReason)}
                disabled={unbindMutation.isPending || !unbindReason.trim()}
              >
                {unbindMutation.isPending ? 'Unbinding...' : 'Unbind'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Summary - Only for Primary quotes */}
      {position === 'primary' && (
        <div className="card">
          <h4 className="form-section-title">Premium Summary</h4>
          <div className="grid grid-cols-3 gap-6">
            <div className="metric-card">
              <div className="metric-label">Technical Premium</div>
              <div className="metric-value">{formatCurrency(quote.technical_premium)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Risk-Adjusted Premium</div>
              <div className="metric-value text-blue-600">{formatCurrency(quote.risk_adjusted_premium)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Sold Premium</div>
              <input
                type="text"
                inputMode="numeric"
                className="form-input text-green-600 font-semibold text-lg"
                value={formatNumberWithCommas(editedSoldPremium)}
                onChange={(e) => setEditedSoldPremium(parseFormattedNumber(e.target.value))}
                placeholder="Enter sold premium"
              />
            </div>
          </div>
        </div>
      )}

      {/* Policy Configuration - Only for Primary quotes */}
      {position === 'primary' && (
        <div className="card">
          <h4 className="form-section-title">Policy Configuration</h4>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="form-label">Policy Limit</label>
              <input
                type="text"
                className="form-input bg-gray-50"
                value={formatCompact(limit)}
                readOnly
              />
            </div>
            <div>
              <label className="form-label">Retention/Deductible</label>
              <select
                className="form-select"
                value={editedRetention}
                onChange={(e) => setEditedRetention(Number(e.target.value))}
              >
                <option value={25000}>$25K</option>
                <option value={50000}>$50K</option>
                <option value={100000}>$100K</option>
                <option value={150000}>$150K</option>
                <option value={250000}>$250K</option>
              </select>
            </div>
          </div>
          {hasChanges && (
            <div className="mt-4 flex items-center gap-3">
              <button
                className="btn btn-primary"
                onClick={handleSaveConfig}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
              {updateMutation.isSuccess && (
                <span className="text-sm text-green-600">Saved!</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tower Structure - Only for Excess quotes */}
      {position !== 'primary' && (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h4 className="form-section-title mb-0">Tower Structure</h4>
          {!editingTower ? (
            <button
              className="text-sm text-purple-600 hover:text-purple-800"
              onClick={() => setEditingTower(true)}
            >
              Edit Tower
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setTowerLayers(quote.tower_json || []);
                  setEditingTower(false);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  // Recalculate attachments before saving
                  const recalculated = recalculateAttachments(towerLayers);
                  // Also update quote_name to match new tower structure
                  const updatedQuote = { ...quote, tower_json: recalculated, primary_retention: editedRetention };
                  const newName = generateOptionName(updatedQuote);
                  updateMutation.mutate({ tower_json: recalculated, quote_name: newName });
                  setEditingTower(false);
                }}
              >
                Save Tower
              </button>
            </div>
          )}
        </div>

        {editingTower ? (
          <div className="space-y-3">
            {/* QS Toggle + Column Headers */}
            <div className="flex items-center gap-4 px-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showQsColumn}
                  onChange={(e) => {
                    setShowQsColumn(e.target.checked);
                    // Clear quota_share from all layers when hiding column
                    if (!e.target.checked) {
                      setTowerLayers(towerLayers.map(l => {
                        const { quota_share, ...rest } = l;
                        return rest;
                      }));
                    }
                  }}
                  className="rounded border-gray-300 text-purple-600 w-3 h-3"
                />
                Quota Share
              </label>
            </div>
            <div className={`grid ${showQsColumn ? 'grid-cols-8' : 'grid-cols-7'} gap-3 px-4 text-xs text-gray-500 font-medium`}>
              <div>Carrier</div>
              <div>Limit</div>
              {showQsColumn && <div>Part of</div>}
              <div>Ret/Attach</div>
              <div>Premium</div>
              <div>RPM</div>
              <div>ILF</div>
              <div></div>
            </div>

            {/* Show layers from top to bottom (reversed for visual stacking) */}
            {[...towerLayers].reverse().map((layer, displayIdx) => {
              const actualIdx = towerLayers.length - 1 - displayIdx;
              const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
              const isPrimary = actualIdx === 0; // First layer in array is primary (ground level)

              // Calculate attachment for this layer (handles quota share correctly)
              const calculatedAttachment = calculateAttachment(towerLayers, actualIdx);

              // Calculate QS layer fill status (if this is a QS layer)
              const qsStatus = getQsLayerStatus(towerLayers, actualIdx);

              // Calculate RPM (use limit which is the carrier's participation)
              const rpm = layer.premium && layer.limit
                ? layer.premium / (layer.limit / 1000000)
                : null;

              // Calculate ILF (relative to layer below, primary = 1.00)
              let ilf = null;
              if (isPrimary && rpm) {
                ilf = 1.00;
              } else if (rpm && actualIdx > 0) {
                const belowLayer = towerLayers[actualIdx - 1];
                if (belowLayer?.premium && belowLayer?.limit) {
                  const belowRpm = belowLayer.premium / (belowLayer.limit / 1000000);
                  if (belowRpm > 0) {
                    ilf = rpm / belowRpm;
                  }
                }
              }

              return (
                <div
                  key={actualIdx}
                  className={`p-3 rounded-lg border-2 ${
                    isCMAI ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className={`grid ${showQsColumn ? 'grid-cols-8' : 'grid-cols-7'} gap-3 items-center`}>
                    {/* Carrier */}
                    <div>
                      {isCMAI ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-purple-700">CMAI</span>
                          <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded">Ours</span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="form-input text-sm py-1"
                          value={layer.carrier || ''}
                          placeholder="Carrier name"
                          onChange={(e) => {
                            const newLayers = [...towerLayers];
                            newLayers[actualIdx] = { ...newLayers[actualIdx], carrier: e.target.value };
                            setTowerLayers(newLayers);
                          }}
                        />
                      )}
                    </div>

                    {/* Limit (carrier's participation) */}
                    <div>
                      <select
                        className="form-select text-sm py-1"
                        value={layer.limit || 1000000}
                        onChange={(e) => {
                          const newLayers = [...towerLayers];
                          newLayers[actualIdx] = { ...newLayers[actualIdx], limit: Number(e.target.value) };
                          setTowerLayers(newLayers);
                        }}
                      >
                        <option value={1000000}>$1M</option>
                        <option value={2000000}>$2M</option>
                        <option value={2500000}>$2.5M</option>
                        <option value={3000000}>$3M</option>
                        <option value={5000000}>$5M</option>
                        <option value={7500000}>$7.5M</option>
                        <option value={10000000}>$10M</option>
                        <option value={15000000}>$15M</option>
                        <option value={25000000}>$25M</option>
                      </select>
                    </div>

                    {/* Part of (full layer size) - only when QS column shown */}
                    {showQsColumn && (
                      <div className="flex items-center gap-1">
                        <select
                          className={`form-select text-sm py-1 flex-1 ${qsStatus && !qsStatus.isComplete ? 'border-orange-400 bg-orange-50' : ''}`}
                          value={layer.quota_share || ''}
                          title={qsStatus ? `${formatCompact(qsStatus.filled)} of ${formatCompact(qsStatus.total)} filled${!qsStatus.isComplete ? ` (${formatCompact(qsStatus.gap)} gap)` : ''}` : ''}
                          onChange={(e) => {
                            const newLayers = [...towerLayers];
                            const val = e.target.value ? Number(e.target.value) : null;
                            if (val) {
                              newLayers[actualIdx] = { ...newLayers[actualIdx], quota_share: val };
                            } else {
                              const { quota_share, ...rest } = newLayers[actualIdx];
                              newLayers[actualIdx] = rest;
                            }
                            setTowerLayers(newLayers);
                          }}
                        >
                          <option value="">—</option>
                          <option value={5000000}>$5M</option>
                          <option value={10000000}>$10M</option>
                          <option value={15000000}>$15M</option>
                          <option value={25000000}>$25M</option>
                        </select>
                        {/* Small indicator for incomplete QS */}
                        {qsStatus && !qsStatus.isComplete && (
                          <span className="text-orange-500 text-xs font-medium" title={`${formatCompact(qsStatus.gap)} remaining`}>
                            !
                          </span>
                        )}
                      </div>
                    )}

                    {/* Retention (primary) or Attachment (excess) */}
                    <div>
                      {isPrimary && !isCMAI ? (
                        // Primary layer shows retention dropdown
                        <select
                          className="form-select text-sm py-1"
                          value={layer.retention || quote.primary_retention || 25000}
                          onChange={(e) => {
                            const newLayers = [...towerLayers];
                            newLayers[actualIdx] = { ...newLayers[actualIdx], retention: Number(e.target.value) };
                            setTowerLayers(newLayers);
                          }}
                        >
                          <option value={10000}>$10K ret</option>
                          <option value={25000}>$25K ret</option>
                          <option value={50000}>$50K ret</option>
                          <option value={100000}>$100K ret</option>
                          <option value={250000}>$250K ret</option>
                        </select>
                      ) : (
                        // Excess layers show auto-calculated attachment (read-only)
                        <span className="text-sm font-medium text-gray-700">
                          xs {formatCompact(calculatedAttachment)}
                        </span>
                      )}
                    </div>

                    {/* Premium */}
                    <div>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-input text-sm py-1"
                        value={layer.premium ? formatNumberWithCommas(layer.premium) : ''}
                        placeholder="$"
                        onChange={(e) => {
                          const newLayers = [...towerLayers];
                          const parsed = parseFormattedNumber(e.target.value);
                          newLayers[actualIdx] = {
                            ...newLayers[actualIdx],
                            premium: parsed ? Number(parsed) : null
                          };
                          setTowerLayers(newLayers);
                        }}
                      />
                    </div>

                    {/* RPM (calculated) */}
                    <div className="text-sm text-gray-600">
                      {rpm ? (rpm >= 1000 ? `$${(rpm / 1000).toFixed(1)}K` : `$${Math.round(rpm)}`) : '—'}
                    </div>

                    {/* ILF (calculated) */}
                    <div className="text-sm text-gray-600">
                      {ilf !== null ? ilf.toFixed(2) : '—'}
                    </div>

                    {/* Actions */}
                    <div className="text-right">
                      {!isCMAI && (
                        <button
                          className="text-red-500 hover:text-red-700 text-sm"
                          onClick={() => {
                            setTowerLayers(towerLayers.filter((_, i) => i !== actualIdx));
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add Layer Button */}
            <button
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600"
              onClick={() => {
                // Find CMAI layer index (new layer goes just below CMAI)
                const cmaiIdx = towerLayers.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));

                // Search for any incomplete QS layer in the stack (excluding CMAI)
                // Start from the top (just below CMAI) and work down
                let inheritedQs = null;
                const searchStart = cmaiIdx > 0 ? cmaiIdx - 1 : towerLayers.length - 1;
                for (let i = searchStart; i >= 0; i--) {
                  const layer = towerLayers[i];
                  if (layer?.quota_share) {
                    const qsStatus = getQsLayerStatus(towerLayers, i);
                    if (qsStatus && !qsStatus.isComplete) {
                      inheritedQs = layer.quota_share;
                      break; // Found the topmost incomplete QS
                    }
                  }
                }

                const newLayer = {
                  carrier: '',
                  limit: 5000000,
                  attachment: 0,
                  premium: null,
                  ...(inheritedQs && { quota_share: inheritedQs }),
                };

                // Insert before CMAI (so CMAI stays at top)
                if (cmaiIdx > 0) {
                  const newLayers = [...towerLayers];
                  newLayers.splice(cmaiIdx, 0, newLayer);
                  setTowerLayers(newLayers);
                } else {
                  // If no CMAI or CMAI is first, add at beginning
                  setTowerLayers([newLayer, ...towerLayers]);
                }
              }}
            >
              + Add Underlying Layer
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {towerLayers.length > 0 ? (
              <>
                {/* Column Headers for read-only view */}
                <div className="grid grid-cols-[2fr_1fr_auto_1fr_1fr_1fr_1fr] gap-x-3 px-3 text-xs text-gray-400 font-medium">
                  <div>Carrier</div>
                  <div>Limit</div>
                  <div></div>
                  <div>Attach</div>
                  <div>Premium</div>
                  <div>RPM</div>
                  <div>ILF</div>
                </div>
                {[...towerLayers].reverse().map((layer, displayIdx) => {
                  const actualIdx = towerLayers.length - 1 - displayIdx;
                  const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
                  const isPrimary = actualIdx === 0;

                  // Calculate attachment (handles quota share correctly)
                  const calculatedAttachment = calculateAttachment(towerLayers, actualIdx);

                  // Calculate RPM (use limit which is the carrier's participation)
                  const rpm = layer.premium && layer.limit
                    ? layer.premium / (layer.limit / 1000000)
                    : null;

                  // Calculate ILF (relative to layer below, primary = 1.00)
                  let ilf = null;
                  if (isPrimary && rpm) {
                    ilf = 1.00;
                  } else if (rpm && actualIdx > 0) {
                    const belowLayer = towerLayers[actualIdx - 1];
                    if (belowLayer?.premium && belowLayer?.limit) {
                      const belowRpm = belowLayer.premium / (belowLayer.limit / 1000000);
                      if (belowRpm > 0) {
                        ilf = rpm / belowRpm;
                      }
                    }
                  }

                  return (
                    <div
                      key={displayIdx}
                      className={`p-3 rounded-lg border-2 ${
                        isCMAI ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="grid grid-cols-[2fr_1fr_auto_1fr_1fr_1fr_1fr] gap-x-3 items-center text-sm">
                        {/* Carrier */}
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${isCMAI ? 'text-purple-700' : 'text-gray-700'}`}>
                            {layer.carrier || 'Unnamed'}
                          </span>
                          {isCMAI && (
                            <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded">
                              Ours
                            </span>
                          )}
                        </div>
                        {/* Limit - show participation, and "po X" if quota share */}
                        <div className="text-gray-600">
                          {formatCompact(layer.limit)}
                          {layer.quota_share && (
                            <span className="text-gray-400 text-xs ml-1">po {formatCompact(layer.quota_share)}</span>
                          )}
                        </div>
                        {/* xs/ret label */}
                        <div className="text-gray-400 text-xs w-6">
                          {isPrimary && !isCMAI ? '' : 'xs'}
                        </div>
                        {/* Attachment/Retention value */}
                        <div className="text-gray-600">
                          {isPrimary && !isCMAI
                            ? `${formatCompact(layer.retention || quote.primary_retention)} ret`
                            : formatCompact(calculatedAttachment)
                          }
                        </div>
                        {/* Premium */}
                        <div className="text-green-600 font-medium">
                          {layer.premium ? formatCurrency(layer.premium) : '—'}
                        </div>
                        {/* RPM */}
                        <div className="text-gray-500">
                          {rpm ? (rpm >= 1000 ? `$${(rpm / 1000).toFixed(1)}K` : `$${Math.round(rpm)}`) : '—'}
                        </div>
                        {/* ILF */}
                        <div className="text-gray-500">
                          {ilf !== null ? ilf.toFixed(2) : '—'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <p className="text-gray-500 text-sm">No tower layers configured</p>
            )}
          </div>
        )}
      </div>
      )}

      {/* Policy Dates & Retro */}
      <div className="card">
        <h4 className="form-section-title">Policy Dates & Retro</h4>

        {/* Policy Period */}
        <div className="mb-4">
          {!submission.effective_date ? (
            // No dates set - show "12 month policy period" with option to set specific dates
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Policy Period:</span>
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded">
                  12 month policy period
                </span>
                <span className="text-xs text-gray-500">(dates to be determined)</span>
              </div>
              <button
                type="button"
                className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                onClick={() => {
                  // Set today as effective, +1 year as expiration
                  const today = new Date();
                  const eff = today.toISOString().split('T')[0];
                  const exp = new Date(today.setFullYear(today.getFullYear() + 1)).toISOString().split('T')[0];
                  updateSubmissionMutation.mutate({
                    effective_date: eff,
                    expiration_date: exp,
                  });
                }}
              >
                Set specific dates
              </button>
            </div>
          ) : (
            // Dates are set - show date inputs
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Effective Date</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="form-input flex-1"
                    key={`eff-${quote.id}-${submission.effective_date || 'none'}`}
                    defaultValue={submission.effective_date || ''}
                    onBlur={(e) => {
                      const newDate = e.target.value || null;
                      if (newDate !== submission.effective_date) {
                        if (newDate) {
                          // Calculate expiration as 12 months from effective (timezone-safe)
                          const [year, month, day] = newDate.split('-').map(Number);
                          const expYear = year + 1;
                          const expDate = `${expYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          updateSubmissionMutation.mutate({
                            effective_date: newDate,
                            expiration_date: expDate,
                          });
                        } else {
                          // Clear both dates
                          updateSubmissionMutation.mutate({
                            effective_date: null,
                            expiration_date: null,
                          });
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="px-2 text-gray-400 hover:text-red-500"
                    title="Clear dates (use 12 month term)"
                    onClick={() => {
                      updateSubmissionMutation.mutate({
                        effective_date: null,
                        expiration_date: null,
                      });
                    }}
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Clear to use "12 month policy period"</p>
              </div>
              <div>
                <label className="form-label">Expiration Date</label>
                <input
                  type="date"
                  className="form-input"
                  key={`exp-${quote.id}-${submission.expiration_date || 'none'}`}
                  defaultValue={submission.expiration_date || ''}
                  onBlur={(e) => {
                    const newDate = e.target.value || null;
                    if (newDate !== submission.expiration_date) {
                      updateSubmissionMutation.mutate({ expiration_date: newDate });
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">Auto-set from effective</p>
              </div>
            </div>
          )}
        </div>

        {/* Retro Schedule */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h5 className="font-medium text-sm">Retroactive Dates</h5>
              <p className="text-xs text-gray-500">Per-coverage retro schedule</p>
            </div>
            <div className="flex gap-2">
              {!editingRetroSchedule && (
                <button
                  className="text-xs px-3 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100"
                  onClick={() => {
                    applyToAllQuotes(quote.id, { retro_schedule: true }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['quotes', submission.id] });
                    });
                  }}
                >
                  Apply to All
                </button>
              )}
              <button
                className="text-xs px-3 py-1 border rounded hover:bg-gray-50"
                onClick={() => setEditingRetroSchedule(!editingRetroSchedule)}
              >
                {editingRetroSchedule ? 'Cancel' : 'Edit'}
              </button>
            </div>
          </div>

          <RetroScheduleEditor
            schedule={quote.retro_schedule || []}
            notes={quote.retro_notes || ''}
            position={position}
            coverages={quote.coverages || {}}
            policyForm={quote.policy_form || ''}
            sublimits={quote.sublimits || []}
            onChange={(schedule, notes) => {
              updateMutation.mutate({ retro_schedule: schedule, retro_notes: notes });
              setEditingRetroSchedule(false);
            }}
            readOnly={!editingRetroSchedule}
          />
        </div>
      </div>

      {/* Coverage Schedule - Only for Primary quotes */}
      {position === 'primary' && (
        <CoverageEditor
          quote={quote}
          aggregateLimit={limit || 1000000}
          onSave={(updatedCoverages) => {
            updateMutation.mutate({ coverages: updatedCoverages });
          }}
          allQuotes={allQuotes}
          submissionId={submission.id}
        />
      )}

      {/* Coverage Schedule - Only for Excess quotes */}
      {position !== 'primary' && (
        <ExcessCoverageEditor
          sublimits={quote.sublimits || []}
          towerJson={towerLayers}
          onSave={(updatedSublimits) => {
            updateMutation.mutate({ sublimits: updatedSublimits });
          }}
        />
      )}

      {/* Subjectivities */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h4 className="form-section-title mb-0">Subjectivities</h4>
          <button
            className={`text-xs px-2 py-1 rounded border transition-colors ${showSubjOptions ? 'bg-purple-100 border-purple-300 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
            onClick={() => setShowSubjOptions(!showSubjOptions)}
          >
            Options {showSubjOptions ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Simple list of all subjectivities */}
        <div className="space-y-1.5">
          {/* Auto-added subjectivities */}
          {(() => {
            const existingTexts = quoteSubjectivities.map(s => s.text);
            return subjectivityTemplates
              .filter(t => t.auto_apply && !existingTexts.includes(t.text))
              .map((t, idx) => (
                <AutoSubjectivityRow
                  key={t.id}
                  template={t}
                  idx={idx}
                  position={position}
                  submissionId={submission.id}
                  quoteId={quote?.id}
                  onCreate={(data) => createSubjectivityMutation.mutate(data)}
                  onRefetch={() => {
                    refetchSubjectivities();
                    queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submission.id] });
                    allQuotes?.forEach(q => {
                      queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
                    });
                  }}
                  showOptions={showSubjOptions}
                  allQuoteOptions={allQuoteOptions}
                />
              ));
          })()}

          {/* Manually added subjectivities */}
          {quoteSubjectivities
            .filter(s => s.status !== 'excluded')
            .map((subj, idx) => (
              <SubjectivityRow
                key={subj.id}
                subj={subj}
                idx={idx}
                position={position}
                onDelete={() => deleteSubjectivityMutation.mutate(subj.id)}
                onStatusChange={(status) => updateSubjectivityMutation.mutate({ id: subj.id, status })}
                showOptions={showSubjOptions}
                allQuoteOptions={allQuoteOptions}
                linkedQuoteIds={subjQuoteIdsMap[subj.text] || []}
                onToggleQuote={(subjId, quoteId, isLinked) => toggleSubjQuoteMutation.mutate({ subjectivityId: subjId, quoteId, isLinked })}
              />
            ))}
        </div>

        {/* Add controls at bottom */}
        <div className="border-t border-gray-100 pt-4">
          {/* Add from stock templates */}
          <div className="flex gap-2 mb-3">
            <select
              className="form-select flex-1"
              value={selectedStock}
              onChange={(e) => setSelectedStock(e.target.value)}
            >
              <option value="">Select subjectivity to add...</option>
              {subjectivityTemplates
                .filter(t => !t.auto_apply && !subjectivities.includes(t.text))
                .map((t) => (
                  <option key={t.id} value={JSON.stringify({ text: t.text, position: t.position })}>
                    {t.text}
                  </option>
                ))}
            </select>
            <button
              className="btn btn-outline"
              disabled={!selectedStock || createSubjectivityMutation.isPending}
              onClick={() => {
                if (selectedStock) {
                  const { text, position: templatePosition } = JSON.parse(selectedStock);
                  if (!subjectivities.includes(text)) {
                    createSubjectivityMutation.mutate({ text, templatePosition });
                    setSelectedStock('');
                  }
                }
              }}
            >
              {createSubjectivityMutation.isPending ? '...' : 'Add'}
            </button>
          </div>

          {/* Custom input */}
          <div className="flex gap-2">
            <input
              type="text"
              className="form-input flex-1"
              placeholder="Enter custom subjectivity..."
              value={customSubjectivity}
              onChange={(e) => setCustomSubjectivity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customSubjectivity.trim() && !subjectivities.includes(customSubjectivity.trim())) {
                  createSubjectivityMutation.mutate({ text: customSubjectivity.trim(), templatePosition: null });
                  setCustomSubjectivity('');
                }
              }}
            />
            <button
              className="btn btn-outline"
              disabled={!customSubjectivity.trim() || createSubjectivityMutation.isPending}
              onClick={() => {
                if (customSubjectivity.trim() && !subjectivities.includes(customSubjectivity.trim())) {
                  createSubjectivityMutation.mutate({ text: customSubjectivity.trim(), templatePosition: null });
                  setCustomSubjectivity('');
                }
              }}
            >
              {createSubjectivityMutation.isPending ? '...' : 'Add'}
            </button>
          </div>
        </div>

      </div>

      {/* Endorsements */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h4 className="form-section-title mb-0">Endorsements</h4>
          <button
            className={`text-xs px-2 py-1 rounded border transition-colors ${showEndorsementOptions ? 'bg-purple-100 border-purple-300 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
            onClick={() => setShowEndorsementOptions(!showEndorsementOptions)}
          >
            Options {showEndorsementOptions ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Simple list of all endorsements */}
        <div className="space-y-1.5">
          {/* Required endorsements */}
          {availableEndorsements?.filter(e => REQUIRED_ENDORSEMENT_CODES.includes(e.code)).map((e) => (
            <div key={e.id} className="flex items-center gap-2 py-1 text-sm text-gray-600">
              <span className="w-5 text-center text-gray-400">🔒</span>
              <span className="flex-1">{e.code} - {e.title}</span>
            </div>
          ))}

          {/* Auto-added endorsements */}
          {autoEndorsementsData?.auto_endorsements?.map((e) => (
            <div key={e.id} className="py-1">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="w-5 text-center text-amber-500">⚡</span>
                <span className="flex-1">
                  {e.code} - {e.title}
                  {e.auto_reason && <span className="ml-1 text-xs text-gray-400">({e.auto_reason})</span>}
                </span>
              </div>
              {showEndorsementOptions && allQuoteOptions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 ml-7">
                  {allQuoteOptions.map((opt) => (
                    <span key={opt.id} className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 opacity-60">
                      {opt.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Added endorsements - only show ones linked to current quote */}
          {quoteEndorsementsData?.endorsements
            ?.filter(e => {
              // Exclude required endorsements (already shown with 🔒)
              if (REQUIRED_ENDORSEMENT_CODES.includes(e.code)) return false;
              // Exclude auto-added endorsements (already shown with ⚡)
              const autoTitles = (autoEndorsementsData?.auto_endorsements || []).map(a => a.title);
              if (autoTitles.includes(e.title)) return false;
              return true;
            })
            ?.map((e) => {
            const linkedQuoteIds = endorsementQuoteIdsMap[e.endorsement_id] || [];
            return (
              <div key={e.endorsement_id} className="py-1">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-5 text-center text-gray-300">+</span>
                  <span className="flex-1">{e.code} - {e.title}</span>
                </div>
                {showEndorsementOptions && allQuoteOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 ml-7">
                    {allQuoteOptions.map((opt) => {
                      const isLinked = linkedQuoteIds.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                            isLinked
                              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                          onClick={() => toggleEndorsementQuoteMutation.mutate({
                            endorsementId: e.endorsement_id,
                            quoteId: opt.id,
                            isLinked
                          })}
                          title={isLinked ? `Remove from ${opt.name}` : `Add to ${opt.name}`}
                        >
                          {opt.name}
                        </button>
                      );
                    })}
                    {/* Delete all badge */}
                    <button
                      className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                      onClick={async () => {
                        if (!window.confirm(`Remove "${e.code}" from all quote options?`)) return;
                        // Remove from ALL quote options
                        for (const q of allQuotes || []) {
                          await unlinkEndorsementFromQuote(q.id, e.endorsement_id);
                        }
                        refetchEndorsements();
                        queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submission.id] });
                        allQuotes?.forEach(q => {
                          queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', q.id] });
                        });
                      }}
                      title="Remove from all options"
                    >
                      × all
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add endorsement selector */}
        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
          <select
            className="form-select flex-1 text-sm"
            value={selectedEndorsement}
            onChange={(e) => setSelectedEndorsement(e.target.value)}
          >
            <option value="">Add endorsement...</option>
            {availableEndorsements && (() => {
              const autoTitles = (autoEndorsementsData?.auto_endorsements || []).map(e => e.title);
              const submissionTitles = (submissionEndorsementsData?.endorsements || []).map(e => e.title);
              return availableEndorsements
                .filter(e =>
                  !REQUIRED_ENDORSEMENT_CODES.includes(e.code) &&
                  !autoTitles.includes(e.title) &&
                  !submissionTitles.includes(e.title)
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} - {e.title}
                  </option>
                ));
            })()}
          </select>
          <button
            className="btn btn-outline text-sm"
            disabled={!selectedEndorsement || toggleEndorsementQuoteMutation.isPending}
            onClick={async () => {
              if (selectedEndorsement && allQuotes?.length) {
                // Add to ALL quote options
                for (const q of allQuotes) {
                  await linkEndorsementToQuote(q.id, selectedEndorsement);
                }
                // Refresh data
                refetchEndorsements();
                queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submission.id] });
                allQuotes.forEach(q => {
                  queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', q.id] });
                });
                setSelectedEndorsement('');
              }
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Document Generation */}
      <div className="card">
        <h4 className="form-section-title">Generate Document</h4>

        {/* Package Type Selection */}
        <div className="mb-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="packageType"
                value="quote_only"
                checked={packageType === 'quote_only'}
                onChange={() => {
                  setPackageType('quote_only');
                  setSelectedDocuments([]);
                }}
                className="w-4 h-4 min-w-[16px] text-purple-600"
              />
              <span className="text-sm font-medium text-gray-700">Quote Only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="packageType"
                value="full_package"
                checked={packageType === 'full_package'}
                onChange={() => {
                  setPackageType('full_package');
                  setShowPackageOptions(true);
                }}
                className="w-4 h-4 min-w-[16px] text-purple-600"
              />
              <span className="text-sm font-medium text-gray-700">Full Package</span>
            </label>
          </div>
        </div>

        {/* Package Options (shown when Full Package selected) */}
        {packageType === 'full_package' && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="space-y-3">
              {/* Quote Specimens Section */}
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase mb-1">
                  Quote Specimens
                </div>
                <div className="space-y-1">
                  {/* Endorsement Package */}
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={includeEndorsements}
                      onChange={(e) => setIncludeEndorsements(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <span className="text-sm text-gray-700">
                      Endorsement Package
                      {quoteEndorsementCount > 0 && (
                        <span className="ml-1 text-gray-500">
                          ({quoteEndorsementCount} endorsement{quoteEndorsementCount !== 1 ? 's' : ''})
                        </span>
                      )}
                    </span>
                  </label>

                  {/* Policy Specimen */}
                  <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={includeSpecimen}
                      onChange={(e) => setIncludeSpecimen(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Policy Specimen</span>
                  </label>
                </div>
              </div>

              {/* Claims Sheets, Marketing, etc. from library */}
              {packageDocsData?.documents && Object.entries(packageDocsData.documents).map(([dtype, docs]) => (
                <div key={dtype}>
                  <div className="text-xs font-medium text-gray-500 uppercase mb-1">
                    {docTypeLabels[dtype] || dtype}
                  </div>
                  <div className="space-y-1">
                    {docs.map((doc) => (
                      <label
                        key={doc.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocuments.includes(doc.id)}
                          onChange={() => toggleDocument(doc.id)}
                          className="w-4 h-4 text-purple-600 rounded"
                        />
                        <span className="text-sm text-gray-700">
                          <span className="font-mono text-xs text-gray-500">{doc.code}</span>
                          {' '}{doc.title}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-600">
                Package will include: Quote
                {endorsementDocsCount > 0 && ` + ${endorsementDocsCount} endorsement${endorsementDocsCount !== 1 ? 's' : ''}`}
                {includeSpecimen && ' + Specimen'}
                {selectedDocuments.length > 0 && ` + ${selectedDocuments.length} other`}
              </p>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex gap-3 flex-wrap">
          <button
            className="btn btn-primary"
            onClick={() => generateDocMutation.mutate()}
            disabled={generateDocMutation.isPending}
          >
            {generateDocMutation.isPending
              ? 'Generating...'
              : packageType === 'full_package'
                ? `Generate Package${totalDocsInPackage > 0 ? ` (${totalDocsInPackage} docs)` : ''}`
                : 'Generate Quote'}
          </button>
        </div>

        {generateDocMutation.isSuccess && (
          <p className="text-sm text-green-600 mt-2">
            {packageType === 'full_package' ? 'Package' : 'Quote'} generated!
          </p>
        )}
        {generateDocMutation.isError && (
          <p className="text-sm text-red-600 mt-2">
            Error: {generateDocMutation.error?.response?.data?.detail || 'Failed to generate document'}
          </p>
        )}
      </div>

    </div>
  );
}

export default function QuotePage() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: submission } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes', submissionId],
    queryFn: () => getQuoteOptions(submissionId).then(res => res.data),
  });

  // Query for latest document across all options
  const { data: latestDoc } = useQuery({
    queryKey: ['latestDocument', submissionId],
    queryFn: () => getLatestDocument(submissionId).then(res => res.data),
  });

  // Query for all submission documents
  const { data: allDocs } = useQuery({
    queryKey: ['submissionDocuments', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(res => res.data),
  });

  // Create quote mutation
  const createMutation = useMutation({
    mutationFn: (data) => createQuoteOption(submissionId, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      setShowCreateModal(false);
      // Select the newly created quote
      if (response.data?.id) {
        setSelectedQuoteId(response.data.id);
      }
    },
  });

  // Auto-select first quote if none selected
  const selectedQuote = quotes?.find(q => q.id === selectedQuoteId) || quotes?.[0];

  // Clone mutation (operates on selected quote)
  const cloneMutation = useMutation({
    mutationFn: () => cloneQuoteOption(selectedQuote?.id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      // Select the cloned quote
      if (response.data?.id) {
        setSelectedQuoteId(response.data.id);
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteQuoteOption(selectedQuote?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      setSelectedQuoteId(null);
    },
  });

  if (isLoading) {
    return <div className="text-gray-500">Loading quotes...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Expiring vs Proposed Comparison (for renewals) */}
      <TowerComparison submissionId={submissionId} />

      {/* Header Row with Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Quote Options</h2>
          {submission && (
            <p className="text-sm text-gray-500 mt-1">{submission.applicant_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + New
          </button>
          <button
            className="btn bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
            onClick={() => {
              if (window.confirm(`Delete this option? This cannot be undone.`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={!selectedQuote || deleteMutation.isPending}
          >
            {deleteMutation.isPending ? '...' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Latest Generated Quote Banner */}
      {latestDoc && (
        <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-purple-600 uppercase">Latest Quote</span>
            <span className="font-semibold text-gray-900">{latestDoc.quote_name || 'Quote'}</span>
            <span className="text-sm text-gray-500">{formatDate(latestDoc.created_at)}</span>
            {latestDoc.document_number && (
              <span className="text-xs font-mono text-gray-400">{latestDoc.document_number}</span>
            )}
          </div>
          {latestDoc.pdf_url && (
            <a
              href={latestDoc.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:text-purple-800 font-medium text-sm"
            >
              View PDF →
            </a>
          )}
        </div>
      )}

      {quotes?.length > 0 ? (
        <div className="space-y-6">
          {/* Quote Options Tabs - Horizontal */}
          <div className="flex flex-wrap gap-2">
            {quotes.map((quote) => (
              <QuoteOptionTab
                key={quote.id}
                quote={quote}
                isSelected={selectedQuote?.id === quote.id}
                onSelect={() => setSelectedQuoteId(quote.id)}
              />
            ))}
          </div>

          {/* Selected Quote Details */}
          {selectedQuote && (
            <QuoteDetailPanel
              key={selectedQuote.id}
              quote={selectedQuote}
              submission={submission}
              allQuotes={quotes}
            />
          )}

          {/* All Generated Documents */}
          {allDocs && allDocs.length > 0 && (
            <div className="card">
              <h4 className="form-section-title">All Generated Documents</h4>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-header">Quote Option</th>
                      <th className="table-header">Position</th>
                      <th className="table-header">Document #</th>
                      <th className="table-header">Generated</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="table-cell">
                          <span className="font-medium text-gray-900">
                            {doc.quote_name || 'Unnamed Option'}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            doc.position === 'excess'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {doc.position === 'excess' ? 'Excess' : 'Primary'}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className="text-xs font-mono text-gray-500">{doc.document_number}</span>
                        </td>
                        <td className="table-cell text-gray-600 text-sm">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="table-cell text-right">
                          {doc.pdf_url && (
                            <a
                              href={doc.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-600 hover:text-purple-800 font-medium text-sm"
                            >
                              View PDF
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No quote options yet</p>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            Create First Option
          </button>
        </div>
      )}

      {/* Create Quote Modal */}
      <CreateQuoteModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
        selectedQuote={selectedQuote}
        onClone={() => cloneMutation.mutate()}
        isCloning={cloneMutation.isPending}
      />
    </div>
  );
}
