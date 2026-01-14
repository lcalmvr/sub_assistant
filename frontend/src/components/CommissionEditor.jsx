/**
 * CommissionEditor - Shared component for commission input
 *
 * This component provides the same behavior in both side panel and grid view:
 * - Number input for commission percentage (0-100)
 * - Step of 0.5
 * - Calls onChange/onBlur callbacks
 *
 * Props:
 * - value: string - commission value (as string for input)
 * - onChange: (value: string) => void - called on input change
 * - onBlur?: (value: number | null) => void - called on blur (receives parsed number)
 * - label?: string - label text (default: "Broker Commission" for side panel, "Rate:" for grid)
 * - compact?: boolean - use compact styling
 * - autoFocus?: boolean - auto focus the input
 */

export default function CommissionEditor({
  value = '',
  onChange,
  onBlur,
  label,
  compact = false,
  autoFocus = false,
}) {
  const handleChange = (e) => {
    onChange?.(e.target.value);
  };

  const handleBlur = () => {
    const numValue = value ? parseFloat(value) : null;
    onBlur?.(numValue);
  };

  if (compact) {
    // Compact mode for grid view
    return (
      <div className="flex items-center gap-2">
        {label && <label className="text-xs font-medium text-gray-600 w-20">{label}</label>}
        <div className="relative">
          <input
            type="number"
            value={value}
            onChange={handleChange}
            placeholder="15"
            min="0"
            max="100"
            step="0.5"
            className="w-20 text-sm border border-gray-300 rounded-md px-2 py-1.5 pr-6 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none hover:border-gray-400 transition-colors"
            autoFocus={autoFocus}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
        </div>
      </div>
    );
  }

  // Full mode for side panel
  return (
    <div>
      <div className="text-[10px] text-gray-400 uppercase mb-1">{label || 'Broker Commission'}</div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          step="0.5"
          min="0"
          max="100"
          className="w-16 text-sm border border-gray-300 rounded-md px-2 py-1.5 text-right focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none hover:border-gray-400 transition-colors"
        />
        <span className="text-gray-500 text-sm">%</span>
      </div>
    </div>
  );
}
