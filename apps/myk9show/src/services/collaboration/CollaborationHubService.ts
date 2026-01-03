import { presenceService, UserPresence, PresenceUpdate } from './PresenceService';
import { liveUpdatesService, LiveUpdate } from './LiveUpdatesService';
import { collaborativeEditingService, EditLock, TypingIndicator } from './CollaborativeEditingService';
import { supabase } from '../../supabaseClient';

export interface CollaborationEvent {
  id: string;
  type: 'presence' | 'live_update' | 'edit_lock' | 'typing' | 'notification';
  data: Record<string, unknown>;
  userId: string;
  userName: string;
  timestamp: Date;
  showId?: string;
}

export interface NotificationEvent {
  id: string;
  type: 'judge_assigned' | 'entry_submitted' | 'scoring_complete' | 'show_status_change';
  title: string;
  message: string;
  userId: string;
  targetUserIds?: string[];
  showId?: string;
  entityType?: string;
  entityId?: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
  read: boolean;
}

export interface CollaborationStats {
  activeUsers: number;
  onlineJudges: number;
  onlineSecretaries: number;
  onlineExhibitors: number;
  activeEdits: number;
  recentUpdates: number;
  notifications: number;
}

export class CollaborationHubService {
  private static instance: CollaborationHubService;
  private initialized = false;
  private currentUser: UserPresence | null = null;
  private eventHistory: CollaborationEvent[] = [];
  private notifications: NotificationEvent[] = [];
  private subscribers: Set<(event: CollaborationEvent) => void> = new Set();
  private notificationSubscribers: Set<(notification: NotificationEvent) => void> = new Set();
  private maxHistorySize = 1000;

  private constructor() {}

  static getInstance(): CollaborationHubService {
    if (!CollaborationHubService.instance) {
      CollaborationHubService.instance = new CollaborationHubService();
    }
    return CollaborationHubService.instance;
  }

  async initialize(user: Omit<UserPresence, 'lastSeen'>): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.currentUser = { ...user, lastSeen: new Date() };

      // Initialize all collaboration services
      await presenceService.initialize(user);
      
      // Set up service subscriptions
      this.setupPresenceSubscription();
      this.setupLiveUpdatesSubscription();
      this.setupCollaborativeEditingSubscription();

      // Load initial notifications
      await this.loadNotifications();

