import { useState } from 'react';

/**
 * Format revenue as abbreviated string ($12.0M, $1.2B, etc.)
 */
function formatMoneyShort(value) {
  if (value == null) return null;
  if (value >= 1_000_000_000) {
    const b = value / 1_000_000_000;
    return `$${b >= 10 ? b.toFixed(0) : b.toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

/**
 * Format date string (YYYY-MM-DD or Date) to "Jan 30, 2026"
 */
function formatDate(dateVal) {
  if (!dateVal) return null;
  let year, month, day;
  if (typeof dateVal === 'string' && dateVal.includes('-')) {
    [year, month, day] = dateVal.split('-').map(Number);
  } else {
    const d = new Date(dateVal);
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${day}, ${year}`;
}

/**
 * Format date range for policy period
 */
function formatDateRange(start, end) {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e) return `${s} – ${e}`;
  if (s) return `${s} – TBD`;
  return null;
}

/**
 * Copy icon (inline SVG)
 */
function CopyIcon({ className = "w-3 h-3" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

/**
 * Copiable text with feedback
 */
function CopyableText({ text, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <span className="inline-flex items-center gap-1 group">
      <span className="truncate" title={text}>{label || text}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 p-0.5"
        title="Copy"
      >
        {copied ? (
          <span className="text-xs text-green-600">Copied</span>
        ) : (
          <CopyIcon />
        )}
      </button>
    </span>
  );
}

/**
 * Metadata cell component for consistent styling
 */
function MetadataCell({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-0.5">
        {label}
      </div>
      <div className="text-sm text-slate-800">
        {children}
      </div>
    </div>
  );
}

/**
 * SubmissionHeaderCard - Premium underwriting-style header
 *
 * Props:
 *   submission: {
 *     insuredName, industryLabel, revenue,
 *     address1, address2, city, state, zip,
 *     brokerName, brokerCompany, brokerEmail, brokerPhone,
 *     policyStart, policyEnd, status, updatedAt
 *   }
 *   onEdit: () => void
 *   dense: boolean - compact mode for doc-view
 */
export default function SubmissionHeaderCard({ submission, onEdit, dense = false }) {
  if (!submission) return null;

  const {
    insuredName,
    industryLabel,
    revenue,
    address1,
    address2,
    city,
    state,
    zip,
    brokerName,
    brokerCompany,
    brokerEmail,
    brokerPhone,
    policyStart,
    policyEnd,
    status,
  } = submission;

  // Format address
  const addressParts = [address1, address2].filter(Boolean);
  const cityStateZip = [city, state].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');
  if (cityStateZip) addressParts.push(cityStateZip);
  const fullAddress = addressParts.join(', ') || null;

  // Format broker line
  const brokerLine = [brokerName, brokerCompany].filter(Boolean).join(' — ') || null;

  // Format policy period
  const policyPeriod = formatDateRange(policyStart, policyEnd);

  // Status display
  const displayStatus = status || 'Draft';

  // --- COMPACT MODE ---
  if (dense) {
    return (
      <div className="rounded-xl border border-slate-200 border-l-4 border-l-violet-500/60 bg-slate-50 shadow-sm p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title + pills */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900 truncate">
              {insuredName || 'Unnamed Submission'}
            </h2>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 flex-shrink-0">
              {industryLabel || '—'}
            </span>
            {revenue && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 flex-shrink-0">
                {formatMoneyShort(revenue)}
              </span>
            )}
          </div>

          {/* Center: Compact metadata */}
          <div className="hidden md:flex items-center gap-4 text-xs text-slate-600 flex-shrink-0">
            {fullAddress && (
              <span className="truncate max-w-[180px]" title={fullAddress}>{fullAddress}</span>
            )}
            <span className="text-slate-300">|</span>
            <span>{brokerName || '—'}</span>
            <span className="text-slate-300">|</span>
            <span>{policyPeriod || 'TBD'}</span>
          </div>

          {/* Right: Status + Edit */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-white">
              {displayStatus}
            </span>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- DEFAULT MODE ---
  return (
    <div className="rounded-xl border border-slate-200 border-l-4 border-l-violet-500/60 bg-slate-50 shadow-sm transition-shadow hover:shadow-md p-5 md:p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

        {/* Left Column */}
        <div className="flex-1 min-w-0">
          {/* Title row with pills - all on same row */}
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <h2 className="text-xl md:text-2xl font-semibold text-slate-900 leading-tight">
              {insuredName || 'Unnamed Submission'}
            </h2>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
              {industryLabel || '—'}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
              {formatMoneyShort(revenue) || 'Revenue —'}
            </span>
          </div>

          {/* Metadata grid - 2x2 on md+, 1-col on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <MetadataCell label="Address">
              <span className="truncate block" title={fullAddress || undefined}>
                {fullAddress || '—'}
              </span>
            </MetadataCell>

            <MetadataCell label="Broker">
              <span className="truncate block" title={brokerLine || undefined}>
                {brokerLine || '—'}
              </span>
            </MetadataCell>

            <MetadataCell label="Policy Period">
              {policyPeriod || '—'}
            </MetadataCell>

            <MetadataCell label="Contact">
              {brokerEmail || brokerPhone ? (
                <div className="space-y-0.5">
                  {brokerEmail && (
                    <div className="truncate">
                      <CopyableText text={brokerEmail} />
                    </div>
                  )}
                  {brokerPhone && (
                    <div className="truncate">
                      <CopyableText text={brokerPhone} />
                    </div>
                  )}
                </div>
              ) : (
                <span>—</span>
              )}
            </MetadataCell>
          </div>
        </div>

        {/* Right Column - Status + Edit */}
        <div className="flex items-center gap-3 lg:flex-col lg:items-end lg:gap-2">
          <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
            {displayStatus}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
