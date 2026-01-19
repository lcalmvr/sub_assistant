import { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';
import { updateQuoteOption } from '../api/client';

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
  if (!value && value !== 0) return '—';
  if (value >= 1_000_000) return `$${value / 1_000_000}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

// Get limit from tower_json
function getTowerLimit(quote) {
  if (!quote?.tower_json || !quote.tower_json.length) return null;
  const cmaiLayer = quote.tower_json.find(l => l.carrier === 'CMAI') || quote.tower_json[0];
  return cmaiLayer?.limit;
}

// Detect position from tower structure - if CMAI has attachment > 0, it's excess
function getQuotePosition(quote) {
  const tower = quote?.tower_json || [];
  if (tower.length === 0) {
    return quote?.position === 'excess' ? 'excess' : 'primary';
  }
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  if (cmaiIdx < 0) {
    return quote?.position === 'excess' ? 'excess' : 'primary';
  }
  // Calculate attachment - sum of limits below CMAI layer
  let attachment = 0;
  for (let i = 0; i < cmaiIdx; i++) {
    attachment += tower[i]?.limit || 0;
  }
  return attachment > 0 ? 'excess' : 'primary';
}

// Coverage definitions matching Streamlit coverage_defaults.yml
export const AGGREGATE_COVERAGES = [
  { id: 'tech_eo', label: 'Tech E&O', cyber: 0, cyber_tech: 'aggregate', tech: 'aggregate' },
  { id: 'network_security_privacy', label: 'Network Security & Privacy Liability', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'privacy_regulatory', label: 'Privacy Regulatory Proceedings', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'pci', label: 'Payment Card Industry (PCI)', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'media_liability', label: 'Media Liability', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'business_interruption', label: 'Business Interruption', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'system_failure', label: 'System Failure', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'dependent_bi', label: 'Dependent Business Interruption', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'cyber_extortion', label: 'Cyber Extortion', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'data_recovery', label: 'Data Recovery', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
  { id: 'reputational_harm', label: 'Reputational Harm', cyber: 'aggregate', cyber_tech: 'aggregate', tech: 0 },
];

export const SUBLIMIT_COVERAGES = [
  { id: 'dependent_system_failure', label: 'Dependent System Failure', default: 1000000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'social_engineering', label: 'Social Engineering', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'invoice_manipulation', label: 'Invoice Manipulation', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'funds_transfer_fraud', label: 'Funds Transfer Fraud', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'telecom_fraud', label: 'Telecommunications Fraud', default: 250000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
  { id: 'cryptojacking', label: 'Cryptojacking', default: 500000, cyber: 'sublimit', cyber_tech: 'sublimit', tech: 0 },
];

// Standard limit options
export const AGGREGATE_LIMIT_OPTIONS = [1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000];
export const RETENTION_OPTIONS = [25_000, 50_000, 100_000, 150_000, 250_000, 500_000];

/**
 * CoverageEditor component for editing coverage schedules
 * Tower-style table with click-to-edit and arrow key navigation
 */
export default function CoverageEditor({
  coverages: propCoverages,
  aggregateLimit,
  onSave,
  mode = 'quote',
  newAggregateLimit,
  showBatchEdit: showBatchEditProp = true,
  allQuotes,
  submissionId,
  readOnly = false,
  quote,
  originalCoverages: propOriginalCoverages,
  embedded = false,
  setEditControls,
}) {
  // Detect if this quote is bound - bound quotes should be fully read-only
  const isBound = quote?.is_bound === true;
  const effectiveReadOnly = readOnly || isBound;

  const [activeTab, setActiveTab] = useState('variable');
  const [isEditing, setIsEditing] = useState(embedded && !effectiveReadOnly); // Don't start in edit mode if read-only
  const [draft, setDraft] = useState({});
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchCoverages, setBatchCoverages] = useState([{ id: '', value: 0 }]);
  const [selectedQuotes, setSelectedQuotes] = useState({});
  const [activeCoveragePopover, setActiveCoveragePopover] = useState(null);
  const [applyError, setApplyError] = useState(null);
  const tableRef = useRef(null);
  const treatmentRefs = useRef({});
  const limitInputRefs = useRef({});

  // Keep a ref to draft for event handlers that need latest value
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const queryClient = useQueryClient();

  // Support both direct coverages prop and legacy quote prop
  const coverages = propCoverages || quote?.coverages || {
    aggregate_coverages: {},
    sublimit_coverages: {},
  };

  // Original coverages for endorsement comparison
  const originalCoverages = propOriginalCoverages || {
    aggregate_coverages: {},
    sublimit_coverages: {},
  };

  // For endorsement mode, determine effective aggregate limit
  const effectiveAggregateLimit = newAggregateLimit || aggregateLimit;
  const isAggregateChanging = mode === 'endorsement' && newAggregateLimit && newAggregateLimit !== aggregateLimit;

  // Primary quotes for batch selection (filter out excess)
  const primaryQuotes = (allQuotes || []).filter(q => q.position !== 'excess');

  // All coverage options for batch edit dropdown
  const allCoverageOptions = [
    ...SUBLIMIT_COVERAGES.map(c => ({ ...c, type: 'sublimit' })),
    ...AGGREGATE_COVERAGES.map(c => ({ ...c, type: 'aggregate' })),
  ];

  // Sublimit options for batch edit
  const sublimitOptions = [
    { label: '$100K', value: 100000 },
    { label: '$250K', value: 250000 },
    { label: '$500K', value: 500000 },
    { label: '$1M', value: 1000000 },
    { label: '50% Agg', value: Math.floor(effectiveAggregateLimit / 2) },
    { label: 'Aggregate', value: effectiveAggregateLimit },
    { label: 'None', value: 0 },
    { label: 'Custom...', value: 'custom' },
  ];

  // Aggregate options for batch edit
  const aggregateOptions = [
    { label: 'Full Limits', value: 'full' },
    { label: '$1M', value: 1000000 },
    { label: 'No Coverage', value: 0 },
    { label: 'Custom...', value: 'custom' },
  ];

  // Initialize selected quotes when batch edit opens
  useEffect(() => {
    if (showBatchEdit && primaryQuotes.length > 0) {
      const initial = {};
      primaryQuotes.forEach(q => { initial[q.id] = true; });
      setSelectedQuotes(initial);
    }
  }, [showBatchEdit]);

  // Get tower limit for a quote
  const getTowerLimit = (q) => {
    const tower = q?.tower_json || [];
    const cmaiLayer = tower.find(l => l.carrier?.toUpperCase().includes('CMAI')) || tower[0];
    return cmaiLayer?.limit || 1000000;
  };

  // Batch edit mutation
  const batchMutation = useMutation({
    mutationFn: async ({ coverageUpdates, quoteIds, quotesData }) => {
      const results = [];
      for (const qId of quoteIds) {
        const targetQuote = quotesData.find(q => q.id === qId);
        if (!targetQuote) continue;

        const targetLimit = getTowerLimit(targetQuote) || 1000000;
        const existingCoverages = targetQuote.coverages || {};

        const updatedCoverages = {
          ...existingCoverages,
          aggregate_coverages: { ...(existingCoverages.aggregate_coverages || {}) },
          sublimit_coverages: { ...(existingCoverages.sublimit_coverages || {}) },
        };

        coverageUpdates.forEach(({ id, value, type }) => {
          const actualValue = value === 'full' ? targetLimit : value;
          if (type === 'sublimit') {
            updatedCoverages.sublimit_coverages[id] = actualValue;
          } else {
            updatedCoverages.aggregate_coverages[id] = actualValue;
          }
        });

        const result = await updateQuoteOption(qId, { coverages: updatedCoverages });
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      setShowBatchEdit(false);
      setBatchCoverages([{ id: '', value: 0 }]);
    },
  });

  const handleBatchApply = () => {
    const selectedIds = Object.entries(selectedQuotes)
      .filter(([_, selected]) => selected)
      .map(([id]) => id);

    const coverageUpdates = batchCoverages
      .filter(bc => bc.id)
      .map(bc => {
        const covDef = allCoverageOptions.find(c => c.id === bc.id);
        return { id: bc.id, value: bc.value, type: covDef?.type || 'sublimit' };
      });

    if (selectedIds.length > 0 && coverageUpdates.length > 0) {
      batchMutation.mutate({
        coverageUpdates,
        quoteIds: selectedIds,
        quotesData: allQuotes || primaryQuotes
      });
    }
  };

  // Reset editing state when coverages change externally
  useEffect(() => {
    setIsEditing(embedded && !effectiveReadOnly); // Respect embedded mode but not if read-only
    setDraft({});
    // Note: Don't clear refs here - they're populated by render
  }, [quote?.id, embedded, effectiveReadOnly]);

  // Initialize draft when starting in embedded edit mode
  useEffect(() => {
    if (embedded && isEditing && Object.keys(draft).length === 0) {
      const initialDraft = {};
      const currentCoverages = activeTab === 'variable' ? SUBLIMIT_COVERAGES : AGGREGATE_COVERAGES;
      currentCoverages.forEach((cov) => {
        if (activeTab === 'variable') {
          const val = coverages.sublimit_coverages?.[cov.id];
          initialDraft[cov.id] = val !== undefined ? val : cov.default;
        } else {
          const val = coverages.aggregate_coverages?.[cov.id];
          initialDraft[cov.id] = val !== undefined ? val : effectiveAggregateLimit;
        }
      });
      setDraft(initialDraft);
    }
  }, [embedded, isEditing, activeTab, coverages, effectiveAggregateLimit]);

  // Track if we've done initial focus for this edit session
  const hasInitialFocusRef = useRef(false);

  // Reset focus tracking when exiting edit mode
  useEffect(() => {
    if (!isEditing) {
      hasInitialFocusRef.current = false;
    }
  }, [isEditing]);

  // Auto-focus first input when entering edit mode (only once per session)
  useEffect(() => {
    if (!isEditing || hasInitialFocusRef.current) return;
    hasInitialFocusRef.current = true;
    const timer = setTimeout(() => {
      if (limitInputRefs.current[0]) {
        limitInputRefs.current[0].focus();
        limitInputRefs.current[0].select(); // Select text like TowerEditor
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isEditing]);

  // Column refs in left-to-right order for horizontal navigation (like TowerEditor)
  const columnRefs = [treatmentRefs, limitInputRefs];

  // Initialize draft from coverages when entering edit mode
  const enterEditMode = (focusIdx = 0) => {
    const initialDraft = {};
    const currentCoverages = activeTab === 'variable' ? SUBLIMIT_COVERAGES : AGGREGATE_COVERAGES;
    currentCoverages.forEach((cov, idx) => {
      if (activeTab === 'variable') {
        const val = coverages.sublimit_coverages?.[cov.id];
        initialDraft[cov.id] = val !== undefined ? val : cov.default;
      } else {
        const val = coverages.aggregate_coverages?.[cov.id];
        initialDraft[cov.id] = val !== undefined ? val : effectiveAggregateLimit;
      }
    });
    setDraft(initialDraft);
    setIsEditing(true);
    setTimeout(() => {
      if (limitInputRefs.current[focusIdx]) {
        limitInputRefs.current[focusIdx].focus();
        limitInputRefs.current[focusIdx].select();
      }
    }, 0);
  };

  // Arrow key navigation - supports vertical (up/down), horizontal (left/right), and Tab wrapping
  // Matches TowerEditor pattern with columnRefs array
  const handleArrowNav = (e, rowIdx, colIdx) => {
    const currentCoverages = activeTab === 'variable' ? SUBLIMIT_COVERAGES : AGGREGATE_COVERAGES;
    const maxRowIdx = currentCoverages.length - 1;
    const maxColIdx = columnRefs.length - 1;

    // Helper to focus a cell and select if it's an input
    const focusCell = (row, col) => {
      const ref = columnRefs[col]?.current?.[row];
      if (ref) {
        ref.focus();
        if (ref.select) ref.select();
      }
    };

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx > 0) {
        focusCell(rowIdx - 1, colIdx);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx < maxRowIdx) {
        focusCell(rowIdx + 1, colIdx);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (colIdx > 0) {
        focusCell(rowIdx, colIdx - 1);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (colIdx < maxColIdx) {
        focusCell(rowIdx, colIdx + 1);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: move left, wrap to prev row's last column
        if (colIdx > 0) {
          focusCell(rowIdx, colIdx - 1);
        } else if (rowIdx > 0) {
          focusCell(rowIdx - 1, maxColIdx);
        }
      } else {
        // Tab: move right, wrap to next row's first column
        if (colIdx < maxColIdx) {
          focusCell(rowIdx, colIdx + 1);
        } else if (rowIdx < maxRowIdx) {
          focusCell(rowIdx + 1, 0);
        }
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      // Enter: Move to next row (consistent with Subjectivity screen)
      e.preventDefault();
      if (rowIdx < maxRowIdx) {
        focusCell(rowIdx + 1, colIdx);
      }
      // If on last row, Enter does nothing (stay in place) - Escape to exit
    }
    // Note: Escape is handled by the global keydown listener (saves and exits)
  };

  // Click outside to save
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e) => {
      // Don't save if clicking inside a popover (portaled outside table)
      if (e.target.closest('[data-radix-popover-content]')) {
        return;
      }
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        handleSave();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Escape: Save all changes and exit (consistent with Subjectivity screen)
        e.preventDefault();
        handleSave();
      }
      // Note: Enter is handled in handleArrowNav to move to next row
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing, draft, activeTab]);

  const handleSave = () => {
    // Use draftRef to ensure we always get the latest draft value
    const currentDraft = draftRef.current;
    const updated = { ...coverages };
    if (activeTab === 'variable') {
      updated.sublimit_coverages = { ...coverages.sublimit_coverages, ...currentDraft };
    } else {
      updated.aggregate_coverages = { ...coverages.aggregate_coverages, ...currentDraft };
    }
    onSave(updated);
    setIsEditing(false);
    setDraft({});
    setEditControls?.(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraft({});
    setEditControls?.(null);
  };

  // Update edit controls when editing state changes (for embedded mode)
  useEffect(() => {
    if (embedded && isEditing) {
      setEditControls?.(
        <>
          <button onClick={handleCancel} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
          <button onClick={handleSave} className="text-sm bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">Save</button>
        </>
      );
    } else if (embedded) {
      setEditControls?.(null);
    }
    return () => embedded && setEditControls?.(null);
  }, [isEditing, embedded]);

  const getSublimitValue = (covId, defaultVal) => {
    if (isEditing && draft[covId] !== undefined) return draft[covId];
    const val = coverages.sublimit_coverages?.[covId];
    if (val !== undefined) return val;
    return defaultVal;
  };

  const getAggregateValue = (covId) => {
    if (isEditing && draft[covId] !== undefined) return draft[covId];
    const val = coverages.aggregate_coverages?.[covId];
    if (val !== undefined) return val;
    return effectiveAggregateLimit;
  };

  // Get treatment label
  const getTreatment = (covId, type) => {
    if (type === 'variable') {
      const cov = SUBLIMIT_COVERAGES.find(c => c.id === covId);
      const value = getSublimitValue(covId, cov?.default);
      if (value === 0) return 'Excluded';
      if (value === cov?.default) return 'Default';
      return 'Custom';
    } else {
      const value = getAggregateValue(covId);
      if (value === 0) return 'Excluded';
      if (value === effectiveAggregateLimit) return 'Full';
      return 'Custom';
    }
  };

  const getTreatmentStyle = (treatment) => {
    switch (treatment) {
      case 'Default':
      case 'Full':
        return 'border-green-300 bg-green-50 text-green-700';
      case 'Excluded':
        return 'border-gray-300 bg-gray-50 text-gray-500';
      default:
        return 'border-purple-300 bg-purple-50 text-purple-700';
    }
  };

  // Get current quote's position (derive from tower structure)
  const currentQuoteId = quote?.id;
  const currentPosition = getQuotePosition(quote);

  // Get coverage values across same-position quotes only (primary <-> primary)
  // Excess quotes use different data structure (sublimits), so comparison is meaningless
  const getCoverageAcrossQuotes = useMemo(() => {
    if (!allQuotes || allQuotes.length <= 1) return () => ({ quotes: [], boundQuotes: [], allSame: true });

    return (covId, type) => {
      // Get all OTHER quotes with SAME POSITION (not current, only primary since this is CoverageEditor)
      // Excess quotes use structure.sublimits, not structure.coverages - incompatible data models
      const otherQuotes = allQuotes.filter(q => {
        if (q.id === currentQuoteId) return false;
        const qPosition = getQuotePosition(q);
        return qPosition === currentPosition; // Only same-position quotes
      });

      const mapQuote = (q) => {
        const qCoverages = q.coverages || {};
        let value;
        if (type === 'variable') {
          const cov = SUBLIMIT_COVERAGES.find(c => c.id === covId);
          value = qCoverages.sublimit_coverages?.[covId];
          if (value === undefined) value = cov?.default || 0;
        } else {
          value = qCoverages.aggregate_coverages?.[covId];
          // For aggregate, default to that quote's tower limit
          if (value === undefined) {
            const qLimit = getTowerLimit(q) || effectiveAggregateLimit;
            value = qLimit;
          }
        }
        return {
          id: q.id,
          name: q.quote_name || 'Unnamed',
          value,
          isBound: q.is_bound === true,
          position: getQuotePosition(q),
        };
      };

      const allResults = otherQuotes.map(mapQuote);

      // Separate bound and non-bound quotes
      const boundQuotes = allResults.filter(q => q.isBound);
      const quotes = allResults.filter(q => !q.isBound);

      // Check if all non-bound values are the same as current quote's value
      const currentValue = type === 'variable'
        ? getSublimitValue(covId, SUBLIMIT_COVERAGES.find(c => c.id === covId)?.default)
        : getAggregateValue(covId);
      const allSame = quotes.length === 0 || quotes.every(r => r.value === currentValue);

      return { quotes, boundQuotes, allSame, currentValue };
    };
  }, [allQuotes, currentQuoteId, currentPosition, effectiveAggregateLimit, coverages, draft, isEditing]);

  // Mutation to apply coverage value to other quotes
  const applyCoverageMutation = useMutation({
    mutationFn: async ({ covId, type, value, targetQuoteIds }) => {
      const results = [];
      for (const qId of targetQuoteIds) {
        // Handle both string and number IDs
        const targetQuote = allQuotes.find(q => String(q.id) === String(qId));
        if (!targetQuote) continue;

        const existingCoverages = targetQuote.coverages || {};
        const updatedCoverages = {
          ...existingCoverages,
          aggregate_coverages: { ...(existingCoverages.aggregate_coverages || {}) },
          sublimit_coverages: { ...(existingCoverages.sublimit_coverages || {}) },
        };

        if (type === 'variable') {
          updatedCoverages.sublimit_coverages[covId] = value;
        } else {
          updatedCoverages.aggregate_coverages[covId] = value;
        }

        const result = await updateQuoteOption(qId, { coverages: updatedCoverages });
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      // Don't close popover - allow user to apply to multiple quotes
      setApplyError(null);
    },
    onError: (error) => {
      // Extract user-friendly error message from response
      const detail = error.response?.data?.detail;
      if (detail?.message) {
        setApplyError(detail.message + (detail.hint ? ` ${detail.hint}` : ''));
      } else {
        setApplyError('Failed to apply coverage. Please try again.');
      }
    },
  });

  const currentCoverages = activeTab === 'variable' ? SUBLIMIT_COVERAGES : AGGREGATE_COVERAGES;

  return (
    <div ref={tableRef} className="bg-white">
      {/* Batch Edit Panel */}
      {mode === 'quote' && showBatchEdit && (
        <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-purple-800">
              Update coverages across multiple quote options
            </div>
            <div className="flex gap-2">
              <button
                className="text-xs text-purple-600 hover:text-purple-800 underline"
                onClick={() => {
                  const rows = [];
                  SUBLIMIT_COVERAGES.forEach(cov => {
                    const val = getSublimitValue(cov.id, cov.default);
                    rows.push({ id: cov.id, value: val });
                  });
                  AGGREGATE_COVERAGES.forEach(cov => {
                    const val = getAggregateValue(cov.id);
                    rows.push({ id: cov.id, value: val === effectiveAggregateLimit ? 'full' : val });
                  });
                  setBatchCoverages(rows);
                }}
              >
                Load Current Settings
              </button>
              <button
                className="text-xs text-gray-500 hover:text-gray-700 underline"
                onClick={() => setBatchCoverages([{ id: '', value: 0 }])}
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_140px_32px] gap-2 mb-1 text-xs text-gray-500 font-medium px-1">
            <div>Coverage</div>
            <div>New Value</div>
            <div></div>
          </div>

          {/* Coverage rows */}
          <div className="space-y-2 mb-4">
            {batchCoverages.map((bc, idx) => {
              const isAggregate = allCoverageOptions.find(c => c.id === bc.id)?.type === 'aggregate';
              const baseOptions = isAggregate ? aggregateOptions : sublimitOptions;
              const isBatchEditing = bc.customMode;

              const presetValues = isAggregate
                ? ['full', 1000000, 0]
                : [100000, 250000, 500000, 1000000, Math.floor(effectiveAggregateLimit / 2), effectiveAggregateLimit, 0];
              const isCustomValue = bc.value !== 'full' && typeof bc.value === 'number' && !presetValues.includes(bc.value);

              const options = [...baseOptions];
              if (isCustomValue) {
                options.splice(options.length - 1, 0, {
                  label: formatCurrency(bc.value),
                  value: bc.value
                });
              }

              return (
                <div key={idx} className="grid grid-cols-[1fr_140px_32px] gap-2 items-center">
                  <select
                    className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-purple-400"
                    value={bc.id}
                    onChange={(e) => {
                      const newBatch = [...batchCoverages];
                      const covDef = allCoverageOptions.find(c => c.id === e.target.value);
                      newBatch[idx] = {
                        id: e.target.value,
                        value: covDef?.type === 'aggregate' ? 'full' : (covDef?.default || 250000)
                      };
                      setBatchCoverages(newBatch);
                    }}
                  >
                    <option value="">Select coverage...</option>
                    <optgroup label="Variable Limits">
                      {SUBLIMIT_COVERAGES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Standard Limits">
                      {AGGREGATE_COVERAGES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </optgroup>
                  </select>
                  {isBatchEditing ? (
                    <input
                      type="text"
                      className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-purple-400"
                      placeholder="Enter amount"
                      autoFocus
                      value={bc.customInput || ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        const formatted = raw ? formatNumberWithCommas(Number(raw)) : '';
                        const newBatch = [...batchCoverages];
                        newBatch[idx] = { ...newBatch[idx], customInput: formatted };
                        setBatchCoverages(newBatch);
                      }}
                      onBlur={(e) => {
                        const parsed = parseFormattedNumber(e.target.value);
                        const newBatch = [...batchCoverages];
                        if (parsed && Number(parsed) >= 0) {
                          newBatch[idx] = { ...newBatch[idx], value: Number(parsed), customMode: false, customInput: undefined };
                        } else {
                          newBatch[idx] = { ...newBatch[idx], customMode: false, customInput: undefined };
                        }
                        setBatchCoverages(newBatch);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                        if (e.key === 'Escape') {
                          const newBatch = [...batchCoverages];
                          newBatch[idx] = { ...newBatch[idx], customMode: false, customInput: undefined };
                          setBatchCoverages(newBatch);
                        }
                      }}
                    />
                  ) : (
                    <select
                      className="text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-purple-400"
                      value={bc.value}
                      onChange={(e) => {
                        const newBatch = [...batchCoverages];
                        if (e.target.value === 'custom') {
                          newBatch[idx] = { ...newBatch[idx], customMode: true, customInput: '' };
                        } else {
                          const val = e.target.value === 'full' ? 'full' : Number(e.target.value);
                          newBatch[idx] = { ...newBatch[idx], value: val };
                        }
                        setBatchCoverages(newBatch);
                      }}
                    >
                      {options.map(opt => (
                        <option key={opt.label} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                  <button
                    className="text-red-500 hover:text-red-700 text-lg"
                    onClick={() => {
                      if (batchCoverages.length > 1) {
                        setBatchCoverages(batchCoverages.filter((_, i) => i !== idx));
                      } else {
                        setBatchCoverages([{ id: '', value: 0 }]);
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <button
            className="text-xs text-purple-600 hover:text-purple-800 mb-4"
            onClick={() => setBatchCoverages([...batchCoverages, { id: '', value: 0 }])}
          >
            + Add coverage
          </button>

          {/* Quote selection */}
          <div className="text-sm font-medium text-gray-700 mb-2">Apply to:</div>
          <div className="flex flex-wrap gap-3 mb-4">
            {primaryQuotes.map(q => (
              <label key={q.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedQuotes[q.id] || false}
                  onChange={(e) => setSelectedQuotes({ ...selectedQuotes, [q.id]: e.target.checked })}
                  className="rounded border-gray-300 text-purple-600"
                />
                {q.quote_name || 'Unnamed'}
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 disabled:opacity-50"
              onClick={handleBatchApply}
              disabled={batchMutation.isPending || batchCoverages.every(bc => !bc.id)}
            >
              {batchMutation.isPending ? 'Applying...' : 'Apply to Selected'}
            </button>
            <button
              className="text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-50"
              onClick={() => {
                const all = {};
                primaryQuotes.forEach(q => { all[q.id] = true; });
                setSelectedQuotes(all);
              }}
            >
              Select All
            </button>
            <button
              className="text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-50"
              onClick={() => setSelectedQuotes({})}
            >
              Select None
            </button>
          </div>
        </div>
      )}

      {/* Edit controls - shown when editing (not in embedded mode where controls are in parent) */}
      {isEditing && !embedded && (
        <div className="flex items-center justify-end gap-2 py-2 border-b border-gray-100">
          {isAggregateChanging && (
            <span className="mr-auto text-sm text-purple-600">
              Aggregate: {formatCompact(aggregateLimit)} → {formatCompact(effectiveAggregateLimit)}
            </span>
          )}
          <button
            onClick={handleCancel}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700"
          >
            Save
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-100">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'variable'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => { setActiveTab('variable'); handleCancel(); }}
        >
          Variable Limits
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'standard'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => { setActiveTab('standard'); handleCancel(); }}
        >
          Standard Limits
        </button>
        {/* Bound indicator - shows when quote is bound (read-only) */}
        {isBound && (
          <>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5 px-3 py-1.5 mb-3 text-xs text-red-600 bg-red-50 rounded border border-red-200">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Bound - View Only</span>
            </div>
          </>
        )}
        {/* Spacer + Batch Edit button */}
        {mode === 'quote' && showBatchEditProp && primaryQuotes.length > 1 && !isBound && (
          <>
            <div className="flex-1" />
            <button
              className="text-xs text-purple-600 hover:text-purple-700 font-medium px-2"
              onClick={() => setShowBatchEdit(!showBatchEdit)}
            >
              {showBatchEdit ? 'Close Batch Edit' : 'Batch Edit'}
            </button>
          </>
        )}
      </div>

      {/* Table */}
      <div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Coverage</th>
              <th className="px-4 py-2.5 text-right font-semibold">
                {activeTab === 'variable' ? 'Default' : 'Standard'}
              </th>
              <th className="px-4 py-2.5 text-center font-semibold">Treatment</th>
              <th className="px-4 py-2.5 text-right font-semibold">Limit</th>
              {allQuotes && allQuotes.length > 1 && (
                <th className="px-4 py-2.5 text-right font-semibold">Options</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {currentCoverages.map((cov, idx) => {
              const value = activeTab === 'variable'
                ? getSublimitValue(cov.id, cov.default)
                : getAggregateValue(cov.id);
              const defaultValue = activeTab === 'variable' ? cov.default : effectiveAggregateLimit;
              const treatment = getTreatment(cov.id, activeTab);
              const isExcluded = value === 0;

              return (
                <tr
                  key={cov.id}
                  className={`${isEditing ? 'bg-blue-50/30' : 'hover:bg-gray-50 cursor-pointer'}`}
                  onClick={() => {
                    if (!isEditing && !effectiveReadOnly) {
                      enterEditMode(idx);
                    }
                  }}
                >
                  {/* Coverage Name */}
                  <td className={`px-4 py-3 ${isExcluded ? 'text-gray-400' : 'text-gray-900'}`}>
                    {cov.label}
                  </td>

                  {/* Default/Standard Value */}
                  <td className="px-4 py-3 text-right text-gray-500">
                    {formatCompact(defaultValue)}
                  </td>

                  {/* Treatment */}
                  <td className="px-4 py-3 text-center">
                    {isEditing && !effectiveReadOnly ? (
                      <select
                        ref={(el) => { treatmentRefs.current[idx] = el; }}
                        className="text-xs border border-gray-200 rounded px-2 py-1 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 outline-none bg-white"
                        value={treatment}
                        onChange={(e) => {
                          const newTreatment = e.target.value;
                          if (newTreatment === 'Excluded') {
                            setDraft({ ...draft, [cov.id]: 0 });
                          } else if (newTreatment === 'Default' || newTreatment === 'Full') {
                            setDraft({ ...draft, [cov.id]: defaultValue });
                          }
                          // Custom keeps current value
                        }}
                        onKeyDown={(e) => handleArrowNav(e, idx, 0)}
                      >
                        <option value={activeTab === 'variable' ? 'Default' : 'Full'}>
                          {activeTab === 'variable' ? 'Default' : 'Full'}
                        </option>
                        <option value="Custom">Custom</option>
                        <option value="Excluded">Excluded</option>
                      </select>
                    ) : (
                      <span className={`inline-block px-3 py-1 text-xs rounded border ${getTreatmentStyle(treatment)}`}>
                        {treatment}
                      </span>
                    )}
                  </td>

                  {/* Limit Value */}
                  <td className="px-4 py-3 text-right">
                    {isEditing && !effectiveReadOnly ? (
                      <input
                        ref={(el) => { limitInputRefs.current[idx] = el; }}
                        type="text"
                        className="w-28 text-sm text-right font-medium text-green-600 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 outline-none"
                        value={formatNumberWithCommas(value)}
                        onChange={(e) => {
                          const raw = parseFormattedNumber(e.target.value);
                          setDraft({ ...draft, [cov.id]: raw ? Number(raw) : 0 });
                        }}
                        onKeyDown={(e) => handleArrowNav(e, idx, 1)}
                        onFocus={(e) => e.target.select()}
                      />
                    ) : (
                      <span className={`font-medium ${isExcluded ? 'text-gray-400' : 'text-green-600'}`}>
                        {isExcluded ? 'Excluded' : formatCompact(value)}
                      </span>
                    )}
                  </td>

                  {/* Options/Sharing Column */}
                  {allQuotes && allQuotes.length > 1 && (() => {
                    const coverageInfo = getCoverageAcrossQuotes(cov.id, activeTab);
                    const { quotes: otherQuotes, boundQuotes, allSame, currentValue } = coverageInfo;
                    const totalCount = otherQuotes.length + boundQuotes.length + 1; // +1 for current quote

                    if (otherQuotes.length === 0 && boundQuotes.length === 0) return <td className="px-4 py-3" />;

                    // Group other quotes by value for display
                    const valueGroups = {};
                    otherQuotes.forEach(q => {
                      const key = q.value;
                      if (!valueGroups[key]) valueGroups[key] = [];
                      valueGroups[key].push(q);
                    });

                    const hasVariation = !allSame || Object.keys(valueGroups).length > 1;

                    return (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Popover.Root
                          open={activeCoveragePopover === cov.id}
                          onOpenChange={(open) => {
                            setActiveCoveragePopover(open ? cov.id : null);
                            if (open) setApplyError(null); // Clear error when opening
                          }}
                        >
                          <Popover.Trigger asChild>
                            <button
                              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                hasVariation
                                  ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                                  : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                              }`}
                              title="Click to see values across options"
                            >
                              {hasVariation ? 'Varies' : `${totalCount} options`}
                            </button>
                          </Popover.Trigger>
                          <Popover.Portal>
                            <Popover.Content
                              className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3"
                              sideOffset={4}
                              align="end"
                              onPointerDownOutside={(e) => {
                                // Prevent closing when clicking buttons inside - let the click complete first
                                const target = e.target;
                                if (target?.closest?.('button')) {
                                  e.preventDefault();
                                }
                              }}
                            >
                              <div className="text-xs font-medium text-gray-500 mb-2">
                                {cov.label} across options
                              </div>

                              {/* Bound quotes (above the line, red with lock) */}
                              {boundQuotes.length > 0 && (
                                <div className="mb-2 pb-2 border-b border-red-200">
                                  {boundQuotes.map(q => (
                                    <div key={q.id} className="flex items-center justify-between py-1">
                                      <span className="text-xs text-red-600 truncate mr-2 flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                        {q.name}
                                      </span>
                                      <span className="text-xs font-medium text-red-600">
                                        {formatCompact(q.value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Current quote */}
                              <div className="flex items-center justify-between py-1.5 border-b border-gray-100 mb-1">
                                <span className="text-xs text-gray-700 font-medium">
                                  {quote?.quote_name || 'Current'} (this)
                                </span>
                                <span className="text-xs font-semibold text-green-600">
                                  {formatCompact(currentValue)}
                                </span>
                              </div>

                              {/* Other (non-bound) quotes */}
                              {otherQuotes.length > 0 && (
                                <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
                                  {otherQuotes.map(q => (
                                    <div key={q.id} className="flex items-center justify-between py-1">
                                      <span className="text-xs text-gray-600 truncate mr-2">
                                        {q.name}
                                        {q.position !== currentPosition && (
                                          <span className="ml-1 text-[9px] text-gray-400">({q.position})</span>
                                        )}
                                      </span>
                                      <span className={`text-xs font-medium ${
                                        q.value === currentValue ? 'text-green-600' : 'text-amber-600'
                                      }`}>
                                        {formatCompact(q.value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Apply actions - only for same-position, non-bound quotes */}
                              {!effectiveReadOnly && (() => {
                                // Filter to same-position quotes with different values
                                const applicableQuotes = otherQuotes.filter(q =>
                                  q.position === currentPosition && q.value !== currentValue
                                );
                                const hasApplicable = applicableQuotes.length > 0;

                                if (!hasApplicable) return null;

                                return (
                                <div className="border-t border-gray-100 pt-2">
                                  <div className="text-[10px] text-gray-400 mb-1.5">
                                    Apply {formatCompact(currentValue)} to:
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      onPointerDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (applyCoverageMutation.isPending) return;
                                        applyCoverageMutation.mutate({
                                          covId: cov.id,
                                          type: activeTab,
                                          value: currentValue,
                                          targetQuoteIds: applicableQuotes.map(q => q.id),
                                        });
                                      }}
                                      disabled={applyCoverageMutation.isPending}
                                      className="text-[10px] px-2 py-1 rounded border border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {applyCoverageMutation.isPending ? 'Applying...' : 'All options'}
                                    </button>
                                    {applicableQuotes.slice(0, 4).map(q => (
                                      <button
                                        key={q.id}
                                        type="button"
                                        onPointerDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (applyCoverageMutation.isPending) return;
                                          applyCoverageMutation.mutate({
                                            covId: cov.id,
                                            type: activeTab,
                                            value: currentValue,
                                            targetQuoteIds: [q.id],
                                          });
                                        }}
                                        disabled={applyCoverageMutation.isPending}
                                        className="text-[10px] px-2 py-1 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                      >
                                        {q.name}
                                      </button>
                                    ))}
                                  </div>
                                  {/* Error message */}
                                  {applyError && (
                                    <div className="mt-2 p-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded">
                                      {applyError}
                                    </div>
                                  )}
                                </div>
                                );
                              })()}
                            </Popover.Content>
                          </Popover.Portal>
                        </Popover.Root>
                      </td>
                    );
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