      this.initialized = true;
      console.log('Collaboration hub initialized successfully');

    } catch (error) {
      console.error('Failed to initialize collaboration hub:', error);
      throw error;
    }
  }

  // Main subscription methods
  subscribe(callback: (event: CollaborationEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  subscribeToNotifications(callback: (notification: NotificationEvent) => void): () => void {
    this.notificationSubscribers.add(callback);
    return () => this.notificationSubscribers.delete(callback);
  }

  // Presence management
  async updateUserLocation(page: string, entityId?: string, entityType?: 'show' | 'dog' | 'person' | 'club' | 'entry'): Promise<void> {
    await presenceService.updateLocation(page, entityId, entityType);
  }

  async updateUserActivity(type: 'viewing' | 'editing' | 'scoring' | 'judging', details?: string): Promise<void> {
    await presenceService.updateActivity(type, details);
  }

  async updateUserStatus(status: 'online' | 'away' | 'busy'): Promise<void> {
    await presenceService.updateStatus(status);
  }

  getActiveUsers(): UserPresence[] {
    return presenceService.getActiveUsers();
  }

  getActiveUsersForEntity(entityType: string, entityId: string): UserPresence[] {
    return presenceService.getActiveUsersForEntity(entityType, entityId);
  }

  getUsersWithRole(role: UserPresence['role']): UserPresence[] {
    return presenceService.getUsersWithRole(role);
  }

  // Live updates management
  subscribeToEntityUpdates(
    entityType: string,
    entityId: string,
    callback: (update: LiveUpdate) => void,
    showId?: string
  ): string {
    return liveUpdatesService.subscribeToEntity(entityType, entityId, callback, showId);
  }

  subscribeToShowUpdates(showId: string, callback: (update: LiveUpdate) => void): string {
    return liveUpdatesService.subscribeToShow(showId, callback);
  }

  async broadcastEntryCountUpdate(showId: string, classId: string, newCount: number, previousCount: number): Promise<void> {
    await liveUpdatesService.broadcastEntryCountUpdate(showId, classId, newCount, previousCount);
  }

  async broadcastScoringUpdate(showId: string, entryId: string, scoreData: Record<string, unknown>, judgeId: string, judgeName: string): Promise<void> {
    await liveUpdatesService.broadcastScoringUpdate(showId, entryId, scoreData, judgeId, judgeName);
  }

  // Collaborative editing management
  async requestEditLock(entityType: string, entityId: string): Promise<boolean> {
    if (!this.currentUser) return false;
    
    return await collaborativeEditingService.requestEditLock(
      entityType,
      entityId,
      this.currentUser.id,
      this.currentUser.name
    );
  }

  async releaseEditLock(entityType: string, entityId: string): Promise<void> {
    if (!this.currentUser) return;
    
    await collaborativeEditingService.releaseEditLock(entityType, entityId, this.currentUser.id);
  }

  getEditLock(entityType: string, entityId: string): EditLock | null {
    return collaborativeEditingService.getEditLock(entityType, entityId);
  }

  isEntityLocked(entityType: string, entityId: string): boolean {
    return collaborativeEditingService.isEntityLocked(entityType, entityId, this.currentUser?.id);
  }

  getTypingIndicators(entityType: string, entityId: string, fieldName: string): TypingIndicator[] {
    return collaborativeEditingService.getTypingIndicators(entityType, entityId, fieldName, this.currentUser?.id);
  }

  // Notification management
  async sendNotification(notification: Omit<NotificationEvent, 'id' | 'timestamp' | 'read'>): Promise<void> {
    const fullNotification: NotificationEvent = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false
    };

    // Store notification
    this.notifications.unshift(fullNotification);

    // Broadcast to specific users or all users
    await this.broadcastNotification(fullNotification);

    // Notify local subscribers
    this.notificationSubscribers.forEach(callback => {
      try {
        callback(fullNotification);
      } catch (error) {
        console.error('Notification callback error:', error);
      }
    });
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
    }
  }

  getNotifications(limit = 50): NotificationEvent[] {
    return this.notifications.slice(0, limit);
  }

  getUnreadNotifications(): NotificationEvent[] {
    return this.notifications.filter(n => !n.read);
  }

  // Statistics and monitoring
  getCollaborationStats(): CollaborationStats {
    const activeUsers = this.getActiveUsers();
    const editLocks = Array.from(collaborativeEditingService['locks'].values());
    
    return {
      activeUsers: activeUsers.length,
      onlineJudges: activeUsers.filter(u => u.role === 'judge').length,
      onlineSecretaries: activeUsers.filter(u => u.role === 'secretary').length,
      onlineExhibitors: activeUsers.filter(u => u.role === 'exhibitor').length,
      activeEdits: editLocks.length,
      recentUpdates: this.eventHistory.filter(e => 
        Date.now() - e.timestamp.getTime() < 300000 // Last 5 minutes
      ).length,
      notifications: this.getUnreadNotifications().length
    };
  }

  getEventHistory(limit = 100): CollaborationEvent[] {
    return this.eventHistory.slice(0, limit);
  }

  // Utility methods for common scenarios
  async notifyJudgeAssigned(showId: string, classId: string, judgeId: string, judgeName: string): Promise<void> {
    await this.sendNotification({
      type: 'judge_assigned',
      title: 'Judge Assigned',
      message: `You have been assigned to judge a class`,
      userId: this.currentUser?.id || 'system',
      targetUserIds: [judgeId],
      showId,
      entityType: 'class',
      entityId: classId,
      priority: 'high'
    });

    await liveUpdatesService.broadcastJudgeAssignment(showId, classId, judgeId, judgeName, this.currentUser?.id || 'system');
  }

  async notifyEntrySubmitted(showId: string, entryId: string, exhibitorId: string): Promise<void> {
    const secretaries = this.getUsersWithRole('secretary');
    
    await this.sendNotification({
      type: 'entry_submitted',
      title: 'New Entry Submitted',
      message: `A new entry has been submitted and needs review`,
      userId: exhibitorId,
      targetUserIds: secretaries.map(s => s.id),
      showId,
      entityType: 'entry',
      entityId: entryId,
      priority: 'medium'
    });
  }

  async notifyShowStatusChange(showId: string, newStatus: string, previousStatus: string): Promise<void> {
    await this.sendNotification({
      type: 'show_status_change',
      title: 'Show Status Changed',
      message: `Show status changed from ${previousStatus} to ${newStatus}`,
      userId: this.currentUser?.id || 'system',
      showId,
      entityType: 'show',
      entityId: showId,
      priority: 'medium'
    });

    await liveUpdatesService.broadcastShowStatusUpdate(showId, newStatus, previousStatus, this.currentUser?.id || 'system');
  }

  private setupPresenceSubscription(): void {
    presenceService.subscribe((update: PresenceUpdate) => {
      const event: CollaborationEvent = {
        id: `presence_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'presence',
        data: update as unknown as Record<string, unknown>,
        userId: update.userId,
        userName: update.userId === 'system' ? 'System' : 
                 presenceService.getActiveUsers().find(u => u.id === update.userId)?.name || 'Unknown',
        timestamp: update.timestamp
      };

      this.addToHistory(event);
      this.notifySubscribers(event);
    });
  }

  private setupLiveUpdatesSubscription(): void {
    // This would typically subscribe to all live updates, but we'll keep it simple
    // Individual components will subscribe to specific updates they need
  }

  private setupCollaborativeEditingSubscription(): void {
    // Monitor for edit lock changes and typing indicators
    // This would be enhanced to listen to collaborative editing events
  }

  private async loadNotifications(): Promise<void> {
    try {
      // In a real implementation, this would load from Supabase
      // For now, start with empty notifications
      this.notifications = [];
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  private async broadcastNotification(notification: NotificationEvent): Promise<void> {
    try {
      // Use Supabase real-time to broadcast notification
      const channel = supabase.channel('notifications');
      await channel.send({
        type: 'broadcast',
        event: 'notification',
        payload: notification
      });
    } catch (error) {
      console.error('Failed to broadcast notification:', error);
    }
  }

  private addToHistory(event: CollaborationEvent): void {
    this.eventHistory.unshift(event);
    
    // Trim history to max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(0, this.maxHistorySize);
    }
  }

  private notifySubscribers(event: CollaborationEvent): void {
    this.subscribers.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Collaboration event callback error:', error);
      }
    });
  }

  async cleanup(): Promise<void> {
    await presenceService.cleanup();
    await liveUpdatesService.cleanup();
    await collaborativeEditingService.cleanup();

    this.subscribers.clear();
    this.notificationSubscribers.clear();
    this.eventHistory = [];
    this.notifications = [];
    this.initialized = false;
  }

  // Health check
  isHealthy(): boolean {
    return this.initialized && 
           this.currentUser !== null &&
           this.getActiveUsers().length >= 0; // Basic health check
  }
}

export const collaborationHub = CollaborationHubService.getInstance();

// Re-export types and services for easier access
export type { UserPresence, PresenceUpdate } from './PresenceService';
export type { LiveUpdate } from './LiveUpdatesService';
export type { EditLock, TypingIndicator } from './CollaborativeEditingService';
export { presenceService } from './PresenceService';
export { liveUpdatesService } from './LiveUpdatesService';
export { collaborativeEditingService } from './CollaborativeEditingService';