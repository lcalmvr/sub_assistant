import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * UnifiedHeader - Combined dark nav bar with submission context
 *
 * Consolidates:
 * - App title + breadcrumb
 * - Company name + status
 * - Quick context (location, industry, revenue)
 * - Broker popover
 * - Docs button
 * - User selector + workflow badge
 */

// Format revenue as abbreviated string
function formatRevenue(value) {
  if (!value) return null;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

// Status configuration
const STATUSES = {
  received: { label: 'Received', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  pending_info: { label: 'Pending Info', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  quoted: { label: 'Quoted', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  declined: { label: 'Declined', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

function getSmartStatus(status, outcome) {
  if (status === 'quoted') {
    if (outcome === 'bound') return { label: 'Bound', color: 'bg-green-500/20 text-green-300 border-green-500/30' };
    if (outcome === 'lost') return { label: 'Lost', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' };
    if (outcome === 'waiting_for_response') return { label: 'Quoted', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
  }
  return STATUSES[status] || { label: status || 'New', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' };
}

// Broker Popover Component
function BrokerPopover({ submission }) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  const brokerName = submission?.broker_name;
  const brokerCompany = submission?.broker_company;
  const brokerEmail = submission?.broker_email;
  const brokerPhone = submission?.broker_phone;

  // Format phone
  const formatPhone = (phone) => {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
  };

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (!brokerName && !brokerCompany) return null;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-700 transition-colors text-sm"
      >
        <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <span className="text-slate-300 hidden sm:inline">{brokerName || brokerCompany}</span>
        <svg className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
            <div className="bg-purple-50 px-4 py-3 border-b border-purple-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{brokerName || 'Unknown'}</p>
                  <p className="text-sm text-slate-500">{brokerCompany || ''}</p>
                </div>
              </div>
            </div>
            <div className="p-3 space-y-1">
              {brokerEmail && (
                <a
                  href={`mailto:${brokerEmail}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 text-sm text-slate-700"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="truncate">{brokerEmail}</span>
                </a>
              )}
              {brokerPhone && (
                <a
                  href={`tel:${brokerPhone}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 text-sm text-slate-700"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>{formatPhone(brokerPhone)}</span>
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Docs Button Component
function DocsButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span>Docs</span>
    </button>
  );
}

// Main UnifiedHeader Component
export default function UnifiedHeader({
  submission,
  onDocsClick,
  workflowBadge,
  correctionsBadge,
  tabs,
  activeTab,
}) {
  const status = submission?.submission_status || 'received';
  const outcome = submission?.submission_outcome || 'pending';
  const smartStatus = getSmartStatus(status, outcome);

  // Build location string
  const city = submission?.city;
  const state = submission?.state;
  const location = [city, state].filter(Boolean).join(', ') || null;

  // Industry
  const industry = submission?.naics_primary_title || null;

  // Revenue
  const revenue = formatRevenue(submission?.annual_revenue);

  return (
    <header className="bg-slate-800 text-white shrink-0">
      {/* Main header row */}
      <div className="px-4 h-14 flex items-center gap-4">
        {/* Left: Logo + Company */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="text-base font-semibold text-white hover:text-slate-200 whitespace-nowrap"
          >
            UW Portal
          </Link>

          <span className="text-slate-600">›</span>

          <h1 className="text-base font-medium text-white truncate">
            {submission?.applicant_name || 'Loading...'}
          </h1>

          <span className={`px-2 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap ${smartStatus.color}`}>
            {smartStatus.label}
          </span>
        </div>

        {/* Center: Quick context pills */}
        <div className="hidden lg:flex items-center gap-3 text-sm text-slate-400">
          {location && (
            <>
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{location}</span>
              </div>
              <span className="text-slate-600">·</span>
            </>
          )}
          {industry && (
            <>
              <span className="truncate max-w-[200px]">{industry}</span>
              <span className="text-slate-600">·</span>
            </>
          )}
          {revenue && (
            <span className="text-emerald-400 font-medium">{revenue}</span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <DocsButton onClick={onDocsClick} />

          {correctionsBadge}

          <div className="w-px h-5 bg-slate-600 mx-1" />

          <BrokerPopover submission={submission} />

          <div className="w-px h-5 bg-slate-600 mx-1" />

          {workflowBadge}
        </div>
      </div>

      {/* Tab row */}
      {tabs && tabs.length > 0 && (
        <div className="px-4 flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.path
                  ? 'bg-gray-100 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tab.name}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
