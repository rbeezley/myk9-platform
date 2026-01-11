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
    section?: string;
    classId?: string;
    entryId?: string;
    showId: string;
  };
  activity: {
    type: 'viewing' | 'editing' | 'scoring' | 'judging' | 'checking-in' | 'managing' | 'idle';
    description: string;
    startedAt: Date;
    details?: Record<string, unknown>;
  };
  device: {
    type: 'desktop' | 'tablet' | 'mobile';
    os: string;
    browser: string;
    screen?: {
      width: number;
      height: number;
    };
  };
  preferences: {
    showPresence: boolean;
    showActivity: boolean;
    notificationLevel: 'all' | 'mentions' | 'none';
  };
  avatar?: string;
  badgeColor?: string;
}

export interface PresenceGroup {
  id: string;
  name: string;
  type: 'class' | 'ring' | 'check-in' | 'scoring' | 'general';
  description: string;
  userCount: number;
  users: UserPresence[];
  showId: string;
  classId?: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityIndicator {
  userId: string;
  type: 'typing' | 'scoring' | 'reviewing' | 'navigating' | 'idle';
  context: string;
  intensity: 'low' | 'medium' | 'high';
  startedAt: Date;
  expiresAt: Date;
  metadata?: {
    targetElement?: string;
    progress?: number;
    estimatedCompletion?: Date;
  };
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
  private config = {
    heartbeatIntervalMs: 15000, // 15 seconds
    idleTimeoutMs: 2 * 60 * 1000, // 2 minutes
    awayTimeoutMs: 5 * 60 * 1000, // 5 minutes
    offlineTimeoutMs: 10 * 60 * 1000, // 10 minutes
    activityIndicatorTimeoutMs: 30000, // 30 seconds
    maxPresenceHistoryHours: 24,
    enableActivityTracking: true,
    enableAnalytics: true,
  };

  constructor(showId: string) {
    this.showId = showId;
    this.analytics = this.initializeAnalytics();
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

      // Initialize current user
      await this.initializeCurrentUser(currentUserData);

      // Subscribe to presence channel
      const presenceSubscriptionId = await subscriptionManager.subscribeToPresence(
        `presence-${this.showId}`,
        this.handlePresenceChange.bind(this)
      );

      this.subscriptions.set('presence', presenceSubscriptionId);

      // Track current user presence
      if (this.currentUser) {
        await subscriptionManager.trackPresence(
          `presence-${this.showId}`,
          this.convertToPresenceTrackingData(this.currentUser)
        );
      }

      // Start heartbeat
      this.startHeartbeat();

      // Start activity monitoring
      if (this.config.enableActivityTracking) {
        this.startActivityMonitoring();
      }

      // Start analytics collection
      if (this.config.enableAnalytics) {
        this.startAnalyticsCollection();
      }

      this.isActive = true;
      logger.info('Presence service started successfully', 'presence', { showId: this.showId });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId, currentUserData }
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

      // Stop tracking current user presence
      await subscriptionManager.untrackPresence(`presence-${this.showId}`);

      // Unsubscribe from presence updates
      for (const [, subscriptionId] of this.subscriptions) {
        await subscriptionManager.unsubscribe(subscriptionId);
      }

      // Clear timers
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
      }
      if (this.activityTimer) {
        clearInterval(this.activityTimer);
      }
      if (this.analyticsTimer) {
        clearInterval(this.analyticsTimer);
      }

      // Clear data
      this.userPresences.clear();
      this.presenceGroups.clear();
      this.activityIndicators.clear();
      this.subscriptions.clear();
      this.currentUser = null;

