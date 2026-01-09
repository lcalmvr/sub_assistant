import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dismissAgentNotification } from '../api/client';

// localStorage key for badge preference
const BADGE_ENABLED_KEY = 'ai-notification-badge-enabled';

// Helper to get badge preference (default: enabled)
export function isBadgeEnabled() {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(BADGE_ENABLED_KEY);
  return stored === null ? true : stored === 'true';
}

// Helper to set badge preference
export function setBadgeEnabled(enabled) {
  localStorage.setItem(BADGE_ENABLED_KEY, String(enabled));
}

/**
 * HeadsUpSection - Proactive notifications in the AI panel
 *
 * Shows issues that need attention without the user asking.
 * Appears between quick actions and the help section.
 */

// Priority colors and icons
const PRIORITY_CONFIG = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: 'text-red-500',
    dot: 'bg-red-500',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: 'text-amber-500',
    dot: 'bg-amber-500',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    icon: 'text-blue-500',
    dot: 'bg-blue-500',
  },
};

// Tab navigation mapping
const TAB_LABELS = {
  setup: 'Setup',
  analyze: 'Analyze',
  review: 'Review',
  quote: 'Quote',
  policy: 'Policy',
};

function NotificationIcon({ priority }) {
  const colors = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.info;

  if (priority === 'critical') {
    return (
      <svg className={`w-4 h-4 ${colors.icon} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }

  if (priority === 'warning') {
    return (
      <svg className={`w-4 h-4 ${colors.icon} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }

  return (
    <svg className={`w-4 h-4 ${colors.icon} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function NotificationCard({ notification, onDismiss, onNavigate }) {
  const config = PRIORITY_CONFIG[notification.priority] || PRIORITY_CONFIG.info;
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = (e) => {
    e.stopPropagation();
    setIsDismissing(true);
    onDismiss(notification.key);
  };

  const handleClick = () => {
    if (notification.action_tab) {
      onNavigate(notification.action_tab);
    }
  };

  return (
    <div
      className={`${config.bg} ${config.border} border rounded-md p-3 ${notification.action_tab ? 'cursor-pointer hover:shadow-sm' : ''} transition-all ${isDismissing ? 'opacity-50' : ''}`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <NotificationIcon priority={notification.priority} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${config.text}`}>
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs text-gray-600 mt-0.5">
              {notification.body}
            </p>
          )}
          {notification.action_tab && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <span>Go to {TAB_LABELS[notification.action_tab] || notification.action_tab}</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-0.5 flex-shrink-0"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function HeadsUpSection({ submissionId, notifications, onNavigate, badgeEnabled, onBadgeToggle }) {
  const [isOpen, setIsOpen] = useState(true);
  const queryClient = useQueryClient();

  const dismissMutation = useMutation({
    mutationFn: (key) => dismissAgentNotification(submissionId, key),
    onSuccess: () => {
      // Refetch notifications after dismissal
      queryClient.invalidateQueries(['agent-notifications', submissionId]);
    },
  });

  // Don't render if no notifications
  if (!notifications || notifications.length === 0) {
    return null;
  }

  // Count by priority
  const criticalCount = notifications.filter(n => n.priority === 'critical').length;
  const warningCount = notifications.filter(n => n.priority === 'warning').length;

  return (
    <div className="border-b">
      <div className="flex items-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 px-4 py-2 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            {criticalCount > 0 ? (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            ) : warningCount > 0 ? (
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            ) : (
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          )}
          <span className={criticalCount > 0 ? 'text-red-700 font-medium' : 'text-gray-700'}>
            Heads Up
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            criticalCount > 0
              ? 'bg-red-100 text-red-700'
              : warningCount > 0
              ? 'bg-amber-100 text-amber-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {notifications.length}
          </span>
        </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Badge toggle button */}
        {onBadgeToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBadgeToggle(!badgeEnabled);
            }}
            className="px-2 py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title={badgeEnabled ? 'Hide badge on AI button' : 'Show badge on AI button'}
          >
            {badgeEnabled ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.key}
              notification={notification}
              onDismiss={dismissMutation.mutate}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
