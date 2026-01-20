import { createContext, useContext, useState, useMemo } from 'react';
import { getStructurePosition, generateOptionName } from '../../../utils/quoteUtils';

// ============================================================================
// SUMMARY CONTEXT
// Provides shared state for Summary cards to avoid prop drilling
// ============================================================================

const SummaryContext = createContext(null);

export function SummaryProvider({
  children,
  structures = [],
  activeStructure,
  activeVariation,
  submission,
  summaryScope = 'quote', // 'quote' or 'submission'
  onUpdateOption,
}) {
  // Expandable card state - only one card can be expanded at a time
  const [expandedCard, setExpandedCard] = useState(null);

  // Derive useful data from structures
  const structureId = activeStructure?.id;
  const quoteType = getStructurePosition(activeStructure) === 'excess' ? 'excess' : 'primary';
  const peerLabel = quoteType === 'excess' ? 'Excess' : 'Primary';

  // Peer IDs (same position, excluding current)
  const peerIds = useMemo(() => (
    structures
      .filter(s => getStructurePosition(s) === quoteType && String(s.id) !== String(structureId))
      .map(s => String(s.id))
  ), [structures, quoteType, structureId]);

  // All options for "Applies To" popovers
  const allOptions = useMemo(() => (
    structures.map(s => ({
      id: String(s.id),
      name: s.quote_name || generateOptionName(s),
      position: getStructurePosition(s),
    }))
  ), [structures]);

  const allOptionIds = useMemo(() => allOptions.map(o => o.id), [allOptions]);
  const allPrimaryIds = useMemo(() => allOptions.filter(o => o.position !== 'excess').map(o => o.id), [allOptions]);
  const allExcessIds = useMemo(() => allOptions.filter(o => o.position === 'excess').map(o => o.id), [allOptions]);

  const value = useMemo(() => ({
    // Core data
    structures,
    activeStructure,
    activeVariation,
    structureId,
    submission,
    submissionId: submission?.id,
    summaryScope,

    // Derived data
    quoteType,
    peerLabel,
    peerIds,
    allOptions,
    allOptionIds,
    allPrimaryIds,
    allExcessIds,

    // Expanded card state
    expandedCard,
    setExpandedCard,

    // Callbacks
    onUpdateOption,
  }), [
    structures,
    activeStructure,
    activeVariation,
    structureId,
    submission,
    summaryScope,
    quoteType,
    peerLabel,
    peerIds,
    allOptions,
    allOptionIds,
    allPrimaryIds,
    allExcessIds,
    expandedCard,
    onUpdateOption,
  ]);

  return (
    <SummaryContext.Provider value={value}>
      {children}
    </SummaryContext.Provider>
  );
}

export function useSummary() {
  const context = useContext(SummaryContext);
  if (!context) {
    throw new Error('useSummary must be used within a SummaryProvider');
  }
  return context;
}

export default SummaryContext;