      this.isActive = false;
      logger.info('Presence service stopped', 'presence');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId }
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

      // Process each presence
      presences.forEach(presence => {
        activeUserIds.add(presence.user_id);
        
        const existingUser = this.userPresences.get(presence.user_id);
        const isNewUser = !existingUser;

        const userPresence: UserPresence = {
          userId: presence.user_id,
          userName: presence.user_name,
          displayName: presence.user_name,
          role: presence.role,
          status: presence.status,
          lastSeen: new Date(presence.last_seen),
          joinedAt: existingUser?.joinedAt || now,
          location: {
            page: 'unknown',
            showId: presence.show_id || this.showId,
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
          badgeColor: this.getRoleBadgeColor(presence.role),
        };

        this.userPresences.set(presence.user_id, userPresence);

        // Trigger appropriate listeners
        if (isNewUser) {
          this.userJoinedListeners.forEach(listener => {
            try {
              listener(userPresence);
            } catch (error) {
              logger.error('Error in user joined listener', 'presence', {}, error as Error);
            }
          });
        } else {
          this.userUpdatedListeners.forEach(listener => {
            try {
              listener(userPresence);
            } catch (error) {
              logger.error('Error in user updated listener', 'presence', {}, error as Error);
            }
          });
        }
      });

      // Handle users who left
      const currentUserIds = new Set(this.userPresences.keys());
      for (const userId of currentUserIds) {
        if (!activeUserIds.has(userId)) {
          this.userPresences.delete(userId);
          
          this.userLeftListeners.forEach(listener => {
            try {
              listener(userId);
            } catch (error) {
              logger.error('Error in user left listener', 'presence', {}, error as Error);
            }
          });
        }
      }

      // Update groups
      this.updatePresenceGroups();

      // Update analytics
      this.updateAnalytics();

      logger.debug('Presence updated', 'presence', { usersOnline: presences.length });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { presenceCount: presences.length, showId: this.showId }
      });
    }
  }

  /**
   * Update current user's location
   */
  async updateUserLocation(location: UserPresence['location']): Promise<void> {
    if (!this.currentUser) return;

    try {
      this.currentUser.location = { ...this.currentUser.location, ...location };
      this.currentUser.lastSeen = new Date();

      // Update in presence tracking
      await subscriptionManager.trackPresence(
        `presence-${this.showId}`,
        this.convertToPresenceTrackingData(this.currentUser)
      );

      logger.debug('Location updated', 'presence', { page: location.page, section: location.section });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { location, showId: this.showId }
      });
    }
  }

  /**
   * Update current user's activity
   */
  async updateUserActivity(activity: UserPresence['activity']): Promise<void> {
    if (!this.currentUser) return;

    try {
      this.currentUser.activity = activity;
      this.currentUser.lastSeen = new Date();

      // Update in presence tracking
      await subscriptionManager.trackPresence(
        `presence-${this.showId}`,
        this.convertToPresenceTrackingData(this.currentUser)
      );

      logger.debug('Activity updated', 'presence', { type: activity.type, description: activity.description });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { activity, showId: this.showId }
      });
    }
  }

  /**
   * Update current user's status
   */
  async updateUserStatus(status: UserPresence['status']): Promise<void> {
    if (!this.currentUser) return;

    try {
      this.currentUser.status = status;
      this.currentUser.lastSeen = new Date();

      // Update in presence tracking
      await subscriptionManager.trackPresence(
        `presence-${this.showId}`,
        this.convertToPresenceTrackingData(this.currentUser)
      );

      logger.debug('Status updated', 'presence', { status });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { status, showId: this.showId }
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
        intensity: this.getActivityIntensity(type),
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.activityIndicatorTimeoutMs),
        metadata,
      };

      this.activityIndicators.set(this.currentUser.userId, indicator);

      // Broadcast activity indicator
      await subscriptionManager.broadcast(`presence-${this.showId}`, {
        type: 'activity-indicator',
        payload: indicator,
        metadata: {
          priority: 'low',
          timestamp: Date.now(),
        },
      });

      // Trigger listeners
      this.activityListeners.forEach(listener => {
        try {
          listener(indicator);
        } catch (error) {
          logger.error('Error in activity listener', 'presence', {}, error as Error);
        }
      });

      logger.debug('Activity indicator', 'presence', { type, context });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { type, context, metadata, showId: this.showId }
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

      // Broadcast removal
      await subscriptionManager.broadcast(`presence-${this.showId}`, {
        type: 'activity-indicator-removed',
        payload: { userId: this.currentUser.userId },
        metadata: {
          priority: 'low',
          timestamp: Date.now(),
        },
      });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId }
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
        additionalData: { id, name, type, description, showId: this.showId }
      });
    }
  }

  /**
   * Get users by role
   */
  getUsersByRole(role: UserPresence['role']): UserPresence[] {
    return Array.from(this.userPresences.values())
      .filter(user => user.role === role);
  }

  /**
   * Get users by status
   */
  getUsersByStatus(status: UserPresence['status']): UserPresence[] {
    return Array.from(this.userPresences.values())
      .filter(user => user.status === status);
  }

  /**
   * Get users by location
   */
  getUsersByLocation(page: string, section?: string): UserPresence[] {
    return Array.from(this.userPresences.values())
      .filter(user => 
        user.location.page === page && 
        (!section || user.location.section === section)
      );
  }

  /**
   * Get active judges
   */
  getActiveJudges(): UserPresence[] {
    return this.getUsersByRole('judge')
      .filter(user => user.status === 'active' || user.status === 'busy');
  }

  /**
   * Get online stewards
   */
  getOnlineStewards(): UserPresence[] {
    return this.getUsersByRole('steward')
      .filter(user => user.status !== 'offline');
  }

  /**
   * Event listener management
   */
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

  /**
   * Data access methods
   */
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
    return Array.from(this.activityIndicators.values())
      .filter(indicator => indicator.expiresAt > new Date());
  }

  getAnalytics(): PresenceAnalytics {
    return { ...this.analytics };
  }

  /**
   * Private helper methods
   */
  private async initializeCurrentUser(userData: Partial<UserPresence>): Promise<void> {
    const now = new Date();
    
    this.currentUser = {
      userId: userData.userId || 'unknown',
      userName: userData.userName || 'Unknown User',
      displayName: userData.displayName || userData.userName || 'Unknown User',
      role: userData.role || 'observer',
      status: 'active',
      lastSeen: now,
      joinedAt: now,
      location: {
        page: 'dashboard',
        showId: this.showId,
        ...userData.location,
      },
      activity: {
        type: 'viewing',
        description: 'Viewing competition',
        startedAt: now,
        ...userData.activity,
      },
      device: {
        type: this.detectDeviceType(),
        os: this.detectOS(),
        browser: this.detectBrowser(),
        screen: this.getScreenSize(),
        ...userData.device,
      },
      preferences: {
        showPresence: true,
        showActivity: true,
        notificationLevel: 'all',
        ...userData.preferences,
      },
      avatar: userData.avatar,
      badgeColor: this.getRoleBadgeColor(userData.role || 'observer'),
    };
  }

  private convertToPresenceTrackingData(user: UserPresence): PresenceTrackingData {
    return {
      user_id: user.userId,
      user_name: user.userName,
      role: (['judge', 'secretary', 'steward'].includes(user.role) ? user.role : 'judge') as 'judge' | 'secretary' | 'steward',
      class_id: user.location.classId,
      show_id: user.location.showId,
      status: (['active', 'idle', 'away'].includes(user.status) ? user.status : 'active') as 'active' | 'idle' | 'away',
      last_seen: user.lastSeen.toISOString(),
      device_info: user.device,
    };
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.currentUser) {
        this.currentUser.lastSeen = new Date();
        
        subscriptionManager.trackPresence(
          `presence-${this.showId}`,
          this.convertToPresenceTrackingData(this.currentUser)
        ).catch(error => {
          logger.error('Heartbeat failed', 'presence', {}, error as Error);
        });
      }
    }, this.config.heartbeatIntervalMs);
  }

  private startActivityMonitoring(): void {
    this.activityTimer = setInterval(() => {
      this.updateUserStatuses();
      this.cleanupExpiredIndicators();
    }, 30000); // Check every 30 seconds
  }

  private startAnalyticsCollection(): void {
    this.analyticsTimer = setInterval(() => {
      this.updateAnalytics();
    }, 60000); // Update analytics every minute
  }

  private updateUserStatuses(): void {
    const now = new Date();
    
    this.userPresences.forEach(user => {
      const timeSinceLastSeen = now.getTime() - user.lastSeen.getTime();
      
      if (timeSinceLastSeen > this.config.offlineTimeoutMs) {
        user.status = 'offline';
      } else if (timeSinceLastSeen > this.config.awayTimeoutMs) {
        user.status = 'away';
      } else if (timeSinceLastSeen > this.config.idleTimeoutMs) {
        user.status = 'idle';
      }
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
    this.presenceGroups.forEach(group => {
      // Update user list based on group criteria
      const groupUsers = this.getGroupUsers(group);
      group.users = groupUsers;
      group.userCount = groupUsers.length;

      // Trigger listeners
      this.groupUpdateListeners.forEach(listener => {
        try {
          listener(group);
        } catch (error) {
          logger.error('Error in group update listener', 'presence', {}, error as Error);
        }
      });
    });
  }

  private getGroupUsers(group: PresenceGroup): UserPresence[] {
    const allUsers = Array.from(this.userPresences.values());
    
    switch (group.type) {
      case 'class':
        return allUsers.filter(user => user.location.classId === group.classId);
      case 'ring':
        return allUsers.filter(user => 
          user.location.page === 'ring' || user.activity.type === 'scoring'
        );
      case 'check-in':
        return allUsers.filter(user => 
          user.location.page === 'check-in' || user.activity.type === 'checking-in'
        );
      case 'scoring':
        return allUsers.filter(user => 
          user.activity.type === 'scoring' || user.activity.type === 'judging'
        );
      default:
        return allUsers;
    }
  }

  private updateAnalytics(): void {
    const users = Array.from(this.userPresences.values());
    
    this.analytics.totalUsers = users.length;
    this.analytics.activeUsers = users.filter(u => u.status === 'active').length;
    
    // Update peak concurrent users
    if (this.analytics.activeUsers > this.analytics.peakConcurrentUsers) {
      this.analytics.peakConcurrentUsers = this.analytics.activeUsers;
    }
    
    // Count by role
    this.analytics.usersByRole = {};
    users.forEach(user => {
      this.analytics.usersByRole[user.role] = (this.analytics.usersByRole[user.role] || 0) + 1;
    });
    
    // Count by status
    this.analytics.usersByStatus = {};
    users.forEach(user => {
      this.analytics.usersByStatus[user.status] = (this.analytics.usersByStatus[user.status] || 0) + 1;
    });
    
    // Count by device
    this.analytics.usersByDevice = {};
    users.forEach(user => {
      this.analytics.usersByDevice[user.device.type] = (this.analytics.usersByDevice[user.device.type] || 0) + 1;
    });
    
    this.analytics.lastUpdated = new Date();
  }

  private getRoleBadgeColor(role: UserPresence['role']): string {
    const roleColors = {
      judge: '#dc2626', // red
      secretary: '#2563eb', // blue
      steward: '#059669', // green
      exhibitor: '#7c3aed', // purple
      admin: '#ea580c', // orange
      observer: '#6b7280', // gray
    };
    
    return roleColors[role] || roleColors.observer;
  }

  private getActivityIntensity(type: ActivityIndicator['type']): ActivityIndicator['intensity'] {
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

  private detectDeviceType(): UserPresence['device']['type'] {
    if (typeof window === 'undefined') return 'desktop';
    
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  private detectOS(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('windows')) return 'Windows';
    if (userAgent.includes('mac')) return 'macOS';
    if (userAgent.includes('linux')) return 'Linux';
    if (userAgent.includes('android')) return 'Android';
    if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'iOS';
    return 'Unknown';
  }

  private detectBrowser(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('chrome')) return 'Chrome';
    if (userAgent.includes('firefox')) return 'Firefox';
    if (userAgent.includes('safari')) return 'Safari';
    if (userAgent.includes('edge')) return 'Edge';
    return 'Unknown';
  }

  private getScreenSize(): UserPresence['device']['screen'] {
    if (typeof window === 'undefined') return undefined;
    
    return {
      width: window.screen.width,
      height: window.screen.height,
    };
  }

  private initializeAnalytics(): PresenceAnalytics {
    return {
      showId: this.showId,
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
   * Check if service is active
   */
  isServiceActive(): boolean {
    return this.isActive;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...updates };
  }
}

export default PresenceService;