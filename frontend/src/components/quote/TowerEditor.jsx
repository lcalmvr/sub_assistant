import { useState, useEffect, useRef } from 'react';
import {
  formatCompact,
  formatCurrency,
  formatNumberWithCommas,
  parseFormattedNumber,
  calculateAttachment,
  recalculateAttachments,
  generateOptionName,
} from '../../utils/quoteUtils';

export default function TowerEditor({ quote, onSave, isPending, embedded = false, setEditControls }) {
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
