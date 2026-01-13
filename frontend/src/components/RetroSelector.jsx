/**
 * RetroSelector - Shared component for retro date selection
 *
 * Used in:
 * - CompactRetroEditor (side panel)
 * - Grid "Add Restriction" form
 */

// Retro type options
export const RETRO_OPTIONS = [
  { value: 'full_prior_acts', label: 'Full Prior Acts' },
  { value: 'inception', label: 'Inception' },
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
  if (retro === 'date' && date) return new Date(date).toLocaleDateString();
  if (retro === 'custom' && customText) return customText;
  if (retro === 'custom') return 'Custom';
  return retro || '—';
}

/**
 * RetroTypeSelect - Dropdown for selecting retro type
 */
export function RetroTypeSelect({ value, onChange, className = '' }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-sm border border-gray-300 rounded px-2 py-1.5 focus:border-purple-400 outline-none bg-white ${className}`}
    >
      {RETRO_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

/**
 * CoverageSelect - Dropdown for selecting coverage
 */
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
      className={`text-sm border border-gray-300 rounded px-2 py-1.5 focus:border-purple-400 outline-none bg-white ${className}`}
    >
      <option value="">{placeholder}</option>
      {availableCoverages.map(cov => (
        <option key={cov} value={cov}>{cov}</option>
      ))}
    </select>
  );
}

/**
 * RetroSelector - Combined coverage + retro type selector
 *
 * Props:
 * - coverage: string - selected coverage name
 * - retroType: string - selected retro type value
 * - onCoverageChange: (coverage: string) => void
 * - onRetroTypeChange: (retroType: string) => void
 * - excludeCoverages: string[] - coverages to exclude from dropdown
 * - showCoverage: boolean - whether to show coverage dropdown (default true)
 * - layout: 'horizontal' | 'vertical' - layout direction (default 'horizontal')
 */
export default function RetroSelector({
  coverage,
  retroType,
  onCoverageChange,
  onRetroTypeChange,
  excludeCoverages = [],
  showCoverage = true,
  layout = 'horizontal',
}) {
  const containerClass = layout === 'horizontal'
    ? 'flex items-center gap-3'
    : 'space-y-2';

  return (
    <div className={containerClass}>
      {showCoverage && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Coverage:</label>
          <CoverageSelect
            value={coverage}
            onChange={onCoverageChange}
            excludeCoverages={excludeCoverages}
            placeholder="Select..."
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-600">Retro:</label>
        <RetroTypeSelect
          value={retroType}
          onChange={onRetroTypeChange}
        />
      </div>
    </div>
  );
}
