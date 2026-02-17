/**
 * Presence Service
 * Phase 6.2: Live Competition Features
 *
 * User presence tracking service for live competitions, showing who's online,
 * their activity status, and their current focus/location within the application.
 */

import { subscriptionManager } from '../realtime/subscriptionManager';
import { errorMonitor } from '../../lib/errorMonitoring';
import { logger } from '../../services/LoggingService';
import type { PresenceTrackingData } from '../../types/realtime-types';
import type {
  UserPresence,
  PresenceGroup,
  ActivityIndicator,
  PresenceAnalytics,
  PresenceServiceConfig,
} from './presence-service-types';
import {
  getActivityIntensity,
  initializeAnalytics,
  convertToPresenceTrackingData,
  mapPresenceToUserPresence,
  buildCurrentUser,
  computeUserStatus,
  getGroupUsers,
  computeAnalytics,
} from './presence-service-utils';
import { DEFAULT_PRESENCE_CONFIG } from './presence-service-constants';

// Re-export types for backward compatibility
export type {
  UserPresence,
  PresenceGroup,
  ActivityIndicator,
  PresenceAnalytics,
} from './presence-service-types';

/**
 * Service for tracking and managing user presence in live competitions
 */
export class PresenceService {
  private showId: string;
  private isActive = false;
  private subscriptions = new Map<string, string>();

  // Presence data storage
  private userPresences = new Map<string, UserPresence>();
  private presenceGroups = new Map<string, PresenceGroup>();
  private activityIndicators = new Map<string, ActivityIndicator>();
  private analytics: PresenceAnalytics;

  // Current user data
  private currentUser: UserPresence | null = null;
  private heartbeatTimer?: NodeJS.Timeout;
  private activityTimer?: NodeJS.Timeout;
  private analyticsTimer?: NodeJS.Timeout;

  // Event listeners
  private userJoinedListeners = new Set<(user: UserPresence) => void>();
  private userLeftListeners = new Set<(userId: string) => void>();
  private userUpdatedListeners = new Set<(user: UserPresence) => void>();
  private activityListeners = new Set<(indicator: ActivityIndicator) => void>();
  private groupUpdateListeners = new Set<(group: PresenceGroup) => void>();

  // Configuration
  private config: PresenceServiceConfig;

  constructor(showId: string) {
    this.showId = showId;
    this.config = { ...DEFAULT_PRESENCE_CONFIG };
    this.analytics = initializeAnalytics(showId);
  }

