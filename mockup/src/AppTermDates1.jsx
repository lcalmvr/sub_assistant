import React, { useState } from 'react';
import { Calendar, Scissors, Plus, X, AlertCircle } from 'lucide-react';

// Mock tower data
const mockTower = [
  { carrier: 'Primary Carrier', limit: 5000000, attachment: 0 },
  { carrier: 'Beazley', limit: 5000000, attachment: 5000000 },
  { carrier: 'AIG', limit: 5000000, attachment: 10000000 },
  { carrier: 'XL', limit: 5000000, attachment: 15000000 },
  { carrier: 'Corvus', limit: 5000000, attachment: 20000000 },
  { carrier: 'Westfield', limit: 10000000, attachment: 25000000 },
  { carrier: 'Bowhead', limit: 10000000, attachment: 35000000 },
  { carrier: 'Upland', limit: 10000000, attachment: 45000000 },
  { carrier: 'Validus', limit: 5000000, attachment: 55000000 },
  { carrier: 'CMAI', limit: 5000000, attachment: 60000000 },
];

const formatCompact = (val) => {
  if (!val && val !== 0) return '—';
  if (val >= 1_000_000) return `$${val / 1_000_000}M`;
  if (val >= 1_000) return `$${Math.round(val / 1_000)}K`;
  return `$${val}`;
};

