/**
 * Notification Service Helper Functions
 *
 * Extracted from notificationService.ts to reduce complexity.
 * Contains announcement text generation and vibration patterns.
 */

import type { NotificationPayload } from './notificationService';

// ============================================================================
// Vibration Patterns
// ============================================================================

/**
 * Get vibration pattern based on notification priority
 */
export function getVibrationPattern(priority: string): number[] {
  switch (priority) {
    case 'urgent':
      return [200, 100, 200, 100, 200]; // Triple pulse
    case 'high':
      return [200, 100, 200]; // Double pulse
    case 'low':
      return [100]; // Single short pulse
    default:
      return [150]; // Single medium pulse
  }
}

// ============================================================================
// Announcement Text Generation
// ============================================================================

/**
 * Generate announcement text for "your turn" notifications
 */
function getYourTurnText(payload: NotificationPayload): string {
  const dogName = payload.data?.callName || '';
  const armband = payload.data?.armbandNumber || '';
  const dogsAhead = payload.data?.dogsAhead || 1;

  if (dogsAhead === 1) {
    return dogName ? `${dogName}, number ${armband}, you're up next` : 'You\'re up next';
  }
  return dogName ? `${dogName}, number ${armband}, you're ${dogsAhead} dogs away` : `You're ${dogsAhead} dogs away`;
}

/**
 * Generate announcement text for "results posted" notifications
 */
function getResultsPostedText(payload: NotificationPayload): string {
  const dogName = payload.data?.callName as string || '';
  const placement = payload.data?.placement as number | undefined;
  const qualified = payload.data?.qualified as boolean | undefined;

  if (placement && typeof placement === 'number' && placement <= 4) {
    const ordinals = ['', 'first', 'second', 'third', 'fourth'];
    let text = `${dogName}, ${ordinals[placement]} place`;
    if (qualified) {
      text += ', qualified';
    }
    return text;
  }
  return dogName ? `Results posted for ${dogName}` : 'Results posted';
}

/**
 * Generate announcement text for "class starting" notifications
 */
function getClassStartingText(payload: NotificationPayload): string {
  const className = payload.data?.className || '';
  return className ? `${className} starting soon` : 'Class starting soon';
}

/**
 * Generate announcement text for announcement notifications
 */
function getAnnouncementText(payload: NotificationPayload): string {
  // For announcements, just announce the title (body might be too long)
  return payload.title.replace(/\uD83D\uDEA8/g, '').replace(/URGENT:/g, 'Urgent announcement,');
}

/**
 * Generate voice announcement text based on notification type
 * Returns empty string if no announcement should be made
 */
export function generateAnnouncementText(payload: NotificationPayload): string {
  switch (payload.type) {
    case 'your_turn':
      return getYourTurnText(payload);

    case 'results_posted':
      return getResultsPostedText(payload);

    case 'class_starting':
      return getClassStartingText(payload);

    case 'announcement':
    case 'urgent_announcement':
      return getAnnouncementText(payload);

    case 'system_update':
      return 'App update available';

    case 'sync_error':
      return 'Sync error occurred';

    default:
      // For unknown types, use title
      return payload.title;
  }
}

// ============================================================================
// Notification Options Builder
// ============================================================================

/**
 * Build notification options from payload
 */
export function buildNotificationOptions(
  payload: NotificationPayload,
  notificationId: string
): NotificationOptions {
  return {
    body: payload.body,
    icon: payload.icon || '/myK9Q-teal-192.png',
    badge: payload.badge || '/myK9Q-teal-192.png',
    tag: payload.tag || `notification-${notificationId}`,
    data: {
      ...payload.data,
      id: notificationId,
      type: payload.type,
      timestamp: payload.timestamp || Date.now(),
    },
    requireInteraction: payload.requireInteraction || payload.priority === 'urgent',
    silent: payload.silent || false,
    ...(payload.vibrate ? { vibrate: payload.vibrate } : {}),
    ...(payload.image ? { image: payload.image } : {}),
    ...(payload.actions ? { actions: payload.actions } : {}),
  };
}
