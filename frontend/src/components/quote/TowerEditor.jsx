import { useState, useEffect, useRef, useCallback } from 'react';
import {
  formatCompact,
  formatCurrency,
  formatNumberWithCommas,
  parseFormattedNumber,
  calculateAttachment,
  recalculateAttachments,
  generateOptionName,
} from '../../utils/quoteUtils';
import {
  normalizeTower,
  serializeTower,
  getAnnualPremium,
  getActualPremium,
  getProRataFactor,
  getTheoreticalProRata,
  hasCustomTerm,
  calculateActualPremium,
  PREMIUM_BASIS,
} from '../../utils/premiumUtils';

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

function normalizeDateInput(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (isValidIsoDate(trimmed)) return trimmed;

  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!mdyMatch) return '';

  const month = String(mdyMatch[1]).padStart(2, '0');
  const day = String(mdyMatch[2]).padStart(2, '0');
  const iso = `${mdyMatch[3]}-${month}-${day}`;
  return isValidIsoDate(iso) ? iso : '';
}

export default function TowerEditor({ quote, onSave, isPending, embedded = false, setEditControls, saveRef }) {
  const [isEditing, setIsEditing] = useState(embedded); // Start in edit mode if embedded
  // Normalize layers on load to ensure annual/actual/basis fields exist
  const [layers, setLayers] = useState(() => normalizeTower(quote.tower_json));
  const hasQs = layers.some(l => l.quota_share);
  const [showQsColumn, setShowQsColumn] = useState(hasQs);
  const [termColumnEnabled, setTermColumnEnabled] = useState(false);
  const containerRef = useRef(null); // For click-outside detection (includes header + table)

  // Draft state for term inputs (apply on blur/enter)
  const [termDrafts, setTermDrafts] = useState({});
  const [termErrors, setTermErrors] = useState({});

  // Structure term from quote (for term inheritance)
  const structureTerm = {
    start: quote.effective_date_override || quote.effective_date || null,
    end: quote.expiration_date_override || quote.expiration_date || null,
  };

  // Tower-level term info (for header badge and column visibility)
  const anyLayerHasCustomTerm = layers.some(l => hasCustomTerm(l));
  const showTermColumn = termColumnEnabled || anyLayerHasCustomTerm;
  const showTermOverrides = isEditing && showTermColumn;

  // Refs for inputs (keyed by displayIdx for arrow navigation)
  const carrierInputRefs = useRef({});
  const limitInputRefs = useRef({});
  const qsInputRefs = useRef({});
  const retentionInputRefs = useRef({});
  const premiumInputRefs = useRef({});
  const rpmInputRefs = useRef({});
  const ilfInputRefs = useRef({});

  useEffect(() => {
    // Normalize on load to ensure annual/actual/basis fields exist
    const normalized = normalizeTower(quote.tower_json);
    setLayers(normalized);
    setShowQsColumn((quote.tower_json || []).some(l => l.quota_share));
    setTermColumnEnabled(false);
    setTermDrafts({});
    setTermErrors({});
    setIsEditing(embedded); // Keep edit mode if embedded, otherwise reset
    // Note: Don't clear refs here - they're populated by render via ref callbacks
    // Clearing after render breaks arrow navigation on fresh mounts
  }, [quote.id, embedded]);

  // Click outside to save, Escape to cancel
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e) => {
      // Ignore clicks inside Radix popovers (they render in portals outside table)
      if (e.target.closest('[data-radix-popper-content-wrapper]')) return;
      // Ignore tower card header controls (Done/Edit)
      if (e.target.closest('[data-tower-editor-ignore]')) return;

      if (containerRef.current && !containerRef.current.contains(e.target)) {
        const recalculated = recalculateAttachments(layers);
        // Serialize to ensure legacy premium field stays in sync
        const serialized = serializeTower(recalculated);
        onSave({ tower_json: serialized, quote_name: generateOptionName({ ...quote, tower_json: serialized }) });
        setIsEditing(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Escape: Save all changes and exit (consistent with Subjectivity screen)
        e.preventDefault();
        const recalculated = recalculateAttachments(layers);
        // Serialize to ensure legacy premium field stays in sync
        const serialized = serializeTower(recalculated);
        onSave({ tower_json: serialized, quote_name: generateOptionName({ ...quote, tower_json: serialized }) });
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

  const handleSave = useCallback(() => {
    const recalculated = recalculateAttachments(layers);
    // Serialize to ensure legacy premium field stays in sync
    const serialized = serializeTower(recalculated);
    onSave({ tower_json: serialized, quote_name: generateOptionName({ ...quote, tower_json: serialized }) });
    setIsEditing(false);
    setEditControls?.(null);
  }, [layers, onSave, quote, setEditControls]);

  useEffect(() => {
    if (!saveRef) return undefined;
    saveRef.current = handleSave;
    return () => {
      saveRef.current = null;
    };
  }, [saveRef, handleSave]);

  const handleCancel = () => {
    setLayers(normalizeTower(quote.tower_json));
    setTermDrafts({});
    setTermErrors({});
    setIsEditing(false);
    setEditControls?.(null);
  };

  const applyTermDraft = useCallback((actualIdx, layer) => {
    const currentBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
    const basisForUI = currentBasis === PREMIUM_BASIS.ANNUAL
      ? PREMIUM_BASIS.PRO_RATA
      : (currentBasis === PREMIUM_BASIS.MINIMUM ? PREMIUM_BASIS.FLAT : currentBasis);
    if (basisForUI === PREMIUM_BASIS.PRO_RATA) {
      return;
    }
    const draft = termDrafts[actualIdx] || {};
    const rawStart = String(draft.start ?? layer.term_start ?? '').trim();
    const rawEnd = String(draft.end ?? layer.term_end ?? '').trim();
    const hasStart = rawStart.length > 0;
    const hasEnd = rawEnd.length > 0;

    const setError = (message) => {
      setTermErrors(prev => ({ ...prev, [actualIdx]: message }));
    };
    const clearError = () => {
      setTermErrors(prev => {
        const { [actualIdx]: _removed, ...rest } = prev;
        return rest;
      });
    };

    if (!hasStart && !hasEnd) {
      const newLayers = [...layers];
      const nextLayer = { ...layer, term_start: null, term_end: null };
      nextLayer.actual_premium = basisForUI === PREMIUM_BASIS.FLAT
        ? nextLayer.actual_premium
        : calculateActualPremium({
          annualPremium: getAnnualPremium(nextLayer),
          termStart: structureTerm.start,
          termEnd: structureTerm.end,
          premiumBasis: PREMIUM_BASIS.PRO_RATA,
        });
      newLayers[actualIdx] = nextLayer;
      setLayers(newLayers);
      setTermDrafts(prev => {
        const { [actualIdx]: _removed, ...rest } = prev;
        return rest;
      });
      clearError();
      return;
    }

    if (hasStart !== hasEnd) {
      setError('Enter both effective and expiration dates.');
      return;
    }

    const normalizedStart = normalizeDateInput(rawStart);
    const normalizedEnd = normalizeDateInput(rawEnd);
    if (!normalizedStart || !normalizedEnd) {
      setError('Use YYYY-MM-DD or MM/DD/YYYY.');
      return;
    }

    const startDate = new Date(`${normalizedStart}T00:00:00`);
    const endDate = new Date(`${normalizedEnd}T00:00:00`);
    if (startDate > endDate) {
      setError('Expiration must be after effective date.');
      return;
    }

    const isInherited = normalizedStart === structureTerm.start && normalizedEnd === structureTerm.end;
    const resolvedStart = normalizedStart || structureTerm.start;
    const resolvedEnd = normalizedEnd || structureTerm.end;
    const newProRata = getProRataFactor(resolvedStart, resolvedEnd);
    const annual = getAnnualPremium(layer);
    let newBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
    const layerHasCustomTerm = hasCustomTerm(layer);
    if (!isInherited && !layerHasCustomTerm && newBasis === PREMIUM_BASIS.ANNUAL && newProRata < 0.95) {
      newBasis = PREMIUM_BASIS.PRO_RATA;
    }
    const newActual = basisForUI === PREMIUM_BASIS.FLAT
      ? layer.actual_premium
      : calculateActualPremium({
        annualPremium: annual,
        termStart: resolvedStart,
        termEnd: resolvedEnd,
        premiumBasis: PREMIUM_BASIS.PRO_RATA,
      });

    const newLayers = [...layers];
    newLayers[actualIdx] = {
      ...layer,
      term_start: isInherited ? null : normalizedStart,
      term_end: isInherited ? null : normalizedEnd,
      actual_premium: newActual,
      premium_basis: newBasis,
    };
    setLayers(newLayers);
    setTermDrafts(prev => ({
      ...prev,
      [actualIdx]: isInherited ? { start: '', end: '' } : { start: normalizedStart, end: normalizedEnd },
    }));
    clearError();
  }, [layers, structureTerm.end, structureTerm.start, termDrafts]);

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
  // For bound quotes, use sold_premium; otherwise use annual premium from tower
  const cmaiPremium = quote?.sold_premium || (cmaiLayer ? getAnnualPremium(cmaiLayer) : null);

  if (!layers?.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">
        No tower layers configured
      </div>
    );
  }

  return (
    <div ref={containerRef} className={embedded ? '' : 'bg-white border border-gray-200 rounded-lg shadow-sm'}>
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
              <button onClick={() => { setLayers(normalizeTower(quote.tower_json)); setIsEditing(false); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
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
      <div className={embedded ? '' : 'overflow-x-auto rounded-lg border border-gray-100 mx-4 mb-4'}>
        <table className="w-full min-w-max text-sm">
          <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Carrier</th>
              <th className="px-4 py-2.5 text-left font-semibold">Limit</th>
              {showQsColumn && <th className="px-4 py-2.5 text-left font-semibold">Part Of</th>}
              <th className="px-4 py-2.5 text-left font-semibold">{quote.position === 'primary' ? 'Retention' : 'Attach'}</th>
              {showTermOverrides && (
                <>
                  <th className="px-4 py-2.5 text-center font-semibold">Term</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Annual</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Pro-rata</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Charged</th>
                </>
              )}
              {!showTermOverrides && (
                <th className="px-4 py-2.5 text-right font-semibold">Premium</th>
              )}
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
              // Use annual premium for RPM/ILF calculations (correct for rate comparison)
              const annualPremium = getAnnualPremium(layer);
              const actualPremium = getActualPremium(layer);
              const rpm = annualPremium && layer.limit ? Math.round(annualPremium / (layer.limit / 1_000_000)) : null;
              const baseLayer = layers[0];
              const baseAnnual = getAnnualPremium(baseLayer);
              const baseRpm = baseAnnual && baseLayer?.limit ? baseAnnual / (baseLayer.limit / 1_000_000) : null;
              const ilfPercent = rpm && baseRpm ? Math.round((rpm / baseRpm) * 100) : null;

              // Term calculations
              const effectiveStart = layer.term_start || structureTerm.start;
              const effectiveEnd = layer.term_end || structureTerm.end;
              const proRataValue = annualPremium ? getTheoreticalProRata(annualPremium, effectiveStart, effectiveEnd) : null;
              const premiumBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
              const basisForUI = premiumBasis === PREMIUM_BASIS.ANNUAL
                ? PREMIUM_BASIS.PRO_RATA
                : (premiumBasis === PREMIUM_BASIS.MINIMUM ? PREMIUM_BASIS.FLAT : premiumBasis);
              const termDraft = termDrafts[actualIdx] || {};
              const termStartValue = (basisForUI === PREMIUM_BASIS.PRO_RATA
                ? structureTerm.start
                : (termDraft.start ?? (layer.term_start || structureTerm.start))
              ) || '';
              const termEndValue = (basisForUI === PREMIUM_BASIS.PRO_RATA
                ? structureTerm.end
                : (termDraft.end ?? (layer.term_end || structureTerm.end))
              ) || '';
              const termError = termErrors[actualIdx];
              const termInputClass = `w-28 text-xs text-gray-700 bg-white border rounded px-2 py-1 text-center outline-none disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-100 ${
                termError ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-purple-500'
              }`;

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

                  {showTermOverrides && (
                    <>
                      <td className="px-4 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <select
                            className="text-xs text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none cursor-pointer"
                            value={basisForUI}
                            onChange={(e) => {
                              const newBasis = e.target.value;
                              const newLayers = [...layers];
                              const nextLayer = { ...layer, premium_basis: newBasis };
                              if (newBasis === PREMIUM_BASIS.PRO_RATA) {
                                nextLayer.term_start = null;
                                nextLayer.term_end = null;
                                setTermDrafts(prev => {
                                  const { [actualIdx]: _removed, ...rest } = prev;
                                  return rest;
                                });
                              }
                              const termStart = newBasis === PREMIUM_BASIS.PRO_RATA
                                ? (structureTerm.start || effectiveStart)
                                : effectiveStart;
                              const termEnd = newBasis === PREMIUM_BASIS.PRO_RATA
                                ? (structureTerm.end || effectiveEnd)
                                : effectiveEnd;
                              if (newBasis === PREMIUM_BASIS.FLAT) {
                                if (!nextLayer.actual_premium) {
                                  nextLayer.actual_premium = proRataValue || annualPremium || null;
                                }
                                nextLayer.flat_premium = nextLayer.actual_premium;
                              } else {
                                nextLayer.actual_premium = calculateActualPremium({
                                  annualPremium,
                                  termStart,
                                  termEnd,
                                  premiumBasis: PREMIUM_BASIS.PRO_RATA,
                                });
                              }
                              newLayers[actualIdx] = nextLayer;
                              setLayers(newLayers);
                            }}
                          >
                            <option value={PREMIUM_BASIS.PRO_RATA}>Pro-rata</option>
                            <option value={PREMIUM_BASIS.FLAT}>Flat</option>
                          </select>
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              data-term-idx={actualIdx}
                              data-term-field="start"
                              value={termStartValue}
                              placeholder={structureTerm.start || 'YYYY-MM-DD'}
                              className={termInputClass}
                              title={termError || ''}
                              aria-invalid={Boolean(termError)}
                              disabled={basisForUI === PREMIUM_BASIS.PRO_RATA}
                              onChange={(e) => {
                                const value = e.target.value;
                                setTermDrafts(prev => ({
                                  ...prev,
                                  [actualIdx]: { ...prev[actualIdx], start: value },
                                }));
                                setTermErrors(prev => {
                                  const { [actualIdx]: _removed, ...rest } = prev;
                                  return rest;
                                });
                              }}
                              onFocus={() => {
                                if (basisForUI !== PREMIUM_BASIS.FLAT) return;
                                setTermDrafts(prev => {
                                  const current = prev[actualIdx] || {};
                                  if (current.start || current.end) return prev;
                                  return {
                                    ...prev,
                                    [actualIdx]: {
                                      start: layer.term_start || structureTerm.start || '',
                                      end: layer.term_end || structureTerm.end || '',
                                    },
                                  };
                                });
                              }}
                              onBlur={(e) => {
                                const next = e.relatedTarget;
                                if (next && next.dataset && next.dataset.termIdx === String(actualIdx)) return;
                                applyTermDraft(actualIdx, layer);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  applyTermDraft(actualIdx, layer);
                                }
                              }}
                            />
                            <span className="text-gray-300">–</span>
                            <input
                              type="date"
                              data-term-idx={actualIdx}
                              data-term-field="end"
                              value={termEndValue}
                              placeholder={structureTerm.end || 'YYYY-MM-DD'}
                              className={termInputClass}
                              title={termError || ''}
                              aria-invalid={Boolean(termError)}
                              disabled={basisForUI === PREMIUM_BASIS.PRO_RATA}
                              onChange={(e) => {
                                const value = e.target.value;
                                setTermDrafts(prev => ({
                                  ...prev,
                                  [actualIdx]: { ...prev[actualIdx], end: value },
                                }));
                                setTermErrors(prev => {
                                  const { [actualIdx]: _removed, ...rest } = prev;
                                  return rest;
                                });
                              }}
                              onFocus={() => {
                                if (basisForUI !== PREMIUM_BASIS.FLAT) return;
                                setTermDrafts(prev => {
                                  const current = prev[actualIdx] || {};
                                  if (current.start || current.end) return prev;
                                  return {
                                    ...prev,
                                    [actualIdx]: {
                                      start: layer.term_start || structureTerm.start || '',
                                      end: layer.term_end || structureTerm.end || '',
                                    },
                                  };
                                });
                              }}
                              onBlur={(e) => {
                                const next = e.relatedTarget;
                                if (next && next.dataset && next.dataset.termIdx === String(actualIdx)) return;
                                applyTermDraft(actualIdx, layer);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  applyTermDraft(actualIdx, layer);
                                }
                              }}
                            />
                          </div>
                        </div>
                        {termError && (
                          <div className="text-[10px] text-red-500 mt-1">{termError}</div>
                        )}
                      </td>
                      <td className={`px-4 text-right ${isEditing ? 'py-1.5' : 'py-3'}`}>
                        {isEditing ? (
                          <input
                            ref={(el) => { premiumInputRefs.current[displayIdx] = el; }}
                            type="text"
                            inputMode="numeric"
                            className="w-24 text-sm font-medium text-green-700 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none text-right"
                            value={annualPremium ? formatNumberWithCommas(annualPremium) : ''}
                            placeholder="—"
                            onChange={(e) => {
                              const newLayers = [...layers];
                              const parsed = parseFormattedNumber(e.target.value);
                              const newAnnual = parsed ? Number(parsed) : null;
                              const newActual = basisForUI === PREMIUM_BASIS.FLAT
                                ? actualPremium
                                : calculateActualPremium({
                                  annualPremium: newAnnual,
                                  termStart: effectiveStart,
                                  termEnd: effectiveEnd,
                                  premiumBasis: PREMIUM_BASIS.PRO_RATA,
                                });
                              newLayers[actualIdx] = {
                                ...newLayers[actualIdx],
                                annual_premium: newAnnual,
                                actual_premium: newActual,
                              };
                              setLayers(newLayers);
                            }}
                            onKeyDown={(e) => handleArrowNav(e, displayIdx, premiumInputRefs)}
                            onFocus={(e) => e.target.select()}
                          />
                        ) : (
                          <span className="font-medium text-green-700">
                            {formatCurrency(annualPremium)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <span className="text-xs text-gray-600">
                          {proRataValue ? formatCurrency(proRataValue) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        {basisForUI === PREMIUM_BASIS.FLAT ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            className="w-24 text-xs text-right bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none"
                            value={actualPremium ? formatNumberWithCommas(actualPremium) : ''}
                            placeholder="—"
                            onChange={(e) => {
                              const parsed = parseFormattedNumber(e.target.value);
                              const nextValue = parsed ? Number(parsed) : null;
                              const newLayers = [...layers];
                              newLayers[actualIdx] = {
                                ...newLayers[actualIdx],
                                actual_premium: nextValue,
                                flat_premium: nextValue,
                                premium_basis: PREMIUM_BASIS.FLAT,
                              };
                              setLayers(newLayers);
                            }}
                            onFocus={(e) => e.target.select()}
                          />
                        ) : (
                          <span className="text-xs text-gray-600">
                            {proRataValue ? formatCurrency(proRataValue) : '—'}
                          </span>
                        )}
                      </td>
                    </>
                  )}

                  {!showTermOverrides && (
                    <td className={`px-4 text-right ${isEditing ? 'py-1.5' : 'py-3'}`}>
                      {isEditing ? (
                        <input
                          ref={(el) => { premiumInputRefs.current[displayIdx] = el; }}
                          type="text"
                          inputMode="numeric"
                          className="w-24 text-sm font-medium text-green-700 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none text-right"
                          value={annualPremium ? formatNumberWithCommas(annualPremium) : ''}
                          placeholder="—"
                          onChange={(e) => {
                            const newLayers = [...layers];
                            const parsed = parseFormattedNumber(e.target.value);
                            const newAnnual = parsed ? Number(parsed) : null;
                            const uiBasis = premiumBasis === PREMIUM_BASIS.ANNUAL
                              ? PREMIUM_BASIS.PRO_RATA
                              : (premiumBasis === PREMIUM_BASIS.MINIMUM ? PREMIUM_BASIS.FLAT : premiumBasis);
                            const newActual = uiBasis === PREMIUM_BASIS.FLAT
                              ? layer.actual_premium
                              : calculateActualPremium({
                                annualPremium: newAnnual,
                                termStart: effectiveStart,
                                termEnd: effectiveEnd,
                                premiumBasis: PREMIUM_BASIS.PRO_RATA,
                              });
                            newLayers[actualIdx] = {
                              ...newLayers[actualIdx],
                              annual_premium: newAnnual,
                              actual_premium: newActual,
                              premium_basis: premiumBasis,
                            };
                            setLayers(newLayers);
                          }}
                          onKeyDown={(e) => handleArrowNav(e, displayIdx, premiumInputRefs)}
                          onFocus={(e) => e.target.select()}
                        />
                      ) : (
                        <span className="font-medium text-green-700">
                          {formatCurrency(annualPremium)}
                        </span>
                      )}
                    </td>
                  )}

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
                          const newAnnual = newRpm && layer.limit ? Math.round(newRpm * (layer.limit / 1_000_000)) : null;
                          const currentBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
                          const uiBasis = currentBasis === PREMIUM_BASIS.ANNUAL
                            ? PREMIUM_BASIS.PRO_RATA
                            : (currentBasis === PREMIUM_BASIS.MINIMUM ? PREMIUM_BASIS.FLAT : currentBasis);
                          const newActual = uiBasis === PREMIUM_BASIS.FLAT
                            ? layer.actual_premium
                            : calculateActualPremium({
                              annualPremium: newAnnual,
                              termStart: effectiveStart,
                              termEnd: effectiveEnd,
                              premiumBasis: PREMIUM_BASIS.PRO_RATA,
                            });
                          newLayers[actualIdx] = {
                            ...newLayers[actualIdx],
                            annual_premium: newAnnual,
                            actual_premium: newActual,
                            premium_basis: currentBasis,
                          };
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
                          const newAnnual = pct && baseRpm && layer.limit
                            ? Math.round((pct / 100) * baseRpm * (layer.limit / 1_000_000))
                            : null;
                          const currentBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
                          const uiBasis = currentBasis === PREMIUM_BASIS.ANNUAL
                            ? PREMIUM_BASIS.PRO_RATA
                            : (currentBasis === PREMIUM_BASIS.MINIMUM ? PREMIUM_BASIS.FLAT : currentBasis);
                          const newActual = uiBasis === PREMIUM_BASIS.FLAT
                            ? layer.actual_premium
                            : calculateActualPremium({
                              annualPremium: newAnnual,
                              termStart: effectiveStart,
                              termEnd: effectiveEnd,
                              premiumBasis: PREMIUM_BASIS.PRO_RATA,
                            });
                          newLayers[actualIdx] = {
                            ...newLayers[actualIdx],
                            annual_premium: newAnnual,
                            actual_premium: newActual,
                            premium_basis: currentBasis,
                          };
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
            <label
              className={`flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer ${anyLayerHasCustomTerm ? 'opacity-60' : ''}`}
              title={anyLayerHasCustomTerm ? 'Clear custom terms to hide the column' : 'Show term overrides'}
            >
              <input
                type="checkbox"
                checked={showTermColumn}
                disabled={anyLayerHasCustomTerm}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setTermColumnEnabled(enabled);
                  if (!enabled) {
                    setTermDrafts({});
                    setTermErrors({});
                  }
                }}
                className="rounded border-gray-300 text-purple-600 w-3 h-3"
              />
              Term Overrides
            </label>
          </div>
          <button
            onClick={() => {
              const cmaiIdx = layers.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
              // New layer with proper premium model fields
              const newLayer = {
                carrier: '',
                limit: 5000000,
                attachment: 0,
                annual_premium: null,
                actual_premium: null,
                premium_basis: PREMIUM_BASIS.ANNUAL,
              };
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
