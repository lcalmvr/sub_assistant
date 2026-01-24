import React, { useState } from 'react';
import { Calendar, Plus, X, AlertCircle } from 'lucide-react';

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

// Get unique attachment points from tower
const getAttachmentPoints = (tower) => {
  const points = new Set([0]);
  tower.forEach(layer => {
    points.add(layer.attachment);
    points.add(layer.attachment + layer.limit);
  });
  return Array.from(points).sort((a, b) => a - b);
};

// Get carriers at or above an attachment point
const getCarriersAtAttachment = (tower, attachment) => {
  return tower
    .filter(layer => layer.attachment >= attachment)
    .map(l => l.carrier);
};

// RuleRow Component
function RuleRow({ rule, attachmentPoints, tower, onUpdate, onDelete, isBase }) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(rule.date);

  const carriers = getCarriersAtAttachment(tower, rule.attachment);
  const carrierCount = carriers.length;

  const handleDateChange = (newDate) => {
    onUpdate({ ...rule, date: newDate });
    setShowDatePicker(false);
    setTempDate(newDate);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          {isBase ? (
            <div className="text-sm text-gray-700">
              <span className="font-medium">Base Policy Date:</span>
              <button
                onClick={() => setShowDatePicker(true)}
                className={`ml-2 px-3 py-1 rounded font-medium text-sm ${
                  rule.date === 'TBD'
                    ? 'bg-amber-100 text-amber-700 border border-amber-300'
                    : 'bg-purple-100 text-purple-700 border border-purple-300'
                }`}
              >
                {formatDate(rule.date)}
              </button>
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-700">
                <span>For layers attaching at</span>
                <select
                  value={rule.attachment}
                  onChange={(e) => onUpdate({ ...rule, attachment: Number(e.target.value) })}
                  className="mx-2 px-2 py-1 border border-gray-300 rounded text-sm font-medium focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none"
                >
                  {attachmentPoints.map(point => (
                    <option key={point} value={point}>
                      {formatCompact(point)}
                    </option>
                  ))}
                </select>
                <span>or higher...</span>
              </div>
              <div className="text-sm text-gray-700">
                <span>...the Effective Date is</span>
                <button
                  onClick={() => setShowDatePicker(true)}
                  className={`ml-2 px-3 py-1 rounded font-medium text-sm ${
                    rule.date === 'TBD'
                      ? 'bg-amber-100 text-amber-700 border border-amber-300'
                      : 'bg-purple-100 text-purple-700 border border-purple-300'
                  }`}
                >
                  {formatDate(rule.date)}
                </button>
              </div>
              {carrierCount > 0 && (
                <div className="text-xs text-gray-500 italic">
                  (Affects {carrierCount} {carrierCount === 1 ? 'carrier' : 'carriers'}: {carriers.slice(0, 3).join(', ')}{carrierCount > 3 ? ` +${carrierCount - 3}` : ''})
                </div>
              )}
            </>
          )}
        </div>
        {!isBase && (
          <button
            onClick={() => onDelete(rule.id)}
            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
          >
            <X size={16} />
          </button>
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
                  value={tempDate === 'TBD' ? '' : tempDate}
                  onChange={(e) => setTempDate(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`tbd-${rule.id}`}
                  checked={!tempDate || tempDate === 'TBD'}
                  onChange={(e) => setTempDate(e.target.checked ? 'TBD' : '2025-12-06')}
                  className="w-4 h-4 text-purple-600 rounded border-gray-300"
                />
                <label htmlFor={`tbd-${rule.id}`} className="text-sm text-gray-700 cursor-pointer">
                  Mark as TBD
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowDatePicker(false);
                    setTempDate(rule.date);
                  }}
                  className="flex-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDateChange(tempDate || 'TBD')}
                  className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppTermDates3() {
  const attachmentPoints = getAttachmentPoints(mockTower);
  
  const [baseRule] = useState({
    id: 'base',
    attachment: 0,
    date: '2025-12-06',
  });
  
  const [exceptions, setExceptions] = useState([
    { id: 'exc-1', attachment: 25000000, date: '2025-12-07' },
  ]);

  const handleAddException = () => {
    // Find the highest attachment point not yet used
    const usedAttachments = [baseRule.attachment, ...exceptions.map(e => e.attachment)];
    const availableAttachments = attachmentPoints.filter(ap => !usedAttachments.includes(ap));
    
    if (availableAttachments.length === 0) return;
    
    const newException = {
      id: `exc-${Date.now()}`,
      attachment: availableAttachments[0],
      date: 'TBD',
    };
    
    // Sort by attachment (high to low)
    const newExceptions = [...exceptions, newException].sort((a, b) => b.attachment - a.attachment);
    setExceptions(newExceptions);
  };

  const handleUpdateException = (updatedRule) => {
    setExceptions(exceptions.map(e => 
      e.id === updatedRule.id ? updatedRule : e
    ).sort((a, b) => b.attachment - a.attachment));
  };

  const handleDeleteException = (ruleId) => {
    setExceptions(exceptions.filter(e => e.id !== ruleId));
  };

  // Validation: Check for cascading issues
  const validationErrors = [];
  const allRules = [baseRule, ...exceptions].sort((a, b) => b.attachment - a.attachment);
  for (let i = 0; i < allRules.length - 1; i++) {
    if (allRules[i].attachment <= allRules[i + 1].attachment) {
      validationErrors.push(`Rule at ${formatCompact(allRules[i].attachment)} should be higher than ${formatCompact(allRules[i + 1].attachment)}`);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Natural Language Rules</h1>
          <p className="text-gray-600 text-sm">The "Sentence" Model - Read like an underwriter's email</p>
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

        {/* Rules List */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Date Rules</h2>
          </div>

          <div className="space-y-3">
            {/* Base Rule */}
            <RuleRow
              rule={baseRule}
              attachmentPoints={attachmentPoints}
              tower={mockTower}
              onUpdate={() => {}} // Base rule is read-only in this mockup
              onDelete={() => {}}
              isBase={true}
            />

            {/* Exception Rules */}
            {exceptions.map(exception => (
              <RuleRow
                key={exception.id}
                rule={exception}
                attachmentPoints={attachmentPoints}
                tower={mockTower}
                onUpdate={handleUpdateException}
                onDelete={handleDeleteException}
                isBase={false}
              />
            ))}

            {/* Add Exception Button */}
            <button
              onClick={handleAddException}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-purple-300 hover:text-purple-600 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Plus size={16} />
              Add Exception
            </button>
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-red-800">
                <p className="font-medium mb-1">Validation errors:</p>
                <ul className="list-disc list-inside space-y-0.5 text-red-700">
                  {validationErrors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
