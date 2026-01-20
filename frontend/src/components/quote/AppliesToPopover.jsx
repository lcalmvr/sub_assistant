import * as Popover from '@radix-ui/react-popover';
import * as HoverCard from '@radix-ui/react-hover-card';
import { useMemo } from 'react';

/**
 * AppliesToPopover - Reusable component for showing which quotes an item applies to
 *
 * Features:
 * - Badge showing linked count (e.g., "3/5 Options", "All Primary", etc.)
 * - HoverCard preview showing "On" and "Not On" lists
 * - Popover for editing with "All Options", "All Primary", "All Excess" shortcuts
 * - Individual quote checkboxes
 *
 * @param {Object} props
 * @param {string[]} props.linkedQuoteIds - Array of quote IDs this item is linked to
 * @param {Array<{id: string, name: string, position: string}>} props.allOptions - All available quote options
 * @param {Function} props.onToggle - Called with (quoteId, isCurrentlyLinked) when toggling a single quote
 * @param {Function} props.onApplySelection - Called with (targetIds) for bulk operations
 * @param {boolean} [props.isOpen] - Controlled open state for the popover
 * @param {Function} [props.onOpenChange] - Callback when popover open state changes
 * @param {boolean} [props.showHoverPreview=true] - Whether to show hover preview
 * @param {string} [props.align='end'] - Popover alignment
 */
