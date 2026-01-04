import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSubmission, updateSubmission, getSubmissionWorkflow, recordVote, claimSubmission, startPrescreen, submitForReview, getUwRecommendation } from '../api/client';
import DocsPanel from '../components/DocsPanel';
import AiCorrectionsPanel, { AiCorrectionsBadge } from '../components/AiCorrectionsPanel';

const tabs = [
  { name: 'Setup', path: 'setup' },
  { name: 'Analyze', path: 'analyze' },
  { name: 'Quote', path: 'quote' },
  { name: 'Policy', path: 'policy' },
];

// Status configuration
const STATUSES = {
  received: { label: 'Received', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  pending_info: { label: 'Pending Info', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  quoted: { label: 'Quoted', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700 border-red-200' },
};

const STATUS_OUTCOMES = {
  received: ['pending'],
  pending_info: ['pending'],
  quoted: ['waiting_for_response', 'bound', 'lost'],
  declined: ['declined'],
};

const OUTCOME_LABELS = {
  pending: 'Pending',
  waiting_for_response: 'Waiting',
  bound: 'Bound',
  lost: 'Lost',
  declined: 'Declined',
};

const DECLINE_REASONS = [
  'Outside appetite', 'Insufficient controls', 'Claims history', 'Revenue outside range',
  'Industry exclusion', 'Inadequate limits requested', 'Unable to obtain information', 'Broker relationship',
];

const LOST_REASONS = [
  'Price', 'Coverage terms', 'Competitor won', 'Insured declined coverage',
  'No response from broker', 'Renewal with incumbent',
];

// Workflow stage configuration
const WORKFLOW_STAGES = {
  intake: { label: 'Intake', color: 'bg-gray-100 text-gray-600 border-gray-200', icon: '○' },
  pre_screen: { label: 'Pre-Screen', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '◐' },
  uw_work: { label: 'UW Work', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: '◑' },
  formal: { label: 'Formal Review', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: '◕' },
  complete: { label: 'Complete', color: 'bg-green-100 text-green-700 border-green-200', icon: '●' },
};

const TEAM_USERS = ['Sarah', 'Mike', 'Tom'];

function getInitialUser() {
  if (typeof window === 'undefined') return TEAM_USERS[0];
  const saved = localStorage.getItem('currentUwUser');
  return saved && TEAM_USERS.includes(saved) ? saved : TEAM_USERS[0];
}

function getSmartStatus(status, outcome) {
  if (status === 'quoted') {
    if (outcome === 'bound') return { label: 'Bound', color: 'bg-green-100 text-green-700 border-green-200' };
    if (outcome === 'lost') return { label: 'Lost', color: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (outcome === 'waiting_for_response') return { label: 'Quoted', color: 'bg-purple-100 text-purple-700 border-purple-200' };
  }
  return STATUSES[status] || { label: status || 'Unknown', color: 'bg-gray-100 text-gray-700 border-gray-200' };
}

function StatusPill({ submission }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(submission?.submission_status || 'received');
  const [selectedOutcome, setSelectedOutcome] = useState(submission?.submission_outcome || 'pending');
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [otherReason, setOtherReason] = useState('');
  const [pendingInfo, setPendingInfo] = useState('');
  const popoverRef = useRef(null);

  const updateMutation = useMutation({
    mutationFn: (data) => updateSubmission(submission.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submission', submission.id] });
      setIsOpen(false);
    },
  });

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

  if (!submission) return null;

  const currentStatus = submission.submission_status || 'received';
  const currentOutcome = submission.submission_outcome || 'pending';
  const smartStatus = getSmartStatus(currentStatus, currentOutcome);

  const handleOpen = () => {
    setSelectedStatus(currentStatus);
    setSelectedOutcome(currentOutcome);
    if (currentOutcome === 'declined') {
      setSelectedReasons(DECLINE_REASONS.filter(r => submission.outcome_reason?.includes(r)));
    } else if (currentOutcome === 'lost') {
      setSelectedReasons(LOST_REASONS.filter(r => submission.outcome_reason?.includes(r)));
    } else if (currentStatus === 'pending_info') {
      setPendingInfo(submission.outcome_reason || '');
    }
    setOtherReason('');
    setIsOpen(true);
  };

  const handleStatusChange = (newStatus) => {
    setSelectedStatus(newStatus);
    const outcomes = STATUS_OUTCOMES[newStatus];
    setSelectedOutcome(outcomes[0] === 'pending' && newStatus === 'quoted' ? 'waiting_for_response' : outcomes[0]);
    setSelectedReasons([]);
    setOtherReason('');
    setPendingInfo('');
  };

  const handleSave = () => {
    let reason = null;
    if (selectedOutcome === 'declined' || selectedOutcome === 'lost') {
      const allReasons = [...selectedReasons];
      if (otherReason.trim()) allReasons.push(`Other: ${otherReason.trim()}`);
      reason = allReasons.join('; ') || null;
      if (!reason) { alert('Please select at least one reason'); return; }
    } else if (selectedStatus === 'pending_info') {
      reason = pendingInfo.trim() || null;
    }
    updateMutation.mutate({
      submission_status: selectedStatus,
      submission_outcome: selectedOutcome,
      outcome_reason: reason,
    });
  };

  const toggleReason = (reason) => {
    setSelectedReasons(prev => prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]);
  };

  const availableOutcomes = STATUS_OUTCOMES[selectedStatus] || [];
  const showReasons = selectedOutcome === 'declined' || selectedOutcome === 'lost';
  const reasonList = selectedOutcome === 'declined' ? DECLINE_REASONS : LOST_REASONS;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={handleOpen}
        className={`px-3 py-1 text-sm font-medium rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${smartStatus.color}`}
      >
        {smartStatus.label}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50 p-4 space-y-3">
          {/* Status + Outcome */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select value={selectedStatus} onChange={(e) => handleStatusChange(e.target.value)} className="form-select text-sm w-full">
                {Object.entries(STATUSES).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            {availableOutcomes.length > 1 && (
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Outcome</label>
                <select value={selectedOutcome} onChange={(e) => { setSelectedOutcome(e.target.value); setSelectedReasons([]); }} className="form-select text-sm w-full">
                  {availableOutcomes.map(o => <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Pending Info */}
          {selectedStatus === 'pending_info' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Waiting for</label>
              <input type="text" value={pendingInfo} onChange={(e) => setPendingInfo(e.target.value)}
                placeholder="What info needed?" className="form-input text-sm w-full" />
            </div>
          )}

          {/* Reasons */}
          {showReasons && (
            <div>
              <label className="block text-xs text-gray-500 mb-2">{selectedOutcome === 'declined' ? 'Decline' : 'Lost'} Reasons</label>
              <div className="flex flex-wrap gap-1">
                {reasonList.map(reason => (
                  <button key={reason} onClick={() => toggleReason(reason)}
                    className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                      selectedReasons.includes(reason) ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {reason}
                  </button>
                ))}
              </div>
              <input type="text" value={otherReason} onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Other..." className="form-input text-sm w-full mt-2" />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setIsOpen(false)} className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button onClick={handleSave} disabled={updateMutation.isPending}
              className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
              {updateMutation.isPending ? '...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowStatusBadge({ submissionId, currentUser, onUserChange }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow', submissionId],
    queryFn: () => getSubmissionWorkflow(submissionId).then(res => res.data),
    refetchInterval: 30000, // Refresh every 30s
  });

  // Fetch recommendation when in formal review stage
  const { data: recommendationData } = useQuery({
    queryKey: ['recommendation', submissionId],
    queryFn: () => getUwRecommendation(submissionId).then(res => res.data),
    enabled: workflow?.current_stage === 'formal',
  });
  const recommendation = recommendationData?.recommendation;

  const voteMutation = useMutation({
    mutationFn: (vote) => recordVote(submissionId, vote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', submissionId] });
      setIsOpen(false);
    },
  });

  const claimMutation = useMutation({
    mutationFn: () => claimSubmission(submissionId, currentUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', submissionId] });
    },
  });

  const startPrescreenMutation = useMutation({
    mutationFn: () => startPrescreen(submissionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', submissionId] });
    },
  });

  const submitForReviewMutation = useMutation({
    mutationFn: (recommendation) => submitForReview(submissionId, recommendation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', submissionId] });
      setIsOpen(false);
    },
  });

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

  if (isLoading) {
    return <span className="text-xs text-gray-400">...</span>;
  }

  if (!workflow) {
    return (
      <button
        onClick={() => startPrescreenMutation.mutate()}
        disabled={startPrescreenMutation.isPending}
        className="px-2 py-0.5 text-xs font-medium rounded border bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 transition-colors"
      >
        {startPrescreenMutation.isPending ? '...' : 'Start Workflow'}
      </button>
    );
  }

  const stage = workflow.current_stage || 'intake';
  const stageConfig = WORKFLOW_STAGES[stage] || WORKFLOW_STAGES.intake;
  const votes = workflow.votes || [];
  const myVote = votes.find(v => v.user_name === currentUser);
  const needsVote = (stage === 'pre_screen' || stage === 'formal') && !myVote;
  const isAssignedToMe = workflow.assigned_to_name === currentUser;
  const canClaim = stage === 'uw_work' && !workflow.assigned_to_id;

  // Count votes by type
  const voteCounts = votes.reduce((acc, v) => {
    acc[v.vote] = (acc[v.vote] || 0) + 1;
    return acc;
  }, {});

  const handleVote = (vote) => {
    voteMutation.mutate({
      stage,
      user_name: currentUser,
      vote,
    });
  };

  return (
    <div className="relative flex items-center gap-2" ref={popoverRef}>
      {/* User selector */}
      <select
        value={currentUser}
        onChange={(e) => {
          localStorage.setItem('currentUwUser', e.target.value);
          onUserChange(e.target.value);
        }}
        className="text-xs border-0 bg-transparent text-gray-500 pr-5 cursor-pointer hover:text-gray-700 focus:ring-0"
      >
        {TEAM_USERS.map(user => (
          <option key={user} value={user}>{user}</option>
        ))}
      </select>

      {/* Stage badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-0.5 text-xs font-medium rounded border cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1 ${stageConfig.color}`}
      >
        <span>{stageConfig.icon}</span>
        <span>{stageConfig.label}</span>
        {votes.length > 0 && (
          <span className="ml-1 text-[10px] opacity-75">({votes.length}/3)</span>
        )}
      </button>

      {/* Action indicators */}
      {needsVote && (
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="Your vote needed" />
      )}
      {isAssignedToMe && (
        <span className="text-xs text-yellow-600 font-medium">Yours</span>
      )}
      {canClaim && (
        <button
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {claimMutation.isPending ? '...' : 'Claim'}
        </button>
      )}
      {stage === 'uw_work' && isAssignedToMe && (
        <button
          onClick={() => submitForReviewMutation.mutate({ recommendation: 'quote', user_name: currentUser })}
          disabled={submitForReviewMutation.isPending}
          className="px-2 py-0.5 text-xs font-medium rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
        >
          {submitForReviewMutation.isPending ? '...' : 'Submit for Review'}
        </button>
      )}

      {/* Popover for voting and details */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-lg shadow-lg border z-50 p-3 space-y-3">
          {/* Stage info */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900">{stageConfig.label}</span>
              {workflow.assigned_to_name && (
                <span className="text-xs text-gray-500">
                  Assigned: {workflow.assigned_to_name}
                </span>
              )}
            </div>

            {/* Vote summary */}
            {votes.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {Object.entries(voteCounts).map(([vote, count]) => (
                  <span
                    key={vote}
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      vote === 'pursue' || vote === 'approve'
                        ? 'bg-green-100 text-green-700'
                        : vote === 'pass' || vote === 'decline'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {vote}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Voting UI for pre_screen */}
          {stage === 'pre_screen' && !myVote && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Cast your vote:</div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleVote('pursue')}
                  disabled={voteMutation.isPending}
                  className="flex-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Pursue
                </button>
                <button
                  onClick={() => handleVote('pass')}
                  disabled={voteMutation.isPending}
                  className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Pass
                </button>
                <button
                  onClick={() => handleVote('unsure')}
                  disabled={voteMutation.isPending}
                  className="flex-1 px-3 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                >
                  Unsure
                </button>
              </div>
            </div>
          )}

          {/* UW Recommendation display for formal review */}
          {stage === 'formal' && recommendation && (
            <div className={`p-2 rounded-lg border ${
              recommendation.recommendation === 'quote'
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">UW Recommendation</span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                  recommendation.recommendation === 'quote'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {recommendation.recommendation === 'quote' ? 'Quote' : 'Decline'}
                </span>
              </div>
              <div className="text-xs text-gray-600">
                by {recommendation.uw_name}
              </div>
              {recommendation.summary && (
                <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {recommendation.summary}
                </div>
              )}
            </div>
          )}

          {/* Voting UI for formal review */}
          {stage === 'formal' && !myVote && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Cast your vote:</div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleVote('approve')}
                  disabled={voteMutation.isPending}
                  className="flex-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleVote('decline')}
                  disabled={voteMutation.isPending}
                  className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Submit for review UI */}
          {stage === 'uw_work' && isAssignedToMe && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Submit your recommendation:</div>
              <div className="flex gap-2">
                <button
                  onClick={() => submitForReviewMutation.mutate({ recommendation: 'quote', user_name: currentUser })}
                  disabled={submitForReviewMutation.isPending}
                  className="flex-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Quote
                </button>
                <button
                  onClick={() => submitForReviewMutation.mutate({ recommendation: 'decline', user_name: currentUser })}
                  disabled={submitForReviewMutation.isPending}
                  className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Already voted message */}
          {(stage === 'pre_screen' || stage === 'formal') && myVote && (
            <div className="text-xs text-gray-500">
              You voted: <span className="font-medium">{myVote.vote}</span>
            </div>
          )}

          {/* Vote queue link */}
          <div className="pt-2 border-t">
            <Link
              to="/vote-queue"
              className="text-xs text-blue-600 hover:text-blue-800"
              onClick={() => setIsOpen(false)}
            >
              Open Vote Queue
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubmissionLayout() {
  const { submissionId } = useParams();
  const [isDocsPanelOpen, setIsDocsPanelOpen] = useState(false);
  const [isCorrectionsPanelOpen, setIsCorrectionsPanelOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(getInitialUser);

  const { data: submission } = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId).then(res => res.data),
  });

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-lg font-bold text-gray-900 hover:text-gray-700">
              Underwriting Portal
            </Link>
            <span className="text-gray-300">›</span>
            <span className="text-gray-600">{submission?.applicant_name || 'Loading...'}</span>
            <span className="text-gray-300">›</span>
            <StatusPill submission={submission} />
            <span className="text-gray-300 ml-2">|</span>
            <button
              onClick={() => setIsDocsPanelOpen(true)}
              className="ml-2 px-3 py-1 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Docs
            </button>
            <AiCorrectionsBadge
              submissionId={submissionId}
              onClick={() => setIsCorrectionsPanelOpen(true)}
            />
            <span className="text-gray-300 ml-2">|</span>
            <WorkflowStatusBadge
              submissionId={submissionId}
              currentUser={currentUser}
              onUserChange={setCurrentUser}
            />
          </div>
          <nav className="flex items-center gap-6">
            <Link to="/" className="nav-link">Submissions</Link>
            <span className="nav-link">Statistics</span>
            <span className="nav-link">Settings</span>
          </nav>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex space-x-8">
            {tabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `tab-link ${isActive ? 'tab-link-active' : 'tab-link-inactive'}`
                }
              >
                {tab.name}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Tab Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>

      {/* Docs Panel */}
      <DocsPanel
        submissionId={submissionId}
        isOpen={isDocsPanelOpen}
        onClose={() => setIsDocsPanelOpen(false)}
      />

      {/* AI Corrections Panel */}
      {isCorrectionsPanelOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40 transition-opacity"
            onClick={() => setIsCorrectionsPanelOpen(false)}
          />

          {/* Panel */}
          <div className="fixed right-4 top-4 bottom-4 w-[500px] bg-white shadow-2xl z-50 flex flex-col rounded-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">AI Corrections Review</h2>
              <button
                onClick={() => setIsCorrectionsPanelOpen(false)}
                className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <AiCorrectionsPanel
              submissionId={submissionId}
              className="flex-1 overflow-hidden"
            />
          </div>
        </>
      )}
    </div>
  );
}
