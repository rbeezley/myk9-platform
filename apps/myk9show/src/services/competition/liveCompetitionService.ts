/**
 * Live Competition Service
 * Phase 6.2: Live Competition Features
 * 
 * Central service for coordinating all live competition features including
 * entry status updates, check-ins, results broadcasting, and presence tracking.
 */

import { subscriptionManager } from '../realtime/subscriptionManager';
import { realtimeClient } from '../realtime/realtimeClient';
import { errorMonitor } from '../../lib/errorMonitoring';
import type { 
  PresenceTrackingData,
  RealtimeEventCallback,
  Priority
} from '../../types/realtime-types';
import type { CheckInStatus } from '../../types/check-in-types';

export interface LiveCompetitionConfig {
  showId: string;
  enableEntryStatusUpdates: boolean;
  enableCheckInNotifications: boolean;
  enableResultsBroadcasting: boolean;
  enablePresenceTracking: boolean;
  enableCollaborativeJudging: boolean;
  batchUpdates: boolean;
  updateInterval: number; // ms
}

export interface EntryStatus {
  entryId: string;
  dogId: string;
  checkInStatus: CheckInStatus;
  ringStatus: 'waiting' | 'called' | 'in-ring' | 'completed' | 'absent' | 'on-deck' | 'excused';
  armband: string;
  classId: string;
  sequence: number;
  ringAssignment?: string;
  callTime?: Date;
  completedTime?: Date;
  updatedAt: Date;
  updatedBy: string;
}

export interface CompetitionNotification {
  id: string;
  type: 'check-in' | 'call-to-ring' | 'results' | 'schedule-change' | 'conflict';
  priority: Priority;
  title: string;
  message: string;
  targetAudience: 'all' | 'exhibitors' | 'judges' | 'stewards' | 'specific';
  targetIds?: string[]; // For specific targeting
  showId: string;
  classId?: string;
  entryId?: string;
  timestamp: Date;
  expiresAt?: Date;
  acknowledged?: string[]; // User IDs who acknowledged
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface CompetitionMetrics {
  activeUsers: number;
  activeJudges: number;
  totalEntries: number;
  checkedInEntries: number;
  completedEntries: number;
  activeRings: number;
  notificationsSent: number;
  averageProcessingTime: number;
  lastUpdate: Date;
}

/**
 * Central service for managing live competition features
 */
export class LiveCompetitionService {
  private config: LiveCompetitionConfig;
  private subscriptions = new Map<string, string>();
  private entryStatuses = new Map<string, EntryStatus>();
  private activeNotifications = new Map<string, CompetitionNotification>();
  private presenceData = new Map<string, PresenceTrackingData>();
  private metrics: CompetitionMetrics;
  private metricsTimer: NodeJS.Timeout | null = null;
  private isActive = false;

  // Event callbacks
  private onEntryStatusUpdate?: (status: EntryStatus) => void;
  private onCheckInNotification?: (notification: CompetitionNotification) => void;
  private onResultsUpdate?: (results: Record<string, unknown>) => void;
  private onPresenceChange?: (presences: PresenceTrackingData[]) => void;

