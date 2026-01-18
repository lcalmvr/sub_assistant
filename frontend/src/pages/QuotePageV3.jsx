import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import * as HoverCard from '@radix-ui/react-hover-card';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubmission,
  getQuoteStructures,
  createQuoteOption,
  cloneQuoteOption,
  deleteQuoteOption,
  updateQuoteOption,
  createVariation,
  updateVariation,
  deleteVariation,
  getQuoteEndorsements,
  getQuoteSubjectivities,
  getSubmissionEndorsements,
  getSubmissionSubjectivities,
  getDocumentLibraryEntries,
  getPackageDocuments,
  getSubjectivityTemplates,
  linkEndorsementToQuote,
  unlinkEndorsementFromQuote,
  deleteEndorsement,
  linkSubjectivityToQuote,
  unlinkSubjectivityFromQuote,
  createSubjectivity,
  updateSubjectivity,
  deleteSubjectivity,
  createDocumentLibraryEntry,
  updateDocumentLibraryEntry,
  generateQuoteDocument,
  generateQuotePackage,
  getQuoteDocuments,
  getQuotePreviewUrl,
  getSubmissionDocuments,
  getDocumentUrl,
  getBindValidation,
  bindQuoteOption,
  getPolicyData,
} from '../api/client';
import CoverageEditor, { SUBLIMIT_COVERAGES } from '../components/CoverageEditor';
import ExcessCoverageEditor from '../components/ExcessCoverageEditor';
import RetroScheduleEditor, {
  RETRO_OPTIONS,
  DEFAULT_COVERAGES,
  ADDITIONAL_COVERAGES,
  ALL_COVERAGES,
  formatRetroLabel,
  RetroTypeSelect,
} from '../components/RetroSelector';
import PolicyTermEditor from '../components/PolicyTermEditor';
import CommissionEditor from '../components/CommissionEditor';
import NetOutEditor from '../components/NetOutEditor';
import { calculateNetOutPremium, calculateCommissionAmount, calculateNetToCarrier } from '../utils/commissionUtils';

// ============================================================================
// UTILITIES
// ============================================================================

function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value) {
  if (!value && value !== 0) return '—';
  if (value >= 1_000_000) return `$${value / 1_000_000}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function formatDate(val) {
  if (!val) return '—';
  const date = new Date(`${val}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(start, end) {
  if (!start && !end) return '—';
  return `${formatDate(start)} — ${formatDate(end)}`;
}

function formatNumberWithCommas(value) {
  if (!value && value !== 0) return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('en-US').format(num);
}

function parseFormattedNumber(value) {
  if (!value) return '';
  return value.replace(/[^0-9.]/g, '');
}

function normalizeText(value) {
  return (value || '').trim().toLowerCase();
}

function parseQuoteIds(quoteIds) {
  if (!quoteIds) return [];
  if (Array.isArray(quoteIds)) return quoteIds.map(id => String(id));
  if (typeof quoteIds === 'string') {
    return quoteIds
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
  }
  return [];
}

function getStructurePosition(structure) {
  // Derive position from tower structure - if CMAI has attachment > 0, it's excess
  const tower = structure?.tower_json || [];
  if (tower.length === 0) {
    // Fallback to stored position if no tower data
    return structure?.position === 'excess' ? 'excess' : 'primary';
  }
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  if (cmaiIdx < 0) {
    return structure?.position === 'excess' ? 'excess' : 'primary';
  }
  // Calculate attachment - sum of limits below CMAI layer
  const attachment = calculateAttachment(tower, cmaiIdx);
  return attachment > 0 ? 'excess' : 'primary';
}

function getScopeTargetIds(structures, scope, currentId) {
  if (!structures?.length) return [];
  if (scope === 'single') return [String(currentId)];
  if (scope === 'primary') {
    return structures.filter(s => getStructurePosition(s) === 'primary').map(s => String(s.id));
  }
  if (scope === 'excess') {
    return structures.filter(s => getStructurePosition(s) === 'excess').map(s => String(s.id));
  }
  return structures.map(s => String(s.id));
}

// Radix UI is used for dropdowns and popovers - imported at top of file

function calculateAttachment(layers, targetIdx) {
  if (!layers || targetIdx <= 0) return 0;

  const targetLayer = layers[targetIdx];
  let effectiveIdx = targetIdx;

  if (targetLayer?.quota_share) {
    const qsFullLayer = targetLayer.quota_share;
    while (effectiveIdx > 0 && layers[effectiveIdx - 1]?.quota_share === qsFullLayer) {
      effectiveIdx--;
    }
  }

  let attachment = 0;
  let i = 0;
  while (i < effectiveIdx) {
    const layer = layers[i];
    if (layer.quota_share) {
      attachment += layer.quota_share;
      while (i < effectiveIdx && layers[i]?.quota_share === layer.quota_share) i++;
    } else {
      attachment += layer.limit || 0;
      i++;
    }
  }
  return attachment;
}

function recalculateAttachments(layers) {
  if (!layers?.length) return layers;
  return layers.map((layer, idx) => ({
    ...layer,
    attachment: calculateAttachment(layers, idx),
  }));
}

function generateOptionName(quote) {
  const tower = quote.tower_json || [];
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  const cmaiLayer = cmaiIdx >= 0 ? tower[cmaiIdx] : tower[0];
  if (!cmaiLayer) return 'Option';

  const limit = cmaiLayer.limit || 0;
  const limitStr = formatCompact(limit);
  const qsStr = cmaiLayer.quota_share ? ` po ${formatCompact(cmaiLayer.quota_share)}` : '';

  // Check if CMAI is an excess layer within the tower (has attachment > 0)
  const cmaiAttachment = cmaiIdx >= 0 ? calculateAttachment(tower, cmaiIdx) : 0;
  if (cmaiAttachment > 0) {
    return `${limitStr}${qsStr} xs ${formatCompact(cmaiAttachment)}`;
  }

  const retention = tower[0]?.retention || 25000;
  return `${limitStr} x ${formatCompact(retention)}`;
}

// ============================================================================
// SMART SAVE + SHARED REMOVAL MODALS
// ============================================================================

function SmartSaveModal({ isOpen, title, defaultScope, onConfirm, onCancel }) {
  const [scope, setScope] = useState(defaultScope || 'single');

  useEffect(() => {
    if (isOpen) {
      setScope(defaultScope || 'single');
    }
  }, [defaultScope, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[420px] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">{title || 'Apply change'}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">x</button>
        </div>
        <div className="space-y-2 text-sm text-gray-700">
          {[
            { value: 'single', label: 'Only this option' },
            { value: 'primary', label: 'All Primary options' },
            { value: 'excess', label: 'All Excess options' },
            { value: 'all', label: 'All options' },
          ].map(option => (
            <label key={option.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="smart-save-scope"
                value={option.value}
                checked={scope === option.value}
                onChange={() => setScope(option.value)}
                className="text-purple-600"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={() => onConfirm(scope)}
            className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function SharedRemovalModal({ isOpen, title, sharedCount, onConfirm, onCancel }) {
  const [scope, setScope] = useState('single');

  useEffect(() => {
    if (isOpen) {
      setScope('single');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[420px] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">{title || 'Remove shared item'}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">x</button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          This item is shared across {sharedCount || 0} options.
        </p>
        <div className="space-y-2 text-sm text-gray-700">
          {[
            { value: 'single', label: 'Remove from this option only' },
            { value: 'all', label: 'Remove from all options' },
          ].map(option => (
            <label key={option.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="shared-remove-scope"
                value={option.value}
                checked={scope === option.value}
                onChange={() => setScope(option.value)}
                className="text-purple-600"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={() => onConfirm(scope)}
            className="text-sm bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STRUCTURE PICKER (Integrated Tower Visual + Option Selector)
// ============================================================================

function StructurePicker({ structures, activeStructureId, onSelect, onCreate, onClone, onDelete, isCreating, isCloning, isDeleting, isExpanded, onToggle, onShowGrid, onShowSingle }) {
  const activeStructure = structures.find(s => s.id === activeStructureId);

  // Collapsed state - just show current structure name and toggle
  if (!isExpanded) {
    return (
      <button
        onClick={onToggle}
        className="bg-white border border-gray-200 rounded-lg p-3 w-full text-left hover:border-purple-300 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 group-hover:text-purple-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Structure</div>
            <div className="font-semibold text-gray-800 truncate">{activeStructure?.quote_name || 'Select'}</div>
          </div>
          <span className="text-xs text-gray-400">{structures.length}</span>
        </div>
      </button>
    );
  }

  // Expanded state - full list
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-800">Structures</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onCreate}
            disabled={isCreating}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
          >
            + New
          </button>
          <button
            onClick={onToggle}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Structure List */}
      <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
        {structures.map(structure => {
          const isActive = activeStructureId === structure.id;
          const tower = structure.tower_json || [];
          const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
          const premium = structure?.sold_premium || cmaiLayer?.premium || 0;

          return (
            <button
              key={structure.id}
              onClick={() => { onSelect(structure.id); onToggle(); onShowSingle?.(); }}
              className={`w-full text-left rounded-lg p-3 transition-all ${
                isActive
                  ? 'bg-purple-50 ring-2 ring-purple-400'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`font-semibold truncate ${isActive ? 'text-purple-900' : 'text-gray-800'}`}>
                  {structure.quote_name || 'Untitled'}
                </span>
                {structure.position === 'excess' && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium flex-shrink-0">XS</span>
                )}
              </div>
              {premium > 0 && (
                <div className="text-xs">
                  <span className={isActive ? 'text-purple-600 font-medium' : 'text-gray-600'}>
                    {formatCurrency(premium)}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between p-3 border-t border-gray-100 bg-gray-50/50">
        <button
          onClick={() => { onToggle(); onShowGrid(); }}
          className="text-xs text-gray-600 hover:text-purple-600 flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          Grid View
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onClone}
            disabled={isCloning}
            className="text-xs text-gray-600 hover:text-purple-600 disabled:opacity-50 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Clone
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting || structures.length <= 1}
            className="text-xs text-gray-600 hover:text-red-600 disabled:opacity-50 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TOWER VISUAL
// ============================================================================

function TowerVisual({ tower, position }) {
  // Sort by attachment descending so highest layer (excess) is at top visually
  const sortedTower = [...(tower || [])].sort((a, b) => (b.attachment || 0) - (a.attachment || 0));

  if (!tower?.length) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-400 text-sm h-full flex items-center justify-center">
        No layers
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        Tower Structure
      </h3>
      <div className="space-y-1">
        {position === 'excess' && (
          <div className="h-6 border-x border-dashed border-gray-300 flex justify-center">
            <div className="w-px h-full bg-gray-300" />
          </div>
        )}
        {sortedTower.map((layer, idx) => {
          const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
          return (
            <div
              key={idx}
              className={`rounded flex items-center justify-center text-xs cursor-pointer transition-all ${
                isCMAI
                  ? 'flex-col bg-purple-600 text-white h-16 shadow-md ring-2 ring-purple-200'
                  : 'flex-row gap-1 bg-gray-100 border border-gray-300 text-gray-600 h-16 hover:bg-gray-200'
              }`}
            >
              {isCMAI && (
                <span className="text-[10px] uppercase font-normal opacity-80">Our Layer</span>
              )}
              <span className="font-bold">{formatCompact(layer.limit)}</span>
              {isCMAI ? (
                layer.attachment > 0 && (
                  <span className="text-[10px] opacity-75">xs {formatCompact(layer.attachment)}</span>
                )
              ) : (
                layer.attachment != null && (
                  <span className="text-[10px] opacity-75">xs {formatCompact(layer.attachment)}</span>
                )
              )}
            </div>
          );
        })}
        {position === 'primary' && (
          <div className="h-4 bg-gray-50 border border-gray-200 rounded flex items-center justify-center">
            <span className="text-[9px] text-gray-400 uppercase">Retention {formatCompact(tower[0]?.retention || 25000)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TOWER TABLE
// ============================================================================

function TowerEditor({ quote, onSave, isPending, embedded = false, setEditControls }) {
  const [isEditing, setIsEditing] = useState(embedded); // Start in edit mode if embedded
  const [layers, setLayers] = useState(quote.tower_json || []);
  const hasQs = layers.some(l => l.quota_share);
  const [showQsColumn, setShowQsColumn] = useState(hasQs);
  const tableRef = useRef(null);

  // Refs for inputs (keyed by displayIdx for arrow navigation)
  const carrierInputRefs = useRef({});
  const limitInputRefs = useRef({});
  const qsInputRefs = useRef({});
  const retentionInputRefs = useRef({});
  const premiumInputRefs = useRef({});
  const rpmInputRefs = useRef({});
  const ilfInputRefs = useRef({});

  useEffect(() => {
    setLayers(quote.tower_json || []);
    setShowQsColumn((quote.tower_json || []).some(l => l.quota_share));
    setIsEditing(embedded); // Keep edit mode if embedded, otherwise reset
    // Note: Don't clear refs here - they're populated by render via ref callbacks
    // Clearing after render breaks arrow navigation on fresh mounts
  }, [quote.id, embedded]);

  // Click outside to save, Escape to cancel
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        const recalculated = recalculateAttachments(layers);
        onSave({ tower_json: recalculated, quote_name: generateOptionName({ ...quote, tower_json: recalculated }) });
        setIsEditing(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Escape: Save all changes and exit (consistent with Subjectivity screen)
        e.preventDefault();
        const recalculated = recalculateAttachments(layers);
        onSave({ tower_json: recalculated, quote_name: generateOptionName({ ...quote, tower_json: recalculated }) });
        setIsEditing(false);
      }
      // Note: Enter is handled in handleArrowNav to move to next row
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing, layers, quote, onSave]);

  // All column refs in left-to-right order for horizontal navigation
  const columnRefs = [carrierInputRefs, limitInputRefs, qsInputRefs, retentionInputRefs, premiumInputRefs, rpmInputRefs, ilfInputRefs];

  // Handle arrow key navigation in column fields
  const handleArrowNav = (e, displayIdx, currentRefs) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = displayIdx - 1;
      if (currentRefs.current[prevIdx]) {
        currentRefs.current[prevIdx].focus();
      }
    } else if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) {
      // ArrowDown or Enter: Move to next row (Enter consistent with Subjectivity screen)
      e.preventDefault();
      const nextIdx = displayIdx + 1;
      if (currentRefs.current[nextIdx]) {
        currentRefs.current[nextIdx].focus();
      }
      // If on last row, Enter does nothing (stay in place) - Escape to exit
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const currentColIdx = columnRefs.indexOf(currentRefs);
      for (let i = currentColIdx - 1; i >= 0; i--) {
        if (columnRefs[i].current[displayIdx]) {
          columnRefs[i].current[displayIdx].focus();
          break;
        }
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const currentColIdx = columnRefs.indexOf(currentRefs);
      for (let i = currentColIdx + 1; i < columnRefs.length; i++) {
        if (columnRefs[i].current[displayIdx]) {
          columnRefs[i].current[displayIdx].focus();
          break;
        }
      }
    } else if (e.key === 'Tab') {
      const currentColIdx = columnRefs.indexOf(currentRefs);
      const totalRows = Object.keys(currentRefs.current).length;

      if (e.shiftKey) {
        for (let i = currentColIdx - 1; i >= 0; i--) {
          if (columnRefs[i].current[displayIdx]) {
            e.preventDefault();
            columnRefs[i].current[displayIdx].focus();
            return;
          }
        }
        const prevIdx = displayIdx - 1;
        if (prevIdx >= 0) {
          for (let i = columnRefs.length - 1; i >= 0; i--) {
            if (columnRefs[i].current[prevIdx]) {
              e.preventDefault();
              columnRefs[i].current[prevIdx].focus();
              return;
            }
          }
        }
      } else {
        for (let i = currentColIdx + 1; i < columnRefs.length; i++) {
          if (columnRefs[i].current[displayIdx]) {
            e.preventDefault();
            columnRefs[i].current[displayIdx].focus();
            return;
          }
        }
        const nextIdx = displayIdx + 1;
        if (nextIdx < totalRows) {
          for (let i = 0; i < columnRefs.length; i++) {
            if (columnRefs[i].current[nextIdx]) {
              e.preventDefault();
              columnRefs[i].current[nextIdx].focus();
              return;
            }
          }
        }
      }
    }
  };

  const handleSave = () => {
    const recalculated = recalculateAttachments(layers);
    onSave({ tower_json: recalculated, quote_name: generateOptionName({ ...quote, tower_json: recalculated }) });
    setIsEditing(false);
    setEditControls?.(null);
  };

  const handleCancel = () => {
    setLayers(quote.tower_json || []);
    setIsEditing(false);
    setEditControls?.(null);
  };

  // Update edit controls when editing state changes (for embedded mode)
  useEffect(() => {
    if (embedded && isEditing) {
      setEditControls?.(
        <>
          <button onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
          <button onClick={handleSave} disabled={isPending} className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50">
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </>
      );
    } else if (embedded) {
      setEditControls?.(null);
    }
    return () => embedded && setEditControls?.(null);
  }, [isEditing, embedded, isPending]);

  // Track if we've done initial focus for this edit session
  const hasInitialFocusRef = useRef(false);

  // Reset focus tracking when exiting edit mode
  useEffect(() => {
    if (!isEditing) {
      hasInitialFocusRef.current = false;
    }
  }, [isEditing]);

  // Auto-focus first premium input when entering edit mode (only once per session)
  useEffect(() => {
    if (!isEditing || hasInitialFocusRef.current) return;
    hasInitialFocusRef.current = true;
    // Small delay to ensure inputs are rendered
    const timer = setTimeout(() => {
      // Find CMAI layer's displayIdx (it's displayed in reverse order)
      const cmaiIdx = [...layers].reverse().findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
      if (cmaiIdx >= 0 && premiumInputRefs.current[cmaiIdx]) {
        premiumInputRefs.current[cmaiIdx].focus();
      } else if (premiumInputRefs.current[0]) {
        // Fallback to first premium input
        premiumInputRefs.current[0].focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isEditing, layers]);

  const cmaiLayer = layers.find(l => l.carrier?.toUpperCase().includes('CMAI'));
  // For bound quotes, use sold_premium; otherwise use tower premium
  const cmaiPremium = quote?.sold_premium || cmaiLayer?.premium;

  if (!layers?.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">
        No tower layers configured
      </div>
    );
  }

  return (
    <div ref={tableRef} className={embedded ? '' : 'bg-white border border-gray-200 rounded-lg shadow-sm'}>
      {/* Header - only show when not embedded */}
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            Tower Structure
            {cmaiPremium && (
              <span className="text-sm font-semibold text-green-600 normal-case ml-2">
                Our Premium: {formatCurrency(cmaiPremium)}
              </span>
            )}
          </h3>
          {isEditing && (
            <div className="flex items-center gap-2">
              <button onClick={() => { setLayers(quote.tower_json || []); setIsEditing(false); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
                Cancel
              </button>
              <button onClick={handleSave} disabled={isPending} className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50">
                {isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className={embedded ? '' : 'overflow-hidden rounded-lg border border-gray-100 mx-4 mb-4'}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Carrier</th>
              <th className="px-4 py-2.5 text-left font-semibold">Limit</th>
              {showQsColumn && <th className="px-4 py-2.5 text-left font-semibold">Part Of</th>}
              <th className="px-4 py-2.5 text-left font-semibold">{quote.position === 'primary' ? 'Retention' : 'Attach'}</th>
              <th className="px-4 py-2.5 text-right font-semibold">Premium</th>
              <th className="px-4 py-2.5 text-right font-semibold">RPM</th>
              <th className="px-4 py-2.5 text-right font-semibold">ILF</th>
              {isEditing && <th className="px-4 py-2.5 w-10"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...layers].reverse().map((layer, displayIdx) => {
              const actualIdx = layers.length - 1 - displayIdx;
              const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
              const isPrimary = actualIdx === 0;
              const attachment = calculateAttachment(layers, actualIdx);
              const rpm = layer.premium && layer.limit ? Math.round(layer.premium / (layer.limit / 1_000_000)) : null;
              const baseLayer = layers[0];
              const baseRpm = baseLayer?.premium && baseLayer?.limit ? baseLayer.premium / (baseLayer.limit / 1_000_000) : null;
              const ilfPercent = rpm && baseRpm ? Math.round((rpm / baseRpm) * 100) : null;

              return (
                <tr
                  key={actualIdx}
                  className={`${isCMAI ? 'bg-purple-50' : ''} ${isEditing ? 'bg-blue-50/30' : 'hover:bg-gray-50 cursor-pointer'}`}
                  onClick={(e) => {
                    if (!isEditing) {
                      e.stopPropagation();
                      setIsEditing(true);
                    }
                  }}
                >
                  {/* Carrier */}
                  <td className={`px-4 ${isEditing ? 'py-1.5' : 'py-3'}`}>
                    {isEditing && !isCMAI ? (
                      <input
                        ref={(el) => { carrierInputRefs.current[displayIdx] = el; }}
                        type="text"
                        className="w-full text-sm font-medium text-gray-800 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 outline-none"
                        value={layer.carrier || ''}
                        onChange={(e) => {
                          const newLayers = [...layers];
                          newLayers[actualIdx] = { ...newLayers[actualIdx], carrier: e.target.value };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, carrierInputRefs)}
                        onFocus={(e) => e.target.select()}
                        placeholder="Carrier name"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isCMAI ? 'text-purple-700' : 'text-gray-800'}`}>
                          {layer.carrier || 'Unnamed'}
                        </span>
                        {isCMAI && <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded">Ours</span>}
                      </div>
                    )}
                  </td>

                  {/* Limit */}
                  <td className={`px-4 ${isEditing ? 'py-1.5' : 'py-3'}`}>
                    {isEditing ? (
                      <select
                        ref={(el) => { limitInputRefs.current[displayIdx] = el; }}
                        className="text-sm text-gray-700 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none cursor-pointer"
                        value={layer.limit || 1000000}
                        onChange={(e) => {
                          const newLayers = [...layers];
                          newLayers[actualIdx] = { ...newLayers[actualIdx], limit: Number(e.target.value) };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, limitInputRefs)}
                      >
                        {[1, 2, 2.5, 3, 5, 7.5, 10, 15, 25].map(m => (
                          <option key={m} value={m * 1_000_000}>${m}M</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-700">{formatCompact(layer.limit)}</span>
                    )}
                  </td>

                  {/* Part Of (QS) */}
                  {showQsColumn && (
                    <td className={`px-4 ${isEditing ? 'py-1.5' : 'py-3'}`}>
                      {isEditing ? (
                        <select
                          ref={(el) => { qsInputRefs.current[displayIdx] = el; }}
                          className="text-sm text-gray-500 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none cursor-pointer"
                          value={layer.quota_share || ''}
                          onChange={(e) => {
                            const newLayers = [...layers];
                            const val = e.target.value ? Number(e.target.value) : null;
                            if (val) {
                              newLayers[actualIdx] = { ...newLayers[actualIdx], quota_share: val };
                            } else {
                              const { quota_share, ...rest } = newLayers[actualIdx];
                              newLayers[actualIdx] = rest;
                            }
                            setLayers(newLayers);
                          }}
                          onKeyDown={(e) => handleArrowNav(e, displayIdx, qsInputRefs)}
                        >
                          <option value="">—</option>
                          {[5, 10, 15, 25].map(m => (
                            <option key={m} value={m * 1_000_000}>${m}M</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-500">{layer.quota_share ? formatCompact(layer.quota_share) : '—'}</span>
                      )}
                    </td>
                  )}

                  {/* Retention/Attachment */}
                  <td className={`px-4 ${isEditing ? 'py-1.5' : 'py-3'}`}>
                    {isEditing && quote.position === 'primary' && isPrimary ? (
                      <select
                        ref={(el) => { retentionInputRefs.current[displayIdx] = el; }}
                        className="text-sm text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none cursor-pointer"
                        value={layer.retention || 25000}
                        onChange={(e) => {
                          const newLayers = [...layers];
                          newLayers[actualIdx] = { ...newLayers[actualIdx], retention: Number(e.target.value) };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, retentionInputRefs)}
                      >
                        {[10, 25, 50, 100, 250].map(k => (
                          <option key={k} value={k * 1000}>${k}K</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-600">
                        {quote.position === 'primary' && isPrimary ? formatCompact(layer.retention || 25000) : `xs ${formatCompact(attachment)}`}
                      </span>
                    )}
                  </td>

                  {/* Premium */}
                  <td className={`px-4 text-right ${isEditing ? 'py-1.5' : 'py-3'}`}>
                    {isEditing ? (
                      <input
                        ref={(el) => { premiumInputRefs.current[displayIdx] = el; }}
                        type="text"
                        inputMode="numeric"
                        className="w-24 text-sm font-medium text-green-700 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none text-right"
                        value={layer.premium ? formatNumberWithCommas(layer.premium) : ''}
                        placeholder="—"
                        onChange={(e) => {
                          const newLayers = [...layers];
                          const parsed = parseFormattedNumber(e.target.value);
                          newLayers[actualIdx] = { ...newLayers[actualIdx], premium: parsed ? Number(parsed) : null };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, premiumInputRefs)}
                        onFocus={(e) => e.target.select()}
                      />
                    ) : (
                      <span className="font-medium text-green-700">
                        {formatCurrency(layer.premium)}
                      </span>
                    )}
                  </td>

                  {/* RPM */}
                  <td className={`px-4 text-right ${isEditing ? 'py-1.5' : 'py-3'}`}>
                    {isEditing && isCMAI ? (
                      <input
                        ref={(el) => { rpmInputRefs.current[displayIdx] = el; }}
                        type="text"
                        inputMode="numeric"
                        className="w-20 text-sm text-gray-500 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none text-right"
                        value={rpm ? formatNumberWithCommas(rpm) : ''}
                        placeholder="—"
                        onChange={(e) => {
                          const newLayers = [...layers];
                          const parsed = parseFormattedNumber(e.target.value);
                          const newRpm = parsed ? Number(parsed) : null;
                          const newPremium = newRpm && layer.limit ? Math.round(newRpm * (layer.limit / 1_000_000)) : null;
                          newLayers[actualIdx] = { ...newLayers[actualIdx], premium: newPremium };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, rpmInputRefs)}
                        onFocus={(e) => e.target.select()}
                      />
                    ) : (
                      <span className="text-gray-500">{rpm ? `$${rpm.toLocaleString()}` : '—'}</span>
                    )}
                  </td>

                  {/* ILF */}
                  <td className={`px-4 text-right ${isEditing ? 'py-1.5' : 'py-3'}`}>
                    {isEditing && isCMAI ? (
                      <input
                        ref={(el) => { ilfInputRefs.current[displayIdx] = el; }}
                        type="text"
                        inputMode="numeric"
                        className="w-16 text-sm text-gray-500 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none text-right"
                        value={ilfPercent || ''}
                        placeholder="—"
                        onChange={(e) => {
                          const newLayers = [...layers];
                          const pct = e.target.value ? parseFloat(e.target.value) : null;
                          const newPremium = pct && baseRpm && layer.limit
                            ? Math.round((pct / 100) * baseRpm * (layer.limit / 1_000_000))
                            : null;
                          newLayers[actualIdx] = { ...newLayers[actualIdx], premium: newPremium };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, ilfInputRefs)}
                        onFocus={(e) => e.target.select()}
                      />
                    ) : (
                      <span className="text-gray-500">{ilfPercent ? `${ilfPercent}%` : '—'}</span>
                    )}
                  </td>

                  {/* Delete */}
                  {isEditing && (
                    <td className="px-4 py-1.5 text-center">
                      {!isCMAI && (
                        <button
                          onClick={() => setLayers(layers.filter((_, i) => i !== actualIdx))}
                          className="text-red-500 hover:text-red-700"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add layer button (when editing) */}
      {isEditing && (
        <div className="px-3 py-2 border-t border-gray-100">
          <div className="flex items-center gap-4 mb-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showQsColumn}
                onChange={(e) => {
                  setShowQsColumn(e.target.checked);
                  if (!e.target.checked) {
                    setLayers(layers.map(l => {
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
          <button
            onClick={() => {
              const cmaiIdx = layers.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
              const newLayer = { carrier: '', limit: 5000000, attachment: 0, premium: null };
              if (cmaiIdx > 0) {
                const newLayers = [...layers];
                newLayers.splice(cmaiIdx, 0, newLayer);
                setLayers(newLayers);
              } else {
                setLayers([newLayer, ...layers]);
              }
            }}
            className="w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:border-gray-400 hover:text-gray-600 text-sm"
          >
            + Add Underlying Layer
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VARIATION TAB (compact)
// ============================================================================

function VariationCard({ variation, isActive, onClick, onDelete, canDelete }) {
  const premium = variation.sold_premium || variation.technical_premium || 0;
  const commission = variation.commission_override || 15;

  // Determine policy term display based on dates_tbd and actual dates
  const datesTbd = variation?.dates_tbd || false;
  let termDisplay = 'TBD';
  if (!datesTbd && variation.effective_date_override && variation.expiration_date_override) {
    const start = new Date(variation.effective_date_override);
    const end = new Date(variation.expiration_date_override);
    const months = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.44));
    termDisplay = `${months} Months`;
  } else if (!datesTbd) {
    // Has dates from parent (structure/submission), show default 12 months
    termDisplay = '12 Months';
  }

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border-2 text-left transition-all flex-1 min-w-[200px] cursor-pointer relative ${
        isActive
          ? 'border-dashed border-purple-400 bg-purple-50/50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Delete button */}
      {canDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(variation.id);
          }}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title="Delete variation"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Header */}
      <div className={`text-xs font-semibold uppercase tracking-wide mb-3 ${
        isActive ? 'text-purple-600' : 'text-gray-500'
      }`}>
        Option {variation.label || 'A'} {variation.name ? `(${variation.name})` : ''}
      </div>

      {/* Premium & Commission */}
      <div className="flex justify-between items-end mb-3">
        <div>
          <div className="text-[10px] text-gray-400 uppercase mb-1">Premium</div>
          <div className="flex items-baseline gap-1">
            <span className="text-gray-400 text-sm">$</span>
            <span className={`text-xl font-semibold ${isActive ? 'text-gray-800' : 'text-gray-700'}`}>
              {premium ? premium.toLocaleString() : '0'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-400 uppercase mb-1">Comm %</div>
          <div className={`text-xl font-semibold ${isActive ? 'text-purple-600' : 'text-gray-600'}`}>
            {commission.toFixed(1)} <span className="text-sm text-gray-400">%</span>
          </div>
        </div>
      </div>

      {/* Term Period */}
      <div className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm ${
        datesTbd
          ? 'bg-amber-100 text-amber-700'
          : isActive ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 text-gray-600'
      }`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {termDisplay}
      </div>
    </div>
  );
}

// ============================================================================
// SIDE PANEL TAB BUTTON
// ============================================================================

function SidePanelTab({ icon, label, isActive, onClick, badge, badgeColor }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
        isActive
          ? 'bg-purple-100 text-purple-700'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span className={`text-[9px] px-1 py-0.5 rounded-full font-semibold ${
          badgeColor || (isActive ? 'bg-purple-200 text-purple-800' : 'bg-gray-200 text-gray-600')
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// VARIATION SCOPE TOGGLE
// ============================================================================

function VariationScopeToggle({ label, checked, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
        checked
          ? 'bg-purple-100 border-purple-300 text-purple-700'
          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {label}
    </button>
  );
}

// ============================================================================
// SCOPE HELPERS
// ============================================================================

function getScopeLabel(assignedIds, scopeVariationIds, variationLabelMap) {
  if (!scopeVariationIds?.length) {
    return { label: 'No variations', tone: 'bg-gray-100 text-gray-500' };
  }
  const assignedInScope = (assignedIds || []).filter(id => scopeVariationIds.includes(id));
  if (assignedInScope.length === scopeVariationIds.length) {
    return { label: 'All variations', tone: 'bg-emerald-100 text-emerald-700' };
  }
  if (assignedInScope.length === 0) {
    return { label: 'Not applied', tone: 'bg-gray-100 text-gray-500' };
  }
  if (assignedInScope.length === 1) {
    const onlyLabel = variationLabelMap.get(assignedInScope[0]) || assignedInScope[0];
    return { label: `Only ${onlyLabel}`, tone: 'bg-amber-100 text-amber-700' };
  }
  return { label: 'Custom scope', tone: 'bg-amber-100 text-amber-700' };
}

// ============================================================================
// ENDORSEMENT ROW
// ============================================================================

function EndorsementRow({ endorsement, variations, scopeVariationIds, variationLabelMap, onToggleScope, onSyncAll }) {
  const assignedIds = endorsement.linked_variation_ids || [];
  const { label: scopeLabel, tone: scopeTone } = getScopeLabel(assignedIds, scopeVariationIds, variationLabelMap);
  const assignedInScope = assignedIds.filter(id => scopeVariationIds.includes(id));
  const hasDiff = assignedInScope.length !== scopeVariationIds.length;
  const isRequired = endorsement.category === 'required';
  const displayName = endorsement.title || endorsement.code || 'Endorsement';

  return (
    <div className={`p-2 rounded-lg border border-gray-100 ${hasDiff ? 'bg-amber-50/40' : 'bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isRequired && (
            <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
          <span className="text-[11px] text-gray-700 truncate" title={displayName}>
            {displayName}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {hasDiff && !isRequired && (
            <button
              onClick={() => onSyncAll(endorsement.endorsement_id)}
              className="text-[10px] text-purple-600 hover:text-purple-800 font-medium"
            >
              Sync all
            </button>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${scopeTone}`}>
            {scopeLabel}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        {variations.map(v => (
          <VariationScopeToggle
            key={v.id}
            label={v.label}
            checked={assignedIds.includes(v.id)}
            onClick={() => onToggleScope(endorsement.endorsement_id, v.id, !assignedIds.includes(v.id))}
            disabled={isRequired}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// TERMS PANEL
// ============================================================================

function TermsPanel({ structure, variation, submission, submissionId }) {
  const queryClient = useQueryClient();

  // Update variation mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateVariation(variation.id, data),
    onMutate: async (data) => {
      // Optimistic update - update variation within structure
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => s.id === structure.id ? {
          ...s,
          variations: (s.variations || []).map(v => v.id === variation.id ? { ...v, ...data } : v)
        } : s)
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['structures', submissionId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  if (!variation) {
    return <div className="py-8 text-center text-gray-400 text-sm">No variation selected</div>;
  }

  // Get current values (cascade: variation → structure → submission)
  const datesTbd = variation?.dates_tbd || false;
  const effectiveDate = variation?.effective_date_override || structure?.effective_date || submission?.effective_date || '';
  const expirationDate = variation?.expiration_date_override || structure?.expiration_date || submission?.expiration_date || '';

  const handleDatesChange = ({ datesTbd: newDatesTbd, effectiveDate: newEffectiveDate, expirationDate: newExpirationDate }) => {
    updateMutation.mutate({
      dates_tbd: newDatesTbd,
      effective_date_override: newEffectiveDate || null,
      expiration_date_override: newExpirationDate || null,
    });
  };

  const handleTbdToggle = (newTbd) => {
                  updateMutation.mutate({
      dates_tbd: newTbd,
      ...(newTbd ? { effective_date_override: null, expiration_date_override: null } : {}),
    });
  };

  return (
    <PolicyTermEditor
      datesTbd={datesTbd}
      effectiveDate={effectiveDate}
      expirationDate={expirationDate}
      onDatesChange={handleDatesChange}
      onTbdToggle={handleTbdToggle}
    />
  );
}

// ============================================================================
// PREMIUM PANEL
// ============================================================================

function PremiumPanel({ structure, variation }) {
  // Technical = CMAI layer premium from tower
  const cmaiLayer = (structure?.tower_json || []).find(l => l.carrier?.toUpperCase().includes('CMAI'));
  const technical = cmaiLayer?.premium || 0;

  // Sold = what the deal actually closed at
  const sold = variation?.sold_premium || structure?.sold_premium || 0;

  // % difference
  const pctDiff = technical > 0 && sold > 0
    ? ((sold - technical) / technical * 100).toFixed(1)
    : null;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <div className="text-[10px] text-gray-400 uppercase mb-0.5">Technical</div>
        <div className="text-sm font-semibold text-gray-700">{formatCurrency(technical)}</div>
      </div>
      <div>
        <div className="text-[10px] text-gray-400 uppercase mb-0.5">Sold</div>
        <div className="text-sm font-semibold text-gray-700">{sold > 0 ? formatCurrency(sold) : '—'}</div>
      </div>
      <div>
        <div className="text-[10px] text-gray-400 uppercase mb-0.5">Diff</div>
        <div className={`text-sm font-semibold ${pctDiff !== null ? (parseFloat(pctDiff) >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
          {pctDiff !== null ? `${parseFloat(pctDiff) >= 0 ? '+' : ''}${pctDiff}%` : '—'}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RETRO PANEL
// ============================================================================

function RetroPanel({ structure, submissionId }) {
  const queryClient = useQueryClient();

  // Update structure mutation for retro schedule
  const updateStructureMutation = useMutation({
    mutationFn: (data) => updateQuoteOption(structure.id, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => s.id === structure.id ? { ...s, ...data } : s)
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['structures', submissionId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  // Get excluded coverages from aggregate_coverages (value === 0 means excluded)
  const aggregateCoverages = structure?.coverages?.aggregate_coverages || {};
  const excludedCoverages = Object.entries(aggregateCoverages)
    .filter(([_, value]) => value === 0)
    .map(([id]) => {
      // Map coverage IDs to display names used in retro schedule
      if (id === 'tech_eo') return 'Tech E&O';
      if (id === 'network_security_privacy') return 'Cyber';
      return id;
    });

  return (
    <div className="space-y-4">
      <RetroScheduleEditor
        schedule={structure?.retro_schedule || []}
        onChange={(schedule) => {
          // Filter out excluded coverages before saving to keep data clean
          const filteredSchedule = schedule.filter(entry => !excludedCoverages.includes(entry.coverage));
          updateStructureMutation.mutate({ retro_schedule: filteredSchedule });
        }}
        excludedCoverages={excludedCoverages}
        showHeader={true}
        showEmptyState={true}
        addButtonText="+ Add Restriction"
        compact={false}
      />
    </div>
  );
}

// ============================================================================
// COMMISSION PANEL
// ============================================================================

function CommissionPanel({ structure, variation, submissionId }) {
  const queryClient = useQueryClient();
  const [commission, setCommission] = useState('15');
  const [netOutTo, setNetOutTo] = useState('');
  const [netOutApplied, setNetOutApplied] = useState(null); // { originalPremium, originalCommission, newPremium, newCommission, originalTower }

  // Get premium from CMAI layer
  const tower = structure?.tower_json || [];
  const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
  const grossPremium = cmaiLayer?.premium || 0;

  useEffect(() => {
    if (variation) {
      setCommission((variation.commission_override ?? 15).toString());
    }
  }, [variation?.id]);

  const updateCommissionMutation = useMutation({
    mutationFn: (data) => updateVariation(variation.id, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => s.id === structure.id ? {
          ...s,
          variations: (s.variations || []).map(v => v.id === variation.id ? { ...v, ...data } : v)
        } : s)
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['structures', submissionId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  const updateTowerMutation = useMutation({
    mutationFn: (data) => updateQuoteOption(structure.id, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => s.id === structure.id ? { ...s, ...data } : s)
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['structures', submissionId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });


  const commissionNum = parseFloat(commission) || 0;
  const brokerAmount = calculateCommissionAmount(grossPremium, commissionNum);
  const netToCarrier = calculateNetToCarrier(grossPremium, commissionNum);

  // Net out calculations
  const netOutNum = parseFloat(netOutTo) || 0;
  const newGross = calculateNetOutPremium(netToCarrier, netOutNum);
  const newCommissionAmount = newGross ? calculateCommissionAmount(newGross, netOutNum) : 0;

  const applyNetOut = async () => {
    if (!newGross) return;

    // Store original values for undo
    setNetOutApplied({
      originalPremium: grossPremium,
      originalCommission: commissionNum,
      newPremium: newGross,
      newCommission: netOutNum,
    });

    // Build updated tower with new premium
    const currentTower = structure?.tower_json || [];
    const updatedTower = currentTower.map(layer => {
      if (layer.carrier?.toUpperCase().includes('CMAI')) {
        return { ...layer, premium: newGross };
      }
      return layer;
    });

    // Update tower and commission sequentially to avoid race conditions
    await updateTowerMutation.mutateAsync({ tower_json: updatedTower });
    await updateCommissionMutation.mutateAsync({ commission_override: netOutNum });

    // Clear the net out input
    setNetOutTo('');
  };

  const undoNetOut = async () => {
    if (!netOutApplied) return;

    // Build tower with original premium from CURRENT tower structure
    const currentTower = structure?.tower_json || [];
    const restoredTower = currentTower.map(layer => {
      if (layer.carrier?.toUpperCase().includes('CMAI')) {
        return { ...layer, premium: netOutApplied.originalPremium };
      }
      return layer;
    });

    // Restore tower and commission sequentially
    await updateTowerMutation.mutateAsync({ tower_json: restoredTower });
    await updateCommissionMutation.mutateAsync({ commission_override: netOutApplied.originalCommission });

    // Clear the applied state
    setNetOutApplied(null);
  };

  return (
    <div className="space-y-4">
      {/* Commission Inputs - Side by Side */}
      <div className="grid grid-cols-2 gap-3">
        <CommissionEditor
              value={commission}
          onChange={setCommission}
          onBlur={(value) => {
            if (value !== variation.commission_override) {
              updateCommissionMutation.mutate({ commission_override: value });
            }
          }}
        />
        {!netOutApplied && (
          <NetOutEditor
                value={netOutTo}
            onChange={setNetOutTo}
            maxCommission={parseFloat(commission) || 100}
                placeholder={commission}
              />
        )}
      </div>

      {/* Breakdown */}
      <div className="pt-3 border-t border-gray-100 space-y-1.5">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Gross Premium</span>
          <span className="font-medium">{formatCurrency(grossPremium)}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Commission</span>
          <span className="font-medium text-red-600">-{formatCurrency(brokerAmount)}</span>
        </div>
        <div className="flex justify-between items-center text-sm pt-1.5 border-t border-gray-100">
          <span className="text-gray-700 font-medium">Net to Carrier</span>
          <span className="font-semibold text-green-600">{formatCurrency(netToCarrier)}</span>
        </div>
      </div>

      {/* Net Out Applied Summary */}
      {netOutApplied && (
        <div className="p-2 bg-purple-50 border border-purple-200 rounded-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-purple-700">Net Out Applied</span>
            <button
              onClick={undoNetOut}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium"
            >
              Undo
            </button>
          </div>
          <div className="text-xs text-purple-600 space-y-0.5">
            <div>Commission: {netOutApplied.originalCommission}% → {netOutApplied.newCommission}%</div>
            <div>Premium: {formatCurrency(netOutApplied.originalPremium)} → {formatCurrency(netOutApplied.newPremium)}</div>
            <div>Commission Paid: {formatCurrency(netOutApplied.originalPremium * netOutApplied.originalCommission / 100)} → {formatCurrency(netOutApplied.newPremium * netOutApplied.newCommission / 100)}</div>
          </div>
        </div>
      )}

      {/* Net Out Preview */}
      {!netOutApplied && newGross && netOutNum < commissionNum && (
        <div className="p-2 bg-green-50 rounded-md space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">New Premium</span>
            <span className="font-medium">{formatCurrency(newGross)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Commission Paid</span>
            <span className="font-medium text-red-600">-{formatCurrency(newCommissionAmount)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Net to Carrier</span>
            <span className="font-medium">{formatCurrency(netToCarrier)}</span>
          </div>
          <button
            onClick={applyNetOut}
            className="mt-2 w-full text-xs font-medium py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
          >
            Apply Net Out
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COVERAGE SCHEDULE PANEL
// ============================================================================

function CoverageSchedulePanel({ structure }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Default coverages based on position - in real app would come from API
  const getCoverages = () => {
    if (structure?.position === 'excess') {
      return [
        { coverage: 'Cyber Liability', retroDate: 'Full Prior Acts' },
        { coverage: 'Privacy Liability', retroDate: 'Inception' },
        { coverage: 'Network Security Liability', retroDate: 'Inception' },
        { coverage: 'Media Liability', retroDate: 'Inception' },
        { coverage: 'Technology E&O', retroDate: structure?.retro_date || 'Inception' },
      ];
    }
    return [
      { coverage: 'Cyber Liability', retroDate: 'Inception' },
      { coverage: 'Privacy Liability', retroDate: 'Inception' },
      { coverage: 'Network Security Liability', retroDate: 'Inception' },
      { coverage: 'Media Liability', retroDate: 'Inception' },
      { coverage: 'Technology E&O', retroDate: 'Inception' },
      { coverage: 'Regulatory Defense', retroDate: 'Inception' },
      { coverage: 'PCI-DSS Fines', retroDate: 'Inception' },
      { coverage: 'Social Engineering', retroDate: 'Inception' },
    ];
  };

  const coverages = getCoverages();

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Coverage Schedule
          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium ml-1">
            {coverages.length} coverages
          </span>
        </h3>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Retro Dates by Coverage</div>
          {coverages.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-xs"
            >
              <span className="font-medium text-gray-700">{item.coverage}</span>
              <span className="text-gray-500">{item.retroDate}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ENDORSEMENTS TABLE PANEL (Main content area)
// ============================================================================

function EndorsementsTablePanel({ structureId }) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState('');

  // Fetch endorsements linked to this quote
  const { data: endorsementsData, isLoading } = useQuery({
    queryKey: ['quote-endorsements', structureId],
    queryFn: () => getQuoteEndorsements(structureId).then(r => r.data),
    enabled: !!structureId,
  });
  // Sort endorsements: required first, automatic next, manual last
  const endorsements = [...(endorsementsData?.endorsements || [])].sort((a, b) => {
    const aRequired = a.category === 'required' || a.is_required ? 2 : 0;
    const bRequired = b.category === 'required' || b.is_required ? 2 : 0;
    const aAuto = a.is_auto || a.auto_attach_rules || a.attachment_type === 'auto' ? 1 : 0;
    const bAuto = b.is_auto || b.auto_attach_rules || b.attachment_type === 'auto' ? 1 : 0;
    return (bRequired + bAuto) - (aRequired + aAuto);
  });

  // Fetch endorsement library
  const { data: libraryEndorsementsData } = useQuery({
    queryKey: ['endorsement-library'],
    queryFn: () => getDocumentLibraryEntries({ document_type: 'endorsement', status: 'active' }).then(r => r.data),
    enabled: isAddingOpen,
  });
  const libraryEndorsements = libraryEndorsementsData || [];

  // Get available endorsements
  const linkedIds = new Set(endorsements.map(e => e.endorsement_id || e.document_library_id));
  const availableEndorsements = libraryEndorsements.filter(e => !linkedIds.has(e.id));
  const filteredAvailable = availableEndorsements.filter(e =>
    !addSearchTerm || e.title?.toLowerCase().includes(addSearchTerm.toLowerCase())
  );

  // Link endorsement mutation
  const linkMutation = useMutation({
    mutationFn: (endorsementId) => linkEndorsementToQuote(structureId, endorsementId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] }),
  });

  // Unlink endorsement mutation
  const unlinkMutation = useMutation({
    mutationFn: (endorsementId) => unlinkEndorsementFromQuote(structureId, endorsementId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] }),
  });

  // Type icon helper
  const getTypeIcon = (endt) => {
    const isAuto = endt.is_auto || endt.auto_attach_rules || endt.attachment_type === 'auto';
    const isRequired = endt.category === 'required' || endt.is_required;
    // Filled lock - amber for required
    if (isRequired) return <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>;
    // Filled lightning - purple for auto
    if (isAuto) return <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
    // Plus for manual
    return <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Endorsements
          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium ml-1">
            {endorsements.length}
          </span>
        </h3>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100">
          {isLoading ? (
            <div className="p-4 text-center text-gray-400 text-sm">Loading...</div>
          ) : endorsements.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">No endorsements attached</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold w-8"></th>
                  <th className="px-4 py-2 text-left font-semibold">Code</th>
                  <th className="px-4 py-2 text-left font-semibold">Title</th>
                  <th className="px-4 py-2 text-left font-semibold">Category</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {endorsements.map(endt => (
                  <tr key={endt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">{getTypeIcon(endt)}</td>
                    <td className="px-4 py-2 font-medium text-gray-600">{endt.code || '—'}</td>
                    <td className="px-4 py-2 text-gray-700">{endt.title || endt.name || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        endt.category === 'exclusion' ? 'bg-red-100 text-red-700' :
                        endt.category === 'required' ? 'bg-gray-100 text-gray-600' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {endt.category || 'endorsement'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => unlinkMutation.mutate(endt.endorsement_id)} className="text-gray-400 hover:text-red-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add button */}
          <div className="p-3 border-t border-gray-100">
            {isAddingOpen ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search endorsements..."
                    value={addSearchTerm}
                    onChange={(e) => setAddSearchTerm(e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-purple-300"
                    autoFocus
                  />
                  <button onClick={() => { setIsAddingOpen(false); setAddSearchTerm(''); }} className="text-gray-400 hover:text-gray-600 p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {filteredAvailable.slice(0, 8).map(endt => (
                    <button key={endt.id} onClick={() => { linkMutation.mutate(endt.id); setAddSearchTerm(''); }} className="w-full p-2 rounded border border-gray-100 bg-white hover:bg-purple-50 hover:border-purple-200 text-left text-xs">
                      <span className="font-medium text-gray-700">{endt.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button onClick={() => setIsAddingOpen(true)} className="text-xs text-purple-600 hover:text-purple-700 font-medium">
                + Add Endorsement
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TriStateCheckbox({ state, onChange, disabled, title }) {
  const checkboxRef = useRef(null);

  useEffect(() => {
    if (!checkboxRef.current) return;
    checkboxRef.current.indeterminate = state === 'some';
  }, [state]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={state === 'all'}
      onChange={onChange}
      disabled={disabled}
      title={title}
      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-300"
    />
  );
}

// ============================================================================
// TAB CONTENT COMPONENTS (Main Card)
// ============================================================================

function AllOptionsTabContent({ structures, onSelect, onUpdateOption, submissionId, submission }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [gridTab, setGridTab] = useState('options');
  const [filterPosition, setFilterPosition] = useState('all');
  const [manageType, setManageType] = useState(null);
  const [manageMode, setManageMode] = useState('review');
  const [rulesFilter, setRulesFilter] = useState('any');
  const [activeRuleMenu, setActiveRuleMenu] = useState(null);
  const [manageSearchTerm, setManageSearchTerm] = useState('');
  const [manageAddSearchTerm, setManageAddSearchTerm] = useState('');
  const [sectionVisibility, setSectionVisibility] = useState({ all: false, none: false });
  const [confirmRemoval, setConfirmRemoval] = useState(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  // Subjectivity inline editing state
  const [editingSubjectivityId, setEditingSubjectivityId] = useState(null);
  const [editingSubjectivityText, setEditingSubjectivityText] = useState('');
  const [editingSubjectivityStatus, setEditingSubjectivityStatus] = useState('pending');
  // Add new rate/restriction state
  const [showAddCommission, setShowAddCommission] = useState(false);
  const [newCommissionValue, setNewCommissionValue] = useState('');
  const [newCommissionNetOut, setNewCommissionNetOut] = useState('');
  const [newCommissionSelectedQuotes, setNewCommissionSelectedQuotes] = useState([]);
  const [showAddRetro, setShowAddRetro] = useState(false);
  const [newRetroSchedule, setNewRetroSchedule] = useState([]);
  const [newRetroSelectedQuotes, setNewRetroSelectedQuotes] = useState([]);
  const [showAddPolicyTerm, setShowAddPolicyTerm] = useState(false);
  const [newPolicyTermDatesTbd, setNewPolicyTermDatesTbd] = useState(false);
  const [newPolicyTermEffectiveDate, setNewPolicyTermEffectiveDate] = useState('');
  const [newPolicyTermExpirationDate, setNewPolicyTermExpirationDate] = useState('');
  const [newPolicyTermSelectedQuotes, setNewPolicyTermSelectedQuotes] = useState([]);
  const tableRef = useRef(null);
  const inputRefs = useRef({});

  const filteredStructures = useMemo(() => (
    structures.filter(struct => {
      if (filterPosition === 'all') return true;
      return getStructurePosition(struct) === filterPosition;
    })
  ), [structures, filterPosition]);

  const selectedIdSet = useMemo(() => new Set(selectedIds.map(id => String(id))), [selectedIds]);
  const selectedIdStrings = useMemo(() => selectedIds.map(id => String(id)), [selectedIds]);
  const allOptionIds = useMemo(() => structures.map(struct => String(struct.id)), [structures]);
  const visibleIds = filteredStructures.map(struct => String(struct.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIdSet.has(id));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev.map(id => String(id)));
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return Array.from(next);
    });
  };

  const toggleRowSelection = (id) => {
    const idString = String(id);
    setSelectedIds(prev => {
      const next = new Set(prev.map(val => String(val)));
      if (next.has(idString)) {
        next.delete(idString);
      } else {
        next.add(idString);
      }
      return Array.from(next);
    });
  };

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => structures.some(struct => String(struct.id) === String(id))));
  }, [structures]);

  useEffect(() => {
    if (selectedIds.length === 0 && manageType) {
      setManageType(null);
      setConfirmRemoval(null);
    }
  }, [selectedIds, manageType]);

  useEffect(() => {
    if (manageType) {
      setManageMode('review');
      setActiveRuleMenu(null);
      setManageSearchTerm('');
      setManageAddSearchTerm('');
      setShowAddPanel(false);
      setSectionVisibility({ all: false, none: false });
    }
  }, [manageType]);

  const { data: submissionSubjectivitiesData = [] } = useQuery({
    queryKey: ['submissionSubjectivities', submissionId],
    queryFn: () => getSubmissionSubjectivities(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  const { data: submissionEndorsementsData } = useQuery({
    queryKey: ['submissionEndorsements', submissionId],
    queryFn: () => getSubmissionEndorsements(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  const { data: endorsementLibraryData } = useQuery({
    queryKey: ['endorsement-library', 'manage'],
    queryFn: () => getDocumentLibraryEntries({ document_type: 'endorsement', status: 'active' }).then(r => r.data),
    enabled: manageType === 'endorsements',
  });

  const { data: subjectivityTemplatesData } = useQuery({
    queryKey: ['subjectivity-templates', 'manage'],
    queryFn: () => getSubjectivityTemplates().then(r => r.data),
    enabled: manageType === 'subjectivities',
  });

  const subjectivitiesByQuote = useMemo(() => {
    const map = new Map();
    (submissionSubjectivitiesData || []).forEach(subj => {
      const label = subj.text || subj.subjectivity_text || subj.title || 'Subjectivity';
      const quoteIds = parseQuoteIds(subj.quote_ids);
      const isShared = quoteIds.length > 1;
      quoteIds.forEach(id => {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({
          id: subj.id,
          label,
          status: subj.status,
          isShared,
        });
      });
    });
    return map;
  }, [submissionSubjectivitiesData]);

  const endorsementsByQuote = useMemo(() => {
    const map = new Map();
    const endorsements = submissionEndorsementsData?.endorsements || [];
    endorsements.forEach(endt => {
      const label = endt.title || endt.code || 'Endorsement';
      const quoteIds = parseQuoteIds(endt.quote_ids);
      const isShared = quoteIds.length > 1;
      quoteIds.forEach(id => {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({
          id: endt.endorsement_id,
          label,
          code: endt.code,
          isShared,
        });
      });
    });
    map.forEach(list => list.sort((a, b) => a.label.localeCompare(b.label)));
    return map;
  }, [submissionEndorsementsData]);

  // Compute position-based comparison stats (missing/extra vs same-position siblings)
  const positionComparisonStats = useMemo(() => {
    const stats = new Map();

    // Group structures by position
    const primaryIds = structures.filter(s => getStructurePosition(s) !== 'excess').map(s => String(s.id));
    const excessIds = structures.filter(s => getStructurePosition(s) === 'excess').map(s => String(s.id));

    // Helper to compute union of items across sibling IDs (excluding self)
    const computeSiblingUnion = (selfId, siblingIds, itemsByQuote) => {
      const union = new Map(); // id -> label
      siblingIds.forEach(sibId => {
        if (sibId === selfId) return;
        const items = itemsByQuote.get(sibId) || [];
        items.forEach(item => {
          if (!union.has(item.id)) {
            union.set(item.id, item.label);
          }
        });
      });
      return union;
    };

    structures.forEach(struct => {
      const structId = String(struct.id);
      const isExcess = getStructurePosition(struct) === 'excess';
      const siblingIds = isExcess ? excessIds : primaryIds;

      // Get this structure's items
      const mySubjectivities = subjectivitiesByQuote.get(structId) || [];
      const myEndorsements = endorsementsByQuote.get(structId) || [];
      const mySubjIds = new Set(mySubjectivities.map(s => s.id));
      const myEndtIds = new Set(myEndorsements.map(e => e.id));

      // Compute sibling unions
      const subjSiblingUnion = computeSiblingUnion(structId, siblingIds, subjectivitiesByQuote);
      const endtSiblingUnion = computeSiblingUnion(structId, siblingIds, endorsementsByQuote);

      // Missing = in sibling union but not on this option
      const missingSubjectivities = [];
      subjSiblingUnion.forEach((label, id) => {
        if (!mySubjIds.has(id)) {
          missingSubjectivities.push({ id, label });
        }
      });

      const missingEndorsements = [];
      endtSiblingUnion.forEach((label, id) => {
        if (!myEndtIds.has(id)) {
          missingEndorsements.push({ id, label });
        }
      });

      // Extra = on this option but not in sibling union
      const extraSubjectivities = mySubjectivities.filter(s => !subjSiblingUnion.has(s.id));
      const extraEndorsements = myEndorsements.filter(e => !endtSiblingUnion.has(e.id));

      stats.set(structId, {
        subjectivities: {
          total: mySubjectivities.length,
          missing: missingSubjectivities,
          extra: extraSubjectivities,
        },
        endorsements: {
          total: myEndorsements.length,
          missing: missingEndorsements,
          extra: extraEndorsements,
        },
      });
    });

    return stats;
  }, [structures, subjectivitiesByQuote, endorsementsByQuote]);

  // Helper to format the comparison display text
  const formatComparisonText = (missing, extra) => {
    const missingCount = missing.length;
    const extraCount = extra.length;

    if (missingCount === 0 && extraCount === 0) {
      return { text: 'Aligned', tone: 'text-gray-500' };
    }
    if (missingCount > 0 && extraCount === 0) {
      return { text: `${missingCount} missing`, tone: 'text-amber-600' };
    }
    if (missingCount === 0 && extraCount > 0) {
      return { text: `${extraCount} extra`, tone: 'text-purple-600' };
    }
    return { text: `Mixed +${extraCount}, −${missingCount}`, tone: 'text-amber-600' };
  };

  const subjectivityItems = useMemo(() => {
    return (submissionSubjectivitiesData || []).map(subj => {
      const label = subj.text || subj.subjectivity_text || subj.title || 'Subjectivity';
      const quoteIds = parseQuoteIds(subj.quote_ids);
      const presentIds = selectedIdStrings.filter(id => quoteIds.includes(id));
      const missingIds = selectedIdStrings.filter(id => !quoteIds.includes(id));
      const count = presentIds.length;
      const state = count === 0 ? 'none' : count === selectedIdStrings.length ? 'all' : 'some';
      return {
        id: subj.id,
        label,
        state,
        count,
        presentIds,
        missingIds,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [submissionSubjectivitiesData, selectedIdStrings]);

  const allOptions = useMemo(() => (
    structures.map(struct => ({
      id: String(struct.id),
      name: struct.quote_name || generateOptionName(struct),
      position: getStructurePosition(struct),
    }))
  ), [structures]);

  const allPrimaryIds = useMemo(() => (
    allOptions.filter(opt => opt.position !== 'excess').map(opt => opt.id)
  ), [allOptions]);

  const allExcessIds = useMemo(() => (
    allOptions.filter(opt => opt.position === 'excess').map(opt => opt.id)
  ), [allOptions]);

  const allOptionLabelMap = useMemo(() => (
    new Map(allOptions.map(opt => [opt.id, opt.name]))
  ), [allOptions]);

  const subjectivityRulesAll = useMemo(() => {
    const getScope = (linkedIds) => {
      if (linkedIds.length === 0) return 'none';
      const linkedSet = new Set(linkedIds);
      const isAll = allOptionIds.length > 0 && allOptionIds.every(id => linkedSet.has(id));
      if (isAll) return 'all';
      const isPrimary = allPrimaryIds.length > 0
        && allPrimaryIds.length === linkedSet.size
        && allPrimaryIds.every(id => linkedSet.has(id));
      if (isPrimary) return 'primary';
      const isExcess = allExcessIds.length > 0
        && allExcessIds.length === linkedSet.size
        && allExcessIds.every(id => linkedSet.has(id));
      if (isExcess) return 'excess';
      return 'custom';
    };

    const getAppliesLabel = (linkedIds, scope) => {
      if (scope === 'none') return 'No options';
      if (scope === 'all') return `All ${allOptionIds.length} Options`;
      if (scope === 'primary') return 'All Primary';
      if (scope === 'excess') return 'All Excess';
      const linkedSet = new Set(linkedIds);
      const firstId = allOptions.find(opt => linkedSet.has(opt.id))?.id;
      const firstLabel = allOptionLabelMap.get(firstId) || 'Option';
      const extra = linkedIds.length - 1;
      return extra > 0 ? `${firstLabel} +${extra}` : firstLabel;
    };

    return (submissionSubjectivitiesData || []).map(subj => {
      const linkedIds = parseQuoteIds(subj.quote_ids).map(id => String(id));
      const scope = getScope(linkedIds);
      return {
        id: subj.id,
        label: subj.text || subj.subjectivity_text || subj.title || 'Subjectivity',
        status: subj.status || 'pending',
        linkedIds,
        linkedSet: new Set(linkedIds),
        scope,
        appliesLabel: getAppliesLabel(linkedIds, scope),
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [submissionSubjectivitiesData, allOptionIds, allPrimaryIds, allExcessIds, allOptions, allOptionLabelMap]);

  const filteredSubjectivityRulesAll = useMemo(() => {
    if (rulesFilter === 'any') return subjectivityRulesAll;
    return subjectivityRulesAll.filter(rule => rule.scope === rulesFilter);
  }, [rulesFilter, subjectivityRulesAll]);

  const endorsementRulesAll = useMemo(() => {
    const getScope = (linkedIds) => {
      if (linkedIds.length === 0) return 'none';
      const linkedSet = new Set(linkedIds);
      const isAll = allOptionIds.length > 0 && allOptionIds.every(id => linkedSet.has(id));
      if (isAll) return 'all';
      const isPrimary = allPrimaryIds.length > 0
        && allPrimaryIds.length === linkedSet.size
        && allPrimaryIds.every(id => linkedSet.has(id));
      if (isPrimary) return 'primary';
      const isExcess = allExcessIds.length > 0
        && allExcessIds.length === linkedSet.size
        && allExcessIds.every(id => linkedSet.has(id));
      if (isExcess) return 'excess';
      return 'custom';
    };

    const getAppliesLabel = (linkedIds, scope) => {
      if (scope === 'none') return 'No options';
      if (scope === 'all') return `All ${allOptionIds.length} Options`;
      if (scope === 'primary') return 'All Primary';
      if (scope === 'excess') return 'All Excess';
      const linkedSet = new Set(linkedIds);
      const firstId = allOptions.find(opt => linkedSet.has(opt.id))?.id;
      const firstLabel = allOptionLabelMap.get(firstId) || 'Option';
      const extra = linkedIds.length - 1;
      return extra > 0 ? `${firstLabel} +${extra}` : firstLabel;
    };

    const endorsements = submissionEndorsementsData?.endorsements || [];
    return endorsements.map(endt => {
      const linkedIds = parseQuoteIds(endt.quote_ids).map(id => String(id));
      const scope = getScope(linkedIds);
      return {
        id: endt.endorsement_id,
        label: endt.title || endt.code || 'Endorsement',
        code: endt.code,
        linkedIds,
        linkedSet: new Set(linkedIds),
        scope,
        appliesLabel: getAppliesLabel(linkedIds, scope),
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [submissionEndorsementsData, allOptionIds, allPrimaryIds, allExcessIds, allOptions, allOptionLabelMap]);

  const filteredEndorsementRulesAll = useMemo(() => {
    if (rulesFilter === 'any') return endorsementRulesAll;
    return endorsementRulesAll.filter(rule => rule.scope === rulesFilter);
  }, [rulesFilter, endorsementRulesAll]);

  // Helper to normalize retro schedule for comparison (only compare relevant fields)
  const normalizeRetroSchedule = (schedule) => {
    if (!schedule || schedule.length === 0) return '[]';
    // Extract only relevant fields to avoid mismatches from extra/null fields
    const normalized = schedule.map(entry => {
      const obj = { coverage: entry.coverage, retro: entry.retro };
      if (entry.retro === 'date' && entry.date) obj.date = entry.date;
      if (entry.retro === 'custom' && entry.custom_text) obj.custom_text = entry.custom_text;
      return obj;
    }).sort((a, b) => (a.coverage || '').localeCompare(b.coverage || ''));
    return JSON.stringify(normalized);
  };

  // Helper to format retro schedule for display
  const formatRetroScheduleLabel = (schedule) => {
    if (!schedule || schedule.length === 0) return 'Full Prior Acts';
    const entries = schedule.map(entry => {
      const coverage = entry.coverage || 'Unknown';
      let retro = 'Inception';
      if (entry.retro === 'full_prior_acts') retro = 'Full Prior Acts';
      else if (entry.retro === 'date' && entry.date) retro = new Date(entry.date).toLocaleDateString();
      else if (entry.retro === 'custom' && entry.custom_text) retro = entry.custom_text;
      else if (entry.retro === 'custom') retro = 'Custom';
      return `${coverage}: ${retro}`;
    });
    return entries.join(', ');
  };

  const retroRulesAll = useMemo(() => {
    const getScope = (linkedIds) => {
      if (linkedIds.length === 0) return 'none';
      const linkedSet = new Set(linkedIds);
      const isAll = allOptionIds.length > 0 && allOptionIds.every(id => linkedSet.has(id));
      if (isAll) return 'all';
      const isPrimary = allPrimaryIds.length > 0
        && allPrimaryIds.length === linkedSet.size
        && allPrimaryIds.every(id => linkedSet.has(id));
      if (isPrimary) return 'primary';
      const isExcess = allExcessIds.length > 0
        && allExcessIds.length === linkedSet.size
        && allExcessIds.every(id => linkedSet.has(id));
      if (isExcess) return 'excess';
      return 'custom';
    };

    const getAppliesLabel = (linkedIds, scope) => {
      if (scope === 'none') return 'No options';
      if (scope === 'all') return `All ${allOptionIds.length} Options`;
      if (scope === 'primary') return 'All Primary';
      if (scope === 'excess') return 'All Excess';
      const linkedSet = new Set(linkedIds);
      const firstId = allOptions.find(opt => linkedSet.has(opt.id))?.id;
      const firstLabel = allOptionLabelMap.get(firstId) || 'Option';
      const extra = linkedIds.length - 1;
      return extra > 0 ? `${firstLabel} +${extra}` : firstLabel;
    };

    // Helper to get excluded coverages for a structure
    const getExcludedCoverages = (struct) => {
      const aggregateCoverages = struct?.coverages?.aggregate_coverages || {};
      return Object.entries(aggregateCoverages)
        .filter(([_, value]) => value === 0)
        .map(([id]) => {
          if (id === 'tech_eo') return 'Tech E&O';
          if (id === 'network_security_privacy') return 'Cyber';
          return id;
        });
    };

    // Group structures by their retro schedule (normalized, after filtering excluded coverages)
    const retroScheduleMap = new Map(); // normalized schedule -> { schedule, linkedIds }

    structures.forEach(struct => {
      const rawSchedule = struct.retro_schedule || [];
      const excludedCoverages = getExcludedCoverages(struct);
      // Filter out excluded coverages before grouping
      const schedule = rawSchedule.filter(entry => !excludedCoverages.includes(entry.coverage));
      const normalized = normalizeRetroSchedule(schedule);

      if (!retroScheduleMap.has(normalized)) {
        retroScheduleMap.set(normalized, {
          schedule: schedule,
          linkedIds: [],
        });
      }
      retroScheduleMap.get(normalized).linkedIds.push(String(struct.id));
    });

    // Convert to rules array
    return Array.from(retroScheduleMap.entries()).map(([normalized, data]) => {
      const linkedIds = data.linkedIds;
      const scope = getScope(linkedIds);
      return {
        id: normalized, // Use normalized string as ID
        schedule: data.schedule,
        linkedIds,
        linkedSet: new Set(linkedIds),
        scope,
        appliesLabel: getAppliesLabel(linkedIds, scope),
        label: formatRetroScheduleLabel(data.schedule),
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [structures, allOptionIds, allPrimaryIds, allExcessIds, allOptions, allOptionLabelMap]);

  const filteredRetroRulesAll = useMemo(() => {
    if (rulesFilter === 'any') return retroRulesAll;
    return retroRulesAll.filter(rule => rule.scope === rulesFilter);
  }, [rulesFilter, retroRulesAll]);

  // Helper to get policy term info from structure
  // Returns { isTbd: boolean, months: number|null, label: string }
  const getPolicyTermInfo = (struct, submission) => {
    const firstVariation = struct.variations?.[0];
    const datesTbd = firstVariation?.dates_tbd || struct.dates_tbd || false;

    if (datesTbd) {
      return { isTbd: true, months: null, label: 'TBD' };
    }

    // Get effective dates (cascade: variation → structure → submission)
    const effectiveDate = firstVariation?.effective_date_override || struct.effective_date || submission?.effective_date;
    const expirationDate = firstVariation?.expiration_date_override || struct.expiration_date || submission?.expiration_date;

    if (!effectiveDate || !expirationDate) {
      return { isTbd: true, months: null, label: 'TBD' };
    }

    // Calculate months between dates
    const start = new Date(effectiveDate);
    const end = new Date(expirationDate);
    const months = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.44)); // ~30.44 days per month

    // Format label
    let label;
    if (months === 12) label = '12 Months';
    else if (months === 18) label = '18 Months';
    else if (months === 24) label = '24 Months';
    else label = `${months} Months`;

    return { isTbd: false, months, label };
  };

  // Helper to get commission from structure (from first variation)
  const getCommission = (struct) => {
    const firstVariation = struct.variations?.[0];
    return firstVariation?.commission_override ?? null;
  };

  // Helper to format policy term (for display)
  const formatPolicyTerm = (termInfo) => {
    return termInfo?.label || 'TBD';
  };

  // Helper to format commission
  const formatCommission = (commission) => {
    if (commission === null || commission === undefined) return 'Default (15%)';
    return `${commission}%`;
  };

  const policyTermRulesAll = useMemo(() => {
    const getScope = (linkedIds) => {
      if (linkedIds.length === 0) return 'none';
      const linkedSet = new Set(linkedIds);
      const isAll = allOptionIds.length > 0 && allOptionIds.every(id => linkedSet.has(id));
      if (isAll) return 'all';
      const isPrimary = allPrimaryIds.length > 0
        && allPrimaryIds.length === linkedSet.size
        && allPrimaryIds.every(id => linkedSet.has(id));
      if (isPrimary) return 'primary';
      const isExcess = allExcessIds.length > 0
        && allExcessIds.length === linkedSet.size
        && allExcessIds.every(id => linkedSet.has(id));
      if (isExcess) return 'excess';
      return 'custom';
    };

    const getAppliesLabel = (linkedIds, scope) => {
      if (scope === 'none') return 'No options';
      if (scope === 'all') return `All ${allOptionIds.length} Options`;
      if (scope === 'primary') return 'All Primary';
      if (scope === 'excess') return 'All Excess';
      const linkedSet = new Set(linkedIds);
      const firstId = allOptions.find(opt => linkedSet.has(opt.id))?.id;
      const firstLabel = allOptionLabelMap.get(firstId) || 'Option';
      const extra = linkedIds.length - 1;
      return extra > 0 ? `${firstLabel} +${extra}` : firstLabel;
    };

    // Group structures by their policy term label (based on dates_tbd and calculated months)
    const policyTermMap = new Map(); // label -> { isTbd, months, label, linkedIds }

    structures.forEach(struct => {
      const termInfo = getPolicyTermInfo(struct, submission);
      const key = termInfo.label; // "TBD", "12 Months", "13 Months", etc.

      if (!policyTermMap.has(key)) {
        policyTermMap.set(key, {
          isTbd: termInfo.isTbd,
          months: termInfo.months,
          label: termInfo.label,
          linkedIds: [],
        });
      }
      policyTermMap.get(key).linkedIds.push(String(struct.id));
    });

    // Convert to rules array
    return Array.from(policyTermMap.entries()).map(([key, data]) => {
      const linkedIds = data.linkedIds;
      const scope = getScope(linkedIds);
      return {
        id: `term-${key}`,
        isTbd: data.isTbd,
        months: data.months,
        linkedIds,
        linkedSet: new Set(linkedIds),
        scope,
        appliesLabel: getAppliesLabel(linkedIds, scope),
        label: data.label,
      };
    }).sort((a, b) => {
      // Sort: by months ascending, TBD at end
      if (a.isTbd && !b.isTbd) return 1;
      if (!a.isTbd && b.isTbd) return -1;
      if (a.isTbd && b.isTbd) return 0;
      return (a.months || 0) - (b.months || 0);
    });
  }, [structures, submission, allOptionIds, allPrimaryIds, allExcessIds, allOptions, allOptionLabelMap]);

  const filteredPolicyTermRulesAll = useMemo(() => {
    if (rulesFilter === 'any') return policyTermRulesAll;
    return policyTermRulesAll.filter(rule => rule.scope === rulesFilter);
  }, [rulesFilter, policyTermRulesAll]);

  const commissionRulesAll = useMemo(() => {
    const getScope = (linkedIds) => {
      if (linkedIds.length === 0) return 'none';
      const linkedSet = new Set(linkedIds);
      const isAll = allOptionIds.length > 0 && allOptionIds.every(id => linkedSet.has(id));
      if (isAll) return 'all';
      const isPrimary = allPrimaryIds.length > 0
        && allPrimaryIds.length === linkedSet.size
        && allPrimaryIds.every(id => linkedSet.has(id));
      if (isPrimary) return 'primary';
      const isExcess = allExcessIds.length > 0
        && allExcessIds.length === linkedSet.size
        && allExcessIds.every(id => linkedSet.has(id));
      if (isExcess) return 'excess';
      return 'custom';
    };

    const getAppliesLabel = (linkedIds, scope) => {
      if (scope === 'none') return 'No options';
      if (scope === 'all') return `All ${allOptionIds.length} Options`;
      if (scope === 'primary') return 'All Primary';
      if (scope === 'excess') return 'All Excess';
      const linkedSet = new Set(linkedIds);
      const firstId = allOptions.find(opt => linkedSet.has(opt.id))?.id;
      const firstLabel = allOptionLabelMap.get(firstId) || 'Option';
      const extra = linkedIds.length - 1;
      return extra > 0 ? `${firstLabel} +${extra}` : firstLabel;
    };

    // Group structures by their commission
    const commissionMap = new Map(); // commission value -> { commission, linkedIds }
    
    structures.forEach(struct => {
      const commission = getCommission(struct);
      const key = commission === null ? 'default' : String(commission);
      
      if (!commissionMap.has(key)) {
        commissionMap.set(key, {
          commission: commission,
          linkedIds: [],
        });
      }
      commissionMap.get(key).linkedIds.push(String(struct.id));
    });

    // Convert to rules array
    return Array.from(commissionMap.entries()).map(([key, data]) => {
      const linkedIds = data.linkedIds;
      const scope = getScope(linkedIds);
      return {
        id: `commission-${key}`,
        commission: data.commission,
        linkedIds,
        linkedSet: new Set(linkedIds),
        scope,
        appliesLabel: getAppliesLabel(linkedIds, scope),
        label: formatCommission(data.commission),
      };
    }).sort((a, b) => {
      // Sort: null/default first, then by value
      if (a.commission === null && b.commission !== null) return -1;
      if (a.commission !== null && b.commission === null) return 1;
      if (a.commission === null && b.commission === null) return 0;
      return (a.commission || 0) - (b.commission || 0);
    });
  }, [structures, allOptionIds, allPrimaryIds, allExcessIds, allOptions, allOptionLabelMap]);

  const filteredCommissionRulesAll = useMemo(() => {
    if (rulesFilter === 'any') return commissionRulesAll;
    return commissionRulesAll.filter(rule => rule.scope === rulesFilter);
  }, [rulesFilter, commissionRulesAll]);

  const endorsementItems = useMemo(() => {
    const endorsements = submissionEndorsementsData?.endorsements || [];
    return endorsements.map(endt => {
      const label = endt.title || endt.code || 'Endorsement';
      const quoteIds = parseQuoteIds(endt.quote_ids);
      const presentIds = selectedIdStrings.filter(id => quoteIds.includes(id));
      const missingIds = selectedIdStrings.filter(id => !quoteIds.includes(id));
      const count = presentIds.length;
      const state = count === 0 ? 'none' : count === selectedIdStrings.length ? 'all' : 'some';
      return {
        id: endt.endorsement_id,
        label,
        code: endt.code,
        state,
        count,
        presentIds,
        missingIds,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [submissionEndorsementsData, selectedIdStrings]);


  const refreshAfterManage = (targetIds = []) => {
    const ids = targetIds.length ? targetIds : selectedIdStrings;
    ids.forEach(id => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', id] });
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', id] });
    });
    queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
  };

  const applyManageAction = useMutation({
    mutationFn: async ({ type, action, item }) => {
      if (!selectedIdStrings.length) return;
      if (type === 'subjectivities') {
        if (action === 'add') {
          await Promise.all(selectedIdStrings.map(id => linkSubjectivityToQuote(id, item.id)));
        }
        if (action === 'remove') {
          await Promise.all(item.presentIds.map(id => unlinkSubjectivityFromQuote(id, item.id)));
        }
        if (action === 'align') {
          await Promise.all(item.missingIds.map(id => linkSubjectivityToQuote(id, item.id)));
        }
      }
      if (type === 'endorsements') {
        if (action === 'add') {
          await Promise.all(selectedIdStrings.map(id => linkEndorsementToQuote(id, item.id)));
        }
        if (action === 'remove') {
          await Promise.all(item.presentIds.map(id => unlinkEndorsementFromQuote(id, item.id)));
        }
        if (action === 'align') {
          await Promise.all(item.missingIds.map(id => linkEndorsementToQuote(id, item.id)));
        }
      }
    },
    onSuccess: () => {
      refreshAfterManage(selectedIdStrings);
    },
  });

  const toggleSubjectivityLink = useMutation({
    mutationFn: async ({ subjectivityId, quoteId, isLinked }) => {
      if (isLinked) {
        return unlinkSubjectivityFromQuote(quoteId, subjectivityId);
      } else {
        return linkSubjectivityToQuote(quoteId, subjectivityId);
      }
    },
    onMutate: async ({ subjectivityId, quoteId, isLinked }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['submissionSubjectivities', submissionId] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(['submissionSubjectivities', submissionId]);

      // Optimistically update
      queryClient.setQueryData(['submissionSubjectivities', submissionId], (old) => {
        if (!old) return old;
        return old.map(subj => {
          if (String(subj.id) !== String(subjectivityId)) return subj;
          const currentIds = parseQuoteIds(subj.quote_ids);
          let newIds;
          if (isLinked) {
            // Remove quoteId
            newIds = currentIds.filter(id => String(id) !== String(quoteId));
          } else {
            // Add quoteId
            newIds = [...currentIds, String(quoteId)];
          }
          return { ...subj, quote_ids: newIds };
        });
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['submissionSubjectivities', submissionId], context.previousData);
      }
      console.error('Failed to toggle subjectivity link:', err);
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  const applySubjectivitySelection = useMutation({
    mutationFn: async ({ subjectivityId, currentIds, targetIds }) => {
      const currentSet = new Set(currentIds);
      const targetSet = new Set(targetIds);
      const toLink = targetIds.filter(id => !currentSet.has(id));
      const toUnlink = currentIds.filter(id => !targetSet.has(id));
      await Promise.all([
        ...toLink.map(id => linkSubjectivityToQuote(id, subjectivityId)),
        ...toUnlink.map(id => unlinkSubjectivityFromQuote(id, subjectivityId)),
      ]);
    },
    onSuccess: (_, variables) => {
      const ids = Array.from(new Set([...(variables.currentIds || []), ...(variables.targetIds || [])]));
      refreshAfterManage(ids);
    },
  });

  const updateSubjectivityTextMutation = useMutation({
    mutationFn: async ({ subjectivityId, text, status }) => {
      return updateSubjectivity(subjectivityId, { text, status });
    },
    onMutate: async ({ subjectivityId, text, status }) => {
      await queryClient.cancelQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      const previousData = queryClient.getQueryData(['submissionSubjectivities', submissionId]);
      queryClient.setQueryData(['submissionSubjectivities', submissionId], (old) => {
        if (!old) return old;
        return old.map(subj => {
          if (String(subj.id) !== String(subjectivityId)) return subj;
          return { ...subj, text, status };
        });
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['submissionSubjectivities', submissionId], context.previousData);
      }
      console.error('Failed to update subjectivity:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  const handleStartEditSubjectivity = (rule) => {
    setEditingSubjectivityId(rule.id);
    setEditingSubjectivityText(rule.label);
    setEditingSubjectivityStatus(rule.status || 'pending');
  };

  const handleSaveSubjectivity = () => {
    if (!editingSubjectivityId) return;
    updateSubjectivityTextMutation.mutate({
      subjectivityId: editingSubjectivityId,
      text: editingSubjectivityText,
      status: editingSubjectivityStatus,
    });
    setEditingSubjectivityId(null);
    setEditingSubjectivityText('');
    setEditingSubjectivityStatus('pending');
  };

  const handleCancelEditSubjectivity = () => {
    setEditingSubjectivityId(null);
    setEditingSubjectivityText('');
    setEditingSubjectivityStatus('pending');
  };

  const toggleEndorsementLink = useMutation({
    mutationFn: async ({ endorsementId, quoteId, isLinked }) => {
      if (isLinked) {
        return unlinkEndorsementFromQuote(quoteId, endorsementId);
      } else {
        return linkEndorsementToQuote(quoteId, endorsementId);
      }
    },
    onMutate: async ({ endorsementId, quoteId, isLinked }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['submissionEndorsements', submissionId] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(['submissionEndorsements', submissionId]);

      // Optimistically update
      queryClient.setQueryData(['submissionEndorsements', submissionId], (old) => {
        if (!old?.endorsements) return old;
        return {
          ...old,
          endorsements: old.endorsements.map(endt => {
            if (String(endt.endorsement_id) !== String(endorsementId)) return endt;
            const currentIds = parseQuoteIds(endt.quote_ids);
            let newIds;
            if (isLinked) {
              // Remove quoteId
              newIds = currentIds.filter(id => String(id) !== String(quoteId));
            } else {
              // Add quoteId
              newIds = [...currentIds, String(quoteId)];
            }
            return { ...endt, quote_ids: newIds };
          }),
        };
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['submissionEndorsements', submissionId], context.previousData);
      }
      console.error('Failed to toggle endorsement link:', err);
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
    },
  });

  const applyEndorsementSelection = useMutation({
    mutationFn: async ({ endorsementId, currentIds, targetIds }) => {
      const currentSet = new Set(currentIds);
      const targetSet = new Set(targetIds);
      const toLink = targetIds.filter(id => !currentSet.has(id));
      const toUnlink = currentIds.filter(id => !targetSet.has(id));
      await Promise.all([
        ...toLink.map(id => linkEndorsementToQuote(id, endorsementId)),
        ...toUnlink.map(id => unlinkEndorsementFromQuote(id, endorsementId)),
      ]);
    },
    onSuccess: (_, variables) => {
      const ids = Array.from(new Set([...(variables.currentIds || []), ...(variables.targetIds || [])]));
      refreshAfterManage(ids);
    },
  });

  const applyRetroSelection = useMutation({
    mutationFn: async ({ schedule, currentIds, targetIds }) => {
      const currentSet = new Set(currentIds);
      const targetSet = new Set(targetIds);
      const toApply = targetIds.filter(id => !currentSet.has(id));
      const toRemove = currentIds.filter(id => !targetSet.has(id));

      // Filter out bound quotes to avoid 403 errors
      const unboundToApply = toApply.filter(id => {
        const struct = structures.find(s => String(s.id) === id);
        return !struct?.is_bound;
      });
      const unboundToRemove = toRemove.filter(id => {
        const struct = structures.find(s => String(s.id) === id);
        return !struct?.is_bound;
      });

      // Apply schedule to new quotes (skip bound)
      await Promise.all(
        unboundToApply.map(id => updateQuoteOption(id, { retro_schedule: schedule }))
      );

      // Remove schedule from quotes (set to empty array, skip bound)
      await Promise.all(
        unboundToRemove.map(id => updateQuoteOption(id, { retro_schedule: [] }))
      );
    },
    onMutate: async ({ schedule, currentIds, targetIds }) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      const currentSet = new Set(currentIds);
      const targetSet = new Set(targetIds);

      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => {
          const id = String(s.id);
          // Skip bound quotes in optimistic update
          if (s.is_bound) return s;

          // If in target set and not in current, apply schedule
          if (targetSet.has(id) && !currentSet.has(id)) {
            return { ...s, retro_schedule: schedule };
          }
          // If was in current set but not in target, clear schedule
          if (currentSet.has(id) && !targetSet.has(id)) {
            return { ...s, retro_schedule: [] };
          }
          return s;
        })
      );
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['structures', submissionId], context.previous);
      }
      console.error('Failed to apply retro selection:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  const toggleRetroLink = useMutation({
    mutationFn: async ({ schedule, quoteId, isLinked }) => {
      // Check if quote is bound - skip update if so
      const struct = structures.find(s => String(s.id) === quoteId);
      if (struct?.is_bound) {
        throw new Error('Cannot modify retro schedule on bound quote');
      }

      if (isLinked) {
        // Remove retro schedule
        return updateQuoteOption(quoteId, { retro_schedule: [] });
      } else {
        // Apply retro schedule
        return updateQuoteOption(quoteId, { retro_schedule: schedule });
      }
    },
    onMutate: async ({ schedule, quoteId, isLinked }) => {
      // Check if quote is bound - don't do optimistic update if so
      const struct = structures.find(s => String(s.id) === quoteId);
      if (struct?.is_bound) return { previous: null, skipUpdate: true };

      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s =>
          String(s.id) === String(quoteId)
            ? { ...s, retro_schedule: isLinked ? [] : schedule }
            : s
        )
      );
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous && !context?.skipUpdate) {
        queryClient.setQueryData(['structures', submissionId], context.previous);
      }
      console.error('Failed to toggle retro schedule:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  const applyPolicyTermSelection = useMutation({
    mutationFn: async ({ isTbd, effectiveDate, expirationDate, currentIds, targetIds }) => {
      const currentSet = new Set(currentIds);
      const targetSet = new Set(targetIds);
      const toApply = targetIds.filter(id => !currentSet.has(id));
      const toRemove = currentIds.filter(id => !targetSet.has(id));

      // If dates are provided, we're creating a new policy term (set specific dates)
      // Otherwise, we're applying an existing rule (only toggle dates_tbd flag)
      const hasDates = effectiveDate !== undefined || expirationDate !== undefined;

      // toApply: Options being added to this row
      const updateData = hasDates
        ? (isTbd
          ? { dates_tbd: true, effective_date_override: null, expiration_date_override: null }
          : { dates_tbd: false, effective_date_override: effectiveDate || null, expiration_date_override: expirationDate || null })
        : { dates_tbd: isTbd }; // Only toggle flag for existing rules

      await Promise.all(
        toApply.map(id => {
          const struct = structures.find(s => String(s.id) === id);
          const firstVariation = struct?.variations?.[0];
          if (firstVariation) {
            return updateVariation(firstVariation.id, updateData);
          } else if (struct) {
            return updateQuoteOption(id, updateData);
          }
        }).filter(Boolean)
      );

      // toRemove: Options being removed from this row - flip to opposite state
      await Promise.all(
        toRemove.map(id => {
          const struct = structures.find(s => String(s.id) === id);
          const firstVariation = struct?.variations?.[0];
          const removeData = hasDates
            ? (isTbd
              ? { dates_tbd: false } // Moving from TBD to dated - keep existing dates
              : { dates_tbd: true, effective_date_override: null, expiration_date_override: null }) // Moving from dated to TBD
            : { dates_tbd: !isTbd }; // Only toggle flag for existing rules
          if (firstVariation) {
            return updateVariation(firstVariation.id, removeData);
          } else if (struct) {
            return updateQuoteOption(id, removeData);
          }
        }).filter(Boolean)
      );
    },
    onMutate: async ({ isTbd, effectiveDate, expirationDate, currentIds, targetIds }) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      const currentSet = new Set(currentIds);
      const targetSet = new Set(targetIds);

      const hasDates = effectiveDate !== undefined || expirationDate !== undefined;
      const updateData = hasDates
        ? (isTbd
          ? { dates_tbd: true, effective_date_override: null, expiration_date_override: null }
          : { dates_tbd: false, effective_date_override: effectiveDate || null, expiration_date_override: expirationDate || null })
        : { dates_tbd: isTbd };

      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => {
          const id = String(s.id);
          const firstVariation = s.variations?.[0];
          if (!firstVariation) return s;

          // If in target set, apply the policy term
          if (targetSet.has(id) && !currentSet.has(id)) {
            return {
              ...s,
              variations: s.variations.map((v, idx) =>
                idx === 0 ? { ...v, ...updateData } : v
              ),
            };
          }
          // If was in current set but not in target, flip to opposite state
          if (currentSet.has(id) && !targetSet.has(id)) {
            const removeData = hasDates
              ? (isTbd
                ? { dates_tbd: false }
                : { dates_tbd: true, effective_date_override: null, expiration_date_override: null })
              : { dates_tbd: !isTbd };
            return {
              ...s,
              variations: s.variations.map((v, idx) =>
                idx === 0 ? { ...v, ...removeData } : v
              ),
            };
          }
          return s;
        })
      );
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['structures', submissionId], context.previous);
      }
      console.error('Failed to apply policy term selection:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  const togglePolicyTermLink = useMutation({
    mutationFn: async ({ quoteId, isLinked, isTbd }) => {
      const struct = structures.find(s => String(s.id) === quoteId);
      const firstVariation = struct?.variations?.[0];
      // Logic:
      // - Unchecking from TBD row (isTbd=true, isLinked=true) → set dates_tbd=false
      // - Unchecking from dated row (isTbd=false, isLinked=true) → set dates_tbd=true
      // - Checking into TBD row (isTbd=true, isLinked=false) → set dates_tbd=true
      // - Checking into dated row (isTbd=false, isLinked=false) → set dates_tbd=false
      // Formula: newDatesTbd = isTbd ? !isLinked : isLinked
      const newDatesTbd = isTbd ? !isLinked : isLinked;

      if (firstVariation) {
        return updateVariation(firstVariation.id, { dates_tbd: newDatesTbd });
      } else if (struct) {
        return updateQuoteOption(quoteId, { dates_tbd: newDatesTbd });
      }
    },
    onMutate: async ({ quoteId, isLinked, isTbd }) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      const newDatesTbd = isTbd ? !isLinked : isLinked;

      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => {
          if (String(s.id) !== String(quoteId)) return s;
          const firstVariation = s.variations?.[0];
          if (firstVariation) {
            return {
              ...s,
              variations: s.variations.map((v, idx) =>
                idx === 0 ? { ...v, dates_tbd: newDatesTbd } : v
              ),
            };
          }
          return { ...s, dates_tbd: newDatesTbd };
        })
      );
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['structures', submissionId], context.previous);
      }
      console.error('Failed to toggle policy term:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  const applyCommissionSelection = useMutation({
    mutationFn: async ({ commission, currentIds, targetIds }) => {
      const currentSet = new Set(currentIds);
      const targetSet = new Set(targetIds);
      const toApply = targetIds.filter(id => !currentSet.has(id));
      const toRemove = currentIds.filter(id => !targetSet.has(id));

      await Promise.all(
        toApply.map(id => {
          const struct = structures.find(s => String(s.id) === id);
          const firstVariation = struct?.variations?.[0];
          if (firstVariation) {
            return updateVariation(firstVariation.id, { commission_override: commission });
          }
        }).filter(Boolean)
      );

      await Promise.all(
        toRemove.map(id => {
          const struct = structures.find(s => String(s.id) === id);
          const firstVariation = struct?.variations?.[0];
          if (firstVariation) {
            return updateVariation(firstVariation.id, { commission_override: null });
          }
        }).filter(Boolean)
      );
    },
    onMutate: async ({ commission, currentIds, targetIds }) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      const targetSet = new Set(targetIds);
      const currentSet = new Set(currentIds);

      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => {
          const id = String(s.id);
          const firstVariation = s.variations?.[0];
          if (!firstVariation) return s;

          // If in target set, apply commission
          if (targetSet.has(id)) {
            return {
              ...s,
              variations: s.variations.map((v, idx) =>
                idx === 0 ? { ...v, commission_override: commission } : v
              ),
            };
          }
          // If was in current set but not in target, remove commission
          if (currentSet.has(id) && !targetSet.has(id)) {
            return {
              ...s,
              variations: s.variations.map((v, idx) =>
                idx === 0 ? { ...v, commission_override: null } : v
              ),
            };
          }
          return s;
        })
      );
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['structures', submissionId], context.previous);
      }
      console.error('Failed to apply commission selection:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  const toggleCommissionLink = useMutation({
    mutationFn: async ({ commission, quoteId, isLinked }) => {
      const struct = structures.find(s => String(s.id) === quoteId);
      const firstVariation = struct?.variations?.[0];
      if (isLinked) {
        if (firstVariation) {
          return updateVariation(firstVariation.id, { commission_override: null });
        }
      } else {
        if (firstVariation) {
          return updateVariation(firstVariation.id, { commission_override: commission });
        }
      }
    },
    onMutate: async ({ commission, quoteId, isLinked }) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => {
          if (String(s.id) !== String(quoteId)) return s;
          const firstVariation = s.variations?.[0];
          if (firstVariation) {
            return {
              ...s,
              variations: s.variations.map((v, idx) => 
                idx === 0 ? { ...v, commission_override: isLinked ? null : commission } : v
              ),
            };
          }
          return s;
        })
      );
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['structures', submissionId], context.previous);
      }
      console.error('Failed to toggle commission:', err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  const addNewToSelected = useMutation({
    mutationFn: async ({ type, payload }) => {
      if (type === 'subjectivities') {
        await createSubjectivity(submissionId, { text: payload, quote_ids: selectedIdStrings });
      }
      if (type === 'endorsements') {
        await Promise.all(selectedIdStrings.map(id => linkEndorsementToQuote(id, payload)));
      }
    },
    onSuccess: () => {
      refreshAfterManage(selectedIdStrings);
      setManageAddSearchTerm('');
      setManageSearchTerm('');
    },
  });

  // Format number with commas
  const formatWithCommas = (num) => {
    if (!num && num !== 0) return '';
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Parse number from formatted string
  const parseNumber = (str) => {
    if (!str) return 0;
    return parseFloat(str.replace(/[,$]/g, '')) || 0;
  };

  // Initialize draft when entering edit mode
  const enterEditMode = (focusIdx = 0) => {
    const initialDraft = {};
    structures.forEach(struct => {
      const tower = struct.tower_json || [];
      const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
      initialDraft[struct.id] = {
        premium: cmaiLayer?.premium || 0,
      };
    });
    setDraft(initialDraft);
    setIsEditing(true);
    // Focus first input after state update
    setTimeout(() => {
      if (inputRefs.current[focusIdx]) {
        inputRefs.current[focusIdx].focus();
        inputRefs.current[focusIdx].select();
      }
    }, 0);
  };

  // Save all changes and exit edit mode
  const saveAndExit = () => {
    structures.forEach(struct => {
      const changes = draft[struct.id];
      if (!changes) return;

      const tower = struct.tower_json || [];
      const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
      const currentPremium = cmaiLayer?.premium || 0;

      if (changes.premium !== currentPremium) {
        const newTower = [...tower];
        const cmaiIdx = newTower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
        if (cmaiIdx >= 0) {
          newTower[cmaiIdx] = { ...newTower[cmaiIdx], premium: changes.premium };
          if (onUpdateOption) {
            onUpdateOption(struct.id, { tower_json: newTower });
          }
        }
      }
    });

    setIsEditing(false);
    setDraft({});
  };

  // Arrow key navigation
  const handleKeyDown = (e, idx) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = idx - 1;
      if (inputRefs.current[prevIdx]) {
        inputRefs.current[prevIdx].focus();
        inputRefs.current[prevIdx].select();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const nextIdx = idx + 1;
      if (inputRefs.current[nextIdx]) {
        inputRefs.current[nextIdx].focus();
        inputRefs.current[nextIdx].select();
      }
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setDraft({});
    }
  };

  // Click outside to save
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        saveAndExit();
      }
    };

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsEditing(false);
        setDraft({});
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isEditing, draft, structures, onUpdateOption]);

  const updateDraft = (structId, value) => {
    setDraft(prev => ({
      ...prev,
      [structId]: { ...prev[structId], premium: value }
    }));
  };

  return (
    <div ref={tableRef}>
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: 'options', label: 'Options' },
          { key: 'subjectivities', label: 'Subjectivities' },
          { key: 'endorsements', label: 'Endorsements' },
          { key: 'retro', label: 'Retro Dates' },
          { key: 'policy_term', label: 'Policy Term' },
          { key: 'commission', label: 'Commission' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setGridTab(tab.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              gridTab === tab.key
                ? 'border-purple-300 bg-purple-50 text-purple-700'
                : 'border-gray-200 text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {gridTab === 'options' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Type</span>
              {['all', 'primary', 'excess'].map(option => (
                <button
                  key={option}
                  onClick={() => setFilterPosition(option)}
                  className={`px-2 py-1 rounded text-[11px] font-medium border ${
                    filterPosition === option
                      ? 'border-purple-300 bg-purple-50 text-purple-700'
                      : 'border-gray-200 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {option === 'all' ? 'All' : option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
            {selectedIds.length > 0 && (
              <span className="text-xs text-gray-500">{selectedIds.length} selected</span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-purple-600 rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left font-semibold">Option</th>
                <th className="px-4 py-3 text-right font-semibold">Premium</th>
                <th className="px-4 py-3 text-left font-semibold">Subjectivities</th>
                <th className="px-4 py-3 text-left font-semibold">Endorsements</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStructures.map((struct, idx) => {
                const tower = struct.tower_json || [];
                const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
                const currentPremium = struct?.sold_premium || cmaiLayer?.premium || 0;
                const currentStatus = struct.is_bound ? 'bound' : (struct.status || 'draft');
                const isSelected = selectedIdSet.has(String(struct.id));
                const subjectivityList = subjectivitiesByQuote.get(String(struct.id)) || [];
                const endorsementList = endorsementsByQuote.get(String(struct.id)) || [];
                const subjectivityKey = `subjectivities-${struct.id}`;
                const endorsementKey = `endorsements-${struct.id}`;

                // Get position-based comparison stats
                const stats = positionComparisonStats.get(String(struct.id)) || {
                  subjectivities: { total: 0, missing: [], extra: [] },
                  endorsements: { total: 0, missing: [], extra: [] },
                };
                const subjStats = stats.subjectivities;
                const endtStats = stats.endorsements;
                const subjDisplay = formatComparisonText(subjStats.missing, subjStats.extra);
                const endtDisplay = formatComparisonText(endtStats.missing, endtStats.extra);

                const draftPremium = draft[struct.id]?.premium ?? currentPremium;
                const isExcess = getStructurePosition(struct) === 'excess';

                return (
                  <tr
                    key={struct.id}
                    className={`transition-colors hover:bg-gray-50 ${isSelected ? 'bg-purple-50/40' : ''}`}
                    onClick={() => !isEditing && enterEditMode(idx)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRowSelection(struct.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-purple-600 rounded border-gray-300"
                      />
                    </td>
                    {/* Option Name - Clickable to navigate */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isExcess
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isExcess ? 'EXCESS' : 'PRIMARY'}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelect(struct.id); }}
                          className="hover:text-purple-600 transition-colors"
                        >
                          <span className="font-medium text-gray-900">
                            {struct.quote_name || 'Unnamed Option'}
                          </span>
                        </button>
                      </div>
                    </td>
                    {/* Premium */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          ref={el => inputRefs.current[idx] = el}
                          type="text"
                          value={formatWithCommas(draftPremium)}
                          onChange={(e) => {
                            const val = parseNumber(e.target.value);
                            updateDraft(struct.id, val);
                          }}
                          onKeyDown={(e) => handleKeyDown(e, idx)}
                          className="w-32 px-2 py-1 text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-300 text-sm"
                        />
                      ) : (
                        <span className="font-semibold text-green-600">{formatCurrency(currentPremium)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-left">
                      {(subjectivityList.length > 0 || subjStats.missing.length > 0) ? (
                        <HoverCard.Root openDelay={200} closeDelay={100}>
                          <HoverCard.Trigger asChild>
                            <button
                              type="button"
                              className={`text-xs ${subjDisplay.tone} hover:opacity-80`}
                            >
                              {subjDisplay.text}
                            </button>
                          </HoverCard.Trigger>
                          <HoverCard.Portal>
                            <HoverCard.Content
                              className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3"
                              sideOffset={4}
                            >
                              {subjStats.missing.length > 0 && (
                                <>
                                  <div className="text-[10px] text-amber-600 uppercase tracking-wide mb-1">Missing from peers</div>
                                  <div className="space-y-1 mb-3">
                                    {subjStats.missing.map(item => (
                                      <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                        <span className="text-amber-400">•</span>
                                        <span>{item.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              {subjStats.extra.length > 0 && (
                                <>
                                  <div className="text-[10px] text-purple-600 uppercase tracking-wide mb-1">Extra (not on peers)</div>
                                  <div className="space-y-1 mb-3">
                                    {subjStats.extra.map(item => (
                                      <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                        <span className="text-purple-400">•</span>
                                        <span>{item.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              {subjectivityList.length > 0 && subjStats.missing.length === 0 && subjStats.extra.length === 0 && (
                                <>
                                  <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Subjectivities ({subjectivityList.length})</div>
                                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                    {subjectivityList.map(item => (
                                      <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                        <span className="text-gray-400">•</span>
                                        <span>{item.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              <HoverCard.Arrow className="fill-white" />
                            </HoverCard.Content>
                          </HoverCard.Portal>
                        </HoverCard.Root>
                      ) : (
                        <span className={`text-xs ${subjDisplay.tone}`}>{subjDisplay.text}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-left">
                      {(endorsementList.length > 0 || endtStats.missing.length > 0) ? (
                        <HoverCard.Root openDelay={200} closeDelay={100}>
                          <HoverCard.Trigger asChild>
                            <button
                              type="button"
                              className={`text-xs ${endtDisplay.tone} hover:opacity-80`}
                            >
                              {endtDisplay.text}
                            </button>
                          </HoverCard.Trigger>
                          <HoverCard.Portal>
                            <HoverCard.Content
                              className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3"
                              sideOffset={4}
                            >
                              {endtStats.missing.length > 0 && (
                                <>
                                  <div className="text-[10px] text-amber-600 uppercase tracking-wide mb-1">Missing from peers</div>
                                  <div className="space-y-1 mb-3">
                                    {endtStats.missing.map(item => (
                                      <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                        <span className="text-amber-400">•</span>
                                        <span>{item.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              {endtStats.extra.length > 0 && (
                                <>
                                  <div className="text-[10px] text-purple-600 uppercase tracking-wide mb-1">Extra (not on peers)</div>
                                  <div className="space-y-1 mb-3">
                                    {endtStats.extra.map(item => (
                                      <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                        <span className="text-purple-400">•</span>
                                        <span>{item.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              {endorsementList.length > 0 && endtStats.missing.length === 0 && endtStats.extra.length === 0 && (
                                <>
                                  <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Endorsements ({endorsementList.length})</div>
                                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                    {endorsementList.map(item => (
                                      <div key={item.id} className="text-xs text-gray-700 flex items-start gap-2">
                                        <span className="text-gray-400">•</span>
                                        <span>{item.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              <HoverCard.Arrow className="fill-white" />
                            </HoverCard.Content>
                          </HoverCard.Portal>
                        </HoverCard.Root>
                      ) : (
                        <span className={`text-xs ${endtDisplay.tone}`}>{endtDisplay.text}</span>
                      )}
                    </td>
                    {/* Status - Read only */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        currentStatus === 'bound' ? 'bg-green-100 text-green-700' :
                        currentStatus === 'quoted' ? 'bg-purple-100 text-purple-700' :
                        currentStatus === 'indication' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {currentStatus.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {gridTab === 'subjectivities' && (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Assignment Rules
          </div>
            <div className="flex items-center gap-3">
            {[
              { key: 'all', label: 'Apply to All' },
              { key: 'primary', label: 'Apply to Primary' },
              { key: 'excess', label: 'Apply to Excess' },
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setRulesFilter(prev => (prev === filter.key ? 'any' : filter.key))}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                  rulesFilter === filter.key
                      ? 'border-purple-300 bg-purple-50 text-purple-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                {filter.label}
              </button>
            ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-[80px_1fr_200px] gap-4 px-6 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-gray-200">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Status</span>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Subjectivity Name</span>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Applies To</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredSubjectivityRulesAll.map((rule, ruleIndex) => {
                const isMenuOpen = activeRuleMenu === rule.id;
                const isEditing = editingSubjectivityId === rule.id;

                // Navigate to another subjectivity (for Tab navigation)
                const navigateToSubjectivity = (targetIndex) => {
                  // Save current if changed
                  if (editingSubjectivityText.trim() && editingSubjectivityText !== rule.label) {
                    updateSubjectivityTextMutation.mutate({
                      subjectivityId: editingSubjectivityId,
                      text: editingSubjectivityText,
                      status: editingSubjectivityStatus,
                    });
                  }
                  // Move to target
                  const target = filteredSubjectivityRulesAll[targetIndex];
                  if (target) {
                    setEditingSubjectivityId(target.id);
                    setEditingSubjectivityText(target.label);
                    setEditingSubjectivityStatus(target.status || 'pending');
                  }
                };
                const statusIcon = rule.status === 'received'
                  ? <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  : rule.status === 'waived'
                  ? <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  : <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
                return (
                  <div
                    key={rule.id}
                    className={`grid grid-cols-[80px_1fr_200px] gap-4 px-6 py-4 items-center group transition-colors duration-150 ${isEditing ? 'bg-blue-50/50' : 'hover:bg-purple-50/30'}`}
                  >
                    {/* Status Column */}
                    <div className="flex items-center">
                      {isEditing ? (
                        <select
                          value={editingSubjectivityStatus}
                          onChange={(e) => setEditingSubjectivityStatus(e.target.value)}
                          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          <option value="pending">Pending</option>
                          <option value="received">Received</option>
                          <option value="waived">Waived</option>
                        </select>
                      ) : (
                        <button
                          onClick={() => handleStartEditSubjectivity(rule)}
                          className="p-1 rounded hover:bg-gray-100 transition-colors"
                          title={`Status: ${rule.status || 'pending'}`}
                        >
                          {statusIcon}
                        </button>
                      )}
                    </div>
                    {/* Name Column */}
                    <div className="min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingSubjectivityText}
                            onChange={(e) => setEditingSubjectivityText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                e.preventDefault();
                                // Move to next row (wrap to top)
                                const nextIndex = ruleIndex < filteredSubjectivityRulesAll.length - 1 ? ruleIndex + 1 : 0;
                                navigateToSubjectivity(nextIndex);
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                // Escape: Save and exit (consistent with other editors)
                                handleSaveSubjectivity();
                              }
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const nextIndex = ruleIndex < filteredSubjectivityRulesAll.length - 1 ? ruleIndex + 1 : 0;
                                navigateToSubjectivity(nextIndex);
                              }
                              if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
                                e.preventDefault();
                                const prevIndex = ruleIndex > 0 ? ruleIndex - 1 : filteredSubjectivityRulesAll.length - 1;
                                navigateToSubjectivity(prevIndex);
                              }
                            }}
                            className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            autoFocus
                          />
                          <button
                            onClick={handleSaveSubjectivity}
                            disabled={updateSubjectivityTextMutation.isPending}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded hover:bg-purple-700 transition-colors disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEditSubjectivity}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartEditSubjectivity(rule)}
                          className="text-sm font-medium text-slate-800 leading-relaxed text-left hover:text-purple-700 transition-colors w-full truncate"
                        >
                          {rule.label}
                        </button>
                      )}
                    </div>
                    {/* Applies To Column */}
                    <Popover.Root open={isMenuOpen} onOpenChange={(open) => setActiveRuleMenu(open ? rule.id : null)}>
                      <div className="flex flex-col items-end gap-2">
                        <Popover.Trigger asChild>
                          <button
                            className="text-xs font-semibold text-slate-700 border border-gray-300 bg-white rounded-full px-3 py-1.5 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 transition-all duration-150 shadow-sm hover:shadow"
                          >
                            {rule.appliesLabel}
                          </button>
                        </Popover.Trigger>
                        {rule.scope !== 'all' && (
                          <Popover.Trigger asChild>
                            <button className="text-[11px] font-medium text-purple-600 hover:text-purple-700 hover:underline transition-colors">
                              + Add Option
                            </button>
                          </Popover.Trigger>
                        )}
                      </div>
                      <Popover.Portal>
                        <Popover.Content
                          className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                          sideOffset={4}
                          align="end"
                        >
                          <div className="space-y-1">
                            <button
                              onClick={() => {
                                applySubjectivitySelection.mutate({
                                  subjectivityId: rule.id,
                                  currentIds: rule.linkedIds,
                                  targetIds: allOptionIds,
                                });
                                setActiveRuleMenu(null);
                              }}
                              disabled={applySubjectivitySelection.isPending}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Options
                            </button>
                            <button
                              onClick={() => {
                                applySubjectivitySelection.mutate({
                                  subjectivityId: rule.id,
                                  currentIds: rule.linkedIds,
                                  targetIds: allPrimaryIds,
                                });
                                setActiveRuleMenu(null);
                              }}
                              disabled={applySubjectivitySelection.isPending || allPrimaryIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Primary
                            </button>
                            <button
                              onClick={() => {
                                applySubjectivitySelection.mutate({
                                  subjectivityId: rule.id,
                                  currentIds: rule.linkedIds,
                                  targetIds: allExcessIds,
                                });
                                setActiveRuleMenu(null);
                              }}
                              disabled={applySubjectivitySelection.isPending || allExcessIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Excess
                            </button>
                          </div>
                          <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 max-h-48 overflow-y-auto">
                            {allOptions.map(opt => {
                              const isLinked = rule.linkedSet.has(opt.id);
                              return (
                                <label key={opt.id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                  <input
                                    type="checkbox"
                                    checked={isLinked}
                                    onChange={() => {
                                      setActiveRuleMenu(null);
                                      toggleSubjectivityLink.mutate({
                                      subjectivityId: rule.id,
                                      quoteId: opt.id,
                                      isLinked,
                                      });
                                    }}
                                    className="w-4 h-4 text-purple-600 rounded border-gray-300"
                                  />
                                  <span className="truncate">{opt.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>
                );
              })}

              {filteredSubjectivityRulesAll.length === 0 && (
                <div className="px-6 py-12 text-sm text-gray-400 text-center">
                  <div className="text-gray-300 mb-2">No subjectivities match this filter.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {gridTab === 'endorsements' && (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Assignment Rules
            </div>
            <div className="flex items-center gap-3">
              {[
                { key: 'all', label: 'Apply to All' },
                { key: 'primary', label: 'Apply to Primary' },
                { key: 'excess', label: 'Apply to Excess' },
              ].map(filter => (
                <button
                  key={filter.key}
                  onClick={() => setRulesFilter(prev => (prev === filter.key ? 'any' : filter.key))}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                    rulesFilter === filter.key
                      ? 'border-purple-300 bg-purple-50 text-purple-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_240px] gap-6 px-6 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-gray-200">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Endorsement Name</span>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Applies To</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredEndorsementRulesAll.map((rule, index) => {
                const isMenuOpen = activeRuleMenu === rule.id;
                return (
                  <div 
                    key={rule.id} 
                    className="grid grid-cols-[1fr_240px] gap-6 px-6 py-4 items-center group hover:bg-purple-50/30 transition-colors duration-150"
                  >
                    <div className="text-sm font-medium text-slate-800 leading-relaxed">
                      {rule.label}
                      {rule.code && (
                        <span className="ml-2 text-xs text-slate-500 font-mono">({rule.code})</span>
                      )}
                    </div>
                    <Popover.Root open={isMenuOpen} onOpenChange={(open) => setActiveRuleMenu(open ? rule.id : null)}>
                      <div className="flex flex-col items-end gap-2">
                        <Popover.Trigger asChild>
                          <button
                            className="text-xs font-semibold text-slate-700 border border-gray-300 bg-white rounded-full px-3 py-1.5 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 transition-all duration-150 shadow-sm hover:shadow"
                          >
                            {rule.appliesLabel}
                          </button>
                        </Popover.Trigger>
                        {rule.scope !== 'all' && (
                          <Popover.Trigger asChild>
                            <button className="text-[11px] font-medium text-purple-600 hover:text-purple-700 hover:underline transition-colors">
                              + Add Option
                            </button>
                          </Popover.Trigger>
                        )}
                      </div>
                      <Popover.Portal>
                        <Popover.Content
                          className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                          sideOffset={4}
                          align="end"
                        >
                          <div className="space-y-1">
                            <button
                              onClick={() => {
                                applyEndorsementSelection.mutate({
                                  endorsementId: rule.id,
                                  currentIds: rule.linkedIds,
                                  targetIds: allOptionIds,
                                });
                                setActiveRuleMenu(null);
                              }}
                              disabled={applyEndorsementSelection.isPending}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Options
                            </button>
                            <button
                              onClick={() => {
                                applyEndorsementSelection.mutate({
                                  endorsementId: rule.id,
                                  currentIds: rule.linkedIds,
                                  targetIds: allPrimaryIds,
                                });
                                setActiveRuleMenu(null);
                              }}
                              disabled={applyEndorsementSelection.isPending || allPrimaryIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Primary
                            </button>
                            <button
                              onClick={() => {
                                applyEndorsementSelection.mutate({
                                  endorsementId: rule.id,
                                  currentIds: rule.linkedIds,
                                  targetIds: allExcessIds,
                                });
                                setActiveRuleMenu(null);
                              }}
                              disabled={applyEndorsementSelection.isPending || allExcessIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Excess
                            </button>
                          </div>
                          <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 max-h-48 overflow-y-auto">
                            {allOptions.map(opt => {
                              const isLinked = rule.linkedSet.has(opt.id);
                              return (
                                <label key={opt.id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                  <input
                                    type="checkbox"
                                    checked={isLinked}
                                    onChange={() => {
                                      setActiveRuleMenu(null);
                                      toggleEndorsementLink.mutate({
                                        endorsementId: rule.id,
                                        quoteId: opt.id,
                                        isLinked,
                                      });
                                    }}
                                    className="w-4 h-4 text-purple-600 rounded border-gray-300"
                                  />
                                  <span className="truncate">{opt.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>
                );
              })}

              {filteredEndorsementRulesAll.length === 0 && (
                <div className="px-6 py-12 text-sm text-gray-400 text-center">
                  <div className="text-gray-300 mb-2">No endorsements match this filter.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {gridTab === 'retro' && (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Assignment Rules
            </div>
            <div className="flex items-center gap-3">
              {[
                { key: 'all', label: 'Apply to All' },
                { key: 'primary', label: 'Apply to Primary' },
                { key: 'excess', label: 'Apply to Excess' },
              ].map(filter => (
                <button
                  key={filter.key}
                  onClick={() => setRulesFilter(prev => (prev === filter.key ? 'any' : filter.key))}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                    rulesFilter === filter.key
                      ? 'border-purple-300 bg-purple-50 text-purple-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_240px] gap-6 px-6 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-gray-200">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Retro Schedule</span>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Applies To</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredRetroRulesAll.map((rule, index) => {
                const isMenuOpen = activeRuleMenu === rule.id;
                return (
                  <div 
                    key={rule.id} 
                    className="grid grid-cols-[1fr_240px] gap-6 px-6 py-4 items-center group hover:bg-purple-50/30 transition-colors duration-150"
                  >
                    <div className="text-sm font-medium text-slate-800 leading-relaxed">
                      {rule.label}
                    </div>
                    <Popover.Root open={isMenuOpen} onOpenChange={(open) => setActiveRuleMenu(open ? rule.id : null)}>
                      <div className="flex flex-col items-end gap-2">
                        <Popover.Trigger asChild>
                          <button
                            className="text-xs font-semibold text-slate-700 border border-gray-300 bg-white rounded-full px-3 py-1.5 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 transition-all duration-150 shadow-sm hover:shadow"
                          >
                            {rule.appliesLabel}
                          </button>
                        </Popover.Trigger>
                        {rule.scope !== 'all' && (
                          <Popover.Trigger asChild>
                            <button className="text-[11px] font-medium text-purple-600 hover:text-purple-700 hover:underline transition-colors">
                              + Add Option
                            </button>
                          </Popover.Trigger>
                        )}
                      </div>
                      <Popover.Portal>
                        <Popover.Content
                          className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                          sideOffset={4}
                          align="end"
                        >
                          <div className="space-y-1">
                            <button
                              onClick={() => {
                                setActiveRuleMenu(null);
                                setTimeout(() => {
                                  applyRetroSelection.mutate({
                                    schedule: rule.schedule,
                                    currentIds: rule.linkedIds,
                                    targetIds: allOptionIds,
                                  });
                                }, 50);
                              }}
                              disabled={applyRetroSelection.isPending}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Options
                            </button>
                            <button
                              onClick={() => {
                                setActiveRuleMenu(null);
                                setTimeout(() => {
                                  applyRetroSelection.mutate({
                                    schedule: rule.schedule,
                                    currentIds: rule.linkedIds,
                                    targetIds: allPrimaryIds,
                                  });
                                }, 50);
                              }}
                              disabled={applyRetroSelection.isPending || allPrimaryIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Primary
                            </button>
                            <button
                              onClick={() => {
                                setActiveRuleMenu(null);
                                setTimeout(() => {
                                  applyRetroSelection.mutate({
                                    schedule: rule.schedule,
                                    currentIds: rule.linkedIds,
                                    targetIds: allExcessIds,
                                  });
                                }, 50);
                              }}
                              disabled={applyRetroSelection.isPending || allExcessIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Excess
                            </button>
                          </div>
                          <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 max-h-48 overflow-y-auto">
                            {allOptions.map(opt => {
                              const isLinked = rule.linkedSet.has(opt.id);
                              const struct = structures.find(s => String(s.id) === opt.id);
                              const isBound = struct?.is_bound;
                              return (
                                <label
                                  key={opt.id}
                                  className={`flex items-center gap-2 text-xs ${
                                    isBound
                                      ? 'text-gray-400 cursor-not-allowed'
                                      : 'text-gray-600 cursor-pointer hover:text-gray-800'
                                  }`}
                                  title={isBound ? 'Cannot modify bound quote' : undefined}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isLinked}
                                    disabled={isBound}
                                    onChange={() => {
                                      // Close popover first, then delay mutation to allow popover to fully close
                                      setActiveRuleMenu(null);
                                      setTimeout(() => {
                                        toggleRetroLink.mutate({
                                          schedule: rule.schedule,
                                          quoteId: opt.id,
                                          isLinked,
                                        });
                                      }, 50);
                                    }}
                                    className="w-4 h-4 text-purple-600 rounded border-gray-300 disabled:opacity-50"
                                  />
                                  <span className="truncate">{opt.name}</span>
                                  {isBound && (
                                    <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>
                );
              })}

              {filteredRetroRulesAll.length === 0 && !showAddRetro && (
                <div className="px-6 py-12 text-sm text-gray-400 text-center">
                  <div className="text-gray-300 mb-2">No retro schedules match this filter.</div>
                </div>
              )}

              {/* Add New Retro Restriction */}
              {showAddRetro ? (
                <div className="px-6 py-4 bg-purple-50/50 border-t border-purple-100">
                  <div className="flex items-start gap-4">
                    <div className="min-w-[200px]">
                      <RetroScheduleEditor
                        schedule={newRetroSchedule}
                        onChange={setNewRetroSchedule}
                        showHeader={false}
                        showEmptyState={false}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-600 block mb-2">Assign to:</label>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {structures.filter(s => !s.is_bound).map(opt => (
                          <label key={opt.id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                            <input
                              type="checkbox"
                              checked={newRetroSelectedQuotes.includes(String(opt.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewRetroSelectedQuotes(prev => [...prev, String(opt.id)]);
                                } else {
                                  setNewRetroSelectedQuotes(prev => prev.filter(id => id !== String(opt.id)));
                                }
                              }}
                              className="w-4 h-4 text-purple-600 rounded border-gray-300"
                            />
                            <span className="truncate">{allOptionLabelMap.get(String(opt.id)) || opt.quote_name || 'Option'}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          if (newRetroSchedule.length > 0 && newRetroSelectedQuotes.length > 0) {
                            applyRetroSelection.mutate({
                              schedule: newRetroSchedule,
                              currentIds: [],
                              targetIds: newRetroSelectedQuotes,
                            });
                            setShowAddRetro(false);
                            setNewRetroSchedule([]);
                            setNewRetroSelectedQuotes([]);
                          }
                        }}
                        disabled={newRetroSchedule.length === 0 || newRetroSelectedQuotes.length === 0 || applyRetroSelection.isPending}
                        className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 disabled:opacity-50"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => { setShowAddRetro(false); setNewRetroSchedule([]); setNewRetroSelectedQuotes([]); }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-6 py-3 border-t border-gray-100">
                  <button
                    onClick={() => setShowAddRetro(true)}
                    className="text-xs font-medium text-purple-600 hover:text-purple-700"
                  >
                    + Add Restriction
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {gridTab === 'policy_term' && (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Assignment Rules
            </div>
            <div className="flex items-center gap-3">
              {[
                { key: 'all', label: 'Apply to All' },
                { key: 'primary', label: 'Apply to Primary' },
                { key: 'excess', label: 'Apply to Excess' },
              ].map(filter => (
                <button
                  key={filter.key}
                  onClick={() => setRulesFilter(prev => (prev === filter.key ? 'any' : filter.key))}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                    rulesFilter === filter.key
                      ? 'border-purple-300 bg-purple-50 text-purple-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_240px] gap-6 px-6 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-gray-200">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Policy Term</span>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Applies To</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredPolicyTermRulesAll.map((rule, index) => {
                const isMenuOpen = activeRuleMenu === rule.id;
                return (
                  <div 
                    key={rule.id} 
                    className="grid grid-cols-[1fr_240px] gap-6 px-6 py-4 items-center group hover:bg-purple-50/30 transition-colors duration-150"
                  >
                    <div className="text-sm font-medium text-slate-800 leading-relaxed">
                      {rule.label}
                    </div>
                    <Popover.Root open={isMenuOpen} onOpenChange={(open) => setActiveRuleMenu(open ? rule.id : null)}>
                      <div className="flex flex-col items-end gap-2">
                        <Popover.Trigger asChild>
                          <button
                            className="text-xs font-semibold text-slate-700 border border-gray-300 bg-white rounded-full px-3 py-1.5 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 transition-all duration-150 shadow-sm hover:shadow"
                          >
                            {rule.appliesLabel}
                          </button>
                        </Popover.Trigger>
                        {rule.scope !== 'all' && (
                          <Popover.Trigger asChild>
                            <button className="text-[11px] font-medium text-purple-600 hover:text-purple-700 hover:underline transition-colors">
                              + Add Option
                            </button>
                          </Popover.Trigger>
                        )}
                      </div>
                      <Popover.Portal>
                        <Popover.Content
                          className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                          sideOffset={4}
                          align="end"
                        >
                          <div className="space-y-1">
                            <button
                              onClick={() => {
                                applyPolicyTermSelection.mutate({
                                  isTbd: rule.isTbd,
                                  currentIds: rule.linkedIds,
                                  targetIds: allOptionIds,
                                });
                                setActiveRuleMenu(null);
                              }}
                              disabled={applyPolicyTermSelection.isPending}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Options
                            </button>
                            <button
                              onClick={() => {
                                applyPolicyTermSelection.mutate({
                                  isTbd: rule.isTbd,
                                  currentIds: rule.linkedIds,
                                  targetIds: allPrimaryIds,
                                });
                                setActiveRuleMenu(null);
                              }}
                              disabled={applyPolicyTermSelection.isPending || allPrimaryIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Primary
                            </button>
                            <button
                              onClick={() => {
                                applyPolicyTermSelection.mutate({
                                  isTbd: rule.isTbd,
                                  currentIds: rule.linkedIds,
                                  targetIds: allExcessIds,
                                });
                                setActiveRuleMenu(null);
                              }}
                              disabled={applyPolicyTermSelection.isPending || allExcessIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Excess
                            </button>
                          </div>
                          <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 max-h-48 overflow-y-auto">
                            {allOptions.map(opt => {
                              const isLinked = rule.linkedSet.has(opt.id);
                              return (
                                <label key={opt.id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                  <input
                                    type="checkbox"
                                    checked={isLinked}
                                    onChange={() => {
                                      // Close popover - prevents position jump during re-render
                                      setActiveRuleMenu(null);
                                      togglePolicyTermLink.mutate({
                                        quoteId: opt.id,
                                        isLinked,
                                        isTbd: rule.isTbd,
                                      });
                                    }}
                                    className="w-4 h-4 text-purple-600 rounded border-gray-300"
                                  />
                                  <span className="truncate">{opt.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>
                );
              })}

              {filteredPolicyTermRulesAll.length === 0 && !showAddPolicyTerm && (
                <div className="px-6 py-12 text-sm text-gray-400 text-center">
                  <div className="text-gray-300 mb-2">No policy terms match this filter.</div>
                </div>
              )}

              {/* Add New Policy Term */}
              {showAddPolicyTerm ? (
                <div className="px-6 py-4 bg-purple-50/50 border-t border-purple-100">
                  <div className="flex items-start gap-4">
                    <div className="w-64">
                      <PolicyTermEditor
                        datesTbd={newPolicyTermDatesTbd}
                        effectiveDate={newPolicyTermEffectiveDate}
                        expirationDate={newPolicyTermExpirationDate}
                        onDatesChange={({ datesTbd, effectiveDate, expirationDate }) => {
                          setNewPolicyTermDatesTbd(datesTbd);
                          setNewPolicyTermEffectiveDate(effectiveDate || '');
                          setNewPolicyTermExpirationDate(expirationDate || '');
                        }}
                        onTbdToggle={(datesTbd) => {
                          setNewPolicyTermDatesTbd(datesTbd);
                          if (datesTbd) {
                            setNewPolicyTermEffectiveDate('');
                            setNewPolicyTermExpirationDate('');
                          }
                        }}
                        compact
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-600 block mb-2">Assign to:</label>
                      <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-2 bg-white">
                        {structures.filter(s => !s.is_bound).map(opt => (
                          <label key={opt.id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer hover:text-gray-800 py-0.5">
                            <input
                              type="checkbox"
                              checked={newPolicyTermSelectedQuotes.includes(String(opt.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewPolicyTermSelectedQuotes(prev => [...prev, String(opt.id)]);
                                } else {
                                  setNewPolicyTermSelectedQuotes(prev => prev.filter(id => id !== String(opt.id)));
                                }
                              }}
                              className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-400"
                            />
                            <span className="truncate">{allOptionLabelMap.get(String(opt.id)) || opt.quote_name || 'Option'}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          if (newPolicyTermSelectedQuotes.length > 0) {
                            applyPolicyTermSelection.mutate({
                              isTbd: newPolicyTermDatesTbd,
                              effectiveDate: newPolicyTermEffectiveDate || null,
                              expirationDate: newPolicyTermExpirationDate || null,
                              currentIds: [],
                              targetIds: newPolicyTermSelectedQuotes,
                            });
                            setShowAddPolicyTerm(false);
                            setNewPolicyTermDatesTbd(false);
                            setNewPolicyTermEffectiveDate('');
                            setNewPolicyTermExpirationDate('');
                            setNewPolicyTermSelectedQuotes([]);
                          }
                        }}
                        disabled={newPolicyTermSelectedQuotes.length === 0 || applyPolicyTermSelection.isPending}
                        className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setShowAddPolicyTerm(false);
                          setNewPolicyTermDatesTbd(false);
                          setNewPolicyTermEffectiveDate('');
                          setNewPolicyTermExpirationDate('');
                          setNewPolicyTermSelectedQuotes([]);
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-6 py-3 border-t border-gray-100">
                  <button
                    onClick={() => setShowAddPolicyTerm(true)}
                    className="text-xs font-medium text-purple-600 hover:text-purple-700"
                  >
                    + Add Term
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {gridTab === 'commission' && (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Assignment Rules
            </div>
            <div className="flex items-center gap-3">
              {[
                { key: 'all', label: 'Apply to All' },
                { key: 'primary', label: 'Apply to Primary' },
                { key: 'excess', label: 'Apply to Excess' },
              ].map(filter => (
                <button
                  key={filter.key}
                  onClick={() => setRulesFilter(prev => (prev === filter.key ? 'any' : filter.key))}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                    rulesFilter === filter.key
                      ? 'border-purple-300 bg-purple-50 text-purple-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-[1fr_240px] gap-6 px-6 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-gray-200">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Brokerage Commission</span>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider text-right">Applies To</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredCommissionRulesAll.map((rule, index) => {
                const isMenuOpen = activeRuleMenu === rule.id;
                return (
                  <div 
                    key={rule.id} 
                    className="grid grid-cols-[1fr_240px] gap-6 px-6 py-4 items-center group hover:bg-purple-50/30 transition-colors duration-150"
                  >
                    <div className="text-sm font-medium text-slate-800 leading-relaxed">
                      {rule.label}
                    </div>
                    <Popover.Root open={isMenuOpen} onOpenChange={(open) => setActiveRuleMenu(open ? rule.id : null)}>
                      <div className="flex flex-col items-end gap-2">
                        <Popover.Trigger asChild>
                          <button
                            className="text-xs font-semibold text-slate-700 border border-gray-300 bg-white rounded-full px-3 py-1.5 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 transition-all duration-150 shadow-sm hover:shadow"
                          >
                            {rule.appliesLabel}
                          </button>
                        </Popover.Trigger>
                        {rule.scope !== 'all' && (
                          <Popover.Trigger asChild>
                            <button className="text-[11px] font-medium text-purple-600 hover:text-purple-700 hover:underline transition-colors">
                              + Add Option
                            </button>
                          </Popover.Trigger>
                        )}
                      </div>
                      <Popover.Portal>
                        <Popover.Content
                          className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                          sideOffset={8}
                          align="end"
                          side="bottom"
                          collisionPadding={16}
                          sticky="partial"
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <div className="space-y-1">
                            <button
                              onClick={() => {
                                const payload = {
                                  commission: rule.commission,
                                  currentIds: rule.linkedIds,
                                  targetIds: allOptionIds,
                                };
                                setActiveRuleMenu(null);
                                // Small delay to let menu close before mutation
                                setTimeout(() => applyCommissionSelection.mutate(payload), 10);
                              }}
                              disabled={applyCommissionSelection.isPending}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Options
                            </button>
                            <button
                              onClick={() => {
                                const payload = {
                                  commission: rule.commission,
                                  currentIds: rule.linkedIds,
                                  targetIds: allPrimaryIds,
                                };
                                setActiveRuleMenu(null);
                                setTimeout(() => applyCommissionSelection.mutate(payload), 10);
                              }}
                              disabled={applyCommissionSelection.isPending || allPrimaryIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Primary
                            </button>
                            <button
                              onClick={() => {
                                const payload = {
                                  commission: rule.commission,
                                  currentIds: rule.linkedIds,
                                  targetIds: allExcessIds,
                                };
                                setActiveRuleMenu(null);
                                setTimeout(() => applyCommissionSelection.mutate(payload), 10);
                              }}
                              disabled={applyCommissionSelection.isPending || allExcessIds.length === 0}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                            >
                              All Excess
                            </button>
                          </div>
                          <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 max-h-48 overflow-y-auto">
                            {allOptions.map(opt => {
                              const isLinked = rule.linkedSet.has(opt.id);
                              return (
                                <label key={opt.id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                  <input
                                    type="checkbox"
                                    checked={isLinked}
                                    onChange={() => {
                                      // Close popover first, then delay mutation to prevent position jump
                                      setActiveRuleMenu(null);
                                      setTimeout(() => {
                                        toggleCommissionLink.mutate({
                                          commission: rule.commission,
                                          quoteId: opt.id,
                                          isLinked,
                                        });
                                      }, 50);
                                    }}
                                    className="w-4 h-4 text-purple-600 rounded border-gray-300"
                                  />
                                  <span className="truncate">{opt.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </div>
                );
              })}

              {filteredCommissionRulesAll.length === 0 && !showAddCommission && (
                <div className="px-6 py-12 text-sm text-gray-400 text-center">
                  <div className="text-gray-300 mb-2">No commissions match this filter.</div>
                </div>
              )}

              {/* Add New Commission Rate */}
              {showAddCommission ? (
                <div className="px-6 py-4 bg-purple-50/50 border-t border-purple-100">
                  <div className="flex items-start gap-6">
                    <div className="flex flex-col gap-3 min-w-[200px]">
                      <CommissionEditor
                        value={newCommissionValue}
                        onChange={setNewCommissionValue}
                        label="Rate:"
                        compact
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setShowAddCommission(false);
                            setNewCommissionValue('');
                            setNewCommissionNetOut('');
                            setNewCommissionSelectedQuotes([]);
                          }
                        }}
                      />
                      <NetOutEditor
                        value={newCommissionNetOut}
                        onChange={setNewCommissionNetOut}
                        maxCommission={parseFloat(newCommissionValue) || 100}
                        placeholder={newCommissionValue || ''}
                        compact
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-xs font-medium text-gray-600 block mb-2">Assign to:</label>
                      <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-2 bg-white">
                        {structures.filter(s => !s.is_bound).map(opt => (
                          <label key={opt.id} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer hover:text-gray-800 py-0.5">
                            <input
                              type="checkbox"
                              checked={newCommissionSelectedQuotes.includes(String(opt.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewCommissionSelectedQuotes(prev => [...prev, String(opt.id)]);
                                } else {
                                  setNewCommissionSelectedQuotes(prev => prev.filter(id => id !== String(opt.id)));
                                }
                              }}
                              className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-400"
                            />
                            <span className="truncate">{allOptionLabelMap.get(String(opt.id)) || opt.quote_name || 'Option'}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          const rate = parseFloat(newCommissionValue);
                          if (!isNaN(rate) && rate >= 0 && rate <= 100 && newCommissionSelectedQuotes.length > 0) {
                            applyCommissionSelection.mutate({
                              commission: rate,
                              currentIds: [],
                              targetIds: newCommissionSelectedQuotes,
                            });
                            setShowAddCommission(false);
                            setNewCommissionValue('');
                            setNewCommissionNetOut('');
                            setNewCommissionSelectedQuotes([]);
                          }
                        }}
                        disabled={!newCommissionValue || newCommissionSelectedQuotes.length === 0 || applyCommissionSelection.isPending}
                        className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => { setShowAddCommission(false); setNewCommissionValue(''); setNewCommissionNetOut(''); setNewCommissionSelectedQuotes([]); }}
                        className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-6 py-3 border-t border-gray-100">
                  <button
                    onClick={() => setShowAddCommission(true)}
                    className="text-xs font-medium text-purple-600 hover:text-purple-700"
                  >
                    + Add Rate
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {gridTab === 'options' && selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-lg rounded-full px-4 py-2 flex items-center gap-3 z-40">
          <span className="text-xs text-gray-500">{selectedIds.length} selected</span>
          <button
            onClick={() => { setManageType('subjectivities'); setSectionVisibility({ all: false, none: false }); setManageSearchTerm(''); setManageAddSearchTerm(''); setShowAddPanel(false); }}
            className="text-xs bg-purple-600 text-white px-3 py-1 rounded-full hover:bg-purple-700"
          >
            Manage Subjectivities
          </button>
          <button
            onClick={() => { setManageType('endorsements'); setSectionVisibility({ all: false, none: false }); setManageSearchTerm(''); setManageAddSearchTerm(''); setShowAddPanel(false); }}
            className="text-xs bg-gray-800 text-white px-3 py-1 rounded-full hover:bg-gray-900"
          >
            Manage Endorsements
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        </div>
      )}

      {manageType && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-[720px] max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">
                    {manageType === 'subjectivities' ? 'Manage Subjectivities' : 'Manage Endorsements'}
                  </h3>
                  {manageType !== 'subjectivities' && (
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedIdStrings.length} selected
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {manageType !== 'subjectivities' && (
                    manageMode === 'review' ? (
                      <button
                        onClick={() => setManageMode('edit')}
                        className="text-xs bg-purple-600 text-white px-3 py-1 rounded-full hover:bg-purple-700"
                      >
                        Edit assignments
                      </button>
                    ) : (
                      <button
                        onClick={() => { setManageMode('review'); setManageSearchTerm(''); setShowAddPanel(false); }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Back to review
                      </button>
                    )
                  )}
                  <button
                    onClick={() => { setManageType(null); setManageSearchTerm(''); setManageAddSearchTerm(''); setConfirmRemoval(null); setManageMode('review'); }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    x
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 overflow-y-auto">
              {(() => {
                if (manageType === 'subjectivities') {
                  const sortedItems = [...subjectivityItems].sort((a, b) => a.label.localeCompare(b.label));
                  const diffItems = sortedItems.filter(item => item.state === 'some');
                  const commonItems = sortedItems.filter(item => item.state === 'all');

                  const handleToggle = (item, event) => {
                    if (applyManageAction.isPending) return;
                    if (item.state === 'some') {
                      if (event?.altKey) {
                        setConfirmRemoval({ type: manageType, item, count: item.presentIds.length });
                        return;
                      }
                      applyManageAction.mutate({ type: manageType, action: 'align', item });
                      return;
                    }
                    if (item.state === 'all') {
                      setConfirmRemoval({ type: manageType, item, count: item.presentIds.length });
                      return;
                    }
                    applyManageAction.mutate({ type: manageType, action: 'add', item });
                  };

                  const getCheckboxTitle = (item) => {
                    if (item.state === 'some') return 'Click to align to all. Option-click to remove from some.';
                    if (item.state === 'all') return 'Click to remove from all.';
                    return 'Click to add to all.';
                  };

                  return (
                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Differences</div>
                        <div className="space-y-1">
                          {diffItems.length === 0 ? (
                            <div className="text-xs text-gray-400">All aligned.</div>
                          ) : (
                            diffItems.map(item => (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 px-2 py-1.5 rounded-md border border-gray-100 border-l-2 border-l-amber-200"
                              >
                                <TriStateCheckbox
                                  state={item.state}
                                  onChange={(event) => handleToggle(item, event)}
                                  disabled={applyManageAction.isPending}
                                  title={getCheckboxTitle(item)}
                                />
                                <span className="text-sm text-gray-800">{item.label}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <button
                          onClick={() => setSectionVisibility(prev => ({ ...prev, all: !prev.all }))}
                          className="flex items-center justify-between w-full text-[11px] uppercase tracking-wide text-gray-400"
                        >
                          <span>Common</span>
                          <span className="text-[11px] text-gray-400">{sectionVisibility.all ? 'Hide' : 'Show'}</span>
                        </button>
                        {sectionVisibility.all && (
                          <div className="mt-2 space-y-1">
                            {commonItems.map(item => (
                              <div
                                key={item.id}
                                className="flex items-center gap-3 px-2 py-1.5 rounded-md border border-gray-100"
                              >
                                <TriStateCheckbox
                                  state={item.state}
                                  onChange={(event) => handleToggle(item, event)}
                                  disabled={applyManageAction.isPending}
                                  title={getCheckboxTitle(item)}
                                />
                                <span className="text-sm text-gray-800">{item.label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-3">
                        <button
                          onClick={() => setShowAddPanel(!showAddPanel)}
                          className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                        >
                          {showAddPanel ? 'Hide add' : 'Add new'}
                        </button>
                        {showAddPanel && (
                          <div className="mt-2 border border-gray-100 rounded-lg p-3 bg-gray-50">
                            <input
                              type="text"
                              placeholder="Search or type subjectivity..."
                              value={manageAddSearchTerm}
                              onChange={(e) => setManageAddSearchTerm(e.target.value)}
                              className="w-full text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-purple-300"
                            />
                            <div className="mt-2 max-h-36 overflow-y-auto space-y-1">
                              {(subjectivityTemplatesData || [])
                                .filter(subj => !manageAddSearchTerm || (subj.text || '').toLowerCase().includes(manageAddSearchTerm.toLowerCase()))
                                .slice(0, 6)
                                .map(subj => (
                                  <button
                                    key={subj.id}
                                    onClick={() => addNewToSelected.mutate({ type: 'subjectivities', payload: subj.text })}
                                    disabled={addNewToSelected.isPending}
                                    className="w-full text-left p-2 rounded border border-gray-100 hover:bg-white text-sm disabled:opacity-50"
                                  >
                                    {subj.text}
                                  </button>
                                ))}
                              {manageAddSearchTerm.trim() && (
                                <button
                                  onClick={() => addNewToSelected.mutate({ type: 'subjectivities', payload: manageAddSearchTerm.trim() })}
                                  disabled={addNewToSelected.isPending}
                                  className="w-full text-left p-2 rounded border border-purple-200 bg-white text-sm text-purple-700 font-medium disabled:opacity-50"
                                >
                                  + Create "{manageAddSearchTerm.trim()}"
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                const items = manageType === 'subjectivities' ? subjectivityItems : endorsementItems;
                const filteredItems = manageMode === 'edit' && manageSearchTerm
                  ? items.filter(item => item.label.toLowerCase().includes(manageSearchTerm.toLowerCase()))
                  : items;
                const diffItems = filteredItems.filter(item => item.state === 'some');
                const allItems = filteredItems.filter(item => item.state === 'all');
                const noneItems = filteredItems.filter(item => item.state === 'none');

                const renderReviewItem = (item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg border border-amber-100 bg-amber-50/50"
                  >
                    <span className="text-sm text-gray-800">{item.label}</span>
                    <span className="text-[10px] text-amber-700 uppercase tracking-wide">Varies</span>
                  </div>
                );

                const renderReadOnlyItem = (item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg border border-gray-100 bg-white"
                  >
                    <span className="text-sm text-gray-800">{item.label}</span>
                  </div>
                );

                const renderEditItem = (item) => {
                  const isDiff = item.state === 'some';
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-3 p-2 rounded-lg border ${
                        isDiff ? 'border-amber-100 bg-amber-50/40 border-l-2 border-l-amber-400' : 'border-gray-100 bg-white'
                      }`}
                    >
                      <span className="text-sm text-gray-800">{item.label}</span>
                      <div className="flex items-center gap-2">
                        {item.state === 'some' && (
                          <>
                            <button
                              onClick={() => applyManageAction.mutate({ type: manageType, action: 'align', item })}
                              className="text-[11px] text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
                              disabled={applyManageAction.isPending}
                            >
                              Align to all
                            </button>
                            <button
                              onClick={() => setConfirmRemoval({
                                type: manageType,
                                item,
                                count: item.presentIds.length,
                              })}
                              className="text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-50"
                              disabled={applyManageAction.isPending}
                            >
                              Remove from all
                            </button>
                          </>
                        )}
                        {item.state === 'all' && (
                          <button
                            onClick={() => setConfirmRemoval({
                              type: manageType,
                              item,
                              count: item.presentIds.length,
                            })}
                            className="text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-50"
                            disabled={applyManageAction.isPending}
                          >
                            Remove from all
                          </button>
                        )}
                        {item.state === 'none' && (
                          <button
                            onClick={() => applyManageAction.mutate({ type: manageType, action: 'add', item })}
                            className="text-[11px] text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
                            disabled={applyManageAction.isPending}
                          >
                            Add to all
                          </button>
                        )}
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="space-y-4">
                    {manageMode === 'edit' && (
                      <input
                        type="text"
                        placeholder={`Search ${manageType === 'subjectivities' ? 'subjectivities' : 'endorsements'}...`}
                        value={manageSearchTerm}
                        onChange={(e) => setManageSearchTerm(e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-purple-300"
                      />
                    )}

                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Differences</div>
                      <div className="space-y-2">
                        {diffItems.length === 0 ? (
                          <div className="text-xs text-gray-400">No differences across selected options.</div>
                        ) : manageMode === 'review' ? (
                          diffItems.map(renderReviewItem)
                        ) : (
                          diffItems.map(renderEditItem)
                        )}
                      </div>
                    </div>

                    <div>
                      <button
                        onClick={() => setSectionVisibility(prev => ({ ...prev, all: !prev.all }))}
                        className="flex items-center justify-between w-full text-[11px] uppercase tracking-wide text-gray-400 mb-2"
                      >
                        <span>On all</span>
                        <span className="text-[11px] text-gray-400">{sectionVisibility.all ? 'Hide' : 'Show'}</span>
                      </button>
                      {sectionVisibility.all && (
                        <div className="space-y-2">
                          {allItems.length === 0 ? (
                            <div className="text-xs text-gray-400">No items on all selected options.</div>
                          ) : manageMode === 'review' ? (
                            allItems.map(renderReadOnlyItem)
                          ) : (
                            allItems.map(renderEditItem)
                          )}
                        </div>
                      )}
                    </div>

                    {manageMode === 'edit' && (
                      <div>
                        <button
                          onClick={() => setSectionVisibility(prev => ({ ...prev, none: !prev.none }))}
                          className="flex items-center justify-between w-full text-[11px] uppercase tracking-wide text-gray-400 mb-2"
                        >
                          <span>On none</span>
                          <span className="text-[11px] text-gray-400">{sectionVisibility.none ? 'Hide' : 'Show'}</span>
                        </button>
                        {sectionVisibility.none && (
                          <div className="space-y-2">
                            {noneItems.length === 0 ? (
                              <div className="text-xs text-gray-400">No items available to add.</div>
                            ) : (
                              noneItems.map(renderEditItem)
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {manageMode === 'edit' && (
                      <div className="pt-4 border-t border-gray-100">
                        <button
                          onClick={() => setShowAddPanel(!showAddPanel)}
                          className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                        >
                          {showAddPanel ? 'Hide add' : 'Add new'}
                        </button>
                        {showAddPanel && (
                          <div className="mt-3 border border-purple-100 rounded-lg p-3 bg-purple-50/40">
                            <div className="text-[11px] text-purple-700 font-semibold uppercase tracking-wide mb-2">Add to selected</div>
                            <input
                              type="text"
                              placeholder={manageType === 'subjectivities' ? 'Search or type subjectivity...' : 'Search endorsements...'}
                              value={manageAddSearchTerm}
                              onChange={(e) => setManageAddSearchTerm(e.target.value)}
                              className="w-full text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-purple-300"
                            />
                            <div className="mt-2 max-h-36 overflow-y-auto space-y-1">
                              {manageType === 'subjectivities' && (
                                <>
                                  {(subjectivityTemplatesData || [])
                                    .filter(subj => !manageAddSearchTerm || (subj.text || '').toLowerCase().includes(manageAddSearchTerm.toLowerCase()))
                                    .slice(0, 6)
                                    .map(subj => (
                                      <button
                                        key={subj.id}
                                        onClick={() => addNewToSelected.mutate({ type: 'subjectivities', payload: subj.text })}
                                        disabled={addNewToSelected.isPending}
                                        className="w-full text-left p-2 rounded border border-gray-100 hover:bg-white text-sm disabled:opacity-50"
                                      >
                                        {subj.text}
                                      </button>
                                    ))}
                                  {manageAddSearchTerm.trim() && (
                                    <button
                                      onClick={() => addNewToSelected.mutate({ type: 'subjectivities', payload: manageAddSearchTerm.trim() })}
                                      disabled={addNewToSelected.isPending}
                                      className="w-full text-left p-2 rounded border border-purple-200 bg-white text-sm text-purple-700 font-medium disabled:opacity-50"
                                    >
                                      + Create "{manageAddSearchTerm.trim()}"
                                    </button>
                                  )}
                                </>
                              )}
                              {manageType === 'endorsements' && (
                                (endorsementLibraryData || [])
                                  .filter(endt => !manageAddSearchTerm || (endt.title || endt.name || '').toLowerCase().includes(manageAddSearchTerm.toLowerCase()))
                                  .slice(0, 8)
                                  .map(endt => (
                                    <button
                                      key={endt.id}
                                      onClick={() => addNewToSelected.mutate({ type: 'endorsements', payload: endt.id })}
                                      disabled={addNewToSelected.isPending}
                                      className="w-full text-left p-2 rounded border border-gray-100 hover:bg-white text-sm disabled:opacity-50"
                                    >
                                      <span className="font-medium text-gray-700">{endt.title || endt.name}</span>
                                      {endt.code && <span className="ml-2 text-xs text-gray-400">{endt.code}</span>}
                                    </button>
                                  ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {confirmRemoval && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-[420px] p-4">
            <div className="text-sm font-semibold text-gray-800 mb-2">Confirm removal</div>
            <p className="text-sm text-gray-600">
              Remove "{confirmRemoval.item.label}" from selected options?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmRemoval(null)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  applyManageAction.mutate({ type: confirmRemoval.type, action: 'remove', item: confirmRemoval.item });
                  setConfirmRemoval(null);
                }}
                disabled={applyManageAction.isPending}
                className="text-sm bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTabContent({ structure, variation, submission, structureId, structures, onMainTabChange, documentHistory = [], summaryScope = 'quote', selectedQuoteId, onSelect, onUpdateOption }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(structure?.notes || '');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [showAllSublimits, setShowAllSublimits] = useState(false);
  const [showMissingSuggestions, setShowMissingSuggestions] = useState(false); // Single toggle for all missing suggestions
  const [showOnlyOurLayer, setShowOnlyOurLayer] = useState(false);
  const [showQuoteOptions, setShowQuoteOptions] = useState(true); // Collapsible quote options in submission mode
  // Expandable card state for C1/C2 pattern
  const [expandedCard, setExpandedCard] = useState(null); // 'subjectivities' | 'endorsements' | 'terms' | 'premium' | 'retro' | 'commission' | null

  // Premium editing state for Quote Options table (submission mode)
  const [isEditingPremiums, setIsEditingPremiums] = useState(false);
  const [premiumDraft, setPremiumDraft] = useState({});
  const quoteOptionsRef = useRef(null);
  const premiumInputRefs = useRef({});

  // Subjectivity editing state
  const [editingSubjId, setEditingSubjId] = useState(null);
  const [editingSubjText, setEditingSubjText] = useState('');
  const [isAddingSubjectivity, setIsAddingSubjectivity] = useState(false);
  const [newSubjectivityText, setNewSubjectivityText] = useState('');
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [librarySearchTerm, setLibrarySearchTerm] = useState('');
  const [appliesToPopoverId, setAppliesToPopoverId] = useState(null); // Track which "applies to" popover is open
  const subjectivitiesCardRef = useRef(null);

  // Endorsement editing state
  const [selectedEndorsementId, setSelectedEndorsementId] = useState(null); // Currently selected endorsement for keyboard nav
  const [editingEndorsementId, setEditingEndorsementId] = useState(null); // Currently editing endorsement (manuscript only)
  const [editingEndorsementText, setEditingEndorsementText] = useState('');
  const [endorsementAppliesToPopoverId, setEndorsementAppliesToPopoverId] = useState(null);
  const [subjectivityAppliesToPopoverId, setSubjectivityAppliesToPopoverId] = useState(null);
  const [isAddingEndorsement, setIsAddingEndorsement] = useState(false);
  const [newEndorsementText, setNewEndorsementText] = useState('');
  const [showEndorsementLibraryPicker, setShowEndorsementLibraryPicker] = useState(false);
  const [endorsementLibrarySearchTerm, setEndorsementLibrarySearchTerm] = useState('');
  const endorsementsCardRef = useRef(null);

  // Retro card ref
  const retroCardRef = useRef(null);

  // Tower card ref
  const towerCardRef = useRef(null);

  // Coverages card ref
  const coveragesCardRef = useRef(null);

  // Click outside to close expanded subjectivities card
  useEffect(() => {
    if (expandedCard !== 'subjectivities') return;

    const handleClickOutside = (e) => {
      if (subjectivitiesCardRef.current && !subjectivitiesCardRef.current.contains(e.target)) {
        // Check if click is inside a popover (they render in portal outside the card)
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit (blur handler saves)
        if (document.activeElement && subjectivitiesCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        setExpandedCard(null);
        setIsAddingSubjectivity(false);
        setShowLibraryPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Click outside to close expanded endorsements card
  useEffect(() => {
    if (expandedCard !== 'endorsements') return;

    const handleClickOutside = (e) => {
      if (endorsementsCardRef.current && !endorsementsCardRef.current.contains(e.target)) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit (blur handler saves)
        if (document.activeElement && endorsementsCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        setExpandedCard(null);
        setSelectedEndorsementId(null);
        setEditingEndorsementId(null);
        setIsAddingEndorsement(false);
        setShowEndorsementLibraryPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Click outside to close expanded retro card
  useEffect(() => {
    if (expandedCard !== 'retro') return;

    const handleClickOutside = (e) => {
      if (retroCardRef.current && !retroCardRef.current.contains(e.target)) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit
        if (document.activeElement && retroCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        setExpandedCard(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Click outside to close expanded tower card
  useEffect(() => {
    if (expandedCard !== 'tower') return;

    const handleClickOutside = (e) => {
      if (towerCardRef.current && !towerCardRef.current.contains(e.target)) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit
        if (document.activeElement && towerCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        setExpandedCard(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Click outside to close expanded coverages card
  useEffect(() => {
    if (expandedCard !== 'coverages') return;

    const handleClickOutside = (e) => {
      if (coveragesCardRef.current && !coveragesCardRef.current.contains(e.target)) {
        const isPopoverClick = e.target.closest('[data-radix-popper-content-wrapper]');
        if (isPopoverClick) return;

        // Trigger blur on active element to save any pending edit
        if (document.activeElement && coveragesCardRef.current.contains(document.activeElement)) {
          document.activeElement.blur();
        }

        setExpandedCard(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedCard]);

  // Escape key to close expanded retro card
  useEffect(() => {
    if (expandedCard !== 'retro') return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Trigger blur on active element to save any pending edit
        if (document.activeElement && retroCardRef.current?.contains(document.activeElement)) {
          document.activeElement.blur();
        }
        setExpandedCard(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedCard]);

  const submissionId = submission?.id;

  const quoteType = getStructurePosition(structure) === 'excess' ? 'excess' : 'primary';
  const peerLabel = quoteType === 'excess' ? 'Excess' : 'Primary';
  const peerIds = useMemo(() => (
    (structures || [])
      .filter(struct => getStructurePosition(struct) === quoteType && String(struct.id) !== String(structureId))
      .map(struct => String(struct.id))
  ), [structures, quoteType, structureId]);

  // All options for "Applies To" popover
  const allOptions = useMemo(() => (
    (structures || []).map(s => ({
      id: String(s.id),
      name: s.quote_name || generateOptionName(s),
      position: getStructurePosition(s),
    }))
  ), [structures]);
  const allOptionIds = useMemo(() => allOptions.map(o => o.id), [allOptions]);
  const allPrimaryIds = useMemo(() => allOptions.filter(o => o.position !== 'excess').map(o => o.id), [allOptions]);
  const allExcessIds = useMemo(() => allOptions.filter(o => o.position === 'excess').map(o => o.id), [allOptions]);

  // Helper to normalize retro schedule for comparison
  const normalizeRetroSchedule = (schedule) => {
    if (!schedule || schedule.length === 0) return '[]';
    const normalized = schedule.map(entry => {
      const obj = { coverage: entry.coverage, retro: entry.retro };
      if (entry.retro === 'date' && entry.date) obj.date = entry.date;
      if (entry.retro === 'custom' && entry.custom_text) obj.custom_text = entry.custom_text;
      return obj;
    }).sort((a, b) => (a.coverage || '').localeCompare(b.coverage || ''));
    return JSON.stringify(normalized);
  };

  // Helper to format retro schedule summary (shows coverage: retro pairs)
  const formatRetroSummary = (schedule) => {
    if (!schedule || schedule.length === 0) return 'Full Prior Acts';

    // Coverage abbreviations
    const covAbbrev = {
      cyber: 'Cyber',
      tech_eo: 'Tech',
      do: 'D&O',
      epl: 'EPL',
      fiduciary: 'Fid',
    };

    // Retro abbreviations
    const retroAbbrev = (entry) => {
      if (entry.retro === 'full_prior_acts') return 'FPA';
      if (entry.retro === 'follow_form') return 'FF';
      if (entry.retro === 'inception') return 'Inc';
      if (entry.retro === 'date') return entry.date || 'Date';
      if (entry.retro === 'custom') return entry.custom_text || 'Custom';
      return entry.retro || '—';
    };

    // Check if all coverages have the same retro
    const uniqueRetros = new Set(schedule.map(e => e.retro));
    if (uniqueRetros.size === 1) {
      const retro = schedule[0].retro;
      if (retro === 'full_prior_acts') return 'Full Prior Acts';
      if (retro === 'follow_form') return 'Follow Form';
      if (retro === 'inception') return 'Inception';
      return retroAbbrev(schedule[0]);
    }

    // Mixed - show each coverage with its retro
    return schedule
      .map(entry => `${covAbbrev[entry.coverage] || entry.coverage}: ${retroAbbrev(entry)}`)
      .join(', ');
  };

  // Premium editing helpers for Quote Options table
  const formatWithCommas = (num) => {
    if (num === null || num === undefined || num === '') return '';
    return Math.round(Number(num)).toLocaleString();
  };

  const parseNumber = (str) => {
    const cleaned = String(str).replace(/[^0-9.-]/g, '');
    return cleaned === '' ? 0 : Number(cleaned);
  };

  const enterPremiumEditMode = (focusId = null) => {
    const initialDraft = {};
    (structures || []).forEach(struct => {
      const tower = struct.tower_json || [];
      const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
      initialDraft[struct.id] = cmaiLayer?.premium || 0;
    });
    setPremiumDraft(initialDraft);
    setIsEditingPremiums(true);
    // Focus specified input after state update
    if (focusId) {
      setTimeout(() => {
        const input = premiumInputRefs.current[focusId];
        if (input) {
          input.focus();
          input.select();
        }
      }, 0);
    }
  };

  const savePremiumsAndExit = () => {
    (structures || []).forEach(struct => {
      const newPremium = premiumDraft[struct.id];
      if (newPremium === undefined) return;

      const tower = struct.tower_json || [];
      const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
      const currentPremium = cmaiLayer?.premium || 0;

      if (newPremium !== currentPremium) {
        const newTower = [...tower];
        const cmaiIdx = newTower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
        if (cmaiIdx >= 0) {
          newTower[cmaiIdx] = { ...newTower[cmaiIdx], premium: newPremium };
          if (onUpdateOption) {
            onUpdateOption(struct.id, { tower_json: newTower });
          }
        }
      }
    });

    setIsEditingPremiums(false);
    setPremiumDraft({});
  };

  const handlePremiumKeyDown = (e, currentId) => {
    const optionIds = allOptions.map(o => o.id);
    const currentIdx = optionIds.indexOf(currentId);

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevId = optionIds[currentIdx - 1];
      if (prevId && premiumInputRefs.current[prevId]) {
        premiumInputRefs.current[prevId].focus();
        premiumInputRefs.current[prevId].select();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const nextId = optionIds[currentIdx + 1];
      if (nextId && premiumInputRefs.current[nextId]) {
        premiumInputRefs.current[nextId].focus();
        premiumInputRefs.current[nextId].select();
      } else if (e.key === 'Enter') {
        savePremiumsAndExit();
      }
    } else if (e.key === 'Escape') {
      setIsEditingPremiums(false);
      setPremiumDraft({});
    }
  };

  const updatePremiumDraft = (structId, value) => {
    setPremiumDraft(prev => ({ ...prev, [structId]: value }));
  };

  // Click outside to save premium edits
  useEffect(() => {
    if (!isEditingPremiums) return;

    const handleClickOutside = (e) => {
      if (quoteOptionsRef.current && !quoteOptionsRef.current.contains(e.target)) {
        savePremiumsAndExit();
      }
    };

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsEditingPremiums(false);
        setPremiumDraft({});
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isEditingPremiums, premiumDraft, structures, onUpdateOption]);

  // Calculate which peers have matching retro config
  const currentRetroNormalized = normalizeRetroSchedule(structure?.retro_schedule);
  const retroMatchingPeerIds = useMemo(() => {
    return (structures || [])
      .filter(s => String(s.id) !== String(structureId))
      .filter(s => normalizeRetroSchedule(s.retro_schedule) === currentRetroNormalized)
      .map(s => String(s.id));
  }, [structures, structureId, currentRetroNormalized]);

  // Submission mode: compute variations across all quotes
  const allQuoteTerms = useMemo(() => {
    if (!structures || !allOptions) return [];
    return allOptions.map(opt => {
      const s = structures.find(st => String(st.id) === String(opt.id));
      const v = s?.variations?.[0];
      const datesTbd = v?.dates_tbd || false;
      const effDate = v?.effective_date_override || s?.effective_date || submission?.effective_date;
      const expDate = v?.expiration_date_override || s?.expiration_date || submission?.expiration_date;
      return {
        quoteId: opt.id,
        quoteName: opt.name,
        datesTbd,
        effDate,
        expDate,
        key: datesTbd ? 'TBD' : `${effDate || ''}-${expDate || ''}`,
      };
    });
  }, [structures, allOptions, submission]);

  const termVariationCount = useMemo(() => {
    const uniqueKeys = new Set(allQuoteTerms.map(t => t.key));
    return uniqueKeys.size;
  }, [allQuoteTerms]);

  const allQuoteRetros = useMemo(() => {
    if (!structures || !allOptions) return [];
    return allOptions.map(opt => {
      const s = structures.find(st => String(st.id) === String(opt.id));
      return {
        quoteId: opt.id,
        quoteName: opt.name,
        retroSchedule: s?.retro_schedule || [],
        retroNotes: s?.retro_notes || '',
        key: normalizeRetroSchedule(s?.retro_schedule),
      };
    });
  }, [structures, allOptions]);

  const retroVariationCount = useMemo(() => {
    const uniqueKeys = new Set(allQuoteRetros.map(r => r.key));
    return uniqueKeys.size;
  }, [allQuoteRetros]);

  const allQuoteCommissions = useMemo(() => {
    if (!structures || !allOptions) return [];
    return allOptions.map(opt => {
      const s = structures.find(st => String(st.id) === String(opt.id));
      const v = s?.variations?.[0];
      // Match quote mode: variation.commission_override ?? 15
      const rate = v?.commission_override ?? 15;
      return {
        quoteId: opt.id,
        quoteName: opt.name,
        commissionRate: rate,
        key: String(rate),
      };
    });
  }, [structures, allOptions]);

  const commissionVariationCount = useMemo(() => {
    const uniqueKeys = new Set(allQuoteCommissions.map(c => c.key));
    return uniqueKeys.size;
  }, [allQuoteCommissions]);

  // Grouped variations for KPI cards (for showing "value (X/Y)" badges)
  const termVariationGroups = useMemo(() => {
    const groups = {};
    allQuoteTerms.forEach(t => {
      if (!groups[t.key]) {
        groups[t.key] = {
          key: t.key,
          label: t.datesTbd ? 'TBD' : `${formatDate(t.effDate)} - ${formatDate(t.expDate)}`,
          count: 0,
        };
      }
      groups[t.key].count++;
    });
    // Sort by count descending (most common first)
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [allQuoteTerms]);

  const retroVariationGroups = useMemo(() => {
    const groups = {};
    allQuoteRetros.forEach(r => {
      if (!groups[r.key]) {
        groups[r.key] = {
          key: r.key,
          label: formatRetroSummary(r.retroSchedule),
          schedule: r.retroSchedule, // Keep raw schedule for detailed rendering
          count: 0,
        };
      }
      groups[r.key].count++;
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [allQuoteRetros]);

  const commissionVariationGroups = useMemo(() => {
    const groups = {};
    allQuoteCommissions.forEach(c => {
      if (!groups[c.key]) {
        groups[c.key] = {
          key: c.key,
          label: `${c.commissionRate}%`,
          count: 0,
        };
      }
      groups[c.key].count++;
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [allQuoteCommissions]);

  // State for retro "Apply to" popover
  const [showRetroApplyPopover, setShowRetroApplyPopover] = useState(false);

  // Fetch endorsements
  const { data: endorsementsData } = useQuery({
    queryKey: ['quote-endorsements', structureId],
    queryFn: () => getQuoteEndorsements(structureId).then(r => r.data),
    enabled: !!structureId,
  });
  const { data: submissionEndorsementsData } = useQuery({
    queryKey: ['submissionEndorsements', submissionId],
    queryFn: () => getSubmissionEndorsements(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });
  // Sort endorsements: required first, automatic next, manual last
  const endorsements = [...(endorsementsData?.endorsements || [])].sort((a, b) => {
    const aRequired = a.category === 'required' || a.is_required ? 2 : 0;
    const bRequired = b.category === 'required' || b.is_required ? 2 : 0;
    const aAuto = a.is_auto || a.auto_attach_rules || a.attachment_type === 'auto' ? 1 : 0;
    const bAuto = b.is_auto || b.auto_attach_rules || b.attachment_type === 'auto' ? 1 : 0;
    return (bRequired + bAuto) - (aRequired + aAuto);
  });
  const standardEndorsements = endorsements.filter(e => e.is_standard !== false);
  const nonStandardEndorsements = endorsements.filter(e => e.is_standard === false);

  // Fetch subjectivities
  const { data: subjectivitiesData } = useQuery({
    queryKey: ['quote-subjectivities', structureId],
    queryFn: () => getQuoteSubjectivities(structureId).then(r => r.data),
    enabled: !!structureId,
  });
  const { data: submissionSubjectivitiesData = [] } = useQuery({
    queryKey: ['submissionSubjectivities', submissionId],
    queryFn: () => getSubmissionSubjectivities(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });
  // Sort required subjectivities to top
  const subjectivities = [...(subjectivitiesData || [])].sort((a, b) => {
    const aRequired = a.is_required || a.category === 'required' ? 1 : 0;
    const bRequired = b.is_required || b.category === 'required' ? 1 : 0;
    return bRequired - aRequired;
  });
  const pendingSubjectivities = subjectivities.filter(s => s.status === 'pending' || !s.status).length;
  const receivedSubjectivities = subjectivities.filter(s => s.status === 'received').length;

  // Create lookup map for quote_ids from submission-level data
  // Filter to only include quote IDs that still exist (exclude deleted quotes)
  const existingQuoteIdSet = useMemo(() => new Set(allOptionIds), [allOptionIds]);
  const subjectivityQuoteIdsMap = useMemo(() => {
    const map = new Map();
    (submissionSubjectivitiesData || []).forEach(subj => {
      const id = String(subj.id || '');
      if (id) {
        const allIds = parseQuoteIds(subj.quote_ids);
        // Filter to only include IDs that exist in current structures
        const existingIds = allIds.filter(qid => existingQuoteIdSet.has(String(qid)));
        map.set(id, existingIds);
      }
    });
    return map;
  }, [submissionSubjectivitiesData, existingQuoteIdSet]);

  const currentSubjectivityItems = useMemo(() => (
    subjectivities.map(subj => {
      const id = String(subj.subjectivity_id || subj.template_id || subj.id || '');
      const rawId = subj.id;
      // Look up quote_ids from submission-level data using the raw id
      const quoteIds = subjectivityQuoteIdsMap.get(String(rawId)) || [];
      return {
        id,
        rawId,
        label: subj.subjectivity_text || subj.text || subj.title || 'Subjectivity',
        status: subj.status,
        quoteIds,
      };
    }).filter(item => item.id)
  ), [subjectivities, subjectivityQuoteIdsMap]);

  const endorsementQuoteIdsMap = useMemo(() => {
    const map = new Map();
    const submissionEndorsements = submissionEndorsementsData?.endorsements || [];
    submissionEndorsements.forEach(endt => {
      const id = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
      if (id) {
        const allIds = parseQuoteIds(endt.quote_ids);
        const existingIds = allIds.filter(qid => existingQuoteIdSet.has(String(qid)));
        map.set(id, existingIds);
      }
    });
    return map;
  }, [submissionEndorsementsData, existingQuoteIdSet]);

  // Maps for Quote Options summary table (submission mode)
  const subjectivitiesByQuote = useMemo(() => {
    const map = new Map();
    (submissionSubjectivitiesData || []).forEach(subj => {
      const label = subj.text || subj.subjectivity_text || subj.title || 'Subjectivity';
      const quoteIds = parseQuoteIds(subj.quote_ids);
      quoteIds.forEach(id => {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({ id: subj.id, label, status: subj.status });
      });
    });
    return map;
  }, [submissionSubjectivitiesData]);

  const endorsementsByQuote = useMemo(() => {
    const map = new Map();
    const endorsementList = submissionEndorsementsData?.endorsements || [];
    endorsementList.forEach(endt => {
      const label = endt.title || endt.code || 'Endorsement';
      const quoteIds = parseQuoteIds(endt.quote_ids);
      quoteIds.forEach(id => {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({ id: endt.endorsement_id, label, code: endt.code });
      });
    });
    return map;
  }, [submissionEndorsementsData]);

  const currentEndorsementItems = useMemo(() => (
    endorsements.map(endt => {
      const id = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
      const quoteIds = endorsementQuoteIdsMap.get(id) || [];
      return {
        id,
        rawId: endt.endorsement_id || endt.document_library_id || endt.id,
        label: endt.title || endt.name || endt.code || 'Endorsement',
        category: endt.category,
        isRequired: endt.category === 'required' || endt.is_required,
        isAuto: endt.is_auto || endt.auto_attach_rules || endt.attachment_type === 'auto',
        isManuscript: endt.category === 'manuscript',
        quoteIds,
      };
    }).filter(item => item.id)
  ), [endorsements, endorsementQuoteIdsMap]);

  // Type icon helper for endorsements
  const getEndorsementIcon = (item) => {
    if (item.isRequired) return <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>;
    if (item.isAuto) return <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
    return <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
  };

  // Compute peer union - all items that exist on ANY same-position sibling
  const peerSubjectivityUnion = useMemo(() => {
    const union = new Map(); // id -> label
    (submissionSubjectivitiesData || []).forEach(subj => {
      const id = String(subj.id || '');
      if (!id) return;
      const label = subj.text || subj.subjectivity_text || subj.title || 'Subjectivity';
      const quoteIds = parseQuoteIds(subj.quote_ids).map(val => String(val));
      // Check if this subjectivity is on any peer (same-position sibling)
      const isOnPeer = peerIds.some(peerId => quoteIds.includes(peerId));
      if (isOnPeer) {
        union.set(id, label);
      }
    });
    return union;
  }, [submissionSubjectivitiesData, peerIds]);

  const peerEndorsementUnion = useMemo(() => {
    const union = new Map(); // id -> label
    const submissionEndorsements = submissionEndorsementsData?.endorsements || [];
    submissionEndorsements.forEach(endt => {
      const id = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
      if (!id) return;
      const label = endt.title || endt.name || endt.code || 'Endorsement';
      const quoteIds = parseQuoteIds(endt.quote_ids).map(val => String(val));
      // Check if this endorsement is on any peer (same-position sibling)
      const isOnPeer = peerIds.some(peerId => quoteIds.includes(peerId));
      if (isOnPeer) {
        union.set(id, label);
      }
    });
    return union;
  }, [submissionEndorsementsData, peerIds]);

  const currentSubjectivityIdSet = useMemo(() => (
    new Set(currentSubjectivityItems.map(item => item.id))
  ), [currentSubjectivityItems]);

  const currentEndorsementIdSet = useMemo(() => (
    new Set(currentEndorsementItems.map(item => item.id))
  ), [currentEndorsementItems]);

  // Missing = in peer union but not on this option
  const missingSubjectivities = useMemo(() => {
    const missing = [];
    peerSubjectivityUnion.forEach((label, id) => {
      if (!currentSubjectivityIdSet.has(id)) {
        missing.push({ id, label });
      }
    });
    return missing;
  }, [peerSubjectivityUnion, currentSubjectivityIdSet]);

  const missingEndorsements = useMemo(() => {
    const missing = [];
    peerEndorsementUnion.forEach((label, id) => {
      if (!currentEndorsementIdSet.has(id)) {
        missing.push({ id, label });
      }
    });
    return missing;
  }, [peerEndorsementUnion, currentEndorsementIdSet]);

  // Extra = on this option but not in peer union (unique to this option)
  const uniqueSubjectivities = useMemo(() => (
    currentSubjectivityItems.filter(item => !peerSubjectivityUnion.has(item.id))
  ), [currentSubjectivityItems, peerSubjectivityUnion]);

  const uniqueEndorsements = useMemo(() => (
    currentEndorsementItems.filter(item => !peerEndorsementUnion.has(item.id))
  ), [currentEndorsementItems, peerEndorsementUnion]);

  // Aligned = on this option AND in peer union
  const alignedSubjectivities = useMemo(() => (
    currentSubjectivityItems.filter(item => peerSubjectivityUnion.has(item.id))
  ), [currentSubjectivityItems, peerSubjectivityUnion]);

  const alignedEndorsements = useMemo(() => (
    currentEndorsementItems.filter(item => peerEndorsementUnion.has(item.id))
  ), [currentEndorsementItems, peerEndorsementUnion]);

  // All submission endorsements for submission scope view
  // Filter out orphaned items (no quotes linked) since they serve no purpose
  const allSubmissionEndorsements = useMemo(() => {
    const endorsements = submissionEndorsementsData?.endorsements || [];
    return endorsements.map(endt => {
      const id = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
      const allIds = parseQuoteIds(endt.quote_ids);
      const existingIds = allIds.filter(qid => existingQuoteIdSet.has(String(qid)));
      return {
        id,
        rawId: endt.endorsement_id || endt.document_library_id || endt.id,
        label: endt.title || endt.name || endt.code || 'Endorsement',
        category: endt.category,
        isRequired: endt.category === 'required' || endt.is_required,
        isAuto: endt.is_auto || endt.auto_attach_rules || endt.attachment_type === 'auto',
        isManuscript: endt.category === 'manuscript',
        quoteIds: existingIds,
      };
    }).filter(item => item.id && item.quoteIds.length > 0);
  }, [submissionEndorsementsData, existingQuoteIdSet]);

  // All submission subjectivities for submission scope view
  // Filter out orphaned items (no quotes linked) since they serve no purpose
  const allSubmissionSubjectivities = useMemo(() => {
    const subjectivities = submissionSubjectivitiesData || [];
    return subjectivities.map(subj => {
      const id = String(subj.id || '');
      const allIds = parseQuoteIds(subj.quote_ids);
      const existingIds = allIds.filter(qid => existingQuoteIdSet.has(String(qid)));
      return {
        id,
        rawId: subj.id,
        label: subj.text || subj.subjectivity_text || subj.title || 'Subjectivity',
        status: subj.status || 'pending',
        isRequired: subj.is_required || subj.category === 'required',
        quoteIds: existingIds,
      };
    }).filter(item => item.id && item.quoteIds.length > 0);
  }, [submissionSubjectivitiesData, existingQuoteIdSet]);

  const restoreSubjectivity = useMutation({
    mutationFn: (subjectivityId) => linkSubjectivityToQuote(structureId, subjectivityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  const restoreEndorsement = useMutation({
    mutationFn: (endorsementId) => linkEndorsementToQuote(structureId, endorsementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
    },
  });

  const unlinkEndorsementMutation = useMutation({
    mutationFn: (endorsementId) => unlinkEndorsementFromQuote(structureId, endorsementId),
    onMutate: async (endorsementId) => {
      await queryClient.cancelQueries({ queryKey: ['quote-endorsements', structureId] });
      const previous = queryClient.getQueryData(['quote-endorsements', structureId]);
      queryClient.setQueryData(['quote-endorsements', structureId], (old) => {
        if (!old?.endorsements) return old;
        return {
          ...old,
          endorsements: old.endorsements.filter(e => {
            const id = String(e.endorsement_id || e.document_library_id || e.id || '');
            return id !== String(endorsementId);
          }),
        };
      });
      return { previous };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['quote-endorsements', structureId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
    },
  });

  // Update subjectivity status mutation (for inline editing in expanded card)
  const updateSubjectivityStatusMutation = useMutation({
    mutationFn: ({ subjectivityId, status }) => updateSubjectivity(subjectivityId, { status }),
    onMutate: async ({ subjectivityId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['quote-subjectivities', structureId] });
      const previous = queryClient.getQueryData(['quote-subjectivities', structureId]);
      queryClient.setQueryData(['quote-subjectivities', structureId], (old) =>
        (old || []).map(s => s.id === subjectivityId ? { ...s, status } : s)
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['quote-subjectivities', structureId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  // Subjectivity templates (library) - only fetch when picker is open
  const { data: subjectivityTemplatesData } = useQuery({
    queryKey: ['subjectivity-templates'],
    queryFn: () => getSubjectivityTemplates().then(r => r.data),
    enabled: showLibraryPicker,
  });
  const subjectivityTemplates = subjectivityTemplatesData || [];

  // Filter out already-linked templates
  const linkedTemplateIds = new Set(subjectivities.map(s => s.subjectivity_id || s.template_id));
  const availableTemplates = subjectivityTemplates.filter(t => !linkedTemplateIds.has(t.id));
  const filteredTemplates = availableTemplates.filter(t =>
    !librarySearchTerm || (t.text || t.subjectivity_text || '')?.toLowerCase().includes(librarySearchTerm.toLowerCase())
  );

  // Endorsement library - only fetch when picker is open
  const { data: endorsementLibraryData } = useQuery({
    queryKey: ['endorsement-library'],
    queryFn: () => getDocumentLibraryEntries({ document_type: 'endorsement', status: 'active' }).then(r => r.data),
    enabled: showEndorsementLibraryPicker,
  });
  const endorsementLibrary = endorsementLibraryData || [];

  // Filter out already-linked endorsements
  const linkedEndorsementIds = new Set(endorsements.map(e => e.endorsement_id || e.document_library_id));
  const availableLibraryEndorsements = endorsementLibrary.filter(e => !linkedEndorsementIds.has(e.id));
  const filteredLibraryEndorsements = availableLibraryEndorsements.filter(e =>
    !endorsementLibrarySearchTerm || (e.title || e.code || '')?.toLowerCase().includes(endorsementLibrarySearchTerm.toLowerCase())
  );

  // Count how many OTHER quotes share this subjectivity (excludes current quote)
  const getSharedQuoteCount = (item) => {
    if (!item?.quoteIds || !Array.isArray(item.quoteIds)) return 0;
    return item.quoteIds.filter(id => String(id) !== String(structureId)).length;
  };

  // Update subjectivity text mutation
  const updateSubjectivityTextMutation = useMutation({
    mutationFn: ({ subjectivityId, text }) => updateSubjectivity(subjectivityId, { text }),
    onMutate: async ({ subjectivityId, text }) => {
      await queryClient.cancelQueries({ queryKey: ['quote-subjectivities', structureId] });
      const previous = queryClient.getQueryData(['quote-subjectivities', structureId]);
      queryClient.setQueryData(['quote-subjectivities', structureId], (old) =>
        (old || []).map(s => s.id === subjectivityId ? { ...s, text, subjectivity_text: text } : s)
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['quote-subjectivities', structureId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  // Create new custom subjectivity
  const createSubjectivityMutation = useMutation({
    mutationFn: (text) => createSubjectivity(submissionId, { text, quote_ids: [structureId] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      setNewSubjectivityText('');
      setIsAddingSubjectivity(false);
    },
  });

  // Link template from library
  const linkTemplateSubjectivity = useMutation({
    mutationFn: (templateId) => linkSubjectivityToQuote(structureId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      setShowLibraryPicker(false);
      setLibrarySearchTerm('');
    },
  });

  // Unlink subjectivity from this quote
  const unlinkSubjectivityMutation = useMutation({
    mutationFn: (subjectivityId) => unlinkSubjectivityFromQuote(structureId, subjectivityId),
    onMutate: async (subjectivityId) => {
      await queryClient.cancelQueries({ queryKey: ['quote-subjectivities', structureId] });
      const previous = queryClient.getQueryData(['quote-subjectivities', structureId]);
      queryClient.setQueryData(['quote-subjectivities', structureId], (old) =>
        (old || []).filter(s => s.id !== subjectivityId)
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['quote-subjectivities', structureId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  // Toggle subjectivity link to any quote (for "Applies To" popover)
  const toggleSubjectivityLinkMutation = useMutation({
    mutationFn: async ({ subjectivityId, quoteId, isLinked }) => {
      if (isLinked) {
        return unlinkSubjectivityFromQuote(quoteId, subjectivityId);
      } else {
        return linkSubjectivityToQuote(quoteId, subjectivityId);
      }
    },
    onMutate: async ({ subjectivityId, quoteId, isLinked }) => {
      await queryClient.cancelQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      const previousData = queryClient.getQueryData(['submissionSubjectivities', submissionId]);
      queryClient.setQueryData(['submissionSubjectivities', submissionId], (old) => {
        if (!old) return old;
        return old.map(subj => {
          if (String(subj.id) !== String(subjectivityId)) return subj;
          const currentIds = parseQuoteIds(subj.quote_ids);
          let newIds;
          if (isLinked) {
            newIds = currentIds.filter(id => String(id) !== String(quoteId));
          } else {
            newIds = [...currentIds, String(quoteId)];
          }
          return { ...subj, quote_ids: newIds };
        });
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['submissionSubjectivities', submissionId], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      // Invalidate all quote-subjectivities queries for immediate refresh
      allOptionIds.forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', id] });
      });
    },
  });

  // Bulk apply subjectivity to a set of quotes
  // Auto-deletes when unlinking from all quotes (no orphaned data)
  const applySubjectivitySelectionMutation = useMutation({
    mutationFn: async ({ subjectivityId, currentIds, targetIds }) => {
      // If targetIds is empty, delete the subjectivity entirely
      if (targetIds.length === 0) {
        return deleteSubjectivity(subjectivityId);
      }
      const currentSet = new Set(currentIds.map(String));
      const targetSet = new Set(targetIds.map(String));
      const toLink = targetIds.filter(id => !currentSet.has(String(id)));
      const toUnlink = currentIds.filter(id => !targetSet.has(String(id)));
      await Promise.all([
        ...toLink.map(id => linkSubjectivityToQuote(id, subjectivityId)),
        ...toUnlink.map(id => unlinkSubjectivityFromQuote(id, subjectivityId)),
      ]);
    },
    onMutate: async ({ subjectivityId, targetIds }) => {
      // Optimistic update for instant UI feedback
      await queryClient.cancelQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      const previousData = queryClient.getQueryData(['submissionSubjectivities', submissionId]);
      queryClient.setQueryData(['submissionSubjectivities', submissionId], (old) => {
        if (!old) return old;
        // If deleting (targetIds empty), remove from list
        if (targetIds.length === 0) {
          return old.filter(subj => String(subj.id) !== String(subjectivityId));
        }
        return old.map(subj => {
          if (String(subj.id) !== String(subjectivityId)) return subj;
          return { ...subj, quote_ids: targetIds };
        });
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['submissionSubjectivities', submissionId], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      allOptionIds.forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', id] });
      });
    },
  });

  // Helper: cycle status
  const cycleStatus = (current) => {
    const order = ['pending', 'received', 'waived'];
    const idx = order.indexOf(current || 'pending');
    return order[(idx + 1) % order.length];
  };

  // Toggle endorsement link to any quote (for "Applies To" popover)
  const toggleEndorsementLinkMutation = useMutation({
    mutationFn: async ({ endorsementId, quoteId, isLinked }) => {
      if (isLinked) {
        return unlinkEndorsementFromQuote(quoteId, endorsementId);
      } else {
        return linkEndorsementToQuote(quoteId, endorsementId);
      }
    },
    onMutate: async ({ endorsementId, quoteId, isLinked }) => {
      await queryClient.cancelQueries({ queryKey: ['submissionEndorsements', submissionId] });
      const previousData = queryClient.getQueryData(['submissionEndorsements', submissionId]);
      queryClient.setQueryData(['submissionEndorsements', submissionId], (old) => {
        if (!old?.endorsements) return old;
        return {
          ...old,
          endorsements: old.endorsements.map(endt => {
            const endtId = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
            if (endtId !== String(endorsementId)) return endt;
            const currentIds = parseQuoteIds(endt.quote_ids);
            let newIds;
            if (isLinked) {
              newIds = currentIds.filter(id => String(id) !== String(quoteId));
            } else {
              newIds = [...currentIds, String(quoteId)];
            }
            return { ...endt, quote_ids: newIds };
          }),
        };
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['submissionEndorsements', submissionId], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      allOptionIds.forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['quote-endorsements', id] });
      });
    },
  });

  // Bulk apply endorsement to a set of quotes
  // Auto-deletes when unlinking from all quotes (no orphaned data)
  const applyEndorsementSelectionMutation = useMutation({
    mutationFn: async ({ endorsementId, currentIds, targetIds }) => {
      // If targetIds is empty, delete the endorsement entirely
      if (targetIds.length === 0) {
        return deleteEndorsement(endorsementId);
      }
      const currentSet = new Set(currentIds.map(String));
      const targetSet = new Set(targetIds.map(String));
      const toLink = targetIds.filter(id => !currentSet.has(String(id)));
      const toUnlink = currentIds.filter(id => !targetSet.has(String(id)));
      await Promise.all([
        ...toLink.map(id => linkEndorsementToQuote(id, endorsementId)),
        ...toUnlink.map(id => unlinkEndorsementFromQuote(id, endorsementId)),
      ]);
    },
    onMutate: async ({ endorsementId, targetIds }) => {
      await queryClient.cancelQueries({ queryKey: ['submissionEndorsements', submissionId] });
      const previousData = queryClient.getQueryData(['submissionEndorsements', submissionId]);
      queryClient.setQueryData(['submissionEndorsements', submissionId], (old) => {
        if (!old?.endorsements) return old;
        // If deleting (targetIds empty), remove from list
        if (targetIds.length === 0) {
          return {
            ...old,
            endorsements: old.endorsements.filter(endt => {
              const endtId = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
              return endtId !== String(endorsementId);
            }),
          };
        }
        return {
          ...old,
          endorsements: old.endorsements.map(endt => {
            const endtId = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
            if (endtId !== String(endorsementId)) return endt;
            return { ...endt, quote_ids: targetIds };
          }),
        };
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['submissionEndorsements', submissionId], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
      allOptionIds.forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['quote-endorsements', id] });
      });
    },
  });

  // Mutation: Update manuscript endorsement text
  const updateManuscriptEndorsementMutation = useMutation({
    mutationFn: ({ endorsementId, text }) => updateDocumentLibraryEntry(endorsementId, { title: text }),
    onMutate: async ({ endorsementId, text }) => {
      await queryClient.cancelQueries({ queryKey: ['quote-endorsements', structureId] });
      const previousData = queryClient.getQueryData(['quote-endorsements', structureId]);
      queryClient.setQueryData(['quote-endorsements', structureId], (old) => {
        if (!old?.endorsements) return old;
        return {
          ...old,
          endorsements: old.endorsements.map(endt => {
            const endtId = String(endt.endorsement_id || endt.document_library_id || endt.id || '');
            if (endtId !== String(endorsementId)) return endt;
            return { ...endt, title: text };
          }),
        };
      });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['quote-endorsements', structureId], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['endorsement-library'] });
    },
  });

  // Mutation: Apply current retro schedule to other quotes
  const applyRetroToQuotesMutation = useMutation({
    mutationFn: async (targetQuoteIds) => {
      const schedule = structure?.retro_schedule || [];
      await Promise.all(
        targetQuoteIds.map(id => updateQuoteOption(id, { retro_schedule: schedule }))
      );
    },
    onMutate: async (targetQuoteIds) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      const schedule = structure?.retro_schedule || [];
      queryClient.setQueryData(['structures', submissionId], (old) =>
        (old || []).map(s => {
          if (targetQuoteIds.includes(String(s.id))) {
            return { ...s, retro_schedule: schedule };
          }
          return s;
        })
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['structures', submissionId], ctx.previous);
    },
    onSuccess: () => {
      setShowRetroApplyPopover(false);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  // Mutation: Create new manuscript endorsement and link to current quote
  const createManuscriptEndorsementMutation = useMutation({
    mutationFn: async (title) => {
      const code = `MS-${Date.now().toString(36).toUpperCase()}`;
      const result = await createDocumentLibraryEntry({
        code,
        document_type: 'endorsement',
        title,
        category: 'manuscript',
        status: 'active',
      });
      if (result.data?.id) {
        await linkEndorsementToQuote(structureId, result.data.id);
      }
      return result;
    },
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: ['quote-endorsements', structureId] });
      const previous = queryClient.getQueryData(['quote-endorsements', structureId]);
      const tempId = `temp-ms-${Date.now()}`;
      const optimisticEntry = {
        id: tempId,
        endorsement_id: tempId,
        title,
        code: 'MS-...',
        category: 'manuscript',
      };
      queryClient.setQueryData(['quote-endorsements', structureId], (old) => ({
        ...old,
        endorsements: [...(old?.endorsements || []), optimisticEntry],
      }));
      setNewEndorsementText('');
      setIsAddingEndorsement(false);
      return { previous };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['quote-endorsements', structureId], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['endorsement-library'] });
    },
  });

  // Mutation: Link endorsement from library to current quote
  const linkEndorsementFromLibraryMutation = useMutation({
    mutationFn: (endorsementId) => linkEndorsementToQuote(structureId, endorsementId),
    onMutate: async (endorsementId) => {
      await queryClient.cancelQueries({ queryKey: ['quote-endorsements', structureId] });
      const previous = queryClient.getQueryData(['quote-endorsements', structureId]);
      return { previous };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['quote-endorsements', structureId], ctx.previous);
      }
    },
    onSuccess: () => {
      setShowEndorsementLibraryPicker(false);
      setEndorsementLibrarySearchTerm('');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
    },
  });

  // Helper: count OTHER quotes sharing this endorsement (excludes current quote)
  const getEndorsementSharedQuoteCount = (item) => {
    if (!item?.quoteIds || !Array.isArray(item.quoteIds)) return 0;
    return item.quoteIds.filter(id => String(id) !== String(structureId)).length;
  };

  // Calculate tower info
  const tower = structure?.tower_json || [];
  const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
  const ourLimit = cmaiLayer?.limit || tower[0]?.limit || 0;
  const totalProgramLimit = tower.reduce((sum, l) => sum + (l.limit || 0), 0);
  // For bound quotes, use sold_premium; otherwise use tower premium
  const premium = structure?.sold_premium || cmaiLayer?.premium || 0;
  const commission = variation?.commission_override ?? 15;
  
  // Check if CMAI is in a quota share layer
  const cmaiQs = cmaiLayer?.quota_share;
  const limitDisplay = cmaiQs ? `${formatCompact(ourLimit)} po ${formatCompact(cmaiQs)}` : formatCompact(ourLimit);
  
  // For excess quotes: calculate attachment and get SIR
  const isExcess = quoteType === 'excess';
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  const attachment = isExcess && cmaiIdx >= 0 ? calculateAttachment(tower, cmaiIdx) : 0;
  const primaryLayer = tower[0];
  const retention = primaryLayer?.retention || structure?.primary_retention || 25000;
  const retentionOrAttachment = isExcess ? attachment : retention;
  const retentionLabel = isExcess ? 'Attachment' : 'Retention';
  const sirDisplay = isExcess && retention ? ` (SIR ${formatCompact(retention)})` : '';

  // Get coverage exceptions - different logic for primary vs excess
  const coverageExceptions = (() => {
    if (isExcess) {
      // Excess quotes use structure.sublimits array
      const excessSublimits = structure?.sublimits || [];
      return excessSublimits
        .filter(cov => cov.treatment === 'no_coverage' || cov.treatment === 'exclude' || cov.our_limit != null)
        .map(cov => ({
          id: cov.coverage,
          label: cov.coverage,
          value: cov.treatment === 'no_coverage' || cov.treatment === 'exclude' ? 'Excluded' : cov.our_limit,
          isExcluded: cov.treatment === 'no_coverage' || cov.treatment === 'exclude'
        }))
        .slice(0, 3);
    } else {
      // Primary quotes use structure.coverages.sublimit_coverages
      const coverages = structure?.coverages || {};
      const sublimits = coverages.sublimit_coverages || {};
      return SUBLIMIT_COVERAGES
        .filter(cov => sublimits[cov.id] !== undefined && sublimits[cov.id] !== cov.default)
        .map(cov => ({ id: cov.id, label: cov.label, value: sublimits[cov.id] }))
        .slice(0, 3);
    }
  })();

  // Get all sublimits with their current values (or defaults)
  const allSublimits = (() => {
    if (isExcess) {
      // Excess quotes - show from structure.sublimits
      const excessSublimits = structure?.sublimits || [];
      return excessSublimits.map(cov => {
        const isExcluded = cov.treatment === 'no_coverage' || cov.treatment === 'exclude';
        const hasCustom = cov.our_limit != null;
        return {
          id: cov.coverage,
          label: cov.coverage,
          value: isExcluded ? 'Excluded' : (cov.our_limit ?? cov.primary_limit),
          defaultValue: cov.primary_limit,
          isException: isExcluded || hasCustom,
          isExcluded
        };
      });
    } else {
      // Primary quotes - use SUBLIMIT_COVERAGES with defaults
      const coverages = structure?.coverages || {};
      const sublimits = coverages.sublimit_coverages || {};
      return SUBLIMIT_COVERAGES.map(cov => {
        const value = sublimits[cov.id] !== undefined ? sublimits[cov.id] : cov.default;
        const isException = sublimits[cov.id] !== undefined && sublimits[cov.id] !== cov.default;
        return { id: cov.id, label: cov.label, value, defaultValue: cov.default, isException };
      });
    }
  })();

  // Status config
  const statusConfig = {
    draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
    indication: { label: 'Indication', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
    quoted: { label: 'Quoted', bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
    bound: { label: 'Bound', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  };
  const status = structure?.is_bound ? statusConfig.bound : (statusConfig[structure?.status] || statusConfig.draft);

  // Format status text using same logic as grid
  const formatStatusText = (missing, extra, peerCount) => {
    const missingCount = missing.length;
    const extraCount = extra.length;

    if (peerCount === 0) {
      return { text: '', tone: '' }; // Don't show "No peers to compare"
    }
    if (missingCount === 0 && extraCount === 0) {
      return { text: `Aligned with ${peerLabel} peers`, tone: 'text-green-600' };
    }
    if (missingCount > 0 && extraCount === 0) {
      return { text: `${missingCount} missing from peers`, tone: 'text-amber-600' };
    }
    if (missingCount === 0 && extraCount > 0) {
      return { text: `${extraCount} extra (not on peers)`, tone: 'text-purple-600' };
    }
    return { text: `Mixed +${extraCount}, −${missingCount}`, tone: 'text-amber-600' };
  };

  const endorsementStatus = formatStatusText(missingEndorsements, uniqueEndorsements, peerIds.length);
  const subjectivityStatus = formatStatusText(missingSubjectivities, uniqueSubjectivities, peerIds.length);
  const endorsementsEmpty = missingEndorsements.length === 0 && uniqueEndorsements.length === 0 && alignedEndorsements.length === 0;
  const subjectivitiesEmpty = missingSubjectivities.length === 0 && uniqueSubjectivities.length === 0 && alignedSubjectivities.length === 0;

  // BIND READINESS checks
  const bindReadinessChecks = useMemo(() => {
    const checks = [];

    // Premium set
    const hasPremium = premium > 0;
    checks.push({
      id: 'premium',
      label: hasPremium ? 'Premium set' : 'Premium not set',
      passed: hasPremium,
      severity: hasPremium ? 'success' : 'error',
    });

    // Effective date
    const effectiveDate = structure?.effective_date || submission?.effective_date;
    checks.push({
      id: 'effective_date',
      label: effectiveDate ? 'Effective date set' : 'Effective date missing',
      passed: !!effectiveDate,
      severity: effectiveDate ? 'success' : 'error',
    });

    // Pending subjectivities
    if (pendingSubjectivities > 0) {
      checks.push({
        id: 'subjectivities',
        label: `${pendingSubjectivities} pending ${pendingSubjectivities === 1 ? 'subjectivity' : 'subjectivities'}`,
        passed: false,
        severity: 'warning',
        action: () => onMainTabChange?.('subjectivities'),
      });
    } else if (subjectivities.length > 0) {
      checks.push({
        id: 'subjectivities',
        label: 'All subjectivities received',
        passed: true,
        severity: 'success',
      });
    }

    // Tower validation - quota share
    const towerLayers = structure?.tower_json || [];
    const layersWithQS = towerLayers.filter(l => l.quota_share !== undefined && l.quota_share !== null);
    if (layersWithQS.length > 0) {
      // Group by attachment point to check quota share per layer
      const totalQS = layersWithQS.reduce((sum, l) => sum + (parseFloat(l.quota_share) || 0), 0);
      const expectedQS = layersWithQS.length * 100; // Each layer should sum to 100%
      const qsValid = Math.abs(totalQS - expectedQS) < 0.01;
      if (!qsValid) {
        checks.push({
          id: 'quota_share',
          label: 'Quota share incomplete',
          passed: false,
          severity: 'warning',
          action: () => onMainTabChange?.('tower'),
        });
      }
    }

    return checks;
  }, [premium, structure, submission, pendingSubjectivities, subjectivities.length, onMainTabChange]);

  const hasBindBlockers = bindReadinessChecks.some(c => !c.passed && c.severity === 'error');
  const hasBindWarnings = bindReadinessChecks.some(c => !c.passed && c.severity === 'warning');

  // CROSS-OPTION DRIFT items
  const crossOptionDrift = useMemo(() => {
    if (peerIds.length === 0) return [];

    const items = [];

    // Missing endorsements (peers have, we don't)
    missingEndorsements.slice(0, 3).forEach(endt => {
      items.push({
        id: `missing-endt-${endt.id}`,
        type: 'missing',
        category: 'endorsement',
        label: `Missing "${endt.label}"`,
        description: `${peerLabel} peers have this endorsement`,
        action: () => onMainTabChange?.('endorsements'),
      });
    });
    if (missingEndorsements.length > 3) {
      items.push({
        id: 'missing-endt-more',
        type: 'missing',
        category: 'endorsement',
        label: `+${missingEndorsements.length - 3} more missing endorsements`,
        action: () => onMainTabChange?.('endorsements'),
      });
    }

    // Extra endorsements (we have, peers don't)
    uniqueEndorsements.slice(0, 2).forEach(endt => {
      items.push({
        id: `extra-endt-${endt.id}`,
        type: 'extra',
        category: 'endorsement',
        label: `Has "${endt.label}"`,
        description: `Not on ${peerLabel} peers`,
        action: () => onMainTabChange?.('endorsements'),
      });
    });
    if (uniqueEndorsements.length > 2) {
      items.push({
        id: 'extra-endt-more',
        type: 'extra',
        category: 'endorsement',
        label: `+${uniqueEndorsements.length - 2} more unique endorsements`,
        action: () => onMainTabChange?.('endorsements'),
      });
    }

    // Missing subjectivities
    missingSubjectivities.slice(0, 2).forEach(subj => {
      items.push({
        id: `missing-subj-${subj.id}`,
        type: 'missing',
        category: 'subjectivity',
        label: `Missing "${subj.label}"`,
        description: `${peerLabel} peers have this subjectivity`,
        action: () => onMainTabChange?.('subjectivities'),
      });
    });
    if (missingSubjectivities.length > 2) {
      items.push({
        id: 'missing-subj-more',
        type: 'missing',
        category: 'subjectivity',
        label: `+${missingSubjectivities.length - 2} more missing subjectivities`,
        action: () => onMainTabChange?.('subjectivities'),
      });
    }

    // Extra subjectivities
    uniqueSubjectivities.slice(0, 2).forEach(subj => {
      items.push({
        id: `extra-subj-${subj.id}`,
        type: 'extra',
        category: 'subjectivity',
        label: `Has "${subj.label}"`,
        description: `Not on ${peerLabel} peers`,
        action: () => onMainTabChange?.('subjectivities'),
      });
    });
    if (uniqueSubjectivities.length > 2) {
      items.push({
        id: 'extra-subj-more',
        type: 'extra',
        category: 'subjectivity',
        label: `+${uniqueSubjectivities.length - 2} more unique subjectivities`,
        action: () => onMainTabChange?.('subjectivities'),
      });
    }

    return items;
  }, [peerIds, peerLabel, missingEndorsements, uniqueEndorsements, missingSubjectivities, uniqueSubjectivities, onMainTabChange]);

  return (
    <div className="space-y-6">
      {/* KPI Row - Policy Terms, Retro, Premium (quote mode only), Commission */}
      <div className={`grid gap-3 ${summaryScope === 'submission' ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}`}>
        {/* Policy Terms - expands right (cols 1-2) when editing */}
        {(() => {
          const datesTbd = variation?.dates_tbd || false;
          const effDate = variation?.effective_date_override || structure?.effective_date || submission?.effective_date;
          const expDate = variation?.expiration_date_override || structure?.expiration_date || submission?.expiration_date;
          const isExpanded = expandedCard === 'terms';
          const allSameTerm = termVariationCount === 1;
          return (
            <div
              className={`bg-white rounded-lg border transition-all ${
                isExpanded
                  ? 'lg:col-span-2 border-purple-300 ring-1 ring-purple-100'
                  : 'border-gray-200 hover:border-gray-300 cursor-pointer'
              } ${expandedCard === 'retro' ? 'hidden lg:hidden' : ''}`}
              onClick={() => !isExpanded && setExpandedCard('terms')}
            >
              {/* Header - bold with border when in submission mode with variations */}
              {summaryScope === 'submission' && !isExpanded && termVariationGroups.length > 1 ? (
                <>
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 rounded-t-lg">
                    <h3 className="text-xs font-bold text-gray-500 uppercase">Policy Term</h3>
                  </div>
                  <div className="px-4 py-3 space-y-1.5">
                    {termVariationGroups.map((group) => (
                      <div key={group.key} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-700">{group.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                          {group.count}/{allQuoteTerms.length}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className={`flex items-center justify-between ${isExpanded ? 'px-4 py-2 border-b border-gray-100' : 'px-3 py-3'}`}>
                  <div className={isExpanded ? '' : 'w-full text-center'}>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Policy Term</div>
                    {!isExpanded && (
                      summaryScope === 'submission' ? (
                        /* Single value - centered with All badge */
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-semibold text-gray-800">{termVariationGroups[0]?.label}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                            All
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-gray-800 truncate">
                          {datesTbd ? 'TBD' : `${formatDate(effDate)} - ${formatDate(expDate)}`}
                        </div>
                      )
                    )}
                  </div>
                {isExpanded && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedCard(null); }}
                    className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                  >
                    Done
                  </button>
                )}
              </div>
              )}
              {isExpanded && (
                <div className="p-4">
                  {summaryScope === 'submission' ? (
                    /* Submission mode - show per-quote terms */
                    <div className="space-y-2">
                      {allQuoteTerms.map(qt => (
                        <div key={qt.quoteId} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                          <span className="text-gray-600 truncate">{qt.quoteName}</span>
                          <span className="text-gray-800 font-medium">
                            {qt.datesTbd ? 'TBD' : `${formatDate(qt.effDate)} - ${formatDate(qt.expDate)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <TermsPanel structure={structure} variation={variation} submission={submission} submissionId={submission?.id} />
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Retro Dates - expands left (cols 1-2) when editing */}
        <div
          ref={retroCardRef}
          className={`bg-white rounded-lg border transition-all ${
            expandedCard === 'retro'
              ? 'lg:col-span-2 border-purple-300 ring-1 ring-purple-100'
              : 'border-gray-200 hover:border-gray-300 cursor-pointer'
          } ${expandedCard === 'terms' ? 'hidden lg:hidden' : ''}`}
          onClick={() => expandedCard !== 'retro' && setExpandedCard('retro')}
        >
          {/* Header - bold with border when in submission mode with multiple variations */}
          {summaryScope === 'submission' && expandedCard !== 'retro' && retroVariationGroups.length > 1 ? (
            <>
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 rounded-t-lg">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Retro</h3>
              </div>
              <div className="px-4 py-3 divide-y divide-gray-100">
                {retroVariationGroups.map((group) => {
                  const schedule = group.schedule || [];
                  const uniqueRetros = new Set(schedule.map(e => e.retro));
                  const isSimple = schedule.length === 0 || uniqueRetros.size === 1;

                  return (
                    <div key={group.key} className="flex items-start justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                      {isSimple ? (
                        <span className="text-sm text-gray-700">{group.label}</span>
                      ) : (
                        <div className="text-xs text-gray-700 space-y-0.5">
                          {schedule.map(entry => {
                            const covLabel = { cyber: 'Cyber', tech_eo: 'Tech E&O', do: 'D&O', epl: 'EPL', fiduciary: 'Fiduciary' }[entry.coverage] || entry.coverage;
                            const retroLabel = entry.retro === 'full_prior_acts' ? 'FPA' : entry.retro === 'inception' ? 'Inception' : entry.retro === 'follow_form' ? 'FF' : entry.retro;
                            return <div key={entry.coverage}><span className="text-gray-400">{covLabel}:</span> {retroLabel}</div>;
                          })}
                        </div>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 shrink-0">
                        {group.count}/{allQuoteRetros.length}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
          <div className={`flex items-center justify-between ${expandedCard === 'retro' ? 'px-4 py-2 border-b border-gray-100' : 'px-3 py-3'}`}>
            <div className={expandedCard === 'retro' ? '' : 'w-full text-center'}>
              <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Retro</div>
              {expandedCard !== 'retro' && (
                summaryScope === 'submission' ? (
                  /* Single retro config - centered */
                  <div className="flex flex-col items-center gap-1">
                    {(() => {
                      const group = retroVariationGroups[0];
                      const schedule = group?.schedule || [];
                      const uniqueRetros = new Set(schedule.map(e => e.retro));
                      const isSimple = schedule.length === 0 || uniqueRetros.size === 1;

                      if (isSimple) {
                        return <span className="text-sm font-semibold text-gray-800">{group?.label}</span>;
                      }
                      // Complex - show each coverage on its own line
                      return (
                        <div className="text-xs text-gray-700 space-y-0.5">
                          {schedule.map(entry => {
                            const covLabel = { cyber: 'Cyber', tech_eo: 'Tech E&O', do: 'D&O', epl: 'EPL', fiduciary: 'Fiduciary' }[entry.coverage] || entry.coverage;
                            const retroLabel = entry.retro === 'full_prior_acts' ? 'FPA' : entry.retro === 'inception' ? 'Inception' : entry.retro === 'follow_form' ? 'FF' : entry.retro;
                            return <div key={entry.coverage}><span className="text-gray-500">{covLabel}:</span> {retroLabel}</div>;
                          })}
                        </div>
                      );
                    })()}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                      All
                    </span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-gray-800">
                    {formatRetroSummary(structure?.retro_schedule)}
                  </div>
                )
              )}
            </div>
            {expandedCard === 'retro' && (
              <div className="flex items-center gap-2">
                {/* Applies To popover - only in quote mode (not submission mode) */}
                {summaryScope !== 'submission' && (
                <Popover.Root open={showRetroApplyPopover} onOpenChange={setShowRetroApplyPopover}>
                  <Popover.Trigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                        retroMatchingPeerIds.length > 0
                          ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                          : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
                      }`}
                    >
                      {retroMatchingPeerIds.length > 0 ? `On ${retroMatchingPeerIds.length + 1} quotes` : 'Only here'}
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                      sideOffset={4}
                      align="end"
                    >
                      <div className="text-xs font-medium text-gray-500 mb-2 px-1">Apply to</div>
                      {/* Quick select options */}
                      {(() => {
                        const otherIds = allOptionIds.filter(id => id !== String(structureId));
                        const otherPrimaryIds = allPrimaryIds.filter(id => id !== String(structureId));
                        const otherExcessIds = allExcessIds.filter(id => id !== String(structureId));
                        const isAllSelected = otherIds.every(id => retroMatchingPeerIds.includes(id));
                        const isAllPrimarySelected = otherPrimaryIds.length > 0 && otherPrimaryIds.every(id => retroMatchingPeerIds.includes(id));
                        const isAllExcessSelected = otherExcessIds.length > 0 && otherExcessIds.every(id => retroMatchingPeerIds.includes(id));
                        return (
                          <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
                            <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
                              <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (!isAllSelected) {
                                    applyRetroToQuotesMutation.mutate(otherIds);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                disabled={isAllSelected}
                              />
                              <span>All Options</span>
                            </label>
                            {otherPrimaryIds.length > 0 && (
                              <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={isAllPrimarySelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (!isAllPrimarySelected) {
                                      applyRetroToQuotesMutation.mutate(otherPrimaryIds);
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                  disabled={isAllPrimarySelected}
                                />
                                <span>All Primary</span>
                              </label>
                            )}
                            {otherExcessIds.length > 0 && (
                              <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={isAllExcessSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (!isAllExcessSelected) {
                                      applyRetroToQuotesMutation.mutate(otherExcessIds);
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                  disabled={isAllExcessSelected}
                                />
                                <span>All Excess</span>
                              </label>
                            )}
                          </div>
                        );
                      })()}
                      {/* Individual quotes */}
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {allOptions.filter(opt => opt.id !== String(structureId)).map(opt => {
                          const isMatching = retroMatchingPeerIds.includes(opt.id);
                          return (
                            <label
                              key={opt.id}
                              className={`flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600`}
                            >
                              <input
                                type="checkbox"
                                checked={isMatching}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (!isMatching) {
                                    applyRetroToQuotesMutation.mutate([opt.id]);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                disabled={isMatching}
                              />
                              <span className="truncate">{opt.name}</span>
                              {isMatching && <span className="text-[9px] text-green-500 ml-auto">Matching</span>}
                            </label>
                          );
                        })}
                      </div>
                      <Popover.Arrow className="fill-white" />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedCard(null); }}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                >
                  Done
                </button>
              </div>
            )}
          </div>
          )}
          {expandedCard === 'retro' && (
            <div className="p-4">
              {summaryScope === 'submission' ? (
                /* Submission mode - show per-quote retros */
                <div className="space-y-2">
                  {allQuoteRetros.map(qr => (
                    <div key={qr.quoteId} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                      <span className="text-gray-600 truncate">{qr.quoteName}</span>
                      <span className="text-gray-800 font-medium">{formatRetroSummary(qr.retroSchedule)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <RetroPanel structure={structure} submissionId={submission?.id} />
              )}
            </div>
          )}
        </div>

        {/* Premium - View only, shows sold (tower) + technical (rater) if different */}
        {/* Hidden in submission mode - premiums are shown in Quote Options table */}
        {summaryScope !== 'submission' && (() => {
          const sold = premium; // Tower CMAI premium = what we're charging
          const technical = variation?.technical_premium || 0; // From rater
          const hasTechnical = technical > 0 && Math.abs(sold - technical) > 1;
          const diff = technical > 0 ? ((sold - technical) / technical) * 100 : 0;
          return (
            <div className={`bg-gray-50 rounded-lg px-4 py-3 border border-gray-200 ${
              expandedCard === 'commission' ? 'hidden lg:hidden' : ''
            }`}>
              {hasTechnical ? (
                <div className="flex items-end justify-between">
                  <div className="text-left">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Technical</div>
                    <div className="text-base font-bold text-gray-800">{formatCurrency(technical)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Sold</div>
                    <div className="text-base font-bold text-gray-800">{formatCurrency(sold)}</div>
                  </div>
                  <div className={`text-sm font-semibold text-right ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {diff >= 0 ? '+' : ''}{diff.toFixed(0)}%
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Premium</div>
                  <div className="text-base font-bold text-gray-800">{formatCurrency(sold)}</div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Commission - expands left (cols 3-4) when editing */}
        <div
          className={`bg-white rounded-lg border transition-all ${
            expandedCard === 'commission'
              ? 'lg:col-span-2 border-purple-300 ring-1 ring-purple-100'
              : 'border-gray-200 hover:border-gray-300 cursor-pointer'
          }`}
          onClick={() => expandedCard !== 'commission' && setExpandedCard('commission')}
        >
          {/* Header - styled like endorsements when in submission mode with variations */}
          {summaryScope === 'submission' && expandedCard !== 'commission' && commissionVariationGroups.length > 1 ? (
            <>
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 rounded-t-lg">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Commission</h3>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                {commissionVariationGroups.map((group) => (
                  <div key={group.key} className="flex items-center justify-between gap-2">
                    <span className="text-base text-gray-700">{group.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                      {group.count}/{allQuoteCommissions.length}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
          <div className={`flex items-center justify-between ${expandedCard === 'commission' ? 'px-4 py-2 border-b border-gray-100' : 'px-3 py-3'}`}>
            <div className={expandedCard === 'commission' ? '' : 'w-full text-center'}>
              <div className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Commission</div>
              {expandedCard !== 'commission' && (
                summaryScope === 'submission' ? (
                  /* Single commission value - centered with All badge */
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-base font-semibold text-gray-800">{commissionVariationGroups[0]?.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                      All
                    </span>
                  </div>
                ) : (
                  <div className="text-base font-bold text-gray-800">{commission}%</div>
                )
              )}
            </div>
            {expandedCard === 'commission' && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedCard(null); }}
                className="text-xs text-purple-600 hover:text-purple-700 font-medium"
              >
                Done
              </button>
            )}
          </div>
          )}
          {expandedCard === 'commission' && (
            <div className="p-4">
              {summaryScope === 'submission' ? (
                /* Submission mode - show per-quote commissions */
                <div className="space-y-2">
                  {allQuoteCommissions.map(qc => (
                    <div key={qc.quoteId} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                      <span className="text-gray-600 truncate">{qc.quoteName}</span>
                      <span className="text-gray-800 font-medium">
                        {qc.commissionRate}%{qc.isNetOfCommission ? ' (Net)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <CommissionPanel structure={structure} variation={variation} submissionId={submission?.id} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quote Options Summary (Submission Mode) - Collapsible with editable premiums */}
      {summaryScope === 'submission' && (
        <div ref={quoteOptionsRef} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          {/* Header row with column labels */}
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center">
            <button
              onClick={() => setShowQuoteOptions(!showQuoteOptions)}
              className="flex items-center flex-1 text-left hover:opacity-80"
            >
              <svg
                className={`w-4 h-4 text-gray-400 mr-2 transition-transform ${showQuoteOptions ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-xs font-bold text-gray-500 uppercase">Quote Options</span>
            </button>
            <span className="text-[10px] text-gray-400 uppercase w-24 text-right mr-4">Premium</span>
            <span className="text-[10px] text-gray-400 uppercase w-12 text-center">Subjs</span>
            <span className="text-[10px] text-gray-400 uppercase w-12 text-center">Endts</span>
            <span className="text-[10px] text-gray-400 uppercase w-16 text-center">Status</span>
          </div>
          {showQuoteOptions && (
            <div className="divide-y divide-gray-100">
              {allOptions.map((opt) => {
                const struct = structures?.find(s => String(s.id) === String(opt.id));
                const optTower = struct?.tower_json || [];
                const cmaiLayer = optTower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
                // For bound quotes, use sold_premium
                const optPremium = struct?.sold_premium || cmaiLayer?.premium || 0;
                const draftPremium = premiumDraft[opt.id] ?? optPremium;
                const optStatus = struct?.is_bound ? 'bound' : (struct?.status || 'draft');
                const isExcess = getStructurePosition(struct) === 'excess';
                const subjList = subjectivitiesByQuote.get(String(opt.id)) || [];
                const endtList = endorsementsByQuote.get(String(opt.id)) || [];
                return (
                  <div
                    key={opt.id}
                    className="flex items-center px-4 py-2 transition-colors hover:bg-gray-50"
                  >
                    <div
                      className="flex items-center gap-2 flex-1 pl-6 cursor-pointer"
                      onClick={() => onSelect(opt.id)}
                    >
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        isExcess
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isExcess ? 'XS' : 'PRI'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {opt.name}
                      </span>
                    </div>
                    {/* Premium - editable */}
                    <div className="w-24 text-right mr-4">
                      {isEditingPremiums ? (
                        <input
                          ref={el => premiumInputRefs.current[opt.id] = el}
                          type="text"
                          value={formatWithCommas(draftPremium)}
                          onChange={(e) => {
                            const val = parseNumber(e.target.value);
                            updatePremiumDraft(opt.id, val);
                          }}
                          onKeyDown={(e) => handlePremiumKeyDown(e, opt.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-300 text-sm"
                        />
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); enterPremiumEditMode(opt.id); }}
                          className="text-sm font-semibold text-green-600 hover:text-green-700 hover:underline"
                        >
                          {formatCurrency(optPremium)}
                        </button>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full w-12 text-center ${
                      subjList.length > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {subjList.length}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full w-12 text-center ${
                      endtList.length > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {endtList.length}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium w-16 text-center ${
                      optStatus === 'issued' ? 'bg-green-100 text-green-700' :
                      optStatus === 'approved' ? 'bg-blue-100 text-blue-700' :
                      optStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {optStatus.charAt(0).toUpperCase() + optStatus.slice(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tower Position & Structure Preview (Quote Mode only) */}
      {summaryScope !== 'submission' && (() => {
        // Determine if excess by checking structure.position OR if any layer has attachment > 0
        const structureIsExcess = structure?.position === 'excess';
        const hasStoredAttachments = tower.some(l => (l.attachment || 0) > 0);
        const showAsExcess = structureIsExcess || hasStoredAttachments;

        // Calculate attachments for each layer (tower is ordered bottom-to-top: index 0 = ground layer)
        const towerWithAttachments = tower.map((layer, idx) => ({
          ...layer,
          calculatedAttachment: layer.attachment ?? calculateAttachment(tower, idx)
        }));

        // Sort by attachment descending (highest layer first) for display
        const sortedTower = [...towerWithAttachments].sort((a, b) => b.calculatedAttachment - a.calculatedAttachment);

        // Find our layer (CMAI)
        const cmaiIdx = sortedTower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
        const cmaiLayer = cmaiIdx >= 0 ? sortedTower[cmaiIdx] : null;
        const cmaiAttachment = cmaiLayer?.calculatedAttachment || attachment;

        // For visual: layers above and below ours in the sorted (top-to-bottom) display
        const layersAbove = cmaiIdx > 0 ? sortedTower.slice(0, cmaiIdx) : [];
        const layersBelow = cmaiIdx >= 0 ? sortedTower.slice(cmaiIdx + 1) : [];

        const isEditingTower = expandedCard === 'tower';

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Tower Position Card - hidden when editing */}
            {!isEditingTower && (
              <div className="lg:col-span-3 border border-gray-200 rounded-lg bg-white p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Tower Position
                </h3>
                <div className="relative">
                  {/* Dashed vertical line on left */}
                  <div className="absolute left-0 top-0 bottom-0 w-4 flex flex-col items-center">
                    <div className="flex-1 border-l-2 border-dashed border-gray-300" />
                  </div>
                  <div className="pl-6 space-y-1">
                    {/* Show layers above ours */}
                    {!showOnlyOurLayer && showAsExcess && layersAbove.map((layer, idx) => {
                      const layerAttachment = layer.calculatedAttachment || layer.attachment || 0;
                      return (
                        <div key={idx} className="bg-gray-100 border border-gray-200 rounded py-2 px-3 text-center">
                          <div className="text-sm font-semibold text-gray-700 flex items-center justify-center gap-1">
                            <span>{formatCompact(layer.limit)}</span>
                            {layerAttachment > 0 && (
                              <span className="text-xs opacity-75">xs {formatCompact(layerAttachment)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Our Layer */}
                    <div className="bg-purple-600 text-white rounded py-2.5 px-4 text-center shadow-md">
                      <div className="text-sm font-bold flex items-center justify-center gap-1">
                        <span>{formatCompact(ourLimit)}</span>
                        {showAsExcess && cmaiAttachment > 0 && (
                          <span className="text-xs opacity-80">xs {formatCompact(cmaiAttachment)}</span>
                        )}
                      </div>
                    </div>

                    {/* Show underlying layers for excess */}
                    {!showOnlyOurLayer && showAsExcess && layersBelow.map((layer, idx) => {
                      const layerAttachment = layer.calculatedAttachment || layer.attachment || 0;
                      return (
                        <div key={idx} className="bg-gray-100 border border-gray-200 rounded py-2 px-3 text-center">
                          <div className="text-sm font-semibold text-gray-700 flex items-center justify-center gap-1">
                            <span>{formatCompact(layer.limit)}</span>
                            {layerAttachment > 0 ? (
                              <span className="text-xs opacity-75">xs {formatCompact(layerAttachment)}</span>
                            ) : (
                              <span className="text-[11px] font-semibold text-gray-600">Primary</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Retention bar - always shown unless collapsed */}
                    {!showOnlyOurLayer && retention > 0 && (
                      <div className="bg-gray-50 border border-gray-200 rounded py-1 px-3 text-center">
                        <div className="text-[10px] text-gray-500 uppercase">Retention {formatCompact(retention)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tower Structure Table - expands to full width when editing */}
            <div
              ref={towerCardRef}
              onClick={() => !isEditingTower && setExpandedCard('tower')}
              className={`border rounded-lg bg-white overflow-hidden transition-all ${
              isEditingTower
                ? 'lg:col-span-12 ring-1 ring-purple-100 border-purple-300'
                : 'lg:col-span-9 border-gray-200 hover:border-gray-300 cursor-pointer'
            }`}>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Tower Structure</h3>
                  {!isEditingTower && sortedTower.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowOnlyOurLayer(!showOnlyOurLayer); }}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        showOnlyOurLayer
                          ? 'bg-purple-100 border-purple-300 text-purple-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      {showOnlyOurLayer ? 'Show All' : 'Ours Only'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="text-gray-500">Our Premium: </span>
                    <span className="text-green-600 font-semibold">{formatCurrency(premium)}</span>
                  </div>
                  {isEditingTower ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedCard(null); }}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      Done
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedCard('tower'); }}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {isEditingTower ? (
                /* Full TowerEditor when editing */
                <div className="p-4">
                  <TowerEditor
                    quote={structure}
                    onSave={(data) => {
                      onUpdateOption?.(structureId, data);
                      setExpandedCard(null);
                    }}
                    isPending={false}
                    embedded={true}
                  />
                </div>
              ) : (
                /* Preview table */
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Carrier</th>
                      <th className="px-4 py-2 text-center font-semibold">Limit</th>
                      <th className="px-4 py-2 text-center font-semibold">{showAsExcess ? 'Attach' : 'Retention'}</th>
                      <th className="px-4 py-2 text-right font-semibold">Premium</th>
                      <th className="px-4 py-2 text-right font-semibold">RPM</th>
                      <th className="px-4 py-2 text-right font-semibold">ILF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedTower
                      .filter(layer => !showOnlyOurLayer || layer.carrier?.toUpperCase().includes('CMAI'))
                      .map((layer, idx) => {
                      const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
                      // For CMAI, fall back to structure.sold_premium for bound quotes
                      const layerPremium = isCMAI ? (layer.premium || structure?.sold_premium || 0) : (layer.premium || 0);
                      const layerRpm = layer.limit ? Math.round(layerPremium / (layer.limit / 1_000_000)) : null;
                      // For ILF, use CMAI premium as base
                      const basePremium = cmaiLayer?.premium || tower[0]?.premium || 1;
                      const ilf = basePremium > 0 ? Math.round((layerPremium / basePremium) * 100) : null;

                      return (
                        <tr key={idx} className={isCMAI ? 'bg-purple-50' : ''}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={isCMAI ? 'text-purple-700 font-medium' : 'text-gray-700'}>
                                {layer.carrier || 'TBD'}
                              </span>
                              {isCMAI && (
                                <span className="text-[10px] bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                                  Ours
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">{formatCompact(layer.limit)}</td>
                          <td className="px-4 py-3 text-center text-gray-500">
                            {/* Primary layer (attachment=0) shows retention, others show attachment */}
                            {layer.calculatedAttachment === 0
                              ? formatCompact(layer.retention || retention)
                              : `xs ${formatCompact(layer.calculatedAttachment)}`}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-green-600">
                            {layerPremium ? formatCurrency(layerPremium) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {layerRpm ? `$${layerRpm.toLocaleString()}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {isCMAI ? '100%' : (ilf !== null ? `${ilf}%` : '—')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}

      {/* Grid Header with toggle */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">
          {summaryScope === 'submission' ? 'Submission Details' : 'Quote Details'}
        </h3>
        {/* Show Missing toggle - only in quote mode (peer comparison doesn't make sense for submission) */}
        {summaryScope !== 'submission' && (missingEndorsements.length > 0 || missingSubjectivities.length > 0) && (
          <button
            onClick={() => setShowMissingSuggestions(!showMissingSuggestions)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              showMissingSuggestions
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700'
            }`}
          >
            {showMissingSuggestions ? 'Hide Missing' : `Show Missing (${missingEndorsements.length + missingSubjectivities.length})`}
          </button>
        )}
      </div>

      {/* Details Grid - 3 column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Coverages - expands right (cols 1-2) when editing, stays visible when others expand */}
        {(() => {
          const isEditingCoverages = expandedCard === 'coverages';
          // Use getStructurePosition to properly detect excess from tower structure
          const isExcessQuote = getStructurePosition(structure) === 'excess';
          const aggregateLimit = (() => {
            if (!structure?.tower_json?.length) return 1000000;
            const cmaiLayer = structure.tower_json.find(l => l.carrier?.toUpperCase().includes('CMAI')) || structure.tower_json[0];
            return cmaiLayer?.limit || 1000000;
          })();

          return (
            <div
              ref={coveragesCardRef}
              className={`border rounded-lg overflow-hidden transition-all duration-200 ${
                isEditingCoverages
                  ? 'md:col-span-2 border-purple-300 ring-1 ring-purple-100'
                  : 'border-gray-200 hover:border-gray-300 cursor-pointer'
              }`}
              onClick={() => !isEditingCoverages && setExpandedCard('coverages')}
            >
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                {isEditingCoverages ? (
                  <h3 className="text-xs font-bold text-gray-500 uppercase">Coverages</h3>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAllSublimits(false); }}
                      className={`text-xs font-bold uppercase ${!showAllSublimits ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      Exceptions
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAllSublimits(true); }}
                      className={`text-xs font-bold uppercase ${showAllSublimits ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      All
                    </button>
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedCard(isEditingCoverages ? null : 'coverages'); }}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                >
                  {isEditingCoverages ? 'Done' : 'Edit'}
                </button>
              </div>

              {isEditingCoverages ? (
                /* Full Coverage Editor when editing */
                <div className="p-2">
                  {isExcessQuote ? (
                    <ExcessCoverageCompact
                      sublimits={structure.sublimits || []}
                      towerJson={structure.tower_json || []}
                      onSave={(updatedSublimits) => {
                        onUpdateOption?.(structureId, { sublimits: updatedSublimits });
                      }}
                    />
                  ) : (
                    <CoverageEditor
                      coverages={structure?.coverages || { aggregate_coverages: {}, sublimit_coverages: {} }}
                      aggregateLimit={aggregateLimit}
                      onSave={(updatedCoverages) => {
                        onUpdateOption?.(structureId, { coverages: updatedCoverages });
                      }}
                      mode="quote"
                      quote={structure}
                      allQuotes={structures}
                      submissionId={submission?.id}
                      embedded={true}
                    />
                  )}
                </div>
              ) : (
                /* Preview when collapsed */
                <div className="p-4">
                  {showAllSublimits ? (
                    <div className="space-y-1">
                      {allSublimits.length === 0 ? (
                        <div className="text-sm text-gray-400 italic">No coverages defined</div>
                      ) : allSublimits.map(sub => (
                        <div key={sub.id} className="flex justify-between text-sm">
                          <span className={`text-gray-600 ${sub.isExcluded ? 'line-through' : ''}`}>{sub.label}</span>
                          <span className={`font-medium ${sub.isExcluded ? 'text-red-500' : sub.isException ? 'text-amber-600' : 'text-green-600'}`}>
                            {sub.value === 'Excluded' ? 'Excluded' : formatCompact(sub.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : coverageExceptions.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{isExcessQuote ? 'All follow form' : 'All standard limits'}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {coverageExceptions.map(exc => (
                        <div key={exc.id} className="flex justify-between text-sm">
                          <span className={`text-gray-600 ${exc.isExcluded ? 'line-through' : ''}`}>{exc.label}</span>
                          <span className={`font-medium ${exc.isExcluded ? 'text-red-500' : 'text-amber-600'}`}>
                            {exc.value === 'Excluded' ? 'Excluded' : formatCompact(exc.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Endorsements - expands right (cols 2-3) when editing, hidden when others expand */}
        <div
          ref={endorsementsCardRef}
          className={`border rounded-lg overflow-hidden transition-all duration-200 ${
            expandedCard === 'endorsements'
              ? 'md:col-span-2 border-purple-300 ring-1 ring-purple-100'
              : 'border-gray-200'
          } ${expandedCard && expandedCard !== 'endorsements' ? 'hidden' : ''}`}
        >
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Endorsements</h3>
                {summaryScope === 'submission' ? (
                  expandedCard === 'endorsements' ? (
                    <span className="text-[11px] text-gray-400">
                      {allSubmissionEndorsements.length} across submission
                    </span>
                  ) : (
                    <span className="text-[11px] text-purple-600 font-medium">
                      {allSubmissionEndorsements.length} across submission
                    </span>
                  )
                ) : (
                  <>
                    {!expandedCard && endorsementStatus.text && summaryScope !== 'submission' && (
                      <span className={`text-[11px] ${endorsementStatus.tone}`}>
                        {endorsementStatus.text}
                      </span>
                    )}
                    {expandedCard === 'endorsements' && (
                      <span className="text-[11px] text-gray-400">
                        {endorsements.length} item{endorsements.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </>
                )}
              </div>
              {((summaryScope === 'quote' && endorsements.length > 0) || (summaryScope === 'submission' && allSubmissionEndorsements.length > 0)) && (
                <button
                  onClick={() => {
                    if (expandedCard === 'endorsements') {
                      setSelectedEndorsementId(null);
                      setEditingEndorsementId(null);
                      setIsAddingEndorsement(false);
                      setShowEndorsementLibraryPicker(false);
                    }
                    setExpandedCard(expandedCard === 'endorsements' ? null : 'endorsements');
                  }}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                >
                  {expandedCard === 'endorsements' ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
            <div className="p-4">
              {summaryScope === 'submission' ? (
                /* Submission Mode */
                allSubmissionEndorsements.length === 0 ? (
                  <p className="text-sm text-gray-400">No endorsements in this submission</p>
                ) : expandedCard === 'endorsements' ? (
                  /* Submission Mode - Expanded Edit View */
                  <div className="space-y-1">
                    {allSubmissionEndorsements.map((item) => {
                      const isEditing = editingEndorsementId === item.id;
                      const mutationId = item.rawId || item.id;
                      const linkedQuoteIds = item.quoteIds?.map(String) || [];
                      const linkedCount = linkedQuoteIds.length;
                      const totalCount = allOptions.length;
                      const isAllLinked = linkedCount === totalCount && totalCount > 0;

                      // Find first linked quote name for badge
                      const firstLinkedQuote = allOptions.find(opt => linkedQuoteIds.includes(String(opt.id)));
                      const otherCount = linkedCount - 1;

                      return (
                        <div
                          key={item.id}
                          className={`group flex items-center gap-2 text-sm rounded px-2 py-1.5 ${isEditing ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                        >
                          {/* Type icon */}
                          {getEndorsementIcon(item)}

                          {/* Endorsement name - editable for manuscripts */}
                          {isEditing && item.isManuscript ? (
                            <input
                              type="text"
                              value={editingEndorsementText}
                              onChange={(e) => setEditingEndorsementText(e.target.value)}
                              onBlur={() => {
                                if (editingEndorsementText.trim() && editingEndorsementText !== item.label) {
                                  updateManuscriptEndorsementMutation.mutate({ endorsementId: mutationId, text: editingEndorsementText });
                                }
                                setEditingEndorsementId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  e.preventDefault();
                                  if (editingEndorsementText.trim() && editingEndorsementText !== item.label) {
                                    updateManuscriptEndorsementMutation.mutate({ endorsementId: mutationId, text: editingEndorsementText });
                                  }
                                  setEditingEndorsementId(null);
                                }
                              }}
                              className="flex-1 min-w-0 text-sm border-0 border-b border-purple-400 bg-transparent px-0 py-0 focus:outline-none focus:border-purple-600"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => {
                                if (item.isManuscript) {
                                  setEditingEndorsementId(item.id);
                                  setEditingEndorsementText(item.label);
                                }
                              }}
                              className={`flex-1 min-w-0 text-left ${
                                item.isManuscript ? 'text-gray-700 hover:text-purple-700 cursor-pointer' : 'text-gray-700 cursor-default'
                              }`}
                            >
                              {item.label}
                            </button>
                          )}

                          {/* Coverage badge with popover */}
                          <Popover.Root
                            open={endorsementAppliesToPopoverId === item.id}
                            onOpenChange={(open) => setEndorsementAppliesToPopoverId(open ? item.id : null)}
                            modal={false}
                          >
                            <Popover.Trigger asChild>
                              <button
                                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                                  isAllLinked
                                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                    : linkedCount > 0
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                }`}
                              >
                                {isAllLinked ? (
                                  `All ${totalCount} Options`
                                ) : linkedCount === 0 ? (
                                  'No quotes'
                                ) : (
                                  <>
                                    {firstLinkedQuote?.name}
                                    {otherCount > 0 && <span className="ml-1 text-[10px] opacity-75">+{otherCount}</span>}
                                  </>
                                )}
                              </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                              <Popover.Content
                                className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                                sideOffset={4}
                                align="end"
                              >
                                <div className="text-xs font-medium text-gray-500 mb-2 px-1">Applies To</div>
                                {/* Quick select shortcuts */}
                                {(() => {
                                  const linkedSet = new Set(linkedQuoteIds);
                                  const isAllSelected = allOptionIds.every(id => linkedSet.has(id));
                                  const isAllPrimarySelected = allPrimaryIds.length > 0 && allPrimaryIds.every(id => linkedSet.has(id));
                                  const isAllExcessSelected = allExcessIds.length > 0 && allExcessIds.every(id => linkedSet.has(id));
                                  return (
                                    <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
                                      <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
                                        <input
                                          type="checkbox"
                                          checked={isAllSelected}
                                          onChange={() => {
                                            applyEndorsementSelectionMutation.mutate({
                                              endorsementId: mutationId,
                                              currentIds: linkedQuoteIds,
                                              targetIds: isAllSelected ? [] : allOptionIds,
                                            });
                                          }}
                                          className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                        />
                                        <span>All Options</span>
                                      </label>
                                      {allPrimaryIds.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                          <input
                                            type="checkbox"
                                            checked={isAllPrimarySelected}
                                            onChange={() => {
                                              let newIds = isAllPrimarySelected
                                                ? linkedQuoteIds.filter(id => !allPrimaryIds.includes(id))
                                                : [...new Set([...linkedQuoteIds, ...allPrimaryIds])];
                                              applyEndorsementSelectionMutation.mutate({
                                                endorsementId: mutationId,
                                                currentIds: linkedQuoteIds,
                                                targetIds: newIds,
                                              });
                                            }}
                                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                          />
                                          <span>All Primary</span>
                                        </label>
                                      )}
                                      {allExcessIds.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                          <input
                                            type="checkbox"
                                            checked={isAllExcessSelected}
                                            onChange={() => {
                                              let newIds = isAllExcessSelected
                                                ? linkedQuoteIds.filter(id => !allExcessIds.includes(id))
                                                : [...new Set([...linkedQuoteIds, ...allExcessIds])];
                                              applyEndorsementSelectionMutation.mutate({
                                                endorsementId: mutationId,
                                                currentIds: linkedQuoteIds,
                                                targetIds: newIds,
                                              });
                                            }}
                                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                          />
                                          <span>All Excess</span>
                                        </label>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {allOptions.map(opt => {
                                    const isLinked = linkedQuoteIds.includes(String(opt.id));
                                    return (
                                      <label
                                        key={opt.id}
                                        className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={() => {
                                            toggleEndorsementLinkMutation.mutate({
                                              endorsementId: mutationId,
                                              quoteId: opt.id,
                                              isLinked,
                                            });
                                          }}
                                          className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                        />
                                        <span className="truncate">{opt.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </Popover.Content>
                            </Popover.Portal>
                          </Popover.Root>

                          {/* Remove button */}
                          <button
                            onClick={() => {
                              if (linkedQuoteIds.length > 0) {
                                applyEndorsementSelectionMutation.mutate({
                                  endorsementId: mutationId,
                                  currentIds: linkedQuoteIds,
                                  targetIds: [],
                                });
                              }
                            }}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                            title="Remove from all quotes"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}

                  {/* Add actions */}
                  {isAddingEndorsement ? (
                    <div className="flex items-center gap-2 text-sm bg-green-50/50 rounded px-2 py-1 ring-1 ring-green-200 mt-2">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <input
                        type="text"
                        value={newEndorsementText}
                        onChange={(e) => setNewEndorsementText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newEndorsementText.trim()) {
                            createManuscriptEndorsementMutation.mutate(newEndorsementText.trim());
                          }
                          if (e.key === 'Escape') {
                            setIsAddingEndorsement(false);
                            setNewEndorsementText('');
                          }
                        }}
                        placeholder="Type new manuscript endorsement..."
                        className="flex-1 text-sm border-0 border-b border-green-400 bg-transparent px-0 py-0 focus:outline-none focus:border-green-600"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (newEndorsementText.trim()) {
                            createManuscriptEndorsementMutation.mutate(newEndorsementText.trim());
                          }
                        }}
                        disabled={!newEndorsementText.trim() || createManuscriptEndorsementMutation.isPending}
                        className="text-[11px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingEndorsement(false);
                          setNewEndorsementText('');
                        }}
                        className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                      <button
                        onClick={() => setIsAddingEndorsement(true)}
                        className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Custom
                      </button>
                      <span className="text-gray-300">|</span>
                      <Popover.Root open={showEndorsementLibraryPicker} onOpenChange={setShowEndorsementLibraryPicker}>
                        <Popover.Trigger asChild>
                          <button className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            From Library
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content className="z-[9999] w-80 rounded-lg border border-gray-200 bg-white shadow-xl" sideOffset={4} align="start">
                            <div className="p-3 border-b border-gray-100">
                              <input
                                type="text"
                                placeholder="Search endorsements..."
                                value={endorsementLibrarySearchTerm}
                                onChange={(e) => setEndorsementLibrarySearchTerm(e.target.value)}
                                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto p-2">
                              {filteredLibraryEndorsements.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">
                                  {endorsementLibrarySearchTerm ? 'No matching endorsements' : 'No endorsements available'}
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {filteredLibraryEndorsements.slice(0, 10).map(endt => (
                                    <button
                                      key={endt.id}
                                      onClick={() => linkEndorsementFromLibraryMutation.mutate(endt.id)}
                                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-purple-50 text-gray-700 hover:text-purple-700 truncate"
                                    >
                                      {endt.title || endt.code}
                                    </button>
                                  ))}
                                  {filteredLibraryEndorsements.length > 10 && (
                                    <p className="text-[11px] text-gray-400 text-center py-1">
                                      +{filteredLibraryEndorsements.length - 10} more...
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            <Popover.Arrow className="fill-white" />
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    </div>
                  )}
                </div>
                ) : (
                  /* Submission Mode - Collapsed Summary View */
                  <div className="space-y-2">
                    {allSubmissionEndorsements.slice(0, 5).map((item) => {
                      const linkedQuoteIds = item.quoteIds?.map(String) || [];
                      const linkedCount = linkedQuoteIds.length;
                      const totalCount = allOptions.length;
                      const isAllLinked = linkedCount === totalCount && totalCount > 0;
                      const firstLinkedQuote = allOptions.find(opt => linkedQuoteIds.includes(String(opt.id)));
                      const otherCount = linkedCount - 1;

                      return (
                        <div key={item.id} className="flex items-center gap-2 text-sm">
                          {getEndorsementIcon(item)}
                          <span className="flex-1 text-gray-700 truncate">{item.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                            isAllLinked
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : linkedCount > 0
                              ? 'bg-blue-50 text-blue-600 border-blue-200'
                              : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}>
                            {isAllLinked ? 'All' : linkedCount === 0 ? 'None' : `${linkedCount}/${totalCount}`}
                          </span>
                        </div>
                      );
                    })}
                    {allSubmissionEndorsements.length > 5 && (
                      <button
                        onClick={() => setExpandedCard('endorsements')}
                        className="text-xs text-purple-600 hover:text-purple-700"
                      >
                        +{allSubmissionEndorsements.length - 5} more...
                      </button>
                    )}
                  </div>
                )
              ) : endorsementsEmpty ? (
                <p className="text-sm text-gray-400">No endorsements attached</p>
              ) : expandedCard === 'endorsements' ? (
                /* Expanded Edit Mode */
                <div className="space-y-1">
                  {showMissingSuggestions && missingEndorsements.length > 0 && (
                    <div className="mb-3 pb-3 border-b border-dashed border-amber-200">
                      <div className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide mb-2">
                        Missing from {peerLabel} peers ({missingEndorsements.length})
                      </div>
                      {missingEndorsements.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 text-sm border border-dashed border-amber-300 rounded px-2 py-1 bg-amber-50/30"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="text-gray-700 truncate">{item.label}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 flex-shrink-0">
                              On peers
                            </span>
                          </div>
                          <button
                            onClick={() => restoreEndorsement.mutate(item.id)}
                            className="text-[11px] px-2 py-1 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 flex-shrink-0"
                          >
                            + Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Existing endorsements - editable */}
                  {(() => {
                    const allEndorsements = [...uniqueEndorsements, ...alignedEndorsements];
                    return allEndorsements.map((item, index) => {
                      const isEditing = editingEndorsementId === item.id;
                      const sharedCount = getEndorsementSharedQuoteCount(item);
                      const mutationId = item.rawId || item.id;

                      const navigateToEndorsement = (targetIndex) => {
                        // Save current if changed (for manuscripts only)
                        if (item.isManuscript && editingEndorsementText.trim() && editingEndorsementText !== item.label) {
                          updateManuscriptEndorsementMutation.mutate({ endorsementId: mutationId, text: editingEndorsementText });
                        }
                        // Move to target item
                        const targetItem = allEndorsements[targetIndex];
                        if (targetItem) {
                          if (targetItem.isManuscript) {
                            setEditingEndorsementId(targetItem.id);
                            setEditingEndorsementText(targetItem.label);
                          } else {
                            setEditingEndorsementId(null);
                            setSelectedEndorsementId(targetItem.id);
                          }
                        }
                      };

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 text-sm rounded px-2 py-1 group hover:bg-gray-50"
                        >
                          {getEndorsementIcon(item)}

                          {/* Text - manuscripts can be edited */}
                          {isEditing && item.isManuscript ? (
                            <input
                              type="text"
                              value={editingEndorsementText}
                              onChange={(e) => setEditingEndorsementText(e.target.value)}
                              onBlur={() => {
                                if (editingEndorsementText.trim() && editingEndorsementText !== item.label) {
                                  updateManuscriptEndorsementMutation.mutate({ endorsementId: mutationId, text: editingEndorsementText });
                                }
                                setEditingEndorsementId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                  e.preventDefault();
                                  // Save and move to next (wrap to top)
                                  const nextIndex = index < allEndorsements.length - 1 ? index + 1 : 0;
                                  navigateToEndorsement(nextIndex);
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  // Save and exit edit mode
                                  if (editingEndorsementText.trim() && editingEndorsementText !== item.label) {
                                    updateManuscriptEndorsementMutation.mutate({ endorsementId: mutationId, text: editingEndorsementText });
                                  }
                                  setEditingEndorsementId(null);
                                  setExpandedCard(null);
                                  setIsAddingEndorsement(false);
                                  setShowEndorsementLibraryPicker(false);
                                }
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const nextIndex = index < allEndorsements.length - 1 ? index + 1 : 0;
                                  navigateToEndorsement(nextIndex);
                                }
                                if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
                                  e.preventDefault();
                                  const prevIndex = index > 0 ? index - 1 : allEndorsements.length - 1;
                                  navigateToEndorsement(prevIndex);
                                }
                              }}
                              className="flex-1 text-sm border-0 border-b border-purple-400 bg-transparent px-0 py-0 focus:outline-none focus:border-purple-600"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => {
                                if (item.isManuscript) {
                                  setEditingEndorsementId(item.id);
                                  setEditingEndorsementText(item.label);
                                }
                              }}
                              className={`flex-1 text-left truncate ${
                                item.isManuscript
                                  ? 'text-gray-700 hover:text-purple-700 cursor-pointer'
                                  : 'text-gray-700 cursor-default'
                              }`}
                              disabled={!item.isManuscript}
                            >
                              {item.label}
                            </button>
                          )}

                          {/* Applies To Popover */}
                          <Popover.Root
                            open={endorsementAppliesToPopoverId === item.id}
                            onOpenChange={(open) => setEndorsementAppliesToPopoverId(open ? item.id : null)}
                            modal={false}
                          >
                            <Popover.Trigger asChild>
                              <button
                                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                  sharedCount > 0
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                                    : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
                                }`}
                                title="Click to manage which quotes this applies to"
                              >
                                {sharedCount > 0 ? `On ${sharedCount + 1} quotes` : 'Only here'}
                              </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                              <Popover.Content
                                className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                                sideOffset={4}
                                align="end"
                              >
                                <div className="text-xs font-medium text-gray-500 mb-2 px-1">Applies To</div>
                                {/* Quick select checkboxes */}
                                {(() => {
                                  const linkedIds = item.quoteIds?.map(String) || [];
                                  const linkedSet = new Set(linkedIds);
                                  const isAllSelected = allOptionIds.every(id => linkedSet.has(id));
                                  const isAllPrimarySelected = allPrimaryIds.length > 0 && allPrimaryIds.every(id => linkedSet.has(id));
                                  const isAllExcessSelected = allExcessIds.length > 0 && allExcessIds.every(id => linkedSet.has(id));
                                  return (
                                    <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
                                      <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
                                        <input
                                          type="checkbox"
                                          checked={isAllSelected}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            const currentId = String(structureId);
                                            applyEndorsementSelectionMutation.mutate({
                                              endorsementId: mutationId,
                                              currentIds: linkedIds,
                                              targetIds: isAllSelected ? [currentId] : allOptionIds,
                                            });
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                        />
                                        <span>All Options</span>
                                      </label>
                                      {allPrimaryIds.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                          <input
                                            type="checkbox"
                                            checked={isAllPrimarySelected}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              const currentId = String(structureId);
                                              let newIds = isAllPrimarySelected
                                                ? linkedIds.filter(id => !allPrimaryIds.includes(id))
                                                : [...new Set([...linkedIds, ...allPrimaryIds])];
                                              if (!newIds.includes(currentId)) newIds.push(currentId);
                                              applyEndorsementSelectionMutation.mutate({
                                                endorsementId: mutationId,
                                                currentIds: linkedIds,
                                                targetIds: newIds,
                                              });
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                          />
                                          <span>All Primary</span>
                                        </label>
                                      )}
                                      {allExcessIds.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                          <input
                                            type="checkbox"
                                            checked={isAllExcessSelected}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              const currentId = String(structureId);
                                              let newIds = isAllExcessSelected
                                                ? linkedIds.filter(id => !allExcessIds.includes(id))
                                                : [...new Set([...linkedIds, ...allExcessIds])];
                                              if (!newIds.includes(currentId)) newIds.push(currentId);
                                              applyEndorsementSelectionMutation.mutate({
                                                endorsementId: mutationId,
                                                currentIds: linkedIds,
                                                targetIds: newIds,
                                              });
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                          />
                                          <span>All Excess</span>
                                        </label>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {allOptions.map(opt => {
                                    const isLinked = item.quoteIds?.map(String).includes(String(opt.id));
                                    const isCurrent = String(opt.id) === String(structureId);
                                    return (
                                      <label
                                        key={opt.id}
                                        className={`flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded ${
                                          isCurrent ? 'text-purple-700 font-medium' : 'text-gray-600'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            toggleEndorsementLinkMutation.mutate({
                                              endorsementId: mutationId,
                                              quoteId: opt.id,
                                              isLinked,
                                            });
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                        />
                                        <span className="truncate">{opt.name}</span>
                                        {isCurrent && <span className="text-[9px] text-purple-500">(current)</span>}
                                      </label>
                                    );
                                  })}
                                </div>
                              </Popover.Content>
                            </Popover.Portal>
                          </Popover.Root>

                          {/* Remove button */}
                          <button
                            onClick={() => unlinkEndorsementMutation.mutate(item.id)}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                            title="Remove from this quote"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    });
                  })()}

                  {/* Add new endorsement row */}
                  {isAddingEndorsement ? (
                    <div className="flex items-center gap-2 text-sm bg-green-50/50 rounded px-2 py-1 ring-1 ring-green-200">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <input
                        type="text"
                        value={newEndorsementText}
                        onChange={(e) => setNewEndorsementText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newEndorsementText.trim()) {
                            createManuscriptEndorsementMutation.mutate(newEndorsementText.trim());
                          }
                          if (e.key === 'Escape') {
                            setIsAddingEndorsement(false);
                            setNewEndorsementText('');
                          }
                        }}
                        placeholder="Type new manuscript endorsement..."
                        className="flex-1 text-sm border-0 border-b border-green-400 bg-transparent px-0 py-0 focus:outline-none focus:border-green-600"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (newEndorsementText.trim()) {
                            createManuscriptEndorsementMutation.mutate(newEndorsementText.trim());
                          }
                        }}
                        disabled={!newEndorsementText.trim() || createManuscriptEndorsementMutation.isPending}
                        className="text-[11px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingEndorsement(false);
                          setNewEndorsementText('');
                        }}
                        className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    /* Action buttons */
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                      <button
                        onClick={() => setIsAddingEndorsement(true)}
                        className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Custom
                      </button>
                      <span className="text-gray-300">|</span>
                      <Popover.Root open={showEndorsementLibraryPicker} onOpenChange={setShowEndorsementLibraryPicker}>
                        <Popover.Trigger asChild>
                          <button className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            From Library
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content className="z-[9999] w-80 rounded-lg border border-gray-200 bg-white shadow-xl" sideOffset={4} align="start">
                            <div className="p-3 border-b border-gray-100">
                              <input
                                type="text"
                                placeholder="Search endorsements..."
                                value={endorsementLibrarySearchTerm}
                                onChange={(e) => setEndorsementLibrarySearchTerm(e.target.value)}
                                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto p-2">
                              {filteredLibraryEndorsements.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">
                                  {endorsementLibrarySearchTerm ? 'No matching endorsements' : 'No endorsements available'}
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {filteredLibraryEndorsements.slice(0, 10).map(endt => (
                                    <button
                                      key={endt.id}
                                      onClick={() => linkEndorsementFromLibraryMutation.mutate(endt.id)}
                                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-purple-50 text-gray-700 hover:text-purple-700 truncate"
                                    >
                                      {endt.title || endt.code}
                                    </button>
                                  ))}
                                  {filteredLibraryEndorsements.length > 10 && (
                                    <p className="text-[11px] text-gray-400 text-center py-1">
                                      +{filteredLibraryEndorsements.length - 10} more...
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            <Popover.Arrow className="fill-white" />
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    </div>
                  )}
                </div>
              ) : (
                /* Collapsed Summary Mode */
                <div className="space-y-2">
                  {showMissingSuggestions && missingEndorsements.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => restoreEndorsement.mutate(item.id)}
                      className="flex items-center justify-between gap-2 text-sm border border-dashed border-amber-300 rounded px-2 py-1.5 bg-amber-50/50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-700 truncate">{item.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600">
                          On peers
                        </span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); restoreEndorsement.mutate(item.id); }}
                        className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:text-gray-900"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                  {uniqueEndorsements.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm">
                        {getEndorsementIcon(item)}
                        <button
                          onClick={() => {
                            setExpandedCard('endorsements');
                            setSelectedEndorsementId(item.id);
                          }}
                          className="flex-1 text-gray-700 hover:text-purple-700 text-left truncate"
                        >
                          {item.label}
                        </button>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 flex-shrink-0">
                          Only here
                        </span>
                      </div>
                  ))}
                  {alignedEndorsements.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm">
                        {getEndorsementIcon(item)}
                        <button
                          onClick={() => {
                            setExpandedCard('endorsements');
                            setSelectedEndorsementId(item.id);
                          }}
                          className="flex-1 text-gray-700 hover:text-purple-700 text-left truncate"
                        >
                          {item.label}
                        </button>
                      </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        {/* Subjectivities - expands left (cols 2-3) when editing */}
        <div
          ref={subjectivitiesCardRef}
          className={`border rounded-lg overflow-hidden transition-all duration-200 ${
            expandedCard === 'subjectivities'
              ? 'md:col-start-2 md:col-span-2 border-purple-300 ring-1 ring-purple-100'
              : 'border-gray-200'
          } ${expandedCard && expandedCard !== 'subjectivities' ? 'hidden' : ''}`}
        >
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Subjectivities</h3>
                {summaryScope === 'submission' ? (
                  expandedCard === 'subjectivities' ? (
                    <span className="text-[11px] text-gray-400">
                      {allSubmissionSubjectivities.length} across submission
                    </span>
                  ) : (
                    <span className="text-[11px] text-purple-600 font-medium">
                      {allSubmissionSubjectivities.length} across submission
                    </span>
                  )
                ) : (
                  <>
                    {!expandedCard && subjectivityStatus.text && summaryScope !== 'submission' && (
                      <span className={`text-[11px] ${subjectivityStatus.tone}`}>
                        {subjectivityStatus.text}
                      </span>
                    )}
                    {expandedCard === 'subjectivities' && (
                      <span className="text-[11px] text-gray-400">
                        {subjectivities.length} item{subjectivities.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </>
                )}
              </div>
              {((summaryScope === 'quote' && subjectivities.length > 0) || (summaryScope === 'submission' && allSubmissionSubjectivities.length > 0) || subjectivities.length === 0) && (
                <button
                  onClick={() => {
                    if (expandedCard === 'subjectivities') {
                      setEditingSubjId(null);
                      setIsAddingSubjectivity(false);
                      setShowLibraryPicker(false);
                    }
                    setExpandedCard(expandedCard === 'subjectivities' ? null : 'subjectivities');
                  }}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                >
                  {expandedCard === 'subjectivities' ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
            <div className="p-4">
              {summaryScope === 'submission' ? (
                /* Submission Mode */
                allSubmissionSubjectivities.length === 0 ? (
                  <p className="text-sm text-gray-400">No subjectivities in this submission</p>
                ) : expandedCard === 'subjectivities' ? (
                  /* Submission Mode - Expanded Edit View */
                  <div className="space-y-1">
                    {allSubmissionSubjectivities.map((item) => {
                      const isEditing = editingSubjId === item.id;
                      const mutationId = item.rawId || item.id;
                      const linkedQuoteIds = item.quoteIds?.map(String) || [];
                      const linkedCount = linkedQuoteIds.length;
                      const totalCount = allOptions.length;
                      const isAllLinked = linkedCount === totalCount && totalCount > 0;
                      const firstLinkedQuote = allOptions.find(opt => linkedQuoteIds.includes(String(opt.id)));
                      const otherCount = linkedCount - 1;

                      return (
                        <div
                          key={item.id}
                          className={`group flex items-center gap-2 text-sm rounded px-2 py-1.5 ${isEditing ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                        >
                          {/* Status icon */}
                          <button
                            onClick={() => updateSubjectivityStatusMutation.mutate({
                              subjectivityId: mutationId,
                              status: cycleStatus(item.status)
                            })}
                            className="p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
                            title={`Status: ${item.status || 'pending'} (click to change)`}
                          >
                            {item.status === 'received' ? (
                              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : item.status === 'waived' ? (
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>

                          {/* Subjectivity text - editable */}
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingSubjText}
                              onChange={(e) => setEditingSubjText(e.target.value)}
                              onBlur={() => {
                                if (editingSubjText.trim() && editingSubjText !== item.label) {
                                  updateSubjectivityTextMutation.mutate({ subjectivityId: mutationId, text: editingSubjText });
                                }
                                setEditingSubjId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  e.preventDefault();
                                  if (editingSubjText.trim() && editingSubjText !== item.label) {
                                    updateSubjectivityTextMutation.mutate({ subjectivityId: mutationId, text: editingSubjText });
                                  }
                                  setEditingSubjId(null);
                                }
                              }}
                              className="flex-1 min-w-0 text-sm border-0 border-b border-purple-400 bg-transparent px-0 py-0 focus:outline-none focus:border-purple-600"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setEditingSubjId(item.id);
                                setEditingSubjText(item.label);
                              }}
                              className="flex-1 min-w-0 text-left text-gray-700 hover:text-purple-700 cursor-pointer"
                            >
                              {item.label}
                            </button>
                          )}

                          {/* Coverage badge with popover */}
                          <Popover.Root
                            open={subjectivityAppliesToPopoverId === item.id}
                            onOpenChange={(open) => setSubjectivityAppliesToPopoverId(open ? item.id : null)}
                            modal={false}
                          >
                            <Popover.Trigger asChild>
                              <button
                                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                                  isAllLinked
                                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                    : linkedCount > 0
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                }`}
                              >
                                {isAllLinked ? (
                                  `All ${totalCount} Options`
                                ) : linkedCount === 0 ? (
                                  'No quotes'
                                ) : (
                                  <>
                                    {firstLinkedQuote?.name}
                                    {otherCount > 0 && <span className="ml-1 text-[10px] opacity-75">+{otherCount}</span>}
                                  </>
                                )}
                              </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                              <Popover.Content
                                className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                                sideOffset={4}
                                align="end"
                              >
                                <div className="text-xs font-medium text-gray-500 mb-2 px-1">Applies To</div>
                                {/* Quick select shortcuts */}
                                {(() => {
                                  const linkedSet = new Set(linkedQuoteIds);
                                  const isAllSelected = allOptionIds.every(id => linkedSet.has(id));
                                  const isAllPrimarySelected = allPrimaryIds.length > 0 && allPrimaryIds.every(id => linkedSet.has(id));
                                  const isAllExcessSelected = allExcessIds.length > 0 && allExcessIds.every(id => linkedSet.has(id));
                                  return (
                                    <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
                                      <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
                                        <input
                                          type="checkbox"
                                          checked={isAllSelected}
                                          onChange={() => {
                                            applySubjectivitySelectionMutation.mutate({
                                              subjectivityId: mutationId,
                                              currentIds: linkedQuoteIds,
                                              targetIds: isAllSelected ? [] : allOptionIds,
                                            });
                                          }}
                                          className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                        />
                                        <span>All Options</span>
                                      </label>
                                      {allPrimaryIds.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                          <input
                                            type="checkbox"
                                            checked={isAllPrimarySelected}
                                            onChange={() => {
                                              let newIds = isAllPrimarySelected
                                                ? linkedQuoteIds.filter(id => !allPrimaryIds.includes(id))
                                                : [...new Set([...linkedQuoteIds, ...allPrimaryIds])];
                                              applySubjectivitySelectionMutation.mutate({
                                                subjectivityId: mutationId,
                                                currentIds: linkedQuoteIds,
                                                targetIds: newIds,
                                              });
                                            }}
                                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                          />
                                          <span>All Primary</span>
                                        </label>
                                      )}
                                      {allExcessIds.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                          <input
                                            type="checkbox"
                                            checked={isAllExcessSelected}
                                            onChange={() => {
                                              let newIds = isAllExcessSelected
                                                ? linkedQuoteIds.filter(id => !allExcessIds.includes(id))
                                                : [...new Set([...linkedQuoteIds, ...allExcessIds])];
                                              applySubjectivitySelectionMutation.mutate({
                                                subjectivityId: mutationId,
                                                currentIds: linkedQuoteIds,
                                                targetIds: newIds,
                                              });
                                            }}
                                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                          />
                                          <span>All Excess</span>
                                        </label>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {allOptions.map(opt => {
                                    const isLinked = linkedQuoteIds.includes(String(opt.id));
                                    return (
                                      <label
                                        key={opt.id}
                                        className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={() => {
                                            toggleSubjectivityLinkMutation.mutate({
                                              subjectivityId: mutationId,
                                              quoteId: opt.id,
                                              isLinked,
                                            });
                                          }}
                                          className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                        />
                                        <span className="truncate">{opt.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </Popover.Content>
                            </Popover.Portal>
                          </Popover.Root>

                          {/* Remove button */}
                          <button
                            onClick={() => {
                              if (linkedQuoteIds.length > 0) {
                                applySubjectivitySelectionMutation.mutate({
                                  subjectivityId: mutationId,
                                  currentIds: linkedQuoteIds,
                                  targetIds: [],
                                });
                              }
                            }}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                            title="Remove from all quotes"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}

                    {/* Add actions */}
                    {isAddingSubjectivity ? (
                      <div className="flex items-center gap-2 text-sm bg-green-50/50 rounded px-2 py-1 ring-1 ring-green-200 mt-2">
                        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <input
                          type="text"
                          value={newSubjectivityText}
                          onChange={(e) => setNewSubjectivityText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newSubjectivityText.trim()) {
                              createSubjectivityMutation.mutate(newSubjectivityText.trim());
                            }
                            if (e.key === 'Escape') {
                              setIsAddingSubjectivity(false);
                              setNewSubjectivityText('');
                            }
                          }}
                          placeholder="Type new subjectivity text..."
                          className="flex-1 text-sm border-0 border-b border-green-400 bg-transparent px-0 py-0 focus:outline-none focus:border-green-600"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            if (newSubjectivityText.trim()) {
                              createSubjectivityMutation.mutate(newSubjectivityText.trim());
                            }
                          }}
                          disabled={!newSubjectivityText.trim() || createSubjectivityMutation.isPending}
                          className="text-[11px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => {
                            setIsAddingSubjectivity(false);
                            setNewSubjectivityText('');
                          }}
                          className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                        <button
                          onClick={() => setIsAddingSubjectivity(true)}
                          className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Custom
                        </button>
                        <span className="text-gray-300">|</span>
                        <Popover.Root open={showLibraryPicker} onOpenChange={setShowLibraryPicker}>
                          <Popover.Trigger asChild>
                            <button className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              From Library
                            </button>
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content className="z-[9999] w-80 rounded-lg border border-gray-200 bg-white shadow-xl" sideOffset={4} align="start">
                              <div className="p-3 border-b border-gray-100">
                                <input
                                  type="text"
                                  placeholder="Search templates..."
                                  value={librarySearchTerm}
                                  onChange={(e) => setLibrarySearchTerm(e.target.value)}
                                  className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                />
                              </div>
                              <div className="max-h-64 overflow-y-auto p-2">
                                {filteredTemplates.length === 0 ? (
                                  <p className="text-xs text-gray-400 text-center py-4">
                                    {librarySearchTerm ? 'No matching templates' : 'No templates available'}
                                  </p>
                                ) : (
                                  <div className="space-y-1">
                                    {filteredTemplates.slice(0, 10).map(template => (
                                      <button
                                        key={template.id}
                                        onClick={() => linkTemplateSubjectivity.mutate(template.id)}
                                        className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-purple-50 text-gray-700 hover:text-purple-700 truncate"
                                      >
                                        {template.text || template.subjectivity_text}
                                      </button>
                                    ))}
                                    {filteredTemplates.length > 10 && (
                                      <p className="text-[11px] text-gray-400 text-center py-1">
                                        +{filteredTemplates.length - 10} more...
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                              <Popover.Arrow className="fill-white" />
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Submission Mode - Collapsed Summary View */
                  <div className="space-y-2">
                    {allSubmissionSubjectivities.slice(0, 5).map((item) => {
                      const linkedQuoteIds = item.quoteIds?.map(String) || [];
                      const linkedCount = linkedQuoteIds.length;
                      const totalCount = allOptions.length;
                      const isAllLinked = linkedCount === totalCount && totalCount > 0;
                      const mutationId = item.rawId || item.id;

                      return (
                        <div key={item.id} className="flex items-center gap-2 text-sm">
                          <button
                            onClick={() => updateSubjectivityStatusMutation.mutate({
                              subjectivityId: mutationId,
                              status: cycleStatus(item.status)
                            })}
                            className="p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
                            title={`Status: ${item.status || 'pending'} (click to change)`}
                          >
                            {item.status === 'received' ? (
                              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : item.status === 'waived' ? (
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                          <span className="flex-1 text-gray-700 truncate">{item.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                            isAllLinked
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : linkedCount > 0
                              ? 'bg-blue-50 text-blue-600 border-blue-200'
                              : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}>
                            {isAllLinked ? 'All' : linkedCount === 0 ? 'None' : `${linkedCount}/${totalCount}`}
                          </span>
                        </div>
                      );
                    })}
                    {allSubmissionSubjectivities.length > 5 && (
                      <button
                        onClick={() => setExpandedCard('subjectivities')}
                        className="text-xs text-purple-600 hover:text-purple-700"
                      >
                        +{allSubmissionSubjectivities.length - 5} more...
                      </button>
                    )}
                  </div>
                )
              ) : expandedCard === 'subjectivities' ? (
                /* Expanded Edit Mode - Full editing capabilities */
                <div className="space-y-1">
                  {/* Missing from peers - controlled by Show Missing toggle */}
                  {showMissingSuggestions && missingSubjectivities.length > 0 && (
                    <div className="mb-3 pb-3 border-b border-dashed border-amber-200">
                      <div className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide mb-2">
                        Missing from {peerLabel} peers ({missingSubjectivities.length})
                      </div>
                      {missingSubjectivities.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 text-sm border border-dashed border-amber-300 rounded px-2 py-1 bg-amber-50/30"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-gray-700 truncate">{item.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 flex-shrink-0">
                          On peers
                        </span>
                      </div>
                      <button
                        onClick={() => restoreSubjectivity.mutate(item.id)}
                        className="text-[11px] px-2 py-1 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 flex-shrink-0"
                      >
                        + Add
                      </button>
                    </div>
                      ))}
                    </div>
                  )}

                  {/* Existing subjectivities - editable */}
                  {(() => {
                    const allSubjectivities = [...uniqueSubjectivities, ...alignedSubjectivities];
                    return allSubjectivities.map((item, index) => {
                      const isEditing = editingSubjId === item.id;
                      const sharedCount = getSharedQuoteCount(item);
                      const mutationId = item.rawId || item.id; // Use rawId for API calls

                      const navigateToItem = (targetIndex) => {
                        // Save current if changed
                        if (editingSubjText.trim() && editingSubjText !== item.label) {
                          updateSubjectivityTextMutation.mutate({ subjectivityId: mutationId, text: editingSubjText });
                        }
                        // Move to target item
                        const targetItem = allSubjectivities[targetIndex];
                        if (targetItem) {
                          setEditingSubjId(targetItem.id);
                          setEditingSubjText(targetItem.label);
                        }
                      };

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 text-sm rounded px-2 py-1 group hover:bg-gray-50"
                        >
                          {/* Status Icon - Click to cycle */}
                          <button
                            onClick={() => updateSubjectivityStatusMutation.mutate({
                              subjectivityId: mutationId,
                              status: cycleStatus(item.status)
                            })}
                            className="p-1 rounded hover:bg-white transition-colors flex-shrink-0"
                            title={`Status: ${item.status || 'pending'} (click to change)`}
                          >
                            {item.status === 'received' ? (
                              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : item.status === 'waived' ? (
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>

                          {/* Text - Click to edit, blur to save */}
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingSubjText}
                              onChange={(e) => setEditingSubjText(e.target.value)}
                              onBlur={() => {
                                if (editingSubjText.trim() && editingSubjText !== item.label) {
                                  updateSubjectivityTextMutation.mutate({ subjectivityId: mutationId, text: editingSubjText });
                                }
                                setEditingSubjId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                  e.preventDefault();
                                  // Save and move to next (wrap to top)
                                  const nextIndex = index < allSubjectivities.length - 1 ? index + 1 : 0;
                                  navigateToItem(nextIndex);
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  // Save and exit edit mode
                                  if (editingSubjText.trim() && editingSubjText !== item.label) {
                                    updateSubjectivityTextMutation.mutate({ subjectivityId: mutationId, text: editingSubjText });
                                  }
                                  setEditingSubjId(null);
                                  setExpandedCard(null);
                                  setIsAddingSubjectivity(false);
                                  setShowLibraryPicker(false);
                                }
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  const nextIndex = index < allSubjectivities.length - 1 ? index + 1 : 0;
                                  navigateToItem(nextIndex);
                                }
                                if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
                                  e.preventDefault();
                                  const prevIndex = index > 0 ? index - 1 : allSubjectivities.length - 1;
                                  navigateToItem(prevIndex);
                                }
                              }}
                              className="flex-1 text-sm border-0 border-b border-purple-400 bg-transparent px-0 py-0 focus:outline-none focus:border-purple-600"
                              autoFocus
                            />
                          ) : (
                          <button
                            onClick={() => {
                              setEditingSubjId(item.id);
                              setEditingSubjText(item.label);
                            }}
                            className="flex-1 text-left text-gray-700 hover:text-purple-700 truncate"
                          >
                            {item.label}
                          </button>
                        )}

                        {/* Applies To Popover */}
                        <Popover.Root
                            open={appliesToPopoverId === item.id}
                            onOpenChange={(open) => setAppliesToPopoverId(open ? item.id : null)}
                            modal={false}
                          >
                            <Popover.Trigger asChild>
                              <button
                                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                  sharedCount > 0
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                                    : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
                                }`}
                                title="Click to manage which quotes this applies to"
                              >
                                {sharedCount > 0 ? `On ${sharedCount + 1} quotes` : 'Only here'}
                              </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                              <Popover.Content
                                className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                                sideOffset={4}
                                align="end"
                              >
                                <div className="text-xs font-medium text-gray-500 mb-2 px-1">Applies To</div>
                                {/* Quick select checkboxes */}
                                {(() => {
                                  const linkedIds = item.quoteIds?.map(String) || [];
                                  const linkedSet = new Set(linkedIds);
                                  const isAllSelected = allOptionIds.every(id => linkedSet.has(id));
                                  const isAllPrimarySelected = allPrimaryIds.length > 0 && allPrimaryIds.every(id => linkedSet.has(id));
                                  const isAllExcessSelected = allExcessIds.length > 0 && allExcessIds.every(id => linkedSet.has(id));
                                  return (
                                    <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
                                      <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
                                        <input
                                          type="checkbox"
                                          checked={isAllSelected}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            // Always keep current quote linked to prevent item from disappearing
                                            const currentId = String(structureId);
                                            applySubjectivitySelectionMutation.mutate({
                                              subjectivityId: mutationId,
                                              currentIds: linkedIds,
                                              targetIds: isAllSelected ? [currentId] : allOptionIds,
                                            });
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                        />
                                        <span>All Options</span>
                                      </label>
                                      {allPrimaryIds.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                          <input
                                            type="checkbox"
                                            checked={isAllPrimarySelected}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              const currentId = String(structureId);
                                              let newIds = isAllPrimarySelected
                                                ? linkedIds.filter(id => !allPrimaryIds.includes(id))
                                                : [...new Set([...linkedIds, ...allPrimaryIds])];
                                              // Always keep current quote linked
                                              if (!newIds.includes(currentId)) newIds = [...newIds, currentId];
                                              applySubjectivitySelectionMutation.mutate({
                                                subjectivityId: mutationId,
                                                currentIds: linkedIds,
                                                targetIds: newIds,
                                              });
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                          />
                                          <span>All Primary</span>
                                        </label>
                                      )}
                                      {allExcessIds.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                          <input
                                            type="checkbox"
                                            checked={isAllExcessSelected}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              const currentId = String(structureId);
                                              let newIds = isAllExcessSelected
                                                ? linkedIds.filter(id => !allExcessIds.includes(id))
                                                : [...new Set([...linkedIds, ...allExcessIds])];
                                              // Always keep current quote linked
                                              if (!newIds.includes(currentId)) newIds = [...newIds, currentId];
                                              applySubjectivitySelectionMutation.mutate({
                                                subjectivityId: mutationId,
                                                currentIds: linkedIds,
                                                targetIds: newIds,
                                              });
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                          />
                                          <span>All Excess</span>
                                        </label>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {allOptions.map(opt => {
                                    const isLinked = item.quoteIds?.map(String).includes(String(opt.id));
                                    const isCurrent = String(opt.id) === String(structureId);
                                    return (
                                      <label
                                        key={opt.id}
                                        className={`flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded ${
                                          isCurrent ? 'text-purple-700 font-medium' : 'text-gray-600'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            toggleSubjectivityLinkMutation.mutate({
                                              subjectivityId: mutationId,
                                              quoteId: opt.id,
                                              isLinked,
                                            });
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                        />
                                        <span className="truncate">{opt.name}</span>
                                        {isCurrent && <span className="text-[9px] text-purple-500">(current)</span>}
                                      </label>
                                    );
                                  })}
                                </div>
                              </Popover.Content>
                            </Popover.Portal>
                          </Popover.Root>

                        {/* Remove button - always visible */}
                        <button
                          onClick={() => unlinkSubjectivityMutation.mutate(mutationId)}
                          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                          title="Remove from this quote"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      );
                    });
                  })()}

                  {/* Add new subjectivity row */}
                  {isAddingSubjectivity ? (
                    <div className="flex items-center gap-2 text-sm bg-green-50/50 rounded px-2 py-1 ring-1 ring-green-200">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <input
                        type="text"
                        value={newSubjectivityText}
                        onChange={(e) => setNewSubjectivityText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newSubjectivityText.trim()) {
                            createSubjectivityMutation.mutate(newSubjectivityText.trim());
                          }
                          if (e.key === 'Escape') {
                            setIsAddingSubjectivity(false);
                            setNewSubjectivityText('');
                          }
                        }}
                        placeholder="Type new subjectivity text..."
                        className="flex-1 text-sm border-0 border-b border-green-400 bg-transparent px-0 py-0 focus:outline-none focus:border-green-600"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (newSubjectivityText.trim()) {
                            createSubjectivityMutation.mutate(newSubjectivityText.trim());
                          }
                        }}
                        disabled={!newSubjectivityText.trim() || createSubjectivityMutation.isPending}
                        className="text-[11px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingSubjectivity(false);
                          setNewSubjectivityText('');
                        }}
                        className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    /* Action buttons */
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                      <button
                        onClick={() => setIsAddingSubjectivity(true)}
                        className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Custom
                      </button>
                      <span className="text-gray-300">|</span>
                      <Popover.Root open={showLibraryPicker} onOpenChange={setShowLibraryPicker}>
                        <Popover.Trigger asChild>
                          <button className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            From Library
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content className="z-[9999] w-80 rounded-lg border border-gray-200 bg-white shadow-xl" sideOffset={4} align="start">
                            <div className="p-3 border-b border-gray-100">
                              <input
                                type="text"
                                placeholder="Search templates..."
                                value={librarySearchTerm}
                                onChange={(e) => setLibrarySearchTerm(e.target.value)}
                                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </div>
                            <div className="max-h-64 overflow-y-auto p-2">
                              {filteredTemplates.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">
                                  {librarySearchTerm ? 'No matching templates' : 'No templates available'}
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {filteredTemplates.slice(0, 10).map(template => (
                                    <button
                                      key={template.id}
                                      onClick={() => linkTemplateSubjectivity.mutate(template.id)}
                                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-purple-50 text-gray-700 hover:text-purple-700 truncate"
                                    >
                                      {template.text || template.subjectivity_text}
                                    </button>
                                  ))}
                                  {filteredTemplates.length > 10 && (
                                    <p className="text-[11px] text-gray-400 text-center py-1">
                                      +{filteredTemplates.length - 10} more...
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            <Popover.Arrow className="fill-white" />
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    </div>
                  )}
                </div>
              ) : subjectivitiesEmpty ? (
                <p className="text-sm text-gray-400">No subjectivities attached</p>
              ) : (
                /* Collapsed Preview Mode */
                <div className="space-y-2">
                  {showMissingSuggestions && missingSubjectivities.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => restoreSubjectivity.mutate(item.id)}
                      className="flex items-center justify-between gap-2 text-sm border border-dashed border-amber-300 rounded px-2 py-1.5 bg-amber-50/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-700 truncate">{item.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600">
                          On peers
                        </span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); restoreSubjectivity.mutate(item.id); }}
                        className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:text-gray-900"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                  {uniqueSubjectivities.map((item) => {
                    const mutationId = item.rawId || item.id;
                    return (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <button
                        onClick={() => updateSubjectivityStatusMutation.mutate({
                          subjectivityId: mutationId,
                          status: cycleStatus(item.status)
                        })}
                        className="p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
                        title={`Status: ${item.status || 'pending'} (click to change)`}
                      >
                        {item.status === 'received' ? (
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : item.status === 'waived' ? (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setExpandedCard('subjectivities');
                          setEditingSubjId(item.id);
                          setEditingSubjText(item.label);
                        }}
                        className="text-gray-700 hover:text-purple-700 text-left truncate flex-1"
                      >
                        {item.label}
                      </button>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 flex-shrink-0">
                        Only here
                      </span>
                    </div>
                    );
                  })}
                  {alignedSubjectivities.map((item) => {
                    const mutationId = item.rawId || item.id;
                    return (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <button
                        onClick={() => updateSubjectivityStatusMutation.mutate({
                          subjectivityId: mutationId,
                          status: cycleStatus(item.status)
                        })}
                        className="p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
                        title={`Status: ${item.status || 'pending'} (click to change)`}
                      >
                        {item.status === 'received' ? (
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : item.status === 'waived' ? (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setExpandedCard('subjectivities');
                          setEditingSubjId(item.id);
                          setEditingSubjText(item.label);
                        }}
                        className="text-gray-700 hover:text-purple-700 text-left truncate flex-1"
                      >
                        {item.label}
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

      </div>

      {/* Notes - Full width below the grid */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-xs font-bold text-gray-500 uppercase">Notes</h3>
          <button
            onClick={() => setIsEditingNotes(!isEditingNotes)}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium"
          >
            {isEditingNotes ? 'Done' : 'Edit'}
          </button>
        </div>
        <div className="p-4">
          {isEditingNotes ? (
            <textarea
              className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none"
              rows={3}
              placeholder="Add notes about this quote (pricing rationale, broker communications, etc.)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          ) : notes ? (
            <p className="text-sm text-gray-600">{notes}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">No notes added</p>
          )}
        </div>
      </div>

      {/* Compact Status Footer - Cross-Option Drift only (Bind Readiness moved to header) */}
      <div className="border-t border-gray-200 pt-4 mt-2">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          {/* Cross-Option Drift - inline */}
          {crossOptionDrift.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-gray-400 uppercase tracking-wide font-medium">Drift:</span>
              <HoverCard.Root openDelay={100} closeDelay={100}>
                <HoverCard.Trigger asChild>
                  <button className="text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {crossOptionDrift.length} difference{crossOptionDrift.length > 1 ? 's' : ''} from {peerLabel} peers
                  </button>
                </HoverCard.Trigger>
                <HoverCard.Portal>
                  <HoverCard.Content className="z-[9999] w-72 rounded-lg border border-gray-200 bg-white shadow-xl p-3" sideOffset={4}>
                    <div className="space-y-2">
                      {crossOptionDrift.slice(0, 5).map(item => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${item.type === 'missing' ? 'bg-amber-500' : 'bg-purple-500'}`} />
                            <span className="text-gray-700 truncate">{item.label}</span>
                          </div>
                          {item.action && (
                            <button
                              onClick={item.action}
                              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            >
                              →
                            </button>
                          )}
                        </div>
                      ))}
                      {crossOptionDrift.length > 5 && (
                        <div className="text-xs text-gray-400 pt-1">
                          +{crossOptionDrift.length - 5} more...
                        </div>
                      )}
                    </div>
                    <HoverCard.Arrow className="fill-white" />
                  </HoverCard.Content>
                </HoverCard.Portal>
              </HoverCard.Root>
            </div>
          )}
          {peerIds.length > 0 && crossOptionDrift.length === 0 && (
            <div className="flex items-center gap-3">
              <span className="text-gray-400 uppercase tracking-wide font-medium">Drift:</span>
              <span className="text-green-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Aligned with {peerLabel} peers
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Document History */}
      {documentHistory.length > 0 && (
        <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-xs font-bold text-gray-500 uppercase">Document History</h3>
            <span className="text-xs text-gray-400">{documentHistory.length} doc{documentHistory.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {documentHistory.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-gray-400 flex-shrink-0">{doc.document_number}</span>
                    <span className="text-gray-600 truncate">
                      {doc.quote_name || (doc.document_type === 'quote_excess' ? 'Excess' : 'Primary')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                    {doc.pdf_url && (
                      <a
                        href={doc.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                      >
                        View
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Editable premium input that only formats on blur
function PremiumInput({ value, onChange, onStartEdit }) {
  const [localValue, setLocalValue] = useState(String(value ?? 0));
  const [isFocused, setIsFocused] = useState(false);

  // Sync from parent when not focused
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(formatNumberWithCommas(value ?? 0));
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    onStartEdit?.();
    // Show raw number without commas when editing
    setLocalValue(String(value ?? 0));
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(parseFormattedNumber(localValue)) || 0;
    onChange(parsed);
    setLocalValue(formatNumberWithCommas(parsed));
  };

  const handleChange = (e) => {
    setLocalValue(e.target.value);
  };

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="w-24 text-right text-green-600 font-semibold border border-gray-200 rounded px-2 py-1 focus:border-purple-400 outline-none"
    />
  );
}

function TowerTabContent({ quote, onSave, isPending }) {
  const [isEditing, setIsEditing] = useState(false);
  const [layers, setLayers] = useState(quote?.tower_json || []);

  // Sync layers when quote changes (but not while editing)
  useEffect(() => {
    if (!isEditing) {
      setLayers(quote?.tower_json || []);
    }
  }, [quote?.id, quote?.tower_json, isEditing]);

  const handleSave = () => {
    const recalculated = recalculateAttachments(layers);
    onSave({ tower_json: recalculated, quote_name: generateOptionName({ ...quote, tower_json: recalculated }) });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLayers(quote?.tower_json || []);
    setIsEditing(false);
  };

  const updateLayer = (idx, field, value) => {
    setLayers(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  if (!layers?.length) {
    return <div className="text-center text-gray-400 py-8">No tower layers configured</div>;
  }

  return (
    <div>
      {isEditing && (
        <div className="flex justify-end gap-2 mb-3">
          <button onClick={handleCancel} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
          <button onClick={handleSave} disabled={isPending} className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50">{isPending ? 'Saving...' : 'Save'}</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2.5 text-left font-semibold">Carrier</th>
            <th className="px-4 py-2.5 text-left font-semibold">Limit</th>
            <th className="px-4 py-2.5 text-left font-semibold">Attach</th>
            <th className="px-4 py-2.5 text-right font-semibold">Premium</th>
            <th className="px-4 py-2.5 text-right font-semibold">RPM</th>
            <th className="px-4 py-2.5 text-right font-semibold">ILF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...layers].reverse().map((layer, displayIdx) => {
            const realIdx = layers.length - 1 - displayIdx;
            const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
            // For CMAI, use layer.premium or fall back to quote.sold_premium for bound quotes
            const cmaiPremium = isCMAI ? (layer.premium || quote?.sold_premium || 0) : layer.premium;
            return (
              <tr key={realIdx} className={isCMAI ? 'bg-purple-50' : 'hover:bg-gray-50'}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={isCMAI ? 'font-semibold text-purple-700' : 'text-gray-700'}>{layer.carrier || '—'}</span>
                    {isCMAI && <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded font-medium">Ours</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-700">{formatCompact(layer.limit)}</td>
                <td className="px-4 py-2.5 text-gray-500">xs {formatCompact(layer.attachment || 0)}</td>
                <td className="px-4 py-2.5 text-right">
                  {isCMAI ? (
                    <PremiumInput
                      value={cmaiPremium}
                      onChange={(val) => updateLayer(realIdx, 'premium', val)}
                      onStartEdit={() => setIsEditing(true)}
                    />
                  ) : (
                    <span className="text-gray-500">{layer.premium ? formatCurrency(layer.premium) : '—'}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-500">{layer.rpm ? formatCurrency(layer.rpm) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{layer.ilf ? `${(layer.ilf * 100).toFixed(0)}%` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CoveragesTabContent({ structure, onSave, allQuotes, submissionId, setEditControls }) {
  // Get aggregate limit from tower (CMAI layer or first layer)
  const getAggregateLimit = () => {
    if (!structure?.tower_json?.length) return 1000000;
    const cmaiLayer = structure.tower_json.find(l => l.carrier?.toUpperCase().includes('CMAI')) || structure.tower_json[0];
    return cmaiLayer?.limit || 1000000;
  };

  const aggregateLimit = getAggregateLimit();

  // Handle coverage changes for primary quotes
  const handlePrimaryCoveragesSave = (updatedCoverages) => {
    if (onSave) {
      onSave({ coverages: updatedCoverages });
    }
  };

  // Handle sublimits changes for excess quotes
  const handleExcessSublimitsSave = (updatedSublimits) => {
    if (onSave) {
      onSave({ sublimits: updatedSublimits });
    }
  };

  // For excess quotes - show compact inline editor
  // Use getStructurePosition to properly detect excess from tower structure
  if (getStructurePosition(structure) === 'excess') {
    return (
      <ExcessCoverageCompact
        sublimits={structure.sublimits || []}
        towerJson={structure.tower_json || []}
        onSave={handleExcessSublimitsSave}
        setEditControls={setEditControls}
      />
    );
  }

  // For primary quotes - show CoverageEditor
  return (
    <div className="px-4 py-2">
      <CoverageEditor
        coverages={structure?.coverages || { aggregate_coverages: {}, sublimit_coverages: {} }}
        aggregateLimit={aggregateLimit}
        onSave={handlePrimaryCoveragesSave}
        mode="quote"
        quote={structure}
        allQuotes={allQuotes}
        submissionId={submissionId}
        embedded={true}
        setEditControls={setEditControls}
      />
    </div>
  );
}

// Compact excess coverage editor for embedded use
function ExcessCoverageCompact({ sublimits, towerJson, onSave, setEditControls }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newCoverage, setNewCoverage] = useState('');
  const containerRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Calculate tower context for proportional limits
  const getTowerContext = () => {
    if (!towerJson?.length) return { ourLimit: 0, ourAttachment: 0, primaryLimit: 0 };
    const cmaiLayer = towerJson.find(l => l.carrier?.toUpperCase().includes('CMAI'));
    const primaryLayer = towerJson[0];
    const ourLimit = cmaiLayer?.limit || primaryLayer?.limit || 0;
    const ourAttachment = cmaiLayer?.attachment || 0;
    const primaryLimit = primaryLayer?.limit || 0;
    return { ourLimit, ourAttachment, primaryLimit };
  };

  const ctx = getTowerContext();

  const calcProportional = (primaryLimit) => {
    if (!primaryLimit || !ctx.primaryLimit) return { limit: 0, attachment: ctx.ourAttachment };
    const ratio = ctx.ourLimit / ctx.primaryLimit;
    return { limit: Math.round(primaryLimit * ratio), attachment: ctx.ourAttachment };
  };

  const parseValue = (raw) => {
    if (!raw && raw !== 0) return null;
    if (typeof raw === 'number') return raw;
    const str = String(raw).toUpperCase().trim();
    if (!str) return null;
    if (str.includes('M')) return parseFloat(str) * 1000000;
    if (str.includes('K')) return parseFloat(str) * 1000;
    const num = parseFloat(str.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? null : num;
  };

  const getEffectiveValues = (cov) => {
    if (cov.treatment === 'exclude') return { limit: null, attachment: null };
    const prop = calcProportional(cov.primary_limit);
    return { limit: cov.our_limit ?? prop.limit, attachment: cov.our_attachment ?? prop.attachment };
  };

  const getTreatmentStyle = (treatment, hasCustom) => {
    if (treatment === 'exclude') return 'text-red-500 bg-red-50 border-red-200';
    if (hasCustom) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getTreatmentLabel = (treatment, hasCustom) => {
    if (treatment === 'exclude') return 'Exclude';
    if (hasCustom) return 'Custom';
    return 'Follow';
  };

  const hasCustomValues = (cov) => {
    if (cov._limitInput !== undefined) {
      return cov._limitInput.trim() !== '' || cov._attachInput?.trim() !== '';
    }
    return cov.our_limit != null || cov.our_attachment != null;
  };

  // Enter edit mode
  const handleEdit = () => {
    setDraft(sublimits.map(cov => ({
      ...cov,
      _limitInput: cov.our_limit ? formatCompact(cov.our_limit).replace('$', '') : '',
      _attachInput: cov.our_attachment ? formatCompact(cov.our_attachment).replace('$', '') : '',
    })));
    setIsEditing(true);
  };

  // Cancel edit mode
  const handleCancel = () => {
    setIsEditing(false);
    setDraft([]);
    setEditControls?.(null);
  };

  // Save all changes
  const handleSave = () => {
    const updated = draftRef.current.map(cov => {
      const limitVal = parseValue(cov._limitInput);
      const attachVal = parseValue(cov._attachInput);
      const parsed = {
        ...cov,
        treatment: cov.treatment === 'exclude' ? 'exclude' : 'follow_form',
        our_limit: cov.treatment !== 'exclude' ? limitVal : null,
        our_attachment: cov.treatment !== 'exclude' ? attachVal : null,
      };
      delete parsed._limitInput;
      delete parsed._attachInput;
      return parsed;
    });
    onSave(updated);
    setIsEditing(false);
    setDraft([]);
    setEditControls?.(null);
  };

  // Update edit controls when editing state changes
  useEffect(() => {
    if (isEditing) {
      setEditControls?.(
        <>
          <button onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
          <button onClick={handleSave} className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">Save</button>
        </>
      );
    } else {
      setEditControls?.(null);
    }
    return () => setEditControls?.(null);
  }, [isEditing]);

  // Refs for grid navigation (like tower)
  const selectRefs = useRef([]);
  const limitRefs = useRef([]);
  const attachRefs = useRef([]);

  // Arrow key navigation handler (same pattern as tower)
  const handleArrowNav = (e, rowIdx, currentRefs) => {
    const colMap = [selectRefs, limitRefs, attachRefs];
    const currentColIdx = colMap.indexOf(currentRefs);

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx > 0) currentRefs.current[rowIdx - 1]?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx < currentRefs.current.length - 1) currentRefs.current[rowIdx + 1]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      for (let c = currentColIdx - 1; c >= 0; c--) {
        const target = colMap[c].current[rowIdx];
        if (target) { target.focus(); break; }
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      for (let c = currentColIdx + 1; c < colMap.length; c++) {
        const target = colMap[c].current[rowIdx];
        if (target) { target.focus(); break; }
      }
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Click outside to save
  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        handleSave();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing]);

  // Update draft field
  const updateDraft = (idx, field, value) => {
    setDraft(draft.map((cov, i) => i === idx ? { ...cov, [field]: value } : cov));
  };

  // Delete from draft
  const deleteDraft = (idx) => {
    setDraft(draft.filter((_, i) => i !== idx));
  };

  // Add new coverage (in edit mode)
  const handleAdd = () => {
    if (!newCoverage.trim()) return;
    const newCov = {
      coverage: newCoverage.trim(),
      primary_limit: 1000000,
      treatment: 'follow_form',
      our_limit: null,
      our_attachment: null,
      source: 'manual',
      _limitInput: '',
      _attachInput: '',
    };
    if (isEditing) {
      setDraft([...draft, newCov]);
    } else {
      onSave([...sublimits, {
        coverage: newCoverage.trim(),
        primary_limit: 1000000,
        treatment: 'follow_form',
        our_limit: null,
        our_attachment: null,
        source: 'manual'
      }]);
    }
    setNewCoverage('');
    setIsAdding(false);
  };

  // Bulk set all treatments
  const handleSetAll = (treatment) => {
    if (isEditing) {
      setDraft(draft.map(cov => ({ ...cov, treatment })));
    } else {
      onSave(sublimits.map(cov => ({
        ...cov,
        treatment,
        our_limit: treatment === 'different' ? cov.our_limit : null,
        our_attachment: treatment === 'different' ? cov.our_attachment : null,
      })));
    }
  };

  const data = isEditing ? draft : sublimits;

  if (data.length === 0 && !isAdding) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-gray-400 text-sm mb-2">No underlying coverages defined</p>
        <button onClick={() => setIsAdding(true)} className="text-sm text-purple-600 hover:text-purple-700 font-medium">
          + Add Coverage
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="px-4 py-2">
      {/* Header with edit/save controls */}
      <div className="flex items-center justify-between mb-3">
        {isEditing ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Set all:</span>
            <button onClick={() => handleSetAll('follow_form')} className="text-purple-600 hover:underline">Follow</button>
            <span className="text-gray-300">|</span>
            <button onClick={() => handleSetAll('exclude')} className="text-gray-500 hover:underline">Exclude</button>
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button onClick={handleSave} className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">Save</button>
            </>
          ) : (
            <button onClick={() => setIsAdding(true)} className="text-sm text-purple-600 hover:text-purple-700 font-medium">+ Add</button>
          )}
        </div>
      </div>

      {/* Coverage list - click to edit */}
      <div className={`space-y-0 ${!isEditing ? 'cursor-pointer' : ''}`} onClick={!isEditing ? handleEdit : undefined}>
        {data.map((cov, idx) => {
          const eff = getEffectiveValues(cov);
          const isExcluded = cov.treatment === 'exclude';
          const hasCustom = hasCustomValues(cov);
          const isAI = cov.source === 'extracted' || cov.source === 'ai';

          return (
            <div key={idx} data-row={idx} className={`flex items-center gap-3 py-2 border-b border-gray-100 ${isExcluded ? 'opacity-50' : ''}`}>
              {/* AI badge */}
              {isAI && (
                <svg className="w-3 h-3 text-purple-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" title="AI extracted">
                  <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z" />
                </svg>
              )}

              {/* Coverage name */}
              <div className="flex-1 min-w-0 text-sm text-gray-700 truncate" title={cov.coverage}>
                {cov.coverage || '—'}
              </div>

              {/* Primary limit */}
              <div className="w-16 text-right text-xs text-gray-400 flex-shrink-0">
                {formatCompact(cov.primary_limit)}
              </div>

              {/* Treatment - Follow/Exclude only, Custom is auto-detected */}
              {isEditing ? (
                <select
                  ref={el => selectRefs.current[idx] = el}
                  value={isExcluded ? 'exclude' : 'follow_form'}
                  onChange={(e) => updateDraft(idx, 'treatment', e.target.value)}
                  onKeyDown={(e) => handleArrowNav(e, idx, selectRefs)}
                  className={`w-[72px] text-xs py-1 px-1.5 rounded border cursor-pointer flex-shrink-0 ${getTreatmentStyle(cov.treatment, hasCustom)}`}
                >
                  <option value="follow_form">{hasCustom ? 'Custom' : 'Follow'}</option>
                  <option value="exclude">Exclude</option>
                </select>
              ) : (
                <span className={`w-[72px] text-xs py-1 px-1.5 rounded border text-center flex-shrink-0 ${getTreatmentStyle(cov.treatment, hasCustom)}`}>
                  {getTreatmentLabel(cov.treatment, hasCustom)}
                </span>
              )}

              {/* Our limit/attachment */}
              <div className="w-40 text-right text-sm flex-shrink-0">
                {isExcluded ? (
                  <span className="text-gray-300">—</span>
                ) : isEditing ? (
                  <div className="flex items-center justify-end gap-1">
                    <input
                      ref={el => limitRefs.current[idx] = el}
                      type="text"
                      value={cov._limitInput}
                      onChange={(e) => updateDraft(idx, '_limitInput', e.target.value)}
                      onKeyDown={(e) => handleArrowNav(e, idx, limitRefs)}
                      placeholder={formatCompact(calcProportional(cov.primary_limit).limit).replace('$', '')}
                      className="w-16 text-right text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-purple-400 focus:outline-none"
                    />
                    <span className="text-gray-400 text-xs">xs</span>
                    <input
                      ref={el => attachRefs.current[idx] = el}
                      type="text"
                      value={cov._attachInput}
                      onChange={(e) => updateDraft(idx, '_attachInput', e.target.value)}
                      onKeyDown={(e) => handleArrowNav(e, idx, attachRefs)}
                      placeholder={formatCompact(ctx.ourAttachment).replace('$', '')}
                      className="w-16 text-right text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-purple-400 focus:outline-none"
                    />
                  </div>
                ) : (
                  <span className="text-gray-600">
                    {formatCompact(eff.limit)} xs {formatCompact(eff.attachment)}
                  </span>
                )}
              </div>

              {/* Delete (only in edit mode) */}
              {isEditing ? (
                <button onClick={() => deleteDraft(idx)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                <div className="w-4 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Add new coverage */}
      {isAdding && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={newCoverage}
            onChange={(e) => setNewCoverage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Coverage name..."
            className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded focus:border-purple-400 focus:outline-none"
            autoFocus
          />
          <button onClick={handleAdd} className="text-sm text-purple-600 hover:text-purple-700 font-medium px-2">Add</button>
          <button onClick={() => { setIsAdding(false); setNewCoverage(''); }} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      )}
    </div>
  );
}

function EndorsementsTabContent({ structureId, structure, structures, submissionId, setEditControls }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState('');
  const [smartSaveContext, setSmartSaveContext] = useState(null);
  const [sharedRemovalContext, setSharedRemovalContext] = useState(null);
  const containerRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const defaultScope = getStructurePosition(structure) === 'excess' ? 'excess' : 'primary';

  const { data: endorsementsData, isLoading } = useQuery({
    queryKey: ['quote-endorsements', structureId],
    queryFn: () => getQuoteEndorsements(structureId).then(r => r.data),
    enabled: !!structureId,
  });
  // Sort endorsements: required first, automatic next, manual last
  const endorsements = [...(endorsementsData?.endorsements || [])].sort((a, b) => {
    const aRequired = a.category === 'required' || a.is_required ? 2 : 0;
    const bRequired = b.category === 'required' || b.is_required ? 2 : 0;
    const aAuto = a.is_auto || a.auto_attach_rules || a.attachment_type === 'auto' ? 1 : 0;
    const bAuto = b.is_auto || b.auto_attach_rules || b.attachment_type === 'auto' ? 1 : 0;
    return (bRequired + bAuto) - (aRequired + aAuto);
  });

  const { data: libraryEndorsementsData } = useQuery({
    queryKey: ['endorsement-library'],
    queryFn: () => getDocumentLibraryEntries({ document_type: 'endorsement', status: 'active' }).then(r => r.data),
    enabled: isAddingOpen,
  });
  const libraryEndorsements = libraryEndorsementsData || [];

  const { data: submissionEndorsementsData } = useQuery({
    queryKey: ['submissionEndorsements', submissionId],
    queryFn: () => getSubmissionEndorsements(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });
  const submissionEndorsements = submissionEndorsementsData?.endorsements || [];
  const sharedEndorsementMap = useMemo(() => {
    const map = new Map();
    submissionEndorsements.forEach(endt => {
      const key = String(endt.endorsement_id || endt.document_library_id || endt.id || endt.code || endt.title);
      map.set(key, new Set(parseQuoteIds(endt.quote_ids)));
    });
    return map;
  }, [submissionEndorsementsData]);

  const linkedIds = new Set(endorsements.map(e => e.endorsement_id || e.document_library_id));
  const availableEndorsements = libraryEndorsements.filter(e => !linkedIds.has(e.id));
  const filteredAvailable = availableEndorsements.filter(e =>
    !addSearchTerm || e.title?.toLowerCase().includes(addSearchTerm.toLowerCase())
  );

  const getSharedEndorsementInfo = (endt) => {
    const key = String(endt.endorsement_id || endt.document_library_id || endt.id || endt.code || endt.title);
    const quoteIds = Array.from(sharedEndorsementMap.get(key) || []);
    const otherCount = quoteIds.filter(id => id !== String(structureId)).length;
    return { quoteIds, otherCount, totalCount: quoteIds.length };
  };

  const linkMutation = useMutation({
    mutationFn: (endorsementId) => linkEndorsementToQuote(structureId, endorsementId),
    onMutate: async (endorsementId) => {
      await queryClient.cancelQueries({ queryKey: ['quote-endorsements', structureId] });
      const previous = queryClient.getQueryData(['quote-endorsements', structureId]);
      // Find the endorsement from library to add optimistically
      const libEntry = libraryEndorsements.find(e => e.id === endorsementId);
      if (libEntry) {
        const optimisticEntry = {
          id: `temp-${endorsementId}`,
          endorsement_id: endorsementId,
          title: libEntry.title,
          code: libEntry.code,
          category: libEntry.category,
        };
        queryClient.setQueryData(['quote-endorsements', structureId], (old) => ({
          ...old,
          endorsements: [...(old?.endorsements || []), optimisticEntry],
          matched_library_ids: [...(old?.matched_library_ids || []), endorsementId]
        }));
        setDraft(d => [...d, optimisticEntry]);
      }
      setAddSearchTerm('');
      setIsAddingOpen(false);
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['quote-endorsements', structureId], ctx.previous);
    },
    onSuccess: (result, title) => {
      const newId = result?.data?.id;
      if (newId) {
        setSmartSaveContext({
          endorsementId: newId,
          label: title,
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (endorsementId) => unlinkEndorsementFromQuote(structureId, endorsementId),
    onMutate: async (endorsementId) => {
      await queryClient.cancelQueries({ queryKey: ['quote-endorsements', structureId] });
      const previous = queryClient.getQueryData(['quote-endorsements', structureId]);
      // Data structure is { endorsements: [...], matched_library_ids: [...] }
      queryClient.setQueryData(['quote-endorsements', structureId], (old) => ({
        ...old,
        endorsements: (old?.endorsements || []).filter(e => e.endorsement_id !== endorsementId),
        matched_library_ids: (old?.matched_library_ids || []).filter(id => id !== endorsementId)
      }));
      setDraft(d => d.filter(x => x.endorsement_id !== endorsementId));
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['quote-endorsements', structureId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (title) => {
      const code = `MS-${Date.now().toString(36).toUpperCase()}`;
      const result = await createDocumentLibraryEntry({
        code, document_type: 'endorsement', title, category: 'manuscript', status: 'active',
      });
      if (result.data?.id) {
        await linkEndorsementToQuote(structureId, result.data.id);
      }
      return { ...result, code };
    },
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: ['quote-endorsements', structureId] });
      const previous = queryClient.getQueryData(['quote-endorsements', structureId]);
      const tempId = `temp-ms-${Date.now()}`;
      const optimisticEntry = {
        id: tempId,
        endorsement_id: tempId,
        title,
        code: 'MS-...',
        category: 'manuscript',
      };
      queryClient.setQueryData(['quote-endorsements', structureId], (old) => ({
        ...old,
        endorsements: [...(old?.endorsements || []), optimisticEntry],
      }));
      setDraft(d => [...d, optimisticEntry]);
      setAddSearchTerm('');
      setIsAddingOpen(false);
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['quote-endorsements', structureId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-endorsements', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
    },
  });

  const applyScopeMutation = useMutation({
    mutationFn: async ({ endorsementId, targetIds }) => {
      await Promise.all(targetIds.map(id => linkEndorsementToQuote(id, endorsementId)));
    },
    onSuccess: (_, vars) => {
      (vars?.targetIds || []).forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['quote-endorsements', id] });
      });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
    },
  });

  const removeSharedMutation = useMutation({
    mutationFn: async ({ endorsementId, quoteIds }) => {
      await Promise.all(quoteIds.map(id => unlinkEndorsementFromQuote(id, endorsementId)));
    },
    onSuccess: (_, vars) => {
      (vars?.quoteIds || []).forEach(id => {
        queryClient.invalidateQueries({ queryKey: ['quote-endorsements', id] });
      });
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
    },
  });

  const getTypeIcon = (endt) => {
    const isAuto = endt.is_auto || endt.auto_attach_rules || endt.attachment_type === 'auto';
    const isRequired = endt.category === 'required' || endt.is_required;
    if (isRequired) return <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>;
    if (isAuto) return <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
    return <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
  };

  // Enter edit mode
  const handleEdit = () => {
    setDraft(endorsements.map(e => ({ ...e })));
    setIsEditing(true);
  };

  // Cancel edit mode
  const handleCancel = () => {
    setIsEditing(false);
    setDraft([]);
    setEditControls?.(null);
  };

  // Save changes - for endorsements we just exit edit mode since changes are made via mutations
  const handleSave = () => {
    setIsEditing(false);
    setDraft([]);
    setEditControls?.(null);
  };

  // Update edit controls when editing state changes
  useEffect(() => {
    if (isEditing) {
      setEditControls?.(
        <>
          <button onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
          <button onClick={handleSave} className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">Done</button>
        </>
      );
    } else {
      setEditControls?.(null);
    }
    return () => setEditControls?.(null);
  }, [isEditing]);

  // Click outside to exit edit mode
  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        handleSave();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleCancel();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing]);

  const handleSmartSaveConfirm = (scope) => {
    if (!smartSaveContext) return;
    if (scope === 'single') {
      setSmartSaveContext(null);
      return;
    }
    const targetIds = getScopeTargetIds(structures, scope, structureId);
    applyScopeMutation.mutate({ endorsementId: smartSaveContext.endorsementId, targetIds });
    setSmartSaveContext(null);
  };

  const handleRemoveEndorsement = (endt) => {
    const sharedInfo = getSharedEndorsementInfo(endt);
    if (sharedInfo.otherCount > 0) {
      setSharedRemovalContext({
        endorsementId: endt.endorsement_id,
        label: endt.title || endt.name || endt.code || 'Endorsement',
        quoteIds: sharedInfo.quoteIds,
        sharedCount: sharedInfo.totalCount,
      });
      return;
    }
    unlinkMutation.mutate(endt.endorsement_id);
  };

  const handleSharedRemovalConfirm = (scope) => {
    if (!sharedRemovalContext) return;
    if (scope === 'single') {
      unlinkMutation.mutate(sharedRemovalContext.endorsementId);
    } else {
      removeSharedMutation.mutate({
        endorsementId: sharedRemovalContext.endorsementId,
        quoteIds: sharedRemovalContext.quoteIds,
      });
    }
    setSharedRemovalContext(null);
  };

  const handleAddEndorsement = (endt) => {
    linkMutation.mutate(endt.id, {
      onSuccess: () => {
        setSmartSaveContext({
          endorsementId: endt.id,
          label: endt.title || endt.name || endt.code || 'Endorsement',
        });
      },
    });
  };

  if (isLoading) return <div className="text-center text-gray-400 py-8">Loading...</div>;

  return (
    <div ref={containerRef}>
      {endorsements.length === 0 && !isEditing ? (
        <div className="text-center text-gray-400 py-8">No endorsements attached</div>
      ) : (
        <table className="w-full text-sm mb-4">
          <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold w-10"></th>
              <th className="px-4 py-2.5 text-left font-semibold">Code</th>
              <th className="px-4 py-2.5 text-left font-semibold">Title</th>
              {isEditing && <th className="px-4 py-2.5 w-10"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(isEditing ? draft : endorsements).map(endt => {
              const sharedInfo = getSharedEndorsementInfo(endt);
              const isShared = sharedInfo.otherCount > 0;
              return (
                <tr
                  key={endt.id}
                  className={`hover:bg-gray-50 ${!isEditing ? 'cursor-pointer' : ''}`}
                  onClick={!isEditing ? handleEdit : undefined}
                >
                  <td className="px-4 py-2.5">{getTypeIcon(endt)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-600">{endt.code || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-700">
                    <div className="flex items-center gap-2">
                      <span>{endt.title || endt.name || '—'}</span>
                      {isShared && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                          Shared
                        </span>
                      )}
                    </div>
                  </td>
                  {isEditing && (
                    <td className="px-4 py-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveEndorsement(endt); }}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {isAddingOpen ? (
        <div className="border border-purple-200 rounded-lg bg-purple-50/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search or type manuscript..."
              value={addSearchTerm}
              onChange={(e) => setAddSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && addSearchTerm.trim()) {
                  console.log('Enter pressed, creating:', addSearchTerm.trim());
                  createMutation.mutate(addSearchTerm.trim());
                }
              }}
              className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-purple-300"
              autoFocus
            />
            <button onClick={() => { setIsAddingOpen(false); setAddSearchTerm(''); }} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filteredAvailable.slice(0, 8).map(endt => (
              <button key={endt.id} onClick={() => handleAddEndorsement(endt)} className="w-full p-2 rounded border border-gray-100 bg-white hover:bg-purple-50 hover:border-purple-200 text-left text-sm">
                <span className="font-medium text-gray-700">{endt.title}</span>
              </button>
            ))}
            {addSearchTerm.trim() && (
              <button
                onClick={() => createMutation.mutate(addSearchTerm.trim())}
                disabled={createMutation.isPending}
                className="w-full p-2 rounded border border-purple-200 bg-purple-50 hover:bg-purple-100 text-left text-sm disabled:opacity-50"
              >
                <span className="text-purple-700 font-medium">
                  {createMutation.isPending ? 'Creating...' : `+ Create manuscript: "${addSearchTerm.trim()}"`}
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <button onClick={() => { setIsAddingOpen(true); if (!isEditing) handleEdit(); }} className="text-sm text-purple-600 hover:text-purple-700 font-medium">+ Add Endorsement</button>
      )}

      <SmartSaveModal
        isOpen={!!smartSaveContext}
        title="Apply this endorsement to"
        defaultScope={defaultScope}
        onConfirm={handleSmartSaveConfirm}
        onCancel={() => setSmartSaveContext(null)}
      />

      <SharedRemovalModal
        isOpen={!!sharedRemovalContext}
        title={`Remove "${sharedRemovalContext?.label || 'Endorsement'}"`}
        sharedCount={sharedRemovalContext?.sharedCount}
        onConfirm={handleSharedRemovalConfirm}
        onCancel={() => setSharedRemovalContext(null)}
      />
    </div>
  );
}

function SubjectivitiesTabContent({ structureId, submissionId, structures, structure, setEditControls }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState('');
  const [smartSaveContext, setSmartSaveContext] = useState(null);
  const [sharedRemovalContext, setSharedRemovalContext] = useState(null);
  const containerRef = useRef(null);
  const defaultScope = getStructurePosition(structure) === 'excess' ? 'excess' : 'primary';

  const { data: subjectivitiesData, isLoading } = useQuery({
    queryKey: ['quote-subjectivities', structureId],
    queryFn: () => getQuoteSubjectivities(structureId).then(r => r.data),
    enabled: !!structureId,
  });
  // Sort required subjectivities to top
  const subjectivities = [...(subjectivitiesData || [])].sort((a, b) => {
    const aRequired = a.is_required || a.category === 'required' ? 1 : 0;
    const bRequired = b.is_required || b.category === 'required' ? 1 : 0;
    return bRequired - aRequired;
  });

  const { data: librarySubjectivitiesData } = useQuery({
    queryKey: ['subjectivity-templates'],
    queryFn: () => getSubjectivityTemplates().then(r => r.data),
    enabled: isAddingOpen,
  });
  const librarySubjectivities = librarySubjectivitiesData || [];

  const { data: submissionSubjectivitiesData } = useQuery({
    queryKey: ['submissionSubjectivities', submissionId],
    queryFn: () => getSubmissionSubjectivities(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });
  const submissionSubjectivities = submissionSubjectivitiesData || [];
  const sharedSubjectivityMap = useMemo(() => {
    const map = new Map();
    submissionSubjectivities.forEach(subj => {
      const key = normalizeText(subj.text || subj.subjectivity_text || subj.title);
      if (!key) return;
      const existing = map.get(key) || new Set();
      parseQuoteIds(subj.quote_ids).forEach(id => existing.add(id));
      map.set(key, existing);
    });
    return map;
  }, [submissionSubjectivitiesData]);

  const linkedIds = new Set(subjectivities.map(s => s.subjectivity_id || s.template_id));
  const availableSubjectivities = librarySubjectivities.filter(s => !linkedIds.has(s.id));
  const filteredAvailable = availableSubjectivities.filter(s =>
    !addSearchTerm || (s.text || s.subjectivity_text)?.toLowerCase().includes(addSearchTerm.toLowerCase())
  );

  const getSharedSubjectivityInfo = (subj) => {
    const key = normalizeText(subj.text || subj.subjectivity_text || subj.title);
    const quoteIds = Array.from(sharedSubjectivityMap.get(key) || []);
    const otherCount = quoteIds.filter(id => id !== String(structureId)).length;
    return { quoteIds, otherCount, totalCount: quoteIds.length };
  };

  const linkMutation = useMutation({
    mutationFn: (subjectivityId) => linkSubjectivityToQuote(structureId, subjectivityId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] }),
  });

  const unlinkMutation = useMutation({
    mutationFn: (subjectivityId) => unlinkSubjectivityFromQuote(structureId, subjectivityId),
    onMutate: async (subjectivityId) => {
      await queryClient.cancelQueries({ queryKey: ['quote-subjectivities', structureId] });
      const previous = queryClient.getQueryData(['quote-subjectivities', structureId]);
      queryClient.setQueryData(['quote-subjectivities', structureId], (old) =>
        (old || []).filter(s => s.id !== subjectivityId)
      );
      setDraft(d => d.filter(x => x.id !== subjectivityId));
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['quote-subjectivities', structureId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (subjectivityId) => deleteSubjectivity(subjectivityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (text) => createSubjectivity(submissionId, { text, quote_ids: [structureId] }),
    onSuccess: (data, text) => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      if (data?.id) {
        setSmartSaveContext({
          type: 'add',
          subjectivityId: data.id,
          text,
        });
      }
      setAddSearchTerm('');
      setIsAddingOpen(false);
    },
  });

  // Update subjectivity mutation (status or text)
  const updateMutation = useMutation({
    mutationFn: ({ subjectivityId, updates }) => updateSubjectivity(subjectivityId, updates),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', structureId] });
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
    },
  });

  // Refs to avoid stale closures
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Save all changes
  const handleSave = () => {
    const currentDraft = draftRef.current;
    const updates = currentDraft.reduce((acc, item) => {
      const original = subjectivities.find(s => s.id === item.id);
      const origText = original?.text || original?.subjectivity_text || '';
      const origStatus = original?.status || 'pending';
      if (item.text !== origText || item.status !== origStatus) {
        acc.push({
          subjectivityId: item.id,
          updates: { text: item.text, status: item.status },
          text: item.text || origText,
        });
      }
      return acc;
    }, []);

    if (updates.length === 0) {
      setIsEditing(false);
      setDraft([]);
      setEditControls?.(null);
      return;
    }

    setSmartSaveContext({ type: 'edit', updates });
  };

  // Cancel edit mode
  const handleCancel = () => {
    setIsEditing(false);
    setDraft([]);
    setEditControls?.(null);
  };

  // Enter edit mode
  const handleEdit = () => {
    setDraft(subjectivities.map(s => ({
      id: s.id,
      text: s.text || s.subjectivity_text || '',
      status: s.status || 'pending',
    })));
    setIsEditing(true);
  };

  // Update edit controls when editing state changes
  useEffect(() => {
    if (isEditing) {
      setEditControls?.(
        <>
          <button onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
          <button onClick={handleSave} className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">Save</button>
        </>
      );
    } else {
      setEditControls?.(null);
    }
    return () => setEditControls?.(null);
  }, [isEditing]);

  // Update draft field
  const updateDraft = (id, field, value) => {
    setDraft(draft.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  // Click outside to save
  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        handleSave();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, draft]);

  const applySubjectivityScope = (text, scope) => {
    if (!submissionId) return Promise.resolve();
    if (scope === 'primary') {
      return createSubjectivity(submissionId, { text, position: 'primary' });
    }
    if (scope === 'excess') {
      return createSubjectivity(submissionId, { text, position: 'excess' });
    }
    if (scope === 'all') {
      return createSubjectivity(submissionId, { text });
    }
    return Promise.resolve();
  };

  const handleSmartSaveConfirm = async (scope) => {
    if (!smartSaveContext) return;
    const targetIds = getScopeTargetIds(structures, scope, structureId);

    if (smartSaveContext.type === 'edit') {
      for (const item of smartSaveContext.updates) {
        await updateMutation.mutateAsync({ subjectivityId: item.subjectivityId, updates: item.updates });
      }
      if (scope !== 'single') {
        for (const item of smartSaveContext.updates) {
          await applySubjectivityScope(item.text, scope);
        }
      }
    }

    if (smartSaveContext.type === 'add' && scope !== 'single') {
      await applySubjectivityScope(smartSaveContext.text, scope);
    }

    targetIds.forEach(id => {
      queryClient.invalidateQueries({ queryKey: ['quote-subjectivities', id] });
    });
    queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });

    setIsEditing(false);
    setDraft([]);
    setEditControls?.(null);
    setSmartSaveContext(null);
  };

  const handleRemoveSubjectivity = (subj) => {
    const sharedInfo = getSharedSubjectivityInfo(subj);
    if (sharedInfo.otherCount > 0) {
      setSharedRemovalContext({
        subjectivityId: subj.id,
        label: subj.text || subj.subjectivity_text || subj.title || 'Subjectivity',
        sharedCount: sharedInfo.totalCount,
      });
      return;
    }
    unlinkMutation.mutate(subj.id);
  };

  const handleSharedRemovalConfirm = (scope) => {
    if (!sharedRemovalContext) return;
    if (scope === 'single') {
      unlinkMutation.mutate(sharedRemovalContext.subjectivityId);
    } else {
      deleteMutation.mutate(sharedRemovalContext.subjectivityId);
    }
    setSharedRemovalContext(null);
  };

  // Status icon helper
  const getStatusIcon = (status) => {
    if (status === 'received') return <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    if (status === 'waived') return <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>;
    return <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  };

  if (isLoading) return <div className="text-center text-gray-400 py-8">Loading...</div>;

  const data = isEditing ? draft : subjectivities;

  return (
    <div ref={containerRef}>
      {data.length === 0 ? (
        <div className="text-center text-gray-400 py-8">No subjectivities attached</div>
      ) : (
        <table className="w-full text-sm mb-4">
          <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left font-semibold w-28">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Subjectivity</th>
              {isEditing && <th className="px-3 py-2 w-8"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map(subj => {
              const status = isEditing ? subj.status : (subj.status || 'pending');
              const text = isEditing ? subj.text : (subj.text || subj.subjectivity_text || '');
              const sharedInfo = getSharedSubjectivityInfo(subj);
              const isShared = sharedInfo.otherCount > 0;

              return (
                <tr
                  key={subj.id}
                  className={`${isEditing ? 'bg-blue-50/30' : 'hover:bg-gray-50 cursor-pointer'}`}
                  onClick={() => !isEditing && handleEdit()}
                >
                  <td className="px-3 py-2.5">
                    {isEditing ? (
                      <select
                        value={status}
                        onChange={(e) => updateDraft(subj.id, 'status', e.target.value)}
                        className={`text-xs border rounded px-2 py-1 outline-none cursor-pointer ${
                          status === 'received' ? 'border-green-300 bg-green-50 text-green-700' :
                          status === 'waived' ? 'border-gray-300 bg-gray-50 text-gray-500' :
                          'border-amber-300 bg-amber-50 text-amber-700'
                        }`}
                      >
                        <option value="pending">Pending</option>
                        <option value="received">Received</option>
                        <option value="waived">Waived</option>
                      </select>
                    ) : (
                      getStatusIcon(status)
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {isEditing ? (
                      <input
                        type="text"
                        value={text}
                        onChange={(e) => updateDraft(subj.id, 'text', e.target.value)}
                        className="w-full text-sm text-gray-700 border border-gray-200 rounded px-2 py-1 outline-none focus:border-purple-400"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">{text}</span>
                        {isShared && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            Shared
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  {isEditing && (
                    <td className="px-3 py-2.5">
                      <button onClick={(e) => { e.stopPropagation(); handleRemoveSubjectivity(subj); }} className="text-gray-400 hover:text-red-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {isAddingOpen ? (
        <div className="border border-purple-200 rounded-lg bg-purple-50/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search or type new..."
              value={addSearchTerm}
              onChange={(e) => setAddSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && addSearchTerm.trim()) {
                  createMutation.mutate(addSearchTerm.trim());
                }
              }}
              className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-purple-300"
              autoFocus
            />
            <button onClick={() => { setIsAddingOpen(false); setAddSearchTerm(''); }} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {filteredAvailable.slice(0, 8).map(subj => (
              <button
                key={subj.id}
                onClick={() => createMutation.mutate(subj.text || subj.subjectivity_text)}
                disabled={createMutation.isPending}
                className="w-full p-2 rounded border border-gray-100 bg-white hover:bg-purple-50 hover:border-purple-200 text-left text-sm cursor-pointer transition-colors disabled:opacity-50"
              >
                <span className="text-gray-700">{subj.text || subj.subjectivity_text}</span>
              </button>
            ))}
            {addSearchTerm.trim() && (
              <button
                onClick={() => createMutation.mutate(addSearchTerm.trim())}
                disabled={createMutation.isPending}
                className="w-full p-2 rounded border border-purple-200 bg-purple-50 hover:bg-purple-100 text-left text-sm"
              >
                <span className="text-purple-700 font-medium">+ Create "{addSearchTerm.trim()}"</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <button onClick={() => setIsAddingOpen(true)} className="text-sm text-purple-600 hover:text-purple-700 font-medium">+ Add Subjectivity</button>
      )}

      <SmartSaveModal
        isOpen={!!smartSaveContext}
        title="Apply this subjectivity to"
        defaultScope={defaultScope}
        onConfirm={handleSmartSaveConfirm}
        onCancel={() => setSmartSaveContext(null)}
      />

      <SharedRemovalModal
        isOpen={!!sharedRemovalContext}
        title={`Remove "${sharedRemovalContext?.label || 'Subjectivity'}"`}
        sharedCount={sharedRemovalContext?.sharedCount}
        onConfirm={handleSharedRemovalConfirm}
        onCancel={() => setSharedRemovalContext(null)}
      />
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function QuotePageV3() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();

  // Persist selected option in sessionStorage (keyed by submission)
  // This survives tab navigation better than URL params
  const [activeStructureId, setActiveStructureIdInternal] = useState(() => {
    // Read directly in initializer to avoid closure issues
    if (!submissionId) return null;
    const stored = sessionStorage.getItem(`quote-option-${submissionId}`);
    return stored || null; // IDs are UUIDs (strings), not numbers
  });

  // Sync from sessionStorage when component re-mounts (e.g., navigating back)
  useEffect(() => {
    if (!submissionId) return;
    const storedId = sessionStorage.getItem(`quote-option-${submissionId}`);
    if (storedId && storedId !== activeStructureId) {
      setActiveStructureIdInternal(storedId);
    }
  }, [submissionId]); // Only on mount / submissionId change

  // Wrapper to update both state and sessionStorage
  const setActiveStructureId = useCallback((id) => {
    setActiveStructureIdInternal(id);
    if (id && submissionId) {
      sessionStorage.setItem(`quote-option-${submissionId}`, String(id));
    }
  }, [submissionId]);
  const [activeVariationId, setActiveVariationId] = useState(null);
  const [sidePanelTab, setSidePanelTab] = useState('terms');
  const [mainTab, setMainTab] = useState('summary');
  const [viewMode, setViewMode] = useState('single'); // 'single' or 'grid'
  const [summaryScope, setSummaryScope] = useState('quote'); // 'quote' or 'submission' - for single view mode
  const [showStructureDropdown, setShowStructureDropdown] = useState(false);
  const [isStructurePickerExpanded, setIsStructurePickerExpanded] = useState(false);
  const [editControls, setEditControls] = useState(null); // For Cancel/Save buttons from child components
  const dropdownRef = useRef(null);
  const optionSelectorButtonRef = useRef(null);
  const [modalPosition, setModalPosition] = useState({ top: 0, right: 0 });

  // Calculate modal position relative to button when it opens
  useEffect(() => {
    if (isStructurePickerExpanded && optionSelectorButtonRef.current) {
      const buttonRect = optionSelectorButtonRef.current.getBoundingClientRect();
      const modalWidth = 320; // w-80 = 320px
      const viewportPadding = 16; // 16px padding from viewport edges
      
      // Position modal directly over the button, with top edges aligned
      let top = buttonRect.top;
      let right = window.innerWidth - buttonRect.right;
      
      // Ensure modal doesn't go off bottom of screen
      const estimatedModalHeight = 500; // Approximate max height
      if (top + estimatedModalHeight > window.innerHeight - viewportPadding) {
        // Adjust to fit within viewport, keeping top aligned if possible
        top = Math.max(viewportPadding, window.innerHeight - estimatedModalHeight - viewportPadding);
      }
      
      // Ensure modal doesn't go off right edge
      if (right < viewportPadding) {
        right = viewportPadding;
      }
      
      // Ensure modal doesn't go off left edge
      if (right + modalWidth > window.innerWidth - viewportPadding) {
        right = window.innerWidth - modalWidth - viewportPadding;
      }
      
      setModalPosition({ top, right });
    }
  }, [isStructurePickerExpanded]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowStructureDropdown(false);
      }
    };
    if (showStructureDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showStructureDropdown]);

  // Fetch submission
  const { data: submission } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  // Fetch structures with variations
  const { data: rawStructures = [], isLoading: structuresLoading } = useQuery({
    queryKey: ['structures', submissionId],
    queryFn: () => getQuoteStructures(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  // Fetch policy data to get sold_premium for bound quotes
  const { data: policyData } = useQuery({
    queryKey: ['policy-data', submissionId],
    queryFn: () => getPolicyData(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  // Augment structures with sold_premium from policy data for bound quotes
  const structures = useMemo(() => {
    const boundOption = policyData?.bound_option;
    if (!boundOption) return rawStructures;

    return rawStructures.map(s => {
      if (s.id === boundOption.id || s.is_bound) {
        return {
          ...s,
          sold_premium: boundOption.sold_premium || s.sold_premium,
          is_bound: true, // Ensure is_bound is set
        };
      }
      return s;
    });
  }, [rawStructures, policyData]);

  // Set initial active structure/variation when data loads
  useEffect(() => {
    if (structures.length && !activeStructureId) {
      // Check if sessionStorage has a valid option ID (IDs are UUID strings)
      const storedId = submissionId ? sessionStorage.getItem(`quote-option-${submissionId}`) : null;
      const storedStructure = storedId ? structures.find(s => s.id === storedId) : null;

      if (storedStructure) {
        setActiveStructureId(storedStructure.id);
        if (storedStructure.variations?.length) {
          setActiveVariationId(storedStructure.variations[0].id);
        }
      } else {
        setActiveStructureId(structures[0].id);
        if (structures[0].variations?.length) {
          setActiveVariationId(structures[0].variations[0].id);
        }
      }
    }
  }, [structures, activeStructureId, submissionId, setActiveStructureId]);

  // Get current active structure/variation
  const activeStructure = structures.find(s => s.id === activeStructureId) || structures[0];
  const variations = activeStructure?.variations || [];
  const activeVariation = variations.find(v => v.id === activeVariationId) || variations[0];

  // Fetch endorsements count for sidebar badge
  const { data: endorsementsData } = useQuery({
    queryKey: ['quote-endorsements', activeStructure?.id],
    queryFn: () => getQuoteEndorsements(activeStructure.id).then(r => r.data),
    enabled: !!activeStructure?.id,
  });
  const endorsementCount = endorsementsData?.endorsements?.length || 0;

  // Fetch subjectivities count for sidebar badge
  const { data: subjectivitiesData } = useQuery({
    queryKey: ['quote-subjectivities', activeStructure?.id],
    queryFn: () => getQuoteSubjectivities(activeStructure.id).then(r => r.data),
    enabled: !!activeStructure?.id,
  });
  const subjectivityCount = subjectivitiesData?.length || 0;
  const pendingSubjectivityCount = subjectivitiesData?.filter(s => s.status === 'pending' || !s.status).length || 0;

  // Bind readiness check (simplified for header display)
  const bindReadiness = useMemo(() => {
    const tower = activeStructure?.tower_json || [];
    const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
    // For bound quotes, use sold_premium
    const premium = activeStructure?.sold_premium || cmaiLayer?.premium || 0;
    const effectiveDate = activeStructure?.effective_date || submission?.effective_date;

    const blockers = [];
    const warnings = [];

    if (premium <= 0 && !activeStructure?.is_bound) blockers.push('Premium not set');
    if (!effectiveDate) blockers.push('Effective date missing');
    if (pendingSubjectivityCount > 0) warnings.push(`${pendingSubjectivityCount} pending subjectivit${pendingSubjectivityCount === 1 ? 'y' : 'ies'}`);

    return {
      isReady: blockers.length === 0 && warnings.length === 0,
      hasBlockers: blockers.length > 0,
      hasWarnings: warnings.length > 0,
      blockers,
      warnings,
    };
  }, [activeStructure, submission, pendingSubjectivityCount]);

  // Fetch document history for the entire submission (persists across options)
  const { data: documentHistory = [] } = useQuery({
    queryKey: ['submission-documents', submissionId],
    queryFn: () => getSubmissionDocuments(submissionId).then(r => r.data),
    enabled: !!submissionId,
  });

  // Create structure mutation
  const createStructureMutation = useMutation({
    mutationFn: (data) => createQuoteOption(submissionId, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      if (response.data?.id) {
        setActiveStructureId(response.data.id);
      }
    },
  });

  // Clone structure mutation
  const cloneStructureMutation = useMutation({
    mutationFn: (structureId) => cloneQuoteOption(structureId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      // Select the newly cloned structure
      if (response.data?.id) {
        setActiveStructureId(response.data.id);
      }
    },
  });

  // Delete structure mutation
  const deleteStructureMutation = useMutation({
    mutationFn: (structureId) => deleteQuoteOption(structureId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      // Select first remaining structure
      const remaining = structures.filter(s => s.id !== activeStructureId);
      if (remaining.length) {
        setActiveStructureId(remaining[0].id);
      }
    },
  });

  // Update tower mutation
  const updateTowerMutation = useMutation({
    mutationFn: ({ quoteId, data }) => updateQuoteOption(quoteId, data),
    onMutate: async ({ quoteId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['structures', submissionId] });
      const previous = queryClient.getQueryData(['structures', submissionId]);
      queryClient.setQueryData(['structures', submissionId], (old) =>
        old?.map(s => s.id === quoteId ? { ...s, ...data } : s)
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['structures', submissionId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
    },
  });

  // Create variation mutation
  const createVariationMutation = useMutation({
    mutationFn: (structureId) => createVariation(structureId, {}),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      if (response.data?.id) {
        setActiveVariationId(response.data.id);
      }
    },
  });

  // Delete variation mutation (variations are stored as insurance_towers records)
  const deleteVariationMutation = useMutation({
    mutationFn: (variationId) => deleteQuoteOption(variationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      // Select first remaining variation
      if (variations.length > 1) {
        const remaining = variations.filter(v => v.id !== activeVariationId);
        if (remaining.length) {
          setActiveVariationId(remaining[0].id);
        }
      }
    },
  });

  // Generate quote document mutation
  const [generateSuccess, setGenerateSuccess] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const generateDocumentMutation = useMutation({
    mutationFn: (quoteId) => generateQuoteDocument(quoteId),
    onSuccess: (response) => {
      console.log('Generate document response:', response);
      setGenerateSuccess(true);
      setGenerateError(null);
      setShowGeneratePicker(false);
      setTimeout(() => setGenerateSuccess(false), 3000);
      // Refresh document history
      queryClient.invalidateQueries({ queryKey: ['submission-documents', submissionId] });
      // If the response includes a document URL, open it
      if (response.data?.pdf_url) {
        window.open(response.data.pdf_url, '_blank');
      } else if (response.data?.document_url) {
        window.open(response.data.document_url, '_blank');
      } else {
        console.log('No URL in response:', response.data);
      }
    },
    onError: (error) => {
      console.error('Generate document error:', error);
      setGenerateError(error.response?.data?.detail || error.message || 'Failed to generate');
      setShowGeneratePicker(true); // Keep picker open to show error
      setTimeout(() => setGenerateError(null), 5000);
    },
  });

  const handleGenerateDocument = () => {
    console.log('handleGenerateDocument called', { activeStructureId, generateDocType, selectedPackageDocs, includeSpecimen });
    if (activeStructureId) {
      if (generateDocType === 'package') {
        console.log('Calling generatePackageMutation with:', activeStructureId, selectedPackageDocs, includeSpecimen, includeEndorsements);
        generatePackageMutation.mutate({
          quoteId: activeStructureId,
          selectedDocuments: selectedPackageDocs,
          includeSpecimen: includeSpecimen,
          includeEndorsements: includeEndorsements,
        });
      } else {
        console.log('Calling generateDocumentMutation with:', activeStructureId);
        generateDocumentMutation.mutate(activeStructureId);
      }
    } else {
      console.error('No activeStructureId available');
      setGenerateError('No quote selected');
    }
  };

  // Generate package mutation
  const generatePackageMutation = useMutation({
    mutationFn: ({ quoteId, selectedDocuments, includeSpecimen, includeEndorsements }) => generateQuotePackage(quoteId, {
      package_type: 'full_package',
      selected_documents: selectedDocuments || [],
      include_specimen: includeSpecimen || false,
      include_endorsements: includeEndorsements !== false, // Default true
    }),
    onSuccess: (response) => {
      console.log('Generate package response:', response);
      setGenerateSuccess(true);
      setGenerateError(null);
      setShowGeneratePicker(false);
      setTimeout(() => setGenerateSuccess(false), 3000);
      // Refresh document history
      queryClient.invalidateQueries({ queryKey: ['submission-documents', submissionId] });
      if (response.data?.pdf_url) {
        window.open(response.data.pdf_url, '_blank');
      } else if (response.data?.document_url) {
        window.open(response.data.document_url, '_blank');
      } else {
        console.log('No URL in package response:', response.data);
      }
    },
    onError: (error) => {
      console.error('Generate package error:', error);
      setGenerateError(error.response?.data?.detail || error.message || 'Failed to generate package');
      setShowGeneratePicker(true); // Keep picker open to show error
      setTimeout(() => setGenerateError(null), 5000);
    },
  });

  // Preview document handler - generates on-the-fly without saving
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const handlePreviewDocument = () => {
    if (!activeStructureId) return;
    // Open preview URL directly - generates PDF without saving
    const previewUrl = getQuotePreviewUrl(activeStructureId);
    window.open(previewUrl, '_blank');
  };

  // Generate document picker state
  const [showGeneratePicker, setShowGeneratePicker] = useState(false);
  const [generateDocType, setGenerateDocType] = useState('quote'); // 'quote' or 'package'
  const [selectedPackageDocs, setSelectedPackageDocs] = useState([]);
  const [includeSpecimen, setIncludeSpecimen] = useState(true); // Default to true like V1
  const [includeEndorsements, setIncludeEndorsements] = useState(true); // Default to true

  // Fetch package documents (claims sheets, marketing materials only - not endorsements)
  const position = activeStructure?.position || 'primary';
  const { data: packageDocsData } = useQuery({
    queryKey: ['package-documents', position],
    queryFn: () => getPackageDocuments(position).then(r => r.data),
    enabled: showGeneratePicker && generateDocType === 'package',
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Package documents come pre-grouped by document_type from the API
  const packageDocsByType = packageDocsData?.documents || {};

  // Document type display labels
  const docTypeLabels = packageDocsData?.document_types || {
    claims_sheet: 'Claims Sheets',
    marketing: 'Marketing Materials',
  };

  // Calculate package summary
  const packageSummary = useMemo(() => {
    if (generateDocType !== 'package') return null;
    const parts = ['Quote'];
    let docCount = 1; // Quote itself
    if (includeEndorsements && endorsementCount > 0) {
      parts.push(`${endorsementCount} endorsements`);
      docCount += endorsementCount;
    }
    if (includeSpecimen) {
      parts.push('Specimen');
      docCount += 1;
    }
    docCount += selectedPackageDocs.length;
    return { text: parts.join(' + '), count: docCount };
  }, [generateDocType, includeEndorsements, endorsementCount, includeSpecimen, selectedPackageDocs]);

  // Bind quote handler
  const [isBindLoading, setIsBindLoading] = useState(false);
  const [bindSuccess, setBindSuccess] = useState(false);
  const handleBindQuote = async () => {
    if (!activeStructureId) return;

    setIsBindLoading(true);
    try {
      // First check validation
      const validationResponse = await getBindValidation(activeStructureId);
      const validation = validationResponse.data;

      // Check for blockers
      const blockers = validation?.blockers || [];
      if (blockers.length > 0) {
        const blockerMessages = blockers.map(b => `• ${b.message || b}`).join('\n');
        alert(`Cannot bind quote. Please resolve the following:\n\n${blockerMessages}`);
        return;
      }

      // Check for warnings and confirm
      const warnings = validation?.warnings || [];
      if (warnings.length > 0) {
        const warningMessages = warnings.map(w => `• ${w.message || w}`).join('\n');
        const proceed = window.confirm(
          `The following warnings were found:\n\n${warningMessages}\n\nDo you want to proceed with binding?`
        );
        if (!proceed) return;
      }

      // Proceed with binding
      await bindQuoteOption(activeStructureId, warnings.length > 0);

      setBindSuccess(true);
      setTimeout(() => setBindSuccess(false), 3000);

      // Refresh structures to update bound status
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });

    } catch (error) {
      console.error('Failed to bind quote:', error);
      alert(error.response?.data?.detail || 'Failed to bind quote. Please try again.');
    } finally {
      setIsBindLoading(false);
    }
  };

  // Handle structure change
  const handleStructureChange = (structureId) => {
    setActiveStructureId(structureId);
    const struct = structures.find(s => s.id === structureId);
    if (struct?.variations?.length) {
      setActiveVariationId(struct.variations[0].id);
    }
  };

  // Create new structure
  const handleCreateStructure = () => {
    createStructureMutation.mutate({
      position: 'primary',
      tower_json: [{ carrier: 'CMAI', limit: 1000000, retention: 25000, attachment: 0 }],
      quote_name: 'New Quote',
    });
  };

  // Clone current structure
  const handleCloneStructure = () => {
    if (activeStructureId) {
      cloneStructureMutation.mutate(activeStructureId);
    }
  };

  // Delete current structure
  const handleDeleteStructure = () => {
    if (activeStructureId && structures.length > 1) {
      if (window.confirm('Delete this quote structure?')) {
        deleteStructureMutation.mutate(activeStructureId);
      }
    }
  };

  if (structuresLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading quote structures...</div>
      </div>
    );
  }

  if (!structures.length) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">No Quote Structures</h2>
            <p className="text-gray-500 mb-4">Create a quote structure to get started.</p>
            <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
              + Create Structure
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 overflow-x-hidden">
      <main className="max-w-7xl mx-auto p-6 overflow-hidden">

        {/* Structure Picker - Slide out overlay */}
        {isStructurePickerExpanded && (
          <>
            <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setIsStructurePickerExpanded(false)} />
            <div 
              className="fixed z-50 w-80"
              style={{ 
                top: `${modalPosition.top}px`, 
                right: `${modalPosition.right}px` 
              }}
            >
              <StructurePicker
                structures={structures}
                activeStructureId={activeStructureId}
                onSelect={handleStructureChange}
                onCreate={handleCreateStructure}
                onClone={handleCloneStructure}
                onDelete={handleDeleteStructure}
                isCreating={createStructureMutation.isPending}
                isCloning={cloneStructureMutation.isPending}
                isDeleting={deleteStructureMutation.isPending}
                isExpanded={true}
                onToggle={() => setIsStructurePickerExpanded(false)}
                onShowGrid={() => setViewMode('grid')}
                onShowSingle={() => setViewMode('single')}
              />
            </div>
          </>
        )}

        {/* Grid View - Full width comparison table */}
        {viewMode === 'grid' ? (
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">All Quote Options</h2>
                <p className="text-sm text-gray-500 mt-1">Click option name to edit, or modify values directly in the grid</p>
              </div>
              <button
                onClick={() => setViewMode('single')}
                className="text-sm text-gray-500 hover:text-purple-600 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>
            <div className="p-6">
              <AllOptionsTabContent
                structures={structures}
                onSelect={(id) => { handleStructureChange(id); setViewMode('single'); }}
                submissionId={submissionId}
                submission={submission}
                onUpdateOption={(quoteId, data) => updateTowerMutation.mutate({ quoteId, data })}
              />
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          {/* Header Bar - Quote Selector + Action Buttons */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg p-3">
            {/* Left: Quote Selector */}
            <button
              ref={optionSelectorButtonRef}
              onClick={() => setIsStructurePickerExpanded(true)}
              className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:border-purple-300 transition-colors text-sm min-w-[200px]"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                <span className="font-semibold text-gray-800">{activeStructure?.quote_name || 'Select Structure'}</span>
                {activeStructure?.position === 'excess' && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">XS</span>
                )}
                {/* Quote Status Badge */}
                {(() => {
                  const statusConfig = {
                    draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-600' },
                    indication: { label: 'Indication', bg: 'bg-amber-100', text: 'text-amber-700' },
                    quoted: { label: 'Quoted', bg: 'bg-purple-100', text: 'text-purple-700' },
                    bound: { label: 'Bound', bg: 'bg-green-100', text: 'text-green-700' },
                  };
                  const status = activeStructure?.is_bound ? statusConfig.bound : (statusConfig[activeStructure?.status] || statusConfig.draft);
                  return (
                    <span className={`text-[10px] ${status.bg} ${status.text} px-1.5 py-0.5 rounded font-medium`}>
                      {status.label}
                    </span>
                  );
                })()}
              </div>
              <span className="text-xs text-gray-400">{structures.length} options</span>
            </button>

            {/* Scope Toggle: Quote vs Submission */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setSummaryScope('quote')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  summaryScope === 'quote'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Quote
              </button>
              <button
                onClick={() => setSummaryScope('submission')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  summaryScope === 'submission'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Submission
              </button>
            </div>

            {/* Center: Bind Readiness Indicator */}
            <HoverCard.Root openDelay={100} closeDelay={100}>
              <HoverCard.Trigger asChild>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-default ${
                  bindReadiness.isReady
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : bindReadiness.hasBlockers
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {bindReadiness.isReady ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Bind Ready
                    </>
                  ) : bindReadiness.hasBlockers ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {bindReadiness.blockers.length} Blocker{bindReadiness.blockers.length > 1 ? 's' : ''}
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {bindReadiness.warnings.length} Warning{bindReadiness.warnings.length > 1 ? 's' : ''}
                    </>
                  )}
                </div>
              </HoverCard.Trigger>
              {!bindReadiness.isReady && (
                <HoverCard.Portal>
                  <HoverCard.Content className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3" sideOffset={4}>
                    <div className="space-y-2">
                      {bindReadiness.blockers.map((item, idx) => (
                        <div key={`b-${idx}`} className="flex items-center gap-2 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                          <span className="text-red-700">{item}</span>
                        </div>
                      ))}
                      {bindReadiness.warnings.map((item, idx) => (
                        <div key={`w-${idx}`} className="flex items-center gap-2 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                          <span className="text-amber-700">{item}</span>
                        </div>
                      ))}
                    </div>
                    <HoverCard.Arrow className="fill-white" />
                  </HoverCard.Content>
                </HoverCard.Portal>
              )}
            </HoverCard.Root>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviewDocument}
                disabled={isPreviewLoading || !activeStructureId}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Preview
              </button>
              <Popover.Root open={showGeneratePicker} onOpenChange={setShowGeneratePicker}>
                <Popover.Trigger asChild>
                  <button
                    disabled={generateDocumentMutation.isPending || generatePackageMutation.isPending || !activeStructureId}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content className={`z-[9999] rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden ${generateDocType === 'package' ? 'w-[420px]' : 'w-80'}`} sideOffset={8} align="end">
                    {/* Header with gradient */}
                    <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-5 py-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="font-semibold text-white text-sm">Generate Document</h3>
                      </div>
                    </div>
                    <div className="p-5 space-y-5">
                      {/* Document Type Selection */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Document Type</div>
                        <div className="flex items-center gap-4 p-2 bg-slate-50 rounded-lg">
                          <label className="flex-1 flex items-center gap-2.5 cursor-pointer group">
                            <input
                              type="radio"
                              name="docTypeHeader"
                              value="quote"
                              checked={generateDocType === 'quote'}
                              onChange={() => setGenerateDocType('quote')}
                              className="w-4 h-4 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                            />
                            <span className={`text-sm font-medium transition-colors ${generateDocType === 'quote' ? 'text-purple-700' : 'text-gray-600 group-hover:text-gray-800'}`}>
                              Quote Only
                            </span>
                          </label>
                          <label className="flex-1 flex items-center gap-2.5 cursor-pointer group">
                            <input
                              type="radio"
                              name="docTypeHeader"
                              value="package"
                              checked={generateDocType === 'package'}
                              onChange={() => setGenerateDocType('package')}
                              className="w-4 h-4 text-purple-600 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                            />
                            <span className={`text-sm font-medium transition-colors ${generateDocType === 'package' ? 'text-purple-700' : 'text-gray-600 group-hover:text-gray-800'}`}>
                              Full Package
                            </span>
                          </label>
                        </div>
                      </div>
                      {/* Document selector for Full Package */}
                      {generateDocType === 'package' && (
                        <div className="border border-gray-200 rounded-lg bg-slate-50/50 overflow-hidden">
                          <div className="max-h-[360px] overflow-y-auto p-4 space-y-4">
                            {/* Quote Specimens section */}
                            <div className="space-y-3 pb-3 border-b border-gray-200">
                              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Quote Specimens</div>
                              <div className="space-y-2.5">
                                <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-md hover:bg-white transition-colors">
                                  <input type="checkbox" checked={includeEndorsements} onChange={(e) => setIncludeEndorsements(e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0" />
                                  <div className="flex-1">
                                    <span className="text-sm font-medium text-gray-800 block">Endorsement Package</span>
                                    {endorsementCount > 0 && <span className="text-xs text-gray-500 mt-0.5 block">{endorsementCount} {endorsementCount === 1 ? 'endorsement' : 'endorsements'} included</span>}
                                  </div>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group p-2 rounded-md hover:bg-white transition-colors">
                                  <input type="checkbox" checked={includeSpecimen} onChange={(e) => setIncludeSpecimen(e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0" />
                                  <span className="text-sm font-medium text-gray-800">Policy Specimen</span>
                                </label>
                              </div>
                            </div>
                            {/* Documents grouped by type */}
                            {Object.entries(packageDocsByType).length > 0 ? (
                              Object.entries(packageDocsByType).map(([docType, docs], idx) => (
                                <div key={docType} className={idx > 0 ? 'pt-3 border-t border-gray-200' : ''}>
                                  <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2.5">{docTypeLabels[docType] || docType.replace(/_/g, ' ')}</div>
                                  <div className="space-y-1.5">
                                    {docs.map((doc) => (
                                      <label key={doc.id} className="flex items-start gap-3 cursor-pointer group p-2 rounded-md hover:bg-white transition-colors">
                                        <input type="checkbox" checked={selectedPackageDocs.includes(doc.id)} onChange={(e) => { if (e.target.checked) { setSelectedPackageDocs([...selectedPackageDocs, doc.id]); } else { setSelectedPackageDocs(selectedPackageDocs.filter(id => id !== doc.id)); } }} className="w-4 h-4 text-purple-600 rounded border-gray-300 mt-0.5 focus:ring-2 focus:ring-purple-500 focus:ring-offset-0" />
                                        <div className="flex-1 min-w-0">
                                          {doc.code && <span className="text-xs font-mono text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded mr-1.5">{doc.code}</span>}
                                          <span className="text-sm text-gray-700 group-hover:text-gray-900">{doc.title}</span>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-gray-400 text-center py-4">No additional documents available</div>
                            )}
                            {/* Summary line */}
                            {packageSummary && (
                              <div className="pt-3 mt-3 border-t-2 border-purple-200 bg-purple-50/50 rounded-md p-3 -mx-1">
                                <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Package Summary</div>
                                <div className="text-sm text-gray-700 font-medium">{packageSummary.text}</div>
                                <div className="text-xs text-gray-500 mt-1">Total: {packageSummary.count} {packageSummary.count === 1 ? 'document' : 'documents'}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Status messages */}
                      {(generateSuccess || generateError) && (
                        <div className={`p-3 rounded-lg text-sm text-center ${generateSuccess ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                          {generateSuccess && <div className="flex items-center justify-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Quote generated successfully!</div>}
                          {generateError && generateError}
                        </div>
                      )}
                    </div>
                    {/* Button at bottom */}
                    <div className="px-5 pb-5">
                      <button
                        onClick={() => { setGenerateError(null); handleGenerateDocument(); }}
                        disabled={generateDocumentMutation.isPending || generatePackageMutation.isPending}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white text-sm font-semibold hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        {(generateDocumentMutation.isPending || generatePackageMutation.isPending) ? (
                          <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</>
                        ) : generateDocType === 'package' ? (
                          <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>Generate Package ({packageSummary?.count || 1} docs)</>
                        ) : 'Generate Quote'}
                      </button>
                    </div>
                    <Popover.Arrow className="fill-white" />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <button
                onClick={handleBindQuote}
                disabled={isBindLoading || !activeStructureId}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Bind
              </button>
            </div>
          </div>

          {/* Main Content Card with Tabs - Full Width */}
          <div className="w-full">
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Tab Navigation */}
              <div className="flex items-center border-b border-gray-200">
                <button
                  onClick={() => setMainTab('summary')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    mainTab === 'summary'
                      ? 'border-purple-600 text-purple-600 bg-purple-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setMainTab('tower')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    mainTab === 'tower'
                      ? 'border-purple-600 text-purple-600 bg-purple-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Tower
                </button>
                <button
                  onClick={() => setMainTab('coverages')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    mainTab === 'coverages'
                      ? 'border-purple-600 text-purple-600 bg-purple-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Coverages
                </button>
                <button
                  onClick={() => setMainTab('endorsements')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    mainTab === 'endorsements'
                      ? 'border-purple-600 text-purple-600 bg-purple-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Endorsements
                </button>
                <button
                  onClick={() => setMainTab('subjectivities')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    mainTab === 'subjectivities'
                      ? 'border-purple-600 text-purple-600 bg-purple-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Subjectivities
                </button>
                {/* Spacer + Edit Controls */}
                <div className="flex-1" />
                {editControls && (
                  <div className="flex items-center gap-2 pr-4">
                    {editControls}
                  </div>
                )}
              </div>

              {/* Tab Content */}
              <div className="p-4">
                {mainTab === 'summary' && (
                  <SummaryTabContent
                    structure={activeStructure}
                    variation={activeVariation}
                    submission={submission}
                    structureId={activeStructureId}
                    structures={structures}
                    onMainTabChange={setMainTab}
                    documentHistory={documentHistory}
                    summaryScope={summaryScope}
                    selectedQuoteId={activeStructureId}
                    onSelect={setActiveStructureId}
                    onUpdateOption={(quoteId, data) => updateTowerMutation.mutate({ quoteId, data })}
                  />
                )}

                {mainTab === 'tower' && activeStructure && (
                  <TowerEditor
                    quote={activeStructure}
                    onSave={(updatedQuote) => updateTowerMutation.mutate({
                      quoteId: activeStructure.id,
                      data: { tower_json: updatedQuote.tower_json, quote_name: updatedQuote.quote_name }
                    })}
                    isPending={updateTowerMutation.isPending}
                    embedded={true}
                    setEditControls={setEditControls}
                  />
                )}

                {mainTab === 'coverages' && (
                  <CoveragesTabContent
                    structure={activeStructure}
                    onSave={(data) => updateTowerMutation.mutate({
                      quoteId: activeStructure.id,
                      data
                    })}
                    allQuotes={structures}
                    submissionId={submissionId}
                    setEditControls={setEditControls}
                  />
                )}

                {mainTab === 'endorsements' && (
                  <EndorsementsTabContent
                    structureId={activeStructureId}
                    structure={activeStructure}
                    structures={structures}
                    submissionId={submissionId}
                    setEditControls={setEditControls}
                  />
                )}

                {mainTab === 'subjectivities' && (
                  <SubjectivitiesTabContent
                    structureId={activeStructureId}
                    submissionId={submissionId}
                    structures={structures}
                    structure={activeStructure}
                    setEditControls={setEditControls}
                  />
                )}

              </div>
            </div>
          </div>
        </div>
        )}
      </main>

    </div>
  );
}
