/**
 * RetroSelector - Unified components for retro date management
 *
 * Main export: RetroScheduleEditor - manages a complete retro schedule
 * Used identically in:
 * - Side panel (RetroPanel)
 * - Grid "Add Restriction" form
 *
 * Uses Radix UI Popover for menus to avoid clipping issues
 */

import { useState, useEffect, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';

// Retro type options
export const RETRO_OPTIONS = [
  { value: 'full_prior_acts', label: 'Full Prior Acts' },
  { value: 'inception', label: 'Inception' },
  { value: 'tbd', label: 'TBD' },
  { value: 'match_expiring', label: 'To Match Expiring' },
  { value: 'date', label: 'Date' },
  { value: 'custom', label: 'Custom' },
];

// Coverage options
export const DEFAULT_COVERAGES = ['Cyber', 'Tech E&O'];
export const ADDITIONAL_COVERAGES = ['Media'];
export const ALL_COVERAGES = [...DEFAULT_COVERAGES, ...ADDITIONAL_COVERAGES];

/**
 * Format retro value for display
 */
export function formatRetroLabel(retro, date, customText) {
  if (retro === 'full_prior_acts') return 'Full Prior Acts';
  if (retro === 'inception') return 'Inception';
  if (retro === 'tbd') return 'TBD';
  if (retro === 'match_expiring') return 'To Match Expiring';
  if (retro === 'date' && date) return new Date(date).toLocaleDateString();
  if (retro === 'custom' && customText) return customText;
  if (retro === 'custom') return 'Custom';
  return retro || '—';
}

/**
 * RetroScheduleEditor - Manages a complete retro schedule (list of coverage-retro entries)
 *
 * Props:
 * - schedule: array of { coverage, retro, date?, custom_text? }
 * - onChange: (newSchedule) => void - called on every change
 * - excludedCoverages: string[] - coverages to hide from display and add menu
 * - showHeader: boolean - show "RETRO DATES" header (default true)
 * - showEmptyState: boolean - show "Full Prior Acts (default)" when empty (default true)
 * - addButtonText: string - text for add button (default "+ Add Restriction")
 * - compact: boolean - use more compact spacing (default false)
 */
export default function RetroScheduleEditor({
  schedule = [],
  onChange,
  excludedCoverages = [],
  showHeader = true,
  showEmptyState = true,
  addButtonText = '+ Add Restriction',
  compact = false,
}) {
  // Local state for editing
  const [localSchedule, setLocalSchedule] = useState(schedule);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Sync with external schedule prop - only when content actually changes
  useEffect(() => {
    const currentJson = JSON.stringify(localSchedule);
    const newJson = JSON.stringify(schedule);
    if (currentJson !== newJson) {
      setLocalSchedule(schedule);
    }
  }, [schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter out excluded coverages from display
  const displaySchedule = localSchedule.filter(
    entry => !excludedCoverages.includes(entry.coverage)
  );

  // Available coverages to add (not already in schedule, not excluded)
  const availableCoverages = ALL_COVERAGES.filter(
    c => !localSchedule.some(e => e.coverage === c) && !excludedCoverages.includes(c)
  );

  // Ref for blur handler to avoid stale closures
  const scheduleRef = useRef(localSchedule);
  useEffect(() => {
    scheduleRef.current = localSchedule;
  }, [localSchedule]);

  const updateAndSave = (newSchedule) => {
    setLocalSchedule(newSchedule);
    onChange(newSchedule);
  };

  const updateEntry = (coverage, updates, saveImmediately = true) => {
    const newSchedule = localSchedule.map(entry =>
      entry.coverage === coverage ? { ...entry, ...updates } : entry
    );
    setLocalSchedule(newSchedule);
    if (saveImmediately) {
      onChange(newSchedule);
    }
  };

  const saveCurrentSchedule = () => {
    onChange(scheduleRef.current);
  };

  const addCoverage = (coverageName) => {
    if (!coverageName || localSchedule.some(e => e.coverage === coverageName)) return;
    // Default new restrictions to 'inception' (since we're adding a restriction)
    const newSchedule = [...localSchedule, { coverage: coverageName, retro: 'inception' }];
    updateAndSave(newSchedule);
    setShowAddMenu(false);
  };

  const removeCoverage = (coverage) => {
    const newSchedule = localSchedule.filter(e => e.coverage !== coverage);
    updateAndSave(newSchedule);
  };

  const spacingClass = compact ? 'space-y-2' : 'space-y-3';
  const entrySpacingClass = compact ? 'space-y-1' : 'space-y-1.5';

  return (
    <div className={spacingClass}>
      {showHeader && (
        <label className="text-xs font-semibold text-gray-500 uppercase">Retro Dates</label>
      )}

      {/* Show default state when no restrictions */}
      {showEmptyState && displaySchedule.length === 0 && (
        <div className="text-sm text-gray-600 py-1">
          Full Prior Acts <span className="text-gray-400">(default)</span>
        </div>
      )}

      {/* Coverage entries */}
      {displaySchedule.map((entry) => (
        <div key={entry.coverage} className={entrySpacingClass}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{entry.coverage}</span>
            <button
              onClick={() => removeCoverage(entry.coverage)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
              title="Remove coverage"
            >
              ×
            </button>
          </div>

          {/* Retro type dropdown */}
          <select
            value={entry.retro}
            onChange={(e) => updateEntry(entry.coverage, {
              retro: e.target.value,
              date: undefined,
              custom_text: undefined
            })}
            className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none bg-white hover:border-gray-400 transition-colors"
          >
            {RETRO_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Date picker for "date" type */}
          {entry.retro === 'date' && (
            <input
              type="date"
              value={entry.date || ''}
              onChange={(e) => updateEntry(entry.coverage, { date: e.target.value })}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none bg-white hover:border-gray-400 transition-colors"
            />
          )}

          {/* Text input for "custom" type */}
          {entry.retro === 'custom' && (
            <input
              type="text"
              value={entry.custom_text || ''}
              onChange={(e) => updateEntry(entry.coverage, { custom_text: e.target.value }, false)}
              onBlur={saveCurrentSchedule}
              placeholder="e.g., $1M 1/1/2020, $4M xs $1M 1/1/2026"
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none bg-white hover:border-gray-400 transition-colors"
            />
          )}
        </div>
      ))}

      {/* Add Coverage Button/Menu - Using Radix Popover to avoid clipping */}
      {availableCoverages.length > 0 && (
        <Popover.Root open={showAddMenu} onOpenChange={setShowAddMenu}>
          <Popover.Trigger asChild>
            <button
              className="text-xs text-purple-600 hover:text-purple-700 font-medium transition-colors"
            >
              {addButtonText}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
              sideOffset={4}
              align="start"
            >
              {availableCoverages.map(cov => (
                <button
                  key={cov}
                  onClick={() => addCoverage(cov)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors first:rounded-t-lg last:rounded-b-lg"
                >
                  {cov}
                </button>
              ))}
              <Popover.Arrow className="fill-white" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}

// ============================================================================
// Legacy exports for backward compatibility (can remove after full migration)
// ============================================================================

export function RetroTypeSelect({ value, onChange, className = '' }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none bg-white hover:border-gray-400 transition-colors ${className}`}
    >
      {RETRO_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function CoverageSelect({
  value,
  onChange,
  excludeCoverages = [],
  placeholder = 'Select coverage...',
  className = ''
}) {
  const availableCoverages = ALL_COVERAGES.filter(c => !excludeCoverages.includes(c));

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none bg-white hover:border-gray-400 transition-colors ${className}`}
    >
      <option value="">{placeholder}</option>
      {availableCoverages.map(cov => (
        <option key={cov} value={cov}>{cov}</option>
      ))}
    </select>
  );
}

export function RetroEntryRow({
  coverage,
  retroType,
  date,
  customText,
  onRetroTypeChange,
  onDateChange,
  onCustomTextChange,
  onCustomTextBlur,
  onRemove,
  showRemove = true,
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{coverage}</span>
        {showRemove && onRemove && (
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
            title="Remove coverage"
          >
            ×
          </button>
        )}
      </div>
      <RetroTypeSelect
        value={retroType}
        onChange={onRetroTypeChange}
        className="w-full"
      />
      {retroType === 'date' && (
        <input
          type="date"
          value={date || ''}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none bg-white hover:border-gray-400 transition-colors"
        />
      )}
      {retroType === 'custom' && (
        <input
          type="text"
          value={customText || ''}
          onChange={(e) => onCustomTextChange(e.target.value)}
          onBlur={onCustomTextBlur}
          placeholder="e.g., $1M 1/1/2020, $4M xs $1M 1/1/2026"
          className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none bg-white hover:border-gray-400 transition-colors"
        />
      )}
    </div>
  );
}
