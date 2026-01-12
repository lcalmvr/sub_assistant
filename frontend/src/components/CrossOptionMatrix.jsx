import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubmissionSubjectivities,
  getSubmissionEndorsements,
  linkSubjectivityToQuote,
  unlinkSubjectivityFromQuote,
  linkEndorsementToQuote,
  unlinkEndorsementFromQuote,
  applyToAllQuotes,
} from '../api/client';

// Format compact currency (e.g., $5M, $25K)
function formatCompact(value) {
  if (!value) return '—';
  if (value >= 1_000_000) return `$${value / 1_000_000}M`;
  if (value >= 1_000) return `$${value / 1_000}K`;
  return `$${value}`;
}

// Generate auto option name from tower structure
function generateOptionName(quote) {
  const tower = quote.tower_json || [];
  const cmaiIdx = tower.findIndex(l => l.carrier?.toUpperCase().includes('CMAI'));
  const cmaiLayer = cmaiIdx >= 0 ? tower[cmaiIdx] : tower[0];
  if (!cmaiLayer) return 'Option';

  const limit = cmaiLayer.limit || 0;
  const limitStr = formatCompact(limit);

  if (quote.position === 'excess' && cmaiIdx >= 0) {
    // Calculate attachment
    let attachment = 0;
    for (let i = 0; i < cmaiIdx; i++) {
      const layer = tower[i];
      attachment += layer.quota_share || layer.limit || 0;
    }
    return `${limitStr} xs ${formatCompact(attachment)}`;
  }

  const retention = tower[0]?.retention || quote.primary_retention || 25000;
  return `${limitStr} x ${formatCompact(retention)}`;
}

