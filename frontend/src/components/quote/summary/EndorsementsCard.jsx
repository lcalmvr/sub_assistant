import { useState, useMemo, useCallback } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as HoverCard from '@radix-ui/react-hover-card';
import { useCardExpand } from '../../../hooks/useEditMode';
import AppliesToPopover from '../AppliesToPopover';

/**
 * EndorsementsCard - Displays and manages endorsements for a quote or submission
 *
 * Supports two modes:
 * - Quote mode: Shows endorsements for a single quote option with peer comparison
 * - Submission mode: Shows all endorsements across the submission
 */
export default function EndorsementsCard({
  // Core data
  endorsements = [],
  allSubmissionEndorsements = [],
  summaryScope = 'quote',

  // Comparison data (quote mode only)
  missingEndorsements = [],
  uniqueEndorsements = [],
  alignedEndorsements = [],
  endorsementStatus = {},
  peerLabel = 'Primary',
  showMissingSuggestions = false,

  // Options for "Applies To" popovers
  allOptions = [],
  allOptionIds = [],
  allPrimaryIds = [],
  allExcessIds = [],

  // Expansion state
  expandedCard,
  setExpandedCard,

  // Callbacks
  getEndorsementSharedQuoteCount,
  getEndorsementIcon,
  onRestoreEndorsement,
  onToggleLink,
  onApplySelection,
  onUpdateManuscriptText,
  onCreateManuscript,
  onLinkFromLibrary,
  onLibraryPickerOpenChange, // Callback when library picker opens/closes (for query enablement)

  // Library data (unfiltered - component handles search filtering)
  availableLibraryEndorsements = [],
}) {
  // Local editing state
  const [selectedEndorsementId, setSelectedEndorsementId] = useState(null);
  const [editingEndorsementId, setEditingEndorsementId] = useState(null);
  const [editingEndorsementText, setEditingEndorsementText] = useState('');
  const [endorsementAppliesToPopoverId, setEndorsementAppliesToPopoverId] = useState(null);
  const [isAddingEndorsement, setIsAddingEndorsement] = useState(false);
  const [newEndorsementText, setNewEndorsementText] = useState('');
  const [showEndorsementLibraryPicker, setShowEndorsementLibraryPicker] = useState(false);
  const [endorsementLibrarySearchTerm, setEndorsementLibrarySearchTerm] = useState('');

  // Reset local state when card closes
  const resetState = useCallback(() => {
    setSelectedEndorsementId(null);
    setEditingEndorsementId(null);
    setIsAddingEndorsement(false);
    setShowEndorsementLibraryPicker(false);
  }, []);

  // Use shared hook for expand/collapse behavior with click-outside detection
  const { containerRef, isExpanded, toggle } = useCardExpand(
    'endorsements',
    expandedCard,
    setExpandedCard,
    resetState
  );

  // Notify parent when library picker opens/closes (to enable query)
  const handleLibraryPickerOpenChange = (open) => {
    setShowEndorsementLibraryPicker(open);
    if (onLibraryPickerOpenChange) {
      onLibraryPickerOpenChange(open);
    }
  };

  // Filter library endorsements by search term
  const filteredLibraryEndorsements = useMemo(() => (
    availableLibraryEndorsements.filter(e =>
      !endorsementLibrarySearchTerm ||
      (e.title || e.code || '').toLowerCase().includes(endorsementLibrarySearchTerm.toLowerCase())
    )
  ), [availableLibraryEndorsements, endorsementLibrarySearchTerm]);

  const endorsementsEmpty = endorsements.length === 0;

  const handleStartEditing = (item) => {
    if (item.isManuscript) {
      setEditingEndorsementId(item.id);
      setEditingEndorsementText(item.label);
    }
  };

  const handleSaveEdit = (item, mutationId) => {
    if (editingEndorsementText.trim() && editingEndorsementText !== item.label) {
      onUpdateManuscriptText(mutationId, editingEndorsementText);
    }
    setEditingEndorsementId(null);
  };

  const handleCreateEndorsement = () => {
    if (newEndorsementText.trim()) {
      onCreateManuscript(newEndorsementText.trim());
      setNewEndorsementText('');
      setIsAddingEndorsement(false);
    }
  };

  // Determine which card styles to apply based on expansion
  const isHiddenByOtherCard = expandedCard && expandedCard !== 'endorsements' && expandedCard !== 'tower' && expandedCard !== 'coverages' && expandedCard !== 'terms' && expandedCard !== 'retro' && expandedCard !== 'commission';

  return (
    <div
      ref={containerRef}
      className={`bg-white border rounded-lg overflow-hidden transition-all duration-200 ${
        isExpanded
          ? 'md:col-span-2 border-purple-300 ring-1 ring-purple-100'
          : 'border-gray-200 hover:border-gray-300 cursor-pointer'
      } ${isHiddenByOtherCard ? 'hidden' : ''}`}
      onClick={() => {
        if (!isExpanded) {
          toggle();
        }
      }}
    >
      {/* Header */}
      <div className="h-9 px-4 flex items-center justify-between bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">Endorsements</h3>
          {summaryScope === 'submission' ? (
            isExpanded ? (
              <span className="text-[11px] text-gray-400">
                {allSubmissionEndorsements.length} across submission
              </span>
            ) : (
              <span className="text-[11px] text-purple-600 font-medium">
                {allSubmissionEndorsements.length} across submission
              </span>
            )
          ) : (
            <>
              {!expandedCard && endorsementStatus.text && (
                <span className={`text-[11px] ${endorsementStatus.tone}`}>
                  {endorsementStatus.text}
                </span>
              )}
              {isExpanded && (
                <span className="text-[11px] text-gray-400">
                  {endorsements.length} item{endorsements.length !== 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </div>
        {((summaryScope === 'quote' && endorsements.length > 0) || (summaryScope === 'submission' && allSubmissionEndorsements.length > 0)) && (
          <button
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium leading-none"
          >
            {isExpanded ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {summaryScope === 'submission' ? (
          /* Submission Mode */
          <SubmissionModeContent
            allSubmissionEndorsements={allSubmissionEndorsements}
            isExpanded={isExpanded}
            allOptions={allOptions}
            editingEndorsementId={editingEndorsementId}
            editingEndorsementText={editingEndorsementText}
            setEditingEndorsementText={setEditingEndorsementText}
            handleStartEditing={handleStartEditing}
            handleSaveEdit={handleSaveEdit}
            endorsementAppliesToPopoverId={endorsementAppliesToPopoverId}
            setEndorsementAppliesToPopoverId={setEndorsementAppliesToPopoverId}
            onApplySelection={onApplySelection}
            onToggleLink={onToggleLink}
            getEndorsementIcon={getEndorsementIcon}
            onUpdateManuscriptText={onUpdateManuscriptText}
            setExpandedCard={setExpandedCard}
          />
        ) : endorsementsEmpty ? (
          <p className="text-sm text-gray-400">No endorsements attached</p>
        ) : isExpanded ? (
          /* Quote Mode - Expanded Edit View */
          <QuoteModeExpandedContent
            showMissingSuggestions={showMissingSuggestions}
            missingEndorsements={missingEndorsements}
            uniqueEndorsements={uniqueEndorsements}
            alignedEndorsements={alignedEndorsements}
            peerLabel={peerLabel}
            editingEndorsementId={editingEndorsementId}
            editingEndorsementText={editingEndorsementText}
            setEditingEndorsementText={setEditingEndorsementText}
            selectedEndorsementId={selectedEndorsementId}
            setSelectedEndorsementId={setSelectedEndorsementId}
            handleStartEditing={handleStartEditing}
            handleSaveEdit={handleSaveEdit}
            setExpandedCard={setExpandedCard}
            setEditingEndorsementId={setEditingEndorsementId}
            setIsAddingEndorsement={setIsAddingEndorsement}
            handleLibraryPickerOpenChange={handleLibraryPickerOpenChange}
            endorsementAppliesToPopoverId={endorsementAppliesToPopoverId}
            setEndorsementAppliesToPopoverId={setEndorsementAppliesToPopoverId}
            allOptions={allOptions}
            onToggleLink={onToggleLink}
            getEndorsementSharedQuoteCount={getEndorsementSharedQuoteCount}
            getEndorsementIcon={getEndorsementIcon}
            onRestoreEndorsement={onRestoreEndorsement}
            onUpdateManuscriptText={onUpdateManuscriptText}
            isAddingEndorsement={isAddingEndorsement}
            newEndorsementText={newEndorsementText}
            setNewEndorsementText={setNewEndorsementText}
            handleCreateEndorsement={handleCreateEndorsement}
            showEndorsementLibraryPicker={showEndorsementLibraryPicker}
            filteredLibraryEndorsements={filteredLibraryEndorsements}
            endorsementLibrarySearchTerm={endorsementLibrarySearchTerm}
            setEndorsementLibrarySearchTerm={setEndorsementLibrarySearchTerm}
            onLinkFromLibrary={onLinkFromLibrary}
          />
        ) : (
          /* Quote Mode - Collapsed Summary View */
          <QuoteModeCollapsedContent
            showMissingSuggestions={showMissingSuggestions}
            missingEndorsements={missingEndorsements}
            uniqueEndorsements={uniqueEndorsements}
            alignedEndorsements={alignedEndorsements}
            allOptions={allOptions}
            setExpandedCard={setExpandedCard}
            setSelectedEndorsementId={setSelectedEndorsementId}
            getEndorsementIcon={getEndorsementIcon}
            onRestoreEndorsement={onRestoreEndorsement}
          />
        )}
      </div>
    </div>
  );
}

// Sub-components to break up the rendering logic

function SubmissionModeContent({
  allSubmissionEndorsements,
  isExpanded,
  allOptions,
  editingEndorsementId,
  editingEndorsementText,
  setEditingEndorsementText,
  handleStartEditing,
  handleSaveEdit,
  endorsementAppliesToPopoverId,
  setEndorsementAppliesToPopoverId,
  onApplySelection,
  onToggleLink,
  getEndorsementIcon,
  onUpdateManuscriptText,
  setExpandedCard,
}) {
  if (allSubmissionEndorsements.length === 0) {
    return <p className="text-sm text-gray-400">No endorsements in this submission</p>;
  }

  if (isExpanded) {
    return (
      <div className="space-y-1">
        {allSubmissionEndorsements.map((item) => {
          const isEditing = editingEndorsementId === item.id;
          const mutationId = item.rawId || item.id;
          const linkedQuoteIds = item.quoteIds?.map(String) || [];

          return (
            <div
              key={item.id}
              className={`group flex items-center gap-2 text-sm rounded px-2 py-1.5 ${isEditing ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
            >
              {getEndorsementIcon(item)}

              {/* Endorsement name - editable for manuscripts */}
              {isEditing && item.isManuscript ? (
                <input
                  type="text"
                  value={editingEndorsementText}
                  onChange={(e) => setEditingEndorsementText(e.target.value)}
                  onBlur={() => handleSaveEdit(item, mutationId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.preventDefault();
                      handleSaveEdit(item, mutationId);
                    }
                  }}
                  className="flex-1 min-w-0 text-sm border-0 border-b border-purple-400 bg-transparent px-0 py-0 focus:outline-none focus:border-purple-600"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => handleStartEditing(item)}
                  className={`flex-1 min-w-0 text-left ${
                    item.isManuscript ? 'text-gray-700 hover:text-purple-700 cursor-pointer' : 'text-gray-700 cursor-default'
                  }`}
                >
                  {item.label}
                </button>
              )}

              {/* Applies To badge with popover */}
              <AppliesToPopover
                linkedQuoteIds={linkedQuoteIds}
                allOptions={allOptions}
                onToggle={(quoteId, isLinked) => onToggleLink(mutationId, quoteId, isLinked)}
                onApplySelection={(targetIds) => onApplySelection(mutationId, linkedQuoteIds, targetIds)}
                isOpen={endorsementAppliesToPopoverId === item.id}
                onOpenChange={(open) => setEndorsementAppliesToPopoverId(open ? item.id : null)}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Collapsed submission mode - show up to 10 items with x/y pills and hover preview
  return (
    <div className="space-y-2">
      {allSubmissionEndorsements.slice(0, 10).map((item) => {
        const linkedQuoteIds = item.quoteIds?.map(String) || [];
        const linkedCount = linkedQuoteIds.length;
        const totalCount = allOptions.length;
        const isAllLinked = linkedCount === totalCount && totalCount > 0;

        // Get linked and not-linked quotes for HoverCard
        const linkedQuotes = allOptions.filter(opt => linkedQuoteIds.includes(String(opt.id)));
        const notLinkedQuotes = allOptions.filter(opt => !linkedQuoteIds.includes(String(opt.id)));
        const mutationId = item.rawId || item.id;

        return (
          <div key={item.id} className="flex items-center gap-2 text-sm group hover:bg-gray-50 rounded px-1 -mx-1">
            {getEndorsementIcon(item)}
            <button
              onClick={() => setExpandedCard('endorsements')}
              className="flex-1 min-w-0 truncate text-gray-700 hover:text-purple-700 text-left cursor-pointer"
            >
              {item.label}
            </button>
            <HoverCard.Root openDelay={200} closeDelay={100}>
              <HoverCard.Trigger asChild>
                <button
                  type="button"
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 hover:opacity-80 ${
                    isAllLinked
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : linkedCount > 0
                      ? 'bg-blue-50 text-blue-600 border-blue-200'
                      : 'bg-gray-50 text-gray-500 border-gray-200'
                  }`}
                >
                  {isAllLinked ? 'All' : linkedCount === 0 ? 'None' : `${linkedCount}/${totalCount}`}
                </button>
              </HoverCard.Trigger>
              <HoverCard.Portal>
                <HoverCard.Content
                  className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3"
                  sideOffset={4}
                >
                  {/* ON section - quotes it's applied to */}
                  {linkedQuotes.length > 0 && (
                    <>
                      <div className="text-[10px] text-green-600 uppercase tracking-wide mb-1">On ({linkedCount})</div>
                      <div className="space-y-0.5 mb-3">
                        {linkedQuotes.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => {
                              const newIds = linkedQuoteIds.filter(id => id !== String(opt.id));
                              onApplySelection(mutationId, linkedQuoteIds, newIds);
                            }}
                            className="w-full text-left text-xs text-gray-700 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-red-50 hover:text-red-700 transition-colors group/item"
                          >
                            <span className="text-green-400 group-hover/item:text-red-400">•</span>
                            <span className="flex-1">{opt.name}</span>
                            <span className="text-[10px] text-gray-400 group-hover/item:text-red-500 opacity-0 group-hover/item:opacity-100">−</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {/* NOT ON section - quotes it's not applied to */}
                  {notLinkedQuotes.length > 0 && (
                    <>
                      <div className="text-[10px] text-amber-600 uppercase tracking-wide mb-1">Not On ({notLinkedQuotes.length})</div>
                      <div className="space-y-0.5">
                        {notLinkedQuotes.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => {
                              const newIds = [...linkedQuoteIds, String(opt.id)];
                              onApplySelection(mutationId, linkedQuoteIds, newIds);
                            }}
                            className="w-full text-left text-xs text-gray-500 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-green-50 hover:text-green-700 transition-colors group/item"
                          >
                            <span className="text-amber-400 group-hover/item:text-green-400">•</span>
                            <span className="flex-1">{opt.name}</span>
                            <span className="text-[10px] text-gray-400 group-hover/item:text-green-500 opacity-0 group-hover/item:opacity-100">+</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {linkedCount === 0 && notLinkedQuotes.length === 0 && (
                    <div className="text-xs text-gray-500">No quote options available</div>
                  )}
                  <HoverCard.Arrow className="fill-white" />
                </HoverCard.Content>
              </HoverCard.Portal>
            </HoverCard.Root>
          </div>
        );
      })}
      {allSubmissionEndorsements.length > 10 && (
        <button
          onClick={() => setExpandedCard('endorsements')}
          className="text-xs text-purple-600 hover:text-purple-700"
        >
          +{allSubmissionEndorsements.length - 10} more...
        </button>
      )}
    </div>
  );
}

function QuoteModeExpandedContent({
  showMissingSuggestions,
  missingEndorsements,
  uniqueEndorsements,
  alignedEndorsements,
  peerLabel,
  editingEndorsementId,
  editingEndorsementText,
  setEditingEndorsementText,
  selectedEndorsementId,
  setSelectedEndorsementId,
  handleStartEditing,
  handleSaveEdit,
  setExpandedCard,
  setEditingEndorsementId,
  setIsAddingEndorsement,
  handleLibraryPickerOpenChange,
  endorsementAppliesToPopoverId,
  setEndorsementAppliesToPopoverId,
  allOptions,
  onToggleLink,
  getEndorsementSharedQuoteCount,
  getEndorsementIcon,
  onRestoreEndorsement,
  onUpdateManuscriptText,
  isAddingEndorsement,
  newEndorsementText,
  setNewEndorsementText,
  handleCreateEndorsement,
  showEndorsementLibraryPicker,
  filteredLibraryEndorsements,
  endorsementLibrarySearchTerm,
  setEndorsementLibrarySearchTerm,
  onLinkFromLibrary,
}) {
  const allEndorsements = [...uniqueEndorsements, ...alignedEndorsements];

  return (
    <div className="space-y-1">
      {/* Missing from peers suggestions */}
      {showMissingSuggestions && missingEndorsements.length > 0 && (
        <div className="mb-3 pb-3 border-b border-dashed border-amber-200">
          <div className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide mb-2">
            Missing from {peerLabel} peers ({missingEndorsements.length})
          </div>
          {missingEndorsements.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 text-sm border border-dashed border-amber-300 rounded px-2 py-1 bg-amber-50/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-gray-700 truncate">{item.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 flex-shrink-0">
                  On peers
                </span>
              </div>
              <button
                onClick={() => onRestoreEndorsement(item.id)}
                className="text-[11px] px-2 py-1 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 flex-shrink-0"
              >
                + Add
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Existing endorsements */}
      {allEndorsements.map((item, index) => {
        const isEditing = editingEndorsementId === item.id;
        const sharedCount = getEndorsementSharedQuoteCount(item);
        const mutationId = item.rawId || item.id;

        const navigateToEndorsement = (targetIndex) => {
          if (item.isManuscript && editingEndorsementText.trim() && editingEndorsementText !== item.label) {
            onUpdateManuscriptText(mutationId, editingEndorsementText);
          }
          const targetItem = allEndorsements[targetIndex];
          if (targetItem) {
            if (targetItem.isManuscript) {
              setEditingEndorsementId(targetItem.id);
              setEditingEndorsementText(targetItem.label);
            } else {
              setEditingEndorsementId(null);
              setSelectedEndorsementId(targetItem.id);
            }
          }
        };

        return (
          <div
            key={item.id}
            className="flex items-center gap-2 text-sm rounded px-2 py-1 group hover:bg-gray-50"
          >
            {getEndorsementIcon(item)}

            {/* Text - manuscripts can be edited */}
            {isEditing && item.isManuscript ? (
              <input
                type="text"
                value={editingEndorsementText}
                onChange={(e) => setEditingEndorsementText(e.target.value)}
                onBlur={() => handleSaveEdit(item, mutationId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                    e.preventDefault();
                    const nextIndex = index < allEndorsements.length - 1 ? index + 1 : 0;
                    navigateToEndorsement(nextIndex);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    handleSaveEdit(item, mutationId);
                    setExpandedCard(null);
                    setIsAddingEndorsement(false);
                    setShowEndorsementLibraryPicker(false);
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const nextIndex = index < allEndorsements.length - 1 ? index + 1 : 0;
                    navigateToEndorsement(nextIndex);
                  }
                  if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
                    e.preventDefault();
                    const prevIndex = index > 0 ? index - 1 : allEndorsements.length - 1;
                    navigateToEndorsement(prevIndex);
                  }
                }}
                className="flex-1 text-sm border-0 border-b border-purple-400 bg-transparent px-0 py-0 focus:outline-none focus:border-purple-600"
                autoFocus
              />
            ) : (
              <button
                onClick={() => handleStartEditing(item)}
                className={`flex-1 text-left truncate ${
                  item.isManuscript
                    ? 'text-gray-700 hover:text-purple-700 cursor-pointer'
                    : 'text-gray-700 cursor-default'
                }`}
                disabled={!item.isManuscript}
              >
                {item.label}
              </button>
            )}

            {/* Applies To Popover */}
            <Popover.Root
              open={endorsementAppliesToPopoverId === item.id}
              onOpenChange={(open) => setEndorsementAppliesToPopoverId(open ? item.id : null)}
              modal={false}
            >
              <Popover.Trigger asChild>
                <button
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    sharedCount > 0
                      ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {sharedCount > 0 ? `+${sharedCount}` : 'Only here'}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-[9999] w-48 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                  sideOffset={4}
                  align="end"
                >
                  <div className="text-xs font-medium text-gray-500 mb-2 px-1">Also on</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {allOptions.map(opt => {
                      const isLinked = item.quoteIds?.map(String).includes(String(opt.id));
                      return (
                        <label
                          key={opt.id}
                          className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                        >
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={() => onToggleLink(mutationId, opt.id, isLinked)}
                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                          />
                          <span className="truncate">{opt.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <Popover.Arrow className="fill-white" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        );
      })}

      {/* Add new endorsement */}
      {isAddingEndorsement ? (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <input
            type="text"
            value={newEndorsementText}
            onChange={(e) => setNewEndorsementText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateEndorsement();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setNewEndorsementText('');
                setIsAddingEndorsement(false);
              }
            }}
            placeholder="Enter endorsement text..."
            className="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
            autoFocus
          />
          <button
            onClick={handleCreateEndorsement}
            disabled={!newEndorsementText.trim()}
            className="text-[11px] px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => {
              setNewEndorsementText('');
              setIsAddingEndorsement(false);
            }}
            className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        /* Action buttons */
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
          <button
            onClick={() => setIsAddingEndorsement(true)}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Custom
          </button>
          <span className="text-gray-300">|</span>
          <Popover.Root open={showEndorsementLibraryPicker} onOpenChange={handleLibraryPickerOpenChange}>
            <Popover.Trigger asChild>
              <button className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                From Library
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="z-[9999] w-80 rounded-lg border border-gray-200 bg-white shadow-xl" sideOffset={4} align="start">
                <div className="p-3 border-b border-gray-100">
                  <input
                    type="text"
                    placeholder="Search endorsements..."
                    value={endorsementLibrarySearchTerm}
                    onChange={(e) => setEndorsementLibrarySearchTerm(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {filteredLibraryEndorsements.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      {endorsementLibrarySearchTerm ? 'No matching endorsements' : 'No endorsements available'}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {filteredLibraryEndorsements.slice(0, 10).map(endt => (
                        <button
                          key={endt.id}
                          onClick={() => {
                            onLinkFromLibrary(endt.id);
                            handleLibraryPickerOpenChange(false); // Close picker after selection
                            setEndorsementLibrarySearchTerm(''); // Clear search
                          }}
                          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-purple-50 text-gray-700 hover:text-purple-700 truncate"
                        >
                          {endt.title || endt.code}
                        </button>
                      ))}
                      {filteredLibraryEndorsements.length > 10 && (
                        <p className="text-[11px] text-gray-400 text-center py-1">
                          +{filteredLibraryEndorsements.length - 10} more...
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <Popover.Arrow className="fill-white" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}
    </div>
  );
}

function QuoteModeCollapsedContent({
  showMissingSuggestions,
  missingEndorsements,
  uniqueEndorsements,
  alignedEndorsements,
  allOptions,
  setExpandedCard,
  setSelectedEndorsementId,
  getEndorsementIcon,
  onRestoreEndorsement,
}) {
  const totalCount = allOptions?.length || 0;

  return (
    <div className="space-y-2">
      {showMissingSuggestions && missingEndorsements.map((item) => (
        <div
          key={item.id}
          onClick={() => onRestoreEndorsement(item.id)}
          className="flex items-center justify-between gap-2 text-sm border border-dashed border-amber-300 rounded px-2 py-1.5 bg-amber-50/50 cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-gray-700 truncate">{item.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600">
              On peers
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRestoreEndorsement(item.id); }}
            className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:text-gray-900"
          >
            + Add
          </button>
        </div>
      ))}
      {uniqueEndorsements.map((item) => {
        const linkedCount = item.quoteIds?.length || 0;
        const isAllLinked = linkedCount === totalCount && totalCount > 0;
        return (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            {getEndorsementIcon(item)}
            <button
              onClick={() => {
                setExpandedCard('endorsements');
                setSelectedEndorsementId(item.id);
              }}
              className="text-gray-700 hover:text-purple-700 truncate flex-1 text-left"
            >
              {item.label}
            </button>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
              isAllLinked
                ? 'bg-green-50 text-green-700 border-green-200'
                : linkedCount > 1
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-purple-50 text-purple-600 border-purple-200'
            }`}>
              {isAllLinked ? 'All' : `${linkedCount}/${totalCount}`}
            </span>
          </div>
        );
      })}
      {alignedEndorsements.map((item) => {
        const linkedCount = item.quoteIds?.length || 0;
        const isAllLinked = linkedCount === totalCount && totalCount > 0;
        return (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            {getEndorsementIcon(item)}
            <button
              onClick={() => {
                setExpandedCard('endorsements');
                setSelectedEndorsementId(item.id);
              }}
              className="text-gray-700 hover:text-purple-700 truncate flex-1 text-left"
            >
              {item.label}
            </button>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
              isAllLinked
                ? 'bg-green-50 text-green-700 border-green-200'
                : linkedCount > 1
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-purple-50 text-purple-600 border-purple-200'
            }`}>
              {isAllLinked ? 'All' : `${linkedCount}/${totalCount}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

