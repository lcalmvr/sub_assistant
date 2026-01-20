import * as Popover from '@radix-ui/react-popover';
import * as HoverCard from '@radix-ui/react-hover-card';
import CommissionEditor from '../../CommissionEditor';
import CommissionPanel from './CommissionPanel';

/**
 * CommissionCardContent - Commission KPI Card
 *
 * Presentation component for the commission card in the KPI row.
 * All state and handlers are passed as props from SummaryTabContent.
 */
export default function CommissionCardContent({
  // Data
  structure,
  variation,
  submission,
  summaryScope,
  commissionVariationGroups,
  allQuoteCommissions,
  commission,
  // Expand state
  expandedCard,
  setExpandedCard,
  commissionCardRef,
  // Editing state
  editingCommissionKey,
  setEditingCommissionKey,
  editingCommissionRate,
  setEditingCommissionRate,
  // Adding state
  isAddingCommission,
  setIsAddingCommission,
  newCommissionRate,
  setNewCommissionRate,
  newCommissionSelectedQuotes,
  setNewCommissionSelectedQuotes,
  // Popover state
  commissionAppliesToPopoverId,
  setCommissionAppliesToPopoverId,
  // Mutation handlers
  onApplyCommissionSelection,
}) {
  const isExpanded = expandedCard === 'commission';

  return (
    <div
      ref={commissionCardRef}
      className={`bg-white rounded-lg border transition-all ${
        isExpanded
          ? 'border-purple-300 ring-1 ring-purple-100'
          : 'border-gray-200 hover:border-gray-300 cursor-pointer'
      }`}
      onClick={() => !isExpanded && setExpandedCard('commission')}
    >
      {/* Header bar - consistent for all states */}
      <div className="h-9 px-4 flex items-center justify-between bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide leading-none">Commission</h3>
        {isExpanded && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedCard(null); }}
            className="text-xs text-purple-600 hover:text-purple-700 font-medium leading-none"
          >
            Done
          </button>
        )}
      </div>

      {/* Collapsed content */}
      {!isExpanded && (
        <div className="px-4 py-3">
          {summaryScope === 'submission' ? (
            /* Submission mode collapsed: show grouped commissions with pills */
            commissionVariationGroups.length === 1 ? (
              <div className="text-sm font-medium text-gray-700">{commissionVariationGroups[0]?.label}</div>
            ) : (
              <div className="space-y-1.5">
                {commissionVariationGroups.map((group) => {
                  const quotesInGroup = allQuoteCommissions.filter(c => c.key === group.key);
                  const quotesNotInGroup = allQuoteCommissions.filter(c => c.key !== group.key);
                  return (
                    <MultiCommissionRow
                      key={group.key}
                      group={group}
                      quotesInGroup={quotesInGroup}
                      quotesNotInGroup={quotesNotInGroup}
                      allQuoteCommissions={allQuoteCommissions}
                      setExpandedCard={setExpandedCard}
                      onApplyCommissionSelection={onApplyCommissionSelection}
                    />
                  );
                })}
              </div>
            )
          ) : (
            /* Quote mode collapsed: show commission value */
            <div className="text-sm font-semibold text-gray-800">{commission}%</div>
          )}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4">
          {summaryScope === 'submission' ? (
            <SubmissionModeExpanded
              commissionVariationGroups={commissionVariationGroups}
              allQuoteCommissions={allQuoteCommissions}
              editingCommissionKey={editingCommissionKey}
              setEditingCommissionKey={setEditingCommissionKey}
              editingCommissionRate={editingCommissionRate}
              setEditingCommissionRate={setEditingCommissionRate}
              isAddingCommission={isAddingCommission}
              setIsAddingCommission={setIsAddingCommission}
              newCommissionRate={newCommissionRate}
              setNewCommissionRate={setNewCommissionRate}
              newCommissionSelectedQuotes={newCommissionSelectedQuotes}
              setNewCommissionSelectedQuotes={setNewCommissionSelectedQuotes}
              commissionAppliesToPopoverId={commissionAppliesToPopoverId}
              setCommissionAppliesToPopoverId={setCommissionAppliesToPopoverId}
              onApplyCommissionSelection={onApplyCommissionSelection}
            />
          ) : (
            <CommissionPanel structure={structure} variation={variation} submissionId={submission?.id} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS FOR COLLAPSED CONTENT
// ============================================================================

function MultiCommissionRow({ group, quotesInGroup, quotesNotInGroup, allQuoteCommissions, setExpandedCard, onApplyCommissionSelection }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-base text-gray-700">{group.label}</span>
      <HoverCard.Root openDelay={200} closeDelay={100}>
        <HoverCard.Trigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpandedCard('commission'); }}
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"
          >
            {group.count}/{allQuoteCommissions.length}
          </button>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content className="z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-xl p-3" sideOffset={4}>
            {quotesInGroup.length > 0 && (
              <>
                <div className="text-[10px] text-green-600 uppercase tracking-wide font-semibold mb-1">On ({quotesInGroup.length})</div>
                <div className="space-y-0.5 mb-3">
                  {quotesInGroup.map(qc => (
                    <button key={qc.quoteId} onClick={(e) => { e.stopPropagation(); setExpandedCard('commission'); }}
                      className="w-full text-left text-xs text-gray-700 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-red-50 hover:text-red-700 transition-colors group/item">
                      <span className="text-green-400 group-hover/item:text-red-400">•</span>
                      <span className="flex-1 truncate">{qc.quoteName}</span>
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
                  {quotesNotInGroup.map(qc => (
                    <button
                      key={qc.quoteId}
                      onClick={(e) => {
                        e.stopPropagation();
                        onApplyCommissionSelection({ commission: group.commissionRate, quoteId: qc.quoteId });
                      }}
                      className="w-full text-left text-xs text-gray-500 flex items-center gap-2 px-1 py-0.5 rounded hover:bg-green-50 hover:text-green-700 transition-colors group/item"
                    >
                      <span className="text-amber-400 group-hover/item:text-green-400">•</span>
                      <span className="flex-1 truncate">{qc.quoteName}</span>
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
// SUBMISSION MODE EXPANDED
// ============================================================================

function SubmissionModeExpanded({
  commissionVariationGroups,
  allQuoteCommissions,
  editingCommissionKey,
  setEditingCommissionKey,
  editingCommissionRate,
  setEditingCommissionRate,
  isAddingCommission,
  setIsAddingCommission,
  newCommissionRate,
  setNewCommissionRate,
  newCommissionSelectedQuotes,
  setNewCommissionSelectedQuotes,
  commissionAppliesToPopoverId,
  setCommissionAppliesToPopoverId,
  onApplyCommissionSelection,
}) {
  return (
    <div className="space-y-2">
      {commissionVariationGroups.map((group) => {
        const quotesInGroup = allQuoteCommissions.filter(c => c.key === group.key);
        const isEditing = editingCommissionKey === group.key;

        return (
          <div
            key={group.key}
            className={`rounded-lg transition-colors ${
              isEditing ? 'bg-purple-50/50 p-3' : 'px-2 py-1.5 hover:bg-gray-50'
            }`}
          >
            {isEditing ? (
              <EditingCommissionRow
                group={group}
                quotesInGroup={quotesInGroup}
                allQuoteCommissions={allQuoteCommissions}
                editingCommissionRate={editingCommissionRate}
                setEditingCommissionRate={setEditingCommissionRate}
                setEditingCommissionKey={setEditingCommissionKey}
                commissionAppliesToPopoverId={commissionAppliesToPopoverId}
                setCommissionAppliesToPopoverId={setCommissionAppliesToPopoverId}
                onApplyCommissionSelection={onApplyCommissionSelection}
              />
            ) : (
              <DisplayCommissionRow
                group={group}
                quotesInGroup={quotesInGroup}
                allQuoteCommissions={allQuoteCommissions}
                setEditingCommissionKey={setEditingCommissionKey}
                setEditingCommissionRate={setEditingCommissionRate}
                commissionAppliesToPopoverId={commissionAppliesToPopoverId}
                setCommissionAppliesToPopoverId={setCommissionAppliesToPopoverId}
                onApplyCommissionSelection={onApplyCommissionSelection}
              />
            )}
          </div>
        );
      })}

      {/* Add New Commission section */}
      <AddNewCommissionSection
        allQuoteCommissions={allQuoteCommissions}
        isAddingCommission={isAddingCommission}
        setIsAddingCommission={setIsAddingCommission}
        newCommissionRate={newCommissionRate}
        setNewCommissionRate={setNewCommissionRate}
        newCommissionSelectedQuotes={newCommissionSelectedQuotes}
        setNewCommissionSelectedQuotes={setNewCommissionSelectedQuotes}
        onApplyCommissionSelection={onApplyCommissionSelection}
      />
    </div>
  );
}

function EditingCommissionRow({
  group,
  quotesInGroup,
  allQuoteCommissions,
  editingCommissionRate,
  setEditingCommissionRate,
  setEditingCommissionKey,
  commissionAppliesToPopoverId,
  setCommissionAppliesToPopoverId,
  onApplyCommissionSelection,
}) {
  return (
    <div className="space-y-3">
      <CommissionEditor
        value={editingCommissionRate}
        onChange={setEditingCommissionRate}
      />
      <div className="flex items-center justify-between pt-2 border-t border-purple-100">
        <AppliesToPopoverInline
          groupKey={group.key}
          quotesInGroup={quotesInGroup}
          allQuoteCommissions={allQuoteCommissions}
          editingCommissionRate={editingCommissionRate}
          commissionAppliesToPopoverId={commissionAppliesToPopoverId}
          setCommissionAppliesToPopoverId={setCommissionAppliesToPopoverId}
          onApplyCommissionSelection={onApplyCommissionSelection}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rate = parseFloat(editingCommissionRate);
            if (!isNaN(rate) && rate >= 0 && rate <= 100) {
              quotesInGroup.forEach(qc => {
                onApplyCommissionSelection({ commission: rate, quoteId: qc.quoteId });
              });
            }
            setEditingCommissionKey(null);
            setEditingCommissionRate('');
          }}
          className="text-xs text-purple-600 hover:text-purple-700 font-medium"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function DisplayCommissionRow({
  group,
  quotesInGroup,
  allQuoteCommissions,
  setEditingCommissionKey,
  setEditingCommissionRate,
  commissionAppliesToPopoverId,
  setCommissionAppliesToPopoverId,
  onApplyCommissionSelection,
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setEditingCommissionRate(group.commissionRate.toString());
          setEditingCommissionKey(group.key);
        }}
        className="flex-1 text-left text-gray-700 hover:text-purple-700 cursor-pointer"
      >
        {group.label}
      </button>
      <HoverCard.Root
        openDelay={300}
        closeDelay={100}
        open={commissionAppliesToPopoverId !== group.key ? undefined : false}
      >
        <HoverCard.Trigger asChild>
          <span>
            <Popover.Root
              open={commissionAppliesToPopoverId === group.key}
              onOpenChange={(open) => setCommissionAppliesToPopoverId(open ? group.key : null)}
              modal={false}
            >
              <Popover.Trigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                    quotesInGroup.length === allQuoteCommissions.length
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : quotesInGroup.length > 0
                      ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {quotesInGroup.length === allQuoteCommissions.length ? `All ${allQuoteCommissions.length} Options` : `${quotesInGroup.length}/${allQuoteCommissions.length} Options`}
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
                        checked={quotesInGroup.length === allQuoteCommissions.length}
                        onChange={() => {
                          if (quotesInGroup.length !== allQuoteCommissions.length) {
                            allQuoteCommissions.forEach(qc => {
                              if (!quotesInGroup.some(q => q.quoteId === qc.quoteId)) {
                                onApplyCommissionSelection({ commission: group.commissionRate, quoteId: qc.quoteId });
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
                    {allQuoteCommissions.map(qc => {
                      const isLinked = quotesInGroup.some(q => q.quoteId === qc.quoteId);
                      return (
                        <label
                          key={qc.quoteId}
                          className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                        >
                          <input
                            type="checkbox"
                            checked={isLinked}
                            onChange={() => {
                              if (!isLinked) {
                                onApplyCommissionSelection({ commission: group.commissionRate, quoteId: qc.quoteId });
                              }
                            }}
                            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                          />
                          <span className="truncate">{qc.quoteName}</span>
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
              {quotesInGroup.map(qc => (
                <div key={qc.quoteId} className="text-xs text-gray-600 flex items-center gap-1.5 px-1 py-0.5">
                  <span className="text-green-400">•</span>
                  <span className="truncate">{qc.quoteName}</span>
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
  allQuoteCommissions,
  editingCommissionRate,
  commissionAppliesToPopoverId,
  setCommissionAppliesToPopoverId,
  onApplyCommissionSelection,
}) {
  return (
    <Popover.Root
      open={commissionAppliesToPopoverId === groupKey}
      onOpenChange={(open) => setCommissionAppliesToPopoverId(open ? groupKey : null)}
      modal={false}
    >
      <Popover.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
            quotesInGroup.length === allQuoteCommissions.length
              ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
              : quotesInGroup.length > 0
              ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
              : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
          }`}
        >
          {quotesInGroup.length === allQuoteCommissions.length ? `All ${allQuoteCommissions.length} Options` : `${quotesInGroup.length}/${allQuoteCommissions.length} Options`}
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
                checked={quotesInGroup.length === allQuoteCommissions.length}
                onChange={() => {
                  if (quotesInGroup.length !== allQuoteCommissions.length) {
                    const rate = parseFloat(editingCommissionRate);
                    if (!isNaN(rate) && rate >= 0 && rate <= 100) {
                      allQuoteCommissions.forEach(qc => {
                        if (!quotesInGroup.some(q => q.quoteId === qc.quoteId)) {
                          onApplyCommissionSelection({ commission: rate, quoteId: qc.quoteId });
                        }
                      });
                    }
                  }
                }}
                className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
              />
              <span>All Options</span>
            </label>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {allQuoteCommissions.map(qc => {
              const isLinked = quotesInGroup.some(q => q.quoteId === qc.quoteId);
              return (
                <label
                  key={qc.quoteId}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
                >
                  <input
                    type="checkbox"
                    checked={isLinked}
                    onChange={() => {
                      if (!isLinked) {
                        const rate = parseFloat(editingCommissionRate);
                        if (!isNaN(rate) && rate >= 0 && rate <= 100) {
                          onApplyCommissionSelection({ commission: rate, quoteId: qc.quoteId });
                        }
                      }
                    }}
                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                  />
                  <span className="truncate">{qc.quoteName}</span>
                </label>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AddNewCommissionSection({
  allQuoteCommissions,
  isAddingCommission,
  setIsAddingCommission,
  newCommissionRate,
  setNewCommissionRate,
  newCommissionSelectedQuotes,
  setNewCommissionSelectedQuotes,
  onApplyCommissionSelection,
}) {
  return (
    <div className="pt-2 border-t border-gray-100 mt-2">
      {isAddingCommission ? (
        <div className="bg-purple-50/50 rounded-lg p-3 space-y-3">
          <CommissionEditor
            value={newCommissionRate}
            onChange={setNewCommissionRate}
          />
          <div className="border-t border-purple-100 pt-2">
            <div className="text-xs font-medium text-gray-500 mb-2">Apply to:</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-purple-100/50 px-1 py-0.5 rounded">
                <input
                  type="checkbox"
                  checked={newCommissionSelectedQuotes.length === allQuoteCommissions.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setNewCommissionSelectedQuotes(allQuoteCommissions.map(qc => qc.quoteId));
                    } else {
                      setNewCommissionSelectedQuotes([]);
                    }
                  }}
                  className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                />
                <span className="font-medium text-gray-700">All Options</span>
              </label>
              {allQuoteCommissions.map(qc => (
                <label key={qc.quoteId} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-purple-100/50 px-1 py-0.5 rounded text-gray-600">
                  <input
                    type="checkbox"
                    checked={newCommissionSelectedQuotes.includes(qc.quoteId)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewCommissionSelectedQuotes([...newCommissionSelectedQuotes, qc.quoteId]);
                      } else {
                        setNewCommissionSelectedQuotes(newCommissionSelectedQuotes.filter(id => id !== qc.quoteId));
                      }
                    }}
                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
                  />
                  <span className="truncate">{qc.quoteName}</span>
                  <span className="text-gray-400 ml-auto">{qc.commissionRate}%</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const rate = parseFloat(newCommissionRate);
                if (!isNaN(rate) && rate >= 0 && rate <= 100 && newCommissionSelectedQuotes.length > 0) {
                  newCommissionSelectedQuotes.forEach(quoteId => {
                    onApplyCommissionSelection({ commission: rate, quoteId });
                  });
                  setIsAddingCommission(false);
                  setNewCommissionRate('');
                  setNewCommissionSelectedQuotes([]);
                }
              }}
              disabled={!newCommissionRate || isNaN(parseFloat(newCommissionRate)) || newCommissionSelectedQuotes.length === 0}
              className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAddingCommission(false);
                setNewCommissionRate('');
                setNewCommissionSelectedQuotes([]);
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            {newCommissionSelectedQuotes.length === 0 && newCommissionRate && (
              <span className="text-xs text-amber-600">Select at least one option</span>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setIsAddingCommission(true); }}
          className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New Rate
        </button>
      )}
    </div>
  );
}
