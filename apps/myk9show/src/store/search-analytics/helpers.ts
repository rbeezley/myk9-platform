/**
 * Pure helper functions for the search analytics store.
 *
 * Contains device detection and ID generation utilities
 * used by the main store implementation.
 */

/** Detect the user's device type from the navigator user agent string. */
export function detectDeviceType(): 'desktop' | 'tablet' | 'mobile' {
  if (typeof window === 'undefined') return 'desktop';

  const userAgent = navigator.userAgent;

  if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
    return 'tablet';
  }

  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
    return 'mobile';
  }

  return 'desktop';
}

/** Generate a unique ID with the given prefix, a timestamp, and a random suffix. */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
