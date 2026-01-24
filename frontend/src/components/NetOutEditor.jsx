/**
 * NetOutEditor - Shared component for net out input
 *
 * This component provides the net out input in both side panel and grid view.
 * Net out calculates what commission rate is needed to achieve a target net-to-carrier percentage.
 *
 * Props:
 * - value: string - net out value (as string for input)
 * - onChange: (value: string) => void - called on input change
 * - maxCommission?: number - maximum commission value (used for max constraint)
 * - placeholder?: string - placeholder text (default: commission value)
 * - compact?: boolean - use compact styling
 */

export default function NetOutEditor({
  value = '',
  onChange,
  maxCommission,
  placeholder,
  compact = false,
}) {
  if (compact) {
    // Compact mode for grid view
    return (
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-600 w-20">Net Out To:</label>
        <div className="relative">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder || ''}
            step="0.5"
            min="0"
            max={maxCommission || 100}
            className="w-20 text-sm border border-gray-300 rounded-md px-2 py-1.5 pr-6 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none hover:border-gray-400 transition-colors"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
        </div>
      </div>
    );
  }

  // Full mode for side panel
  return (
    <div>
      <div className="text-[10px] text-gray-400 uppercase mb-1">Net to</div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder || ''}
          step="0.5"
          min="0"
          max={maxCommission || 100}
          className="w-16 text-sm border border-gray-300 rounded-md px-2 py-1.5 text-right focus:border-purple-400 focus:ring-1 focus:ring-purple-200 outline-none hover:border-gray-400 transition-colors"
        />
        <span className="text-gray-500 text-sm">%</span>
      </div>
    </div>
  );
}
