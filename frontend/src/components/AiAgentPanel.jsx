import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { agentChat, agentAction, agentConfirm, getAgentCapabilities, submitFeatureRequest } from '../api/client';
import HeadsUpSection from './HeadsUpSection';

/**
 * AiAgentPanel - Slide-out AI assistant panel
 *
 * Features:
 * - Context-aware quick actions based on current page
 * - Chat interface with streaming responses
 * - Action confirmation flow
 * - Cmd+K keyboard shortcut
 */

// Quick actions by page context
// NOTE: Summarize/NIST disabled until Phase 1 gives us rich extraction data
const QUICK_ACTIONS = {
  setup: [
    { id: 'show_gaps', label: 'Show Gaps', icon: 'exclamation' },
  ],
  analyze: [
    { id: 'show_gaps', label: 'Show Gaps', icon: 'exclamation' },
    { id: 'parse_broker_response', label: 'Parse Email', icon: 'mail' },
  ],
  'analyze-v2': [
    { id: 'show_gaps', label: 'Show Gaps', icon: 'exclamation' },
    { id: 'parse_broker_response', label: 'Parse Email', icon: 'mail' },
  ],
  quote: [
    { id: 'quote_command', label: 'Build Quote', icon: 'layers', isQuoteInput: true },
  ],
  policy: [
    { id: 'show_gaps', label: 'Show Gaps', icon: 'exclamation' },
  ],
};

// Quote command examples for placeholder rotation
const QUOTE_EXAMPLES = [
  '1M, 3M, 5M at 50K retention',
  'quote 2M and 5M with 25K ret',
  'XL primary $5M, CMAI $5M xs $5M',
  'set SE to 250K',
];

// Icon components
const icons = {
  document: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  ),
  folder: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  ),
  exclamation: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  ),
  mail: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  ),
  shield: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  ),
  calculator: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  ),
  layers: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  ),
  calendar: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  ),
  switch: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  ),
  check: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
};

function ActionIcon({ name }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {icons[name] || icons.document}
    </svg>
  );
}

// Category icons for the help section
const categoryIcons = {
  'Analysis': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  ),
  'Quote Building': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  ),
  'Policy Management': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  ),
  'Submission Management': (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  ),
};

// Action-specific icons
const actionIcons = {
  'Show Gaps': 'exclamation',
  'Parse Broker Email': 'mail',
  'Comps Search': 'search',
  'Create Quote Option': 'layers',
  'Edit Coverage Limits': 'calculator',
  'Add Subjectivity': 'document',
  'Extend Policy': 'calendar',
  'Change Broker': 'switch',
  'Mark Subjectivity Received': 'check',
  'Issue Policy': 'document',
  'Cancel Policy': 'x',
  'Reinstate Policy': 'refresh',
  'Decline Submission': 'x',
  'Add Note to File': 'note',
};

// Additional icons for actions
const actionIconPaths = {
  search: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />,
  x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
  refresh: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
  note: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
};

function ActionIconSmall({ actionName }) {
  const iconKey = actionIcons[actionName] || 'document';
  const iconPath = actionIconPaths[iconKey] || icons[iconKey] || icons.document;
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {iconPath}
    </svg>
  );
}

