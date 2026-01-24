import { useState, useMemo } from 'react';
import { formatCompact } from '../../utils/quoteUtils';

/**
 * DateConfigModal - Coverage block-based date configuration
 *
 * Tower is divided into contiguous "blocks" where each block has a
 * start/end attachment point and a single effective date.
 */
export default function DateConfigModal({ dateConfig = [], layers = [], policyExpiration, policyEffective, onApply, onClose }) {
  // Calculate max tower from layers
  const maxTower = useMemo(() => {
    return layers.reduce((sum, l) => sum + (l.limit || 0), 0);
  }, [layers]);

  // Convert dateConfig (attachment_min based) to blocks (start/end ranges)
  const initializeBlocks = () => {
    if (!dateConfig || dateConfig.length === 0) {
      return [{ id: 'block-0', start: 0, end: maxTower, date: policyEffective || 'TBD' }];
    }

    // Sort by attachment_min
    const sorted = [...dateConfig].sort((a, b) => a.attachment_min - b.attachment_min);

    // Convert to blocks
    const blocks = sorted.map((rule, idx) => ({
      id: `block-${idx}`,
      start: rule.attachment_min,
      end: idx < sorted.length - 1 ? sorted[idx + 1].attachment_min : maxTower,
      date: rule.effective || 'TBD',
    }));

    return blocks;
  };

  const [blocks, setBlocks] = useState(initializeBlocks);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [editingDate, setEditingDate] = useState('');
  const [showAddDate, setShowAddDate] = useState(false);
  const [newDateAttachment, setNewDateAttachment] = useState('');
  const [newDateValue, setNewDateValue] = useState('');

  // Get all unique attachment points from layers for split options
  const getAttachmentPoints = () => {
    // Only show the TOP of each layer as valid split points (not the bottom/attachment)
    const points = new Set();
    let cumulative = 0;
    layers.forEach(layer => {
      cumulative += layer.limit || 0;
      points.add(cumulative);
    });
    // Filter out points that are already block boundaries AND the max tower
    const existingBoundaries = new Set(blocks.flatMap(b => [b.start, b.end]));
    return Array.from(points).filter(p => p > 0 && p < maxTower && !existingBoundaries.has(p)).sort((a, b) => a - b);
  };

  // Check if an attachment point is inside a "defined" block (not the last open-ended block)
  const isPointInDefinedBlock = (point) => {
    // If only one block, nothing is "defined" yet
    if (blocks.length <= 1) return false;
    // Check all blocks except the last one (which extends to max tower)
    const definedBlocks = blocks.slice(0, -1);
    return definedBlocks.some(b => point > b.start && point < b.end);
  };

  // Find carriers in a block's range
  const getCarriersInRange = (start, end) => {
    let cumulative = 0;
    const carriers = [];
    for (const layer of layers) {
      const layerStart = cumulative;
      cumulative += layer.limit || 0;
      if (layerStart >= start && layerStart < end) {
        carriers.push(layer.carrier || 'Unnamed');
      }
    }
    return carriers;
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'TBD') return 'TBD';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Policy term days
  const policyTermDays = policyEffective && policyExpiration
    ? Math.ceil((new Date(policyExpiration) - new Date(policyEffective)) / (1000 * 60 * 60 * 24))
    : null;

  // Check if a date already exists in another block
  const isDateDuplicate = (date, excludeBlockId = null) => {
    return blocks.some(b => b.id !== excludeBlockId && b.date === date);
  };

  // Get min allowed date for a block (must be >= previous block's date)
  const getMinDateForBlock = (blockId) => {
    const blockIndex = blocks.findIndex(b => b.id === blockId);
    if (blockIndex <= 0) return null; // First block has no minimum
    const prevBlock = blocks[blockIndex - 1];
    if (!prevBlock.date || prevBlock.date === 'TBD') return null;
    return prevBlock.date;
  };

  // Get max allowed date for a block (must be <= next block's date)
  const getMaxDateForBlock = (blockId) => {
    const blockIndex = blocks.findIndex(b => b.id === blockId);
    if (blockIndex < 0 || blockIndex >= blocks.length - 1) return policyExpiration; // Last block limited by expiration
    const nextBlock = blocks[blockIndex + 1];
    if (!nextBlock.date || nextBlock.date === 'TBD') return policyExpiration;
    return nextBlock.date;
  };

  // Handle clicking the date pill to edit
  const handleEditDate = (blockId) => {
    const block = blocks.find(b => b.id === blockId);
    setEditingBlockId(blockId);
    setEditingDate(block.date === 'TBD' ? '' : block.date);
    setShowDatePicker(true);
  };

  // Save date from picker
  const handleSaveDate = () => {
    if (!editingBlockId) return;
    setBlocks(blocks.map(b =>
      b.id === editingBlockId
        ? { ...b, date: editingDate || 'TBD' }
        : b
    ));
    setEditingBlockId(null);
    setEditingDate('');
    setShowDatePicker(false);
  };

  // Delete a block (merge with adjacent)
  const handleDelete = (blockId) => {
    if (blocks.length === 1) return;

    const blockIndex = blocks.findIndex(b => b.id === blockId);
    if (blockIndex === -1) return;

    const block = blocks[blockIndex];
    const newBlocks = [...blocks];

    if (blockIndex === 0) {
      // Merge with next block
      newBlocks[1] = { ...newBlocks[1], start: block.start };
      newBlocks.splice(0, 1);
    } else {
      // Merge with previous block
      newBlocks[blockIndex - 1] = { ...newBlocks[blockIndex - 1], end: block.end };
      newBlocks.splice(blockIndex, 1);
    }

    setBlocks(newBlocks);
  };

  // Add a new date by splitting at an attachment point
  const handleAddDate = () => {
    if (!newDateAttachment) return;

    const splitPoint = Number(newDateAttachment);
    const blockIndex = blocks.findIndex(b => b.start < splitPoint && b.end > splitPoint);

    if (blockIndex === -1) return;

    const block = blocks[blockIndex];
    const newBlocks = [...blocks];

    // Update existing block's end
    newBlocks[blockIndex] = { ...block, end: splitPoint };

    // Insert new block
    const newBlock = {
      id: `block-${Date.now()}`,
      start: splitPoint,
      end: block.end,
      date: newDateValue || 'TBD',
    };
    newBlocks.splice(blockIndex + 1, 0, newBlock);

    setBlocks(newBlocks);
    setShowAddDate(false);
    setNewDateAttachment('');
    setNewDateValue('');
  };

  // Convert blocks back to dateConfig format for saving
  const handleApply = () => {
    const newDateConfig = blocks.map(block => ({
      effective: block.date,
      attachment_min: block.start,
    }));
    onApply(newDateConfig);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-gray-800">Layer Term Dates</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>

        {/* Policy Term Context */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Policy Term</div>
          <div className="text-sm font-medium text-gray-700">
            {formatDate(policyEffective)} — {formatDate(policyExpiration)}
            {policyTermDays && <span className="text-gray-400 ml-2">({policyTermDays} days)</span>}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-grow space-y-3">
          {/* Add Date - Inline (at top since new blocks appear at top) */}
          {showAddDate ? (() => {
            const splitPoint = newDateAttachment ? Number(newDateAttachment) : null;
            const blockBeingSplit = splitPoint ? blocks.find(b => b.start < splitPoint && b.end > splitPoint) : null;
            const minDate = blockBeingSplit?.date && blockBeingSplit.date !== 'TBD' ? blockBeingSplit.date : null;
            const nextBlockIndex = blockBeingSplit ? blocks.indexOf(blockBeingSplit) + 1 : -1;
            const nextBlock = nextBlockIndex >= 0 && nextBlockIndex < blocks.length ? blocks[nextBlockIndex] : null;
            const maxDate = nextBlock?.date && nextBlock.date !== 'TBD' ? nextBlock.date : policyExpiration;
            const isTbd = !newDateValue;
            const dateToAdd = isTbd ? 'TBD' : newDateValue;
            const isDuplicate = isDateDuplicate(dateToAdd);

            return (
              <div className="border-2 border-dashed border-purple-300 rounded-lg p-4 bg-purple-50/30">
                <div className="flex items-center gap-3">
                  <div className="w-32">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5 block">Split at</label>
                    <select
                      value={newDateAttachment}
                      onChange={(e) => setNewDateAttachment(e.target.value)}
                      className="w-full h-9 text-sm border border-gray-300 rounded-lg px-3 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none bg-white cursor-pointer appearance-none"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '16px' }}
                    >
                      <option value="">Select...</option>
                      {getAttachmentPoints().map(point => {
                        const inBlock = isPointInDefinedBlock(point);
                        return (
                          <option key={point} value={point}>
                            {inBlock ? '• ' : ''}{formatCompact(point)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5 block">Effective Date</label>
                    <input
                      type="date"
                      value={newDateValue}
                      min={minDate || undefined}
                      max={maxDate || undefined}
                      onChange={(e) => setNewDateValue(e.target.value)}
                      className={`w-full h-9 text-sm border rounded-lg px-3 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none ${isTbd ? 'bg-gray-50 border-gray-300' : isDuplicate ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                    />
                  </div>
                  <div className="pt-5">
                    <label className={`flex items-center gap-1.5 ${isDateDuplicate('TBD') && !isTbd ? 'cursor-pointer' : isTbd ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                      <input
                        type="checkbox"
                        checked={isTbd}
                        onChange={(e) => setNewDateValue(e.target.checked ? '' : policyEffective || '')}
                        disabled={isDateDuplicate('TBD') && !isTbd}
                        className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                      />
                      <span className={`text-xs ${isTbd ? 'font-medium text-purple-600' : 'text-gray-600'}`}>TBD</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <button
                      onClick={handleAddDate}
                      disabled={!newDateAttachment || isDuplicate}
                      className="h-9 px-4 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowAddDate(false);
                        setNewDateAttachment('');
                        setNewDateValue('');
                      }}
                      className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : (
            <button
              onClick={() => setShowAddDate(true)}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-purple-300 hover:text-purple-600 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Date
            </button>
          )}

          {[...blocks].reverse().map((block, idx) => {
            const carriers = getCarriersInRange(block.start, block.end);
            const carriersText = carriers.length > 0
              ? carriers.slice(0, 3).join(', ') + (carriers.length > 3 ? ` +${carriers.length - 3}` : '')
              : 'No carriers';
            const isTbd = block.date === 'TBD';

            return (
              <div
                key={block.id}
                className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Left: Range */}
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Coverage Range</div>
                    <div className="text-sm font-semibold text-gray-800">
                      {formatCompact(block.start)} → {formatCompact(block.end)}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      {carriersText}
                    </div>
                  </div>

                  {/* Right: Date Pill + Delete */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditDate(block.id)}
                      className={`px-4 py-2 rounded-full font-medium text-sm transition-colors flex items-center gap-2 ${
                        isTbd
                          ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
                          : 'bg-purple-100 text-purple-700 border-2 border-purple-300 hover:bg-purple-200'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {formatDate(block.date)}
                    </button>
                    {blocks.length > 1 && (
                      <button
                        onClick={() => handleDelete(block.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
            Cancel
          </button>
          <button onClick={handleApply} className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 font-medium">
            Apply
          </button>
        </div>
      </div>

      {/* Date Picker Modal */}
      {showDatePicker && (() => {
        const minDate = getMinDateForBlock(editingBlockId);
        const maxDate = getMaxDateForBlock(editingBlockId);
        const blockIndex = blocks.findIndex(b => b.id === editingBlockId);
        const isFirstBlock = blockIndex === 0;
        const dateToSave = editingDate || 'TBD';
        const isDuplicate = isDateDuplicate(dateToSave, editingBlockId);
        const tbdAlreadyExists = isDateDuplicate('TBD', editingBlockId);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDatePicker(false)}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Set Effective Date</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Effective Date</label>
                  <input
                    type="date"
                    value={editingDate}
                    min={minDate || undefined}
                    max={maxDate || undefined}
                    onChange={(e) => setEditingDate(e.target.value)}
                    disabled={!editingDate && isFirstBlock}
                    className={`w-full text-sm border rounded-md px-3 py-2 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none ${!editingDate ? 'bg-gray-100 text-gray-400 border-gray-300' : isDuplicate ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                  />
                </div>
                {isFirstBlock && (
                  <div className={`flex items-center gap-2 ${tbdAlreadyExists && editingDate ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      id="tbd"
                      checked={!editingDate}
                      onChange={(e) => setEditingDate(e.target.checked ? '' : policyEffective || '')}
                      disabled={tbdAlreadyExists && editingDate}
                      className="w-4 h-4 text-purple-600 rounded border-gray-300"
                    />
                    <label htmlFor="tbd" className={`text-sm cursor-pointer ${!editingDate ? 'text-amber-700 font-medium' : 'text-gray-700'}`}>
                      Mark as TBD
                    </label>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowDatePicker(false);
                      setEditingBlockId(null);
                      setEditingDate('');
                    }}
                    className="flex-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveDate}
                    disabled={isDuplicate}
                    className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
