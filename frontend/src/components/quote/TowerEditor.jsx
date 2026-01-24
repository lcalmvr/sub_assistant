import { useState, useRef, useCallback, useEffect } from 'react';
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
  getLayerEffectiveFromConfig,
  groupLayersByEffective,
  calculateActualPremium,
  PREMIUM_BASIS,
} from '../../utils/premiumUtils';

export default function TowerEditor({ quote, onSave, isPending, embedded = false, setEditControls, saveRef }) {
  const [isEditing, setIsEditing] = useState(embedded); // Start in edit mode if embedded
  // Normalize layers on load to ensure annual/actual/basis fields exist
  const [layers, setLayers] = useState(() => normalizeTower(quote.tower_json));
  const hasQs = layers.some(l => l.quota_share);
  const [showQsColumn, setShowQsColumn] = useState(hasQs);
  const containerRef = useRef(null); // For click-outside detection (includes header + table)

  // Draft values for charged inputs (allows clearing without immediate reset)
  const [chargedDrafts, setChargedDrafts] = useState({});

  // Structure term from quote (dates are merged from variation/structure/submission cascade)
  const structureTerm = {
    start: quote.effective_date_override || quote.effective_date || null,
    end: quote.expiration_date_override || quote.expiration_date || null,
  };

  // Get date_config from quote
  const dateConfig = quote.date_config || null;

  // Group layers by effective date based on date_config
  const dateGroups = groupLayersByEffective(layers, dateConfig, structureTerm.start);

  // Check if we have multiple date groups (need to show group headers)
  const hasMultipleDateGroups = dateGroups.length > 1;

  // Helper to get the effective date for a layer based on its attachment
  const getLayerEffective = (layerIdx) => {
    const attachment = layerIdx === 0 ? 0 : layers.slice(0, layerIdx).reduce((sum, l) => sum + (l.limit || 0), 0);
    return getLayerEffectiveFromConfig(attachment, dateConfig, structureTerm.start);
  };

  // Check if any layer has a short term (< 350 days)
  // This determines whether to show Annual + Charged columns vs single Premium column
  const hasShortTermLayers = layers.some((l, idx) => {
    const layerStart = getLayerEffective(idx);
    const layerEnd = structureTerm.end;
    if (!layerStart || layerStart === 'TBD' || !layerEnd) return false;
    const termDays = Math.ceil((new Date(layerEnd) - new Date(layerStart)) / (1000 * 60 * 60 * 24));
    return termDays < 350;
  });

  // Refs for inputs (keyed by displayIdx for arrow navigation)
  const carrierInputRefs = useRef({});
  const limitInputRefs = useRef({});
  const qsInputRefs = useRef({});
  const retentionInputRefs = useRef({});
  const premiumInputRefs = useRef({});
  const chargedInputRefs = useRef({});
  const rpmInputRefs = useRef({});
  const ilfInputRefs = useRef({});

  useEffect(() => {
    // Normalize on load to ensure annual/actual/basis fields exist
    const normalized = normalizeTower(quote.tower_json);
    setLayers(normalized);
    setShowQsColumn((quote.tower_json || []).some(l => l.quota_share));
    setChargedDrafts({}); // Clear any draft values
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
  const columnRefs = [carrierInputRefs, limitInputRefs, qsInputRefs, retentionInputRefs, premiumInputRefs, chargedInputRefs, rpmInputRefs, ilfInputRefs];

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
    setChargedDrafts({});
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
    setChargedDrafts({});
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
  // For bound quotes, use sold_premium; otherwise use annual/actual premium from tower
  const cmaiAnnual = quote?.sold_premium || (cmaiLayer ? getAnnualPremium(cmaiLayer) : null);
  const cmaiCharged = cmaiLayer ? getActualPremium(cmaiLayer) : null;
  const showBothPremiums = cmaiAnnual && cmaiCharged && Math.abs(cmaiAnnual - cmaiCharged) > 0.01;

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
            {(cmaiAnnual || cmaiCharged) && (
              <span className="text-sm font-semibold text-green-600 normal-case ml-2">
                {showBothPremiums ? (
                  <>Our Premium: {formatCurrency(cmaiCharged)} <span className="text-gray-400 font-normal">(Annual: {formatCurrency(cmaiAnnual)})</span></>
                ) : (
                  <>Our Premium: {formatCurrency(cmaiAnnual || cmaiCharged)}</>
                )}
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
      <div className={embedded ? 'overflow-x-auto' : 'overflow-x-auto rounded-lg mx-4 mb-4'}>
        <table className="w-full min-w-max text-sm">
          <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              {/* Spine column - only when multiple date groups */}
              {hasMultipleDateGroups && <th className="w-1 p-0"></th>}
              <th className="px-4 py-2.5 text-left font-semibold">Carrier</th>
              <th className="px-4 py-2.5 text-left font-semibold">Limit</th>
              {showQsColumn && <th className="px-4 py-2.5 text-left font-semibold">Part Of</th>}
              <th className="px-4 py-2.5 text-left font-semibold">{quote.position === 'primary' ? 'Retention' : 'Attach'}</th>
              {hasShortTermLayers && (
                <>
                  <th className="px-4 py-2.5 text-right font-semibold">Annual</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Charged</th>
                </>
              )}
              {!hasShortTermLayers && (
                <th className="px-4 py-2.5 text-right font-semibold">Premium</th>
              )}
              <th className="px-4 py-2.5 text-right font-semibold">RPM</th>
              <th className="px-4 py-2.5 text-right font-semibold">ILF</th>
              {isEditing && <th className="px-4 py-2.5 w-10"></th>}
            </tr>
          </thead>
          {/* Render each date group as a separate tbody with card styling */}
          {[...dateGroups].reverse().map((group, groupDisplayIdx) => {
            const groupIsTbd = group.effective === 'TBD';
            const policyExpiration = structureTerm.end;
            const groupTermDays = !groupIsTbd && group.effective && policyExpiration
              ? Math.ceil((new Date(policyExpiration) - new Date(group.effective)) / (1000 * 60 * 60 * 24))
              : null;

            // Format date for group header
            const formatGroupDate = (dateStr) => {
              if (!dateStr || dateStr === 'TBD') return 'TBD';
              const date = new Date(dateStr + 'T00:00:00');
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
            };

            // Get layers for this group (reversed for display - highest attachment first)
            const groupLayers = layers.slice(group.startIndex, group.endIndex + 1).reverse();

            // Column count for header row colspan (add 1 for spine column when multiple groups)
            const colCount = 5 + (hasShortTermLayers ? 2 : 1) + (showQsColumn ? 1 : 0) + (isEditing ? 1 : 0) + (hasMultipleDateGroups ? 1 : 0);

            // Header styling: amber for TBD, purple for dated
            const headerBg = groupIsTbd ? 'bg-amber-50' : 'bg-purple-50';
            const headerText = groupIsTbd ? 'text-amber-700' : 'text-purple-700';

            return (
              <tbody
                key={`group-${group.startIndex}`}
                className="border-b border-gray-200"
              >
                {/* Group header row - only show when multiple groups */}
                {hasMultipleDateGroups && (
                  <tr className={`${headerBg} ${groupDisplayIdx > 0 ? 'border-t-8 border-t-white' : ''}`}>
                    {/* Spine cell */}
                    <td className={`w-1.5 p-0 ${groupIsTbd ? 'bg-amber-400' : 'bg-purple-500'}`} rowSpan={groupLayers.length + 1}></td>
                    <td colSpan={colCount - 1} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${headerText} uppercase tracking-wide`}>
                          {formatGroupDate(group.effective)}
                          {policyExpiration ? ` — ${formatGroupDate(policyExpiration)}` : ''}
                          {groupTermDays ? ` (${groupTermDays}d)` : ''}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {/* Layer rows for this group */}
                {groupLayers.map((layer, localIdx) => {
                  // Calculate the actual index in the full layers array
                  const actualIdx = group.endIndex - localIdx;
                  // Calculate display index for ref management (global position in reversed display)
                  const displayIdx = [...dateGroups].reverse()
                    .slice(0, groupDisplayIdx)
                    .reduce((sum, g) => sum + (g.endIndex - g.startIndex + 1), 0) + localIdx;

                  const isCMAI = layer.carrier?.toUpperCase().includes('CMAI');
                  const isPrimary = actualIdx === 0;
                  const attachment = calculateAttachment(layers, actualIdx);
                  // Use annual premium for RPM/ILF calculations (correct for rate comparison)
                  const annualPremium = getAnnualPremium(layer);
                  const storedActualPremium = getActualPremium(layer);
                  const premiumBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
                  const rpm = annualPremium && layer.limit ? Math.round(annualPremium / (layer.limit / 1_000_000)) : null;
                  // ILF = this layer's RPM / preceding layer's RPM
                  // layers is sorted by attachment ascending (index 0 = primary)
                  // When layers share same attachment (quota share), skip to find actual underlying layer
                  let precedingLayer = null;
                  for (let i = actualIdx - 1; i >= 0; i--) {
                    const prevAttach = calculateAttachment(layers, i);
                    if (prevAttach < attachment) {
                      precedingLayer = layers[i];
                      break;
                    }
                  }
                  const precedingAnnual = precedingLayer ? getAnnualPremium(precedingLayer) : null;
                  const precedingRpm = precedingAnnual && precedingLayer?.limit ? precedingAnnual / (precedingLayer.limit / 1_000_000) : null;
                  const ilfPercent = rpm && precedingRpm ? Math.round((rpm / precedingRpm) * 100) : null;

                  // Term calculations using date_config (attachment-based)
                  const effectiveStart = getLayerEffective(actualIdx);
                  const effectiveEnd = structureTerm.end; // Always inherit expiration from policy
                  const isTbd = effectiveStart === 'TBD';
                  // Calculate term days for this layer
                  const termDays = !isTbd && effectiveStart && effectiveEnd
                    ? Math.ceil((new Date(effectiveEnd) - new Date(effectiveStart)) / (1000 * 60 * 60 * 24))
                    : 365;
                  const isShortTerm = !isTbd && termDays < 350;

                  // Calculate the actual/charged premium to display
                  // If FLAT basis: show stored value; otherwise pro-rate based on term
                  const actualPremium = premiumBasis === PREMIUM_BASIS.FLAT
                    ? storedActualPremium
                    : (isShortTerm && annualPremium
                        ? Math.round(annualPremium * (termDays / 365))
                        : annualPremium);

                  // Row background - CMAI gets subtle purple only when no date blocks (spine provides distinction)
                  const rowBg = isCMAI && !hasMultipleDateGroups ? 'bg-purple-50/50' : 'bg-white';

                  return (
                    <tr
                      key={actualIdx}
                      className={`${rowBg} ${isEditing ? '' : 'hover:bg-gray-50 cursor-pointer'} border-b border-gray-100 last:border-b-0`}
                      onClick={(e) => {
                        if (!isEditing) {
                          e.stopPropagation();
                          setIsEditing(true);
                        }
                      }}
                    >
                  {/* Carrier */}
                  <td className={`px-4 ${isEditing ? 'py-1.5' : 'py-3'}`}>
                    <div className="flex items-center gap-2">
                      {isEditing && !isCMAI ? (
                        <input
                          ref={(el) => { carrierInputRefs.current[displayIdx] = el; }}
                          type="text"
                          className="flex-1 min-w-0 text-sm font-medium text-gray-800 bg-transparent border-b border-transparent focus:border-purple-400 py-1 outline-none"
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
                        <span className={`font-medium ${isCMAI ? 'text-purple-700' : 'text-gray-800'}`}>
                          {layer.carrier || 'Unnamed'}
                        </span>
                      )}
                      {isCMAI && <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.5 rounded flex-shrink-0">Ours</span>}
                    </div>
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
                        <input
                          ref={(el) => { qsInputRefs.current[displayIdx] = el; }}
                          type="text"
                          className="w-20 text-sm text-gray-500 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none"
                          placeholder="—"
                          defaultValue={layer.quota_share ? formatCompact(layer.quota_share) : ''}
                          onBlur={(e) => {
                            const newLayers = [...layers];
                            const raw = e.target.value.trim().replace(/[$,]/g, '');
                            if (!raw) {
                              const { quota_share, ...rest } = newLayers[actualIdx];
                              newLayers[actualIdx] = rest;
                            } else {
                              // Parse value: support M/K suffixes
                              let val = parseFloat(raw);
                              if (raw.toLowerCase().endsWith('m')) {
                                val = parseFloat(raw) * 1_000_000;
                              } else if (raw.toLowerCase().endsWith('k')) {
                                val = parseFloat(raw) * 1_000;
                              } else if (val < 1000) {
                                // Assume millions if small number entered
                                val = val * 1_000_000;
                              }
                              if (!isNaN(val) && val > 0) {
                                newLayers[actualIdx] = { ...newLayers[actualIdx], quota_share: val };
                                e.target.value = formatCompact(val);
                              }
                            }
                            setLayers(newLayers);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.target.blur();
                            handleArrowNav(e, displayIdx, qsInputRefs);
                          }}
                        />
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

                  {hasShortTermLayers && (
                    <>
                      {/* Annual */}
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
                              const currentBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;
                              // If flat rate is set, don't auto-recalculate charged
                              // Otherwise, pro-rate based on term
                              const newActual = currentBasis === PREMIUM_BASIS.FLAT
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
                      {/* Charged (editable for flat rate override) */}
                      <td className={`px-4 text-right ${isEditing ? 'py-1.5' : 'py-3'}`}>
                        {isEditing ? (() => {
                          const hasDraft = actualIdx in chargedDrafts;
                          const displayValue = hasDraft
                            ? chargedDrafts[actualIdx]
                            : (actualPremium ? formatNumberWithCommas(actualPremium) : '');
                          return (
                            <input
                              ref={(el) => { chargedInputRefs.current[displayIdx] = el; }}
                              type="text"
                              inputMode="numeric"
                              className={`w-24 text-sm font-medium bg-white border rounded px-2 py-1 focus:border-purple-500 outline-none text-right ${
                                premiumBasis === PREMIUM_BASIS.FLAT ? 'text-blue-700 border-blue-200' : 'text-green-700 border-gray-200'
                              }`}
                              value={displayValue}
                              placeholder="Pro-rata"
                              title={premiumBasis === PREMIUM_BASIS.FLAT ? 'Flat rate (override)' : 'Pro-rata calculated - edit to override'}
                              onChange={(e) => {
                                // Store as draft while typing
                                setChargedDrafts(prev => ({ ...prev, [actualIdx]: e.target.value }));
                              }}
                              onKeyDown={(e) => handleArrowNav(e, displayIdx, chargedInputRefs)}
                              onBlur={() => {
                                // On blur, commit the value
                                const draft = chargedDrafts[actualIdx];
                                if (draft === undefined) return; // No draft, nothing to commit

                                const parsed = parseFormattedNumber(draft);
                                const newCharged = parsed ? Number(parsed) : null;
                                const newLayers = [...layers];

                                if (newCharged === null) {
                                  // Empty = reset to pro-rata
                                  const proRataValue = calculateActualPremium({
                                    annualPremium,
                                    termStart: effectiveStart,
                                    termEnd: effectiveEnd,
                                    premiumBasis: PREMIUM_BASIS.PRO_RATA,
                                  });
                                  newLayers[actualIdx] = {
                                    ...newLayers[actualIdx],
                                    actual_premium: proRataValue,
                                    premium_basis: PREMIUM_BASIS.PRO_RATA,
                                  };
                                } else {
                                  // Has value = set as flat rate
                                  newLayers[actualIdx] = {
                                    ...newLayers[actualIdx],
                                    actual_premium: newCharged,
                                    premium_basis: PREMIUM_BASIS.FLAT,
                                  };
                                }
                                setLayers(newLayers);
                                // Clear the draft
                                setChargedDrafts(prev => {
                                  const { [actualIdx]: _, ...rest } = prev;
                                  return rest;
                                });
                              }}
                              onFocus={(e) => e.target.select()}
                            />
                          );
                        })() : (
                          <span className={`font-medium ${premiumBasis === PREMIUM_BASIS.FLAT ? 'text-blue-700' : 'text-green-700'}`}>
                            {formatCurrency(actualPremium)}
                          </span>
                        )}
                      </td>
                    </>
                  )}

                  {!hasShortTermLayers && (
                    <td className={`px-4 text-right ${isEditing ? 'py-1.5' : 'py-3'}`}>
                      {isEditing ? (
                        <input
                          ref={(el) => { premiumInputRefs.current[displayIdx] = el; }}
                          type="text"
                          inputMode="numeric"
                          className="w-24 text-sm font-medium text-green-700 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none text-right"
                          value={actualPremium ? formatNumberWithCommas(actualPremium) : ''}
                          placeholder="—"
                          onChange={(e) => {
                            const newLayers = [...layers];
                            const parsed = parseFormattedNumber(e.target.value);
                            const newCharged = parsed ? Number(parsed) : null;
                            // When editing in simple mode, update both annual and actual to keep them in sync
                            newLayers[actualIdx] = {
                              ...newLayers[actualIdx],
                              annual_premium: newCharged,
                              actual_premium: newCharged,
                              premium_basis: PREMIUM_BASIS.ANNUAL,
                            };
                            setLayers(newLayers);
                          }}
                          onKeyDown={(e) => handleArrowNav(e, displayIdx, premiumInputRefs)}
                          onFocus={(e) => e.target.select()}
                        />
                      ) : (
                        <span className="font-medium text-green-700">
                          {formatCurrency(actualPremium)}
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
            );
          })}
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
