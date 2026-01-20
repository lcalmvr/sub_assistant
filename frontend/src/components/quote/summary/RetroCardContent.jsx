import * as Popover from '@radix-ui/react-popover';
import * as HoverCard from '@radix-ui/react-hover-card';
import RetroScheduleEditor from '../../RetroSelector';
import RetroPanel from './RetroPanel';
import { formatRetroSummary } from '../../../utils/quoteUtils';

/**
 * RetroCardContent - Retro Dates KPI Card
 *
 * Presentation component for the retro dates card in the KPI row.
 * All state and handlers are passed as props from SummaryTabContent.
 */
export default function RetroCardContent({
  // Data
  structure,
  submission,
  summaryScope,
  retroVariationGroups,
  allQuoteRetros,
  // Expand state
  expandedCard,
  setExpandedCard,
  retroCardRef,
  // Editing state
  editingRetroKey,
  setEditingRetroKey,
  inlineEditRetroSchedule,
  setInlineEditRetroSchedule,
  // Adding state
  isAddingRetro,
  setIsAddingRetro,
  inlineNewRetroSchedule,
  setInlineNewRetroSchedule,
  newRetroSelectedQuotes,
  setNewRetroSelectedQuotes,
  // Popover state
  retroAppliesToPopoverId,
  setRetroAppliesToPopoverId,
  showRetroApplyPopover,
  setShowRetroApplyPopover,
  // Quote mode specific
  retroMatchingPeerIds,
  allOptionIds,
  allPrimaryIds,
  allExcessIds,
  allOptions,
  structureId,
  // Mutation handlers
  onApplyRetroSelection,
  onApplyRetroToQuotes,
}) {
  const isExpanded = expandedCard === 'retro';

  return (
    <div
      ref={retroCardRef}
      className={`bg-white rounded-lg border transition-all ${
        isExpanded
          ? 'border-purple-300 ring-1 ring-purple-100'
          : 'border-gray-200 hover:border-gray-300 cursor-pointer'
      }`}
      onClick={() => !isExpanded && setExpandedCard('retro')}
    >
      {/* Header - bold with border when in submission mode */}
      {summaryScope === 'submission' && !isExpanded ? (
        <SubmissionModeCollapsed
          retroVariationGroups={retroVariationGroups}
          allQuoteRetros={allQuoteRetros}
          setExpandedCard={setExpandedCard}
          onApplyRetroSelection={onApplyRetroSelection}
        />
      ) : (
        <QuoteModeHeader
          isExpanded={isExpanded}
          summaryScope={summaryScope}
          retroVariationGroups={retroVariationGroups}
          allQuoteRetros={allQuoteRetros}
          structure={structure}
          setExpandedCard={setExpandedCard}
          showRetroApplyPopover={showRetroApplyPopover}
          setShowRetroApplyPopover={setShowRetroApplyPopover}
          retroMatchingPeerIds={retroMatchingPeerIds}
          allOptionIds={allOptionIds}
          allPrimaryIds={allPrimaryIds}
          allExcessIds={allExcessIds}
          allOptions={allOptions}
          structureId={structureId}
          onApplyRetroToQuotes={onApplyRetroToQuotes}
        />
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4">
          {summaryScope === 'submission' ? (
            <SubmissionModeExpanded
              retroVariationGroups={retroVariationGroups}
              allQuoteRetros={allQuoteRetros}
              editingRetroKey={editingRetroKey}
              setEditingRetroKey={setEditingRetroKey}
              inlineEditRetroSchedule={inlineEditRetroSchedule}
              setInlineEditRetroSchedule={setInlineEditRetroSchedule}
              isAddingRetro={isAddingRetro}
              setIsAddingRetro={setIsAddingRetro}
              inlineNewRetroSchedule={inlineNewRetroSchedule}
              setInlineNewRetroSchedule={setInlineNewRetroSchedule}
              newRetroSelectedQuotes={newRetroSelectedQuotes}
              setNewRetroSelectedQuotes={setNewRetroSelectedQuotes}
              retroAppliesToPopoverId={retroAppliesToPopoverId}
              setRetroAppliesToPopoverId={setRetroAppliesToPopoverId}
              onApplyRetroSelection={onApplyRetroSelection}
            />
          ) : (
            <RetroPanel structure={structure} submissionId={submission?.id} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUBMISSION MODE COLLAPSED
// ============================================================================

function SubmissionModeCollapsed({
  retroVariationGroups,
  allQuoteRetros,
  setExpandedCard,
  onApplyRetroSelection,
}) {
  return (
    <>
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 rounded-t-lg">
        <h3 className="text-xs font-bold text-gray-500 uppercase">Retro</h3>
      </div>
      <div className="px-4 py-3 divide-y divide-gray-100">
        {retroVariationGroups.length === 1 ? (
          <SingleRetroDisplay group={retroVariationGroups[0]} />
        ) : retroVariationGroups.map((group) => (
          <MultiRetroRow
            key={group.key}
            group={group}
            allQuoteRetros={allQuoteRetros}
            setExpandedCard={setExpandedCard}
            onApplyRetroSelection={onApplyRetroSelection}
          />
        ))}
      </div>
    </>
  );
}

function SingleRetroDisplay({ group }) {
  const schedule = group?.schedule || [];
  const uniqueRetros = new Set(schedule.map(e => e.retro));
  const isSimple = schedule.length === 0 || uniqueRetros.size === 1;

  if (isSimple) {
    return <div className="text-sm font-medium text-gray-700">{group?.label}</div>;
  }
  return (
    <div className="text-xs text-gray-700 space-y-0.5">
      {schedule.map(entry => {
        const covLabel = { cyber: 'Cyber', tech_eo: 'Tech E&O', do: 'D&O', epl: 'EPL', fiduciary: 'Fiduciary', media: 'Media' }[entry.coverage] || entry.coverage;
        const retroLabel = entry.retro === 'full_prior_acts' ? 'Full Prior Acts' : entry.retro === 'inception' ? 'Inception' : entry.retro === 'follow_form' ? 'Follow Form' : entry.retro;
        return <div key={entry.coverage}><span className="text-gray-400">{covLabel}:</span> {retroLabel}</div>;
      })}
    </div>
  );
}

function MultiRetroRow({ group, allQuoteRetros, setExpandedCard, onApplyRetroSelection }) {
  const schedule = group.schedule || [];
  const quotesInGroup = allQuoteRetros.filter(r => r.key === group.key);
  const quotesNotInGroup = allQuoteRetros.filter(r => r.key !== group.key);

  return (
    <div className="flex items-start justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
      <div className="text-xs text-gray-700 space-y-0.5">
        {schedule.length === 0 ? (
          <div>Full Prior Acts</div>
        ) : (
          schedule.map(entry => {
            const covLabel = { cyber: 'Cyber', tech_eo: 'Tech E&O', do: 'D&O', epl: 'EPL', fiduciary: 'Fiduciary' }[entry.coverage] || entry.coverage;
            const retro = formatRetroLabel(entry);
            return <div key={entry.coverage}><span className="text-gray-400">{covLabel}:</span> {retro}</div>;
          })
        )}
      </div>
      <HoverCard.Root openDelay={200} closeDelay={100}>
        <HoverCard.Trigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpandedCard('retro'); }}
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors shrink-0"
          >
            {group.count}/{allQuoteRetros.length}
          </button>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3" sideOffset={4}>
            {quotesInGroup.length > 0 && (
              <>
                <div className="text-[10px] text-green-600 uppercase tracking-wide font-semibold mb-1">On ({quotesInGroup.length})</div>
                <div className="space-y-0.5 mb-3">
                  {quotesInGroup.map(qr => (
                    <button key={qr.quoteId} onClick={(e) => { e.stopPropagation(); setExpandedCard('retro'); }}
                      className="w-full text-left text-xs text-gray-700 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-red-50 hover:text-red-700 transition-colors group/item">
                      <span className="text-green-400 group-hover/item:text-red-400">•</span>
                      <span className="flex-1 truncate">{qr.quoteName}</span>
                      <span className="text-[10px] text-gray-400 group-hover/item:text-red-500 opacity-0 group-hover/item:opacity-100">−</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {quotesNotInGroup.length > 0 && (
              <>
                <div className="text-[10px] text-amber-600 uppercase tracking-wide font-semibold mb-1">Not On ({quotesNotInGroup.length})</div>
                <div className="space-y-0.5">
                  {quotesNotInGroup.map(qr => (
                    <button
                      key={qr.quoteId}
                      onClick={(e) => {
                        e.stopPropagation();
                        onApplyRetroSelection({ schedule: group.schedule, quoteId: qr.quoteId });
                      }}
                      className="w-full text-left text-xs text-gray-500 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-green-50 hover:text-green-700 transition-colors group/item"
                    >
                      <span className="text-amber-400 group-hover/item:text-green-400">•</span>
                      <span className="flex-1 truncate">{qr.quoteName}</span>
                      <span className="text-[10px] text-gray-400 group-hover/item:text-green-500 opacity-0 group-hover/item:opacity-100">+</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <HoverCard.Arrow className="fill-white" />
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    </div>
  );
}

// ============================================================================
// QUOTE MODE HEADER
// ============================================================================

function QuoteModeHeader({
  isExpanded,
  summaryScope,
  retroVariationGroups,
  allQuoteRetros,
  structure,
  setExpandedCard,
  showRetroApplyPopover,
  setShowRetroApplyPopover,
  retroMatchingPeerIds,
  allOptionIds,
  allPrimaryIds,
  allExcessIds,
  allOptions,
  structureId,
  onApplyRetroToQuotes,
}) {
  return (
    <div className={`flex items-center justify-between ${isExpanded ? 'px-4 py-2 border-b border-gray-100' : 'px-3 py-2'}`}>
      <div className={isExpanded ? '' : 'w-full text-center'}>
        <div className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Retro</div>
        {!isExpanded && (
          summaryScope === 'submission' ? (
            <SubmissionModeCompactDisplay
              retroVariationGroups={retroVariationGroups}
              allQuoteRetros={allQuoteRetros}
              setExpandedCard={setExpandedCard}
            />
          ) : (
            <div className="text-sm font-bold text-gray-800">
              {formatRetroSummary(structure?.retro_schedule)}
            </div>
          )
        )}
      </div>
      {isExpanded && (
        <div className="flex items-center gap-2">
          {summaryScope !== 'submission' && (
            <QuoteModeApplyPopover
              showRetroApplyPopover={showRetroApplyPopover}
              setShowRetroApplyPopover={setShowRetroApplyPopover}
              retroMatchingPeerIds={retroMatchingPeerIds}
              allOptionIds={allOptionIds}
              allPrimaryIds={allPrimaryIds}
              allExcessIds={allExcessIds}
              allOptions={allOptions}
              structureId={structureId}
              onApplyRetroToQuotes={onApplyRetroToQuotes}
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedCard(null); }}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function SubmissionModeCompactDisplay({ retroVariationGroups, allQuoteRetros, setExpandedCard }) {
  if (retroVariationGroups.length === 1) {
    const group = retroVariationGroups[0];
    const schedule = group?.schedule || [];
    const uniqueRetros = new Set(schedule.map(e => e.retro));
    const isSimple = schedule.length === 0 || uniqueRetros.size === 1;

    if (isSimple) {
      return <span className="text-sm font-semibold text-gray-800">{group?.label}</span>;
    }
    return (
      <div className="text-xs text-gray-700 space-y-0.5">
        {schedule.map(entry => {
          const covLabel = { cyber: 'Cyber', tech_eo: 'Tech E&O', do: 'D&O', epl: 'EPL', fiduciary: 'Fiduciary', media: 'Media' }[entry.coverage] || entry.coverage;
          const retroLabel = entry.retro === 'full_prior_acts' ? 'Full Prior Acts' : entry.retro === 'inception' ? 'Inception' : entry.retro === 'follow_form' ? 'Follow Form' : entry.retro;
          return <div key={entry.coverage}><span className="text-gray-500">{covLabel}:</span> {retroLabel}</div>;
        })}
      </div>
    );
  }

  // Multiple retro configs - show first with badge
  const group = retroVariationGroups[0];
  const schedule = group?.schedule || [];
  const uniqueRetros = new Set(schedule.map(e => e.retro));
  const isSimple = schedule.length === 0 || uniqueRetros.size === 1;

  return (
    <div className="flex flex-col items-center gap-0.5">
      {isSimple ? (
        <span className="text-sm font-semibold text-gray-800">{group?.label}</span>
      ) : (
        <div className="text-xs text-gray-700 space-y-0.5">
          {schedule.map(entry => {
            const covLabel = { cyber: 'Cyber', tech_eo: 'Tech E&O', do: 'D&O', epl: 'EPL', fiduciary: 'Fiduciary', media: 'Media' }[entry.coverage] || entry.coverage;
            const retroLabel = entry.retro === 'full_prior_acts' ? 'Full Prior Acts' : entry.retro === 'inception' ? 'Inception' : entry.retro === 'follow_form' ? 'Follow Form' : entry.retro;
            return <div key={entry.coverage}><span className="text-gray-500">{covLabel}:</span> {retroLabel}</div>;
          })}
        </div>
      )}
      <HoverCard.Root openDelay={200} closeDelay={100}>
        <HoverCard.Trigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpandedCard('retro'); }}
            className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-colors"
          >
            +{retroVariationGroups.length - 1} more
          </button>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content
            className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3"
            sideOffset={4}
          >
            <div className="text-[10px] text-green-600 uppercase tracking-wide font-semibold mb-1">On ({allQuoteRetros.length})</div>
            <div className="space-y-0.5">
              {allQuoteRetros.map(qr => (
                <button
                  key={qr.quoteId}
                  onClick={(e) => { e.stopPropagation(); setExpandedCard('retro'); }}
                  className="w-full text-left text-xs text-gray-700 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-red-50 hover:text-red-700 transition-colors group/item"
                >
                  <span className="text-green-400 group-hover/item:text-red-400">•</span>
                  <span className="flex-1 truncate">{qr.quoteName}</span>
                  <span className="text-[10px] text-gray-400 group-hover/item:text-red-500 opacity-0 group-hover/item:opacity-100">−</span>
                </button>
              ))}
            </div>
            <HoverCard.Arrow className="fill-white" />
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    </div>
  );
}

function QuoteModeApplyPopover({
  showRetroApplyPopover,
  setShowRetroApplyPopover,
  retroMatchingPeerIds,
  allOptionIds,
  allPrimaryIds,
  allExcessIds,
  allOptions,
  structureId,
  onApplyRetroToQuotes,
}) {
  const otherIds = allOptionIds.filter(id => id !== String(structureId));
  const otherPrimaryIds = allPrimaryIds.filter(id => id !== String(structureId));
  const otherExcessIds = allExcessIds.filter(id => id !== String(structureId));
  const isAllSelected = otherIds.every(id => retroMatchingPeerIds.includes(id));
  const isAllPrimarySelected = otherPrimaryIds.length > 0 && otherPrimaryIds.every(id => retroMatchingPeerIds.includes(id));
  const isAllExcessSelected = otherExcessIds.length > 0 && otherExcessIds.every(id => retroMatchingPeerIds.includes(id));

  return (
    <Popover.Root open={showRetroApplyPopover} onOpenChange={setShowRetroApplyPopover}>
      <Popover.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
            retroMatchingPeerIds.length > 0
              ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
              : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
          }`}
        >
          {retroMatchingPeerIds.length > 0 ? `On ${retroMatchingPeerIds.length + 1} quotes` : 'Only here'}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
          sideOffset={4}
          align="end"
        >
          <div className="text-xs font-medium text-gray-500 mb-2 px-1">Apply to</div>
          <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
            <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  if (!isAllSelected) {
                    onApplyRetroToQuotes(otherIds);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                disabled={isAllSelected}
              />
              <span>All Options</span>
            </label>
            {otherPrimaryIds.length > 0 && (
              <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                <input
                  type="checkbox"
                  checked={isAllPrimarySelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (!isAllPrimarySelected) {
                      onApplyRetroToQuotes(otherPrimaryIds);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                  disabled={isAllPrimarySelected}
                />
                <span>All Primary</span>
              </label>
            )}
            {otherExcessIds.length > 0 && (
              <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
                <input
                  type="checkbox"
                  checked={isAllExcessSelected}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (!isAllExcessSelected) {
                      onApplyRetroToQuotes(otherExcessIds);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                  disabled={isAllExcessSelected}
                />
                <span>All Excess</span>
              </label>
            )}
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {allOptions.filter(opt => opt.id !== String(structureId)).map(opt => {
              const isMatching = retroMatchingPeerIds.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                >
                  <input
                    type="checkbox"
                    checked={isMatching}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (!isMatching) {
                        onApplyRetroToQuotes([opt.id]);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                    disabled={isMatching}
                  />
                  <span className="truncate">{opt.name}</span>
                  {isMatching && <span className="text-[9px] text-green-500 ml-auto">Matching</span>}
                </label>
              );
            })}
          </div>
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ============================================================================
// SUBMISSION MODE EXPANDED
// ============================================================================

function SubmissionModeExpanded({
  retroVariationGroups,
  allQuoteRetros,
  editingRetroKey,
  setEditingRetroKey,
  inlineEditRetroSchedule,
  setInlineEditRetroSchedule,
  isAddingRetro,
  setIsAddingRetro,
  inlineNewRetroSchedule,
  setInlineNewRetroSchedule,
  newRetroSelectedQuotes,
  setNewRetroSelectedQuotes,
  retroAppliesToPopoverId,
  setRetroAppliesToPopoverId,
  onApplyRetroSelection,
}) {
  return (
    <div className="space-y-2">
      {retroVariationGroups.map((group) => {
        const quotesInGroup = allQuoteRetros.filter(r => r.key === group.key);
        const isEditing = editingRetroKey === group.key;

        return (
          <div
            key={group.key}
            className={`rounded-lg transition-colors ${
              isEditing ? 'bg-purple-50/50 p-3' : 'px-2 py-1.5 hover:bg-gray-50'
            }`}
          >
            {isEditing ? (
              <EditingRetroRow
                group={group}
                quotesInGroup={quotesInGroup}
                allQuoteRetros={allQuoteRetros}
                inlineEditRetroSchedule={inlineEditRetroSchedule}
                setInlineEditRetroSchedule={setInlineEditRetroSchedule}
                setEditingRetroKey={setEditingRetroKey}
                retroAppliesToPopoverId={retroAppliesToPopoverId}
                setRetroAppliesToPopoverId={setRetroAppliesToPopoverId}
                onApplyRetroSelection={onApplyRetroSelection}
              />
            ) : (
              <DisplayRetroRow
                group={group}
                quotesInGroup={quotesInGroup}
                allQuoteRetros={allQuoteRetros}
                setEditingRetroKey={setEditingRetroKey}
                setInlineEditRetroSchedule={setInlineEditRetroSchedule}
                retroAppliesToPopoverId={retroAppliesToPopoverId}
                setRetroAppliesToPopoverId={setRetroAppliesToPopoverId}
                onApplyRetroSelection={onApplyRetroSelection}
              />
            )}
          </div>
        );
      })}

      {/* Add New Retro section */}
      <AddNewRetroSection
        allQuoteRetros={allQuoteRetros}
        isAddingRetro={isAddingRetro}
        setIsAddingRetro={setIsAddingRetro}
        inlineNewRetroSchedule={inlineNewRetroSchedule}
        setInlineNewRetroSchedule={setInlineNewRetroSchedule}
        newRetroSelectedQuotes={newRetroSelectedQuotes}
        setNewRetroSelectedQuotes={setNewRetroSelectedQuotes}
        onApplyRetroSelection={onApplyRetroSelection}
      />
    </div>
  );
}

function EditingRetroRow({
  group,
  quotesInGroup,
  allQuoteRetros,
  inlineEditRetroSchedule,
  setInlineEditRetroSchedule,
  setEditingRetroKey,
  retroAppliesToPopoverId,
  setRetroAppliesToPopoverId,
  onApplyRetroSelection,
}) {
  return (
    <div className="space-y-3">
      <RetroScheduleEditor
        schedule={inlineEditRetroSchedule}
        onChange={setInlineEditRetroSchedule}
        showHeader={true}
        showEmptyState={true}
        addButtonText="+ Add Restriction"
        compact={false}
      />
      <div className="flex items-center justify-between pt-2 border-t border-purple-100">
        <AppliesToPopoverInline
          groupKey={group.key}
          quotesInGroup={quotesInGroup}
          allQuoteRetros={allQuoteRetros}
          retroAppliesToPopoverId={retroAppliesToPopoverId}
          setRetroAppliesToPopoverId={setRetroAppliesToPopoverId}
          onApplyRetroSelection={(quoteId) => onApplyRetroSelection({ schedule: inlineEditRetroSchedule, quoteId })}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            quotesInGroup.forEach(qt => {
              onApplyRetroSelection({ schedule: inlineEditRetroSchedule, quoteId: qt.quoteId });
            });
            setEditingRetroKey(null);
            setInlineEditRetroSchedule([]);
          }}
          className="text-xs text-purple-600 hover:text-purple-700 font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function DisplayRetroRow({
  group,
  quotesInGroup,
  allQuoteRetros,
  setEditingRetroKey,
  setInlineEditRetroSchedule,
  retroAppliesToPopoverId,
  setRetroAppliesToPopoverId,
  onApplyRetroSelection,
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setInlineEditRetroSchedule([...group.schedule]);
          setEditingRetroKey(group.key);
        }}
        className="flex-1 text-left text-gray-700 hover:text-purple-700 cursor-pointer"
      >
        {group.schedule.length === 0 ? (
          <div>Full Prior Acts</div>
        ) : (
          <div className="space-y-0.5">
            {group.schedule.map(entry => {
              const covLabel = { cyber: 'Cyber', tech_eo: 'Tech E&O', do: 'D&O', epl: 'EPL', fiduciary: 'Fiduciary', media: 'Media' }[entry.coverage] || entry.coverage;
              const retroLabel = formatRetroLabel(entry);
              return <div key={entry.coverage}><span className="text-gray-400">{covLabel}:</span> {retroLabel}</div>;
            })}
          </div>
        )}
      </button>
      <HoverCard.Root
        openDelay={300}
        closeDelay={100}
        open={retroAppliesToPopoverId !== group.key ? undefined : false}
      >
        <HoverCard.Trigger asChild>
          <span>
            <Popover.Root
              open={retroAppliesToPopoverId === group.key}
              onOpenChange={(open) => setRetroAppliesToPopoverId(open ? group.key : null)}
              modal={false}
            >
              <Popover.Trigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                    quotesInGroup.length === allQuoteRetros.length
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : quotesInGroup.length > 0
                      ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {quotesInGroup.length === allQuoteRetros.length ? `All ${allQuoteRetros.length} Options` : `${quotesInGroup.length}/${allQuoteRetros.length} Options`}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
                  sideOffset={4}
                  align="end"
                >
                  <div className="text-xs font-medium text-gray-500 mb-2 px-1">Applies To</div>
                  <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
                    <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
                      <input
                        type="checkbox"
                        checked={quotesInGroup.length === allQuoteRetros.length}
                        onChange={() => {
                          if (quotesInGroup.length !== allQuoteRetros.length) {
                            allQuoteRetros.forEach(qr => {
                              if (!quotesInGroup.some(q => q.quoteId === qr.quoteId)) {
                                onApplyRetroSelection({ schedule: group.schedule, quoteId: qr.quoteId });
                              }
                            });
                          }
                        }}
                        className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                      />
                      <span>All Options</span>
                    </label>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {allQuoteRetros.map(qr => {
                      const isLinked = quotesInGroup.some(q => q.quoteId === qr.quoteId);
                      return (
                        <label
                          key={qr.quoteId}
                          className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                        >
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={() => {
                              if (!isLinked) {
                                onApplyRetroSelection({ schedule: group.schedule, quoteId: qr.quoteId });
                              }
                            }}
                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                          />
                          <span className="truncate">{qr.quoteName}</span>
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
              {quotesInGroup.map(qr => (
                <div key={qr.quoteId} className="text-xs text-gray-600 flex items-center gap-1.5 px-1 py-0.5">
                  <span className="text-green-400">•</span>
                  <span className="truncate">{qr.quoteName}</span>
                </div>
              ))}
            </div>
            <HoverCard.Arrow className="fill-white" />
          </HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    </div>
  );
}

function AppliesToPopoverInline({
  groupKey,
  quotesInGroup,
  allQuoteRetros,
  retroAppliesToPopoverId,
  setRetroAppliesToPopoverId,
  onApplyRetroSelection,
}) {
  return (
    <Popover.Root
      open={retroAppliesToPopoverId === groupKey}
      onOpenChange={(open) => setRetroAppliesToPopoverId(open ? groupKey : null)}
      modal={false}
    >
      <Popover.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
            quotesInGroup.length === allQuoteRetros.length
              ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
              : quotesInGroup.length > 0
              ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}
        >
          {quotesInGroup.length === allQuoteRetros.length ? `All ${allQuoteRetros.length} Options` : `${quotesInGroup.length}/${allQuoteRetros.length} Options`}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
          sideOffset={4}
          align="start"
        >
          <div className="text-xs font-medium text-gray-500 mb-2 px-1">Applies To</div>
          <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
            <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
              <input
                type="checkbox"
                checked={quotesInGroup.length === allQuoteRetros.length}
                onChange={() => {
                  if (quotesInGroup.length !== allQuoteRetros.length) {
                    allQuoteRetros.forEach(qr => {
                      if (!quotesInGroup.some(q => q.quoteId === qr.quoteId)) {
                        onApplyRetroSelection(qr.quoteId);
                      }
                    });
                  }
                }}
                className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
              />
              <span>All Options</span>
            </label>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {allQuoteRetros.map(qr => {
              const isLinked = quotesInGroup.some(q => q.quoteId === qr.quoteId);
              return (
                <label
                  key={qr.quoteId}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                >
                  <input
                    type="checkbox"
                    checked={isLinked}
                    onChange={() => {
                      if (!isLinked) {
                        onApplyRetroSelection(qr.quoteId);
                      }
                    }}
                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                  />
                  <span className="truncate">{qr.quoteName}</span>
                </label>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AddNewRetroSection({
  allQuoteRetros,
  isAddingRetro,
  setIsAddingRetro,
  inlineNewRetroSchedule,
  setInlineNewRetroSchedule,
  newRetroSelectedQuotes,
  setNewRetroSelectedQuotes,
  onApplyRetroSelection,
}) {
  return (
    <div className="pt-2 border-t border-gray-100 mt-2">
      {isAddingRetro ? (
        <div className="bg-purple-50/50 rounded-lg p-3 space-y-3">
          <RetroScheduleEditor
            schedule={inlineNewRetroSchedule}
            onChange={setInlineNewRetroSchedule}
            showHeader={true}
            showEmptyState={true}
            addButtonText="+ Add Restriction"
            compact={false}
          />
          <div className="border-t border-purple-100 pt-2">
            <div className="text-xs font-medium text-gray-500 mb-2">Apply to:</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-purple-100/50 rounded px-1 py-0.5">
                <input
                  type="checkbox"
                  checked={newRetroSelectedQuotes.length === allQuoteRetros.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setNewRetroSelectedQuotes(allQuoteRetros.map(qr => qr.quoteId));
                    } else {
                      setNewRetroSelectedQuotes([]);
                    }
                  }}
                  className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                />
                <span className="font-medium text-gray-700">All Options</span>
              </label>
              {allQuoteRetros.map(qr => {
                const schedule = qr.schedule || [];
                const uniqueRetros = new Set(schedule.map(e => e.retro));
                const retroLabel = schedule.length === 0 ? 'Full Prior' :
                  uniqueRetros.size === 1 ? Array.from(uniqueRetros)[0] : 'Mixed';
                return (
                  <label key={qr.quoteId} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-purple-100/50 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={newRetroSelectedQuotes.includes(qr.quoteId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewRetroSelectedQuotes([...newRetroSelectedQuotes, qr.quoteId]);
                        } else {
                          setNewRetroSelectedQuotes(newRetroSelectedQuotes.filter(id => id !== qr.quoteId));
                        }
                      }}
                      className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                    />
                    <span className="truncate">{qr.quoteName}</span>
                    <span className="text-gray-400 ml-auto text-[10px]">{retroLabel}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (inlineNewRetroSchedule.length > 0 && newRetroSelectedQuotes.length > 0) {
                  newRetroSelectedQuotes.forEach(quoteId => {
                    onApplyRetroSelection({ schedule: inlineNewRetroSchedule, quoteId });
                  });
                  setIsAddingRetro(false);
                  setInlineNewRetroSchedule([]);
                  setNewRetroSelectedQuotes([]);
                }
              }}
              disabled={inlineNewRetroSchedule.length === 0 || newRetroSelectedQuotes.length === 0}
              className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAddingRetro(false);
                setInlineNewRetroSchedule([]);
                setNewRetroSelectedQuotes([]);
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsAddingRetro(true);
            setInlineNewRetroSchedule([]);
            setNewRetroSelectedQuotes([]);
          }}
          className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New Retro
        </button>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function formatRetroLabel(entry) {
  return entry.retro === 'full_prior_acts' ? 'Full Prior Acts'
    : entry.retro === 'inception' ? 'Inception'
    : entry.retro === 'follow_form' ? 'Follow Form'
    : entry.retro === 'date' ? entry.date
    : entry.retro === 'custom' ? (entry.custom_text || 'custom')
    : entry.retro;
}
