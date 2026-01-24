/**
 * LayerTermEditor - Per-layer term date picker for non-concurrent towers
 *
 * Allows each layer to have custom term dates that override the structure/submission dates.
 * Used for mid-term excess placements where layers have different inception dates.
 *
 * Props:
 * - layer: The layer object with term_start/term_end fields
 * - structureTerm: { start, end } - inherited term from structure/submission
 * - onChange: (updates) => void - called with { term_start, term_end }
 * - disabled: boolean
 */

import { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { getDaysBetween, getProRataFactor, hasCustomTerm } from '../utils/premiumUtils';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LayerTermEditor({
  layer,
  structureTerm,
  onChange,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [localStart, setLocalStart] = useState('');
  const [localEnd, setLocalEnd] = useState('');

  const hasCustom = hasCustomTerm(layer);

  // Effective term (custom or inherited)
  const effectiveStart = layer.term_start || structureTerm?.start;
  const effectiveEnd = layer.term_end || structureTerm?.end;
  const effectiveDays = getDaysBetween(effectiveStart, effectiveEnd);
  const proRataFactor = getProRataFactor(effectiveStart, effectiveEnd);
  const isShortTerm = proRataFactor < 0.95;

  // Sync local state when layer changes
  useEffect(() => {
    setLocalStart(layer.term_start || '');
    setLocalEnd(layer.term_end || '');
  }, [layer.term_start, layer.term_end]);

  // Handle setting custom term
  const handleApplyCustomTerm = () => {
    // Default to structure term as starting point
    const newStart = localStart || structureTerm?.start || '';
    const newEnd = localEnd || structureTerm?.end || '';

    setLocalStart(newStart);
    setLocalEnd(newEnd);

    onChange({
      term_start: newStart,
      term_end: newEnd,
    });
  };

  // Handle clearing custom term (revert to inherited)
  const handleClearCustomTerm = () => {
    setLocalStart('');
    setLocalEnd('');

    onChange({
      term_start: null,
      term_end: null,
    });

    setIsOpen(false);
  };

  // Handle date changes
  const handleStartChange = (e) => {
    const value = e.target.value;
    setLocalStart(value);

    if (value && localEnd) {
      onChange({
        term_start: value,
        term_end: localEnd,
      });
    }
  };

  const handleEndChange = (e) => {
    const value = e.target.value;
    setLocalEnd(value);

    if (localStart && value) {
      onChange({
        term_start: localStart,
        term_end: value,
      });
    }
  };

  // Quick presets
  const handlePreset = (months) => {
    const baseStart = structureTerm?.end ? new Date(`${structureTerm.end}T00:00:00`) : new Date();

    // For mid-term, calculate back from structure expiration
    const endDate = new Date(baseStart);
    const startDate = new Date(baseStart);
    startDate.setMonth(startDate.getMonth() - months);

    const newStart = startDate.toISOString().split('T')[0];
    const newEnd = endDate.toISOString().split('T')[0];

    setLocalStart(newStart);
    setLocalEnd(newEnd);

    onChange({
      term_start: newStart,
      term_end: newEnd,
    });
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button
          disabled={disabled}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            hasCustom
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              : isShortTerm
                ? 'text-amber-600 hover:bg-amber-50'
                : 'text-gray-400 hover:bg-gray-100'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title={hasCustom ? 'Custom term dates' : 'Click to set custom term'}
        >
          {hasCustom ? (
            <span>{formatDate(effectiveStart)} - {formatDate(effectiveEnd)}</span>
          ) : isShortTerm ? (
            <span>{effectiveDays}d</span>
          ) : (
            <span>12mo</span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-72 z-50"
          sideOffset={5}
          align="end"
        >
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700">Layer Term</h4>
              {hasCustom && (
                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                  Custom
                </span>
              )}
            </div>

            {/* Inherited Term Info */}
            {!hasCustom && structureTerm?.start && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">
                <span className="font-medium">Inherited:</span>{' '}
                {formatDateFull(structureTerm.start)} — {formatDateFull(structureTerm.end)}
              </div>
            )}

            {/* Date Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase block mb-1">
                  Effective
                </label>
                <input
                  type="date"
                  value={localStart}
                  onChange={handleStartChange}
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:border-blue-400 outline-none"
                  disabled={disabled}
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase block mb-1">
                  Expiration
                </label>
                <input
                  type="date"
                  value={localEnd}
                  onChange={handleEndChange}
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:border-blue-400 outline-none"
                  disabled={disabled}
                />
              </div>
            </div>

            {/* Quick Presets - for mid-term attachments */}
            {structureTerm?.end && !hasCustom && (
              <div>
                <label className="text-[10px] text-gray-500 uppercase block mb-1.5">
                  Quick presets (ending {formatDate(structureTerm.end)})
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 6].map((months) => (
                    <button
                      key={months}
                      onClick={() => handlePreset(months)}
                      className="flex-1 text-xs py-1 px-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
                    >
                      {months}mo
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Calculated Info */}
            {(localStart && localEnd) && (
              <div className="text-xs text-gray-600 bg-blue-50 rounded px-2 py-1.5">
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="font-medium">{getDaysBetween(localStart, localEnd)} days</span>
                </div>
                <div className="flex justify-between">
                  <span>Pro-rata factor:</span>
                  <span className="font-medium">{(getProRataFactor(localStart, localEnd) * 100).toFixed(1)}%</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              {hasCustom ? (
                <>
                  <button
                    onClick={handleClearCustomTerm}
                    className="flex-1 text-xs text-gray-500 hover:text-gray-700 py-1.5"
                  >
                    Use inherited term
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded py-1.5 font-medium"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 text-xs text-gray-500 hover:text-gray-700 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyCustomTerm}
                    disabled={!localStart || !localEnd}
                    className="flex-1 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded py-1.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Set custom term
                  </button>
                </>
              )}
            </div>
          </div>

          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