// Collapsible Help Section
function HelpSection({ submissionId, onActionClick, onAiQuestion }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  const { data: capabilities } = useQuery({
    queryKey: ['agentCapabilities'],
    queryFn: () => getAgentCapabilities().then(res => res.data),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: isOpen, // Only fetch when expanded
  });

  const requestMutation = useMutation({
    mutationFn: (description) => submitFeatureRequest(description, null, submissionId),
    onSuccess: () => {
      setRequestSubmitted(true);
      setRequestText('');
      setTimeout(() => {
        setShowRequestForm(false);
        setRequestSubmitted(false);
      }, 2000);
    },
  });

  const handleSubmitRequest = (e) => {
    e.preventDefault();
    if (requestText.trim()) {
      requestMutation.mutate(requestText.trim());
    }
  };

  // Handle action click - either ask question or run immediately
  const handleActionClick = (action) => {
    if (action.question) {
      // Has a question - show AI asking it
      onAiQuestion?.(action.question);
    } else {
      // No question - run the action immediately
      onActionClick?.(action.examples?.[0] || action.name);
    }
    setIsOpen(false);
  };

  // Use native title for hover - simpler and always works
  const getTooltip = (action) => {
    if (!action.examples?.length) return action.name;
    return `${action.name}\n\nTry: "${action.examples[0]}"`;
  };

  return (
    <div className="border-b">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          What can I do?
        </span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 max-h-[400px] overflow-y-auto">
          {/* Feature Request - at top */}
          <div className="mb-5 pb-4 border-b border-gray-200">
            {!showRequestForm ? (
              <button
                onClick={() => setShowRequestForm(true)}
                className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Request a new capability
              </button>
            ) : requestSubmitted ? (
              <div className="text-xs text-green-600 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Request submitted!
              </div>
            ) : (
              <form onSubmit={handleSubmitRequest} className="space-y-2">
                <textarea
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  placeholder="Describe what you'd like the AI agent to do..."
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!requestText.trim() || requestMutation.isPending}
                    className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                  >
                    {requestMutation.isPending ? '...' : 'Submit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRequestForm(false)}
                    className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Categories */}
          {capabilities?.categories?.map((category, i) => (
            <div key={i} className="mb-6 last:mb-0">
              {/* Category header */}
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {categoryIcons[category.name] || categoryIcons['Analysis']}
                </svg>
                {category.name}
              </div>

              {/* Action pills in a grid */}
              <div className="flex flex-wrap gap-1.5">
                {category.actions.map((action, j) => (
                  <button
                    key={j}
                    title={getTooltip(action)}
                    onClick={() => handleActionClick(action)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full hover:bg-purple-100 hover:text-purple-700 cursor-pointer transition-colors"
                  >
                    <ActionIconSmall actionName={action.name} />
                    {action.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Message component
function ChatMessage({ message, onConfirm, onCancel, isConfirming }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isUser
            ? 'bg-purple-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        {/* Text content */}
        {message.content && (
          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
        )}

        {/* Structured data (gaps, quotes, etc.) */}
        {message.structured && (
          <div className="mt-2">
            {/* Gaps display */}
            {message.structured.gaps && (
              <div className="space-y-1">
                {message.structured.gaps.map((gap, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`w-2 h-2 rounded-full ${
                      gap.importance === 'critical' ? 'bg-red-500' : 'bg-yellow-500'
                    }`} />
                    <span>{gap.field_name}</span>
                    <span className="text-gray-500 text-xs">({gap.status})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quote(s) created display */}
            {message.structured.action === 'quotes_created' && message.structured.quotes && (
              <div className="space-y-2 mt-2">
                {message.structured.quotes.map((quote, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/50 rounded px-2 py-1">
                    <span className="text-sm font-medium">{quote.name}</span>
                    {quote.premium && (
                      <span className="text-sm text-green-700">${quote.premium.toLocaleString()}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Single quote created display */}
            {message.structured.action === 'quote_created' && message.structured.quote && (
              <div className="bg-white/50 rounded p-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{message.structured.quote.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    message.structured.quote.position === 'excess'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {message.structured.quote.position}
                  </span>
                </div>
                {message.structured.quote.layers && message.structured.quote.layers.length > 1 && (
                  <div className="mt-2 space-y-1">
                    {message.structured.quote.layers.map((layer, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="w-4 text-center">{i + 1}</span>
                        <span className="font-medium">{layer.carrier}</span>
                        <span>${(layer.limit / 1000000).toFixed(0)}M</span>
                        {layer.attachment > 0 && (
                          <span className="text-gray-400">xs ${(layer.attachment / 1000000).toFixed(0)}M</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {message.structured.quote.premium && (
                  <div className="text-sm text-green-700 mt-2">
                    Premium: ${message.structured.quote.premium.toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Coverage change display */}
            {message.structured.action === 'coverage_change' && (
              <div className="bg-white/50 rounded p-2 mt-2 text-sm">
                <span className="font-medium">{message.structured.coverage}</span>
                <span className="mx-2">→</span>
                <span className="text-green-700">${message.structured.value?.toLocaleString()}</span>
                {message.structured.note && (
                  <div className="text-xs text-gray-500 mt-1">{message.structured.note}</div>
                )}
              </div>
            )}

            {message.structured.summary && (
              <div className="text-sm text-gray-600 mt-1">
                {message.structured.summary}
              </div>
            )}
          </div>
        )}

        {/* Action preview (needs confirmation) */}
        {message.actionPreview && (
          <div className="mt-2 p-2 bg-white rounded border">
            <div className="text-sm font-medium text-gray-900 mb-2">
              {message.actionPreview.description}
            </div>
            {message.actionPreview.changes?.map((change, i) => (
              <div key={i} className="text-xs text-gray-600">
                <span className="font-medium">{change.field}:</span>{' '}
                <span className="text-gray-400">{change.from}</span>
                <span className="mx-1">→</span>
                <span className="text-gray-900">{change.to}</span>
              </div>
            ))}
            {message.actionPreview.warnings?.map((warning, i) => (
              <div key={i} className="text-xs text-amber-600 mt-1">
                ⚠️ {warning}
              </div>
            ))}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => onConfirm(message.actionPreview.action_id)}
                disabled={isConfirming}
                className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {isConfirming ? '...' : 'Confirm'}
              </button>
              <button
                onClick={onCancel}
                disabled={isConfirming}
                className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Action result */}
        {message.actionResult && (
          <div className={`mt-2 p-2 rounded text-sm ${
            message.actionResult.success
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}>
            {message.actionResult.success ? '✓' : '✗'} {message.actionResult.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiAgentPanel({
  submissionId,
  submission,
  currentPage,
  isOpen,
  onClose,
  notifications = [],
  onNavigate,
  badgeEnabled = true,
  onBadgeToggle,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Get quick actions for current page
  const quickActions = QUICK_ACTIONS[currentPage] || QUICK_ACTIONS.analyze;

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Keyboard shortcut (Cmd+K)
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // This would need to be handled by parent
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Action mutation
  const actionMutation = useMutation({
    mutationFn: ({ action, params }) => agentAction(submissionId, action, { page: currentPage }, params),
    onSuccess: (response) => {
      const data = response.data;

      if (data.type === 'action_preview') {
        // Show preview in chat, wait for confirmation
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: null,
          actionPreview: data,
        }]);
        setPendingAction(data.action_id);
      } else {
        // Direct response
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message || null,
          structured: data.data || null,
        }]);
      }
    },
    onError: (error) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
      }]);
    },
  });

  // Confirm mutation
  const confirmMutation = useMutation({
    mutationFn: (actionId) => agentConfirm(submissionId, actionId, true),
    onSuccess: (response) => {
      const data = response.data;
      // Update the last message with result
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.actionPreview) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            actionPreview: null,
            actionResult: data,
          };
        }
        return updated;
      });
      setPendingAction(null);
    },
    onError: (error) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
      }]);
      setPendingAction(null);
    },
  });

  // Handle quick action click
  const handleQuickAction = (actionId) => {
    setMessages(prev => [...prev, {
      role: 'user',
      content: `[${actionId.replace(/_/g, ' ')}]`,
    }]);
    actionMutation.mutate({ action: actionId });
  };

  // Handle chat submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsStreaming(true);

    try {
      let response;

      // On quote page, treat input as quote command
      if (currentPage === 'quote') {
        response = await agentAction(submissionId, 'quote_command', { page: currentPage }, { command: userMessage });
      } else {
        // For other pages, use chat endpoint
        response = await agentChat(submissionId, userMessage, {
          page: currentPage,
          user_name: 'User',
        }, messages.slice(-10));
      }

      const data = response.data;

      if (data.type === 'action_preview') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          actionPreview: data,
        }]);
        setPendingAction(data.action_id);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.content || data.message || 'Done.',
          structured: data.data || null,
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  // Handle confirm/cancel
  const handleConfirm = (actionId) => {
    confirmMutation.mutate(actionId);
  };

  const handleCancelAction = () => {
    // Remove the preview message
    setMessages(prev => prev.slice(0, -1));
    setPendingAction(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-4 top-4 bottom-4 w-[400px] bg-white shadow-2xl z-50 flex flex-col rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:inline">⌘K</span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-3 border-b bg-gray-50/50 flex-shrink-0">
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action.id)}
                disabled={actionMutation.isPending || isStreaming}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
              >
                <ActionIcon name={action.icon} />
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Heads Up Section - Proactive Notifications */}
        <HeadsUpSection
          submissionId={submissionId}
          notifications={notifications}
          onNavigate={(tab) => {
            onNavigate?.(tab);
            onClose();
          }}
          badgeEnabled={badgeEnabled}
          onBadgeToggle={onBadgeToggle}
        />

        {/* Help Section */}
        <HelpSection
          submissionId={submissionId}
          onActionClick={(example) => {
            setInput(example);
            inputRef.current?.focus();
          }}
          onAiQuestion={(question) => {
            // Replace messages with just this question (clear any pending questions)
            setMessages([{ role: 'assistant', content: question }]);
            // Focus input for user's response
            inputRef.current?.focus();
          }}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">
              {currentPage === 'quote' ? (
                <>
                  <p>Build quotes with natural language.</p>
                  <p className="mt-2 text-xs">Examples:</p>
                  <ul className="mt-1 text-xs space-y-1">
                    <li>"1M, 3M, 5M at 50K retention"</li>
                    <li>"XL primary $5M, CMAI $5M xs $5M"</li>
                    <li>"set SE sublimit to 250K"</li>
                  </ul>
                </>
              ) : (
                <>
                  <p>Ask me anything about this submission.</p>
                  <p className="mt-1 text-xs">Try a quick action above or type below.</p>
                </>
              )}
            </div>
          ) : (
            messages.map((msg, i) => (
              <ChatMessage
                key={i}
                message={msg}
                onConfirm={handleConfirm}
                onCancel={handleCancelAction}
                isConfirming={confirmMutation.isPending}
              />
            ))
          )}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t bg-white flex-shrink-0">
          {currentPage === 'quote' && (
            <div className="text-xs text-gray-400 mb-2">
              Try: "1M, 3M, 5M at 50K" or "XL primary $5M, CMAI $5M xs $5M"
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={currentPage === 'quote' ? 'Build quotes: "2M, 5M at 25K retention"' : 'Ask me anything...'}
              disabled={isStreaming || !!pendingAction}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming || !!pendingAction}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentPage === 'quote' ? 'Build' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
