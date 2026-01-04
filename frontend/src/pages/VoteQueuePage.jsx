import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  getWorkflowQueue,
  getWorkflowSummary,
  getMyWork,
  recordVote,
  claimSubmission,
  getUwRecommendation,
} from '../api/client';

// Available users for the team
const TEAM_USERS = ['Sarah', 'Mike', 'Tom'];

// Get initial user from localStorage or default to first user
const getInitialUser = () => {
  const saved = localStorage.getItem('currentUwUser');
  return saved && TEAM_USERS.includes(saved) ? saved : TEAM_USERS[0];
};

function formatCurrency(value) {
  if (!value) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTimeRemaining(hours) {
  if (hours === null || hours === undefined) return '-';
  if (hours < 0) return 'Overdue';
  if (hours < 1) return `${Math.round(hours * 60)}m left`;
  return `${hours.toFixed(1)}h left`;
}

function formatHoursWaiting(hours) {
  if (hours === null || hours === undefined) return '-';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

// Vote button component
function VoteButton({ label, icon, onClick, disabled, variant = 'default', selected }) {
  const baseClasses = 'px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-50';
  const variantClasses = {
    pursue: selected
      ? 'bg-green-600 text-white'
      : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200',
    pass: selected
      ? 'bg-red-600 text-white'
      : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200',
    unsure: selected
      ? 'bg-amber-600 text-white'
      : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200',
    approve: selected
      ? 'bg-green-600 text-white'
      : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200',
    decline: selected
      ? 'bg-red-600 text-white'
      : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200',
    send_back: selected
      ? 'bg-gray-600 text-white'
      : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200',
    default: 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant] || variantClasses.default}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// Pre-screen vote card
function PreScreenCard({ item, onVote, isVoting }) {
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const hasVoted = !!item.my_vote;

  const handleVote = (vote) => {
    onVote({
      submissionId: item.submission_id,
      vote,
      comment: comment || null,
    });
  };

  const hoursRemaining = item.hours_remaining;
  const isUrgent = hoursRemaining !== null && hoursRemaining < 1;

  return (
    <div className={`bg-white rounded-lg border ${isUrgent ? 'border-orange-300' : 'border-gray-200'} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
            PRE-SCREEN
          </span>
          <Link
            to={`/submissions/${item.submission_id}/account`}
            className="font-semibold text-gray-900 hover:text-purple-600"
          >
            {item.applicant_name}
          </Link>
        </div>
        <div className={`text-sm ${isUrgent ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
          {isUrgent && <span className="mr-1">&#9888;</span>}
          {formatTimeRemaining(hoursRemaining)}
        </div>
      </div>

      {/* Vote tally */}
      {Object.keys(item.vote_tally || {}).length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-4 text-sm">
          {item.vote_tally.pursue && (
            <span className="text-green-600">
              &#128077; {item.vote_tally.pursue.count} Pursue
            </span>
          )}
          {item.vote_tally.pass && (
            <span className="text-red-600">
              &#128078; {item.vote_tally.pass.count} Pass
            </span>
          )}
          {item.vote_tally.unsure && (
            <span className="text-amber-600">
              &#10067; {item.vote_tally.unsure.count} Unsure
            </span>
          )}
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">
            {item.votes_cast} of {item.required_votes} needed
          </span>
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-3">
        {/* Already voted indicator */}
        {hasVoted && (
          <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
            You voted: <span className="font-medium capitalize">{item.my_vote}</span>
          </div>
        )}

        {/* Vote buttons */}
        {!hasVoted && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <VoteButton
                label="Pursue"
                icon="&#128077;"
                variant="pursue"
                onClick={() => handleVote('pursue')}
                disabled={isVoting}
              />
              <VoteButton
                label="Pass"
                icon="&#128078;"
                variant="pass"
                onClick={() => handleVote('pass')}
                disabled={isVoting}
              />
              <VoteButton
                label="Unsure"
                icon="&#10067;"
                variant="unsure"
                onClick={() => handleVote('unsure')}
                disabled={isVoting}
              />
            </div>

            {/* Comment toggle */}
            <div>
              {!showComment ? (
                <button
                  onClick={() => setShowComment(true)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  + Add comment
                </button>
              ) : (
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional comment..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Formal review vote card
function FormalReviewCard({ item, onVote, isVoting }) {
  const [comment, setComment] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const hasVoted = !!item.my_vote;

  // Fetch recommendation
  const { data: recData } = useQuery({
    queryKey: ['uw-recommendation', item.submission_id],
    queryFn: () => getUwRecommendation(item.submission_id).then(res => res.data),
  });
  const recommendation = recData?.recommendation;

  const handleVote = (vote) => {
    onVote({
      submissionId: item.submission_id,
      vote,
      comment: comment || null,
    });
  };

  const hoursRemaining = item.hours_remaining;
  const isUrgent = hoursRemaining !== null && hoursRemaining < 1;

  return (
    <div className={`bg-white rounded-lg border ${isUrgent ? 'border-orange-300' : 'border-purple-200'} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
            FORMAL REVIEW
          </span>
          <Link
            to={`/submissions/${item.submission_id}/account`}
            className="font-semibold text-gray-900 hover:text-purple-600"
          >
            {item.applicant_name}
          </Link>
        </div>
        <div className={`text-sm ${isUrgent ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
          {isUrgent && <span className="mr-1">&#9888;</span>}
          {formatTimeRemaining(hoursRemaining)}
        </div>
      </div>

      {/* Recommendation */}
      {recommendation && (
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-500">{recommendation.uw_name} recommends:</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
              recommendation.recommendation === 'quote'
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {recommendation.recommendation === 'quote' ? 'QUOTE' : 'DECLINE'}
              {recommendation.suggested_premium && ` at ${formatCurrency(recommendation.suggested_premium)}`}
            </span>
          </div>
          <p className="text-sm text-gray-600 italic">"{recommendation.summary}"</p>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="mt-2 text-xs text-purple-600 hover:text-purple-800"
          >
            {showDetails ? 'Hide details' : 'View details'}
          </button>

          {showDetails && recommendation.suggested_terms && (
            <div className="mt-2 text-xs text-gray-500">
              <pre className="bg-white p-2 rounded border">
                {JSON.stringify(recommendation.suggested_terms, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Vote tally */}
      {Object.keys(item.vote_tally || {}).length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-4 text-sm">
          {item.vote_tally.approve && (
            <span className="text-green-600">
              &#10003; {item.vote_tally.approve.count} Approve
            </span>
          )}
          {item.vote_tally.decline && (
            <span className="text-red-600">
              &#10007; {item.vote_tally.decline.count} Decline
            </span>
          )}
          {item.vote_tally.send_back && (
            <span className="text-gray-600">
              &#8617; {item.vote_tally.send_back.count} Send Back
            </span>
          )}
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">
            {item.votes_cast} of {item.required_votes} needed
          </span>
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-3">
        {/* Already voted indicator */}
        {hasVoted && (
          <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
            You voted: <span className="font-medium capitalize">{item.my_vote.replace('_', ' ')}</span>
          </div>
        )}

        {/* Vote buttons */}
        {!hasVoted && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <VoteButton
                label="Approve"
                icon="&#10003;"
                variant="approve"
                onClick={() => handleVote('approve')}
                disabled={isVoting}
              />
              <VoteButton
                label="Decline"
                icon="&#10007;"
                variant="decline"
                onClick={() => handleVote('decline')}
                disabled={isVoting}
              />
              <VoteButton
                label="Send Back"
                icon="&#8617;"
                variant="send_back"
                onClick={() => handleVote('send_back')}
                disabled={isVoting}
              />
            </div>

            {/* Comment */}
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add comment (required for decline/send back)..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Ready to work card
function ReadyToWorkCard({ item, onClaim, isClaiming }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <Link
            to={`/submissions/${item.submission_id}/account`}
            className="font-semibold text-gray-900 hover:text-purple-600"
          >
            {item.applicant_name}
          </Link>
          <div className="text-sm text-gray-500 mt-1">
            Waiting {formatHoursWaiting(item.hours_waiting)}
          </div>
        </div>
        <button
          onClick={() => onClaim(item.submission_id)}
          disabled={isClaiming}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          Claim & Work
        </button>
      </div>
    </div>
  );
}

// My active work card
function MyWorkCard({ item }) {
  return (
    <div className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
            <Link
              to={`/submissions/${item.submission_id}/uw`}
              className="font-semibold text-gray-900 hover:text-purple-600"
            >
              {item.applicant_name}
            </Link>
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {item.naics_primary_title} · {formatCurrency(item.annual_revenue)} revenue
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Working for {Math.round(item.minutes_working || 0)} min
          </div>
        </div>
        <Link
          to={`/submissions/${item.submission_id}/uw`}
          className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg font-medium hover:bg-amber-200"
        >
          Continue
        </Link>
      </div>
    </div>
  );
}

// Main page component
export default function VoteQueuePage() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState(getInitialUser);

  // Handle user change
  const handleUserChange = (newUser) => {
    setCurrentUser(newUser);
    localStorage.setItem('currentUwUser', newUser);
    // Invalidate queries to refetch with new user
    queryClient.invalidateQueries(['workflow-queue']);
    queryClient.invalidateQueries(['my-work']);
  };

  // Fetch queue data
  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['workflow-queue', currentUser],
    queryFn: () => getWorkflowQueue(currentUser).then(res => res.data),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch my work
  const { data: myWorkData, isLoading: myWorkLoading } = useQuery({
    queryKey: ['my-work', currentUser],
    queryFn: () => getMyWork(currentUser).then(res => res.data),
    refetchInterval: 30000,
  });

  // Fetch summary
  const { data: summaryData } = useQuery({
    queryKey: ['workflow-summary'],
    queryFn: () => getWorkflowSummary().then(res => res.data),
    refetchInterval: 60000,
  });

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: ({ submissionId, vote, comment }) =>
      recordVote(submissionId, { user_name: currentUser, vote, comment }),
    onSuccess: () => {
      queryClient.invalidateQueries(['workflow-queue']);
      queryClient.invalidateQueries(['workflow-summary']);
    },
  });

  // Claim mutation
  const claimMutation = useMutation({
    mutationFn: (submissionId) => claimSubmission(submissionId, currentUser),
    onSuccess: () => {
      queryClient.invalidateQueries(['workflow-queue']);
      queryClient.invalidateQueries(['my-work']);
    },
  });

  const needsVotes = queueData?.needs_votes || [];
  const readyToWork = queueData?.ready_to_work || [];
  const myWork = myWorkData?.my_work || [];

  // Separate pre-screen and formal review items
  const preScreenItems = needsVotes.filter(item => item.current_stage === 'pre_screen');
  const formalItems = needsVotes.filter(item => item.current_stage === 'formal');

  // Count items needing my vote (not already voted)
  const needsMyVote = needsVotes.filter(item => !item.my_vote);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-lg font-bold text-gray-900 hover:text-gray-700">
              Underwriting Portal
            </Link>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600">Vote Queue</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Acting as:</span>
              <select
                value={currentUser}
                onChange={(e) => handleUserChange(e.target.value)}
                className="px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-700 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
              >
                {TEAM_USERS.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>
            </div>
            <Link to="/" className="text-purple-600 hover:text-purple-800">
              Submissions
            </Link>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-3xl font-bold text-red-600">{needsMyVote.length}</div>
            <div className="text-sm text-gray-500">Need My Vote</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-3xl font-bold text-amber-600">{myWork.length}</div>
            <div className="text-sm text-gray-500">In Progress</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-3xl font-bold text-purple-600">{readyToWork.length}</div>
            <div className="text-sm text-gray-500">Ready to Work</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-3xl font-bold text-green-600">
              {summaryData?.totals?.quoted || 0}
            </div>
            <div className="text-sm text-gray-500">Quoted This Period</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-3 gap-6">
          {/* Left Column: Votes Needed */}
          <div className="col-span-2 space-y-6">
            {/* Pre-screen votes */}
            {preScreenItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                  Pre-Screen Votes
                  {preScreenItems.filter(i => !i.my_vote).length > 0 && (
                    <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                      {preScreenItems.filter(i => !i.my_vote).length} pending
                    </span>
                  )}
                </h2>
                <div className="space-y-3">
                  {preScreenItems.map((item) => (
                    <PreScreenCard
                      key={item.submission_id}
                      item={item}
                      onVote={(data) => voteMutation.mutate(data)}
                      isVoting={voteMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Formal review votes */}
            {formalItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                  Formal Review Votes
                  {formalItems.filter(i => !i.my_vote).length > 0 && (
                    <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                      {formalItems.filter(i => !i.my_vote).length} pending
                    </span>
                  )}
                </h2>
                <div className="space-y-3">
                  {formalItems.map((item) => (
                    <FormalReviewCard
                      key={item.submission_id}
                      item={item}
                      onVote={(data) => voteMutation.mutate(data)}
                      isVoting={voteMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {needsVotes.length === 0 && !queueLoading && (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <div className="text-4xl mb-4">&#10003;</div>
                <div className="text-lg font-medium text-gray-900">All caught up!</div>
                <div className="text-gray-500">No votes needed right now.</div>
              </div>
            )}

            {queueLoading && (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <div className="text-gray-500">Loading queue...</div>
              </div>
            )}
          </div>

          {/* Right Column: Work Queue */}
          <div className="space-y-6">
            {/* My Active Work */}
            {myWork.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                  My Active Work
                </h2>
                <div className="space-y-3">
                  {myWork.map((item) => (
                    <MyWorkCard key={item.submission_id} item={item} />
                  ))}
                </div>
              </div>
            )}

            {/* Ready to Work */}
            {readyToWork.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                  Ready to Work
                  <span className="text-sm font-normal text-gray-500">
                    ({readyToWork.length} waiting)
                  </span>
                </h2>
                <div className="space-y-3">
                  {readyToWork.map((item) => (
                    <ReadyToWorkCard
                      key={item.submission_id}
                      item={item}
                      onClaim={(id) => claimMutation.mutate(id)}
                      isClaiming={claimMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state for work */}
            {myWork.length === 0 && readyToWork.length === 0 && !myWorkLoading && (
              <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                <div className="text-gray-500 text-sm">
                  No accounts in work queue.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
