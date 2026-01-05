import { useState, useEffect } from 'react';

/**
 * Simple date range picker for policy period (effective + expiration).
 *
 * Props:
 * - effectiveDate: string (ISO date) or null
 * - expirationDate: string (ISO date) or null
 * - onChange: ({ effective_date, expiration_date }) => void
 * - compact: boolean - if true, uses smaller styling
 */
export default function DateRangePicker({
  effectiveDate,
  expirationDate,
  onChange,
  compact = false,
}) {
  const [effective, setEffective] = useState(effectiveDate || '');
  const [expiration, setExpiration] = useState(expirationDate || '');

  useEffect(() => {
    setEffective(effectiveDate || '');
    setExpiration(expirationDate || '');
  }, [effectiveDate, expirationDate]);

  const handleEffectiveChange = (value) => {
    setEffective(value);
    onChange?.({ effective_date: value || null, expiration_date: expiration || null });
  };

  const handleExpirationChange = (value) => {
    setExpiration(value);
    onChange?.({ effective_date: effective || null, expiration_date: value || null });
  };

  const inputClass = compact
    ? "px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
    : "form-input";

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        className={inputClass}
        value={effective}
        onChange={(e) => handleEffectiveChange(e.target.value)}
      />
      <span className="text-gray-500">to</span>
      <input
        type="date"
        className={inputClass}
        value={expiration}
        onChange={(e) => handleExpirationChange(e.target.value)}
      />
    </div>
  );
}
