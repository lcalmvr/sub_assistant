/**
 * Premium & Term Utilities
 *
 * Handles the three-tier premium model:
 * - annual_premium: 12-month baseline rate
 * - actual_premium: What's charged this term
 * - premium_basis: How actual was derived ('annual', 'pro_rata', 'minimum', 'flat')
 *
 * Also handles per-layer term overrides for non-concurrent towers.
 */

// Premium basis options
export const PREMIUM_BASIS = {
  ANNUAL: 'annual',      // Full 12-month term, actual = annual
  PRO_RATA: 'pro_rata',  // Standard pro-rata calculation
  MINIMUM: 'minimum',    // Carrier minimum applies
  FLAT: 'flat',          // Flat charge regardless of term
};

export const PREMIUM_BASIS_LABELS = {
  [PREMIUM_BASIS.ANNUAL]: 'Annual',
  [PREMIUM_BASIS.PRO_RATA]: 'Pro-rata',
  [PREMIUM_BASIS.MINIMUM]: 'Minimum',
  [PREMIUM_BASIS.FLAT]: 'Flat',
};

/**
 * Normalize a layer from potentially legacy format to new format.
 * Handles backward compatibility with existing data.
 */
export function normalizeLayer(layer) {
  if (!layer) return layer;

  return {
    ...layer,

    // If new fields missing, derive from legacy premium
    annual_premium: layer.annual_premium ?? layer.premium ?? null,
    actual_premium: layer.actual_premium ?? layer.premium ?? null,
    premium_basis: layer.premium_basis ?? PREMIUM_BASIS.ANNUAL,

    // Keep legacy field in sync for any code still reading it
    premium: layer.actual_premium ?? layer.premium ?? null,

    // Term fields default to null (inherit from structure)
    term_start: layer.term_start ?? null,
    term_end: layer.term_end ?? null,
  };
}

/**
 * Serialize a layer for saving, ensuring backward compatibility.
 */
export function serializeLayer(layer) {
  const serialized = {
    ...layer,

    // Always write both for backward compat
    premium: layer.actual_premium ?? layer.premium,
    actual_premium: layer.actual_premium ?? layer.premium,
    annual_premium: layer.annual_premium,
    premium_basis: layer.premium_basis ?? PREMIUM_BASIS.ANNUAL,
  };

  // Only include term if custom (save space, cleaner data)
  // Note: term_start can be set alone (term_end inherits from policy)
  if (layer.term_start) {
    serialized.term_start = layer.term_start;
  } else {
    delete serialized.term_start;
  }
  if (layer.term_end) {
    serialized.term_end = layer.term_end;
  } else {
    delete serialized.term_end;
  }

  return serialized;
}

/**
 * Normalize all layers in a tower.
 */
export function normalizeTower(towerJson) {
  if (!towerJson || !Array.isArray(towerJson)) return [];
  return towerJson.map(normalizeLayer);
}

/**
 * Serialize all layers in a tower for saving.
 */
export function serializeTower(layers) {
  if (!layers || !Array.isArray(layers)) return [];
  return layers.map(serializeLayer);
}

// === Term Calculations ===

/**
 * Calculate days between two dates.
 */
export function getDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 365;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}

/**
 * Calculate pro-rata factor from dates.
 * Returns 1.0 for full year, < 1 for short term.
 */
export function getProRataFactor(termStart, termEnd) {
  if (!termStart || !termEnd) return 1;
  const days = getDaysBetween(termStart, termEnd);
  return days / 365;
}

/**
 * Get effective term for a layer, resolving inheritance chain.
 * Priority: layer -> structure -> submission
 */
export function getEffectiveTerm(layer, structure, submission) {
  // Layer override takes precedence
  if (layer?.term_start && layer?.term_end) {
    return {
      start: layer.term_start,
      end: layer.term_end,
      source: 'layer',
    };
  }

  // Structure override
  const structStart = structure?.effective_date_override || structure?.effective_date;
  const structEnd = structure?.expiration_date_override || structure?.expiration_date;
  if (structStart && structEnd) {
    return {
      start: structStart,
      end: structEnd,
      source: 'structure',
    };
  }

  // Submission default
  if (submission?.effective_date && submission?.expiration_date) {
    return {
      start: submission.effective_date,
      end: submission.expiration_date,
      source: 'submission',
    };
  }

  return { start: null, end: null, source: null };
}

/**
 * Check if a layer has a custom term (different from inherited).
 * Note: Only checks term_start since term_end always inherits from policy.
 */
export function hasCustomTerm(layer) {
  return !!layer?.term_start;
}

/**
 * Get inherited effective date for a layer in a tower.
 * Layers inherit from the layer below (lower attachment) unless they have their own term_start.
 *
 * @param {Array} tower - Tower array sorted by attachment (index 0 = lowest/primary)
 * @param {number} layerIndex - Index of the layer in the tower
 * @param {string} policyEffective - Default effective date from policy/structure
 * @returns {{ date: string|null, inherited: boolean, sourceIndex: number|null }}
 */