const formatDate = (dateStr) => {
  if (!dateStr || dateStr === 'TBD') return 'TBD';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// CoverageBlock Component
function CoverageBlock({ block, onEditDate, onDelete, onSplit, isLast, tower }) {
  const [showSplit, setShowSplit] = useState(false);
  
  // Find carriers in this range
  const carriersInRange = tower.filter(layer => {
    const layerTop = layer.attachment + layer.limit;
    return layer.attachment >= block.start && layer.attachment < block.end;
  }).map(l => l.carrier);

  const carriersText = carriersInRange.length > 0 
    ? carriersInRange.slice(0, 3).join(', ') + (carriersInRange.length > 3 ? ` +${carriersInRange.length - 3}` : '')
    : 'No carriers';

  return (
    <div className="relative">
      <div 
        className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
        onMouseEnter={() => setShowSplit(true)}
        onMouseLeave={() => setShowSplit(false)}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left: Range */}
          <div className="flex-1">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Coverage Range</div>
            <div className="text-sm font-semibold text-gray-800">
              {formatCompact(block.start)} ➔ {formatCompact(block.end)}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              {carriersText}
            </div>
          </div>

          {/* Right: Date Pill */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditDate(block.id)}
              className={`px-4 py-2 rounded-full font-medium text-sm transition-colors flex items-center gap-2 ${
                block.date === 'TBD'
                  ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
                  : 'bg-purple-100 text-purple-700 border-2 border-purple-300 hover:bg-purple-200'
              }`}
            >
              <Calendar size={14} />
              {formatDate(block.date)}
            </button>
            {!isLast && (
              <button
                onClick={() => onDelete(block.id)}
                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Split Action - appears on hover */}
      {showSplit && (
        <div className="absolute -bottom-3 left-0 right-0 flex justify-center z-10">
          <button
            onClick={() => onSplit(block.id, block.end)}
            className="bg-purple-600 text-white px-3 py-1.5 rounded-full text-xs font-medium shadow-lg flex items-center gap-1.5 hover:bg-purple-700 transition-colors"
          >
            <Scissors size={12} />
            Split at {formatCompact(block.end)}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppTermDates1() {
  const [blocks, setBlocks] = useState([
    { id: 'block-1', start: 0, end: 65000000, date: '2025-12-06' },
  ]);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [editingDate, setEditingDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddDate, setShowAddDate] = useState(false);
  const [newDateAttachment, setNewDateAttachment] = useState('');
  const [newDateValue, setNewDateValue] = useState('');

  const maxTower = Math.max(...mockTower.map(l => l.attachment + l.limit));
  
  // Get all unique attachment points from tower
  const getAttachmentPoints = () => {
    const points = new Set([0]);
    mockTower.forEach(layer => {
      points.add(layer.attachment);
      points.add(layer.attachment + layer.limit);
    });
    return Array.from(points).sort((a, b) => a - b).filter(p => p > 0 && p < maxTower);
  };

  const handleSplit = (blockId, splitPoint) => {
    const blockIndex = blocks.findIndex(b => b.id === blockId);
    if (blockIndex === -1) return;

    const block = blocks[blockIndex];
    const newBlocks = [...blocks];
    
    // Update existing block
    newBlocks[blockIndex] = { ...block, end: splitPoint };
    
    // Insert new block
    const newBlock = {
      id: `block-${Date.now()}`,
      start: splitPoint,
      end: block.end,
      date: 'TBD',
    };
    newBlocks.splice(blockIndex + 1, 0, newBlock);
    
    setBlocks(newBlocks);
  };

  const handleEditDate = (blockId) => {
    const block = blocks.find(b => b.id === blockId);
    setEditingBlockId(blockId);
    setEditingDate(block.date === 'TBD' ? '' : block.date);
    setShowDatePicker(true);
  };

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

  const handleDelete = (blockId) => {
    if (blocks.length === 1) return; // Can't delete the last block
    
    const blockIndex = blocks.findIndex(b => b.id === blockId);
    if (blockIndex === -1) return;
    
    const block = blocks[blockIndex];
    const newBlocks = [...blocks];
    
    if (blockIndex === 0) {
      // Merge with next block
      newBlocks[1].start = block.start;
      newBlocks.splice(0, 1);
    } else {
      // Merge with previous block
      newBlocks[blockIndex - 1].end = block.end;
      newBlocks.splice(blockIndex, 1);
    }
    
    setBlocks(newBlocks);
  };

  const handleAddDate = () => {
    if (!newDateAttachment) return;
    
    const splitPoint = Number(newDateAttachment);
    const blockIndex = blocks.findIndex(b => b.start <= splitPoint && b.end > splitPoint);
    
    if (blockIndex === -1) return;
    
    const block = blocks[blockIndex];
    const newBlocks = [...blocks];
    
    // Update existing block
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Stacked Range Builder</h1>
          <p className="text-gray-600 text-sm">The "Partition" Model - Coverage as contiguous blocks</p>
        </div>

        {/* Policy Term Context */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Policy Term</div>
              <div className="text-sm font-medium text-gray-700">
                Dec 6, 2025 — Dec 6, 2026 (365 days)
              </div>
            </div>
            <button className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700">
              Done
            </button>
          </div>
        </div>

        {/* Coverage Blocks */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Coverage Blocks</h2>
            <div className="text-xs text-gray-400">
              Total Tower: {formatCompact(maxTower)}
            </div>
          </div>

          <div className="space-y-4">
            {blocks.map((block, idx) => (
              <CoverageBlock
                key={block.id}
                block={block}
                onEditDate={handleEditDate}
                onDelete={handleDelete}
                onSplit={handleSplit}
                isLast={idx === blocks.length - 1}
                tower={mockTower}
              />
            ))}
            
            {/* Add Date Button */}
            <button
              onClick={() => setShowAddDate(true)}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-purple-300 hover:text-purple-600 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Plus size={16} />
              Add Date
            </button>
          </div>

          {/* Validation */}
          {blocks.some((b, idx) => idx > 0 && b.start !== blocks[idx - 1].end) && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-red-800">
                <p className="font-medium mb-0.5">Range validation error</p>
                <p className="text-red-700">Block ranges must be contiguous without gaps.</p>
              </div>
            </div>
          )}
        </div>

        {/* Date Picker Modal */}
        {showDatePicker && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDatePicker(false)}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Set Effective Date</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Effective Date</label>
                  <input
                    type="date"
                    value={editingDate}
                    onChange={(e) => setEditingDate(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="tbd"
                    checked={!editingDate}
                    onChange={(e) => setEditingDate(e.target.checked ? '' : '2025-12-06')}
                    className="w-4 h-4 text-purple-600 rounded border-gray-300"
                  />
                  <label htmlFor="tbd" className="text-sm text-gray-700 cursor-pointer">
                    Mark as TBD
                  </label>
                </div>
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
                    className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Date Modal */}
        {showAddDate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddDate(false)}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Add New Date</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Split at Attachment Point</label>
                  <select
                    value={newDateAttachment}
                    onChange={(e) => setNewDateAttachment(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none"
                  >
                    <option value="">Select attachment point...</option>
                    {getAttachmentPoints().map(point => (
                      <option key={point} value={point}>
                        {formatCompact(point)}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">
                    This will split the block at the selected attachment point
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Effective Date</label>
                  <input
                    type="date"
                    value={newDateValue}
                    onChange={(e) => setNewDateValue(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="new-tbd"
                    checked={!newDateValue}
                    onChange={(e) => setNewDateValue(e.target.checked ? '' : '2025-12-06')}
                    className="w-4 h-4 text-purple-600 rounded border-gray-300"
                  />
                  <label htmlFor="new-tbd" className="text-sm text-gray-700 cursor-pointer">
                    Mark as TBD
                  </label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowAddDate(false);
                      setNewDateAttachment('');
                      setNewDateValue('');
                    }}
                    className="flex-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddDate}
                    disabled={!newDateAttachment}
                    className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add Date
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
