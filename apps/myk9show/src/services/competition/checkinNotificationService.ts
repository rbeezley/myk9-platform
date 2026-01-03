/**
 * Check-in Notification Service
 * Phase 6.2: Live Competition Features
 * 
 * Real-time notification service for competitor check-ins, providing immediate
 * alerts to stewards, secretaries, and ring personnel about exhibitor arrivals.
 */

import { subscriptionManager } from '../realtime/subscriptionManager';
import { errorMonitor } from '../../lib/errorMonitoring';
import type { CheckInStatus } from '../../types/check-in-types';
import type { Priority } from '../../types/realtime-types';

export interface CheckInEvent {
  id: string;
  entryId: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  exhibitorName: string;
  armband: string;
  classId: string;
  className: string;
  checkInStatus: CheckInStatus;
  previousStatus: CheckInStatus;
  timestamp: Date;
  location?: string;
  checkedInBy: string;
  ringAssignment?: string;
  sequence: number;
  estimatedRingTime?: Date;
  notes?: string;
}

export interface CheckInNotification {
  id: string;
  type: 'check-in' | 'late-arrival' | 'conflict-detected' | 'status-change' | 'queue-update';
  priority: Priority;
  title: string;
  message: string;
  subMessage?: string;
  checkInEvent: CheckInEvent;
  targetRoles: Array<'secretary' | 'steward' | 'judge' | 'exhibitor'>;
  targetUsers?: string[]; // Specific user IDs
  expiresAt: Date;
  persistent: boolean; // Should this persist until acknowledged?
  actionRequired: boolean;
  actionLabel?: string;
  actionUrl?: string;
  timestamp: Date;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface CheckInQueueStatus {
  classId: string;
  className: string;
  totalEntries: number;
  checkedInCount: number;
  pendingCount: number;
  conflictCount: number;
  lateArrivals: number;
  estimatedStartTime: Date;
  actualStartTime?: Date;
  averageCheckInTime: number; // seconds
  lastUpdated: Date;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface CheckInMetrics {
  showId: string;
  totalNotificationsSent: number;
  checkInsProcessed: number;
  conflictsDetected: number;
  lateArrivals: number;
  averageNotificationDelay: number; // ms
  peakCheckInRate: number; // per minute
  lastActivity: Date;
}

/**
 * Service for managing real-time check-in notifications
 */
export class CheckInNotificationService {
  private showId: string;
  private channelName: string;
  private isActive = false;
  private subscriptionId?: string;

  // Event storage and tracking
  private recentCheckIns = new Map<string, CheckInEvent>();
  private activeNotifications = new Map<string, CheckInNotification>();
  private queueStatuses = new Map<string, CheckInQueueStatus>();
  private metrics: CheckInMetrics;

  // Event listeners
  private checkInListeners = new Set<(event: CheckInEvent) => void>();
  private notificationListeners = new Set<(notification: CheckInNotification) => void>();
  private queueUpdateListeners = new Set<(status: CheckInQueueStatus) => void>();

  // Configuration
  private config = {
    notificationRetentionMs: 30 * 60 * 1000, // 30 minutes
    batchProcessingMs: 1000, // 1 second
    lateArrivalThresholdMs: 15 * 60 * 1000, // 15 minutes before estimated start
    conflictDetectionEnabled: true,
    autoExpireNotifications: true,
  };

  constructor(showId: string) {
    this.showId = showId;
    this.channelName = `checkin-notifications-${showId}`;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Start check-in notification service
   */
  async start(): Promise<void> {
    if (this.isActive) {
      console.warn('Check-in notification service already active');
      return;
    }

    try {
      console.log(`Starting check-in notification service for show ${this.showId}`);

      // Subscribe to check-in updates
      this.subscriptionId = await subscriptionManager.subscribe(
        `checkin-service-${this.showId}`,
        {
          table: 'entry_checkins',
          filter: `show_id=eq.${this.showId}`,
          events: ['INSERT', 'UPDATE'],
          priority: 'high',
          batchUpdates: true,
          bufferTime: this.config.batchProcessingMs,
          enableBroadcast: true,
        },
        this.handleCheckInUpdate.bind(this)
      );

      // Start cleanup routine
      this.startCleanupRoutine();

      this.isActive = true;
      console.log('Check-in notification service started successfully');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId }
      });
      throw error;
    }
  }

