/**
 * Presence Service Utilities
 * Phase 6.2: Live Competition Features
 *
 * Pure/stateless helper functions for the presence service, including
 * device detection, role badge colors, activity intensity, and analytics initialization.
 */

import type {
  UserPresence,
  ActivityIndicator,
  PresenceAnalytics,
  PresenceGroup,
  PresenceServiceConfig,
} from './presence-service-types';
import type { PresenceTrackingData } from '../../types/realtime-types';

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
export function getActivityIntensity(
  type: ActivityIndicator['type']
): ActivityIndicator['intensity'] {
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

/**
 * Map a PresenceTrackingData payload to a UserPresence object.
 * Merges with an existing user if present to preserve local state.
 */
export function mapPresenceToUserPresence(
  presence: PresenceTrackingData,
  existingUser: UserPresence | undefined,
  showId: string,
  now: Date
): UserPresence {
  return {
    userId: presence.user_id,
    userName: presence.user_name,
    displayName: presence.user_name,
    role: presence.role,
    status: presence.status,
    lastSeen: new Date(presence.last_seen),
    joinedAt: existingUser?.joinedAt || now,
    location: {
      page: 'unknown',
      showId: presence.show_id || showId,
      classId: presence.class_id,
    },
    activity: existingUser?.activity || {
      type: 'viewing',
      description: 'Viewing competition',
      startedAt: now,
    },
    device: presence.device_info || {
      type: 'desktop',
      os: 'unknown',
      browser: 'unknown',
    },
    preferences: existingUser?.preferences || {
      showPresence: true,
      showActivity: true,
      notificationLevel: 'all',
    },
    badgeColor: getRoleBadgeColor(presence.role),
  };
}

/**
 * Build a fully-populated UserPresence for the current user from partial data.
 */
export function buildCurrentUser(
  userData: Partial<UserPresence>,
  showId: string,
  now: Date
): UserPresence {
  return {
    userId: userData.userId || 'unknown',
    userName: userData.userName || 'Unknown User',
    displayName: userData.displayName || userData.userName || 'Unknown User',
    role: userData.role || 'observer',
    status: 'active',
    lastSeen: now,
    joinedAt: now,
    location: { page: 'dashboard', showId, ...userData.location },
    activity: {
      type: 'viewing',
      description: 'Viewing competition',
      startedAt: now,
      ...userData.activity,
    },
    device: {
      type: detectDeviceType(),
      os: detectOS(),
      browser: detectBrowser(),
      screen: getScreenSize(),
      ...userData.device,
    },
    preferences: {
      showPresence: true,
      showActivity: true,
      notificationLevel: 'all',
      ...userData.preferences,
    },
    avatar: userData.avatar,
    badgeColor: getRoleBadgeColor(userData.role || 'observer'),
  };
}

/**
 * Convert a UserPresence object to PresenceTrackingData for the subscription manager.
 */
export function convertToPresenceTrackingData(user: UserPresence): PresenceTrackingData {
  return {
    user_id: user.userId,
    user_name: user.userName,
    role: (['judge', 'secretary', 'steward'].includes(user.role) ? user.role : 'judge') as
      | 'judge'
      | 'secretary'
      | 'steward',
    class_id: user.location.classId,
    show_id: user.location.showId,
    status: (['active', 'idle', 'away'].includes(user.status) ? user.status : 'active') as
      | 'active'
      | 'idle'
      | 'away',
    last_seen: user.lastSeen.toISOString(),
    device_info: user.device,
  };
}

/**
 * Compute the appropriate status for a user based on their last seen time.
 */
export function computeUserStatus(
  lastSeen: Date,
  now: Date,
  config: PresenceServiceConfig
): UserPresence['status'] {
  const timeSinceLastSeen = now.getTime() - lastSeen.getTime();

  if (timeSinceLastSeen > config.offlineTimeoutMs) {
    return 'offline';
  } else if (timeSinceLastSeen > config.awayTimeoutMs) {
    return 'away';
  } else if (timeSinceLastSeen > config.idleTimeoutMs) {
    return 'idle';
  }
  return 'active';
}

/**
 * Get users belonging to a presence group based on the group type.
 */
export function getGroupUsers(group: PresenceGroup, allUsers: UserPresence[]): UserPresence[] {
  switch (group.type) {
    case 'class':
      return allUsers.filter(user => user.location.classId === group.classId);
    case 'ring':
      return allUsers.filter(
        user => user.location.page === 'ring' || user.activity.type === 'scoring'
      );
    case 'check-in':
      return allUsers.filter(
        user => user.location.page === 'check-in' || user.activity.type === 'checking-in'
      );
    case 'scoring':
      return allUsers.filter(
        user => user.activity.type === 'scoring' || user.activity.type === 'judging'
      );
    default:
      return allUsers;
  }
}

/**
 * Compute updated analytics from a list of user presences.
 * Mutates the provided analytics object in place for performance.
 */
export function computeAnalytics(analytics: PresenceAnalytics, users: UserPresence[]): void {
  analytics.totalUsers = users.length;
  analytics.activeUsers = users.filter(u => u.status === 'active').length;

  if (analytics.activeUsers > analytics.peakConcurrentUsers) {
    analytics.peakConcurrentUsers = analytics.activeUsers;
  }

  analytics.usersByRole = {};
  users.forEach(user => {
    analytics.usersByRole[user.role] = (analytics.usersByRole[user.role] || 0) + 1;
  });

  analytics.usersByStatus = {};
  users.forEach(user => {
    analytics.usersByStatus[user.status] = (analytics.usersByStatus[user.status] || 0) + 1;
  });

  analytics.usersByDevice = {};
  users.forEach(user => {
    analytics.usersByDevice[user.device.type] =
      (analytics.usersByDevice[user.device.type] || 0) + 1;
  });

  analytics.lastUpdated = new Date();
}
