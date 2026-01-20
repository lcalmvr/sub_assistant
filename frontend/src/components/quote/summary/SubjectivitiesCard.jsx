import { useState, useMemo, useCallback } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as HoverCard from '@radix-ui/react-hover-card';
import { useCardExpand } from '../../../hooks/useEditMode';

/**
 * SubjectivitiesCard - Displays and manages subjectivities for a quote or submission
 *
 * Supports two modes:
 * - Quote mode: Shows subjectivities for a single quote option with peer comparison
 * - Submission mode: Shows all subjectivities across the submission
 */
export default function SubjectivitiesCard({
  // Core data
  subjectivities = [],
  allSubmissionSubjectivities = [],
  summaryScope = 'quote',

  // Comparison data (quote mode only)
  missingSubjectivities = [],
  uniqueSubjectivities = [],
  alignedSubjectivities = [],
  subjectivityStatus = {},
  peerLabel = 'Primary',
  showMissingSuggestions = false,

  // Options for "Applies To" popovers
  allOptions = [],
  allOptionIds = [],
  allPrimaryIds = [],
  allExcessIds = [],
  structureId,

  // Expansion state
  expandedCard,
  setExpandedCard,

  // Callbacks
  getSharedQuoteCount,
  onUpdateStatus,
  onUpdateText,
  onCreate,
  onUnlink,
  onToggleLink,
  onApplySelection,
  onRestore,
  onLinkFromLibrary,
  onLibraryPickerOpenChange, // Callback when library picker opens/closes (for query enablement)

  // Library data
  availableTemplates = [],
}) {
  // Local editing state
  const [editingSubjId, setEditingSubjId] = useState(null);
  const [editingSubjText, setEditingSubjText] = useState('');
  const [isAddingSubjectivity, setIsAddingSubjectivity] = useState(false);
  const [newSubjectivityText, setNewSubjectivityText] = useState('');
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [librarySearchTerm, setLibrarySearchTerm] = useState('');
  const [appliesToPopoverId, setAppliesToPopoverId] = useState(null);
  const [subjectivityAppliesToPopoverId, setSubjectivityAppliesToPopoverId] = useState(null);

  // Notify parent when library picker opens/closes (to enable query)
  const handleLibraryPickerOpenChange = (open) => {
    setShowLibraryPicker(open);
    if (onLibraryPickerOpenChange) {
      onLibraryPickerOpenChange(open);
    }
  };

  // Reset local state when card closes
  const resetState = useCallback(() => {
    setEditingSubjId(null);
    setIsAddingSubjectivity(false);
    setShowLibraryPicker(false);
    if (onLibraryPickerOpenChange) {
      onLibraryPickerOpenChange(false);
    }
  }, [onLibraryPickerOpenChange]);

  // Use shared hook for expand/collapse behavior with click-outside detection
  const { containerRef, isExpanded, toggle } = useCardExpand(
    'subjectivities',
    expandedCard,
    setExpandedCard,
    resetState
  );

  // Filter library templates by search term
  const filteredTemplates = useMemo(() => (
    availableTemplates.filter(t =>
      !librarySearchTerm ||
      (t.text || t.subjectivity_text || '').toLowerCase().includes(librarySearchTerm.toLowerCase())
    )
  ), [availableTemplates, librarySearchTerm]);

  // Cycle subjectivity status: pending -> received -> waived -> pending
  const cycleStatus = (currentStatus) => {
    if (currentStatus === 'pending' || !currentStatus) return 'received';
    if (currentStatus === 'received') return 'waived';
    return 'pending';
  };

  const subjectivitiesEmpty = subjectivities.length === 0;

  // Status icon component
  const StatusIcon = ({ status }) => {
    if (status === 'received') {
      return (
        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    }
    if (status === 'waived') {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`border rounded-lg overflow-hidden transition-all duration-200 ${
        isExpanded
          ? 'md:col-start-2 md:col-span-2 border-purple-300 ring-1 ring-purple-100'
          : 'border-gray-200'
      } ${expandedCard && expandedCard !== 'subjectivities' && expandedCard !== 'tower' && expandedCard !== 'coverages' && expandedCard !== 'terms' && expandedCard !== 'retro' && expandedCard !== 'commission' ? 'hidden' : ''}`}
    >
      {/* Card Header */}
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase">Subjectivities</h3>
          {summaryScope === 'submission' ? (
            isExpanded ? (
              <span className="text-[11px] text-gray-400">
                {allSubmissionSubjectivities.length} across submission
              </span>
            ) : (
              <span className="text-[11px] text-purple-600 font-medium">
                {allSubmissionSubjectivities.length} across submission
              </span>
            )
          ) : (
            <>
              {!expandedCard && subjectivityStatus.text && summaryScope !== 'submission' && (
                <span className={`text-[11px] ${subjectivityStatus.tone}`}>
                  {subjectivityStatus.text}
                </span>
              )}
              {isExpanded && (
                <span className="text-[11px] text-gray-400">
                  {subjectivities.length} item{subjectivities.length !== 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </div>
        {((summaryScope === 'quote' && subjectivities.length > 0) || (summaryScope === 'submission' && allSubmissionSubjectivities.length > 0) || subjectivities.length === 0) && (
          <button
            onClick={toggle}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium"
          >
            {isExpanded ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      <div className="p-4">
        {summaryScope === 'submission' ? (
          <SubmissionModeContent
            allSubmissionSubjectivities={allSubmissionSubjectivities}
            allOptions={allOptions}
            allOptionIds={allOptionIds}
            allPrimaryIds={allPrimaryIds}
            allExcessIds={allExcessIds}
            isExpanded={isExpanded}
            editingSubjId={editingSubjId}
            setEditingSubjId={setEditingSubjId}
            editingSubjText={editingSubjText}
            setEditingSubjText={setEditingSubjText}
            isAddingSubjectivity={isAddingSubjectivity}
            setIsAddingSubjectivity={setIsAddingSubjectivity}
            newSubjectivityText={newSubjectivityText}
            setNewSubjectivityText={setNewSubjectivityText}
            showLibraryPicker={showLibraryPicker}
            setShowLibraryPicker={setShowLibraryPicker}
            librarySearchTerm={librarySearchTerm}
            setLibrarySearchTerm={setLibrarySearchTerm}
            filteredTemplates={filteredTemplates}
            subjectivityAppliesToPopoverId={subjectivityAppliesToPopoverId}
            setSubjectivityAppliesToPopoverId={setSubjectivityAppliesToPopoverId}
            cycleStatus={cycleStatus}
            StatusIcon={StatusIcon}
            onUpdateStatus={onUpdateStatus}
            onUpdateText={onUpdateText}
            onCreate={onCreate}
            onToggleLink={onToggleLink}
            onApplySelection={onApplySelection}
            onLinkFromLibrary={onLinkFromLibrary}
            setExpandedCard={setExpandedCard}
          />
        ) : isExpanded ? (
          <QuoteModeExpandedContent
            subjectivities={subjectivities}
            missingSubjectivities={missingSubjectivities}
            uniqueSubjectivities={uniqueSubjectivities}
            alignedSubjectivities={alignedSubjectivities}
            peerLabel={peerLabel}
            showMissingSuggestions={showMissingSuggestions}
            allOptions={allOptions}
            allOptionIds={allOptionIds}
            allPrimaryIds={allPrimaryIds}
            allExcessIds={allExcessIds}
            structureId={structureId}
            editingSubjId={editingSubjId}
            setEditingSubjId={setEditingSubjId}
            editingSubjText={editingSubjText}
            setEditingSubjText={setEditingSubjText}
            isAddingSubjectivity={isAddingSubjectivity}
            setIsAddingSubjectivity={setIsAddingSubjectivity}
            newSubjectivityText={newSubjectivityText}
            setNewSubjectivityText={setNewSubjectivityText}
            showLibraryPicker={showLibraryPicker}
            setShowLibraryPicker={setShowLibraryPicker}
            librarySearchTerm={librarySearchTerm}
            setLibrarySearchTerm={setLibrarySearchTerm}
            filteredTemplates={filteredTemplates}
            appliesToPopoverId={appliesToPopoverId}
            setAppliesToPopoverId={setAppliesToPopoverId}
            cycleStatus={cycleStatus}
            StatusIcon={StatusIcon}
            getSharedQuoteCount={getSharedQuoteCount}
            onUpdateStatus={onUpdateStatus}
            onUpdateText={onUpdateText}
            onCreate={onCreate}
            onUnlink={onUnlink}
            onToggleLink={onToggleLink}
            onApplySelection={onApplySelection}
            onRestore={onRestore}
            onLinkFromLibrary={onLinkFromLibrary}
            setExpandedCard={setExpandedCard}
            handleLibraryPickerOpenChange={handleLibraryPickerOpenChange}
          />
        ) : subjectivitiesEmpty ? (
          <p className="text-sm text-gray-400">No subjectivities attached</p>
        ) : (
          <QuoteModeCollapsedContent
            missingSubjectivities={missingSubjectivities}
            uniqueSubjectivities={uniqueSubjectivities}
            alignedSubjectivities={alignedSubjectivities}
            showMissingSuggestions={showMissingSuggestions}
            cycleStatus={cycleStatus}
            StatusIcon={StatusIcon}
            onUpdateStatus={onUpdateStatus}
            onRestore={onRestore}
            setExpandedCard={setExpandedCard}
            setEditingSubjId={setEditingSubjId}
            setEditingSubjText={setEditingSubjText}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Submission Mode Content - Shows all subjectivities across the submission
 */
function SubmissionModeContent({
  allSubmissionSubjectivities,
  allOptions,
  allOptionIds,
  allPrimaryIds,
  allExcessIds,
  isExpanded,
  editingSubjId,
  setEditingSubjId,
  editingSubjText,
  setEditingSubjText,
  isAddingSubjectivity,
  setIsAddingSubjectivity,
  newSubjectivityText,
  setNewSubjectivityText,
  showLibraryPicker,
  setShowLibraryPicker,
  librarySearchTerm,
  setLibrarySearchTerm,
  filteredTemplates,
  subjectivityAppliesToPopoverId,
  setSubjectivityAppliesToPopoverId,
  cycleStatus,
  StatusIcon,
  onUpdateStatus,
  onUpdateText,
  onCreate,
  onToggleLink,
  onApplySelection,
  onLinkFromLibrary,
  setExpandedCard,
}) {
  if (allSubmissionSubjectivities.length === 0) {
    return <p className="text-sm text-gray-400">No subjectivities in this submission</p>;
  }

  if (isExpanded) {
    return (
      <SubmissionModeExpandedView
        allSubmissionSubjectivities={allSubmissionSubjectivities}
        allOptions={allOptions}
        allOptionIds={allOptionIds}
        allPrimaryIds={allPrimaryIds}
        allExcessIds={allExcessIds}
        editingSubjId={editingSubjId}
        setEditingSubjId={setEditingSubjId}
        editingSubjText={editingSubjText}
        setEditingSubjText={setEditingSubjText}
        isAddingSubjectivity={isAddingSubjectivity}
        setIsAddingSubjectivity={setIsAddingSubjectivity}
        newSubjectivityText={newSubjectivityText}
        setNewSubjectivityText={setNewSubjectivityText}
        showLibraryPicker={showLibraryPicker}
        setShowLibraryPicker={setShowLibraryPicker}
        librarySearchTerm={librarySearchTerm}
        setLibrarySearchTerm={setLibrarySearchTerm}
        filteredTemplates={filteredTemplates}
        subjectivityAppliesToPopoverId={subjectivityAppliesToPopoverId}
        setSubjectivityAppliesToPopoverId={setSubjectivityAppliesToPopoverId}
        cycleStatus={cycleStatus}
        StatusIcon={StatusIcon}
        onUpdateStatus={onUpdateStatus}
        onUpdateText={onUpdateText}
        onCreate={onCreate}
        onToggleLink={onToggleLink}
        onApplySelection={onApplySelection}
        onLinkFromLibrary={onLinkFromLibrary}
        handleLibraryPickerOpenChange={handleLibraryPickerOpenChange}
      />
    );
  }

  return (
    <SubmissionModeCollapsedView
      allSubmissionSubjectivities={allSubmissionSubjectivities}
      allOptions={allOptions}
      cycleStatus={cycleStatus}
      StatusIcon={StatusIcon}
      onUpdateStatus={onUpdateStatus}
      onApplySelection={onApplySelection}
      setExpandedCard={setExpandedCard}
    />
  );
}

/**
 * Submission Mode Expanded View - Full editing in submission scope
 */
function SubmissionModeExpandedView({
  allSubmissionSubjectivities,
  allOptions,
  allOptionIds,
  allPrimaryIds,
  allExcessIds,
  editingSubjId,
  setEditingSubjId,
  editingSubjText,
  setEditingSubjText,
  isAddingSubjectivity,
  setIsAddingSubjectivity,
  newSubjectivityText,
  setNewSubjectivityText,
  showLibraryPicker,
  setShowLibraryPicker,
  librarySearchTerm,
  setLibrarySearchTerm,
  filteredTemplates,
  subjectivityAppliesToPopoverId,
  setSubjectivityAppliesToPopoverId,
  cycleStatus,
  StatusIcon,
  onUpdateStatus,
  onUpdateText,
  onCreate,
  onToggleLink,
  onApplySelection,
  onLinkFromLibrary,
  handleLibraryPickerOpenChange,
}) {
  return (
    <div className="space-y-1">
      {allSubmissionSubjectivities.map((item) => {
        const isEditing = editingSubjId === item.id;
        const mutationId = item.rawId || item.id;
        const linkedQuoteIds = item.quoteIds?.map(String) || [];
        const linkedCount = linkedQuoteIds.length;
        const totalCount = allOptions.length;
        const isAllLinked = linkedCount === totalCount && totalCount > 0;

        return (
          <div
            key={item.id}
            className={`group flex items-center gap-2 text-sm rounded px-2 py-1.5 ${isEditing ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
          >
            {/* Status icon */}
            <button
              onClick={() => onUpdateStatus(mutationId, cycleStatus(item.status))}
              className="p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
              title={`Status: ${item.status || 'pending'} (click to change)`}
            >
              <StatusIcon status={item.status} />
            </button>

            {/* Subjectivity text - editable */}
            {isEditing ? (
              <input
                type="text"
                value={editingSubjText}
                onChange={(e) => setEditingSubjText(e.target.value)}
                onBlur={() => {
                  if (editingSubjText.trim() && editingSubjText !== item.label) {
                    onUpdateText(mutationId, editingSubjText);
                  }
                  setEditingSubjId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    if (editingSubjText.trim() && editingSubjText !== item.label) {
                      onUpdateText(mutationId, editingSubjText);
                    }
                    setEditingSubjId(null);
                  }
                }}
                className="flex-1 min-w-0 text-sm border-0 border-b border-purple-400 bg-transparent px-0 py-0 focus:outline-none focus:border-purple-600"
                autoFocus
              />
            ) : (
              <button
                onClick={() => {
                  setEditingSubjId(item.id);
                  setEditingSubjText(item.label);
                }}
                className="flex-1 min-w-0 text-left text-gray-700 hover:text-purple-700 cursor-pointer"
              >
                {item.label}
              </button>
            )}

            {/* Coverage badge with hover preview and popover */}
            <HoverCard.Root
              openDelay={300}
              closeDelay={100}
              open={subjectivityAppliesToPopoverId !== item.id ? undefined : false}
            >
              <HoverCard.Trigger asChild>
                <span>
                  <Popover.Root
                    open={subjectivityAppliesToPopoverId === item.id}
                    onOpenChange={(open) => setSubjectivityAppliesToPopoverId(open ? item.id : null)}
                    modal={false}
                  >
                    <Popover.Trigger asChild>
                      <button
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                          isAllLinked
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : linkedCount > 0
                            ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {isAllLinked ? (
                          `All ${totalCount} Options`
                        ) : linkedCount === 0 ? (
                          'No quotes'
                        ) : (
                          `${linkedCount}/${totalCount} Options`
                        )}
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                        sideOffset={4}
                        align="end"
                      >
                        <div className="text-xs font-medium text-gray-500 mb-2 px-1">Applies To</div>
                        {/* Quick select shortcuts */}
                        {(() => {
                          const linkedSet = new Set(linkedQuoteIds);
                          const isAllSelected = allOptionIds.every(id => linkedSet.has(id));
                          const isAllPrimarySelected = allPrimaryIds.length > 0 && allPrimaryIds.every(id => linkedSet.has(id));
                          const isAllExcessSelected = allExcessIds.length > 0 && allExcessIds.every(id => linkedSet.has(id));
                          return (
                            <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
                              <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
                                <input
                                  type="checkbox"
                                  checked={isAllSelected}
                                  onChange={() => {
                                    onApplySelection(mutationId, linkedQuoteIds, isAllSelected ? [] : allOptionIds);
                                  }}
                                  className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                />
                                <span>All Options</span>
                              </label>
                              {allPrimaryIds.length > 0 && (
                                <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={isAllPrimarySelected}
                                    onChange={() => {
                                      let newIds = isAllPrimarySelected
                                        ? linkedQuoteIds.filter(id => !allPrimaryIds.includes(id))
                                        : [...new Set([...linkedQuoteIds, ...allPrimaryIds])];
                                      onApplySelection(mutationId, linkedQuoteIds, newIds);
                                    }}
                                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                  />
                                  <span>All Primary</span>
                                </label>
                              )}
                              {allExcessIds.length > 0 && (
                                <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={isAllExcessSelected}
                                    onChange={() => {
                                      let newIds = isAllExcessSelected
                                        ? linkedQuoteIds.filter(id => !allExcessIds.includes(id))
                                        : [...new Set([...linkedQuoteIds, ...allExcessIds])];
                                      onApplySelection(mutationId, linkedQuoteIds, newIds);
                                    }}
                                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                  />
                                  <span>All Excess</span>
                                </label>
                              )}
                            </div>
                          );
                        })()}
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {allOptions.map(opt => {
                            const isLinked = linkedQuoteIds.includes(String(opt.id));
                            return (
                              <label
                                key={opt.id}
                                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                              >
                                <input
                                  type="checkbox"
                                  checked={isLinked}
                                  onChange={() => {
                                    onToggleLink(mutationId, opt.id, isLinked);
                                  }}
                                  className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                                />
                                <span className="truncate">{opt.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </span>
              </HoverCard.Trigger>
              <HoverCard.Portal>
                <HoverCard.Content
                  className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                  sideOffset={4}
                  align="end"
                >
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-1 px-1">Applies To</div>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {allOptions.filter(opt => linkedQuoteIds.includes(String(opt.id))).map(opt => (
                      <div key={opt.id} className="text-xs text-gray-600 flex items-center gap-1.5 px-1 py-0.5">
                        <span className="text-green-400">•</span>
                        <span className="truncate">{opt.name}</span>
                      </div>
                    ))}
                    {linkedQuoteIds.length === 0 && (
                      <div className="text-xs text-gray-400 italic px-1">No quotes linked</div>
                    )}
                  </div>
                  <HoverCard.Arrow className="fill-white" />
                </HoverCard.Content>
              </HoverCard.Portal>
            </HoverCard.Root>

            {/* Remove button */}
            <button
              onClick={() => {
                if (linkedQuoteIds.length > 0) {
                  onApplySelection(mutationId, linkedQuoteIds, []);
                }
              }}
              className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
              title="Remove from all quotes"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}

      {/* Add actions */}
      {isAddingSubjectivity ? (
        <div className="flex items-center gap-2 text-sm bg-green-50/50 rounded px-2 py-1 ring-1 ring-green-200 mt-2">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <input
            type="text"
            value={newSubjectivityText}
            onChange={(e) => setNewSubjectivityText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSubjectivityText.trim()) {
                onCreate(newSubjectivityText.trim());
              }
              if (e.key === 'Escape') {
                setIsAddingSubjectivity(false);
                setNewSubjectivityText('');
              }
            }}
            placeholder="Type new subjectivity text..."
            className="flex-1 text-sm border-0 border-b border-green-400 bg-transparent px-0 py-0 focus:outline-none focus:border-green-600"
            autoFocus
          />
          <button
            onClick={() => {
              if (newSubjectivityText.trim()) {
                onCreate(newSubjectivityText.trim());
              }
            }}
            disabled={!newSubjectivityText.trim()}
            className="text-[11px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => {
              setIsAddingSubjectivity(false);
              setNewSubjectivityText('');
            }}
            className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
          <button
            onClick={() => setIsAddingSubjectivity(true)}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Custom
          </button>
          <span className="text-gray-300">|</span>
          <Popover.Root open={showLibraryPicker} onOpenChange={handleLibraryPickerOpenChange}>
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
                    placeholder="Search templates..."
                    value={librarySearchTerm}
                    onChange={(e) => setLibrarySearchTerm(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {filteredTemplates.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      {librarySearchTerm ? 'No matching templates' : 'No templates available'}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {filteredTemplates.slice(0, 10).map(template => (
                        <button
                          key={template.id}
                          onClick={() => onLinkFromLibrary(template.id)}
                          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-purple-50 text-gray-700 hover:text-purple-700 truncate"
                        >
                          {template.text || template.subjectivity_text}
                        </button>
                      ))}
                      {filteredTemplates.length > 10 && (
                        <p className="text-[11px] text-gray-400 text-center py-1">
                          +{filteredTemplates.length - 10} more...
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

/**
 * Submission Mode Collapsed View - Summary display in submission scope
 */
function SubmissionModeCollapsedView({
  allSubmissionSubjectivities,
  allOptions,
  cycleStatus,
  StatusIcon,
  onUpdateStatus,
  onApplySelection,
  setExpandedCard,
}) {
  return (
    <div className="space-y-2">
      {allSubmissionSubjectivities.slice(0, 10).map((item) => {
        const linkedQuoteIds = item.quoteIds?.map(String) || [];
        const linkedCount = linkedQuoteIds.length;
        const totalCount = allOptions.length;
        const isAllLinked = linkedCount === totalCount && totalCount > 0;
        const mutationId = item.rawId || item.id;

        // Get linked and not-linked quotes for HoverCard
        const linkedQuotes = allOptions.filter(opt => linkedQuoteIds.includes(String(opt.id)));
        const notLinkedQuotes = allOptions.filter(opt => !linkedQuoteIds.includes(String(opt.id)));

        return (
          <div key={item.id} className="flex items-center gap-2 text-sm group hover:bg-gray-50 rounded px-1 -mx-1">
            <button
              onClick={() => onUpdateStatus(mutationId, cycleStatus(item.status))}
              className="p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
              title={`Status: ${item.status || 'pending'} (click to change)`}
            >
              <StatusIcon status={item.status} />
            </button>
            <button
              onClick={() => setExpandedCard('subjectivities')}
              className="flex-1 text-gray-700 hover:text-purple-700 truncate text-left cursor-pointer"
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
      {allSubmissionSubjectivities.length > 10 && (
        <button
          onClick={() => setExpandedCard('subjectivities')}
          className="text-xs text-purple-600 hover:text-purple-700"
        >
          +{allSubmissionSubjectivities.length - 10} more...
        </button>
      )}
    </div>
  );
}

/**
 * Quote Mode Expanded Content - Full editing for single quote
 */
function QuoteModeExpandedContent({
  subjectivities,
  missingSubjectivities,
  uniqueSubjectivities,
  alignedSubjectivities,
  peerLabel,
  showMissingSuggestions,
  allOptions,
  allOptionIds,
  allPrimaryIds,
  allExcessIds,
  structureId,
  editingSubjId,
  setEditingSubjId,
  editingSubjText,
  setEditingSubjText,
  isAddingSubjectivity,
  setIsAddingSubjectivity,
  newSubjectivityText,
  setNewSubjectivityText,
  showLibraryPicker,
  setShowLibraryPicker,
  librarySearchTerm,
  setLibrarySearchTerm,
  filteredTemplates,
  appliesToPopoverId,
  setAppliesToPopoverId,
  cycleStatus,
  StatusIcon,
  getSharedQuoteCount,
  onUpdateStatus,
  onUpdateText,
  onCreate,
  onUnlink,
  onToggleLink,
  onApplySelection,
  onRestore,
  onLinkFromLibrary,
  setExpandedCard,
  handleLibraryPickerOpenChange,
}) {
  const allSubjectivities = [...uniqueSubjectivities, ...alignedSubjectivities];

  const navigateToItem = (currentIndex, targetIndex, currentItem) => {
    const mutationId = currentItem.rawId || currentItem.id;
    // Save current if changed
    if (editingSubjText.trim() && editingSubjText !== currentItem.label) {
      onUpdateText(mutationId, editingSubjText);
    }
    // Move to target item
    const targetItem = allSubjectivities[targetIndex];
    if (targetItem) {
      setEditingSubjId(targetItem.id);
      setEditingSubjText(targetItem.label);
    }
  };

  return (
    <div className="space-y-1">
      {/* Missing from peers - controlled by Show Missing toggle */}
      {showMissingSuggestions && missingSubjectivities.length > 0 && (
        <div className="mb-3 pb-3 border-b border-dashed border-amber-200">
          <div className="text-[10px] text-amber-600 font-semibold uppercase tracking-wide mb-2">
            Missing from {peerLabel} peers ({missingSubjectivities.length})
          </div>
          {missingSubjectivities.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 text-sm border border-dashed border-amber-300 rounded px-2 py-1 bg-amber-50/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-gray-700 truncate">{item.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 flex-shrink-0">
                  On peers
                </span>
              </div>
              <button
                onClick={() => onRestore(item.id)}
                className="text-[11px] px-2 py-1 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 flex-shrink-0"
              >
                + Add
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Existing subjectivities - editable */}
      {allSubjectivities.map((item, index) => {
        const isEditing = editingSubjId === item.id;
        const sharedCount = getSharedQuoteCount?.(item) || 0;
        const mutationId = item.rawId || item.id;

        return (
          <div
            key={item.id}
            className="flex items-center gap-2 text-sm rounded px-2 py-1 group hover:bg-gray-50"
          >
            {/* Status Icon - Click to cycle */}
            <button
              onClick={() => onUpdateStatus(mutationId, cycleStatus(item.status))}
              className="p-1 rounded hover:bg-white transition-colors flex-shrink-0"
              title={`Status: ${item.status || 'pending'} (click to change)`}
            >
              <StatusIcon status={item.status} />
            </button>

            {/* Text - Click to edit, blur to save */}
            {isEditing ? (
              <input
                type="text"
                value={editingSubjText}
                onChange={(e) => setEditingSubjText(e.target.value)}
                onBlur={() => {
                  if (editingSubjText.trim() && editingSubjText !== item.label) {
                    onUpdateText(mutationId, editingSubjText);
                  }
                  setEditingSubjId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                    e.preventDefault();
                    const nextIndex = index < allSubjectivities.length - 1 ? index + 1 : 0;
                    navigateToItem(index, nextIndex, item);
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    if (editingSubjText.trim() && editingSubjText !== item.label) {
                      onUpdateText(mutationId, editingSubjText);
                    }
                    setEditingSubjId(null);
                    setExpandedCard(null);
                    setIsAddingSubjectivity(false);
                    setShowLibraryPicker(false);
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const nextIndex = index < allSubjectivities.length - 1 ? index + 1 : 0;
                    navigateToItem(index, nextIndex, item);
                  }
                  if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
                    e.preventDefault();
                    const prevIndex = index > 0 ? index - 1 : allSubjectivities.length - 1;
                    navigateToItem(index, prevIndex, item);
                  }
                }}
                className="flex-1 text-sm border-0 border-b border-purple-400 bg-transparent px-0 py-0 focus:outline-none focus:border-purple-600"
                autoFocus
              />
            ) : (
              <button
                onClick={() => {
                  setEditingSubjId(item.id);
                  setEditingSubjText(item.label);
                }}
                className="flex-1 text-left text-gray-700 hover:text-purple-700 truncate"
              >
                {item.label}
              </button>
            )}

            {/* Applies To Popover */}
            <Popover.Root
              open={appliesToPopoverId === item.id}
              onOpenChange={(open) => setAppliesToPopoverId(open ? item.id : null)}
              modal={false}
            >
              <Popover.Trigger asChild>
                <button
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    sharedCount > 0
                      ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                      : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
                  }`}
                  title="Click to manage which quotes this applies to"
                >
                  {sharedCount > 0 ? `On ${sharedCount + 1} quotes` : 'Only here'}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                  sideOffset={4}
                  align="end"
                >
                  <div className="text-xs font-medium text-gray-500 mb-2 px-1">Applies To</div>
                  {/* Quick select checkboxes */}
                  {(() => {
                    const linkedIds = item.quoteIds?.map(String) || [];
                    const linkedSet = new Set(linkedIds);
                    const isAllSelected = allOptionIds.every(id => linkedSet.has(id));
                    const isAllPrimarySelected = allPrimaryIds.length > 0 && allPrimaryIds.every(id => linkedSet.has(id));
                    const isAllExcessSelected = allExcessIds.length > 0 && allExcessIds.every(id => linkedSet.has(id));
                    return (
                      <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
                        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              const currentId = String(structureId);
                              onApplySelection(mutationId, linkedIds, isAllSelected ? [currentId] : allOptionIds);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                          />
                          <span>All Options</span>
                        </label>
                        {allPrimaryIds.length > 0 && (
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                            <input
                              type="checkbox"
                              checked={isAllPrimarySelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                const currentId = String(structureId);
                                let newIds = isAllPrimarySelected
                                  ? linkedIds.filter(id => !allPrimaryIds.includes(id))
                                  : [...new Set([...linkedIds, ...allPrimaryIds])];
                                if (!newIds.includes(currentId)) newIds = [...newIds, currentId];
                                onApplySelection(mutationId, linkedIds, newIds);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                            />
                            <span>All Primary</span>
                          </label>
                        )}
                        {allExcessIds.length > 0 && (
                          <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                            <input
                              type="checkbox"
                              checked={isAllExcessSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                const currentId = String(structureId);
                                let newIds = isAllExcessSelected
                                  ? linkedIds.filter(id => !allExcessIds.includes(id))
                                  : [...new Set([...linkedIds, ...allExcessIds])];
                                if (!newIds.includes(currentId)) newIds = [...newIds, currentId];
                                onApplySelection(mutationId, linkedIds, newIds);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                            />
                            <span>All Excess</span>
                          </label>
                        )}
                      </div>
                    );
                  })()}
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {allOptions.map(opt => {
                      const isLinked = item.quoteIds?.map(String).includes(String(opt.id));
                      const isCurrent = String(opt.id) === String(structureId);
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded ${
                            isCurrent ? 'text-purple-700 font-medium' : 'text-gray-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={(e) => {
                              e.stopPropagation();
                              onToggleLink(mutationId, opt.id, isLinked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                          />
                          <span className="truncate">{opt.name}</span>
                          {isCurrent && <span className="text-[9px] text-purple-500">(current)</span>}
                        </label>
                      );
                    })}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            {/* Remove button - always visible */}
            <button
              onClick={() => onUnlink(mutationId)}
              className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              title="Remove from this quote"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}

      {/* Add new subjectivity row */}
      {isAddingSubjectivity ? (
        <div className="flex items-center gap-2 text-sm bg-green-50/50 rounded px-2 py-1 ring-1 ring-green-200">
          <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <input
            type="text"
            value={newSubjectivityText}
            onChange={(e) => setNewSubjectivityText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSubjectivityText.trim()) {
                onCreate(newSubjectivityText.trim());
              }
              if (e.key === 'Escape') {
                setIsAddingSubjectivity(false);
                setNewSubjectivityText('');
              }
            }}
            placeholder="Type new subjectivity text..."
            className="flex-1 text-sm border-0 border-b border-green-400 bg-transparent px-0 py-0 focus:outline-none focus:border-green-600"
            autoFocus
          />
          <button
            onClick={() => {
              if (newSubjectivityText.trim()) {
                onCreate(newSubjectivityText.trim());
              }
            }}
            disabled={!newSubjectivityText.trim()}
            className="text-[11px] px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => {
              setIsAddingSubjectivity(false);
              setNewSubjectivityText('');
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
            onClick={() => setIsAddingSubjectivity(true)}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Custom
          </button>
          <span className="text-gray-300">|</span>
          <Popover.Root open={showLibraryPicker} onOpenChange={handleLibraryPickerOpenChange}>
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
                    placeholder="Search templates..."
                    value={librarySearchTerm}
                    onChange={(e) => setLibrarySearchTerm(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {filteredTemplates.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      {librarySearchTerm ? 'No matching templates' : 'No templates available'}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {filteredTemplates.slice(0, 10).map(template => (
                        <button
                          key={template.id}
                          onClick={() => onLinkFromLibrary(template.id)}
                          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-purple-50 text-gray-700 hover:text-purple-700 truncate"
                        >
                          {template.text || template.subjectivity_text}
                        </button>
                      ))}
                      {filteredTemplates.length > 10 && (
                        <p className="text-[11px] text-gray-400 text-center py-1">
                          +{filteredTemplates.length - 10} more...
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

/**
 * Quote Mode Collapsed Content - Summary display for single quote
 */
function QuoteModeCollapsedContent({
  missingSubjectivities,
  uniqueSubjectivities,
  alignedSubjectivities,
  showMissingSuggestions,
  cycleStatus,
  StatusIcon,
  onUpdateStatus,
  onRestore,
  setExpandedCard,
  setEditingSubjId,
  setEditingSubjText,
}) {
  return (
    <div className="space-y-2">
      {showMissingSuggestions && missingSubjectivities.map((item) => (
        <div
          key={item.id}
          onClick={() => onRestore(item.id)}
          className="flex items-center justify-between gap-2 text-sm border border-dashed border-amber-300 rounded px-2 py-1.5 bg-amber-50/50"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-gray-700 truncate">{item.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600">
              On peers
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRestore(item.id); }}
            className="text-[11px] px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:text-gray-900"
          >
            + Add
          </button>
        </div>
      ))}
      {uniqueSubjectivities.map((item) => {
        const mutationId = item.rawId || item.id;
        return (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <button
              onClick={() => onUpdateStatus(mutationId, cycleStatus(item.status))}
              className="p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
              title={`Status: ${item.status || 'pending'} (click to change)`}
            >
              <StatusIcon status={item.status} />
            </button>
            <button
              onClick={() => {
                setExpandedCard('subjectivities');
                setEditingSubjId(item.id);
                setEditingSubjText(item.label);
              }}
              className="text-gray-700 hover:text-purple-700 text-left truncate flex-1"
            >
              {item.label}
            </button>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 flex-shrink-0">
              Only here
            </span>
          </div>
        );
      })}
      {alignedSubjectivities.map((item) => {
        const mutationId = item.rawId || item.id;
        return (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <button
              onClick={() => onUpdateStatus(mutationId, cycleStatus(item.status))}
              className="p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
              title={`Status: ${item.status || 'pending'} (click to change)`}
            >
              <StatusIcon status={item.status} />
            </button>
            <button
              onClick={() => {
                setExpandedCard('subjectivities');
                setEditingSubjId(item.id);
                setEditingSubjText(item.label);
              }}
              className="text-gray-700 hover:text-purple-700 text-left truncate flex-1"
            >
              {item.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
