import { useState, useEffect, useRef } from 'react';
import { formatCompact, formatNumberWithCommas } from '../../utils/quoteUtils';

/**
 * ExcessCoverageCompact - Compact excess coverage editor for embedded use
 *
 * Features:
 * - Document scanning to extract coverages from PDFs/DOCX
 * - Inline editing with treatment selection (Follow/Different/Exclude)
 * - Grid navigation with arrow keys
 * - Proportional limit/attachment calculations based on tower
 * - Drag-and-drop file upload
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const LIMIT_OPTIONS = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000];

export default function ExcessCoverageCompact({ sublimits, towerJson, onSave, setEditControls, embedded = false, structureId, saveRef }) {
  const [isEditing, setIsEditing] = useState(embedded);  // Start in edit mode if embedded
  // Initialize draft immediately when embedded (not waiting for click)
  // Store raw number strings for _limitInput/_attachInput (not formatted)
  const [draft, setDraft] = useState(() => embedded ? sublimits.map(cov => ({
    ...cov,
    _limitInput: cov.our_limit ? String(cov.our_limit) : '',
    _attachInput: cov.our_attachment ? String(cov.our_attachment) : '',
  })) : []);
  const [isAdding, setIsAdding] = useState(false);
  const [newCoverage, setNewCoverage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Refs for handlers to avoid stale closures in setEditControls buttons
  const handleSaveRef = useRef(null);
  const handleCancelRef = useRef(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Sync when structure changes (like TowerEditor's quote.id sync)
  useEffect(() => {
    const newDraft = sublimits.map(cov => ({
      ...cov,
      _limitInput: cov.our_limit ? String(cov.our_limit) : '',
      _attachInput: cov.our_attachment ? String(cov.our_attachment) : '',
    }));
    setDraft(newDraft);
    setIsEditing(embedded);  // Keep edit mode if embedded, otherwise reset
  }, [structureId, embedded]);

  // Build tower context for proportional calculations (handles quota share)
  const buildTowerContext = () => {
    if (!towerJson?.length) {
      return { ourLimit: 0, ourAttachment: 0, primaryLimit: 0, cmaiQs: null, layersBelowCount: 0 };
    }

    let cmaiIdx = null;
    let cmaiLayer = null;
    for (let i = 0; i < towerJson.length; i++) {
      if (towerJson[i].carrier?.toUpperCase().includes('CMAI')) {
        cmaiIdx = i;
        cmaiLayer = towerJson[i];
        break;
      }
    }

    const primaryLayer = towerJson[0];
    const primaryLimit = primaryLayer?.quota_share || primaryLayer?.limit || 0;
    const ourLimit = cmaiLayer?.limit || primaryLimit;
    const cmaiQs = cmaiLayer?.quota_share || null;

    // Calculate layers below count (for QS, find start of QS group)
    let layersBelowCount = cmaiIdx !== null ? cmaiIdx : towerJson.length;
    if (cmaiQs && cmaiIdx !== null) {
      let effectiveIdx = cmaiIdx;
      while (effectiveIdx > 0 && towerJson[effectiveIdx - 1]?.quota_share === cmaiQs) {
        effectiveIdx--;
      }
      layersBelowCount = effectiveIdx;
    }

    // Calculate attachment (handles QS layers)
    let ourAttachment = 0;
    let i = 0;
    while (i < layersBelowCount) {
      const layer = towerJson[i];
      const layerQs = layer?.quota_share;
      if (layerQs) {
        ourAttachment += layerQs;
        while (i < layersBelowCount && towerJson[i]?.quota_share === layerQs) i++;
      } else {
        ourAttachment += layer?.limit || 0;
        i++;
      }
    }

    return { ourLimit, ourAttachment, primaryLimit, cmaiQs, layersBelowCount, towerLayers: towerJson };
  };

  const ctx = buildTowerContext();

  const calcProportional = (primarySublimit) => {
    if (!primarySublimit || !ctx.primaryLimit) return { limit: 0, attachment: ctx.ourAttachment };
    const ratio = primarySublimit / ctx.primaryLimit;
    const ourLimit = Math.round(ratio * ctx.ourLimit);

    // Calculate attachment with QS handling
    let ourAttach = 0;
    let i = 0;
    while (i < ctx.layersBelowCount) {
      const layer = ctx.towerLayers?.[i];
      const layerQs = layer?.quota_share;
      if (layerQs) {
        ourAttach += Math.round(layerQs * ratio);
        while (i < ctx.layersBelowCount && ctx.towerLayers[i]?.quota_share === layerQs) i++;
      } else {
        ourAttach += Math.round((layer?.limit || 0) * ratio);
        i++;
      }
    }

    return { limit: ourLimit, attachment: ourAttach };
  };

  const parseValue = (raw) => {
    if (!raw && raw !== 0) return null;
    if (typeof raw === 'number') return raw;
    const str = String(raw).toUpperCase().trim();
    if (!str) return null;
    if (str.includes('M')) return parseFloat(str) * 1000000;
    if (str.includes('K')) return parseFloat(str) * 1000;
    // Remove commas and other non-numeric chars
    const num = parseFloat(str.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? null : num;
  };

  // Parse number from comma-formatted string
  const parseNumberInput = (str) => {
    const cleaned = String(str).replace(/[^0-9]/g, '');
    return cleaned === '' ? '' : cleaned;
  };

  const getEffectiveValues = (cov) => {
    if (cov.treatment === 'exclude' || cov.treatment === 'no_coverage') return { limit: null, attachment: null };
    const prop = calcProportional(cov.primary_limit);
    if (cov.treatment === 'different') {
      return { limit: cov.our_limit ?? prop.limit, attachment: cov.our_attachment ?? prop.attachment };
    }
    return { limit: prop.limit, attachment: prop.attachment };
  };

  const getTreatmentStyle = (treatment) => {
    if (treatment === 'exclude' || treatment === 'no_coverage') return 'text-red-500 bg-red-50 border-red-200';
    if (treatment === 'different') return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getTreatmentLabel = (treatment) => {
    if (treatment === 'exclude' || treatment === 'no_coverage') return 'Exclude';
    if (treatment === 'different') return 'Different';
    return 'Follow';
  };

  // Document scanning handlers
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleScanFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && ['pdf', 'docx', 'doc'].includes(file.name.split('.').pop()?.toLowerCase())) {
      handleScanFile(file);
    }
  };

  const handleScanFile = async (file) => {
    setIsScanning(true);
    setScanError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_URL}/api/extract-coverages`, { method: 'POST', body: formData });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Extraction failed');
      }
      const data = await response.json();
      setExtractedPreview(data);
    } catch (err) {
      setScanError(err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleApplyExtracted = () => {
    if (!extractedPreview?.sublimits) return;
    const newSublimits = extractedPreview.sublimits.map(sub => ({
      coverage: sub.coverage,
      primary_limit: sub.primary_limit,
      treatment: 'follow_form',
      our_limit: null,
      our_attachment: null,
      source: 'extracted',
    }));
    onSave(newSublimits);
    setExtractedPreview(null);
  };

  // Enter edit mode
  const handleEdit = () => {
    setDraft(sublimits.map(cov => ({
      ...cov,
      _limitInput: cov.our_limit ? String(cov.our_limit) : '',
      _attachInput: cov.our_attachment ? String(cov.our_attachment) : '',
    })));
    setIsEditing(true);
  };

  // Cancel - exit edit mode
  const handleCancel = () => {
    setIsEditing(false);
    setDraft([]);
    setEditControls?.(null);
  };
  handleCancelRef.current = handleCancel;

  // Save all changes
  const handleSave = () => {
    const updated = draftRef.current.map(cov => {
      const prop = calcProportional(cov.primary_limit);
      const limitVal = parseValue(cov._limitInput);
      const attachVal = parseValue(cov._attachInput);
      const isExcluded = cov.treatment === 'exclude' || cov.treatment === 'no_coverage';

      // Derive treatment from values - if values match proportional, it's follow_form
      let treatment;
      if (isExcluded) {
        treatment = 'exclude';
      } else if (limitVal !== null || attachVal !== null) {
        // Has custom values - check if they differ from proportional
        const limitDiffers = limitVal !== null && limitVal !== prop.limit;
        const attachDiffers = attachVal !== null && attachVal !== prop.attachment;
        treatment = (limitDiffers || attachDiffers) ? 'different' : 'follow_form';
      } else {
        treatment = 'follow_form';
      }

      const parsed = {
        ...cov,
        treatment,
        our_limit: treatment === 'different' ? limitVal : null,
        our_attachment: treatment === 'different' ? attachVal : null,
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
  handleSaveRef.current = handleSave;

  // Expose save function to parent via saveRef
  if (saveRef) saveRef.current = handleSave;

  // Update edit controls when editing state changes (for embedded mode - matches TowerEditor)
  useEffect(() => {
    if (embedded && isEditing) {
      setEditControls?.(
        <>
          <button onClick={() => handleCancelRef.current?.()} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
          <button onClick={() => handleSaveRef.current?.()} className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">Save</button>
        </>
      );
    } else if (embedded) {
      setEditControls?.(null);
    }
    return () => embedded && setEditControls?.(null);
  }, [isEditing, embedded]);

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

  // NOTE: Click outside is handled by the parent (SummaryTabContent) which calls saveRef
  // This prevents race conditions where parent closes the card before child can save

  // Update draft field - use functional update to avoid stale closure issues
  const updateDraft = (idx, field, value) => {
    setDraft(prev => prev.map((cov, i) => i === idx ? { ...cov, [field]: value } : cov));
  };

  // Handle treatment dropdown change - sets values based on selection
  const handleTreatmentChange = (idx, newTreatment, prop) => {
    setDraft(prev => prev.map((cov, i) => {
      if (i !== idx) return cov;
      if (newTreatment === 'follow_form') {
        // Clear custom values - will use proportional
        return { ...cov, treatment: 'follow_form', _limitInput: '', _attachInput: '' };
      } else if (newTreatment === 'exclude') {
        return { ...cov, treatment: 'exclude', _limitInput: '', _attachInput: '' };
      } else {
        // 'different' - if no values yet, start with proportional as editable values
        return {
          ...cov,
          treatment: 'different',
          _limitInput: cov._limitInput || String(prop.limit || 0),
          _attachInput: cov._attachInput || String(prop.attachment || 0),
        };
      }
    }));
  };

  // Derive treatment from current values
  const getDerivedTreatment = (cov, prop) => {
    if (cov.treatment === 'exclude' || cov.treatment === 'no_coverage') return 'exclude';
    // If has custom input values that differ from proportional, it's different
    if (cov._limitInput || cov._attachInput) {
      const limitVal = cov._limitInput ? Number(cov._limitInput) : null;
      const attachVal = cov._attachInput ? Number(cov._attachInput) : null;
      if ((limitVal !== null && limitVal !== prop.limit) ||
          (attachVal !== null && attachVal !== prop.attachment)) {
        return 'different';
      }
    }
    return 'follow_form';
  };

  // Delete from draft
  const deleteDraft = (idx) => {
    setDraft(prev => prev.filter((_, i) => i !== idx));
  };

  // Add new coverage (enters edit mode if not already)
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
      setDraft(prev => [...prev, newCov]);
    } else {
      setDraft([...sublimits.map(cov => ({
        ...cov,
        _limitInput: cov.our_limit ? String(cov.our_limit) : '',
        _attachInput: cov.our_attachment ? String(cov.our_attachment) : '',
      })), newCov]);
      setIsEditing(true);
    }
    setNewCoverage('');
    setIsAdding(false);
  };

  // Bulk set all treatments
  const handleSetAll = (treatment) => {
    setDraft(prev => prev.map(cov => ({
      ...cov,
      treatment,
      // Clear custom inputs when switching away from different
      _limitInput: treatment === 'different' ? cov._limitInput : '',
      _attachInput: treatment === 'different' ? cov._attachInput : '',
    })));
  };

  const data = isEditing ? draft : sublimits;

  // Empty state with scan prompt
  if (data.length === 0 && !isAdding && !extractedPreview) {
    return (
      <div
        ref={containerRef}
        className={`px-4 py-6 ${isDragging ? 'bg-purple-50 ring-2 ring-purple-300 ring-inset' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging ? (
          <div className="text-center py-4">
            <p className="text-purple-600 font-medium">Drop PDF or DOCX to scan coverages</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-3">No underlying coverages defined</p>
            <p className="text-xs text-gray-400 mb-4">Scan a primary quote document to extract coverages, or add manually</p>
            {scanError && (
              <p className="text-sm text-red-500 mb-3">{scanError}</p>
            )}
            <div className="flex justify-center gap-2">
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc" onChange={handleFileSelect} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {isScanning ? 'Scanning...' : 'Scan Document'}
              </button>
              <button
                onClick={() => setIsAdding(true)}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium px-3 py-1.5 border border-purple-200 rounded hover:border-purple-300"
              >
                + Add Manually
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`px-4 py-2 relative ${isDragging ? 'bg-purple-50 ring-2 ring-purple-300 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-purple-50 bg-opacity-90 flex items-center justify-center z-10">
          <p className="text-purple-600 font-medium">Drop to scan coverages</p>
        </div>
      )}

      {/* Tower context display */}
      {ctx.primaryLimit > 0 && (
        <div className="text-xs text-gray-500 mb-3 flex items-center gap-2">
          <span>Primary: {formatCompact(ctx.primaryLimit)}</span>
          <span className="text-gray-300">·</span>
          <span>Ours: {formatCompact(ctx.ourLimit)}</span>
          {ctx.cmaiQs && <span className="text-purple-600">po {formatCompact(ctx.cmaiQs)}</span>}
          <span>xs {formatCompact(ctx.ourAttachment)}</span>
        </div>
      )}

      {/* Extraction preview */}
      {extractedPreview && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-green-800 text-sm">
              Found {extractedPreview.sublimits?.length || 0} coverages
              {extractedPreview.carrier_name && ` from ${extractedPreview.carrier_name}`}
            </span>
            <div className="flex gap-2">
              <button onClick={handleApplyExtracted} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Apply</button>
              <button onClick={() => setExtractedPreview(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
          </div>
          <div className="text-sm text-green-700 max-h-24 overflow-y-auto space-y-0.5">
            {extractedPreview.sublimits?.map((sub, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="truncate mr-2">{sub.coverage}</span>
                <span className="font-medium whitespace-nowrap">{formatCompact(sub.primary_limit)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scan error */}
      {scanError && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          {scanError}
          <button onClick={() => setScanError(null)} className="ml-2 text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* Header with controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc" onChange={handleFileSelect} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium border border-purple-200 px-2 py-1 rounded hover:border-purple-300"
          >
            {isScanning ? 'Scanning...' : 'Scan Doc'}
          </button>
          {isEditing && data.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500 border-l border-gray-200 pl-3">
              <span>Set all:</span>
              <button onClick={() => handleSetAll('follow_form')} className="text-green-600 hover:underline">Follow</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => handleSetAll('different')} className="text-amber-600 hover:underline">Different</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => handleSetAll('exclude')} className="text-red-500 hover:underline">Exclude</button>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="text-sm text-purple-600 hover:text-purple-700 font-medium"
        >
          + Add
        </button>
      </div>

      {/* Column headers - only in edit mode */}
      {isEditing && data.length > 0 && (
        <div className="flex items-center gap-2 py-1 text-xs text-gray-400 border-b border-gray-200 mb-1">
          <div className="flex-1 min-w-0">Coverage</div>
          <div className="w-20 text-center">Primary</div>
          <div className="w-[72px] text-center">Treatment</div>
          <div className="w-52 text-right">Our Limit xs Attach</div>
          <div className="w-4" />
        </div>
      )}

      {/* Coverage list - click to edit */}
      <div className={`space-y-0 ${!isEditing && data.length > 0 ? 'cursor-pointer' : ''}`} onClick={!isEditing && data.length > 0 ? handleEdit : undefined}>
        {data.map((cov, idx) => {
          const prop = calcProportional(cov.primary_limit);
          const derivedTreatment = isEditing ? getDerivedTreatment(cov, prop) : (cov.treatment || 'follow_form');
          const isExcluded = derivedTreatment === 'exclude';
          const isDifferent = derivedTreatment === 'different';
          const isAI = cov.source === 'extracted' || cov.source === 'ai';
          const eff = getEffectiveValues(cov);

          // For inputs: show actual value, not placeholder
          // If following (no custom input), show proportional; if different, show the custom value
          const displayLimit = cov._limitInput || String(prop.limit || 0);
          const displayAttach = cov._attachInput || String(prop.attachment || 0);

          return (
            <div
              key={idx}
              data-row={idx}
              className={`flex items-center gap-2 py-2 border-b border-gray-100 ${isExcluded ? 'opacity-50' : ''} ${!isEditing ? 'hover:bg-gray-50' : ''}`}
            >
              {/* AI badge */}
              {isAI && (
                <svg className="w-3 h-3 text-purple-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" title="AI extracted">
                  <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z" />
                </svg>
              )}

              {/* Coverage name */}
              {isEditing ? (
                <input
                  type="text"
                  value={cov.coverage || ''}
                  onChange={(e) => updateDraft(idx, 'coverage', e.target.value)}
                  className="flex-1 min-w-0 text-sm text-gray-700 px-1.5 py-1 border border-gray-200 rounded focus:border-purple-400 focus:outline-none"
                  placeholder="Coverage name"
                />
              ) : (
                <div className="flex-1 min-w-0 text-sm text-gray-700 truncate">{cov.coverage || '—'}</div>
              )}

              {/* Primary limit */}
              {isEditing ? (
                <select
                  value={cov.primary_limit || 1000000}
                  onChange={(e) => updateDraft(idx, 'primary_limit', Number(e.target.value))}
                  className="w-20 text-xs text-gray-500 py-1 px-1 border border-gray-200 rounded focus:border-purple-400 focus:outline-none"
                >
                  {LIMIT_OPTIONS.map(v => (
                    <option key={v} value={v}>{formatCompact(v)}</option>
                  ))}
                </select>
              ) : (
                <div className="w-16 text-right text-xs text-gray-400">{formatCompact(cov.primary_limit)}</div>
              )}

              {/* Treatment - derived from values, dropdown sets values */}
              {isEditing ? (
                <select
                  ref={el => selectRefs.current[idx] = el}
                  value={derivedTreatment}
                  onChange={(e) => handleTreatmentChange(idx, e.target.value, prop)}
                  onKeyDown={(e) => handleArrowNav(e, idx, selectRefs)}
                  className={`w-[72px] text-xs py-1 px-1.5 rounded border cursor-pointer flex-shrink-0 ${getTreatmentStyle(derivedTreatment)}`}
                >
                  <option value="follow_form">Follow</option>
                  <option value="different">Different</option>
                  <option value="exclude">Exclude</option>
                </select>
              ) : (
                <span className={`w-[72px] text-xs py-1 px-1.5 rounded border text-center flex-shrink-0 ${getTreatmentStyle(derivedTreatment)}`}>
                  {getTreatmentLabel(derivedTreatment)}
                </span>
              )}

              {/* Our limit/attachment */}
              <div className="w-52 text-right text-sm flex-shrink-0">
                {isExcluded ? (
                  <span className="text-gray-300">—</span>
                ) : isEditing ? (
                  <div className="flex items-center justify-end gap-1">
                    <input
                      ref={el => limitRefs.current[idx] = el}
                      type="text"
                      value={formatNumberWithCommas(displayLimit)}
                      onChange={(e) => {
                        const rawValue = parseNumberInput(e.target.value);
                        updateDraft(idx, '_limitInput', rawValue);
                      }}
                      onKeyDown={(e) => handleArrowNav(e, idx, limitRefs)}
                      onFocus={(e) => e.target.select()}
                      className={`w-24 text-right text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-purple-400 focus:outline-none font-medium ${isDifferent ? 'text-amber-600' : 'text-green-600'}`}
                    />
                    <span className="text-gray-400 text-xs">xs</span>
                    <input
                      ref={el => attachRefs.current[idx] = el}
                      type="text"
                      value={formatNumberWithCommas(displayAttach)}
                      onChange={(e) => {
                        const rawValue = parseNumberInput(e.target.value);
                        updateDraft(idx, '_attachInput', rawValue);
                      }}
                      onKeyDown={(e) => handleArrowNav(e, idx, attachRefs)}
                      onFocus={(e) => e.target.select()}
                      className={`w-24 text-right text-xs px-1.5 py-1 border border-gray-200 rounded focus:border-purple-400 focus:outline-none font-medium ${isDifferent ? 'text-amber-600' : 'text-green-600'}`}
                    />
                  </div>
                ) : (
                  <span className={`font-medium ${isDifferent ? 'text-amber-600' : 'text-green-600'}`}>
                    {formatNumberWithCommas(eff.limit)} xs {formatNumberWithCommas(eff.attachment)}
                  </span>
                )}
              </div>

              {/* Delete - only in edit mode */}
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
