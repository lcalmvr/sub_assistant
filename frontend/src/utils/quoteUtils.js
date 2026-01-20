// ============================================================================
// QUOTE PAGE UTILITIES
// Extracted from QuotePageV3.jsx
// ============================================================================

/**
 * Format a number as USD currency
 */
export function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a number as compact currency (e.g., $5M, $500K)
 */
export function formatCompact(value) {
  if (!value && value !== 0) return '—';
  if (value >= 1_000_000) return `$${value / 1_000_000}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

/**
 * Format a date string as "Mon DD, YYYY"
 */
export function formatDate(val) {
  if (!val) return '—';
  const date = new Date(`${val}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a date range as "Mon DD, YYYY — Mon DD, YYYY"
 */
export function formatDateRange(start, end) {
  if (!start && !end) return '—';
  return `${formatDate(start)} — ${formatDate(end)}`;
}

/**
 * Format a number with commas (e.g., 1,000,000)
 */
export function formatNumberWithCommas(value) {
  if (!value && value !== 0) return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Parse a formatted number string back to numeric digits
 */
export function parseFormattedNumber(value) {
  if (!value) return '';
  return value.replace(/[^0-9.]/g, '');
}

/**
 * Normalize text for comparison (trim and lowercase)
 */
export function normalizeText(value) {
  return (value || '').trim().toLowerCase();
}

/**
 * Parse quote IDs from various formats (array, string, postgres array format)
 */
export function parseQuoteIds(quoteIds) {
  if (!quoteIds) return [];
  if (Array.isArray(quoteIds)) return quoteIds.map(id => String(id));
  if (typeof quoteIds === 'string') {
    return quoteIds
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Calculate attachment point for a layer in a tower
 */
export function calculateAttachment(layers, targetIdx) {
  if (!layers || targetIdx <= 0) return 0;

  const targetLayer = layers[targetIdx];
  let effectiveIdx = targetIdx;

  if (targetLayer?.quota_share) {
    const qsFullLayer = targetLayer.quota_share;
    while (effectiveIdx > 0 && layers[effectiveIdx - 1]?.quota_share === qsFullLayer) {
      effectiveIdx--;
    }
  }

  let attachment = 0;
  let i = 0;
  while (i < effectiveIdx) {
    const layer = layers[i];
    if (layer.quota_share) {
      attachment += layer.quota_share;
      while (i < effectiveIdx && layers[i]?.quota_share === layer.quota_share) i++;
    } else {
      attachment += layer.limit || 0;
      i++;
    }
  }
  return attachment;
}

/**
 * Recalculate attachments for all layers in a tower
 */
export function recalculateAttachments(layers) {
  if (!layers?.length) return layers;
  return layers.map((layer, idx) => ({
    ...layer,
    attachment: calculateAttachment(layers, idx),
  }));
}

/**
 * Determine if a structure is primary or excess based on tower structure
 */
export function getStructurePosition(structure) {
  // Derive position from tower structure - if CMAI has attachment > 0, it's excess
  const tower = structure?.tower_json || [];
  if (tower.length === 0) {
    // Fallback to stored position if no tower data
    return structure?.position === 'excess' ? 'excess' : 'primary';
  }
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  if (cmaiIdx < 0) {
    return structure?.position === 'excess' ? 'excess' : 'primary';
  }
  // Calculate attachment - sum of limits below CMAI layer
  const attachment = calculateAttachment(tower, cmaiIdx);
  return attachment > 0 ? 'excess' : 'primary';
}

/**
 * Get target quote IDs based on scope selection
 */
export function getScopeTargetIds(structures, scope, currentId) {
  if (!structures?.length) return [];
  if (scope === 'single') return [String(currentId)];
  if (scope === 'primary') {
    return structures.filter(s => getStructurePosition(s) === 'primary').map(s => String(s.id));
  }
  if (scope === 'excess') {
    return structures.filter(s => getStructurePosition(s) === 'excess').map(s => String(s.id));
  }
  return structures.map(s => String(s.id));
}

/**
 * Generate a descriptive name for a quote option based on its tower structure
 */
export function generateOptionName(quote) {
  const tower = quote.tower_json || [];
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  const cmaiLayer = cmaiIdx >= 0 ? tower[cmaiIdx] : tower[0];
  if (!cmaiLayer) return 'Option';

  const limit = cmaiLayer.limit || 0;
  const limitStr = formatCompact(limit);
  const qsStr = cmaiLayer.quota_share ? ` po ${formatCompact(cmaiLayer.quota_share)}` : '';

  // Check if CMAI is an excess layer within the tower (has attachment > 0)
  const cmaiAttachment = cmaiIdx >= 0 ? calculateAttachment(tower, cmaiIdx) : 0;
  if (cmaiAttachment > 0) {
    return `${limitStr}${qsStr} xs ${formatCompact(cmaiAttachment)}`;
  }

  const retention = tower[0]?.retention || 25000;
  return `${limitStr} x ${formatCompact(retention)}`;
}

/**
 * Normalize retro schedule for comparison (JSON string)
 */
export function normalizeRetroSchedule(schedule) {
  if (!schedule || schedule.length === 0) return '[]';
  const normalized = schedule.map(entry => {
    const obj = { coverage: entry.coverage, retro: entry.retro };
    if (entry.retro === 'date' && entry.date) obj.date = entry.date;
    if (entry.retro === 'custom' && entry.custom_text) obj.custom_text = entry.custom_text;
    return obj;
  }).sort((a, b) => (a.coverage || '').localeCompare(b.coverage || ''));
  return JSON.stringify(normalized);
}

/**
 * Format retro schedule as human-readable summary
 */
export function formatRetroSummary(schedule) {
  if (!schedule || schedule.length === 0) return 'Full Prior Acts';

  // Coverage abbreviations
  const covAbbrev = {
    cyber: 'Cyber',
    tech_eo: 'Tech',
    do: 'D&O',
    epl: 'EPL',
    fiduciary: 'Fid',
  };

  // Retro labels (no abbreviations - need to be readable)
  const retroLabel = (entry) => {
    if (entry.retro === 'full_prior_acts') return 'Full Prior Acts';
    if (entry.retro === 'follow_form') return 'Follow Form';
    if (entry.retro === 'inception') return 'Inception';
    if (entry.retro === 'date') return entry.date || 'Date';
    if (entry.retro === 'custom') return entry.custom_text || 'custom';
    return entry.retro || '—';
  };

  // Check if all coverages have the same retro
  const uniqueRetros = new Set(schedule.map(e => e.retro));
  if (uniqueRetros.size === 1) {
    const label = retroLabel(schedule[0]);
    // Show coverages for context: "Cyber, Tech: Inception"
    const coverageList = schedule.map(e => covAbbrev[e.coverage] || e.coverage).join(', ');
    return `${coverageList}: ${label}`;
  }

  // Mixed - show each coverage with its retro on separate lines
  return schedule
    .map(entry => `${covAbbrev[entry.coverage] || entry.coverage}: ${retroLabel(entry)}`)
    .join('\n');
}

/**
 * Format comparison text for subjectivities/endorsements alignment display
 */
export function formatComparisonText(missing, extra) {
  const missingCount = missing.length;
  const extraCount = extra.length;

  if (missingCount === 0 && extraCount === 0) {
    return { text: 'Aligned', tone: 'text-gray-500' };
  }
  if (missingCount > 0 && extraCount === 0) {
    return { text: `${missingCount} missing`, tone: 'text-amber-600' };
  }
  if (missingCount === 0 && extraCount > 0) {
    return { text: `${extraCount} extra`, tone: 'text-purple-600' };
  }
  return { text: `Mixed +${extraCount}, −${missingCount}`, tone: 'text-amber-600' };
}
