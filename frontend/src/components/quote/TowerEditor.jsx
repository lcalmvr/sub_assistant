import { useState, useEffect, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';
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
  getDaysBetween,
  hasCustomTerm,
  PREMIUM_BASIS,
  PREMIUM_BASIS_LABELS,
} from '../../utils/premiumUtils';

// Helper: format date as "Jan 15"
function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Helper: format date as "Jan 15, 2025"
function formatDateFull(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TowerEditor({ quote, onSave, isPending, embedded = false, setEditControls }) {
  const [isEditing, setIsEditing] = useState(embedded); // Start in edit mode if embedded
  // Normalize layers on load to ensure annual/actual/basis fields exist
  const [layers, setLayers] = useState(() => normalizeTower(quote.tower_json));
  const hasQs = layers.some(l => l.quota_share);
  const [showQsColumn, setShowQsColumn] = useState(hasQs);
  const containerRef = useRef(null); // For click-outside detection (includes header + table)

  // Draft state for term popover (apply on Done, discard on close)
  const [openTermIdx, setOpenTermIdx] = useState(null); // Which layer's popover is open (actualIdx)
  const [draftTerm, setDraftTerm] = useState({ start: '', end: '' });

  // Structure term from quote (for term inheritance)
  const structureTerm = {
    start: quote.effective_date_override || quote.effective_date || null,
    end: quote.expiration_date_override || quote.expiration_date || null,
  };

  // Tower-level term info (for header badge and column visibility)
  const anyLayerHasCustomTerm = layers.some(l => hasCustomTerm(l));
  const inheritedTermDays = getDaysBetween(structureTerm.start, structureTerm.end);
  const inheritedProRataFactor = getProRataFactor(structureTerm.start, structureTerm.end);
  const inheritedIsShortTerm = inheritedProRataFactor < 0.95;
  // Only show Term column when there's actual variance (custom terms exist)
  const showTermColumn = anyLayerHasCustomTerm;

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
    setLayers(normalizeTower(quote.tower_json));
    setShowQsColumn((quote.tower_json || []).some(l => l.quota_share));
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

  const handleSave = () => {
    const recalculated = recalculateAttachments(layers);
    // Serialize to ensure legacy premium field stays in sync
    const serialized = serializeTower(recalculated);
    onSave({ tower_json: serialized, quote_name: generateOptionName({ ...quote, tower_json: serialized }) });
    setIsEditing(false);
    setEditControls?.(null);
  };

  const handleCancel = () => {
    setLayers(normalizeTower(quote.tower_json));
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
      <div className={embedded ? '' : 'overflow-hidden rounded-lg border border-gray-100 mx-4 mb-4'}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Carrier</th>
              <th className="px-4 py-2.5 text-left font-semibold">Limit</th>
              {showQsColumn && <th className="px-4 py-2.5 text-left font-semibold">Part Of</th>}
              <th className="px-4 py-2.5 text-left font-semibold">{quote.position === 'primary' ? 'Retention' : 'Attach'}</th>
              {/* Term column: only show when there's variance (like Quota Share) */}
              {isEditing && showTermColumn && (
                <th className="px-4 py-2.5 text-center font-semibold">Term</th>
              )}
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
              // Use annual premium for RPM/ILF calculations (correct for rate comparison)
              const annualPremium = getAnnualPremium(layer);
              const actualPremium = getActualPremium(layer);
              const rpm = annualPremium && layer.limit ? Math.round(annualPremium / (layer.limit / 1_000_000)) : null;
              const baseLayer = layers[0];
              const baseAnnual = getAnnualPremium(baseLayer);
              const baseRpm = baseAnnual && baseLayer?.limit ? baseAnnual / (baseLayer.limit / 1_000_000) : null;
              const ilfPercent = rpm && baseRpm ? Math.round((rpm / baseRpm) * 100) : null;

              // Term calculations
              const layerHasCustomTerm = hasCustomTerm(layer);
              const effectiveStart = layer.term_start || structureTerm.start;
              const effectiveEnd = layer.term_end || structureTerm.end;
              const termDays = getDaysBetween(effectiveStart, effectiveEnd);
              const proRataFactor = getProRataFactor(effectiveStart, effectiveEnd);
              const isShortTerm = proRataFactor < 0.95;
              const theoreticalProRata = annualPremium ? getTheoreticalProRata(annualPremium, effectiveStart, effectiveEnd) : null;
              const premiumBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
              const showActualDifference = annualPremium && actualPremium && Math.abs(annualPremium - actualPremium) > 0.01;

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

                  {/* Term column: only show when there's variance */}
                  {isEditing && showTermColumn && (
                    <td className="px-4 py-1.5 text-center">
                      <Popover.Root
                        open={openTermIdx === actualIdx}
                        onOpenChange={(open) => {
                          if (open) {
                            // Initialize draft from layer when opening
                            setDraftTerm({
                              start: layer.term_start || '',
                              end: layer.term_end || '',
                            });
                            setOpenTermIdx(actualIdx);
                          } else {
                            // Discard draft on close (without Done)
                            setOpenTermIdx(null);
                          }
                        }}
                      >
                        <Popover.Trigger asChild>
                          <button
                            className={`text-xs px-2 py-1 rounded transition-colors ${
                              layerHasCustomTerm
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                            title={layerHasCustomTerm ? 'Custom term dates' : 'Click to set custom term'}
                          >
                            {layerHasCustomTerm ? (
                              <span>{formatDateShort(effectiveStart)} – {formatDateShort(effectiveEnd)}</span>
                            ) : (
                              <span>Inherited</span>
                            )}
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-72 z-50"
                            sideOffset={5}
                            align="center"
                          >
                            {(() => {
                              // Calculate draft term info for preview
                              const draftStart = draftTerm.start || structureTerm.start;
                              const draftEnd = draftTerm.end || structureTerm.end;
                              const draftDays = getDaysBetween(draftStart, draftEnd);
                              const draftProRata = getProRataFactor(draftStart, draftEnd);
                              const hasDraftCustomTerm = draftTerm.start || draftTerm.end;

                              return (
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-gray-700">Layer Term</h4>
                                    {hasDraftCustomTerm && (
                                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Custom</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">
                                    <span className="font-medium">Policy term:</span>{' '}
                                    {formatDateFull(structureTerm.start)} — {formatDateFull(structureTerm.end)}
                                    <div className="text-[10px] text-gray-400 mt-0.5">Layer terms do not change the policy term.</div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-[10px] text-gray-500 uppercase block mb-1">Effective</label>
                                      <input
                                        type="date"
                                        value={draftTerm.start}
                                        onChange={(e) => setDraftTerm({ ...draftTerm, start: e.target.value })}
                                        className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:border-blue-400 outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-gray-500 uppercase block mb-1">Expiration</label>
                                      <input
                                        type="date"
                                        value={draftTerm.end}
                                        onChange={(e) => setDraftTerm({ ...draftTerm, end: e.target.value })}
                                        className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:border-blue-400 outline-none"
                                      />
                                    </div>
                                  </div>
                                  {/* Term info preview */}
                                  {draftStart && draftEnd && (
                                    <div className="text-xs text-gray-600 bg-blue-50 rounded px-2 py-1.5">
                                      <div className="flex justify-between">
                                        <span>Duration:</span>
                                        <span className="font-medium">{draftDays} days</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Pro-rata factor:</span>
                                        <span className="font-medium">{(draftProRata * 100).toFixed(1)}%</span>
                                      </div>
                                    </div>
                                  )}
                                  {/* Actions */}
                                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                                    {(layerHasCustomTerm || hasDraftCustomTerm) && (
                                      <button
                                        onClick={() => {
                                          // Clear draft and apply inherited to layer
                                          const newLayers = [...layers];
                                          const annual = getAnnualPremium(layer);
                                          const inheritedProRata = getProRataFactor(structureTerm.start, structureTerm.end);
                                          let newActual = annual;
                                          let newBasis = PREMIUM_BASIS.ANNUAL;
                                          if (inheritedProRata < 0.95 && annual) {
                                            newActual = getTheoreticalProRata(annual, structureTerm.start, structureTerm.end);
                                            newBasis = PREMIUM_BASIS.PRO_RATA;
                                          }
                                          newLayers[actualIdx] = {
                                            ...newLayers[actualIdx],
                                            term_start: null,
                                            term_end: null,
                                            actual_premium: newActual,
                                            premium_basis: newBasis,
                                          };
                                          setLayers(newLayers);
                                          setOpenTermIdx(null);
                                        }}
                                        className="flex-1 text-xs text-gray-500 hover:text-gray-700 py-1.5"
                                      >
                                        Use inherited
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Apply draft to layer
                                        const newLayers = [...layers];
                                        const newStart = draftTerm.start || null;
                                        const newEnd = draftTerm.end || null;
                                        // Auto-calculate pro-rata when term changes
                                        const newProRata = getProRataFactor(newStart || structureTerm.start, newEnd || structureTerm.end);
                                        const annual = getAnnualPremium(layer);
                                        let newActual = annual;
                                        let newBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
                                        if (newProRata < 0.95 && annual) {
                                          newActual = getTheoreticalProRata(annual, newStart || structureTerm.start, newEnd || structureTerm.end);
                                          newBasis = PREMIUM_BASIS.PRO_RATA;
                                        }
                                        newLayers[actualIdx] = {
                                          ...newLayers[actualIdx],
                                          term_start: newStart,
                                          term_end: newEnd,
                                          actual_premium: newActual,
                                          premium_basis: newBasis,
                                        };
                                        setLayers(newLayers);
                                        setOpenTermIdx(null);
                                      }}
                                      className="flex-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded py-1.5 font-medium"
                                    >
                                      Done
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}
                            <Popover.Arrow className="fill-white" />
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    </td>
                  )}

                  {/* Premium (Annual + Actual) */}
                  <td className={`px-4 text-right ${isEditing ? 'py-1.5' : 'py-3'}`}>
                    {isEditing ? (
                      <div className="flex flex-col items-end">
                        {/* Annual premium input */}
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
                            // Calculate actual based on term
                            let newActual = newAnnual;
                            let newBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
                            if (isShortTerm && newAnnual) {
                              const proRata = getTheoreticalProRata(newAnnual, effectiveStart, effectiveEnd);
                              if (newBasis === PREMIUM_BASIS.MINIMUM && layer.minimum_premium) {
                                newActual = Math.max(proRata, layer.minimum_premium);
                              } else if (newBasis === PREMIUM_BASIS.FLAT) {
                                newActual = layer.flat_premium || newAnnual;
                              } else {
                                newActual = proRata;
                                newBasis = PREMIUM_BASIS.PRO_RATA;
                              }
                            }
                            newLayers[actualIdx] = {
                              ...newLayers[actualIdx],
                              annual_premium: newAnnual,
                              actual_premium: newActual,
                              premium_basis: newBasis,
                            };
                            setLayers(newLayers);
                          }}
                          onKeyDown={(e) => handleArrowNav(e, displayIdx, premiumInputRefs)}
                          onFocus={(e) => e.target.select()}
                        />
                        {/* Secondary line: always reserve space (h-4), show Actual when different from Annual */}
                        <div className="h-4 flex items-center justify-end gap-1">
                          {showActualDifference ? (
                            <>
                              <span className={`text-[10px] ${
                                premiumBasis === PREMIUM_BASIS.MINIMUM || premiumBasis === PREMIUM_BASIS.FLAT
                                  ? 'text-amber-600'
                                  : 'text-gray-500'
                              }`}>
                                Actual: {formatCurrency(actualPremium)}
                              </span>
                              {/* Basis selector for CMAI layer */}
                              {isCMAI && (
                                <select
                                  value={premiumBasis}
                                  onChange={(e) => {
                                    const newLayers = [...layers];
                                    const newBasis = e.target.value;
                                    let newActual = actualPremium;
                                    if (newBasis === PREMIUM_BASIS.ANNUAL) {
                                      newActual = annualPremium;
                                    } else if (newBasis === PREMIUM_BASIS.PRO_RATA) {
                                      newActual = theoreticalProRata;
                                    } else if (newBasis === PREMIUM_BASIS.MINIMUM) {
                                      newActual = Math.max(theoreticalProRata || 0, layer.minimum_premium || actualPremium);
                                    } else if (newBasis === PREMIUM_BASIS.FLAT) {
                                      newActual = layer.flat_premium || actualPremium;
                                    }
                                    newLayers[actualIdx] = {
                                      ...newLayers[actualIdx],
                                      actual_premium: newActual,
                                      premium_basis: newBasis,
                                    };
                                    setLayers(newLayers);
                                  }}
                                  className={`text-[10px] bg-gray-50 border border-gray-200 rounded px-1 py-0.5 cursor-pointer ${
                                    premiumBasis === PREMIUM_BASIS.MINIMUM || premiumBasis === PREMIUM_BASIS.FLAT
                                      ? 'text-amber-600'
                                      : 'text-gray-500'
                                  }`}
                                >
                                  <option value={PREMIUM_BASIS.PRO_RATA}>Pro-rata</option>
                                  <option value={PREMIUM_BASIS.MINIMUM}>Minimum</option>
                                  <option value={PREMIUM_BASIS.FLAT}>Flat</option>
                              </select>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end">
                        <span className="font-medium text-green-700">
                          {formatCurrency(annualPremium)}
                        </span>
                        {/* Show actual premium line when different */}
                        {showActualDifference && (
                          <span className={`text-[10px] ${
                            premiumBasis === PREMIUM_BASIS.MINIMUM || premiumBasis === PREMIUM_BASIS.FLAT
                              ? 'text-amber-600'
                              : 'text-gray-500'
                          }`}>
                            Actual: {formatCurrency(actualPremium)} ({PREMIUM_BASIS_LABELS[premiumBasis] || 'Annual'})
                          </span>
                        )}
                      </div>
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
                          const newAnnual = newRpm && layer.limit ? Math.round(newRpm * (layer.limit / 1_000_000)) : null;
                          // Calculate actual based on term
                          let newActual = newAnnual;
                          let newBasis = isShortTerm ? PREMIUM_BASIS.PRO_RATA : PREMIUM_BASIS.ANNUAL;
                          if (isShortTerm && newAnnual) {
                            newActual = getTheoreticalProRata(newAnnual, effectiveStart, effectiveEnd);
                          }
                          newLayers[actualIdx] = {
                            ...newLayers[actualIdx],
                            annual_premium: newAnnual,
                            actual_premium: newActual,
                            premium_basis: newBasis,
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
                          // Calculate actual based on term
                          let newActual = newAnnual;
                          let newBasis = isShortTerm ? PREMIUM_BASIS.PRO_RATA : PREMIUM_BASIS.ANNUAL;
                          if (isShortTerm && newAnnual) {
                            newActual = getTheoreticalProRata(newAnnual, effectiveStart, effectiveEnd);
                          }
                          newLayers[actualIdx] = {
                            ...newLayers[actualIdx],
                            annual_premium: newAnnual,
                            actual_premium: newActual,
                            premium_basis: newBasis,
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