  /**
   * Start presence tracking service
   */
  async start(currentUserData: Partial<UserPresence>): Promise<void> {
    if (this.isActive) {
      logger.warn('Presence service already active', 'presence');
      return;
    }

    try {
      logger.debug('Starting presence service', 'presence', { showId: this.showId });

      this.initializeCurrentUser(currentUserData);

      const presenceSubscriptionId = await subscriptionManager.subscribeToPresence(
        `presence-${this.showId}`,
        this.handlePresenceChange.bind(this)
      );

      this.subscriptions.set('presence', presenceSubscriptionId);

      if (this.currentUser) {
        await subscriptionManager.trackPresence(
          `presence-${this.showId}`,
          convertToPresenceTrackingData(this.currentUser)
        );
      }

      this.startHeartbeat();
      if (this.config.enableActivityTracking) this.startActivityMonitoring();
      if (this.config.enableAnalytics) this.startAnalyticsCollection();
      this.isActive = true;
      logger.info('Presence service started successfully', 'presence', {
        showId: this.showId,
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId, currentUserData },
      });
      throw error;
    }
  }

  /**
   * Stop presence tracking service
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      logger.debug('Stopping presence service', 'presence');

      await subscriptionManager.untrackPresence(`presence-${this.showId}`);

      for (const [, subscriptionId] of this.subscriptions) {
        await subscriptionManager.unsubscribe(subscriptionId);
      }

      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      if (this.activityTimer) clearInterval(this.activityTimer);
      if (this.analyticsTimer) clearInterval(this.analyticsTimer);

      this.userPresences.clear();
      this.presenceGroups.clear();
      this.activityIndicators.clear();
      this.subscriptions.clear();
      this.currentUser = null;

      this.isActive = false;
      logger.info('Presence service stopped', 'presence');
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId },
      });
    }
  }

  /**
   * Handle presence changes from subscription manager
   */
  private handlePresenceChange(presences: PresenceTrackingData[]): void {
    try {
      const now = new Date();
      const activeUserIds = new Set<string>();

      presences.forEach(presence => {
        activeUserIds.add(presence.user_id);

        const existingUser = this.userPresences.get(presence.user_id);
        const isNewUser = !existingUser;

        const userPresence = mapPresenceToUserPresence(presence, existingUser, this.showId, now);

        this.userPresences.set(presence.user_id, userPresence);

        if (isNewUser) {
          this.notifyListeners(this.userJoinedListeners, userPresence, 'user joined');
        } else {
          this.notifyListeners(this.userUpdatedListeners, userPresence, 'user updated');
        }
      });

      // Handle users who left
      const currentUserIds = new Set(this.userPresences.keys());
      for (const userId of currentUserIds) {
        if (!activeUserIds.has(userId)) {
          this.userPresences.delete(userId);
          this.notifyListeners(this.userLeftListeners, userId, 'user left');
        }
      }

      this.updatePresenceGroups();
      this.updateAnalytics();

      logger.debug('Presence updated', 'presence', { usersOnline: presences.length });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { presenceCount: presences.length, showId: this.showId },
      });
    }
  }

  /**
   * Safely notify a set of listeners, catching errors in each.
   */
  private notifyListeners<T>(listeners: Set<(arg: T) => void>, arg: T, context: string): void {
    listeners.forEach(listener => {
      try {
        listener(arg);
      } catch (error) {
        logger.error(`Error in ${context} listener`, 'presence', {}, error as Error);
      }
    });
  }

  /** Update current user's location */
  async updateUserLocation(location: UserPresence['location']): Promise<void> {
    if (!this.currentUser) return;
    this.currentUser.location = { ...this.currentUser.location, ...location };
    await this.syncCurrentUser({ location, showId: this.showId });
    logger.debug('Location updated', 'presence', { page: location.page });
  }

  /** Update current user's activity */
  async updateUserActivity(activity: UserPresence['activity']): Promise<void> {
    if (!this.currentUser) return;
    this.currentUser.activity = activity;
    await this.syncCurrentUser({ activity, showId: this.showId });
    logger.debug('Activity updated', 'presence', { type: activity.type });
  }

  /** Update current user's status */
  async updateUserStatus(status: UserPresence['status']): Promise<void> {
    if (!this.currentUser) return;
    this.currentUser.status = status;
    await this.syncCurrentUser({ status, showId: this.showId });
    logger.debug('Status updated', 'presence', { status });
  }

  /** Sync current user's state to the presence channel */
  private async syncCurrentUser(errorContext: Record<string, unknown>): Promise<void> {
    if (!this.currentUser) return;
    try {
      this.currentUser.lastSeen = new Date();
      await subscriptionManager.trackPresence(
        `presence-${this.showId}`,
        convertToPresenceTrackingData(this.currentUser)
      );
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: errorContext,
      });
    }
  }

  /**
   * Create or update an activity indicator
   */
  async createActivityIndicator(
    type: ActivityIndicator['type'],
    context: string,
    metadata?: ActivityIndicator['metadata']
  ): Promise<void> {
    if (!this.currentUser) return;

    try {
      const indicator: ActivityIndicator = {
        userId: this.currentUser.userId,
        type,
        context,
        intensity: getActivityIntensity(type),
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.activityIndicatorTimeoutMs),
        metadata,
      };

      this.activityIndicators.set(this.currentUser.userId, indicator);

      await subscriptionManager.broadcast(`presence-${this.showId}`, {
        type: 'activity-indicator',
        payload: indicator,
        metadata: { priority: 'low', timestamp: Date.now() },
      });

      this.notifyListeners(this.activityListeners, indicator, 'activity');

      logger.debug('Activity indicator', 'presence', { type, context });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { type, context, metadata, showId: this.showId },
      });
    }
  }

  /**
   * Remove activity indicator
   */
  async removeActivityIndicator(): Promise<void> {
    if (!this.currentUser) return;

    try {
      this.activityIndicators.delete(this.currentUser.userId);

      await subscriptionManager.broadcast(`presence-${this.showId}`, {
        type: 'activity-indicator-removed',
        payload: { userId: this.currentUser.userId },
        metadata: { priority: 'low', timestamp: Date.now() },
      });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId },
      });
    }
  }

  /**
   * Create a presence group
   */
  createPresenceGroup(
    id: string,
    name: string,
    type: PresenceGroup['type'],
    description: string,
    metadata?: Record<string, unknown>
  ): void {
    try {
      const group: PresenceGroup = {
        id,
        name,
        type,
        description,
        userCount: 0,
        users: [],
        showId: this.showId,
        metadata,
      };

      this.presenceGroups.set(id, group);
      this.updatePresenceGroups();

      logger.debug('Presence group created', 'presence', { id, name, type });
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { id, name, type, description, showId: this.showId },
      });
    }
  }

  getUsersByRole(role: UserPresence['role']): UserPresence[] {
    return Array.from(this.userPresences.values()).filter(user => user.role === role);
  }

  getUsersByStatus(status: UserPresence['status']): UserPresence[] {
    return Array.from(this.userPresences.values()).filter(user => user.status === status);
  }

  getUsersByLocation(page: string, section?: string): UserPresence[] {
    return Array.from(this.userPresences.values()).filter(
      user => user.location.page === page && (!section || user.location.section === section)
    );
  }

  getActiveJudges(): UserPresence[] {
    return this.getUsersByRole('judge').filter(
      user => user.status === 'active' || user.status === 'busy'
    );
  }

  getOnlineStewards(): UserPresence[] {
    return this.getUsersByRole('steward').filter(user => user.status !== 'offline');
  }

  onUserJoined(listener: (user: UserPresence) => void): () => void {
    this.userJoinedListeners.add(listener);
    return () => this.userJoinedListeners.delete(listener);
  }

  onUserLeft(listener: (userId: string) => void): () => void {
    this.userLeftListeners.add(listener);
    return () => this.userLeftListeners.delete(listener);
  }

  onUserUpdated(listener: (user: UserPresence) => void): () => void {
    this.userUpdatedListeners.add(listener);
    return () => this.userUpdatedListeners.delete(listener);
  }

  onActivityIndicator(listener: (indicator: ActivityIndicator) => void): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  onGroupUpdate(listener: (group: PresenceGroup) => void): () => void {
    this.groupUpdateListeners.add(listener);
    return () => this.groupUpdateListeners.delete(listener);
  }

  getAllUsers(): UserPresence[] {
    return Array.from(this.userPresences.values());
  }

  getUser(userId: string): UserPresence | undefined {
    return this.userPresences.get(userId);
  }

  getCurrentUser(): UserPresence | null {
    return this.currentUser;
  }

  getPresenceGroups(): PresenceGroup[] {
    return Array.from(this.presenceGroups.values());
  }

  getPresenceGroup(groupId: string): PresenceGroup | undefined {
    return this.presenceGroups.get(groupId);
  }

  getActivityIndicators(): ActivityIndicator[] {
    return Array.from(this.activityIndicators.values()).filter(
      indicator => indicator.expiresAt > new Date()
    );
  }

  getAnalytics(): PresenceAnalytics {
    return { ...this.analytics };
  }

  isServiceActive(): boolean {
    return this.isActive;
  }

  updateConfig(updates: Partial<PresenceServiceConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  private initializeCurrentUser(userData: Partial<UserPresence>): void {
    this.currentUser = buildCurrentUser(userData, this.showId, new Date());
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.currentUser) {
        this.currentUser.lastSeen = new Date();

        subscriptionManager
          .trackPresence(`presence-${this.showId}`, convertToPresenceTrackingData(this.currentUser))
          .catch(error => {
            logger.error('Heartbeat failed', 'presence', {}, error as Error);
          });
      }
    }, this.config.heartbeatIntervalMs);
  }

  private startActivityMonitoring(): void {
    this.activityTimer = setInterval(() => {
      this.updateUserStatuses();
      this.cleanupExpiredIndicators();
    }, 30000);
  }

  private startAnalyticsCollection(): void {
    this.analyticsTimer = setInterval(() => {
      this.updateAnalytics();
    }, 60000);
  }

  private updateUserStatuses(): void {
    const now = new Date();
    this.userPresences.forEach(user => {
      user.status = computeUserStatus(user.lastSeen, now, this.config);
    });
  }

  private cleanupExpiredIndicators(): void {
    const now = new Date();
    for (const [userId, indicator] of this.activityIndicators) {
      if (indicator.expiresAt < now) {
        this.activityIndicators.delete(userId);
      }
    }
  }

  private updatePresenceGroups(): void {
    const allUsers = Array.from(this.userPresences.values());

    this.presenceGroups.forEach(group => {
      const groupUsers = getGroupUsers(group, allUsers);
      group.users = groupUsers;
      group.userCount = groupUsers.length;

      this.notifyListeners(this.groupUpdateListeners, group, 'group update');
    });
  }

  private updateAnalytics(): void {
    const users = Array.from(this.userPresences.values());
    computeAnalytics(this.analytics, users);
  }
}

export default PresenceService;