  constructor(config: LiveCompetitionConfig) {
    this.config = config;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Start live competition monitoring
   */
  async start(): Promise<void> {
    if (this.isActive) {
      console.warn('Live competition service already active');
      return;
    }

    try {
      console.log(`Starting live competition for show ${this.config.showId}`);
      
      // Initialize real-time connection
      await realtimeClient.connect();

      // Setup subscriptions based on configuration
      if (this.config.enableEntryStatusUpdates) {
        await this.setupEntryStatusSubscription();
      }

      if (this.config.enableCheckInNotifications) {
        await this.setupCheckInSubscription();
      }

      if (this.config.enableResultsBroadcasting) {
        await this.setupResultsSubscription();
      }

      if (this.config.enablePresenceTracking) {
        await this.setupPresenceTracking();
      }

      if (this.config.enableCollaborativeJudging) {
        await this.setupCollaborativeJudging();
      }

      // Start metrics collection
      this.startMetricsCollection();

      this.isActive = true;
      console.log('Live competition service started successfully');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.config.showId, config: this.config }
      });
      throw error;
    }
  }

  /**
   * Stop live competition monitoring
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      console.log('Stopping live competition service');

      // Unsubscribe from all real-time updates
      for (const [, subscriptionId] of this.subscriptions) {
        await subscriptionManager.unsubscribe(subscriptionId);
      }

      // Stop metrics collection
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
        this.metricsTimer = null;
      }

      // Clear data
      this.subscriptions.clear();
      this.entryStatuses.clear();
      this.activeNotifications.clear();
      this.presenceData.clear();

      this.isActive = false;
      console.log('Live competition service stopped');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.config.showId }
      });
    }
  }

  /**
   * Setup entry status change subscriptions
   */
  private async setupEntryStatusSubscription(): Promise<void> {
    const subscriptionId = await subscriptionManager.subscribe(
      `entry-status-${this.config.showId}`,
      {
        table: 'entries',
        filter: `show_id=eq.${this.config.showId}`,
        events: ['UPDATE'],
        priority: 'high',
        batchUpdates: this.config.batchUpdates,
        bufferTime: this.config.updateInterval,
      },
      this.handleEntryStatusUpdate.bind(this)
    );

    this.subscriptions.set('entry-status', subscriptionId);
  }

  /**
   * Setup check-in notification subscriptions
   */
  private async setupCheckInSubscription(): Promise<void> {
    const subscriptionId = await subscriptionManager.subscribe(
      `checkins-${this.config.showId}`,
      {
        table: 'entry_checkins',
        filter: `show_id=eq.${this.config.showId}`,
        events: ['INSERT', 'UPDATE'],
        priority: 'high',
        batchUpdates: this.config.batchUpdates,
        bufferTime: this.config.updateInterval / 2, // Faster for check-ins
      },
      this.handleCheckInUpdate.bind(this)
    );

    this.subscriptions.set('checkins', subscriptionId);
  }

  /**
   * Setup results broadcasting subscriptions
   */
  private async setupResultsSubscription(): Promise<void> {
    const subscriptionId = await subscriptionManager.subscribe(
      `results-${this.config.showId}`,
      {
        table: 'scores',
        filter: `show_id=eq.${this.config.showId}`,
        events: ['INSERT', 'UPDATE'],
        priority: 'critical',
        batchUpdates: false, // Real-time for results
      },
      this.handleResultsUpdate.bind(this)
    );

    this.subscriptions.set('results', subscriptionId);
  }

  /**
   * Setup presence tracking for competition participants
   */
  private async setupPresenceTracking(): Promise<void> {
    const channelName = `competition-${this.config.showId}`;
    
    const subscriptionId = await subscriptionManager.subscribeToPresence(
      channelName,
      this.handlePresenceChange.bind(this)
    );

    this.subscriptions.set('presence', subscriptionId);
  }

  /**
   * Setup collaborative judging features
   */
  private async setupCollaborativeJudging(): Promise<void> {
    const subscriptionId = await subscriptionManager.subscribe(
      `judging-${this.config.showId}`,
      {
        table: 'live_scoring_sessions',
        filter: `show_id=eq.${this.config.showId}`,
        events: ['INSERT', 'UPDATE', 'DELETE'],
        priority: 'critical',
        enablePresence: true,
        enableBroadcast: true,
      },
      this.handleJudgingUpdate.bind(this)
    );

    this.subscriptions.set('judging', subscriptionId);
  }

  /**
   * Handle entry status updates
   */
  private handleEntryStatusUpdate: RealtimeEventCallback = (event) => {
    try {
      const entryData = (event as { payload?: { new?: Record<string, unknown> }; data?: Record<string, unknown> }).payload?.new || event.data;
      if (!entryData) return;

      const data = entryData as Record<string, unknown>;
      const entryStatus: EntryStatus = {
        entryId: data.id as string,
        dogId: data.dog_id as string,
        checkInStatus: (data.check_in_status as CheckInStatus) || 'none',
        ringStatus: (data.ring_status as EntryStatus['ringStatus']) || 'waiting',
        armband: (data.armband as string) || '',
        classId: data.class_id as string,
        sequence: (data.sequence as number) || 0,
        ringAssignment: data.ring_assignment as string,
        callTime: data.call_time ? new Date(data.call_time as string) : undefined,
        completedTime: data.completed_time ? new Date(data.completed_time as string) : undefined,
        updatedAt: new Date(data.updated_at as string),
        updatedBy: (data.updated_by as string) || 'system',
      };

      // Store the status
      this.entryStatuses.set(entryStatus.entryId, entryStatus);

      // Trigger callback if registered
      if (this.onEntryStatusUpdate) {
        this.onEntryStatusUpdate(entryStatus);
      }

      // Update metrics
      this.updateMetrics();

      console.log(`Entry status updated: ${entryStatus.entryId} -> ${entryStatus.ringStatus}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.config.showId }
      });
    }
  };

  /**
   * Handle check-in updates
   */
  private handleCheckInUpdate: RealtimeEventCallback = (event) => {
    try {
      const checkInData = (event as { payload?: { new?: Record<string, unknown> }; data?: Record<string, unknown> }).payload?.new || event.data;
      if (!checkInData) return;

      // Create notification for check-in
      const data = checkInData as Record<string, unknown>;
      const notification: CompetitionNotification = {
        id: `checkin-${data.entry_id}-${Date.now()}`,
        type: 'check-in',
        priority: 'medium',
        title: 'Exhibitor Checked In',
        message: `Armband ${data.armband as string} has checked in`,
        targetAudience: 'stewards',
        showId: this.config.showId,
        classId: data.class_id as string,
        entryId: data.entry_id as string,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      };

      this.activeNotifications.set(notification.id, notification);

      // Trigger callback if registered
      if (this.onCheckInNotification) {
        this.onCheckInNotification(notification);
      }

      console.log(`Check-in notification: ${notification.message}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.config.showId }
      });
    }
  };

  /**
   * Handle results updates
   */
  private handleResultsUpdate: RealtimeEventCallback = (event) => {
    try {
      const resultsData = (event as { payload?: { new?: Record<string, unknown> }; data?: Record<string, unknown> }).payload?.new || event.data;
      if (!resultsData) return;

      // Trigger callback if registered
      if (this.onResultsUpdate) {
        this.onResultsUpdate(resultsData as Record<string, unknown>);
      }

      console.log(`Results updated for entry: ${(resultsData as { entry_id: string }).entry_id}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.config.showId }
      });
    }
  };

  /**
   * Handle presence changes
   */
  private handlePresenceChange(presences: PresenceTrackingData[]): void {
    try {
      // Update presence data
      this.presenceData.clear();
      presences.forEach(presence => {
        this.presenceData.set(presence.user_id, presence);
      });

      // Trigger callback if registered
      if (this.onPresenceChange) {
        this.onPresenceChange(presences);
      }

      // Update metrics
      this.metrics.activeUsers = presences.filter(p => p.status === 'active').length;
      this.metrics.activeJudges = presences.filter(p => p.role === 'judge' && p.status === 'active').length;

      console.log(`Presence updated: ${presences.length} users online`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { presenceCount: presences.length, showId: this.config.showId }
      });
    }
  }

  /**
   * Handle collaborative judging updates
   */
  private handleJudgingUpdate: RealtimeEventCallback = (event) => {
    try {
      const judgingData = (event as { payload?: { new?: Record<string, unknown> }; data?: Record<string, unknown> }).payload?.new || event.data;
      if (!judgingData) return;

      console.log(`Judging session updated: ${(judgingData as { session_id: string }).session_id}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.config.showId }
      });
    }
  };

  /**
   * Broadcast notification to competition participants
   */
  async broadcastNotification(notification: CompetitionNotification): Promise<void> {
    try {
      const channelName = `competition-${this.config.showId}`;
      
      await subscriptionManager.broadcast(channelName, {
        type: 'notification',
        payload: notification,
        metadata: {
          priority: notification.priority,
          timestamp: Date.now(),
        },
      });

      // Store notification
      this.activeNotifications.set(notification.id, notification);
      
      // Update metrics
      this.metrics.notificationsSent++;

      console.log(`Notification broadcasted: ${notification.title}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { notification, showId: this.config.showId }
      });
      throw error;
    }
  }

  /**
   * Update entry ring status
   */
  async updateEntryRingStatus(
    entryId: string, 
    ringStatus: EntryStatus['ringStatus'],
    metadata?: Partial<EntryStatus>
  ): Promise<void> {
    try {
      const channelName = `competition-${this.config.showId}`;
      
      const updateData = {
        entryId,
        ringStatus,
        updatedAt: new Date(),
        ...metadata,
      };

      await subscriptionManager.broadcast(channelName, {
        type: 'entry-status-update',
        payload: updateData,
        metadata: {
          priority: 'high',
          timestamp: Date.now(),
        },
      });

      console.log(`Entry ring status updated: ${entryId} -> ${ringStatus}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, ringStatus, showId: this.config.showId }
      });
      throw error;
    }
  }

  /**
   * Track user presence in competition
   */
  async trackPresence(userData: PresenceTrackingData): Promise<void> {
    try {
      const channelName = `competition-${this.config.showId}`;
      await subscriptionManager.trackPresence(channelName, userData);
      
      console.log(`Tracking presence for user: ${userData.user_id}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { userData, showId: this.config.showId }
      });
      throw error;
    }
  }

  /**
   * Stop tracking user presence
   */
  async untrackPresence(): Promise<void> {
    try {
      const channelName = `competition-${this.config.showId}`;
      await subscriptionManager.untrackPresence(channelName);
      
      console.log('Stopped tracking presence');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.config.showId }
      });
    }
  }

  /**
   * Register event callbacks
   */
  onEntryStatusChange(callback: (status: EntryStatus) => void): void {
    this.onEntryStatusUpdate = callback;
  }

  onCheckInChange(callback: (notification: CompetitionNotification) => void): void {
    this.onCheckInNotification = callback;
  }

  onResultsChange(callback: (results: Record<string, unknown>) => void): void {
    this.onResultsUpdate = callback;
  }

  onPresenceUpdate(callback: (presences: PresenceTrackingData[]) => void): void {
    this.onPresenceChange = callback;
  }

  /**
   * Get current entry statuses
   */
  getEntryStatuses(): Map<string, EntryStatus> {
    return new Map(this.entryStatuses);
  }

  /**
   * Get active notifications
   */
  getActiveNotifications(): CompetitionNotification[] {
    return Array.from(this.activeNotifications.values())
      .filter(n => !n.expiresAt || n.expiresAt > new Date());
  }

  /**
   * Get current presence data
   */
  getPresenceData(): PresenceTrackingData[] {
    return Array.from(this.presenceData.values());
  }

  /**
   * Get competition metrics
   */
  getMetrics(): CompetitionMetrics {
    return { ...this.metrics };
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): CompetitionMetrics {
    return {
      activeUsers: 0,
      activeJudges: 0,
      totalEntries: 0,
      checkedInEntries: 0,
      completedEntries: 0,
      activeRings: 0,
      notificationsSent: 0,
      averageProcessingTime: 0,
      lastUpdate: new Date(),
    };
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, 10000); // Update every 10 seconds
  }

  /**
   * Update metrics
   */
  private updateMetrics(): void {
    this.metrics.totalEntries = this.entryStatuses.size;
    this.metrics.checkedInEntries = Array.from(this.entryStatuses.values())
      .filter(e => e.checkInStatus !== 'none').length;
    this.metrics.completedEntries = Array.from(this.entryStatuses.values())
      .filter(e => e.ringStatus === 'completed').length;
    this.metrics.lastUpdate = new Date();
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
  updateConfig(updates: Partial<LiveCompetitionConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

export default LiveCompetitionService;