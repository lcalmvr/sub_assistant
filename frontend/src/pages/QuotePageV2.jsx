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
  if (quote.sold_premium) return quote.sold_premium;
  if (quote.risk_adjusted_premium) return quote.risk_adjusted_premium;
  // Fall back to CMAI layer premium from tower
  const tower = quote.tower_json || [];
  const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI'));
  return cmaiLayer?.premium || null;
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
// QUOTE TAB SELECTOR
// ============================================================================

function QuoteTabSelector({ quotes, activeQuoteId, onSelect, onCreate, onClone, onDelete }) {
  const [showOverflow, setShowOverflow] = useState(false);
  const MAX_VISIBLE = 4;

  const visibleQuotes = quotes.slice(0, MAX_VISIBLE);
  const overflowQuotes = quotes.slice(MAX_VISIBLE);
  const activeQuote = quotes.find(q => q.id === activeQuoteId);

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

      {/* Actions */}
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
                    {isEditing && isPrimary && !isCMAI ? (
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
                        {isPrimary && !isCMAI ? formatCompact(layer.retention || quote.primary_retention) : `xs ${formatCompact(attachment)}`}
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

// ============================================================================
// CROSS-OPTION MATRIX SIDEBAR
// ============================================================================

function CrossOptionMatrix({ quotes, submissionId, activeQuoteId }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('endorsements');

  // Fetch submission-level data for matrix
  const { data: subjectivitiesData = [] } = useQuery({
    queryKey: ['submissionSubjectivities', submissionId],
    queryFn: () => getSubmissionSubjectivities(submissionId).then(res => res.data),
  });

  const { data: endorsementsData } = useQuery({
    queryKey: ['submissionEndorsements', submissionId],
    queryFn: () => getSubmissionEndorsements(submissionId).then(res => res.data),
  });

  // Mutations
  const toggleSubjMutation = useMutation({
    mutationFn: ({ subjectivityId, quoteId, isLinked }) =>
      isLinked ? unlinkSubjectivityFromQuote(quoteId, subjectivityId) : linkSubjectivityToQuote(quoteId, subjectivityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      quotes.forEach(q => queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] }));
    },
  });

  const toggleEndtMutation = useMutation({
    mutationFn: ({ endorsementId, quoteId, isLinked }) =>
      isLinked ? unlinkEndorsementFromQuote(quoteId, endorsementId) : linkEndorsementToQuote(quoteId, endorsementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
      quotes.forEach(q => queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', q.id] }));
    },
  });

  const subjectivities = subjectivitiesData.filter(s => s.status !== 'excluded');
  const endorsements = endorsementsData?.endorsements || [];

  // Build abbreviated column headers
  const quoteHeaders = quotes.map(q => ({
    id: q.id,
    label: generateOptionName(q).split(' ')[0], // Just "$5M" or "$2M"
    isCurrent: q.id === activeQuoteId,
  }));

  // Dynamic column width based on number of quotes
  const colWidth = quotes.length <= 3 ? '60px' : '50px';

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          Cross-Option Assignment
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('endorsements')}
          className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'endorsements'
              ? 'border-purple-500 text-purple-600 bg-purple-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Endorsements ({endorsements.length})
        </button>
        <button
          onClick={() => setActiveTab('subjectivities')}
          className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'subjectivities'
              ? 'border-purple-500 text-purple-600 bg-purple-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Subjectivities ({subjectivities.length})
        </button>
      </div>

      {/* Matrix */}
      <div className="p-3">
        {/* Headers */}
        <div className="flex items-center gap-1 mb-2 text-[10px] font-semibold text-gray-500 uppercase">
          <div className="flex-1"></div>
          {quoteHeaders.map(q => (
            <div
              key={q.id}
              className={`text-center truncate ${q.isCurrent ? 'text-purple-600' : ''}`}
              style={{ width: colWidth }}
              title={generateOptionName(quotes.find(qq => qq.id === q.id))}
            >
              {q.label}
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {activeTab === 'endorsements' && endorsements.map(endt => {
            const linkedIds = parseQuoteIds(endt.quote_ids);
            return (
              <div key={endt.endorsement_id} className="flex items-center gap-1 py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                  <span className="text-xs text-gray-700 truncate" title={endt.title}>
                    {endt.title.length > 22 ? `${endt.title.substring(0, 22)}...` : endt.title}
                  </span>
                </div>
                {quoteHeaders.map(q => (
                  <div key={q.id} className="text-center" style={{ width: colWidth }}>
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
                  </div>
                ))}
              </div>
            );
          })}

          {activeTab === 'subjectivities' && subjectivities.map(subj => {
            const linkedIds = parseQuoteIds(subj.quote_ids);
            return (
              <div key={subj.id} className="flex items-center gap-1 py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                  <span className={`text-[10px] px-1 py-0.5 rounded ${
                    subj.status === 'received' ? 'bg-green-100 text-green-700' :
                    subj.status === 'waived' ? 'bg-gray-100 text-gray-500' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {(subj.status || 'pending').slice(0, 3)}
                  </span>
                  <span className="text-xs text-gray-700 truncate" title={subj.text}>
                    {subj.text.length > 18 ? `${subj.text.substring(0, 18)}...` : subj.text}
                  </span>
                </div>
                {quoteHeaders.map(q => (
                  <div key={q.id} className="text-center" style={{ width: colWidth }}>
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
                  </div>
                ))}
              </div>
            );
          })}

          {((activeTab === 'endorsements' && endorsements.length === 0) ||
            (activeTab === 'subjectivities' && subjectivities.length === 0)) && (
            <div className="py-4 text-center text-xs text-gray-400">
              No {activeTab} added yet
            </div>
          )}
        </div>

        {/* Add button */}
        <button className="w-full mt-3 py-2 text-xs text-purple-600 hover:bg-purple-50 rounded border border-dashed border-purple-200 font-medium">
          + Add {activeTab === 'endorsements' ? 'Endorsement' : 'Subjectivity'}
        </button>
      </div>
    </div>
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
          />

          {/* Tower Editor */}
          {selectedQuote && (
            <TowerEditor
              quote={selectedQuote}
              onSave={(data) => updateQuoteMutation.mutate(data)}
              isPending={updateQuoteMutation.isPending}
            />
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

          {/* Cross-Option Matrix */}
          {quotes.length > 1 && (
            <CrossOptionMatrix
              quotes={quotes}
              submissionId={submissionId}
              activeQuoteId={selectedQuote?.id}
            />
          )}

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