export function getInheritedEffectiveDate(tower, layerIndex, policyEffective) {
  if (!tower || layerIndex < 0 || layerIndex >= tower.length) {
    return { date: policyEffective, inherited: true, sourceIndex: null };
  }

  const layer = tower[layerIndex];

  // If this layer has its own term_start, use it
  if (layer?.term_start) {
    return { date: layer.term_start, inherited: false, sourceIndex: layerIndex };
  }

  // Walk down to lower layers (lower indices = lower attachment) to find inherited date
  for (let i = layerIndex - 1; i >= 0; i--) {
    if (tower[i]?.term_start) {
      return { date: tower[i].term_start, inherited: true, sourceIndex: i };
    }
  }

  // No layer below has a term_start, use policy effective
  return { date: policyEffective, inherited: true, sourceIndex: null };
}

/**
 * Group tower layers into blocks by their effective date.
 * Returns array of { startIndex, endIndex, effectiveDate, isExplicit }
 *
 * @param {Array} tower - Tower array sorted by attachment (index 0 = lowest/primary)
 * @param {string} policyEffective - Default effective date from policy/structure
 */
export function getTowerDateBlocks(tower, policyEffective) {
  if (!tower || tower.length === 0) return [];

  const blocks = [];
  let currentBlockStart = 0;
  let currentDate = tower[0]?.term_start || policyEffective;
  let currentIsExplicit = !!tower[0]?.term_start;

  for (let i = 1; i < tower.length; i++) {
    const layer = tower[i];
    if (layer?.term_start) {
      // This layer starts a new block
      blocks.push({
        startIndex: currentBlockStart,
        endIndex: i - 1,
        effectiveDate: currentDate,
        isExplicit: currentIsExplicit,
      });
      currentBlockStart = i;
      currentDate = layer.term_start;
      currentIsExplicit = true;
    }
  }

  // Push the last block
  blocks.push({
    startIndex: currentBlockStart,
    endIndex: tower.length - 1,
    effectiveDate: currentDate,
    isExplicit: currentIsExplicit,
  });

  return blocks;
}

/**
 * Check if a layer is short-term (< 95% of a year).
 */
export function isShortTerm(layer, structure, submission) {
  const term = getEffectiveTerm(layer, structure, submission);
  const factor = getProRataFactor(term.start, term.end);
  return factor < 0.95; // Less than ~347 days
}

// === Premium Calculations ===

/**
 * Calculate theoretical pro-rata premium from annual.
 */
export function getTheoreticalProRata(annualPremium, termStart, termEnd) {
  if (!annualPremium) return null;
  const factor = getProRataFactor(termStart, termEnd);
  return Math.round(annualPremium * factor);
}

/**
 * Calculate actual premium based on basis and inputs.
 */
export function calculateActualPremium({
  annualPremium,
  termStart,
  termEnd,
  premiumBasis,
  minimumPremium = null,
  flatPremium = null,
}) {
  if (!annualPremium) return null;

  switch (premiumBasis) {
    case PREMIUM_BASIS.ANNUAL:
      return annualPremium;

    case PREMIUM_BASIS.PRO_RATA: {
      return getTheoreticalProRata(annualPremium, termStart, termEnd);
    }

    case PREMIUM_BASIS.MINIMUM: {
      const proRata = getTheoreticalProRata(annualPremium, termStart, termEnd);
      return Math.max(proRata, minimumPremium || 0);
    }

    case PREMIUM_BASIS.FLAT:
      return flatPremium ?? annualPremium;

    default:
      return annualPremium;
  }
}

/**
 * Calculate premium variance (actual vs theoretical pro-rata).
 * Positive = paying more than pro-rata (e.g., minimum applied).
 */
export function getPremiumVariance(layer, structure, submission) {
  const term = getEffectiveTerm(layer, structure, submission);
  const annual = layer.annual_premium ?? layer.premium;
  const actual = layer.actual_premium ?? layer.premium;

  if (!annual || !actual) return 0;

  const theoretical = getTheoreticalProRata(annual, term.start, term.end);
  return actual - theoretical;
}

/**
 * Get display premium based on view mode.
 */
export function getDisplayPremium(layer, viewMode = 'actual') {
  if (viewMode === 'annual') {
    return layer.annual_premium ?? layer.actual_premium ?? layer.premium;
  }
  return layer.actual_premium ?? layer.premium;
}

/**
 * Get the annual premium for a layer (for ILF, rate comparison, etc).
 */
export function getAnnualPremium(layer) {
  return layer.annual_premium ?? layer.actual_premium ?? layer.premium ?? 0;
}

/**
 * Get the actual premium for a layer (for binding, invoicing, etc).
 */
