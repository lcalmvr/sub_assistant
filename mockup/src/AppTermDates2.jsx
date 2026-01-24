import React, { useState } from 'react';
import { Calendar, Plus, X, Flag } from 'lucide-react';

// Mock tower data with attachment points
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

// Get unique attachment points
const getAttachmentPoints = (tower) => {
  const points = new Set([0]);
  tower.forEach(layer => {
    points.add(layer.attachment);
    points.add(layer.attachment + layer.limit);
  });
  return Array.from(points).sort((a, b) => a - b);
};

// Flag Component
function DateFlag({ attachment, date, onEdit, onDelete, isHovering, onHover }) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempDate, setTempDate] = useState(date || '');

  return (
    <div 
      className="relative"
      onMouseEnter={() => onHover(attachment)}
      onMouseLeave={() => onHover(null)}
    >
      <div className={`absolute left-0 transition-all ${isHovering ? 'opacity-100' : 'opacity-90'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-0 h-0 border-t-[8px] border-t-transparent border-r-[12px] ${
            date === 'TBD' ? 'border-r-amber-400' : 'border-r-purple-400'
          } border-b-[8px] border-b-transparent`} />
          <div className={`bg-white border-2 rounded-lg shadow-lg p-2 min-w-[140px] ${
            date === 'TBD' ? 'border-amber-300' : 'border-purple-300'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={`text-[10px] font-semibold ${
                date === 'TBD' ? 'text-amber-700' : 'text-purple-700'
              }`}>
                {formatCompact(attachment)}
              </span>
              <button
                onClick={() => onDelete(attachment)}
                className="p-0.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
              >
                <X size={12} />
              </button>
            </div>
            <button
              onClick={() => setShowPicker(true)}
              className={`w-full px-2 py-1 rounded text-xs font-medium flex items-center justify-center gap-1 ${
                date === 'TBD'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              <Calendar size={10} />
              {formatDate(date)}
            </button>
          </div>
        </div>
      </div>

      {/* Date Picker Popover */}
      {showPicker && (
        <div className="absolute left-16 top-0 z-20 bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-[200px]">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Effective Date</label>
              <input
                type="date"
                value={tempDate === 'TBD' ? '' : tempDate}
                onChange={(e) => setTempDate(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`tbd-${attachment}`}
                checked={!tempDate || tempDate === 'TBD'}
                onChange={(e) => setTempDate(e.target.checked ? 'TBD' : '2025-12-06')}
                className="w-4 h-4 text-purple-600 rounded border-gray-300"
              />
              <label htmlFor={`tbd-${attachment}`} className="text-xs text-gray-700 cursor-pointer">
                TBD
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPicker(false);
                  setTempDate(date);
                }}
                className="flex-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onEdit(attachment, tempDate || 'TBD');
                  setShowPicker(false);
                }}
                className="flex-1 px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppTermDates2() {
  const attachmentPoints = getAttachmentPoints(mockTower);
  const maxTower = Math.max(...mockTower.map(l => l.attachment + l.limit));
  
  const [flags, setFlags] = useState([
    { attachment: 0, date: '2025-12-06' },
  ]);
  const [hoveringAttachment, setHoveringAttachment] = useState(null);
  const [showAddFlag, setShowAddFlag] = useState(null);

  const getDateForAttachment = (attachment) => {
    // Find the most recent flag at or below this attachment
    const relevantFlags = flags
      .filter(f => f.attachment <= attachment)
      .sort((a, b) => b.attachment - a.attachment);
    return relevantFlags[0]?.date || '2025-12-06';
  };

  const handleAddFlag = (attachment) => {
    const newFlag = {
      attachment,
      date: 'TBD',
    };
    setFlags([...flags, newFlag].sort((a, b) => a.attachment - b.attachment));
    setShowAddFlag(null);
  };

  const handleEditFlag = (attachment, newDate) => {
    setFlags(flags.map(f => 
      f.attachment === attachment ? { ...f, date: newDate } : f
    ));
  };

  const handleDeleteFlag = (attachment) => {
    if (attachment === 0) return; // Can't delete base flag
    setFlags(flags.filter(f => f.attachment !== attachment));
  };

  // Calculate color zones
  const getZoneColor = (attachment) => {
    const date = getDateForAttachment(attachment);
    if (date === 'TBD') return 'bg-amber-50';
    // Simple hash for different dates
    const dateHash = date.split('-').join('');
    const colors = ['bg-blue-50', 'bg-green-50', 'bg-purple-50', 'bg-pink-50'];
    return colors[parseInt(dateHash) % colors.length];
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Vertical Timeline</h1>
          <p className="text-gray-600 text-sm">The "Ruler" Model - Pin dates to tower heights</p>
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

        {/* Ruler and Flags */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Tower Timeline</h2>
            <div className="text-xs text-gray-400">
              Total Tower: {formatCompact(maxTower)}
            </div>
          </div>

          <div className="flex gap-6">
            {/* Left Rail - The Ruler */}
            <div className="flex-shrink-0 w-24">
              <div className="relative h-[600px]">
                {/* Ruler Bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-300 rounded" />
                
                {/* Tick Marks */}
                {attachmentPoints.map((point, idx) => {
                  const percentage = (point / maxTower) * 100;
                  const hasFlag = flags.some(f => f.attachment === point);
                  const isHovering = hoveringAttachment === point;
                  
                  return (
                    <div
                      key={point}
                      className="absolute left-0"
                      style={{ top: `${100 - percentage}%` }}
                      onMouseEnter={() => setHoveringAttachment(point)}
                      onMouseLeave={() => {
                        if (!hasFlag) setHoveringAttachment(null);
                      }}
                    >
                      {/* Tick Mark */}
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-px ${hasFlag ? 'bg-purple-600' : 'bg-gray-400'}`} />
                        <span className="text-[10px] text-gray-600 font-medium">
                          {formatCompact(point)}
                        </span>
                      </div>
                      
                      {/* Add Button (on hover) */}
                      {!hasFlag && isHovering && (
                        <button
                          onClick={() => handleAddFlag(point)}
                          className="ml-4 mt-1 p-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Rail - The Flags and Color Zones */}
            <div className="flex-1 relative h-[600px]">
              {/* Color Zones */}
              {attachmentPoints.slice(0, -1).map((point, idx) => {
                const nextPoint = attachmentPoints[idx + 1];
                const topPercent = 100 - (point / maxTower) * 100;
                const bottomPercent = 100 - (nextPoint / maxTower) * 100;
                const zoneColor = getZoneColor(point);
                
                return (
                  <div
                    key={`zone-${point}`}
                    className={`absolute left-0 right-0 ${zoneColor} border-x border-gray-200`}
                    style={{
                      top: `${topPercent}%`,
                      bottom: `${100 - bottomPercent}%`,
                    }}
                  />
                );
              })}

              {/* Flags */}
              {flags.map(flag => {
                const percentage = (flag.attachment / maxTower) * 100;
                return (
                  <div
                    key={flag.attachment}
                    className="absolute left-0"
                    style={{ top: `${100 - percentage}%` }}
                  >
                    <DateFlag
                      attachment={flag.attachment}
                      date={flag.date}
                      onEdit={handleEditFlag}
                      onDelete={handleDeleteFlag}
                      isHovering={hoveringAttachment === flag.attachment}
                      onHover={setHoveringAttachment}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Legend</div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-50 border border-blue-200 rounded" />
                <span className="text-gray-600">Dec 6, 2025</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-amber-50 border border-amber-200 rounded" />
                <span className="text-gray-600">TBD</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
