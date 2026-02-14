/**
 * Presence Service Utilities
 * Phase 6.2: Live Competition Features
 *
 * Pure/stateless helper functions for the presence service, including
 * device detection, role badge colors, activity intensity, and analytics initialization.
 */

import type { UserPresence, ActivityIndicator, PresenceAnalytics } from './presence-service-types';

/** Role badge color mapping */
const ROLE_COLORS: Record<UserPresence['role'], string> = {
  judge: '#dc2626', // red
  secretary: '#2563eb', // blue
  steward: '#059669', // green
  exhibitor: '#7c3aed', // purple
  admin: '#ea580c', // orange
  observer: '#6b7280', // gray
};

/**
 * Get the badge color for a given user role
 */
export function getRoleBadgeColor(role: UserPresence['role']): string {
  return ROLE_COLORS[role] || ROLE_COLORS.observer;
}

/**
 * Get the activity intensity level for a given activity indicator type
 */
export function getActivityIntensity(type: ActivityIndicator['type']): ActivityIndicator['intensity'] {
  switch (type) {
    case 'typing':
    case 'scoring':
      return 'high';
    case 'reviewing':
    case 'navigating':
      return 'medium';
    default:
      return 'low';
  }
}

/**
 * Detect the device type based on viewport width
 */
export function detectDeviceType(): UserPresence['device']['type'] {
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Detect the operating system from the user agent string
 */
export function detectOS(): string {
  if (typeof navigator === 'undefined') return 'unknown';

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('windows')) return 'Windows';
  if (userAgent.includes('mac')) return 'macOS';
  if (userAgent.includes('linux')) return 'Linux';
  if (userAgent.includes('android')) return 'Android';
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'iOS';
  return 'Unknown';
}

/**
 * Detect the browser from the user agent string
 */
export function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'unknown';

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('chrome')) return 'Chrome';
  if (userAgent.includes('firefox')) return 'Firefox';
  if (userAgent.includes('safari')) return 'Safari';
  if (userAgent.includes('edge')) return 'Edge';
  return 'Unknown';
}

/**
 * Get the current screen size, or undefined if not in a browser environment
 */
export function getScreenSize(): UserPresence['device']['screen'] {
  if (typeof window === 'undefined') return undefined;

  return {
    width: window.screen.width,
    height: window.screen.height,
  };
}

/**
 * Create an initial empty PresenceAnalytics object for a given show
 */
export function initializeAnalytics(showId: string): PresenceAnalytics {
  return {
    showId,
    totalUsers: 0,
    activeUsers: 0,
    usersByRole: {},
    usersByStatus: {},
    usersByDevice: {},
    peakConcurrentUsers: 0,
    averageSessionDuration: 0,
    popularPages: [],
    activityHeatmap: [],
    lastUpdated: new Date(),
  };
}
