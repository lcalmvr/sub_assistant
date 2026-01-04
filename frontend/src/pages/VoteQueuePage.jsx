import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  getWorkflowQueue,
  getWorkflowSummary,
  getMyWork,
  recordVote,
  addWorkflowComment,
  claimSubmission,
  getUwRecommendation,
  getPendingDeclines,
  sendDecline,
  cancelPendingDecline,
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

// Decline reasons for pass votes
const DECLINE_REASONS = [
  'Outside appetite',
  'Industry exclusion',
  'Revenue too small',
  'Revenue too large',
  'Loss history',
  'Insufficient controls',
  'Broker relationship',
  'Capacity constraints',
];

// Pre-screen vote card
function PreScreenCard({ item, onVote, isVoting, onComment, isCommenting }) {
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [showPassReasons, setShowPassReasons] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState([]);
  const hasVoted = !!item.my_vote;

  const handleVote = (vote) => {
    onVote({
      submissionId: item.submission_id,
      vote,
      comment: comment || null,
      reasons: vote === 'pass' ? selectedReasons : null,
    });
    setShowPassReasons(false);
    setSelectedReasons([]);
    setComment('');
    setShowComment(false);
  };

  const handleSubmitComment = () => {
    if (comment.trim()) {
      onComment({ submissionId: item.submission_id, comment: comment.trim() });
      setComment('');
      setShowComment(false);
    }
  };

  const toggleReason = (reason) => {
    setSelectedReasons(prev =>
      prev.includes(reason)
        ? prev.filter(r => r !== reason)
        : [...prev, reason]
    );
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

      {/* Submission context */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-2">
        {/* Opportunity notes - prominent if present */}
        {item.opportunity_notes && (
          <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            {item.opportunity_notes}
          </div>
        )}

        {/* Industry & Revenue */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {item.naics_primary_title && (
            <span className="truncate max-w-[200px]">{item.naics_primary_title}</span>
          )}
          {item.naics_primary_title && item.annual_revenue && (
            <span className="text-gray-300">·</span>
          )}
          {item.annual_revenue && (
            <span>{formatCurrency(item.annual_revenue)} revenue</span>
          )}
        </div>

        {/* Broker info: Company · Person */}
        {(item.broker_company || item.broker_person || item.broker_email) && (
          <div className="text-sm text-gray-600">
            {[
              item.broker_company,
              item.broker_person || item.broker_email?.split('@')[0]
            ].filter(Boolean).join(' · ')}
          </div>
        )}

        {/* Loss history */}
        {item.loss_count > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              item.total_paid > 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {item.loss_count} {item.loss_count === 1 ? 'loss' : 'losses'}
              {item.total_paid > 0 && ` · ${formatCurrency(item.total_paid)} paid`}
            </span>
          </div>
        )}

        {/* Summary */}
        {item.bullet_point_summary && (
          <p className="text-sm text-gray-500 line-clamp-2">{item.bullet_point_summary}</p>
        )}

        {/* Empty state */}
        {!item.opportunity_notes && !item.naics_primary_title && !item.annual_revenue && !item.broker_company && !item.broker_person && !item.broker_email && !item.bullet_point_summary && (
          <p className="text-sm text-gray-400 italic">No submission details available</p>
        )}
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
        {!hasVoted && !showPassReasons && (
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
                onClick={() => setShowPassReasons(true)}
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

            {/* Comment section */}
            <div>
              {!showComment ? (
                <button
                  onClick={() => setShowComment(true)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  + Add comment
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add comment..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                  />
                  <button
                    onClick={handleSubmitComment}
                    disabled={!comment.trim() || isCommenting}
                    className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCommenting ? '...' : 'Post'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Existing comments */}
        {item.comments && item.comments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            <div className="text-xs font-medium text-gray-500 uppercase">Comments</div>
            {item.comments.map((c, idx) => (
              <div key={idx} className="text-sm">
                <span className="font-medium text-gray-700">{c.user_name}</span>
                {c.vote && c.vote !== 'comment' && (
                  <span className={`ml-1 text-xs ${
                    c.vote === 'pursue' ? 'text-green-600' :
                    c.vote === 'pass' ? 'text-red-600' :
                    c.vote === 'unsure' ? 'text-amber-600' : 'text-gray-500'
                  }`}>
                    ({c.vote})
                  </span>
                )}
                <span className="text-gray-500">: {c.comment}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pass reason selection */}
        {!hasVoted && showPassReasons && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Why are we passing?</span>
              <button
                onClick={() => { setShowPassReasons(false); setSelectedReasons([]); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {DECLINE_REASONS.map(reason => (
                <button
                  key={reason}
                  onClick={() => toggleReason(reason)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    selectedReasons.includes(reason)
                      ? 'bg-red-100 border-red-300 text-red-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Additional notes (optional)..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <button
              onClick={() => handleVote('pass')}
              disabled={isVoting || selectedReasons.length === 0}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVoting ? 'Submitting...' : `Pass - ${selectedReasons.length === 0 ? 'Select reason(s)' : selectedReasons.join(', ')}`}
            </button>
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

// Pending decline card
function PendingDeclineCard({ item, onSend, onCancel, isSending, isCancelling }) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-red-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
            PENDING DECLINE
          </span>
          <Link
            to={`/submissions/${item.submission_id}/account`}
            className="font-semibold text-gray-900 hover:text-purple-600"
          >
            {item.applicant_name}
          </Link>
        </div>
        <div className="text-sm text-gray-500">
          {Math.round(item.hours_pending || 0)}h ago
        </div>
      </div>

      <div className="px-4 py-3">
        {/* Decline reasons */}
        <div className="flex flex-wrap gap-1 mb-2">
          {item.decline_reasons?.map((reason, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 text-xs bg-red-50 text-red-700 rounded-full"
            >
              {reason}
            </span>
          ))}
        </div>

        {/* Broker info */}
        {(item.broker_company || item.broker_email) && (
          <div className="text-sm text-gray-500 mb-3">
            Broker: {item.broker_company || item.broker_email}
          </div>
        )}

        {/* Additional notes */}
        {item.additional_notes && (
          <div className="text-sm text-gray-600 italic mb-3 p-2 bg-gray-50 rounded">
            {item.additional_notes}
          </div>
        )}

        {/* Action buttons */}
        {!showConfirm ? (
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={isSending}
              className="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Send Decline
            </button>
            <button
              onClick={() => onCancel(item.id)}
              disabled={isCancelling}
              className="px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Send decline letter to broker? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onSend(item.id);
                  setShowConfirm(false);
                }}
                disabled={isSending}
                className="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {isSending ? 'Sending...' : 'Confirm Send'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded font-medium hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          </div>
        )}
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

  // Fetch pending declines
  const { data: pendingDeclinesData } = useQuery({
    queryKey: ['pending-declines'],
    queryFn: () => getPendingDeclines().then(res => res.data),
    refetchInterval: 30000,
  });

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: ({ submissionId, vote, comment, reasons }) =>
      recordVote(submissionId, { user_name: currentUser, vote, comment, reasons }),
    onSuccess: () => {
      queryClient.invalidateQueries(['workflow-queue']);
      queryClient.invalidateQueries(['workflow-summary']);
    },
  });

  // Comment mutation (standalone comment without vote)
  const commentMutation = useMutation({
    mutationFn: ({ submissionId, comment }) =>
      addWorkflowComment(submissionId, currentUser, comment),
    onSuccess: () => {
      queryClient.invalidateQueries(['workflow-queue']);
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

  // Send decline mutation
  const sendDeclineMutation = useMutation({
    mutationFn: (declineId) => sendDecline(declineId, currentUser),
    onSuccess: () => {
      queryClient.invalidateQueries(['pending-declines']);
      queryClient.invalidateQueries(['workflow-summary']);
    },
  });

  // Cancel decline mutation
  const cancelDeclineMutation = useMutation({
    mutationFn: (declineId) => cancelPendingDecline(declineId, currentUser),
    onSuccess: () => {
      queryClient.invalidateQueries(['pending-declines']);
      queryClient.invalidateQueries(['workflow-queue']);
      queryClient.invalidateQueries(['workflow-summary']);
    },
  });

  const needsVotes = queueData?.needs_votes || [];
  const readyToWork = queueData?.ready_to_work || [];
  const myWork = myWorkData?.my_work || [];
  const pendingDeclines = pendingDeclinesData || [];

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
        <div className="grid grid-cols-5 gap-4 mb-8">
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
            <div className="text-3xl font-bold text-rose-600">{pendingDeclines.length}</div>
            <div className="text-sm text-gray-500">Pending Declines</div>
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
                      onComment={(data) => commentMutation.mutate(data)}
                      isCommenting={commentMutation.isPending}
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

            {/* Pending Declines */}
            {pendingDeclines.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                  Pending Declines
                  <span className="text-sm font-normal text-gray-500">
                    ({pendingDeclines.length} awaiting review)
                  </span>
                </h2>
                <div className="space-y-3">
                  {pendingDeclines.map((item) => (
                    <PendingDeclineCard
                      key={item.id}
                      item={item}
                      onSend={(id) => sendDeclineMutation.mutate(id)}
                      onCancel={(id) => cancelDeclineMutation.mutate(id)}
                      isSending={sendDeclineMutation.isPending}
                      isCancelling={cancelDeclineMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state for work */}
            {myWork.length === 0 && readyToWork.length === 0 && pendingDeclines.length === 0 && !myWorkLoading && (
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
