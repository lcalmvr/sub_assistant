/**
 * PolicyTermEditor - Shared component for policy term management
 *
 * This component provides the same behavior in both side panel and grid view:
 * - Date inputs for effective/expiration dates
 * - TBD toggle button
 * - Auto-calculate expiration when effective date changes (+1 year)
 *
 * Props:
 * - datesTbd: boolean - whether dates are TBD
 * - effectiveDate: string - effective date (YYYY-MM-DD)
 * - expirationDate: string - expiration date (YYYY-MM-DD)
 * - onDatesChange: (dates: { datesTbd: boolean, effectiveDate?: string, expirationDate?: string }) => void
 *   - Called when dates change
 * - onTbdToggle: (datesTbd: boolean) => void
 *   - Called when TBD toggle is clicked
 * - compact?: boolean - use compact spacing
 * - headerAction?: React.ReactNode - optional action to render in header
 * - readOnly?: boolean - disable all inputs (used when multiple dates are managed via modal)
 */

export default function PolicyTermEditor({
  datesTbd = false,
  effectiveDate = '',
  expirationDate = '',
  onDatesChange,
  onTbdToggle,
  compact = false,
  headerAction = null,
  readOnly = false,
}) {
  const handleTbdToggle = () => {
    const newTbd = !datesTbd;
    onTbdToggle?.(newTbd);
    onDatesChange?.({ datesTbd: newTbd, effectiveDate: null, expirationDate: null });
  };

  const handleEffectiveDateChange = (date) => {
    if (date) {
      // Auto-set expiration to 1 year later
      const effDate = new Date(date);
      effDate.setFullYear(effDate.getFullYear() + 1);
      const newExpiration = effDate.toISOString().split('T')[0];
      onDatesChange?.({ datesTbd: false, effectiveDate: date, expirationDate: newExpiration });
    } else {
      onDatesChange?.({ datesTbd: false, effectiveDate: null, expirationDate: expirationDate || null });
    }
  };

  const handleExpirationDateChange = (date) => {
    onDatesChange?.({ datesTbd: false, effectiveDate: effectiveDate || null, expirationDate: date || null });
  };

  const spacingClass = compact ? 'space-y-2' : 'space-y-4';

  return (
    <div className={spacingClass}>
      {/* Header with TBD toggle */}
      <div className="flex items-center justify-between">
        {headerAction || (
          <label className="text-xs font-semibold text-gray-500 uppercase">Policy Period</label>
        )}
        {!readOnly && (
          <button
            onClick={handleTbdToggle}
            className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
              datesTbd
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            TBD
          </button>
        )}
      </div>

      {/* Dates - show inputs or TBD message */}
      {datesTbd ? (
        <div className="text-sm text-gray-400 italic py-2">
          Dates to be determined
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">Effective</label>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => handleEffectiveDateChange(e.target.value)}
              disabled={readOnly}
              className={`w-full text-sm border rounded-md px-2 py-1.5 outline-none transition-colors ${
                readOnly
                  ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 hover:border-gray-400'
              }`}
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">Expiration</label>
            <input
              type="date"
              value={expirationDate}
              onChange={(e) => handleExpirationDateChange(e.target.value)}
              disabled={readOnly}
              className={`w-full text-sm border rounded-md px-2 py-1.5 outline-none transition-colors ${
                readOnly
                  ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 hover:border-gray-400'
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
