import * as Popover from '@radix-ui/react-popover';
import * as HoverCard from '@radix-ui/react-hover-card';
import PolicyTermEditor from '../../PolicyTermEditor';
import TermsPanel from './TermsPanel';
import { formatDate } from '../../../utils/quoteUtils';

// Note: TermsPanel is a small "smart" component that handles its own mutation.
// It's extracted separately since it has self-contained state.

/**
 * TermsCardContent - Policy Terms KPI Card
 *
 * Presentation component for the policy terms card in the KPI row.
 * All state and handlers are passed as props from SummaryTabContent.
 */
export default function TermsCardContent({
  // Data
  structure,
  variation,
  submission,
  summaryScope,
  termVariationGroups,
  allQuoteTerms,
  // Expand state
  expandedCard,
  setExpandedCard,
  termsCardRef,
  // Editing state
  editingTermKey,
  setEditingTermKey,
  editingTermEffective,
  setEditingTermEffective,
  editingTermExpiration,
  setEditingTermExpiration,
  editingTermDatesTbd,
  setEditingTermDatesTbd,
  // Adding state
  isAddingTerm,
  setIsAddingTerm,
  newTermEffective,
  setNewTermEffective,
  newTermExpiration,
  setNewTermExpiration,
  newTermDatesTbd,
  setNewTermDatesTbd,
  newTermSelectedQuotes,
  setNewTermSelectedQuotes,
  // Popover state
  termAppliesToPopoverId,
  setTermAppliesToPopoverId,
  // Mutation handler
  onApplyPolicyTerm,
}) {
  // Derived values
  const datesTbd = variation?.dates_tbd || false;
  const effDate = variation?.effective_date_override || structure?.effective_date || submission?.effective_date;
  const expDate = variation?.expiration_date_override || structure?.expiration_date || submission?.expiration_date;
  const isExpanded = expandedCard === 'terms';

  return (
    <div
      ref={termsCardRef}
      className={`bg-white rounded-lg border transition-all ${
        isExpanded
          ? 'border-purple-300 ring-1 ring-purple-100'
          : 'border-gray-200 hover:border-gray-300 cursor-pointer'
      }`}
      onClick={() => !isExpanded && setExpandedCard('terms')}
    >
      {/* Header - bold with border when in submission mode */}
      {summaryScope === 'submission' && !isExpanded ? (
        <>
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 rounded-t-lg">
            <h3 className="text-xs font-bold text-gray-500 uppercase">Policy Term</h3>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            {termVariationGroups.length === 1 ? (
              <div className="text-sm font-medium text-gray-700">{termVariationGroups[0]?.label}</div>
            ) : termVariationGroups.map((group) => {
              const quotesInGroup = allQuoteTerms.filter(t => t.key === group.key);
              const quotesNotInGroup = allQuoteTerms.filter(t => t.key !== group.key);
              return (
                <div key={group.key} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-700">{group.label}</span>
                  <HoverCard.Root openDelay={200} closeDelay={100}>
                    <HoverCard.Trigger asChild>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpandedCard('terms'); }}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"
                      >
                        {group.count}/{allQuoteTerms.length}
                      </button>
                    </HoverCard.Trigger>
                    <HoverCard.Portal>
                      <HoverCard.Content
                        className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3"
                        sideOffset={4}
                      >
                        {quotesInGroup.length > 0 && (
                          <>
                            <div className="text-[10px] text-green-600 uppercase tracking-wide font-semibold mb-1">On ({quotesInGroup.length})</div>
                            <div className="space-y-0.5 mb-3">
                              {quotesInGroup.map(qt => (
                                <button
                                  key={qt.quoteId}
                                  onClick={(e) => { e.stopPropagation(); setExpandedCard('terms'); }}
                                  className="w-full text-left text-xs text-gray-700 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-red-50 hover:text-red-700 transition-colors group/item"
                                >
                                  <span className="text-green-400 group-hover/item:text-red-400">•</span>
                                  <span className="flex-1 truncate">{qt.quoteName}</span>
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
                              {quotesNotInGroup.map(qt => (
                                <button
                                  key={qt.quoteId}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onApplyPolicyTerm({
                                      datesTbd: group.datesTbd,
                                      effectiveDate: group.effDate,
                                      expirationDate: group.expDate,
                                      quoteId: qt.quoteId,
                                    });
                                  }}
                                  className="w-full text-left text-xs text-gray-500 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-green-50 hover:text-green-700 transition-colors group/item"
                                >
                                  <span className="text-amber-400 group-hover/item:text-green-400">•</span>
                                  <span className="flex-1 truncate">{qt.quoteName}</span>
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
            })}
          </div>
        </>
      ) : (
        <div className={`flex items-center justify-between ${isExpanded ? 'px-4 py-2 border-b border-gray-100' : 'px-3 py-2'}`}>
          <div className={isExpanded ? '' : 'w-full text-center'}>
            <div className="text-[10px] text-gray-400 uppercase font-semibold mb-0.5">Policy Term</div>
            {!isExpanded && (
              summaryScope === 'submission' ? (
                termVariationGroups.length === 1 ? (
                  <span className="text-sm font-semibold text-gray-800">{termVariationGroups[0]?.label}</span>
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-sm font-semibold text-gray-800">{termVariationGroups[0]?.label}</span>
                    <HoverCard.Root openDelay={200} closeDelay={100}>
                      <HoverCard.Trigger asChild>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExpandedCard('terms'); }}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-colors"
                        >
                          +{termVariationGroups.length - 1} more
                        </button>
                      </HoverCard.Trigger>
                      <HoverCard.Portal>
                        <HoverCard.Content
                          className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3"
                          sideOffset={4}
                        >
                          <div className="text-[10px] text-green-600 uppercase tracking-wide font-semibold mb-1">On ({allQuoteTerms.length})</div>
                          <div className="space-y-0.5">
                            {allQuoteTerms.map(qt => (
                              <button
                                key={qt.quoteId}
                                onClick={(e) => { e.stopPropagation(); setExpandedCard('terms'); }}
                                className="w-full text-left text-xs text-gray-700 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-red-50 hover:text-red-700 transition-colors group/item"
                              >
                                <span className="text-green-400 group-hover/item:text-red-400">•</span>
                                <span className="flex-1 truncate">{qt.quoteName}</span>
                                <span className="text-[10px] text-gray-400 group-hover/item:text-red-500 opacity-0 group-hover/item:opacity-100">−</span>
                              </button>
                            ))}
                          </div>
                          <HoverCard.Arrow className="fill-white" />
                        </HoverCard.Content>
                      </HoverCard.Portal>
                    </HoverCard.Root>
                  </div>
                )
              ) : (
                <div className="text-sm font-bold text-gray-800 truncate">
                  {datesTbd ? 'TBD' : `${formatDate(effDate)} - ${formatDate(expDate)}`}
                </div>
              )
            )}
          </div>
          {isExpanded && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpandedCard(null); }}
              className="text-xs text-purple-600 hover:text-purple-700 font-medium"
            >
              Done
            </button>
          )}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4">
          {summaryScope === 'submission' ? (
            <SubmissionModeTerms
              termVariationGroups={termVariationGroups}
              allQuoteTerms={allQuoteTerms}
              editingTermKey={editingTermKey}
              setEditingTermKey={setEditingTermKey}
              editingTermEffective={editingTermEffective}
              setEditingTermEffective={setEditingTermEffective}
              editingTermExpiration={editingTermExpiration}
              setEditingTermExpiration={setEditingTermExpiration}
              editingTermDatesTbd={editingTermDatesTbd}
              setEditingTermDatesTbd={setEditingTermDatesTbd}
              isAddingTerm={isAddingTerm}
              setIsAddingTerm={setIsAddingTerm}
              newTermEffective={newTermEffective}
              setNewTermEffective={setNewTermEffective}
              newTermExpiration={newTermExpiration}
              setNewTermExpiration={setNewTermExpiration}
              newTermDatesTbd={newTermDatesTbd}
              setNewTermDatesTbd={setNewTermDatesTbd}
              newTermSelectedQuotes={newTermSelectedQuotes}
              setNewTermSelectedQuotes={setNewTermSelectedQuotes}
              termAppliesToPopoverId={termAppliesToPopoverId}
              setTermAppliesToPopoverId={setTermAppliesToPopoverId}
              onApplyPolicyTerm={onApplyPolicyTerm}
            />
          ) : (
            <TermsPanel structure={structure} variation={variation} submission={submission} submissionId={submission?.id} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * SubmissionModeTerms - Expanded content for submission mode
 */
function SubmissionModeTerms({
  termVariationGroups,
  allQuoteTerms,
  editingTermKey,
  setEditingTermKey,
  editingTermEffective,
  setEditingTermEffective,
  editingTermExpiration,
  setEditingTermExpiration,
  editingTermDatesTbd,
  setEditingTermDatesTbd,
  isAddingTerm,
  setIsAddingTerm,
  newTermEffective,
  setNewTermEffective,
  newTermExpiration,
  setNewTermExpiration,
  newTermDatesTbd,
  setNewTermDatesTbd,
  newTermSelectedQuotes,
  setNewTermSelectedQuotes,
  termAppliesToPopoverId,
  setTermAppliesToPopoverId,
  onApplyPolicyTerm,
}) {
  return (
    <div className="space-y-2">
      {termVariationGroups.map((group) => {
        const quotesInGroup = allQuoteTerms.filter(t => t.key === group.key);
        const isEditing = editingTermKey === group.key;

        return (
          <div
            key={group.key}
            className={`rounded-lg transition-colors ${
              isEditing ? 'bg-purple-50/50 p-3' : 'px-2 py-1.5 hover:bg-gray-50'
            }`}
          >
            {isEditing ? (
              <EditingTermRow
                group={group}
                quotesInGroup={quotesInGroup}
                allQuoteTerms={allQuoteTerms}
                editingTermDatesTbd={editingTermDatesTbd}
                setEditingTermDatesTbd={setEditingTermDatesTbd}
                editingTermEffective={editingTermEffective}
                setEditingTermEffective={setEditingTermEffective}
                editingTermExpiration={editingTermExpiration}
                setEditingTermExpiration={setEditingTermExpiration}
                setEditingTermKey={setEditingTermKey}
                termAppliesToPopoverId={termAppliesToPopoverId}
                setTermAppliesToPopoverId={setTermAppliesToPopoverId}
                onApplyPolicyTerm={onApplyPolicyTerm}
              />
            ) : (
              <DisplayTermRow
                group={group}
                quotesInGroup={quotesInGroup}
                allQuoteTerms={allQuoteTerms}
                setEditingTermKey={setEditingTermKey}
                setEditingTermDatesTbd={setEditingTermDatesTbd}
                setEditingTermEffective={setEditingTermEffective}
                setEditingTermExpiration={setEditingTermExpiration}
                termAppliesToPopoverId={termAppliesToPopoverId}
                setTermAppliesToPopoverId={setTermAppliesToPopoverId}
                onApplyPolicyTerm={onApplyPolicyTerm}
              />
            )}
          </div>
        );
      })}

      {/* Add New Term section */}
      <AddNewTermSection
        allQuoteTerms={allQuoteTerms}
        isAddingTerm={isAddingTerm}
        setIsAddingTerm={setIsAddingTerm}
        newTermEffective={newTermEffective}
        setNewTermEffective={setNewTermEffective}
        newTermExpiration={newTermExpiration}
        setNewTermExpiration={setNewTermExpiration}
        newTermDatesTbd={newTermDatesTbd}
        setNewTermDatesTbd={setNewTermDatesTbd}
        newTermSelectedQuotes={newTermSelectedQuotes}
        setNewTermSelectedQuotes={setNewTermSelectedQuotes}
        onApplyPolicyTerm={onApplyPolicyTerm}
      />
    </div>
  );
}

/**
 * EditingTermRow - Term row in editing mode
 */
function EditingTermRow({
  group,
  quotesInGroup,
  allQuoteTerms,
  editingTermDatesTbd,
  setEditingTermDatesTbd,
  editingTermEffective,
  setEditingTermEffective,
  editingTermExpiration,
  setEditingTermExpiration,
  setEditingTermKey,
  termAppliesToPopoverId,
  setTermAppliesToPopoverId,
  onApplyPolicyTerm,
}) {
  return (
    <div className="space-y-3">
      <PolicyTermEditor
        datesTbd={editingTermDatesTbd}
        effectiveDate={editingTermEffective}
        expirationDate={editingTermExpiration}
        onDatesChange={({ datesTbd, effectiveDate, expirationDate }) => {
          setEditingTermDatesTbd(datesTbd);
          setEditingTermEffective(effectiveDate || '');
          setEditingTermExpiration(expirationDate || '');
        }}
        onTbdToggle={(tbd) => {
          setEditingTermDatesTbd(tbd);
          if (tbd) {
            setEditingTermEffective('');
            setEditingTermExpiration('');
          }
        }}
        compact
      />
      <div className="flex items-center justify-between pt-2 border-t border-purple-100">
        <AppliesToPopoverInline
          groupKey={group.key}
          quotesInGroup={quotesInGroup}
          allQuoteTerms={allQuoteTerms}
          termAppliesToPopoverId={termAppliesToPopoverId}
          setTermAppliesToPopoverId={setTermAppliesToPopoverId}
          onApplyPolicyTerm={(quoteId) => onApplyPolicyTerm({
            datesTbd: editingTermDatesTbd,
            effectiveDate: editingTermDatesTbd ? null : editingTermEffective,
            expirationDate: editingTermDatesTbd ? null : editingTermExpiration,
            quoteId,
          })}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            quotesInGroup.forEach(qt => {
              onApplyPolicyTerm({
                datesTbd: editingTermDatesTbd,
                effectiveDate: editingTermDatesTbd ? null : editingTermEffective,
                expirationDate: editingTermDatesTbd ? null : editingTermExpiration,
                quoteId: qt.quoteId,
              });
            });
            setEditingTermKey(null);
          }}
          className="text-xs text-purple-600 hover:text-purple-700 font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * DisplayTermRow - Term row in display mode with hover preview
 */
function DisplayTermRow({
  group,
  quotesInGroup,
  allQuoteTerms,
  setEditingTermKey,
  setEditingTermDatesTbd,
  setEditingTermEffective,
  setEditingTermExpiration,
  termAppliesToPopoverId,
  setTermAppliesToPopoverId,
  onApplyPolicyTerm,
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setEditingTermDatesTbd(group.datesTbd);
          setEditingTermEffective(group.effDate || '');
          setEditingTermExpiration(group.expDate || '');
          setEditingTermKey(group.key);
        }}
        className="flex-1 text-left text-gray-700 hover:text-purple-700 cursor-pointer"
      >
        {group.label}
      </button>
      <HoverCard.Root
        openDelay={300}
        closeDelay={100}
        open={termAppliesToPopoverId !== group.key ? undefined : false}
      >
        <HoverCard.Trigger asChild>
          <span>
            <Popover.Root
              open={termAppliesToPopoverId === group.key}
              onOpenChange={(open) => setTermAppliesToPopoverId(open ? group.key : null)}
              modal={false}
            >
              <Popover.Trigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                    quotesInGroup.length === allQuoteTerms.length
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : quotesInGroup.length > 0
                      ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {quotesInGroup.length === allQuoteTerms.length ? `All ${allQuoteTerms.length} Options` : `${quotesInGroup.length}/${allQuoteTerms.length} Options`}
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
                        checked={quotesInGroup.length === allQuoteTerms.length}
                        onChange={() => {
                          if (quotesInGroup.length !== allQuoteTerms.length) {
                            allQuoteTerms.forEach(qt => {
                              if (!quotesInGroup.some(q => q.quoteId === qt.quoteId)) {
                                onApplyPolicyTerm({
                                  datesTbd: group.datesTbd,
                                  effectiveDate: group.effDate,
                                  expirationDate: group.expDate,
                                  quoteId: qt.quoteId,
                                });
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
                    {allQuoteTerms.map(qt => {
                      const isLinked = quotesInGroup.some(q => q.quoteId === qt.quoteId);
                      return (
                        <label
                          key={qt.quoteId}
                          className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                        >
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={() => {
                              if (!isLinked) {
                                onApplyPolicyTerm({
                                  datesTbd: group.datesTbd,
                                  effectiveDate: group.effDate,
                                  expirationDate: group.expDate,
                                  quoteId: qt.quoteId,
                                });
                              }
                            }}
                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                          />
                          <span className="truncate">{qt.quoteName}</span>
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
              {quotesInGroup.map(qt => (
                <div key={qt.quoteId} className="text-xs text-gray-600 flex items-center gap-1.5 px-1 py-0.5">
                  <span className="text-green-400">•</span>
                  <span className="truncate">{qt.quoteName}</span>
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

/**
 * AppliesToPopoverInline - Applies To popover for editing mode
 */
function AppliesToPopoverInline({
  groupKey,
  quotesInGroup,
  allQuoteTerms,
  termAppliesToPopoverId,
  setTermAppliesToPopoverId,
  onApplyPolicyTerm,
}) {
  return (
    <Popover.Root
      open={termAppliesToPopoverId === groupKey}
      onOpenChange={(open) => setTermAppliesToPopoverId(open ? groupKey : null)}
      modal={false}
    >
      <Popover.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
            quotesInGroup.length === allQuoteTerms.length
              ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
              : quotesInGroup.length > 0
              ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}
        >
          {quotesInGroup.length === allQuoteTerms.length ? `All ${allQuoteTerms.length} Options` : `${quotesInGroup.length}/${allQuoteTerms.length} Options`}
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
                checked={quotesInGroup.length === allQuoteTerms.length}
                onChange={() => {
                  if (quotesInGroup.length !== allQuoteTerms.length) {
                    allQuoteTerms.forEach(qt => {
                      if (!quotesInGroup.some(q => q.quoteId === qt.quoteId)) {
                        onApplyPolicyTerm(qt.quoteId);
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
            {allQuoteTerms.map(qt => {
              const isLinked = quotesInGroup.some(q => q.quoteId === qt.quoteId);
              return (
                <label
                  key={qt.quoteId}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                >
                  <input
                    type="checkbox"
                    checked={isLinked}
                    onChange={() => {
                      if (!isLinked) {
                        onApplyPolicyTerm(qt.quoteId);
                      }
                    }}
                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                  />
                  <span className="truncate">{qt.quoteName}</span>
                </label>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * AddNewTermSection - Add new term UI
 */
function AddNewTermSection({
  allQuoteTerms,
  isAddingTerm,
  setIsAddingTerm,
  newTermEffective,
  setNewTermEffective,
  newTermExpiration,
  setNewTermExpiration,
  newTermDatesTbd,
  setNewTermDatesTbd,
  newTermSelectedQuotes,
  setNewTermSelectedQuotes,
  onApplyPolicyTerm,
}) {
  return (
    <div className="pt-2 border-t border-gray-100 mt-2">
      {isAddingTerm ? (
        <div className="bg-purple-50/50 rounded-lg p-3 space-y-3">
          <PolicyTermEditor
            datesTbd={newTermDatesTbd}
            effectiveDate={newTermEffective}
            expirationDate={newTermExpiration}
            onDatesChange={({ datesTbd, effectiveDate, expirationDate }) => {
              setNewTermDatesTbd(datesTbd);
              setNewTermEffective(effectiveDate || '');
              setNewTermExpiration(expirationDate || '');
            }}
            onTbdToggle={(tbd) => {
              setNewTermDatesTbd(tbd);
              if (tbd) {
                setNewTermEffective('');
                setNewTermExpiration('');
              }
            }}
            compact
          />
          <div className="border-t border-purple-100 pt-2">
            <div className="text-xs font-medium text-gray-500 mb-2">Apply to:</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-purple-100/50 rounded px-1 py-0.5">
                <input
                  type="checkbox"
                  checked={newTermSelectedQuotes.length === allQuoteTerms.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setNewTermSelectedQuotes(allQuoteTerms.map(qt => qt.quoteId));
                    } else {
                      setNewTermSelectedQuotes([]);
                    }
                  }}
                  className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                />
                <span className="font-medium text-gray-700">All Options</span>
              </label>
              {allQuoteTerms.map(qt => (
                <label key={qt.quoteId} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-purple-100/50 rounded px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={newTermSelectedQuotes.includes(qt.quoteId)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewTermSelectedQuotes([...newTermSelectedQuotes, qt.quoteId]);
                      } else {
                        setNewTermSelectedQuotes(newTermSelectedQuotes.filter(id => id !== qt.quoteId));
                      }
                    }}
                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                  />
                  <span className="truncate">{qt.quoteName}</span>
                  <span className="text-gray-400 ml-auto text-[10px]">
                    {qt.datesTbd ? 'TBD' : qt.effectiveDate ? new Date(qt.effectiveDate).toLocaleDateString() : '—'}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if ((newTermDatesTbd || (newTermEffective && newTermExpiration)) && newTermSelectedQuotes.length > 0) {
                  newTermSelectedQuotes.forEach(quoteId => {
                    onApplyPolicyTerm({
                      datesTbd: newTermDatesTbd,
                      effectiveDate: newTermDatesTbd ? null : newTermEffective,
                      expirationDate: newTermDatesTbd ? null : newTermExpiration,
                      quoteId: quoteId,
                    });
                  });
                  setIsAddingTerm(false);
                  setNewTermEffective('');
                  setNewTermExpiration('');
                  setNewTermDatesTbd(false);
                  setNewTermSelectedQuotes([]);
                }
              }}
              disabled={(!newTermDatesTbd && (!newTermEffective || !newTermExpiration)) || newTermSelectedQuotes.length === 0}
              className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAddingTerm(false);
                setNewTermEffective('');
                setNewTermExpiration('');
                setNewTermDatesTbd(false);
                setNewTermSelectedQuotes([]);
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
            const today = new Date().toISOString().split('T')[0];
            const nextYear = new Date();
            nextYear.setFullYear(nextYear.getFullYear() + 1);
            const expiration = nextYear.toISOString().split('T')[0];
            setNewTermEffective(today);
            setNewTermExpiration(expiration);
            setIsAddingTerm(true);
          }}
          className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New Term
        </button>
      )}
    </div>
  );
}
