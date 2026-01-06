import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getRenewalQueue, createRenewalExpectation, markRenewalReceived, markRenewalNotReceived } from '../api/client';

// Format currency
function formatCurrency(value) {
  if (!value && value !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year.slice(2)}`;
  }
  return dateStr;
}

// Days until badge
function DaysUntilBadge({ days }) {
  if (days === null || days === undefined) return null;
  const color = days <= 30 ? 'bg-red-100 text-red-700' :
                days <= 60 ? 'bg-amber-100 text-amber-700' :
                'bg-blue-100 text-blue-700';
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${color}`}>
      {days}d
    </span>
  );
}

// Status badge
function StatusBadge({ status }) {
  const config = {
    needs_renewal: { label: 'Needs Expectation', color: 'bg-gray-100 text-gray-600' },
    has_renewal: { label: 'Has Renewal', color: 'bg-green-100 text-green-700' },
    pending: { label: 'Waiting', color: 'bg-amber-100 text-amber-700' },
    in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  };
  const c = config[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${c.color}`}>
      {c.label}
    </span>
  );
}

// Expiring policies section
function ExpiringPoliciesSection({ policies, onCreateExpectation, isCreating }) {
  if (!policies?.length) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No policies expiring in the next 90 days
      </div>
    );
  }

  return (
    <div className="divide-y">
      {policies.map((policy) => (
        <div key={policy.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link
                to={`/submissions/${policy.id}/policy`}
                className="font-medium text-gray-900 hover:text-blue-600 truncate"
              >
                {policy.applicant_name}
              </Link>
              <DaysUntilBadge days={policy.days_until_expiry} />
            </div>
            <div className="text-sm text-gray-500 mt-0.5">
              Expires {formatDate(policy.expiration_date)} · {formatCurrency(policy.sold_premium)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={policy.status} />
            {policy.status === 'needs_renewal' && (
              <button
                onClick={() => onCreateExpectation(policy.id)}
                disabled={isCreating}
                className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
            )}
            {policy.renewal_id && (
              <Link
                to={`/submissions/${policy.renewal_id}/setup`}
                className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                View
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Pending expectations section
function PendingExpectationsSection({ expectations, onMarkReceived, onMarkNotReceived, isUpdating }) {
  if (!expectations?.length) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No pending renewal expectations
      </div>
    );
  }

  return (
    <div className="divide-y">
      {expectations.map((exp) => (
        <div key={exp.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate">
              {exp.applicant_name}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">
              Expected {formatDate(exp.effective_date)} · Prior: {formatCurrency(exp.prior_premium)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onMarkReceived(exp.id)}
              disabled={isUpdating}
              className="px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Received
            </button>
            <button
              onClick={() => onMarkNotReceived(exp.id)}
              disabled={isUpdating}
              className="px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              Not Coming
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// In progress section
function InProgressSection({ renewals }) {
  if (!renewals?.length) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No renewals in progress
      </div>
    );
  }

  return (
    <div className="divide-y">
      {renewals.map((renewal) => (
        <div key={renewal.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50">
          <div className="flex-1 min-w-0">
            <Link
              to={`/submissions/${renewal.id}/renewal`}
              className="font-medium text-gray-900 hover:text-blue-600 truncate block"
            >
              {renewal.applicant_name}
            </Link>
            <div className="text-sm text-gray-500 mt-0.5">
              Received {formatDate(renewal.date_received)} ·
              Prior: {formatCurrency(renewal.prior_premium)}
              {renewal.current_premium && (
                <> · Proposed: {formatCurrency(renewal.current_premium)}</>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 capitalize">
              {renewal.submission_status?.replace('_', ' ') || 'In Progress'}
            </span>
            <Link
              to={`/submissions/${renewal.id}/renewal`}
              className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Open
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

// Main component
export default function RenewalQueueCard() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('expiring');

  const { data, isLoading, error } = useQuery({
    queryKey: ['renewal-queue'],
    queryFn: () => getRenewalQueue().then(res => res.data),
    refetchInterval: 60000, // Refresh every minute
  });

  const createMutation = useMutation({
    mutationFn: createRenewalExpectation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-queue'] });
    },
  });

  const markReceivedMutation = useMutation({
    mutationFn: markRenewalReceived,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-queue'] });
    },
  });

  const markNotReceivedMutation = useMutation({
    mutationFn: (id) => markRenewalNotReceived(id, 'Broker did not submit renewal'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-queue'] });
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load renewal queue</p>
      </div>
    );
  }

  const { expiring, pending, in_progress, metrics } = data || {};

  const sections = [
    { id: 'expiring', label: 'Expiring', count: expiring?.length || 0 },
    { id: 'pending', label: 'Waiting', count: pending?.length || 0 },
    { id: 'in_progress', label: 'In Progress', count: in_progress?.length || 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 rounded-lg p-4 border border-red-100">
          <div className="text-2xl font-bold text-red-700">{metrics?.expiring_30 || 0}</div>
          <div className="text-sm text-red-600">Expiring in 30 days</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
          <div className="text-2xl font-bold text-amber-700">{metrics?.expiring_60 || 0}</div>
          <div className="text-sm text-amber-600">Expiring in 60 days</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
          <div className="text-2xl font-bold text-blue-700">{metrics?.renewals_in_progress || 0}</div>
          <div className="text-sm text-blue-600">Renewals in Progress</div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="bg-white rounded-lg border">
        <div className="flex border-b">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeSection === section.id
                  ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {section.label}
              {section.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                  activeSection === section.id
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {section.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Section Content */}
        <div className="max-h-96 overflow-y-auto">
          {activeSection === 'expiring' && (
            <ExpiringPoliciesSection
              policies={expiring}
              onCreateExpectation={createMutation.mutate}
              isCreating={createMutation.isPending}
            />
          )}
          {activeSection === 'pending' && (
            <PendingExpectationsSection
              expectations={pending}
              onMarkReceived={markReceivedMutation.mutate}
              onMarkNotReceived={markNotReceivedMutation.mutate}
              isUpdating={markReceivedMutation.isPending || markNotReceivedMutation.isPending}
            />
          )}
          {activeSection === 'in_progress' && (
            <InProgressSection renewals={in_progress} />
          )}
        </div>
      </div>

      {/* Additional Stats */}
      {metrics?.not_received > 0 && (
        <div className="bg-gray-50 rounded-lg p-4 border">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">Renewals Not Received</span>
              <span className="ml-2 text-sm text-gray-500">(lost to competition or non-renewal)</span>
            </div>
            <span className="text-lg font-bold text-gray-700">{metrics.not_received}</span>
          </div>
        </div>
      )}
    </div>
  );
}
