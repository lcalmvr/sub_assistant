import { useState, useEffect, useRef } from 'react';
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
  generateQuotePackage,
  getQuoteEndorsements,
  getQuoteAutoEndorsements,
  getDocumentLibraryEntries,
  getSubjectivityTemplates,
  getQuoteSubjectivities,
  getSubmissionSubjectivities,
  getSubmissionEndorsements,
  createSubjectivity,
  updateSubjectivity,
  deleteSubjectivity,
  linkSubjectivityToQuote,
  unlinkSubjectivityFromQuote,
  linkEndorsementToQuote,
  unlinkEndorsementFromQuote,
  bindQuoteOption,
  unbindQuoteOption,
} from '../api/client';
import CoverageEditor from '../components/CoverageEditor';
import ExcessCoverageEditor from '../components/ExcessCoverageEditor';
import RetroScheduleEditor from '../components/RetroScheduleEditor';

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
  if (!value) return '—';
  if (value >= 1_000_000) return `$${value / 1_000_000}M`;
  if (value >= 1_000) return `$${value / 1_000}K`;
  return `$${value}`;
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

// Get quote premium (with fallback to tower CMAI layer)
function getQuotePremium(quote) {
  // CMAI layer premium from tower is source of truth
  const tower = quote.tower_json || [];
  const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
  if (cmaiLayer?.premium) return cmaiLayer.premium;

  // Fall back to quote-level fields if tower has no CMAI premium
  if (quote.sold_premium) return quote.sold_premium;
  if (quote.risk_adjusted_premium) return quote.risk_adjusted_premium;
  return null;
}

// Generate option name from tower structure
function generateOptionName(quote) {
  const tower = quote.tower_json || [];
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  const cmaiLayer = cmaiIdx >= 0 ? tower[cmaiIdx] : tower[0];
  if (!cmaiLayer) return 'Option';

  const limit = cmaiLayer.limit || 0;
  const limitStr = formatCompact(limit);
  const qsStr = cmaiLayer.quota_share ? ` po ${formatCompact(cmaiLayer.quota_share)}` : '';

  if (quote.position === 'excess' && cmaiIdx >= 0) {
    const attachment = calculateAttachment(tower, cmaiIdx);
    return `${limitStr}${qsStr} xs ${formatCompact(attachment)}`;
  }

  const retention = tower[0]?.retention || quote.primary_retention || 25000;
  return `${limitStr} x ${formatCompact(retention)}`;
}

// Calculate attachment for a layer
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

// Recalculate all attachments
function recalculateAttachments(layers) {
  if (!layers?.length) return layers;
  return layers.map((layer, idx) => ({
    ...layer,
    attachment: calculateAttachment(layers, idx),
  }));
}

// Parse quote IDs from postgres array or JS array
function parseQuoteIds(quoteIds) {
  if (!quoteIds) return [];
  if (Array.isArray(quoteIds)) return quoteIds;
  if (typeof quoteIds === 'string') {
    return quoteIds.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
  }
  return [];
}

// ============================================================================
// TOWER VISUAL (v11 style - shows layer stack)
// ============================================================================

