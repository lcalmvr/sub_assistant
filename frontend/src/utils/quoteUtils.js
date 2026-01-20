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
