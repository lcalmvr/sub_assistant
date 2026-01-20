import CoverageEditor from '../../CoverageEditor';
import ExcessCoverageCompact from '../ExcessCoverageCompact';
import { formatCompact, getStructurePosition } from '../../../utils/quoteUtils';

/**
 * CoveragesCardContent - Presentation component for Coverages KPI card
 *
 * Displays coverage information with different views for:
 * - Primary quotes: Exceptions | All filter
 * - Excess quotes: Drop Down | All | Non-Follow filter
 *
 * Props are passed down from QuotePageV3 which manages all state.
 */
export default function CoveragesCardContent({
  // Data
  structure,
  structureId,
  structures,
  submission,
  allSublimits,
  coverageExceptions,
  // State
  expandedCard,
  setExpandedCard,
  cachedIsExcess,
  setCachedIsExcess,
  excessCoverageFilter,
  setExcessCoverageFilter,
  showAllSublimits,
  setShowAllSublimits,
  // Refs
  coveragesCardRef,
  excessCoverageSaveRef,
  // Callbacks
  onUpdateOption,
}) {
  const isEditingCoverages = expandedCard === 'coverages';

  // Use getStructurePosition to properly detect excess from tower structure
  // When editing, use cached value to prevent component remount from unstable position detection
  const computedIsExcess = getStructurePosition(structure) === 'excess';
  const isExcessQuote = isEditingCoverages && cachedIsExcess !== null ? cachedIsExcess : computedIsExcess;

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
      onClick={() => {
        if (!isEditingCoverages) {
          setCachedIsExcess(computedIsExcess);
          setExpandedCard('coverages');
        }
      }}
    >
      {/* Header */}
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
        {isEditingCoverages ? (
          <h3 className="text-xs font-bold text-gray-500 uppercase">Coverages</h3>
        ) : isExcessQuote ? (
          /* Excess quote filters: Drop Down | All | Non-Follow */
          <ExcessFilterButtons
            excessCoverageFilter={excessCoverageFilter}
            setExcessCoverageFilter={setExcessCoverageFilter}
          />
        ) : (
          /* Primary quote filters: Exceptions | All */
          <PrimaryFilterButtons
            showAllSublimits={showAllSublimits}
            setShowAllSublimits={setShowAllSublimits}
          />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isEditingCoverages && isExcessQuote) {
              // Trigger save before closing
              excessCoverageSaveRef.current?.();
            } else if (isEditingCoverages) {
              // Exiting edit mode - clear cache
              setCachedIsExcess(null);
              setExpandedCard(null);
            } else {
              // Entering edit mode - cache current excess status to prevent flicker
              setCachedIsExcess(computedIsExcess);
              setExpandedCard('coverages');
            }
          }}
          className="text-xs text-purple-600 hover:text-purple-700 font-medium"
        >
          {isEditingCoverages ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* Content */}
      {isEditingCoverages ? (
        /* Full Coverage Editor when editing */
        <div className="p-2">
          {isExcessQuote ? (
            <ExcessCoverageCompact
              key={`excess-${structureId}`}
              sublimits={structure.sublimits || []}
              towerJson={structure.tower_json || []}
              onSave={(updatedSublimits) => {
                onUpdateOption?.(structureId, { sublimits: updatedSublimits });
                setCachedIsExcess(null);
                setExpandedCard(null);
              }}
              embedded={true}
              structureId={structureId}
              saveRef={excessCoverageSaveRef}
            />
          ) : (
            <CoverageEditor
              key={`primary-${structureId}`}
              coverages={structure?.coverages || { aggregate_coverages: {}, sublimit_coverages: {} }}
              aggregateLimit={aggregateLimit}
              onSave={(updatedCoverages) => {
                onUpdateOption?.(structureId, { coverages: updatedCoverages });
                setCachedIsExcess(null);
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
          {isExcessQuote ? (
            <ExcessPreview
              allSublimits={allSublimits}
              excessCoverageFilter={excessCoverageFilter}
            />
          ) : showAllSublimits ? (
            <AllSublimitsPreview allSublimits={allSublimits} />
          ) : coverageExceptions.length === 0 ? (
            <NoExceptionsMessage />
          ) : (
            <ExceptionsPreview coverageExceptions={coverageExceptions} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ExcessFilterButtons - Filter buttons for excess quotes
 */
function ExcessFilterButtons({ excessCoverageFilter, setExcessCoverageFilter }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={(e) => { e.stopPropagation(); setExcessCoverageFilter('dropdown'); }}
        className={`text-xs font-bold uppercase ${excessCoverageFilter === 'dropdown' ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
      >
        Drop Down
      </button>
      <span className="text-gray-300">|</span>
      <button
        onClick={(e) => { e.stopPropagation(); setExcessCoverageFilter('all'); }}
        className={`text-xs font-bold uppercase ${excessCoverageFilter === 'all' ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
      >
        All
      </button>
      <span className="text-gray-300">|</span>
      <button
        onClick={(e) => { e.stopPropagation(); setExcessCoverageFilter('nonfollow'); }}
        className={`text-xs font-bold uppercase ${excessCoverageFilter === 'nonfollow' ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
      >
        Non-Follow
      </button>
    </div>
  );
}

/**
 * PrimaryFilterButtons - Filter buttons for primary quotes
 */
function PrimaryFilterButtons({ showAllSublimits, setShowAllSublimits }) {
  return (
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
  );
}

/**
 * ExcessPreview - Collapsed preview for excess quotes with filter
 */
function ExcessPreview({ allSublimits, excessCoverageFilter }) {
  const filteredSublimits = excessCoverageFilter === 'all'
    ? allSublimits
    : excessCoverageFilter === 'dropdown'
      ? allSublimits.filter(s => s.isFollowForm && !s.isExcluded)
      : allSublimits.filter(s => !s.isFollowForm || s.isExcluded);

  if (filteredSublimits.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic">
        {excessCoverageFilter === 'dropdown' ? 'No drop-down coverages' :
         excessCoverageFilter === 'nonfollow' ? 'All coverages follow form' :
         'No coverages defined'}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {filteredSublimits.map(sub => (
        <div key={sub.id} className="flex justify-between text-sm">
          <span className={`text-gray-600 ${sub.isExcluded ? 'line-through' : ''}`}>{sub.label}</span>
          <span className={`font-medium ${sub.isExcluded ? 'text-red-500' : sub.isException ? 'text-amber-600' : 'text-green-600'}`}>
            {sub.value === 'Excluded' ? 'Excluded' : (
              sub.attachment != null
                ? `${formatCompact(sub.value)} xs ${formatCompact(sub.attachment)}`
                : formatCompact(sub.value)
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * AllSublimitsPreview - Collapsed preview showing all sublimits
 */
function AllSublimitsPreview({ allSublimits }) {
  if (allSublimits.length === 0) {
    return <div className="text-sm text-gray-400 italic">No coverages defined</div>;
  }

  return (
    <div className="space-y-1">
      {allSublimits.map(sub => (
        <div key={sub.id} className="flex justify-between text-sm">
          <span className={`text-gray-600 ${sub.isExcluded ? 'line-through' : ''}`}>{sub.label}</span>
          <span className={`font-medium ${sub.isExcluded ? 'text-red-500' : sub.isException ? 'text-amber-600' : 'text-green-600'}`}>
            {formatCompact(sub.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * NoExceptionsMessage - Message when no exceptions exist
 */
function NoExceptionsMessage() {
  return (
    <div className="flex items-center gap-2 text-sm text-green-600">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span>All standard limits</span>
    </div>
  );
}

/**
 * ExceptionsPreview - Collapsed preview showing only exceptions
 */
function ExceptionsPreview({ coverageExceptions }) {
  return (
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
  );
}
