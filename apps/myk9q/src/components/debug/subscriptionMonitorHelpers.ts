/**
 * SubscriptionMonitor Helper Functions
 *
 * Extracted from SubscriptionMonitor.tsx to reduce complexity.
 * Contains cleanup handlers and statistics helpers.
 */

import { subscriptionCleanup, SubscriptionInfo } from '../../services/subscriptionCleanup';

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Clean up all subscriptions and return count
 */
export function cleanupAllSubscriptions(): number {
  return subscriptionCleanup.cleanupAll();
}

/**
 * Clean up stale subscriptions (older than specified minutes)
 * Returns the count of cleaned up subscriptions
 */
export function cleanupStaleSubscriptions(
  subscriptions: SubscriptionInfo[],
  maxAgeMinutes: number = 5
): number {
  const currentTime = Date.now();
  let count = 0;

  subscriptions.forEach(s => {
    const ageMinutes = (currentTime - s.createdAt.getTime()) / 60000;
    if (ageMinutes > maxAgeMinutes) {
      subscriptionCleanup.unregister(s.key);
      count++;
    }
  });

  return count;
}

/**
 * Calculate age in minutes from a timestamp
 */
export function calculateAgeMinutes(createdAt: Date, now: number): number {
  return Math.round((now - createdAt.getTime()) / 60000);
}

/**
 * Check if subscription is considered old
 */
export function isSubscriptionOld(ageMinutes: number, threshold: number = 30): boolean {
  return ageMinutes > threshold;
}

// ============================================================================
// Statistics Helpers
// ============================================================================

/**
 * Check if active count is in warning state
 */
export function isActiveCountWarning(count: number, threshold: number = 10): boolean {
  return count > threshold;
}

/**
 * Check if oldest subscription age is in warning state
 */
export function isOldestAgeWarning(ageMinutes: number, threshold: number = 60): boolean {
  return ageMinutes > threshold;
}

/**
 * Check if heap usage is in warning state
 */
export function isHeapWarning(heapUsedMB: number, threshold: number = 100): boolean {
  return heapUsedMB > threshold;
}

/**
 * Format subscription license key for display (truncated)
 */
export function formatLicenseKey(licenseKey: string | undefined): string | null {
  if (!licenseKey) return null;
  return `${licenseKey.slice(0, 8)}...`;
}