function TowerVisual({ tower, position }) {
  const reversedTower = [...(tower || [])].reverse();

  if (!tower?.length) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-400 text-sm">
        No layers
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Show "above" indicator for excess */}
      {position === 'excess' && (
        <div className="h-4 border-x border-dashed border-gray-300 flex justify-center">
          <div className="w-px h-full bg-gray-300" />
        </div>
      )}

      {reversedTower.map((layer, idx) => {
        const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
        return (
          <div
            key={idx}
            className={`rounded flex flex-col items-center justify-center text-xs transition-all ${
              isCMAI
                ? 'bg-purple-600 text-white h-14 shadow-md ring-2 ring-purple-200'
                : 'bg-gray-100 border border-gray-300 text-gray-600 h-10'
            }`}
          >
            {isCMAI && (
              <span className="text-[9px] uppercase font-normal opacity-80">Our Layer</span>
            )}
            <span className="font-bold">{formatCompact(layer.limit)}</span>
            {layer.attachment > 0 && (
              <span className="text-[9px] opacity-75">xs {formatCompact(layer.attachment)}</span>
            )}
          </div>
        );
      })}

      {/* Retention indicator for primary */}
      {position === 'primary' && tower?.[0]?.retention && (
        <div className="h-3 bg-gray-50 border border-gray-200 rounded flex items-center justify-center">
          <span className="text-[8px] text-gray-400 uppercase">Ret {formatCompact(tower[0]?.retention)}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// QUOTE TAB SELECTOR
// ============================================================================

function QuoteTabSelector({ quotes, activeQuoteId, onSelect, onCreate, onClone, onDelete, submission }) {
  const [showOverflow, setShowOverflow] = useState(false);
  const MAX_VISIBLE = 4;

  const visibleQuotes = quotes.slice(0, MAX_VISIBLE);
  const overflowQuotes = quotes.slice(MAX_VISIBLE);
  const activeQuote = quotes.find(q => q.id === activeQuoteId);

  // Format policy period
  const formatPolicyPeriod = () => {
    if (!submission?.effective_date) return '12 month policy period';
    const formatDate = (dateStr) => {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    return `${formatDate(submission.effective_date)} — ${formatDate(submission.expiration_date)}`;
  };

  const statusColors = {
    draft: 'bg-gray-100 text-gray-600',
    quoted: 'bg-purple-100 text-purple-700',
    bound: 'bg-green-100 text-green-700',
  };

  const getStatus = (quote) => {
    if (quote.is_bound) return 'bound';
    if (quote.quote_documents?.length > 0) return 'quoted';
    return 'draft';
  };

  // Single quote - no tabs, just header
  if (quotes.length === 1) {
    const q = quotes[0];
    const status = getStatus(q);
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">{generateOptionName(q)}</h2>
          {q.position === 'excess' && (
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-medium">EXCESS</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColors[status]}`}>
            {status.toUpperCase()}
          </span>
          <span className="text-sm text-gray-500 ml-2">{formatPolicyPeriod()}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={onCreate} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded" title="New Option">
            +
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {visibleQuotes.map(q => {
          const isActive = q.id === activeQuoteId;
          const status = getStatus(q);
          return (
            <button
              key={q.id}
              onClick={() => onSelect(q.id)}
              className={`px-3 py-2 rounded-lg border-2 text-left transition-all min-w-[120px] ${
                isActive
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`font-semibold text-sm ${isActive ? 'text-purple-900' : 'text-gray-800'}`}>
                  {generateOptionName(q)}
                </span>
                {q.position === 'excess' && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded">XS</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-sm text-gray-500">{formatCurrency(getQuotePremium(q))}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColors[status]}`}>
                  {status.toUpperCase()}
                </span>
              </div>
            </button>
          );
        })}

        {/* Overflow dropdown */}
        {overflowQuotes.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowOverflow(!showOverflow)}
              className="px-3 py-2 rounded-lg border-2 border-gray-200 bg-white hover:border-gray-300 text-sm text-gray-600"
            >
              +{overflowQuotes.length} more ▾
            </button>
            {showOverflow && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[160px]">
                {overflowQuotes.map(q => (
                  <button
                    key={q.id}
                    onClick={() => { onSelect(q.id); setShowOverflow(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {generateOptionName(q)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Policy Period + Actions */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">{formatPolicyPeriod()}</span>
        <div className="flex gap-1">
          <button onClick={onClone} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded text-lg" title="Clone">
            ⧉
          </button>
          <button onClick={onCreate} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded text-lg" title="New">
            +
          </button>
          <button onClick={onDelete} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded text-lg" title="Delete">
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TOWER EDITOR (with premium integrated)
// ============================================================================

function TowerEditor({ quote, onSave, isPending }) {
  const [isEditing, setIsEditing] = useState(false);
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
    setIsEditing(false);
    carrierInputRefs.current = {};
    limitInputRefs.current = {};
    qsInputRefs.current = {};
    retentionInputRefs.current = {};
    premiumInputRefs.current = {};
    rpmInputRefs.current = {};
    ilfInputRefs.current = {};
  }, [quote.id]);

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
        setLayers(quote.tower_json || []);
        setIsEditing(false);
      }
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
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = displayIdx + 1;
      if (currentRefs.current[nextIdx]) {
        currentRefs.current[nextIdx].focus();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const currentColIdx = columnRefs.indexOf(currentRefs);
      // Search left for next available column
      for (let i = currentColIdx - 1; i >= 0; i--) {
        if (columnRefs[i].current[displayIdx]) {
          columnRefs[i].current[displayIdx].focus();
          break;
        }
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const currentColIdx = columnRefs.indexOf(currentRefs);
      // Search right for next available column
      for (let i = currentColIdx + 1; i < columnRefs.length; i++) {
        if (columnRefs[i].current[displayIdx]) {
          columnRefs[i].current[displayIdx].focus();
          break;
        }
      }
    } else if (e.key === 'Enter' && e.target.tagName === 'SELECT') {
      // Open dropdown on Enter for select elements
      e.preventDefault();
      if (e.target.showPicker) {
        e.target.showPicker();
      } else {
        e.target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    } else if (e.key === 'Tab') {
      const currentColIdx = columnRefs.indexOf(currentRefs);
      const totalRows = Object.keys(currentRefs.current).length;

      if (e.shiftKey) {
        // Shift+Tab: move left, then up to previous row
        for (let i = currentColIdx - 1; i >= 0; i--) {
          if (columnRefs[i].current[displayIdx]) {
            e.preventDefault();
            columnRefs[i].current[displayIdx].focus();
            return;
          }
        }
        // Wrap to previous row, rightmost column
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
        // Tab: move right, then down to next row
        for (let i = currentColIdx + 1; i < columnRefs.length; i++) {
          if (columnRefs[i].current[displayIdx]) {
            e.preventDefault();
            columnRefs[i].current[displayIdx].focus();
            return;
          }
        }
        // Wrap to next row, leftmost column
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
  };

  // Calculate CMAI totals for summary
  const cmaiLayer = layers.find(l => l.carrier?.toUpperCase().includes('CMAI'));
  const cmaiPremium = cmaiLayer?.premium;

  return (
    <div ref={tableRef} className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
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

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-100 mx-4 mb-4">
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
              // ILF: compare RPMs (this layer's RPM vs base layer's RPM), shown as percentage
              const baseLayer = layers[0];
              const baseRpm = baseLayer?.premium && baseLayer?.limit ? baseLayer.premium / (baseLayer.limit / 1_000_000) : null;
              const ilfPercent = rpm && baseRpm ? Math.round((rpm / baseRpm) * 100) : null;

              return (
                <tr
                  key={actualIdx}
                  className={`${isCMAI ? 'bg-purple-50 hover:bg-purple-100' : 'hover:bg-gray-50'} ${!isEditing ? 'cursor-pointer' : ''}`}
                  onClick={() => !isEditing && setIsEditing(true)}
                >
                  {/* Carrier */}
                  <td className="px-4 py-3">
                    {isEditing && !isCMAI ? (
                      <input
                        ref={(el) => { carrierInputRefs.current[displayIdx] = el; }}
                        type="text"
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        value={layer.carrier || ''}
                        onChange={(e) => {
                          const newLayers = [...layers];
                          newLayers[actualIdx] = { ...newLayers[actualIdx], carrier: e.target.value };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, carrierInputRefs)}
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
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        ref={(el) => { limitInputRefs.current[displayIdx] = el; }}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
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
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          ref={(el) => { qsInputRefs.current[displayIdx] = el; }}
                          className="text-sm border border-gray-300 rounded px-2 py-1"
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
                  <td className="px-4 py-3">
                    {isEditing && quote.position === 'primary' && isPrimary ? (
                      <select
                        ref={(el) => { retentionInputRefs.current[displayIdx] = el; }}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
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
                        {quote.position === 'primary' && isPrimary ? formatCompact(layer.retention || quote.primary_retention) : `xs ${formatCompact(attachment)}`}
                      </span>
                    )}
                  </td>

                  {/* Premium */}
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input
                        ref={(el) => { premiumInputRefs.current[displayIdx] = el; }}
                        type="text"
                        inputMode="numeric"
                        className="w-24 text-sm border border-gray-300 rounded px-2 py-1 text-right"
                        value={layer.premium ? formatNumberWithCommas(layer.premium) : ''}
                        placeholder="$"
                        onChange={(e) => {
                          const newLayers = [...layers];
                          const parsed = parseFormattedNumber(e.target.value);
                          newLayers[actualIdx] = { ...newLayers[actualIdx], premium: parsed ? Number(parsed) : null };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, premiumInputRefs)}
                      />
                    ) : (
                      <span className="font-medium text-green-700">
                        {formatCurrency(layer.premium)}
                      </span>
                    )}
                  </td>

                  {/* RPM */}
                  <td className="px-4 py-3 text-right">
                    {isEditing && isCMAI ? (
                      <input
                        ref={(el) => { rpmInputRefs.current[displayIdx] = el; }}
                        type="text"
                        inputMode="numeric"
                        className="w-20 text-sm border border-gray-300 rounded px-2 py-1 text-right"
                        value={rpm ? formatNumberWithCommas(rpm) : ''}
                        placeholder="RPM"
                        onChange={(e) => {
                          const newLayers = [...layers];
                          const parsed = parseFormattedNumber(e.target.value);
                          const newRpm = parsed ? Number(parsed) : null;
                          // Calculate premium from RPM: premium = rpm * (limit / 1M)
                          const newPremium = newRpm && layer.limit ? Math.round(newRpm * (layer.limit / 1_000_000)) : null;
                          newLayers[actualIdx] = { ...newLayers[actualIdx], premium: newPremium };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, rpmInputRefs)}
                      />
                    ) : (
                      <span className="text-gray-500">{rpm ? `$${rpm.toLocaleString()}` : '—'}</span>
                    )}
                  </td>

                  {/* ILF (as percentage) */}
                  <td className="px-4 py-3 text-right">
                    {isEditing && isCMAI ? (
                      <input
                        ref={(el) => { ilfInputRefs.current[displayIdx] = el; }}
                        type="text"
                        inputMode="numeric"
                        className="w-16 text-sm border border-gray-300 rounded px-2 py-1 text-right"
                        value={ilfPercent || ''}
                        placeholder="%"
                        onChange={(e) => {
                          const newLayers = [...layers];
                          const pct = e.target.value ? parseFloat(e.target.value) : null;
                          // Calculate premium from ILF%: ILF = RPM/baseRPM, so RPM = ILF * baseRPM, premium = RPM * (limit/1M)
                          const newPremium = pct && baseRpm && layer.limit
                            ? Math.round((pct / 100) * baseRpm * (layer.limit / 1_000_000))
                            : null;
                          newLayers[actualIdx] = { ...newLayers[actualIdx], premium: newPremium };
                          setLayers(newLayers);
                        }}
                        onKeyDown={(e) => handleArrowNav(e, displayIdx, ilfInputRefs)}
                      />
                    ) : (
                      <span className="text-gray-500">{ilfPercent ? `${ilfPercent}%` : '—'}</span>
                    )}
                  </td>

                  {/* Delete */}
                  {isEditing && (
                    <td className="px-4 py-3 text-center">
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
// COMPACT DATES SECTION
// ============================================================================

function DatesSection({ submission, quote, onUpdateSubmission, onUpdateQuote, allQuotes }) {
  const [isEditing, setIsEditing] = useState(false);
  const [showRetroEditor, setShowRetroEditor] = useState(false);
  const [localDates, setLocalDates] = useState({
    effective_date: submission.effective_date || '',
    expiration_date: submission.expiration_date || '',
  });
  const sectionRef = useRef(null);

  // Sync local state when submission changes
  useEffect(() => {
    setLocalDates({
      effective_date: submission.effective_date || '',
      expiration_date: submission.expiration_date || '',
    });
  }, [submission.effective_date, submission.expiration_date]);

  // Click outside to save, Escape to cancel
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e) => {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) {
        onUpdateSubmission(localDates);
        setIsEditing(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLocalDates({
          effective_date: submission.effective_date || '',
          expiration_date: submission.expiration_date || '',
        });
        setIsEditing(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing, localDates, submission, onUpdateSubmission]);

  const hasSpecificDates = !!submission.effective_date;

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div ref={sectionRef} className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Policy Period & Retro
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Policy Period */}
        {isEditing ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Eff:</label>
              <input
                type="date"
                className="text-sm border border-gray-300 rounded px-2 py-1"
                value={localDates.effective_date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  if (newDate) {
                    const [year, month, day] = newDate.split('-').map(Number);
                    const expDate = `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    setLocalDates({ effective_date: newDate, expiration_date: expDate });
                  } else {
                    setLocalDates({ ...localDates, effective_date: newDate });
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Exp:</label>
              <input
                type="date"
                className="text-sm border border-gray-300 rounded px-2 py-1"
                value={localDates.expiration_date}
                onChange={(e) => setLocalDates({ ...localDates, expiration_date: e.target.value })}
              />
            </div>
            <button
              onClick={() => {
                setLocalDates({ effective_date: '', expiration_date: '' });
                onUpdateSubmission({ effective_date: null, expiration_date: null });
                setIsEditing(false);
              }}
              className="text-xs text-gray-400 hover:text-red-500"
              title="Clear dates"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            className="flex items-center justify-between cursor-pointer hover:bg-gray-50 -mx-4 px-4 py-2 rounded"
            onClick={() => setIsEditing(true)}
          >
            {hasSpecificDates ? (
              <span className="text-sm text-gray-700">
                {formatDate(submission.effective_date)} — {formatDate(submission.expiration_date)}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded">
                  12 month policy period
                </span>
                <span className="text-xs text-gray-500">(dates TBD)</span>
              </div>
            )}
            <span className="text-xs text-gray-400">Click to edit</span>
          </div>
        )}

        {/* Retro Schedule - expandable */}
        <div className="border-t border-gray-100 pt-3">
          <button
            onClick={() => setShowRetroEditor(!showRetroEditor)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="text-sm font-medium text-gray-700">Retroactive Schedule</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {(quote.retro_schedule || []).length} coverages
              </span>
              {showRetroEditor ? '▾' : '▸'}
            </div>
          </button>

          {showRetroEditor && (
            <div className="mt-3">
              <RetroScheduleEditor
                schedule={quote.retro_schedule || []}
                notes={quote.retro_notes || ''}
                position={quote.position}
                coverages={quote.coverages || {}}
                policyForm={quote.policy_form || ''}
                sublimits={quote.sublimits || []}
                onChange={(schedule, notes) => {
                  onUpdateQuote({ retro_schedule: schedule, retro_notes: notes });
                }}
                readOnly={false}
              />
              <button
                onClick={() => applyToAllQuotes(quote.id, { retro_schedule: true })}
                className="mt-2 text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                Apply to all options
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Required endorsements - always included on every quote
const REQUIRED_ENDORSEMENT_CODES = [
  "END-OFAC-001",  // OFAC Sanctions Compliance
  "END-WAR-001",   // War & Terrorism Exclusion
];

// ============================================================================
// SINGLE QUOTE SUBJECTIVITIES/ENDORSEMENTS PANEL
// ============================================================================

function SingleQuotePanel({ quote, submissionId }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('endorsements');
  const [customSubj, setCustomSubj] = useState('');
  const [selectedEndorsement, setSelectedEndorsement] = useState('');
  const position = quote?.position || 'primary';

  // Fetch data for single quote
  const { data: quoteSubjectivities = [], refetch: refetchSubj } = useQuery({
    queryKey: ['quoteSubjectivities', quote?.id],
    queryFn: () => getQuoteSubjectivities(quote.id).then(res => res.data),
    enabled: !!quote?.id,
  });

  const { data: quoteEndorsements } = useQuery({
    queryKey: ['quoteEndorsements', quote?.id],
    queryFn: () => getQuoteEndorsements(quote.id).then(res => res.data),
    enabled: !!quote?.id,
  });

  const { data: autoEndorsementsData } = useQuery({
    queryKey: ['autoEndorsements', quote?.id],
    queryFn: () => getQuoteAutoEndorsements(quote.id).then(res => res.data),
    enabled: !!quote?.id,
  });

  const { data: subjTemplates = [] } = useQuery({
    queryKey: ['subjectivityTemplates', position],
    queryFn: () => getSubjectivityTemplates(position).then(res => res.data),
  });

  const { data: endorsementLibrary = [] } = useQuery({
    queryKey: ['documentLibrary', 'endorsement', position],
    queryFn: () => getDocumentLibraryEntries({ document_type: 'endorsement', position, status: 'active' }).then(res => res.data),
  });

  // Mutations (with optimistic updates for snappy UI)
  const createSubjMutation = useMutation({
    mutationFn: (data) => createSubjectivity(submissionId, data),
    onSuccess: () => refetchSubj(),
  });

  const updateSubjMutation = useMutation({
    mutationFn: ({ id, status }) => updateSubjectivity(id, { status }),

    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['quoteSubjectivities', quote?.id] });
      const previousData = queryClient.getQueryData(['quoteSubjectivities', quote?.id]);

      queryClient.setQueryData(['quoteSubjectivities', quote?.id], (old) => {
        if (!old) return old;
        return old.map(subj => subj.id === id ? { ...subj, status } : subj);
      });

      return { previousData };
    },

    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['quoteSubjectivities', quote?.id], context.previousData);
      }
    },

    onSettled: () => refetchSubj(),
  });

  const deleteSubjMutation = useMutation({
    mutationFn: (id) => deleteSubjectivity(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['quoteSubjectivities', quote?.id] });
      const previousData = queryClient.getQueryData(['quoteSubjectivities', quote?.id]);

      queryClient.setQueryData(['quoteSubjectivities', quote?.id], (old) => {
        if (!old) return old;
        return old.filter(subj => subj.id !== id);
      });

      return { previousData };
    },

    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['quoteSubjectivities', quote?.id], context.previousData);
      }
    },

    onSettled: () => refetchSubj(),
  });

  const addEndorsementMutation = useMutation({
    mutationFn: ({ libraryEntryId, libraryEntry }) => linkEndorsementToQuote(quote.id, libraryEntryId),

    onMutate: async ({ libraryEntryId, libraryEntry }) => {
      await queryClient.cancelQueries({ queryKey: ['quoteEndorsements', quote.id] });
      const previousData = queryClient.getQueryData(['quoteEndorsements', quote.id]);

      if (libraryEntry) {
        queryClient.setQueryData(['quoteEndorsements', quote.id], (old) => {
          if (!old?.endorsements) return old;
          const newEndt = {
            endorsement_id: libraryEntryId,
            title: libraryEntry.title,
            code: libraryEntry.code,
            library_entry_id: libraryEntryId,
          };
          return { ...old, endorsements: [...old.endorsements, newEndt] };
        });
      }

      return { previousData };
    },

    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['quoteEndorsements', quote.id], context.previousData);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', quote.id] });
      setSelectedEndorsement('');
    },
  });

  const removeEndorsementMutation = useMutation({
    mutationFn: (endorsementId) => unlinkEndorsementFromQuote(quote.id, endorsementId),

    onMutate: async (endorsementId) => {
      await queryClient.cancelQueries({ queryKey: ['quoteEndorsements', quote.id] });
      const previousData = queryClient.getQueryData(['quoteEndorsements', quote.id]);

      queryClient.setQueryData(['quoteEndorsements', quote.id], (old) => {
        if (!old?.endorsements) return old;
        return { ...old, endorsements: old.endorsements.filter(e => e.endorsement_id !== endorsementId) };
      });

      return { previousData };
    },

    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['quoteEndorsements', quote.id], context.previousData);
      }
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', quote.id] }),
  });

  const subjectivities = quoteSubjectivities.filter(s => s.status !== 'excluded');
  const endorsements = quoteEndorsements?.endorsements || [];
  const autoEndorsements = autoEndorsementsData?.auto_endorsements || [];
  const autoEndorsementTitles = autoEndorsements.map(e => e.title);

  const requiredEndorsements = endorsementLibrary.filter(e => REQUIRED_ENDORSEMENT_CODES.includes(e.code));
  const existingSubjTexts = subjectivities.map(s => s.text);
  const autoApplyTemplates = subjTemplates.filter(t => t.auto_apply && !existingSubjTexts.includes(t.text));
  const manualTemplates = subjTemplates.filter(t => !t.auto_apply && !existingSubjTexts.includes(t.text));

  const availableEndorsements = endorsementLibrary.filter(lib =>
    !REQUIRED_ENDORSEMENT_CODES.includes(lib.code) &&
    !autoEndorsementTitles.includes(lib.title) &&
    !endorsements.some(e => e.library_entry_id === lib.id)
  );

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700',
    received: 'bg-green-100 text-green-700',
    waived: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Quote Configuration
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('endorsements')}
          className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'endorsements' ? 'border-purple-500 text-purple-600 bg-purple-50/50' : 'border-transparent text-gray-500'
          }`}
        >
          Endorsements
        </button>
        <button
          onClick={() => setActiveTab('subjectivities')}
          className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'subjectivities' ? 'border-purple-500 text-purple-600 bg-purple-50/50' : 'border-transparent text-gray-500'
          }`}
        >
          Subjectivities
        </button>
      </div>

      <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
        {activeTab === 'endorsements' && (
          <>
            {/* Required */}
            {requiredEndorsements.map(e => (
              <div key={e.id} className="flex items-center gap-2 py-1 text-sm text-gray-600">
                <span className="text-gray-400">🔒</span>
                <span className="flex-1">{e.code} - {e.title}</span>
              </div>
            ))}
            {/* Auto */}
            {autoEndorsements.map(e => (
              <div key={e.id} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                <span className="text-amber-500">⚡</span>
                <span className="flex-1">
                  {e.code} - {e.title}
                  {e.auto_reason && <span className="ml-1 text-xs text-gray-400">({e.auto_reason})</span>}
                </span>
              </div>
            ))}
            {/* Manual */}
            {endorsements
              .filter(e => !REQUIRED_ENDORSEMENT_CODES.includes(e.code) && !autoEndorsementTitles.includes(e.title))
              .map(e => (
                <div key={e.endorsement_id} className="flex items-center gap-2 py-1 text-sm text-gray-700 group">
                  <span className="text-gray-300">+</span>
                  <span className="flex-1">{e.code} - {e.title}</span>
                  <button
                    onClick={() => removeEndorsementMutation.mutate(e.endorsement_id)}
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}

            {/* Add endorsement */}
            <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
              <select
                className="form-select flex-1 text-xs py-1"
                value={selectedEndorsement}
                onChange={(e) => setSelectedEndorsement(e.target.value)}
              >
                <option value="">Add endorsement...</option>
                {availableEndorsements.map(e => (
                  <option key={e.id} value={e.id}>{e.code} - {e.title}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!selectedEndorsement) return;
                  const libraryEntry = availableEndorsements.find(e => e.id === selectedEndorsement);
                  addEndorsementMutation.mutate({ libraryEntryId: selectedEndorsement, libraryEntry });
                }}
                disabled={!selectedEndorsement}
                className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </>
        )}

        {activeTab === 'subjectivities' && (
          <>
            {/* Auto-applied */}
            {autoApplyTemplates.map(t => (
              <div key={t.id} className="flex items-start gap-2 py-1 text-sm">
                <span className="text-amber-500 mt-0.5">⚡</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors.pending}`}>pending</span>
                <span className="flex-1 text-gray-600">{t.text}</span>
              </div>
            ))}
            {/* Materialized */}
            {subjectivities.map(s => (
              <div key={s.id} className="flex items-start gap-2 py-1 text-sm group">
                <span className="text-gray-300 mt-0.5">+</span>
                <select
                  value={s.status || 'pending'}
                  onChange={(e) => updateSubjMutation.mutate({ id: s.id, status: e.target.value })}
                  className={`text-xs px-1 py-0.5 rounded border-0 cursor-pointer ${statusColors[s.status] || statusColors.pending}`}
                >
                  <option value="pending">pending</option>
                  <option value="received">received</option>
                  <option value="waived">waived</option>
                </select>
                <span className="flex-1 text-gray-700">{s.text}</span>
                <button
                  onClick={() => deleteSubjMutation.mutate(s.id)}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 text-xs"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Add from template */}
            {manualTemplates.length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-100">
                <select
                  className="form-select w-full text-xs py-1 mb-2"
                  onChange={(e) => {
                    if (e.target.value) {
                      createSubjMutation.mutate({ text: e.target.value });
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">Add from template...</option>
                  {manualTemplates.map(t => (
                    <option key={t.id} value={t.text}>{t.text}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Custom input */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                className="form-input flex-1 text-xs py-1"
                placeholder="Custom subjectivity..."
                value={customSubj}
                onChange={(e) => setCustomSubj(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customSubj.trim()) {
                    createSubjMutation.mutate({ text: customSubj.trim() });
                    setCustomSubj('');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (customSubj.trim()) {
                    createSubjMutation.mutate({ text: customSubj.trim() });
                    setCustomSubj('');
                  }
                }}
                disabled={!customSubj.trim()}
                className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SUBJECTIVITIES & ENDORSEMENTS PANEL (with expandable matrix)
// ============================================================================

function SubjectivitiesEndorsementsPanel({ quotes, submissionId, activeQuoteId }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('endorsements');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [editingSubj, setEditingSubj] = useState(null);
  // Filter toggles for matrix
  const [filterRequired, setFilterRequired] = useState(false);
  const [filterAuto, setFilterAuto] = useState(false);
  const [filterDiffs, setFilterDiffs] = useState(false);

  const activeQuote = quotes.find(q => q.id === activeQuoteId);
  const position = activeQuote?.position || 'primary';

  // Fetch submission-level data for matrix
  const { data: subjectivitiesData = [] } = useQuery({
    queryKey: ['submissionSubjectivities', submissionId],
    queryFn: () => getSubmissionSubjectivities(submissionId).then(res => res.data),
  });

  const { data: endorsementsData } = useQuery({
    queryKey: ['submissionEndorsements', submissionId],
    queryFn: () => getSubmissionEndorsements(submissionId).then(res => res.data),
  });

  // Fetch auto-attach endorsements for current quote
  const { data: autoEndorsementsData } = useQuery({
    queryKey: ['autoEndorsements', activeQuoteId],
    queryFn: () => getQuoteAutoEndorsements(activeQuoteId).then(res => res.data),
    enabled: !!activeQuoteId,
  });

  // Fetch templates for adding (filtered by position)
  const { data: subjTemplates = [] } = useQuery({
    queryKey: ['subjectivityTemplates', position],
    queryFn: () => getSubjectivityTemplates(position).then(res => res.data),
  });

  const { data: endorsementLibrary = [] } = useQuery({
    queryKey: ['documentLibrary', 'endorsement', position],
    queryFn: () => getDocumentLibraryEntries({ document_type: 'endorsement', position, status: 'active' }).then(res => res.data),
  });

  // Mutations (with optimistic updates for snappy UI)
  const toggleSubjMutation = useMutation({
    mutationFn: ({ subjectivityId, quoteId, isLinked }) =>
      isLinked ? unlinkSubjectivityFromQuote(quoteId, subjectivityId) : linkSubjectivityToQuote(quoteId, subjectivityId),

    onMutate: async ({ subjectivityId, quoteId, isLinked }) => {
      await queryClient.cancelQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      const previousData = queryClient.getQueryData(['submissionSubjectivities', submissionId]);

      queryClient.setQueryData(['submissionSubjectivities', submissionId], (old) => {
        if (!old) return old;
        return old.map(subj => {
          if (subj.id !== subjectivityId) return subj;
          let quoteIds = subj.quote_ids || [];
          if (typeof quoteIds === 'string') {
            quoteIds = quoteIds.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
          }
          if (!Array.isArray(quoteIds)) quoteIds = [];
          quoteIds = isLinked ? quoteIds.filter(id => id !== quoteId) : [...quoteIds, quoteId];
          return { ...subj, quote_ids: quoteIds };
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
      quotes.forEach(q => queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] }));
    },
  });

  const toggleEndtMutation = useMutation({
    mutationFn: ({ endorsementId, quoteId, isLinked }) =>
      isLinked ? unlinkEndorsementFromQuote(quoteId, endorsementId) : linkEndorsementToQuote(quoteId, endorsementId),

    onMutate: async ({ endorsementId, quoteId, isLinked }) => {
      await queryClient.cancelQueries({ queryKey: ['submissionEndorsements', submissionId] });
      const previousData = queryClient.getQueryData(['submissionEndorsements', submissionId]);

      queryClient.setQueryData(['submissionEndorsements', submissionId], (old) => {
        if (!old?.endorsements) return old;
        return {
          ...old,
          endorsements: old.endorsements.map(endt => {
            if (endt.endorsement_id !== endorsementId) return endt;
            let quoteIds = endt.quote_ids || [];
            if (typeof quoteIds === 'string') {
              quoteIds = quoteIds.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
            }
            if (!Array.isArray(quoteIds)) quoteIds = [];
            quoteIds = isLinked ? quoteIds.filter(id => id !== quoteId) : [...quoteIds, quoteId];
            return { ...endt, quote_ids: quoteIds };
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
      quotes.forEach(q => queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', q.id] }));
    },
  });

  const addSubjMutation = useMutation({
    mutationFn: (data) => createSubjectivity(submissionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      setShowAddPanel(false);
    },
  });

  const updateSubjMutation = useMutation({
    mutationFn: ({ id, data }) => updateSubjectivity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      setEditingSubj(null);
    },
  });

  const deleteSubjMutation = useMutation({
    mutationFn: (id) => deleteSubjectivity(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] }),
  });

  const addEndtMutation = useMutation({
    mutationFn: (libraryEntryId) => {
      // Link endorsement to all quotes by default
      return Promise.all(quotes.map(q => linkEndorsementToQuote(q.id, libraryEntryId)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
      setShowAddPanel(false);
    },
  });

  const subjectivities = subjectivitiesData.filter(s => s.status !== 'excluded');
  const endorsements = endorsementsData?.endorsements || [];
  const autoEndorsements = autoEndorsementsData?.auto_endorsements || [];
  const autoEndorsementTitles = autoEndorsements.map(e => e.title);

  // Required endorsements from library
  const requiredEndorsements = endorsementLibrary.filter(e =>
    REQUIRED_ENDORSEMENT_CODES.includes(e.code)
  );

  // Filter out already-added, required, and auto endorsements
  const availableEndorsements = endorsementLibrary.filter(lib =>
    !REQUIRED_ENDORSEMENT_CODES.includes(lib.code) &&
    !autoEndorsementTitles.includes(lib.title) &&
    !endorsements.some(e => e.library_entry_id === lib.id)
  );

  // Filter subjectivity templates - exclude already-added ones
  const existingSubjTexts = subjectivities.map(s => s.text);
  const autoApplyTemplates = subjTemplates.filter(t => t.auto_apply && !existingSubjTexts.includes(t.text));
  const manualTemplates = subjTemplates.filter(t => !t.auto_apply && !existingSubjTexts.includes(t.text));

  // Count manual endorsements (not required or auto)
  const manualEndorsements = endorsements.filter(e =>
    !REQUIRED_ENDORSEMENT_CODES.includes(e.code) && !autoEndorsementTitles.includes(e.title)
  );

  // Total counts for tabs
  const totalEndorsements = requiredEndorsements.length + autoEndorsements.length + manualEndorsements.length;
  const totalSubjectivities = autoApplyTemplates.length + subjectivities.length;

  // Build quote headers for matrix
  const quoteHeaders = quotes.map(q => ({
    id: q.id,
    label: generateOptionName(q).split(' ')[0],
    isCurrent: q.id === activeQuoteId,
  }));

  // Get items for current quote only
  const currentQuoteEndorsements = [
    ...requiredEndorsements.map(e => ({ ...e, type: 'required' })),
    ...autoEndorsements.map(e => ({ ...e, type: 'auto' })),
    ...manualEndorsements.filter(e => parseQuoteIds(e.quote_ids).includes(activeQuoteId)).map(e => ({ ...e, type: 'manual' })),
  ];

  const currentQuoteSubjectivities = [
    ...autoApplyTemplates.map(t => ({ ...t, type: 'auto', status: 'pending' })),
    ...subjectivities.filter(s => parseQuoteIds(s.quote_ids).includes(activeQuoteId)).map(s => ({ ...s, type: 'manual' })),
  ];

  return (
    <>
      {/* Matrix Modal */}
      {showMatrixModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMatrixModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Cross-Option Assignment</h2>
                <p className="text-sm text-gray-500">Assign {activeTab} across quote options</p>
              </div>
              <button onClick={() => setShowMatrixModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Modal Tabs + Filters */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('endorsements')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                    activeTab === 'endorsements' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500'
                  }`}
                >
                  Endorsements ({totalEndorsements})
                </button>
                <button
                  onClick={() => setActiveTab('subjectivities')}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                    activeTab === 'subjectivities' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500'
                  }`}
                >
                  Subjectivities ({totalSubjectivities})
                </button>
              </div>

              {/* Filter Toggles */}
              <div className="flex items-center gap-2 py-2">
                {activeTab === 'endorsements' && (
                  <>
                    <button
                      onClick={() => setFilterRequired(!filterRequired)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                        filterRequired ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <span>🔒</span> Required
                    </button>
                    <button
                      onClick={() => setFilterAuto(!filterAuto)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                        filterAuto ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <span>⚡</span> Auto
                    </button>
                  </>
                )}
                <button
                  onClick={() => setFilterDiffs(!filterDiffs)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${
                    filterDiffs ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span>≠</span> Differences
                </button>
              </div>
            </div>

            {/* Modal Content - Matrix Table */}
            <div className="p-6 overflow-auto max-h-[60vh]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 pr-4 text-xs font-semibold text-gray-500 uppercase">
                      {activeTab === 'endorsements' ? 'Endorsement' : 'Subjectivity'}
                    </th>
                    {quoteHeaders.map(q => (
                      <th key={q.id} className={`px-3 py-3 text-center text-xs font-semibold uppercase ${q.isCurrent ? 'text-purple-600 bg-purple-50' : 'text-gray-500'}`}>
                        <div>{q.label}</div>
                        <div className="text-[10px] font-normal normal-case text-gray-400">
                          {quotes.find(qq => qq.id === q.id)?.position === 'excess' ? 'Excess' : 'Primary'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeTab === 'endorsements' && (() => {
                    // Apply filters
                    const anyFilterActive = filterRequired || filterAuto || filterDiffs;
                    const allQuoteIds = quotes.map(q => q.id);

                    // Filter required endorsements
                    const showRequired = !anyFilterActive || filterRequired;
                    const filteredRequired = showRequired ? requiredEndorsements : [];

                    // Filter auto endorsements (auto are on all quotes, so skip if filterDiffs)
                    const showAuto = !anyFilterActive || filterAuto;
                    const filteredAuto = showAuto && !filterDiffs ? autoEndorsements : [];

                    // Filter manual endorsements (check for differences)
                    const filteredManual = manualEndorsements.filter(endt => {
                      if (filterRequired || filterAuto) return false; // Manual doesn't match required/auto filters
                      if (filterDiffs) {
                        const linkedIds = parseQuoteIds(endt.quote_ids);
                        return linkedIds.length !== allQuoteIds.length; // Has differences
                      }
                      return !anyFilterActive; // Show all if no filter
                    });

                    const totalFiltered = filteredRequired.length + filteredAuto.length + filteredManual.length;

                    return (
                      <>
                        {filteredRequired.map(endt => (
                          <tr key={endt.id} className="hover:bg-gray-50">
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">🔒</span>
                                <span className="text-sm text-gray-600">{endt.title}</span>
                              </div>
                            </td>
                            {quoteHeaders.map(q => (
                              <td key={q.id} className={`px-3 py-3 text-center ${q.isCurrent ? 'bg-purple-50/50' : ''}`}>
                                <span className="text-gray-400">✓</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                        {filteredAuto.map(endt => (
                          <tr key={endt.id} className="hover:bg-gray-50">
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <span className="text-amber-500">⚡</span>
                                <div>
                                  <span className="text-sm text-gray-700">{endt.title}</span>
                                  {endt.auto_reason && <span className="text-xs text-gray-400 ml-2">({endt.auto_reason})</span>}
                                </div>
                              </div>
                            </td>
                            {quoteHeaders.map(q => (
                              <td key={q.id} className={`px-3 py-3 text-center ${q.isCurrent ? 'bg-purple-50/50' : ''}`}>
                                <span className="text-amber-500">✓</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                        {filteredManual.map(endt => {
                          const linkedIds = parseQuoteIds(endt.quote_ids);
                          const hasDiff = linkedIds.length !== allQuoteIds.length;
                          return (
                            <tr key={endt.endorsement_id} className={`hover:bg-gray-50 ${hasDiff ? 'bg-blue-50/30' : ''}`}>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-purple-400">+</span>
                                  <span className="text-sm text-gray-700">{endt.title}</span>
                                  {hasDiff && <span className="text-xs text-blue-500">≠</span>}
                                </div>
                              </td>
                              {quoteHeaders.map(q => (
                                <td key={q.id} className={`px-3 py-3 text-center ${q.isCurrent ? 'bg-purple-50/50' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={linkedIds.includes(q.id)}
                                    onChange={() => toggleEndtMutation.mutate({
                                      endorsementId: endt.endorsement_id,
                                      quoteId: q.id,
                                      isLinked: linkedIds.includes(q.id),
                                    })}
                                    className="w-4 h-4 text-purple-600 rounded border-gray-300 cursor-pointer"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        {totalFiltered === 0 && (
                          <tr><td colSpan={quoteHeaders.length + 1} className="py-8 text-center text-gray-400">
                            {anyFilterActive ? 'No items match current filters' : 'No endorsements added'}
                          </td></tr>
                        )}
                      </>
                    );
                  })()}

                  {activeTab === 'subjectivities' && (() => {
                    const allQuoteIds = quotes.map(q => q.id);
                    const filteredSubjs = filterDiffs
                      ? subjectivities.filter(subj => {
                          const linkedIds = parseQuoteIds(subj.quote_ids);
                          return linkedIds.length !== allQuoteIds.length;
                        })
                      : subjectivities;

                    return (
                      <>
                        {filteredSubjs.map(subj => {
                          const linkedIds = parseQuoteIds(subj.quote_ids);
                          const hasDiff = linkedIds.length !== allQuoteIds.length;
                          return (
                            <tr key={subj.id} className={`hover:bg-gray-50 ${hasDiff ? 'bg-blue-50/30' : ''}`}>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    subj.status === 'received' ? 'bg-green-100 text-green-700' :
                                    subj.status === 'waived' ? 'bg-gray-100 text-gray-500' :
                                    'bg-yellow-100 text-yellow-700'
                                  }`}>{subj.status || 'pending'}</span>
                                  <span className="text-sm text-gray-700">{subj.text}</span>
                                  {hasDiff && <span className="text-xs text-blue-500">≠</span>}
                                </div>
                              </td>
                              {quoteHeaders.map(q => (
                                <td key={q.id} className={`px-3 py-3 text-center ${q.isCurrent ? 'bg-purple-50/50' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={linkedIds.includes(q.id)}
                                    onChange={() => toggleSubjMutation.mutate({
                                      subjectivityId: subj.id,
                                      quoteId: q.id,
                                      isLinked: linkedIds.includes(q.id),
                                    })}
                                    className="w-4 h-4 text-purple-600 rounded border-gray-300 cursor-pointer"
                                  />
                              </td>
                            ))}
                            </tr>
                          );
                        })}
                        {filteredSubjs.length === 0 && (
                          <tr><td colSpan={quoteHeaders.length + 1} className="py-8 text-center text-gray-400">
                            {filterDiffs ? 'No items with differences' : 'No subjectivities added'}
                          </td></tr>
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowMatrixModal(false)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Panel */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            {activeTab === 'endorsements' ? 'Endorsements' : 'Subjectivities'}
          </h3>
          {quotes.length > 1 && (
            <button
              onClick={() => setShowMatrixModal(true)}
              className="text-[10px] px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-purple-100 hover:text-purple-700"
            >
              Cross-Option ↗
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setActiveTab('endorsements'); setShowAddPanel(false); }}
            className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'endorsements'
                ? 'border-purple-500 text-purple-600 bg-purple-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Endorsements ({currentQuoteEndorsements.length})
          </button>
          <button
            onClick={() => { setActiveTab('subjectivities'); setShowAddPanel(false); }}
            className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'subjectivities'
                ? 'border-purple-500 text-purple-600 bg-purple-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Subjectivities ({currentQuoteSubjectivities.length})
          </button>
        </div>

        {/* Content - Simple list for current quote */}
        <div className="p-3">
          {!showAddPanel ? (
            <>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {activeTab === 'endorsements' && currentQuoteEndorsements.map((endt, idx) => (
                  <div key={endt.id || endt.endorsement_id || idx} className="flex items-start gap-2 py-1.5 group">
                    <span className={endt.type === 'required' ? 'text-gray-400' : endt.type === 'auto' ? 'text-amber-500' : 'text-purple-400'}>
                      {endt.type === 'required' ? '🔒' : endt.type === 'auto' ? '⚡' : '+'}
                    </span>
                    <span className="text-xs text-gray-700 flex-1 leading-snug">
                      {endt.title}
                      {endt.auto_reason && <span className="text-gray-400 ml-1">({endt.auto_reason})</span>}
                    </span>
                    {endt.type === 'manual' && (
                      <button
                        onClick={() => unlinkEndorsementFromQuote(activeQuoteId, endt.endorsement_id)
                          .then(() => queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] }))}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                      >×</button>
                    )}
                  </div>
                ))}
                {activeTab === 'endorsements' && currentQuoteEndorsements.length === 0 && (
                  <div className="py-4 text-center text-xs text-gray-400">No endorsements on this quote</div>
                )}

                {activeTab === 'subjectivities' && currentQuoteSubjectivities.map((subj, idx) => (
                  <div key={subj.id || idx} className="flex items-start gap-2 py-1.5 group">
                    <span className={subj.type === 'auto' ? 'text-amber-500' : 'text-purple-400'}>
                      {subj.type === 'auto' ? '⚡' : '+'}
                    </span>
                    {subj.type === 'manual' ? (
                      <select
                        value={subj.status || 'pending'}
                        onChange={(e) => updateSubjMutation.mutate({ id: subj.id, data: { status: e.target.value } })}
                        className={`text-[10px] px-1.5 py-0.5 rounded border-0 cursor-pointer ${
                          subj.status === 'received' ? 'bg-green-100 text-green-700' :
                          subj.status === 'waived' ? 'bg-gray-100 text-gray-500' :
                          'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        <option value="pending">pending</option>
                        <option value="received">received</option>
                        <option value="waived">waived</option>
                      </select>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">pending</span>
                    )}
                    <span className="text-xs text-gray-700 flex-1 leading-snug">{subj.text}</span>
                    {subj.type === 'manual' && (
                      <button
                        onClick={() => deleteSubjMutation.mutate(subj.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                      >×</button>
                    )}
                  </div>
                ))}
                {activeTab === 'subjectivities' && currentQuoteSubjectivities.length === 0 && (
                  <div className="py-4 text-center text-xs text-gray-400">No subjectivities on this quote</div>
                )}
              </div>

              {/* Add button */}
              <button
                onClick={() => setShowAddPanel(true)}
                className="w-full mt-3 py-2 text-xs text-purple-600 hover:bg-purple-50 rounded border border-dashed border-purple-200 font-medium"
              >
                + Add {activeTab === 'endorsements' ? 'Endorsement' : 'Subjectivity'}
              </button>
            </>
          ) : (
          /* Add Panel */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">
                Add {activeTab === 'endorsements' ? 'Endorsement' : 'Subjectivity'}
              </span>
              <button onClick={() => setShowAddPanel(false)} className="text-gray-400 hover:text-gray-600 text-sm">
                ×
              </button>
            </div>

            {activeTab === 'subjectivities' && (
              <>
                {/* Manual Templates (non-auto-apply) */}
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {manualTemplates.length === 0 ? (
                    <div className="py-2 text-center text-xs text-gray-400">
                      No templates available
                    </div>
                  ) : (
                    manualTemplates.map(tmpl => (
                      <button
                        key={tmpl.id}
                        onClick={() => addSubjMutation.mutate({ text: tmpl.text, template_id: tmpl.id })}
                        className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-purple-50 rounded truncate"
                      >
                        {tmpl.text}
                      </button>
                    ))
                  )}
                </div>
                {/* Custom input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = e.target.elements.customText.value.trim();
                    if (text) {
                      addSubjMutation.mutate({ text });
                      e.target.reset();
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    name="customText"
                    type="text"
                    placeholder="Or type custom..."
                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                  />
                  <button type="submit" className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                    Add
                  </button>
                </form>
              </>
            )}

            {activeTab === 'endorsements' && (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {availableEndorsements.length === 0 ? (
                  <div className="py-4 text-center text-xs text-gray-400">
                    No available endorsements in library
                  </div>
                ) : (
                  availableEndorsements.map(lib => (
                    <button
                      key={lib.id}
                      onClick={() => addEndtMutation.mutate(lib.id)}
                      className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-purple-50 rounded"
                    >
                      <div className="font-medium">{lib.title}</div>
                      {lib.code && <div className="text-gray-400">{lib.code}</div>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ============================================================================
// BIND READINESS
// ============================================================================

function BindReadiness({ quote, subjectivities }) {
  const errors = [];
  const warnings = [];

  // Check for premium
  const cmaiLayer = (quote.tower_json || []).find(l => l.carrier?.toUpperCase().includes('CMAI'));
  if (!cmaiLayer?.premium && !quote.sold_premium) {
    errors.push('Premium not set');
  }

  // Check quote status
  if (!quote.is_bound && (!quote.quote_documents || quote.quote_documents.length === 0)) {
    warnings.push('Quote document not generated');
  }

  // Check pending subjectivities
  const pendingCount = subjectivities.filter(s => s.status === 'pending').length;
  if (pendingCount > 0) {
    warnings.push(`${pendingCount} pending subjectivities`);
  }

  const isReady = errors.length === 0 && warnings.length === 0;
  const hasErrors = errors.length > 0;

  return (
    <div className={`rounded-lg shadow-sm p-4 border-l-4 ${
      hasErrors
        ? 'bg-red-50 border-red-500 border border-red-200'
        : warnings.length > 0
          ? 'bg-amber-50 border-amber-500 border border-amber-200'
          : 'bg-green-50 border-green-500 border border-green-200'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm text-gray-900">Bind Readiness</span>
        {hasErrors ? (
          <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded">
            ✕ {errors.length} Errors
          </span>
        ) : warnings.length > 0 ? (
          <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
            ⚠ {warnings.length} Warnings
          </span>
        ) : (
          <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">
            ✓ Ready
          </span>
        )}
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="text-xs space-y-1">
          {errors.map((e, i) => (
            <li key={i} className="flex items-center gap-1.5 text-red-700">
              <span className="w-1 h-1 bg-red-500 rounded-full" /> {e}
            </li>
          ))}
          {warnings.map((w, i) => (
            <li key={i} className="flex items-center gap-1.5 text-amber-700">
              <span className="w-1 h-1 bg-amber-500 rounded-full" /> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// DOCUMENT GENERATION
// ============================================================================

function DocumentGeneration({ quote, onGenerate, isPending }) {
  const [packageType, setPackageType] = useState('quote_only');

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
        Generate Document
      </h3>

      <div className="space-y-2 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="docType"
            checked={packageType === 'quote_only'}
            onChange={() => setPackageType('quote_only')}
            className="text-purple-600"
          />
          <span className="text-sm text-gray-700">Quote Only</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="docType"
            checked={packageType === 'full_package'}
            onChange={() => setPackageType('full_package')}
            className="text-purple-600"
          />
          <span className="text-sm text-gray-700">Full Package</span>
        </label>
      </div>

      <button
        onClick={() => onGenerate(packageType)}
        disabled={isPending}
        className="w-full py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm disabled:opacity-50"
      >
        {isPending ? 'Generating...' : 'Generate Quote'}
      </button>
    </div>
  );
}

// ============================================================================
// MAIN QUOTE PAGE V2
// ============================================================================

export default function QuotePageV2() {
  const { submissionId } = useParams();
  const queryClient = useQueryClient();
  const [selectedQuoteId, setSelectedQuoteId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // ---- DATA FETCHING (all at top level) ----

  const { data: submission } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes', submissionId],
    queryFn: () => getQuoteOptions(submissionId).then(res => res.data),
  });

  const selectedQuote = quotes.find(q => q.id === selectedQuoteId) || quotes[0];

  // Subjectivities for current quote (for bind readiness)
  const { data: quoteSubjectivities = [] } = useQuery({
    queryKey: ['quoteSubjectivities', selectedQuote?.id],
    queryFn: () => getQuoteSubjectivities(selectedQuote.id).then(res => res.data),
    enabled: !!selectedQuote?.id,
  });

  // ---- MUTATIONS ----

  const createMutation = useMutation({
    mutationFn: (data) => createQuoteOption(submissionId, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      setShowCreateModal(false);
      if (response.data?.id) setSelectedQuoteId(response.data.id);
    },
  });

  const updateQuoteMutation = useMutation({
    mutationFn: (data) => updateQuoteOption(selectedQuote.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] }),
  });

  const updateSubmissionMutation = useMutation({
    mutationFn: (data) => updateSubmission(submissionId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['submission', submissionId] }),
  });

  const cloneMutation = useMutation({
    mutationFn: () => cloneQuoteOption(selectedQuote?.id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      if (response.data?.id) setSelectedQuoteId(response.data.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteQuoteOption(selectedQuote?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      setSelectedQuoteId(null);
    },
  });

  const generateDocMutation = useMutation({
    mutationFn: (packageType) => {
      if (packageType === 'full_package') {
        return generateQuotePackage(selectedQuote.id, { package_type: 'full_package' });
      }
      return generateQuoteDocument(selectedQuote.id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      if (data.data?.pdf_url) window.open(data.data.pdf_url, '_blank');
    },
  });

  const bindMutation = useMutation({
    mutationFn: (force = false) => bindQuoteOption(selectedQuote.id, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['submission', submissionId] });
    },
  });

  // ---- HANDLERS ----

  const handleCreate = () => setShowCreateModal(true);
  const handleClone = () => cloneMutation.mutate();
  const handleDelete = () => {
    if (window.confirm('Delete this option? This cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  // ---- RENDER ----

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading quotes...</div>;
  }

  if (!quotes.length) {
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
          <p className="text-gray-500 mb-4">No quote options yet</p>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
          >
            Create First Option
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-6 items-start">

        {/* LEFT COLUMN: Quote Editor (8 cols) */}
        <div className="col-span-8 space-y-5">

          {/* Quote Tabs */}
          <QuoteTabSelector
            quotes={quotes}
            activeQuoteId={selectedQuote?.id}
            onSelect={setSelectedQuoteId}
            onCreate={handleCreate}
            onClone={handleClone}
            onDelete={handleDelete}
            submission={submission}
          />

          {/* Tower Section: Visual + Editor */}
          {selectedQuote && (
            <div className="grid grid-cols-6 gap-4">
              {/* Tower Visual (1 col) */}
              <div className="col-span-1">
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3 text-center">
                    Tower
                  </h4>
                  <TowerVisual
                    tower={selectedQuote.tower_json}
                    position={selectedQuote.position}
                  />
                </div>
              </div>

              {/* Tower Editor (5 cols) */}
              <div className="col-span-5">
                <TowerEditor
                  key={selectedQuote.id}
                  quote={selectedQuote}
                  onSave={(data) => updateQuoteMutation.mutate(data)}
                  isPending={updateQuoteMutation.isPending}
                />
              </div>
            </div>
          )}

          {/* Dates Section */}
          {selectedQuote && submission && (
            <DatesSection
              submission={submission}
              quote={selectedQuote}
              onUpdateSubmission={(data) => updateSubmissionMutation.mutate(data)}
              onUpdateQuote={(data) => updateQuoteMutation.mutate(data)}
              allQuotes={quotes}
            />
          )}

          {/* Coverage Schedule */}
          {selectedQuote && selectedQuote.position === 'primary' && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Coverage Schedule
                </h3>
              </div>
              <div className="p-4">
                <CoverageEditor
                  quote={selectedQuote}
                  aggregateLimit={selectedQuote.tower_json?.[0]?.limit || 1000000}
                  onSave={(coverages) => updateQuoteMutation.mutate({ coverages })}
                  allQuotes={quotes}
                  submissionId={submissionId}
                />
              </div>
            </div>
          )}

          {selectedQuote && selectedQuote.position !== 'primary' && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  Excess Coverage Schedule
                </h3>
              </div>
              <div className="p-4">
                <ExcessCoverageEditor
                  sublimits={selectedQuote.sublimits || []}
                  towerJson={selectedQuote.tower_json || []}
                  onSave={(sublimits) => updateQuoteMutation.mutate({ sublimits })}
                />
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: Workbench (4 cols, sticky) */}
        <div className="col-span-4 space-y-5 sticky top-6">

          {/* Bind Readiness */}
          {selectedQuote && (
            <BindReadiness
              quote={selectedQuote}
              subjectivities={quoteSubjectivities}
            />
          )}

          {/* Subjectivities & Endorsements */}
          <SubjectivitiesEndorsementsPanel
            quotes={quotes}
            submissionId={submissionId}
            activeQuoteId={selectedQuote?.id}
          />

          {/* Document Generation */}
          {selectedQuote && (
            <DocumentGeneration
              quote={selectedQuote}
              onGenerate={(type) => generateDocMutation.mutate(type)}
              isPending={generateDocMutation.isPending}
            />
          )}

          {/* Bind Button */}
          {selectedQuote && !selectedQuote.is_bound && (
            <button
              onClick={() => bindMutation.mutate(false)}
              disabled={bindMutation.isPending}
              className="w-full py-3 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 shadow-sm disabled:opacity-50"
            >
              {bindMutation.isPending ? 'Binding...' : 'Bind Quote'}
            </button>
          )}

          {selectedQuote?.is_bound && (
            <div className="text-center py-3 bg-green-100 text-green-700 rounded-lg text-sm font-semibold">
              ✓ Quote Bound
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
