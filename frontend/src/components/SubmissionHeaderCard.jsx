import { useState } from 'react';

// Team users for assignment dropdown
const TEAM_USERS = ['Sarah', 'Mike', 'Tom'];

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
 * Format phone number: 7388944678 -> (738) 894-4678
 */
function formatPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
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

/** Chevron icon */
function ChevronIcon({ expanded }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/** Phone icon */
function PhoneIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

/** User icon */
function UserIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

/**
 * SubmissionHeaderCard - Submission summary header
 */
export default function SubmissionHeaderCard({
  submission,
  onEdit,
  onAssign,
  defaultExpanded = true,
  currentUser = 'Sarah'
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!submission) return null;

  const {
    insuredName,
    naicsPrimaryCode,
    naicsPrimaryTitle,
    naicsSecondaryCode,
    naicsSecondaryTitle,
    industryTags,
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
    isRenewal,
    assignedTo,
  } = submission;

  // Handle assignment change
  const handleAssignChange = (e) => {
    const newAssignee = e.target.value || null;
    if (onAssign) {
      onAssign(newAssignee);
    }
  };

  // Format address
  const streetLine = [address1, address2].filter(Boolean).join(', ');
  const cityStateZip = [city, state].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');
  const fullAddress = [streetLine, cityStateZip].filter(Boolean).join(', ') || null;

  // Format broker
  const brokerFull = [brokerName, brokerCompany].filter(Boolean).join(', ') || null;

  // Format policy period
  const policyPeriod = formatDateRange(policyStart, policyEnd);

  // Format phone
  const formattedPhone = formatPhone(brokerPhone);

  // Parse industry tags if string
  const tags = Array.isArray(industryTags) ? industryTags : (industryTags ? JSON.parse(industryTags) : []);

  // Label style
  const labelClass = "text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5";
  const valueClass = "text-sm text-gray-700";

  // --- COLLAPSED MODE ---
  if (!expanded) {
    return (
      <div className="bg-white px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="p-1 -ml-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
            title="Expand"
          >
            <ChevronIcon expanded={false} />
          </button>

          {/* Name + badge */}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate" title={insuredName}>
              {insuredName || 'Unnamed Submission'}
            </h2>
            {isRenewal !== undefined && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium flex-shrink-0 ${
                isRenewal ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
              }`}>
                {isRenewal ? 'Renewal' : 'New'}
              </span>
            )}
          </div>

          {/* Separator */}
          <div className="hidden md:block w-px h-5 bg-gray-200" />

          {/* Broker + Contact */}
          <div className="hidden md:flex items-center gap-4 text-sm text-gray-600 flex-1 min-w-0">
            {brokerFull && (
              <span className="truncate" title={brokerFull}>{brokerFull}</span>
            )}
            {formattedPhone && (
              <span className="flex items-center gap-1.5 flex-shrink-0 text-gray-500">
                <PhoneIcon />
                {formattedPhone}
              </span>
            )}
            {brokerEmail && (
              <a
                href={`mailto:${brokerEmail}`}
                className="text-purple-600 hover:text-purple-800 flex-shrink-0"
                title={brokerEmail}
              >
                Email
              </a>
            )}
          </div>

          {/* Edit button */}
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors flex-shrink-0"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  // --- EXPANDED MODE ---
  return (
    <div className="bg-white px-4 py-3">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="p-1 -ml-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
            title="Collapse"
          >
            <ChevronIcon expanded={true} />
          </button>

          <h2 className="text-lg font-bold text-gray-900 truncate" title={insuredName}>
            {insuredName || 'Unnamed Submission'}
          </h2>

          {isRenewal !== undefined && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isRenewal ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
            }`}>
              {isRenewal ? 'Renewal' : 'New'}
            </span>
          )}

          {/* Revenue pill */}
          {revenue && (
            <span className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
              {formatMoneyShort(revenue)} rev
            </span>
          )}
        </div>

        {/* Assignment + Edit buttons */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Assignment dropdown */}
          <div className="flex items-center gap-2">
            <UserIcon />
            <select
              value={assignedTo || ''}
              onChange={handleAssignChange}
              className={`text-sm border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                assignedTo
                  ? assignedTo === currentUser
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700'
                  : 'border-orange-300 bg-orange-50 text-orange-600'
              }`}
            >
              <option value="">Unassigned</option>
              {TEAM_USERS.map(user => (
                <option key={user} value={user}>
                  {user === currentUser ? `${user} (Me)` : user}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onEdit}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Metadata grid - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-y-2 gap-x-6 pt-2 border-t border-gray-100">
        {/* Column 1: Address + Policy Period */}
        <div className="space-y-2">
          <div>
            <div className={labelClass}>Address</div>
            <div className={`${valueClass} truncate`} title={fullAddress || undefined}>
              {fullAddress || <span className="text-gray-400">—</span>}
            </div>
          </div>
          <div>
            <div className={labelClass}>Policy Period</div>
            <div className={valueClass}>
              {policyPeriod || <span className="text-gray-400">—</span>}
            </div>
          </div>
        </div>

        {/* Column 2: Industry Classification */}
        <div>
          <div className={labelClass}>Industry</div>
          {naicsPrimaryCode || naicsPrimaryTitle ? (
            <div className="space-y-1">
              <div className="text-sm text-gray-700">
                {naicsPrimaryTitle}
                {naicsPrimaryCode && <span className="text-gray-400 text-xs ml-1">({naicsPrimaryCode})</span>}
              </div>
              {(naicsSecondaryCode || naicsSecondaryTitle) && (
                <div className="text-sm text-gray-500">
                  {naicsSecondaryTitle}
                  {naicsSecondaryCode && <span className="text-gray-400 text-xs ml-1">({naicsSecondaryCode})</span>}
                </div>
              )}
            </div>
          ) : (
            <div className={valueClass}><span className="text-gray-400">—</span></div>
          )}
        </div>

        {/* Column 3: Industry Tags */}
        <div>
          <div className={labelClass}>Tags</div>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <div className={valueClass}><span className="text-gray-400">—</span></div>
          )}
        </div>
      </div>
    </div>
  );
}
