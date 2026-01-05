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
function CopyIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

/**
 * Copiable text with feedback
 */
function CopyableText({ text }) {
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
      <span className="truncate" title={text}>{text}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600"
        title="Copy"
      >
        {copied ? (
          <span className="text-[10px] text-green-600">Copied</span>
        ) : (
          <CopyIcon />
        )}
      </button>
    </span>
  );
}

/**
 * SubmissionHeaderCard - Clean, minimal header
 *
 * Props:
 *   submission: { insuredName, industryLabel, revenue, address1, city, state, zip,
 *                 brokerName, brokerCompany, brokerEmail, brokerPhone,
 *                 policyStart, policyEnd, status }
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

  // Format address (allow 2 lines max)
  const streetLine = [address1, address2].filter(Boolean).join(', ');
  const cityStateZip = [city, state].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');
  const fullAddress = [streetLine, cityStateZip].filter(Boolean).join(', ') || null;

  // Format broker
  const brokerDisplay = brokerName || null;
  const brokerFull = [brokerName, brokerCompany].filter(Boolean).join(', ') || null;

  // Format policy period
  const policyPeriod = formatDateRange(policyStart, policyEnd);

  // Status display
  const displayStatus = status || 'Draft';

  // Label style
  const labelClass = "text-[11px] font-medium text-slate-500 uppercase tracking-wide";
  const valueClass = "text-sm text-slate-800";

  // --- COMPACT MODE ---
  if (dense) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 shadow-sm p-4">
        {/* Single row: Name + Status + metadata + Edit */}
        <div className="flex items-center gap-4">
          {/* Left: Name + Status */}
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
            <h2 className="text-base font-semibold text-slate-900 truncate max-w-[240px]" title={insuredName}>
              {insuredName || 'Unnamed Submission'}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {displayStatus}
            </span>
          </div>

          {/* Center: Compact metadata (hidden on mobile) */}
          <div className="hidden md:flex items-center gap-6 text-xs text-slate-600 flex-1 min-w-0">
            {fullAddress && (
              <span className="truncate max-w-[200px]" title={fullAddress}>{fullAddress}</span>
            )}
            {brokerDisplay && (
              <span className="truncate max-w-[120px]" title={brokerFull}>{brokerDisplay}</span>
            )}
            {policyPeriod && (
              <span className="flex-shrink-0">{policyPeriod}</span>
            )}
          </div>

          {/* Right: Edit */}
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  // --- DEFAULT (EXPANDED) MODE ---
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 shadow-sm p-4 md:p-5">
      {/* Title row: Name + Status (left), Edit (right) */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <h2 className="text-xl font-semibold text-slate-900 truncate" title={insuredName}>
            {insuredName || 'Unnamed Submission'}
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {displayStatus}
          </span>
          {/* Industry + Revenue pills (only if present) */}
          {industryLabel && (
            <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-600 truncate max-w-[160px]" title={industryLabel}>
              {industryLabel}
            </span>
          )}
          {revenue && (
            <span className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
              {formatMoneyShort(revenue)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors flex-shrink-0"
        >
          Edit
        </button>
      </div>

      {/* Metadata grid: 2 columns on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-10">
        {/* Left column */}
        <div className="space-y-3">
          {/* Address */}
          <div>
            <div className={labelClass}>Address</div>
            <div className={`${valueClass} truncate`} title={fullAddress || undefined}>
              {fullAddress || <span className="text-slate-400">—</span>}
            </div>
          </div>
          {/* Policy Period */}
          <div>
            <div className={labelClass}>Policy Period</div>
            <div className={valueClass}>
              {policyPeriod || <span className="text-slate-400">—</span>}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          {/* Broker */}
          <div>
            <div className={labelClass}>Broker</div>
            <div className={`${valueClass} truncate`} title={brokerFull || undefined}>
              {brokerFull || <span className="text-slate-400">—</span>}
            </div>
          </div>
          {/* Contact */}
          <div>
            <div className={labelClass}>Contact</div>
            {brokerEmail || brokerPhone ? (
              <div className={`${valueClass} space-y-0.5`}>
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
              <div className={valueClass}><span className="text-slate-400">—</span></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