export default function CrossOptionMatrix({ submissionId, quotes, currentQuoteId }) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState('endorsements');

  // Get all subjectivities for submission
  const { data: subjectivitiesData = [] } = useQuery({
    queryKey: ['submissionSubjectivities', submissionId],
    queryFn: () => getSubmissionSubjectivities(submissionId).then(res => res.data),
  });

  // Get all endorsements for submission
  const { data: endorsementsData } = useQuery({
    queryKey: ['submissionEndorsements', submissionId],
    queryFn: () => getSubmissionEndorsements(submissionId).then(res => res.data),
  });

  // Toggle subjectivity link
  const toggleSubjMutation = useMutation({
    mutationFn: ({ subjectivityId, quoteId, isLinked }) =>
      isLinked
        ? unlinkSubjectivityFromQuote(quoteId, subjectivityId)
        : linkSubjectivityToQuote(quoteId, subjectivityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      quotes?.forEach(q => {
        queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
      });
    },
  });

  // Toggle endorsement link
  const toggleEndtMutation = useMutation({
    mutationFn: ({ endorsementId, quoteId, isLinked }) =>
      isLinked
        ? unlinkEndorsementFromQuote(quoteId, endorsementId)
        : linkEndorsementToQuote(quoteId, endorsementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionEndorsements', submissionId] });
      quotes?.forEach(q => {
        queryClient.invalidateQueries({ queryKey: ['quoteEndorsements', q.id] });
      });
    },
  });

  // Parse quote IDs from data (handles both array and postgres array string)
  const parseQuoteIds = (quoteIds) => {
    if (!quoteIds) return [];
    if (Array.isArray(quoteIds)) return quoteIds;
    if (typeof quoteIds === 'string') {
      return quoteIds.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
    }
    return [];
  };

  // Build option headers
  const quoteOptions = (quotes || []).map(q => ({
    id: q.id,
    name: generateOptionName(q),
    position: q.position,
    isCurrent: q.id === currentQuoteId,
  }));

  // Filter subjectivities (exclude 'excluded' status)
  const subjectivities = subjectivitiesData.filter(s => s.status !== 'excluded');

  // Get endorsements list
  const endorsements = endorsementsData?.endorsements || [];

  if (!quotes || quotes.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">Cross-Option Assignment</span>
          <span className="text-xs text-gray-500">
            {endorsements.length} endorsements · {subjectivities.length} subjectivities
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-4">
          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-200">
            <button
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'endorsements'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('endorsements')}
            >
              Endorsements ({endorsements.length})
            </button>
            <button
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'subjectivities'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('subjectivities')}
            >
              Subjectivities ({subjectivities.length})
            </button>
            <button
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'coverages'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('coverages')}
            >
              Coverages
            </button>
          </div>

          {/* Matrix Table */}
          {(activeTab === 'endorsements' || activeTab === 'subjectivities') && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500 min-w-[200px]">
                    {activeTab === 'endorsements' ? 'Endorsement' : 'Subjectivity'}
                  </th>
                  {quoteOptions.map(opt => (
                    <th
                      key={opt.id}
                      className={`px-2 py-2 text-center font-medium min-w-[100px] ${
                        opt.isCurrent ? 'bg-purple-50 text-purple-700' : 'text-gray-600'
                      }`}
                    >
                      <div className="text-xs">{opt.name}</div>
                      {opt.position === 'excess' && (
                        <span className="text-[10px] text-blue-500">XS</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeTab === 'endorsements' && endorsements.map(endt => {
                  const linkedIds = parseQuoteIds(endt.quote_ids);
                  return (
                    <tr key={endt.endorsement_id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-400">{endt.code}</span>
                          <span className="text-gray-700 truncate" title={endt.title}>
                            {endt.title.length > 40 ? `${endt.title.substring(0, 40)}...` : endt.title}
                          </span>
                        </div>
                      </td>
                      {quoteOptions.map(opt => {
                        const isLinked = linkedIds.includes(opt.id);
                        return (
                          <td key={opt.id} className={`px-2 py-2 text-center ${opt.isCurrent ? 'bg-purple-50' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isLinked}
                              onChange={() => toggleEndtMutation.mutate({
                                endorsementId: endt.endorsement_id,
                                quoteId: opt.id,
                                isLinked,
                              })}
                              disabled={toggleEndtMutation.isPending}
                              className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {activeTab === 'subjectivities' && subjectivities.map(subj => {
                  const linkedIds = parseQuoteIds(subj.quote_ids);
                  return (
                    <tr key={subj.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            subj.status === 'received' ? 'bg-green-100 text-green-700' :
                            subj.status === 'waived' ? 'bg-gray-100 text-gray-500' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {subj.status || 'pending'}
                          </span>
                          <span className="text-gray-700 truncate" title={subj.text}>
                            {subj.text.length > 50 ? `${subj.text.substring(0, 50)}...` : subj.text}
                          </span>
                        </div>
                      </td>
                      {quoteOptions.map(opt => {
                        const isLinked = linkedIds.includes(opt.id);
                        return (
                          <td key={opt.id} className={`px-2 py-2 text-center ${opt.isCurrent ? 'bg-purple-50' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isLinked}
                              onChange={() => toggleSubjMutation.mutate({
                                subjectivityId: subj.id,
                                quoteId: opt.id,
                                isLinked,
                              })}
                              disabled={toggleSubjMutation.isPending}
                              className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {((activeTab === 'endorsements' && endorsements.length === 0) ||
                  (activeTab === 'subjectivities' && subjectivities.length === 0)) && (
                  <tr>
                    <td colSpan={quoteOptions.length + 1} className="py-4 text-center text-gray-400">
                      No {activeTab} added yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {/* Coverages Tab Content */}
          {activeTab === 'coverages' && (
            <CoveragesMatrixContent
              quotes={quotes}
              quoteOptions={quoteOptions}
              currentQuoteId={currentQuoteId}
              submissionId={submissionId}
            />
          )}

          {/* Quick tip */}
          {activeTab !== 'coverages' && (
            <p className="text-xs text-gray-400 mt-3">
              Check boxes to assign items to each quote option. Changes save automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Coverages comparison and apply component
function CoveragesMatrixContent({ quotes, quoteOptions, currentQuoteId, submissionId }) {
  const queryClient = useQueryClient();
  const [sourceQuoteId, setSourceQuoteId] = useState('');
  const [applySuccess, setApplySuccess] = useState(null);

  // Group quotes by position
  const primaryQuotes = quotes.filter(q => q.position !== 'excess');
  const excessQuotes = quotes.filter(q => q.position === 'excess');

  // Apply coverages mutation
  const applyMutation = useMutation({
    mutationFn: (fromQuoteId) => applyToAllQuotes(fromQuoteId, { coverages: true }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['structures', submissionId] });
      setApplySuccess(response.data?.coverages_updated || 0);
      setTimeout(() => setApplySuccess(null), 3000);
      setSourceQuoteId('');
    },
  });

  // Count coverage differences
  const countCoverageKeys = (coverages) => {
    if (!coverages) return 0;
    const agg = Object.keys(coverages.aggregate_coverages || {}).length;
    const sub = Object.keys(coverages.sublimit_coverages || {}).length;
    return agg + sub;
  };

  return (
    <div className="space-y-4">
      {/* Primary Quotes */}
      {primaryQuotes.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Primary Options
          </div>
          <div className="space-y-2">
            {primaryQuotes.map(q => {
              const opt = quoteOptions.find(o => o.id === q.id);
              const covCount = countCoverageKeys(q.coverages);
              return (
                <div
                  key={q.id}
                  className={`flex items-center justify-between p-2 rounded border ${
                    q.id === currentQuoteId
                      ? 'border-purple-200 bg-purple-50'
                      : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">{opt?.name || 'Option'}</span>
                    <span className="text-xs text-gray-400">{covCount} coverages configured</span>
                  </div>
                  {primaryQuotes.length > 1 && q.id !== currentQuoteId && (
                    <button
                      onClick={() => applyMutation.mutate(q.id)}
                      disabled={applyMutation.isPending}
                      className="text-xs text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
                    >
                      Apply to others
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Excess Quotes */}
      {excessQuotes.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Excess Options
          </div>
          <div className="space-y-2">
            {excessQuotes.map(q => {
              const opt = quoteOptions.find(o => o.id === q.id);
              const sublimitCount = (q.sublimits || []).length;
              return (
                <div
                  key={q.id}
                  className={`flex items-center justify-between p-2 rounded border ${
                    q.id === currentQuoteId
                      ? 'border-purple-200 bg-purple-50'
                      : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">{opt?.name || 'Option'}</span>
                    <span className="text-xs text-gray-400">{sublimitCount} sublimits</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Success message */}
      {applySuccess !== null && (
        <div className="text-sm text-green-600 text-center py-2">
          Coverages applied to {applySuccess} option{applySuccess !== 1 ? 's' : ''}
        </div>
      )}

      {/* Tip */}
      <p className="text-xs text-gray-400">
        Click "Apply to others" to copy coverages to all options of the same type.
      </p>
    </div>
  );
}