  /**
   * Stop check-in notification service
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      console.log('Stopping check-in notification service');

      // Unsubscribe from updates
      if (this.subscriptionId) {
        await subscriptionManager.unsubscribe(this.subscriptionId);
      }

      // Clear data
      this.recentCheckIns.clear();
      this.activeNotifications.clear();
      this.queueStatuses.clear();

      this.isActive = false;
      console.log('Check-in notification service stopped');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId }
      });
    }
  }

  /**
   * Handle check-in database updates
   */
  private handleCheckInUpdate(event: {
    payload?: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    };
    data?: Record<string, unknown>;
  }): void {
    try {
      const checkInData = event.payload?.new || event.data;
      if (!checkInData) return;

      const previousData = event.payload?.old;
      const previousStatus: CheckInStatus = ((previousData as Record<string, unknown>)?.check_in_status as CheckInStatus) || 'none';

      const data = checkInData as Record<string, unknown>;
      const checkInEvent: CheckInEvent = {
        id: `checkin-${data.entry_id}-${Date.now()}`,
        entryId: data.entry_id as string,
        dogId: data.dog_id as string,
        dogName: (data.dog_name as string) || 'Unknown',
        ownerName: (data.owner_name as string) || 'Unknown',
        exhibitorName: (data.exhibitor_name as string) || (data.owner_name as string) || 'Unknown',
        armband: (data.armband as string) || '',
        classId: data.class_id as string,
        className: (data.class_name as string) || 'Unknown Class',
        checkInStatus: data.check_in_status as CheckInStatus,
        previousStatus,
        timestamp: new Date((data.updated_at as string) || (data.created_at as string)),
        location: data.check_in_location as string,
        checkedInBy: (data.checked_in_by as string) || 'system',
        ringAssignment: data.ring_assignment as string,
        sequence: (data.sequence as number) || 0,
        estimatedRingTime: data.estimated_ring_time ? new Date(data.estimated_ring_time as string) : undefined,
        notes: data.notes as string,
      };

      // Store the check-in event
      this.recentCheckIns.set(checkInEvent.entryId, checkInEvent);

      // Process the check-in
      this.processCheckInEvent(checkInEvent);

      // Update metrics
      this.updateMetrics(checkInEvent);

      console.log(`Check-in event: ${checkInEvent.armband} (${checkInEvent.dogName}) -> ${checkInEvent.checkInStatus}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId }
      });
    }
  }

  /**
   * Process check-in event and generate notifications
   */
  private processCheckInEvent(event: CheckInEvent): void {
    try {
      // Generate notifications based on status change
      const notifications = this.generateNotifications(event);
      
      // Store and broadcast notifications
      notifications.forEach(notification => {
        this.activeNotifications.set(notification.id, notification);
        this.broadcastNotification(notification);
        
        // Trigger listeners
        this.notificationListeners.forEach(listener => {
          try {
            listener(notification);
          } catch (error) {
            console.error('Error in notification listener:', error);
          }
        });
      });

      // Update queue status
      this.updateQueueStatus(event.classId);

      // Trigger check-in listeners
      this.checkInListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in check-in listener:', error);
        }
      });

      // Detect conflicts if enabled
      if (this.config.conflictDetectionEnabled) {
        this.detectConflicts(event);
      }

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId }
      });
    }
  }

  /**
   * Generate notifications for check-in event
   */
  private generateNotifications(event: CheckInEvent): CheckInNotification[] {
    const notifications: CheckInNotification[] = [];
    const baseId = `notification-${event.entryId}-${Date.now()}`;

    // Standard check-in notification
    if (event.checkInStatus === 'checked-in' && event.previousStatus === 'none') {
      notifications.push({
        id: `${baseId}-checkin`,
        type: 'check-in',
        priority: 'medium',
        title: 'Exhibitor Checked In',
        message: `${event.armband} - ${event.dogName} has checked in`,
        subMessage: `${event.exhibitorName} • ${event.className}`,
        checkInEvent: event,
        targetRoles: ['steward', 'secretary'],
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        persistent: false,
        actionRequired: false,
        timestamp: event.timestamp,
      });
    }

    // Late arrival notification
    if (this.isLateArrival(event)) {
      notifications.push({
        id: `${baseId}-late`,
        type: 'late-arrival',
        priority: 'high',
        title: 'Late Arrival',
        message: `${event.armband} - ${event.dogName} arrived late`,
        subMessage: `Ring time was ${event.estimatedRingTime?.toLocaleTimeString()}`,
        checkInEvent: event,
        targetRoles: ['steward', 'secretary', 'judge'],
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        persistent: true,
        actionRequired: true,
        actionLabel: 'Update Schedule',
        timestamp: event.timestamp,
      });
    }

    // Conflict notification
    if (event.checkInStatus === 'conflict') {
      notifications.push({
        id: `${baseId}-conflict`,
        type: 'conflict-detected',
        priority: 'critical',
        title: 'Schedule Conflict',
        message: `${event.armband} - ${event.dogName} has a scheduling conflict`,
        subMessage: `Requires immediate attention`,
        checkInEvent: event,
        targetRoles: ['secretary', 'steward'],
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        persistent: true,
        actionRequired: true,
        actionLabel: 'Resolve Conflict',
        timestamp: event.timestamp,
      });
    }

    // Status change notification
    if (event.previousStatus !== 'none' && event.previousStatus !== event.checkInStatus) {
      notifications.push({
        id: `${baseId}-status-change`,
        type: 'status-change',
        priority: this.getPriorityForStatusChange(event.checkInStatus),
        title: 'Check-in Status Changed',
        message: `${event.armband} - ${event.dogName} status: ${event.checkInStatus}`,
        subMessage: `Changed from ${event.previousStatus}`,
        checkInEvent: event,
        targetRoles: ['steward', 'secretary'],
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        persistent: event.checkInStatus === 'conflict',
        actionRequired: event.checkInStatus === 'conflict',
        timestamp: event.timestamp,
      });
    }

    return notifications;
  }

  /**
   * Check if this is a late arrival
   */
  private isLateArrival(event: CheckInEvent): boolean {
    if (!event.estimatedRingTime) return false;
    
    const timeDiff = event.timestamp.getTime() - event.estimatedRingTime.getTime();
    return timeDiff > -this.config.lateArrivalThresholdMs; // Less than 15 min before ring time
  }

  /**
   * Get priority for status change notifications
   */
  private getPriorityForStatusChange(status: CheckInStatus): CheckInNotification['priority'] {
    switch (status) {
      case 'conflict': return 'critical';
      case 'at-gate': return 'high';
      case 'go-to-gate': return 'high';
      case 'pulled': return 'medium';
      default: return 'medium';
    }
  }

  /**
   * Update queue status for a class
   */
  private updateQueueStatus(classId: string): void {
    try {
      const classCheckIns = Array.from(this.recentCheckIns.values())
        .filter(event => event.classId === classId);

      if (classCheckIns.length === 0) return;

      const sampleEvent = classCheckIns[0];
      const checkedInCount = classCheckIns.filter(e => e.checkInStatus !== 'none').length;
      const conflictCount = classCheckIns.filter(e => e.checkInStatus === 'conflict').length;
      const lateArrivals = classCheckIns.filter(e => this.isLateArrival(e)).length;

      const queueStatus: CheckInQueueStatus = {
        classId,
        className: sampleEvent.className,
        totalEntries: classCheckIns.length,
        checkedInCount,
        pendingCount: classCheckIns.length - checkedInCount,
        conflictCount,
        lateArrivals,
        estimatedStartTime: sampleEvent.estimatedRingTime || new Date(),
        averageCheckInTime: this.calculateAverageCheckInTime(classCheckIns),
        lastUpdated: new Date(),
      };

      this.queueStatuses.set(classId, queueStatus);

      // Trigger queue update listeners
      this.queueUpdateListeners.forEach(listener => {
        try {
          listener(queueStatus);
        } catch (error) {
          console.error('Error in queue update listener:', error);
        }
      });

      // Broadcast queue update
      this.broadcastQueueUpdate(queueStatus);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { classId, showId: this.showId }
      });
    }
  }

  /**
   * Calculate average check-in processing time
   */
  private calculateAverageCheckInTime(checkIns: CheckInEvent[]): number {
    const validCheckIns = checkIns.filter(e => e.checkInStatus !== 'none');
    if (validCheckIns.length === 0) return 0;

    // Simple average for now - could be more sophisticated
    return validCheckIns.length > 0 ? 30 : 0; // 30 seconds average
  }

  /**
   * Detect scheduling conflicts
   */
  private detectConflicts(event: CheckInEvent): void {
    try {
      // Look for overlapping ring times in same exhibitor's entries
      const exhibitorEntries = Array.from(this.recentCheckIns.values())
        .filter(e => e.exhibitorName === event.exhibitorName && e.entryId !== event.entryId);

      const conflicts = exhibitorEntries.filter(entry => {
        if (!entry.estimatedRingTime || !event.estimatedRingTime) return false;
        
        // Check for overlapping times (within 30 minutes)
        const timeDiff = Math.abs(entry.estimatedRingTime.getTime() - event.estimatedRingTime.getTime());
        return timeDiff < 30 * 60 * 1000; // 30 minutes
      });

      if (conflicts.length > 0) {
        this.generateConflictNotification(event, conflicts);
      }

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId }
      });
    }
  }

  /**
   * Generate conflict notification
   */
  private generateConflictNotification(event: CheckInEvent, conflicts: CheckInEvent[]): void {
    const notification: CheckInNotification = {
      id: `conflict-${event.entryId}-${Date.now()}`,
      type: 'conflict-detected',
      priority: 'critical',
      title: 'Exhibitor Conflict Detected',
      message: `${event.exhibitorName} has ${conflicts.length + 1} overlapping entries`,
      subMessage: `Classes: ${[event.className, ...conflicts.map(c => c.className)].join(', ')}`,
      checkInEvent: event,
      targetRoles: ['secretary'],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      persistent: true,
      actionRequired: true,
      actionLabel: 'Resolve Conflict',
      timestamp: new Date(),
    };

    this.activeNotifications.set(notification.id, notification);
    this.broadcastNotification(notification);
    this.metrics.conflictsDetected++;
  }

  /**
   * Broadcast notification to clients
   */
  private async broadcastNotification(notification: CheckInNotification): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'checkin-notification',
        payload: notification,
        metadata: {
          priority: notification.priority,
          timestamp: Date.now(),
        },
      });

      this.metrics.totalNotificationsSent++;

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { notification, showId: this.showId }
      });
    }
  }

  /**
   * Broadcast queue status update
   */
  private async broadcastQueueUpdate(queueStatus: CheckInQueueStatus): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'queue-update',
        payload: queueStatus,
        metadata: {
          priority: 'medium',
          timestamp: Date.now(),
        },
      });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { queueStatus, showId: this.showId }
      });
    }
  }

  /**
   * Manually trigger check-in notification
   */
  async triggerCheckInNotification(
    entryId: string,
    customMessage?: string,
    targetRoles?: CheckInNotification['targetRoles']
  ): Promise<void> {
    try {
      const checkInEvent = this.recentCheckIns.get(entryId);
      if (!checkInEvent) {
        throw new Error(`Check-in event not found for entry: ${entryId}`);
      }

      const notification: CheckInNotification = {
        id: `manual-${entryId}-${Date.now()}`,
        type: 'check-in',
        priority: 'high',
        title: 'Manual Check-in Alert',
        message: customMessage || `${checkInEvent.armband} - ${checkInEvent.dogName} needs attention`,
        checkInEvent,
        targetRoles: targetRoles || ['steward', 'secretary'],
        expiresAt: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes
        persistent: true,
        actionRequired: true,
        timestamp: new Date(),
      };

      this.activeNotifications.set(notification.id, notification);
      await this.broadcastNotification(notification);

      console.log(`Manual check-in notification sent for ${entryId}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, customMessage, showId: this.showId }
      });
      throw error;
    }
  }

  /**
   * Acknowledge notification
   */
  async acknowledgeNotification(notificationId: string, userId: string): Promise<void> {
    try {
      const notification = this.activeNotifications.get(notificationId);
      if (!notification) return;

      // Add to acknowledged list
      if (!notification.checkInEvent) {
        notification.checkInEvent = {} as CheckInEvent; // Fallback
      }

      await subscriptionManager.broadcast(this.channelName, {
        type: 'notification-acknowledged',
        payload: {
          notificationId,
          userId,
          timestamp: Date.now(),
        },
      });

      // Remove if not persistent
      if (!notification.persistent) {
        this.activeNotifications.delete(notificationId);
      }

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { notificationId, userId, showId: this.showId }
      });
    }
  }

  /**
   * Event listener management
   */
  onCheckInEvent(listener: (event: CheckInEvent) => void): () => void {
    this.checkInListeners.add(listener);
    return () => this.checkInListeners.delete(listener);
  }

  onNotification(listener: (notification: CheckInNotification) => void): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onQueueUpdate(listener: (status: CheckInQueueStatus) => void): () => void {
    this.queueUpdateListeners.add(listener);
    return () => this.queueUpdateListeners.delete(listener);
  }

  /**
   * Data access methods
   */
  getRecentCheckIns(): CheckInEvent[] {
    return Array.from(this.recentCheckIns.values());
  }

  getActiveNotifications(): CheckInNotification[] {
    return Array.from(this.activeNotifications.values())
      .filter(n => !this.config.autoExpireNotifications || n.expiresAt > new Date());
  }

  getQueueStatuses(): CheckInQueueStatus[] {
    return Array.from(this.queueStatuses.values());
  }

  getClassQueueStatus(classId: string): CheckInQueueStatus | undefined {
    return this.queueStatuses.get(classId);
  }

  getMetrics(): CheckInMetrics {
    return { ...this.metrics };
  }

  /**
   * Update metrics
   */
  private updateMetrics(event: CheckInEvent): void {
    this.metrics.checkInsProcessed++;
    this.metrics.lastActivity = new Date();
    
    if (this.isLateArrival(event)) {
      this.metrics.lateArrivals++;
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): CheckInMetrics {
    return {
      showId: this.showId,
      totalNotificationsSent: 0,
      checkInsProcessed: 0,
      conflictsDetected: 0,
      lateArrivals: 0,
      averageNotificationDelay: 0,
      peakCheckInRate: 0,
      lastActivity: new Date(),
    };
  }

  /**
   * Start cleanup routine for expired notifications
   */
  private startCleanupRoutine(): void {
    setInterval(() => {
      if (this.config.autoExpireNotifications) {
        const now = new Date();
        for (const [id, notification] of this.activeNotifications) {
          if (notification.expiresAt < now) {
            this.activeNotifications.delete(id);
          }
        }
      }
    }, 60000); // Clean up every minute
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

export default CheckInNotificationService;