export default function AppliesToPopover({
  linkedQuoteIds = [],
  allOptions = [],
  onToggle,
  onApplySelection,
  isOpen,
  onOpenChange,
  showHoverPreview = true,
  align = 'end',
}) {
  // Compute derived values
  const linkedSet = useMemo(() => new Set(linkedQuoteIds.map(String)), [linkedQuoteIds]);
  const linkedCount = linkedSet.size;
  const totalCount = allOptions.length;
  const isAllLinked = linkedCount === totalCount && totalCount > 0;

  // Group options by position
  const allOptionIds = useMemo(() => allOptions.map(o => String(o.id)), [allOptions]);
  const allPrimaryIds = useMemo(() => allOptions.filter(o => o.position !== 'excess').map(o => String(o.id)), [allOptions]);
  const allExcessIds = useMemo(() => allOptions.filter(o => o.position === 'excess').map(o => String(o.id)), [allOptions]);

  // Compute selection states
  const isAllSelected = allOptionIds.every(id => linkedSet.has(id));
  const isAllPrimarySelected = allPrimaryIds.length > 0 && allPrimaryIds.every(id => linkedSet.has(id));
  const isAllExcessSelected = allExcessIds.length > 0 && allExcessIds.every(id => linkedSet.has(id));

  // Lists for hover preview
  const linkedOptions = allOptions.filter(o => linkedSet.has(String(o.id)));
  const unlinkedOptions = allOptions.filter(o => !linkedSet.has(String(o.id)));

  // Badge text and styling
  const getBadgeProps = () => {
    if (isAllLinked) {
      return {
        text: `All ${totalCount} Options`,
        className: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
      };
    }
    if (linkedCount === 0) {
      return {
        text: 'No quotes',
        className: 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100',
      };
    }
    return {
      text: `${linkedCount}/${totalCount} Options`,
      className: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
    };
  };

  const badgeProps = getBadgeProps();

  // Handle bulk selection changes
  const handleAllOptionsChange = () => {
    onApplySelection(isAllSelected ? [] : allOptionIds);
  };

  const handleAllPrimaryChange = () => {
    const currentLinkedArray = Array.from(linkedSet);
    const newIds = isAllPrimarySelected
      ? currentLinkedArray.filter(id => !allPrimaryIds.includes(id))
      : [...new Set([...currentLinkedArray, ...allPrimaryIds])];
    onApplySelection(newIds);
  };

  const handleAllExcessChange = () => {
    const currentLinkedArray = Array.from(linkedSet);
    const newIds = isAllExcessSelected
      ? currentLinkedArray.filter(id => !allExcessIds.includes(id))
      : [...new Set([...currentLinkedArray, ...allExcessIds])];
    onApplySelection(newIds);
  };

  const handleToggle = (optId) => {
    const isLinked = linkedSet.has(String(optId));
    onToggle(optId, isLinked);
  };

  // The trigger button (badge)
  const TriggerButton = (
    <button
      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${badgeProps.className}`}
    >
      {badgeProps.text}
    </button>
  );

  // Popover content
  const PopoverContent = (
    <Popover.Content
      className="z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-xl p-2"
      sideOffset={4}
      align={align}
    >
      <div className="text-xs font-medium text-gray-500 mb-2 px-1">Applies To</div>

      {/* Quick select shortcuts */}
      <div className="space-y-1 mb-2 pb-2 border-b border-gray-100">
        <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-700 font-medium">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={handleAllOptionsChange}
            className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
          />
          <span>All Options</span>
        </label>
        {allPrimaryIds.length > 0 && (
          <label className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600">
            <input
              type="checkbox"
              checked={isAllPrimarySelected}
              onChange={handleAllPrimaryChange}
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
              onChange={handleAllExcessChange}
              className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
            />
            <span>All Excess</span>
          </label>
        )}
      </div>

      {/* Individual quote checkboxes */}
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {allOptions.map(opt => {
          const isLinked = linkedSet.has(String(opt.id));
          return (
            <label
              key={opt.id}
              className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-gray-600"
            >
              <input
                type="checkbox"
                checked={isLinked}
                onChange={() => handleToggle(opt.id)}
                className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300"
              />
              <span className="truncate">{opt.name}</span>
              <span className={`text-[10px] px-1 py-0.5 rounded ${
                opt.position === 'excess'
                  ? 'bg-orange-50 text-orange-600'
                  : 'bg-blue-50 text-blue-600'
              }`}>
                {opt.position === 'excess' ? 'XS' : 'Pri'}
              </span>
            </label>
          );
        })}
      </div>

      <Popover.Arrow className="fill-white" />
    </Popover.Content>
  );

  // Hover preview content
  const HoverContent = (
    <HoverCard.Content
      className="z-[9998] w-52 rounded-lg border border-gray-200 bg-white shadow-lg p-3"
      sideOffset={4}
      align={align}
    >
      {linkedOptions.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
            On ({linkedOptions.length})
          </div>
          <div className="space-y-0.5">
            {linkedOptions.slice(0, 5).map(opt => (
              <div key={opt.id} className="text-xs text-gray-600 truncate">
                {opt.name}
              </div>
            ))}
            {linkedOptions.length > 5 && (
              <div className="text-[10px] text-gray-400">
                +{linkedOptions.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}
      {unlinkedOptions.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
            Not On ({unlinkedOptions.length})
          </div>
          <div className="space-y-0.5">
            {unlinkedOptions.slice(0, 5).map(opt => (
              <div key={opt.id} className="text-xs text-gray-400 truncate">
                {opt.name}
              </div>
            ))}
            {unlinkedOptions.length > 5 && (
              <div className="text-[10px] text-gray-400">
                +{unlinkedOptions.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}
      <HoverCard.Arrow className="fill-white" />
    </HoverCard.Content>
  );

  // If hover preview is enabled, wrap in HoverCard
  if (showHoverPreview) {
    return (
      <HoverCard.Root
        openDelay={300}
        closeDelay={100}
        open={isOpen ? false : undefined} // Close hover when popover is open
      >
        <HoverCard.Trigger asChild>
          <span>
            <Popover.Root
              open={isOpen}
              onOpenChange={onOpenChange}
              modal={false}
            >
              <Popover.Trigger asChild>
                {TriggerButton}
              </Popover.Trigger>
              <Popover.Portal>
                {PopoverContent}
              </Popover.Portal>
            </Popover.Root>
          </span>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          {HoverContent}
        </HoverCard.Portal>
      </HoverCard.Root>
    );
  }

  // Without hover preview, just the popover
  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={onOpenChange}
      modal={false}
    >
      <Popover.Trigger asChild>
        {TriggerButton}
      </Popover.Trigger>
      <Popover.Portal>
        {PopoverContent}
      </Popover.Portal>
    </Popover.Root>
  );
}
