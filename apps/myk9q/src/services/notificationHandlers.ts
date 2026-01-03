/**
 * Notification Type Handlers
 *
 * Specific handlers for each type of notification with business logic.
 * Determines when and how to send notifications based on app events.
 */

import { notificationService, type NotificationPayload } from './notificationService';
import type { Entry } from '@/stores/entryStore';

// Temporary Class interface until we have a global types file
interface Class {
  id: number;
  element: string;
  level: string;
  scheduled_start_time?: string;
}

/**
 * Class Starting Notification (5 minutes before start)
 */
export async function notifyClassStarting(
  classData: Class,
  minutesBefore: number = 5
): Promise<void> {
  const payload: NotificationPayload = {
    type: 'class_starting',
    title: `Class Starting Soon`,
    body: `${classData.element} ${classData.level} starts in ${minutesBefore} minutes`,
    data: {
      classId: classData.id,
      className: `${classData.element} ${classData.level}`,
      startTime: classData.scheduled_start_time,
    },
    priority: 'normal',
    requireInteraction: false,
    icon: '/icon-class.png',
    tag: `class-starting-${classData.id}`,
    actions: [
      { action: 'view', title: 'View Class', icon: '/icons/view.png' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  await notificationService.send(payload);
}

/**
 * Your Turn Notification (when it's approaching your turn to compete)
 */
export async function notifyYourTurn(
  entry: Entry,
  previousEntry?: Entry,
  dogsAhead: number = 1
): Promise<void> {
  let body: string;
  let title: string;

  if (dogsAhead === 1) {
    title = `${entry.callName} (#${entry.armband}) - You're Up Next!`;
    body = previousEntry
      ? `${previousEntry.callName} (#${previousEntry.armband}) just entered the ring. You're up next!`
      : `You're up next!`;
  } else {
    title = `${entry.callName} (#${entry.armband}) - Get Ready!`;
    body = previousEntry
      ? `${previousEntry.callName} (#${previousEntry.armband}) just entered the ring. You're ${dogsAhead} dogs away.`
      : `You're ${dogsAhead} dogs away from competing.`;
  }

  const payload: NotificationPayload = {
    type: 'your_turn',
    title,
    body,
    data: {
      entryId: entry.id,
      callName: entry.callName,
      armbandNumber: entry.armband,
      classId: entry.classId,
      dogsAhead,
    },
    priority: 'high',
    requireInteraction: true, // Keep on screen until dismissed
    vibrate: [200, 100, 200], // Double pulse
    icon: '/icon-your-turn.png',
    tag: `your-turn-${entry.id}`,
    actions: [
      { action: 'view', title: 'View Entry', icon: '/icons/view.png' },
      { action: 'acknowledge', title: 'Got It!' },
    ],
  };

  await notificationService.send(payload);
}

/**
 * Results Posted Notification
 */
export async function notifyResultsPosted(
  entry: Entry,
  placement?: number,
  qualified?: boolean
): Promise<void> {
  let title = `Results Posted - ${entry.callName}`;
  let body = `Results are now available for ${entry.callName} (#${entry.armband})`;

  if (placement !== undefined) {
    title = `${getPlacementOrdinal(placement)} Place - ${entry.callName}!`;
    body = qualified
      ? `Congratulations! ${entry.callName} placed ${getPlacementOrdinal(placement)} and qualified!`
      : `${entry.callName} placed ${getPlacementOrdinal(placement)}`;
  }

  const payload: NotificationPayload = {
    type: 'results_posted',
    title,
    body,
    data: {
      entryId: entry.id,
      callName: entry.callName,
      armbandNumber: entry.armband,
      placement,
      qualified,
    },
    priority: placement && placement <= 4 ? 'high' : 'normal',
    icon: qualified ? '/icon-qualified.png' : '/icon-results.png',
    tag: `results-${entry.id}`,
    actions: [
      { action: 'view', title: 'View Results', icon: '/icons/view.png' },
      { action: 'share', title: 'Share', icon: '/icons/share.png' },
    ],
  };

  await notificationService.send(payload);
}

/**
 * Sync Error Notification
 */
export async function notifySyncError(
  errorMessage: string,
  operation: string,
  retryable: boolean = true
): Promise<void> {
  const payload: NotificationPayload = {
    type: 'sync_error',
    title: 'Sync Error',
    body: `Failed to sync ${operation}: ${errorMessage}`,
    data: {
      operation,
      error: errorMessage,
      retryable,
      timestamp: Date.now(),
    },
    priority: 'normal',
    icon: '/icon-error.png',
    tag: `sync-error-${operation}`,
    actions: retryable
      ? [
          { action: 'retry', title: 'Retry Now', icon: '/icons/refresh.png' },
          { action: 'dismiss', title: 'Dismiss' },
        ]
      : [{ action: 'dismiss', title: 'Dismiss' }],
  };

  await notificationService.send(payload);
}

/**
 * System Update Notification
 */
export async function notifySystemUpdate(
  version: string,
  features: string[],
  requiresReload: boolean = false
): Promise<void> {
  const featuresList = features.length > 0
    ? `New features: ${features.slice(0, 3).join(', ')}`
    : 'Bug fixes and improvements';

  const payload: NotificationPayload = {
    type: 'system_update',
    title: `Update Available - v${version}`,
    body: featuresList,
    data: {
      version,
      features,
      requiresReload,
    },
    priority: requiresReload ? 'high' : 'normal',
    requireInteraction: requiresReload,
    icon: '/icon-update.png',
    tag: `update-${version}`,
    actions: requiresReload
      ? [
          { action: 'reload', title: 'Reload Now', icon: '/icons/refresh.png' },
          { action: 'later', title: 'Later' },
        ]
      : [{ action: 'view', title: 'View Details' }],
  };

  await notificationService.send(payload);
}

/**
 * Announcement Notification (from announcementStore)
 */
export async function notifyAnnouncement(
  title: string,
  content: string,
  priority: 'normal' | 'high' | 'urgent',
  announcementId: number
): Promise<void> {
  const payload: NotificationPayload = {
    type: priority === 'urgent' ? 'urgent_announcement' : 'announcement',
    title: priority === 'urgent' ? `🚨 URGENT: ${title}` : title,
    body: content,
    data: {
      announcementId,
      priority,
    },
    priority,
    requireInteraction: priority === 'urgent',
    vibrate: priority === 'urgent' ? [200, 100, 200, 100, 200] : [150],
    icon: priority === 'urgent' ? '/icon-urgent.png' : '/icon-announcement.png',
    tag: `announcement-${announcementId}`,
    actions: [
      { action: 'view', title: 'View', icon: '/icons/view.png' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  await notificationService.send(payload);
}

/**
 * Schedule notification for future delivery
 */
export async function scheduleNotification(
  type: NotificationPayload['type'],
  payload: Omit<NotificationPayload, 'type'>,
  scheduledFor: Date
): Promise<string> {
  return notificationService.queueNotification(
    { ...payload, type },
    scheduledFor.getTime()
  );
}

/**
 * Batch notify multiple entries
 */
export async function batchNotifyResultsPosted(
  entries: Array<{ entry: Entry; placement?: number; qualified?: boolean }>
): Promise<void> {
  // Send notifications with slight delays to avoid overwhelming the user
  for (let i = 0; i < entries.length; i++) {
    const { entry, placement, qualified } = entries[i];

    // Delay each notification by 2 seconds
    setTimeout(() => {
      notifyResultsPosted(entry, placement, qualified);
    }, i * 2000);
  }
}

/**
 * Helper: Get ordinal suffix for placement (1st, 2nd, 3rd, 4th, etc.)
 */
function getPlacementOrdinal(placement: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const value = placement % 100;

  return placement + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
}

/**
 * Helper: Check if notification should be sent based on user preferences
 */
export function shouldNotify(type: NotificationPayload['type']): boolean {
  const { permission } = notificationService.getPermissionStatus();

  if (permission !== 'granted') {
    return false;
  }

  // Check if in DND or quiet hours
  if (notificationService.isDNDActive()) {
    // Only allow urgent notifications during DND
    return type === 'urgent_announcement';
  }

  return true;
}

/**
 * Helper: Format time for notifications
 */
export function formatNotificationTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  // Less than 1 minute ago
  if (diff < 60000) {
    return 'just now';
  }

  // Less than 1 hour ago
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  // Today
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  // This week
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  // Older
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
