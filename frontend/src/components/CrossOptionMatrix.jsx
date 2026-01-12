import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubmissionSubjectivities,
  getSubmissionEndorsements,
  linkSubjectivityToQuote,
  unlinkSubjectivityFromQuote,
  linkEndorsementToQuote,
  unlinkEndorsementFromQuote,
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
  const [rulesFilter, setRulesFilter] = useState('any');
  const [activeRuleMenu, setActiveRuleMenu] = useState(null);
  const ruleMenuRefs = useRef({});
  const ruleTriggerRefs = useRef({});

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

  useEffect(() => {
    if (!activeRuleMenu) return;
    const handleClick = (event) => {
      const menuEl = ruleMenuRefs.current[activeRuleMenu];
      const triggerEl = ruleTriggerRefs.current[activeRuleMenu];
      if (menuEl?.contains(event.target)) return;
      if (triggerEl?.contains(event.target)) return;
      setActiveRuleMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeRuleMenu]);

  // Build option headers
  const quoteOptions = (quotes || []).map(q => ({
    id: q.id,
    name: generateOptionName(q),
    position: q.position,
    isCurrent: q.id === currentQuoteId,
  }));

  const allQuoteIds = useMemo(() => quoteOptions.map(opt => String(opt.id)), [quoteOptions]);
  const primaryQuoteIds = useMemo(() => (
    quoteOptions.filter(opt => opt.position !== 'excess').map(opt => String(opt.id))
  ), [quoteOptions]);
  const excessQuoteIds = useMemo(() => (
    quoteOptions.filter(opt => opt.position === 'excess').map(opt => String(opt.id))
  ), [quoteOptions]);
  const optionLabelMap = useMemo(() => (
    new Map(quoteOptions.map(opt => [String(opt.id), opt.name]))
  ), [quoteOptions]);

  // Filter subjectivities (exclude 'excluded' status)
  const subjectivities = subjectivitiesData.filter(s => s.status !== 'excluded');

  // Get endorsements list
  const endorsements = endorsementsData?.endorsements || [];

  const subjectivityRules = useMemo(() => {
    const getScope = (linkedIds) => {
      const linkedSet = new Set(linkedIds);
      const isAll = allQuoteIds.length > 0 && allQuoteIds.every(id => linkedSet.has(id));
      if (isAll) return 'all';
      const isPrimary = primaryQuoteIds.length > 0
        && primaryQuoteIds.length === linkedSet.size
        && primaryQuoteIds.every(id => linkedSet.has(id));
      if (isPrimary) return 'primary';
      const isExcess = excessQuoteIds.length > 0
        && excessQuoteIds.length === linkedSet.size
        && excessQuoteIds.every(id => linkedSet.has(id));
      if (isExcess) return 'excess';
      return 'custom';
    };

    const getAppliesLabel = (linkedIds, scope) => {
      if (scope === 'all') return `All ${allQuoteIds.length} Options`;
      if (scope === 'primary') return 'All Primary';
      if (scope === 'excess') return 'All Excess';
      if (linkedIds.length === 0) return 'No options';
      const firstLabel = optionLabelMap.get(linkedIds[0]) || 'Option';
      const extra = linkedIds.length - 1;
      return extra > 0 ? `${firstLabel} +${extra}` : firstLabel;
    };

    return subjectivities.map(subj => {
      const linkedIds = parseQuoteIds(subj.quote_ids).map(id => String(id));
      const scope = getScope(linkedIds);
      return {
        subjectivity: subj,
        linkedIds,
        linkedSet: new Set(linkedIds),
        scope,
        appliesLabel: getAppliesLabel(linkedIds, scope),
      };
    });
  }, [subjectivities, allQuoteIds, primaryQuoteIds, excessQuoteIds, optionLabelMap]);

  const applySubjectivityScope = useMutation({
    mutationFn: async ({ subjectivityId, currentIds, targetIds }) => {
      const currentSet = new Set(currentIds);
      const targetSet = new Set(targetIds);
      const toLink = targetIds.filter(id => !currentSet.has(id));
      const toUnlink = currentIds.filter(id => !targetSet.has(id));
      await Promise.all([
        ...toLink.map(id => linkSubjectivityToQuote(id, subjectivityId)),
        ...toUnlink.map(id => unlinkSubjectivityFromQuote(id, subjectivityId)),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissionSubjectivities', submissionId] });
      quotes?.forEach(q => {
        queryClient.invalidateQueries({ queryKey: ['quoteSubjectivities', q.id] });
      });
    },
  });

  const filteredSubjectivityRules = useMemo(() => {
    if (rulesFilter === 'any') return subjectivityRules;
    return subjectivityRules.filter(rule => rule.scope === rulesFilter);
  }, [rulesFilter, subjectivityRules]);

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
          </div>

          {activeTab === 'endorsements' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 font-medium text-gray-500 min-w-[200px]">
                      Endorsement
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
                  {endorsements.map(endt => {
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

                  {endorsements.length === 0 && (
                    <tr>
                      <td colSpan={quoteOptions.length + 1} className="py-4 text-center text-gray-400">
                        No endorsements added yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'subjectivities' && (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Assignment Rules
              </div>
              <div className="flex items-center gap-2">
                {[
                  { key: 'all', label: 'Apply to All' },
                  { key: 'primary', label: 'Apply to Primary' },
                  { key: 'excess', label: 'Apply to Excess' },
                ].map(filter => (
                  <button
                    key={filter.key}
                    onClick={() => setRulesFilter(prev => (prev === filter.key ? 'any' : filter.key))}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      rulesFilter === filter.key
                        ? 'border-purple-300 bg-purple-50 text-purple-700'
                        : 'border-gray-200 text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_220px] gap-4 px-4 py-2 text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <span>Subjectivity Name</span>
                  <span className="text-right">Applies To</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {filteredSubjectivityRules.map(rule => {
                    const subj = rule.subjectivity;
                    const isMenuOpen = activeRuleMenu === subj.id;
                    return (
                      <div key={subj.id} className="grid grid-cols-[1fr_220px] gap-4 px-4 py-3 items-start">
                        <div className="text-sm text-gray-800">
                          {subj.text}
                        </div>
                        <div className="relative flex flex-col items-end gap-1">
                          <button
                            ref={(el) => { ruleTriggerRefs.current[subj.id] = el; }}
                            onClick={() => setActiveRuleMenu(isMenuOpen ? null : subj.id)}
                            className="text-xs text-gray-600 border border-gray-200 bg-gray-50 rounded-full px-2 py-1 hover:text-gray-800"
                          >
                            {rule.appliesLabel}
                          </button>
                          {rule.scope !== 'all' && (
                            <button
                              onClick={() => setActiveRuleMenu(isMenuOpen ? null : subj.id)}
                              className="text-[11px] text-purple-600 hover:text-purple-700"
                            >
                              + Add Option
                            </button>
                          )}
                          {isMenuOpen && (
                            <div
                              ref={(el) => { ruleMenuRefs.current[subj.id] = el; }}
                              className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg p-2 z-20"
                            >
                              <div className="space-y-1">
                                <button
                                  onClick={() => {
                                    applySubjectivityScope.mutate({
                                      subjectivityId: subj.id,
                                      currentIds: rule.linkedIds,
                                      targetIds: allQuoteIds,
                                    });
                                    setActiveRuleMenu(null);
                                  }}
                                  disabled={applySubjectivityScope.isPending}
                                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                                >
                                  All Options
                                </button>
                                <button
                                  onClick={() => {
                                    applySubjectivityScope.mutate({
                                      subjectivityId: subj.id,
                                      currentIds: rule.linkedIds,
                                      targetIds: primaryQuoteIds,
                                    });
                                    setActiveRuleMenu(null);
                                  }}
                                  disabled={applySubjectivityScope.isPending || primaryQuoteIds.length === 0}
                                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                                >
                                  All Primary
                                </button>
                                <button
                                  onClick={() => {
                                    applySubjectivityScope.mutate({
                                      subjectivityId: subj.id,
                                      currentIds: rule.linkedIds,
                                      targetIds: excessQuoteIds,
                                    });
                                    setActiveRuleMenu(null);
                                  }}
                                  disabled={applySubjectivityScope.isPending || excessQuoteIds.length === 0}
                                  className="w-full text-left text-xs px-2 py-1 rounded hover:bg-gray-50"
                                >
                                  All Excess
                                </button>
                              </div>
                              <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 max-h-48 overflow-y-auto">
                                {quoteOptions.map(opt => {
                                  const isLinked = rule.linkedSet.has(String(opt.id));
                                  return (
                                    <label key={opt.id} className="flex items-center gap-2 text-xs text-gray-600">
                                      <input
                                        type="checkbox"
                                        checked={isLinked}
                                        onChange={() => toggleSubjMutation.mutate({
                                          subjectivityId: subj.id,
                                          quoteId: opt.id,
                                          isLinked,
                                        })}
                                        disabled={toggleSubjMutation.isPending}
                                        className="w-4 h-4 text-purple-600 rounded border-gray-300"
                                      />
                                      <span className="truncate">{opt.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filteredSubjectivityRules.length === 0 && (
                    <div className="px-4 py-6 text-sm text-gray-400 text-center">
                      No subjectivities match this filter.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
