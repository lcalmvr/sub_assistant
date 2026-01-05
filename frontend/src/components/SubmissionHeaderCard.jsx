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
 * Format relative time (e.g., "2 hours ago", "Yesterday")
 */
function formatRelativeTime(dateVal) {
  if (!dateVal) return null;
  const date = new Date(dateVal);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateVal);
}

/**
 * Copy icon (inline SVG)
 */
function CopyIcon({ className = "w-3.5 h-3.5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

/**
 * Kebab menu icon (3 dots)
 */
function KebabIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
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
          <span className="text-xs text-slate-500">Copied</span>
        ) : (
          <CopyIcon className="w-3 h-3" />
        )}
      </button>
    </span>
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
 */
export default function SubmissionHeaderCard({ submission, onEdit }) {
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
    updatedAt,
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md p-5 md:p-6">
      <div className="grid grid-cols-12 gap-4 md:gap-6 items-start">

        {/* Left Column */}
        <div className="col-span-12 lg:col-span-8">
          {/* Section label */}
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Submission Summary
          </div>

          {/* Title row with pills */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-xl md:text-2xl font-semibold text-slate-900 leading-tight">
              {insuredName || 'Unnamed Submission'}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Industry pill */}
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                {industryLabel || '—'}
              </span>
              {/* Revenue pill */}
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                {formatMoneyShort(revenue) || 'Revenue —'}
              </span>
            </div>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mt-4">
            {/* Address */}
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Address</div>
              <div className="text-sm text-slate-800 truncate" title={fullAddress || undefined}>
                {fullAddress || '—'}
              </div>
            </div>

            {/* Broker */}
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Broker</div>
              <div className="text-sm text-slate-800 truncate" title={brokerLine || undefined}>
                {brokerLine || '—'}
              </div>
            </div>

            {/* Policy Period */}
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Policy Period</div>
              <div className="text-sm text-slate-800">
                {policyPeriod || '—'}
              </div>
            </div>

            {/* Contact */}
            <div>
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Contact</div>
              <div className="text-sm text-slate-800 space-y-0.5">
                {brokerEmail ? (
                  <div className="truncate">
                    <CopyableText text={brokerEmail} />
                  </div>
                ) : null}
                {brokerPhone ? (
                  <div className="truncate">
                    <CopyableText text={brokerPhone} />
                  </div>
                ) : null}
                {!brokerEmail && !brokerPhone && <span>—</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="col-span-12 lg:col-span-4">
          {/* Status + Actions row */}
          <div className="flex items-start justify-between gap-3">
            {/* Status pill */}
            <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
              {displayStatus}
            </span>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 transition-colors"
                title="More options"
              >
                <KebabIcon />
              </button>
            </div>
          </div>

          {/* Quick stats panel */}
          {(updatedAt || brokerEmail || policyPeriod) && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              {updatedAt && (
                <div className="flex justify-between gap-3 text-xs text-slate-600">
                  <span>Last updated</span>
                  <span className="text-slate-800 font-medium">{formatRelativeTime(updatedAt)}</span>
                </div>
              )}
              {brokerEmail && (
                <div className="flex justify-between gap-3 text-xs text-slate-600">
                  <span>Broker email</span>
                  <span className="text-slate-800 font-medium truncate max-w-[140px]" title={brokerEmail}>
                    {brokerEmail}
                  </span>
                </div>
              )}
              {policyPeriod && (
                <div className="flex justify-between gap-3 text-xs text-slate-600">
                  <span>Policy term</span>
                  <span className="text-slate-800 font-medium">{policyPeriod}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
