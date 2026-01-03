/**
 * Notification Delivery Utilities
 *
 * Extracted from notificationService.ts
 * Pure utility functions for notification sound, vibration, and badge management.
 *
 * Features:
 * - Sound playback with priority-based file selection
 * - Vibration patterns for different priorities
 * - PWA badge count management
 * - Browser API compatibility checks
 */

import { logger } from '@/utils/logger';

/** Navigator with Badging API (experimental, Chrome 81+) */
interface NavigatorWithBadge extends Navigator {
  setAppBadge(contents?: number): Promise<void>;
  clearAppBadge(): Promise<void>;
}

/**
 * Sound configuration for notifications
 */
export interface NotificationSounds {
  default: string;
  urgent: string;
}

/**
 * Default notification sounds
 */
export const DEFAULT_NOTIFICATION_SOUNDS: NotificationSounds = {
  default: '/sounds/notification-default.mp3',
  urgent: '/sounds/notification-urgent.mp3'
};

/**
 * Play notification sound based on priority
 *
 * @param priority - Notification priority ('urgent', 'high', 'normal', 'low')
 * @param sounds - Optional custom sound configuration
 * @param volume - Optional volume level (0-1), defaults to 0.5
 *
 * @example
 * ```ts
 * playNotificationSound('urgent');
 * playNotificationSound('normal', customSounds, 0.7);
 * ```
 */
export function playNotificationSound(
  priority: string = 'normal',
  sounds: NotificationSounds = DEFAULT_NOTIFICATION_SOUNDS,
  volume: number = 0.5
): void {
  try {
    const soundFile = priority === 'urgent' ? sounds.urgent : sounds.default;
    const audio = new Audio(soundFile);
    audio.volume = Math.max(0, Math.min(1, volume)); // Clamp 0-1
    audio.play().catch(err => {
      logger.warn('Could not play notification sound:', err);
    });
  } catch (error) {
    logger.warn('Error playing notification sound:', error);
  }
}

/**
 * Get vibration pattern for notification priority
 *
 * Vibration patterns are arrays of millisecond durations:
 * [vibrate, pause, vibrate, pause, ...]
 *
 * @param priority - Notification priority
 * @returns Array of vibration pattern durations in milliseconds
 *
 * @example
 * ```ts
 * const pattern = getVibrationPattern('urgent');
 * // Returns: [200, 100, 200, 100, 200] - Triple pulse
 *
 * if ('vibrate' in navigator) {
 *   navigator.vibrate(pattern);
 * }
 * ```
 */
export function getVibrationPattern(priority: string = 'normal'): number[] {
  switch (priority) {
    case 'urgent':
      return [200, 100, 200, 100, 200]; // Triple pulse
    case 'high':
      return [200, 100, 200]; // Double pulse
    case 'low':
      return [100]; // Single short pulse
    default:
      return [150]; // Single medium pulse (normal)
  }
}

/**
 * Update PWA badge count (increment or decrement)
 *
 * @param increment - Number to add to current badge (can be negative)
 * @returns Promise that resolves when badge is updated
 *
 * @example
 * ```ts
 * // Increment badge by 1
 * await updateBadgeCount(1);
 *
 * // Decrement badge by 1
 * await updateBadgeCount(-1);
 *
 * // Add multiple
 * await updateBadgeCount(5);
 * ```
 */
export async function updateBadgeCount(increment: number): Promise<void> {
  if (!('setAppBadge' in navigator)) {
    logger.warn('Badge API not supported');
    return;
  }

  try {
    const currentBadge = await getBadgeCount();
    const newBadge = Math.max(0, currentBadge + increment);

    if (newBadge > 0) {
      await (navigator as NavigatorWithBadge).setAppBadge(newBadge);
      // Store for retrieval since Badge API doesn't provide getter
      localStorage.setItem('notification_badge_count', String(newBadge));
    } else {
      await (navigator as NavigatorWithBadge).clearAppBadge();
      localStorage.setItem('notification_badge_count', '0');
    }
  } catch (error) {
    logger.warn('Could not update badge count:', error);
  }
}

/**
 * Get current badge count from local storage
 *
 * Note: Badge API doesn't provide a getter, so we store the count locally
 *
 * @returns Current badge count
 *
 * @example
 * ```ts
 * const count = await getBadgeCount();
 * logger.log(`Current badge: ${count}`);
 * ```
 */
export async function getBadgeCount(): Promise<number> {
  const stored = localStorage.getItem('notification_badge_count');
  return stored ? parseInt(stored, 10) : 0;
}

/**
 * Clear PWA badge count
 *
 * @returns Promise that resolves when badge is cleared
 *
 * @example
 * ```ts
 * // Clear badge when user opens app
 * await clearBadge();
 * ```
 */
export async function clearBadge(): Promise<void> {
  if (!('clearAppBadge' in navigator)) {
    logger.warn('Badge API not supported');
    return;
  }

  try {
    await (navigator as NavigatorWithBadge).clearAppBadge();
    localStorage.setItem('notification_badge_count', '0');
  } catch (error) {
    logger.warn('Could not clear badge:', error);
  }
}

/**
 * Check if Badge API is supported
 *
 * @returns True if Badge API is available
 *
 * @example
 * ```ts
 * if (isBadgeSupported()) {
 *   await updateBadgeCount(1);
 * }
 * ```
 */
export function isBadgeSupported(): boolean {
  return 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
}

/**
 * Check if Vibration API is supported
 *
 * @returns True if Vibration API is available
 *
 * @example
 * ```ts
 * if (isVibrationSupported()) {
 *   const pattern = getVibrationPattern('urgent');
 *   navigator.vibrate(pattern);
 * }
 * ```
 */
export function isVibrationSupported(): boolean {
  return 'vibrate' in navigator;
}

/**
 * Check if Audio playback is supported
 *
 * @returns True if Audio API is available
 */
export function isAudioSupported(): boolean {
  return typeof Audio !== 'undefined';
}
