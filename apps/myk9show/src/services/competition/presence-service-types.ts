/**
 * Presence Service Types
 * Phase 6.2: Live Competition Features
 *
 * Type definitions for user presence tracking in live competitions,
 * including user presence, groups, activity indicators, and analytics.
 */

export interface UserPresence {
  userId: string;
  userName: string;
  displayName: string;
  role: 'judge' | 'secretary' | 'steward' | 'exhibitor' | 'admin' | 'observer';
  status: 'active' | 'idle' | 'away' | 'busy' | 'offline';
  lastSeen: Date;
  joinedAt: Date;
  location: {
    page: string;
    section?: string | undefined;
    classId?: string | undefined;
    entryId?: string | undefined;
    showId: string;
  };
  activity: {
    type: 'viewing' | 'editing' | 'scoring' | 'judging' | 'checking-in' | 'managing' | 'idle';
    description: string;
    startedAt: Date;
    details?: Record<string, unknown> | undefined;
  };
  device: {
    type: 'desktop' | 'tablet' | 'mobile';
    os: string;
    browser: string;
    screen?:
      | {
          width: number;
          height: number;
        }
      | undefined;
  };
  preferences: {
    showPresence: boolean;
    showActivity: boolean;
    notificationLevel: 'all' | 'mentions' | 'none';
  };
  avatar?: string | undefined;
  badgeColor?: string | undefined;
}

export interface PresenceGroup {
  id: string;
  name: string;
  type: 'class' | 'ring' | 'check-in' | 'scoring' | 'general';
  description: string;
  userCount: number;
  users: UserPresence[];
  showId: string;
  classId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ActivityIndicator {
  userId: string;
  type: 'typing' | 'scoring' | 'reviewing' | 'navigating' | 'idle';
  context: string;
  intensity: 'low' | 'medium' | 'high';
  startedAt: Date;
  expiresAt: Date;
  metadata?:
    | {
        targetElement?: string | undefined;
        progress?: number | undefined;
        estimatedCompletion?: Date | undefined;
      }
    | undefined;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface PresenceAnalytics {
  showId: string;
  totalUsers: number;
  activeUsers: number;
  usersByRole: Record<string, number>;
  usersByStatus: Record<string, number>;
  usersByDevice: Record<string, number>;
  peakConcurrentUsers: number;
  averageSessionDuration: number; // minutes
  popularPages: Array<{
    page: string;
    userCount: number;
    averageTimeSpent: number;
  }>;
  activityHeatmap: Array<{
    hour: number;
    userCount: number;
    activityLevel: 'low' | 'medium' | 'high';
  }>;
  lastUpdated: Date;
}

export interface PresenceServiceConfig {
  heartbeatIntervalMs: number;
  idleTimeoutMs: number;
  awayTimeoutMs: number;
  offlineTimeoutMs: number;
  activityIndicatorTimeoutMs: number;
  maxPresenceHistoryHours: number;
  enableActivityTracking: boolean;
  enableAnalytics: boolean;
}