export function getActualPremium(layer) {
  return layer.actual_premium ?? layer.premium ?? 0;
}

// === Tower Aggregations ===

/**
 * Get tower totals for both views.
 */
export function getTowerTotals(layers) {
  if (!layers || !Array.isArray(layers)) {
    return { actualTotal: 0, annualTotal: 0 };
  }

  return layers.reduce(
    (acc, layer) => ({
      actualTotal: acc.actualTotal + getActualPremium(layer),
      annualTotal: acc.annualTotal + getAnnualPremium(layer),
    }),
    { actualTotal: 0, annualTotal: 0 }
  );
}

/**
 * Check if tower has any non-concurrent layers (different terms).
 */
export function hasNonConcurrentLayers(layers, structure, submission) {
  if (!layers || layers.length < 2) return false;

  const terms = layers.map((layer) => {
    const term = getEffectiveTerm(layer, structure, submission);
    return `${term.start}-${term.end}`;
  });

  const uniqueTerms = new Set(terms);
  return uniqueTerms.size > 1;
}

/**
 * Check if tower has any layers with actual != annual (minimum, flat, etc).
 */
export function hasAdjustedPremiums(layers) {
  if (!layers) return false;

  return layers.some((layer) => {
    const annual = layer.annual_premium ?? layer.premium;
    const actual = layer.actual_premium ?? layer.premium;
    return annual && actual && Math.abs(annual - actual) > 0.01;
  });
}

// === ILF Calculations ===

/**
 * Calculate ILF using annualized premiums (correct normalization).
 * ILF should always compare annual-to-annual for meaningful results.
 */
export function calculateNormalizedILF(layers, targetIdx) {
  if (!layers || targetIdx <= 0) return 1.0;

  const targetLayer = layers[targetIdx];
  const primaryLayer = layers[0];

  // Always use annual premium for ILF comparison
  const targetAnnual = getAnnualPremium(targetLayer);
  const primaryAnnual = getAnnualPremium(primaryLayer);

  if (!primaryAnnual || primaryAnnual === 0) return null;

  return targetAnnual / primaryAnnual;
}

/**
 * Get cumulative ILF up to a layer.
 */
export function getCumulativeILF(layers, targetIdx) {
  if (!layers || targetIdx < 0) return 0;

  const primaryAnnual = getAnnualPremium(layers[0]);
  if (!primaryAnnual || primaryAnnual === 0) return null;

  let cumulative = 0;
  for (let i = 0; i <= targetIdx; i++) {
    cumulative += getAnnualPremium(layers[i]);
  }

  return cumulative / primaryAnnual;
}

// === Rate Change Calculations ===

/**
 * Calculate rate change percentage between two annual premiums.
 * Always uses annual-to-annual for accurate comparison.
 */
export function calculateRateChange(priorAnnual, currentAnnual) {
  if (!priorAnnual || priorAnnual === 0) return null;
  return ((currentAnnual - priorAnnual) / priorAnnual) * 100;
}

/**
 * Format rate change as string with sign.
 */
export function formatRateChange(rateChange) {
  if (rateChange === null || rateChange === undefined) return '—';
  const sign = rateChange >= 0 ? '+' : '';
  return `${sign}${rateChange.toFixed(1)}%`;
}

// === Display Helpers ===

/**
 * Get premium footnote for short-term or adjusted layers.
 */
export function getPremiumFootnote(layer, structure, submission) {
  const notes = [];

  // Check for custom term
  const term = getEffectiveTerm(layer, structure, submission);
  const factor = getProRataFactor(term.start, term.end);

  if (factor < 0.95) {
    const days = getDaysBetween(term.start, term.end);
    const annual = getAnnualPremium(layer);
    notes.push(`${days}-day term, $${annual.toLocaleString()} annualized`);
  }

  // Check for premium basis
  if (layer.premium_basis && layer.premium_basis !== PREMIUM_BASIS.ANNUAL) {
    const label = PREMIUM_BASIS_LABELS[layer.premium_basis];
    if (label && !notes.length) {
      notes.push(`${label} premium`);
    }
  }

  return notes.join('; ');
}

/**
 * Format term for display.
 */
export function formatTerm(termStart, termEnd) {
  if (!termStart || !termEnd) return 'TBD';

  const formatDate = (dateStr) => {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return `${formatDate(termStart)} — ${formatDate(termEnd)}`;
}

/**
 * Format term duration.
 */
export function formatTermDuration(termStart, termEnd) {
  if (!termStart || !termEnd) return '—';

  const days = getDaysBetween(termStart, termEnd);
  if (days >= 360 && days <= 370) return '12 months';
  if (days >= 28 && days <= 31) return '1 month';

  const months = Math.round(days / 30.44);
  if (months >= 1 && months <= 12) return `${months} month${months > 1 ? 's' : ''}`;

  return `${days} days`;
}
