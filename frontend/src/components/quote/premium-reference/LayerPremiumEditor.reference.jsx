/**
 * LayerPremiumEditor - Annual-first premium input for tower layers
 *
 * Implements the annual-first premium model:
 * 1. User enters annual premium (12-month baseline)
 * 2. System shows calculated actual premium based on term
 * 3. User can override with minimum/flat if needed
 *
 * Props:
 * - layer: The layer object with premium fields
 * - termStart: Effective start date (resolved from layer/structure/submission)
 * - termEnd: Effective end date
 * - onChange: (updates) => void - called with { annual_premium, actual_premium, premium_basis }
 * - compact: boolean - use compact layout
 * - disabled: boolean - disable editing
 */

import { useState, useEffect, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  PREMIUM_BASIS,
  PREMIUM_BASIS_LABELS,
  getProRataFactor,
  getTheoreticalProRata,
  getDaysBetween,
  getAnnualPremium,
  getActualPremium,
} from '../utils/premiumUtils';

function formatNumberWithCommas(value) {
  if (!value && value !== 0) return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('en-US').format(num);
}

function parseFormattedNumber(value) {
  if (!value) return '';
  return value.replace(/[^0-9.]/g, '');
}

export default function LayerPremiumEditor({
  layer,
  termStart,
  termEnd,
  onChange,
  compact = false,
  disabled = false,
}) {
  // Local state for the input
  const [annualInput, setAnnualInput] = useState('');
  const [minimumInput, setMinimumInput] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  // Derive values from layer
  const annualPremium = getAnnualPremium(layer);
  const actualPremium = getActualPremium(layer);
  const premiumBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;

  // Calculate term info
  const proRataFactor = getProRataFactor(termStart, termEnd);
  const isShortTerm = proRataFactor < 0.95;
  const termDays = getDaysBetween(termStart, termEnd);
  const theoreticalProRata = getTheoreticalProRata(annualPremium, termStart, termEnd);

  // Initialize local state from layer
  useEffect(() => {
    setAnnualInput(annualPremium ? formatNumberWithCommas(annualPremium) : '');

    // Show override if basis is minimum or flat
    if (premiumBasis === PREMIUM_BASIS.MINIMUM || premiumBasis === PREMIUM_BASIS.FLAT) {
      setShowOverride(true);
      setMinimumInput(actualPremium ? formatNumberWithCommas(actualPremium) : '');
    } else {
      setShowOverride(false);
      setMinimumInput('');
    }
  }, [layer.annual_premium, layer.actual_premium, layer.premium_basis]);

  // Handle annual premium change
  const handleAnnualChange = (e) => {
    const formatted = e.target.value;
    setAnnualInput(formatted);

    const parsed = parseFormattedNumber(formatted);
    const newAnnual = parsed ? Number(parsed) : null;

    // Calculate new actual based on current basis
    let newActual = newAnnual;
    let newBasis = premiumBasis;

    if (isShortTerm && newAnnual) {
      if (showOverride && minimumInput) {
        // Keep the override
        const minValue = Number(parseFormattedNumber(minimumInput));
        const proRata = getTheoreticalProRata(newAnnual, termStart, termEnd);
        newActual = Math.max(proRata, minValue);
        newBasis = PREMIUM_BASIS.MINIMUM;
      } else {
        // Default to pro-rata for short-term
        newActual = getTheoreticalProRata(newAnnual, termStart, termEnd);
        newBasis = PREMIUM_BASIS.PRO_RATA;
      }
    }

    onChange({
      annual_premium: newAnnual,
      actual_premium: newActual,
      premium_basis: newBasis,
    });
  };

  // Handle minimum/override toggle
  const handleOverrideToggle = () => {
    const newShowOverride = !showOverride;
    setShowOverride(newShowOverride);

    if (newShowOverride) {
      // Switching to override mode - keep actual as-is, change basis
      setMinimumInput(actualPremium ? formatNumberWithCommas(actualPremium) : '');
      onChange({
        annual_premium: annualPremium,
        actual_premium: actualPremium,
        premium_basis: PREMIUM_BASIS.MINIMUM,
      });
    } else {
      // Switching off override - recalculate actual from annual
      const newActual = isShortTerm
        ? getTheoreticalProRata(annualPremium, termStart, termEnd)
        : annualPremium;
      const newBasis = isShortTerm ? PREMIUM_BASIS.PRO_RATA : PREMIUM_BASIS.ANNUAL;

      onChange({
        annual_premium: annualPremium,
        actual_premium: newActual,
        premium_basis: newBasis,
      });
    }
  };

  // Handle minimum value change
  const handleMinimumChange = (e) => {
    const formatted = e.target.value;
    setMinimumInput(formatted);

    const parsed = parseFormattedNumber(formatted);
    const minValue = parsed ? Number(parsed) : null;

    if (minValue && annualPremium) {
      const proRata = getTheoreticalProRata(annualPremium, termStart, termEnd);
      const newActual = Math.max(proRata || 0, minValue);

      onChange({
        annual_premium: annualPremium,
        actual_premium: newActual,
        premium_basis: PREMIUM_BASIS.MINIMUM,
      });
    }
  };

  if (compact) {
    // Compact mode: just the annual input with indicator
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          className="w-24 text-sm font-medium text-green-700 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none text-right disabled:bg-gray-50 disabled:text-gray-500"
          value={annualInput}
          placeholder="—"
          onChange={handleAnnualChange}
          disabled={disabled}
        />
        {isShortTerm && annualPremium && actualPremium !== annualPremium && (
          <span className="text-[10px] text-amber-600" title={`${termDays}-day term, actual: $${actualPremium?.toLocaleString()}`}>
            *
          </span>
        )}
      </div>
    );
  }

  // Full mode: annual input + pro-rata info + override option
  return (
    <div className="space-y-2">
      {/* Annual Premium Input */}
      <div>
        <label className="text-[10px] text-gray-400 uppercase block mb-1">
          Annual Premium
        </label>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">$</span>
          <input
            type="text"
            inputMode="numeric"
            className="w-28 text-sm font-medium text-green-700 bg-white border border-gray-200 rounded px-2 py-1.5 focus:border-purple-500 outline-none text-right disabled:bg-gray-50 disabled:text-gray-500"
            value={annualInput}
            placeholder="0"
            onChange={handleAnnualChange}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Term & Pro-rata Info (only show if short-term and has annual) */}
      {isShortTerm && annualPremium > 0 && (
        <div className="bg-amber-50 rounded-md px-3 py-2 text-xs">
          <div className="flex items-center justify-between text-amber-700">
            <span>{termDays}-day term</span>
            <span>Pro-rata: ${theoreticalProRata?.toLocaleString()}</span>
          </div>

          {/* Override Toggle */}
          <div className="mt-2 pt-2 border-t border-amber-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOverride}
                onChange={handleOverrideToggle}
                disabled={disabled}
                className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-amber-800">Minimum premium applies</span>
            </label>

            {showOverride && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-amber-600 text-sm">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-24 text-sm font-medium text-amber-700 bg-white border border-amber-300 rounded px-2 py-1 focus:border-amber-500 outline-none text-right disabled:bg-gray-50"
                  value={minimumInput}
                  placeholder="0"
                  onChange={handleMinimumChange}
                  disabled={disabled}
                />
                <span className="text-amber-600 text-xs">actual</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actual Premium Display (for full-term or when override is set) */}
      {(!isShortTerm || !annualPremium) && annualPremium > 0 && (
        <div className="text-xs text-gray-500">
          Actual: ${actualPremium?.toLocaleString() || '—'}
          {premiumBasis !== PREMIUM_BASIS.ANNUAL && (
            <span className="ml-1 text-amber-600">({PREMIUM_BASIS_LABELS[premiumBasis]})</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline version for use in tables with popover for minimum override
 */
export function LayerPremiumInput({
  layer,
  termStart,
  termEnd,
  onChange,
  disabled = false,
  inputRef,
  onKeyDown,
}) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [localAnnual, setLocalAnnual] = useState('');
  const [localMinimum, setLocalMinimum] = useState('');
  const minimumInputRef = useRef(null);

  const annualPremium = getAnnualPremium(layer);
  const actualPremium = getActualPremium(layer);
  const premiumBasis = layer.premium_basis || PREMIUM_BASIS.ANNUAL;

  const proRataFactor = getProRataFactor(termStart, termEnd);
  const isShortTerm = proRataFactor < 0.95;
  const termDays = getDaysBetween(termStart, termEnd);
  const theoreticalProRata = getTheoreticalProRata(annualPremium, termStart, termEnd);

  const hasMinimumOverride = premiumBasis === PREMIUM_BASIS.MINIMUM;
  const hasAdjustment = isShortTerm && annualPremium && actualPremium !== annualPremium;

  // Sync local state when layer changes
  useEffect(() => {
    setLocalAnnual(annualPremium ? formatNumberWithCommas(annualPremium) : '');
    if (hasMinimumOverride) {
      setLocalMinimum(actualPremium ? formatNumberWithCommas(actualPremium) : '');
    }
  }, [annualPremium, actualPremium, hasMinimumOverride]);

  // Handle annual premium change
  const handleAnnualChange = (e) => {
    const value = e.target.value;
    setLocalAnnual(value);

    const parsed = parseFormattedNumber(value);
    const newAnnual = parsed ? Number(parsed) : null;

    // Calculate actual based on term and current override state
    let newActual = newAnnual;
    let newBasis = PREMIUM_BASIS.ANNUAL;

    if (isShortTerm && newAnnual) {
      if (hasMinimumOverride && localMinimum) {
        // Maintain minimum override
        const minValue = Number(parseFormattedNumber(localMinimum));
        const proRata = getTheoreticalProRata(newAnnual, termStart, termEnd);
        newActual = Math.max(proRata, minValue);
        newBasis = PREMIUM_BASIS.MINIMUM;
      } else {
        // Default to pro-rata
        newActual = getTheoreticalProRata(newAnnual, termStart, termEnd);
        newBasis = PREMIUM_BASIS.PRO_RATA;
      }
    }

    onChange({
      annual_premium: newAnnual,
      actual_premium: newActual,
      premium_basis: newBasis,
      premium: newActual, // Keep legacy field in sync
    });
  };

  // Handle enabling minimum premium
  const handleEnableMinimum = () => {
    // Default minimum to actual premium or theoretical pro-rata
    const defaultMin = actualPremium || theoreticalProRata || annualPremium;
    setLocalMinimum(formatNumberWithCommas(defaultMin));

    onChange({
      annual_premium: annualPremium,
      actual_premium: defaultMin,
      premium_basis: PREMIUM_BASIS.MINIMUM,
      premium: defaultMin,
    });

    // Focus the minimum input
    setTimeout(() => minimumInputRef.current?.focus(), 50);
  };

  // Handle disabling minimum premium (revert to pro-rata)
  const handleDisableMinimum = () => {
    const newActual = isShortTerm
      ? getTheoreticalProRata(annualPremium, termStart, termEnd)
      : annualPremium;
    const newBasis = isShortTerm ? PREMIUM_BASIS.PRO_RATA : PREMIUM_BASIS.ANNUAL;

    setLocalMinimum('');

    onChange({
      annual_premium: annualPremium,
      actual_premium: newActual,
      premium_basis: newBasis,
      premium: newActual,
    });
  };

  // Handle minimum value change
  const handleMinimumChange = (e) => {
    const value = e.target.value;
    setLocalMinimum(value);

    const parsed = parseFormattedNumber(value);
    const minValue = parsed ? Number(parsed) : null;

    if (minValue && annualPremium) {
      const proRata = theoreticalProRata || 0;
      const newActual = Math.max(proRata, minValue);

      onChange({
        annual_premium: annualPremium,
        actual_premium: newActual,
        premium_basis: PREMIUM_BASIS.MINIMUM,
        premium: newActual,
      });
    }
  };

  return (
    <div className="flex flex-col items-end">
      {/* Annual Premium Input */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="w-24 text-sm font-medium text-green-700 bg-white border border-gray-200 rounded px-2 py-1 focus:border-purple-500 outline-none text-right"
        value={localAnnual}
        placeholder="—"
        onChange={handleAnnualChange}
        onKeyDown={onKeyDown}
        disabled={disabled}
      />

      {/* Short-term indicator with popover for minimum override */}
      {isShortTerm && annualPremium > 0 && (
        <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <Popover.Trigger asChild>
            <button
              className={`text-[10px] mt-0.5 px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                hasMinimumOverride
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'text-green-100 text-green-700 hover:bg-green-200'
              }`}
              title="Click to set minimum premium"
            >
              {hasMinimumOverride ? (
                <span>${actualPremium?.toLocaleString()} min</span>
              ) : (
                <span>${theoreticalProRata?.toLocaleString()}</span>
              )}
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-64 z-50"
              sideOffset={5}
              align="end"
            >
              {/* Term Info */}
              <div className="text-xs text-gray-500 mb-3">
                {termDays}-day term ({Math.round(proRataFactor * 100)}% of year)
              </div>

              {/* Premium Info */}
              <div className="space-y-1.5 text-sm mb-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Annual rate:</span>
                  <span className="text-gray-700">${annualPremium?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Pro-rata ({termDays}d):</span>
                  <span className="text-gray-700">${theoreticalProRata?.toLocaleString()}</span>
                </div>
              </div>

              {/* Minimum Override Section */}
              <div className="border-t border-gray-100 pt-3">
                {hasMinimumOverride ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-amber-700 font-medium">Minimum:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">$</span>
                        <input
                          ref={minimumInputRef}
                          type="text"
                          inputMode="numeric"
                          className="w-20 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 focus:border-amber-400 outline-none text-right"
                          value={localMinimum}
                          onChange={handleMinimumChange}
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleDisableMinimum}
                      className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
                    >
                      Use pro-rata instead
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleEnableMinimum}
                    className="w-full text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded py-1.5 font-medium transition-colors"
                  >
                    Apply minimum premium
                  </button>
                )}
              </div>

              <Popover.Arrow className="fill-white" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}
