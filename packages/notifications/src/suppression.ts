import type { NotificationPreferences, SuppressionContext } from './types';

/**
 * Determines whether notifications should be suppressed.
 * Returns true if the master toggle is off or the exhibitor's dog is currently in the ring.
 */
export function shouldSuppress(
  preferences: NotificationPreferences,
  context: SuppressionContext
): boolean {
  if (!preferences.enabled) return true;
  if (context.isInRing) return true;
  return false;
}
