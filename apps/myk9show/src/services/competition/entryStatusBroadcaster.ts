/**
 * Entry Status Broadcaster Service
 * Phase 6.2: Live Competition Features
 * 
 * Real-time broadcasting service for entry status updates during competitions.
 * Handles ring status, armband calls, sequence changes, and check-in status.
 */

import { subscriptionManager } from '../realtime/subscriptionManager';
import { errorMonitor } from '../../lib/errorMonitoring';
import type { CheckInStatus } from '../../types/check-in-types';

export interface EntryStatusUpdate {
  entryId: string;
  dogId: string;
  dogName: string;
  ownerName: string;
  armband: string;
  classId: string;
  className: string;
  checkInStatus: CheckInStatus;
  ringStatus: 'waiting' | 'on-deck' | 'called' | 'in-ring' | 'completed' | 'absent' | 'excused';
  sequence: number;
  estimatedCallTime?: Date;
  actualCallTime?: Date;
  completedTime?: Date;
  ringAssignment?: string;
  judgeId?: string;
  judgeName?: string;
  notes?: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface RingStatusEvent {
  type: 'entry-called' | 'entry-on-deck' | 'entry-in-ring' | 'entry-completed' | 'entry-absent' | 'entry-excused';
  entryId: string;
  armband: string;
  dogName: string;
  ringAssignment: string;
  timestamp: Date;
  sequence: number;
  metadata?: {
    estimatedTime?: Date;
    judgeId?: string;
    ringNumber?: string;
    priority?: 'medium' | 'critical';
  };
}

export interface SequenceUpdate {
  classId: string;
  entries: Array<{
    entryId: string;
    armband: string;
    newSequence: number;
    oldSequence: number;
  }>;
  reason: 'reorder' | 'scratch' | 'late-entry' | 'conflict-resolution';
  updatedBy: string;
  timestamp: Date;
  [key: string]: unknown; // Index signature for broadcast compatibility
}

export interface CallToRingNotification {
  entryId: string;
  armband: string;
  dogName: string;
  ownerName: string;
  className: string;
  ringAssignment: string;
  callType: 'on-deck' | 'called' | 'final-call';
  sequence: number;
  estimatedTime: Date;
  urgency: 'normal' | 'urgent' | 'final';
  timestamp: Date;
}

/**
 * Service for broadcasting entry status updates in real-time
 */
export class EntryStatusBroadcaster {
  private channelName: string;
  private showId: string;
  private isActive = false;
  private subscriptionId?: string;

  // Event listeners
  private statusUpdateListeners = new Set<(update: EntryStatusUpdate) => void>();
  private ringEventListeners = new Set<(event: RingStatusEvent) => void>();
  private sequenceUpdateListeners = new Set<(update: SequenceUpdate) => void>();
  private callNotificationListeners = new Set<(notification: CallToRingNotification) => void>();

  // Caching for deduplication
  private lastUpdates = new Map<string, EntryStatusUpdate>();
  private updateQueue = new Map<string, EntryStatusUpdate>();
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(showId: string) {
    this.showId = showId;
    this.channelName = `entry-status-${showId}`;
  }

  /**
   * Start broadcasting service
   */
  async start(): Promise<void> {
    if (this.isActive) {
      console.warn('Entry status broadcaster already active');
      return;
    }

    try {
      console.log(`Starting entry status broadcaster for show ${this.showId}`);

      // Subscribe to entry updates
      this.subscriptionId = await subscriptionManager.subscribe(
        `entry-broadcaster-${this.showId}`,
        {
          table: 'entries',
          filter: `show_id=eq.${this.showId}`,
          events: ['UPDATE'],
          priority: 'high',
          batchUpdates: true,
          bufferTime: 500, // Half second batching for UI smoothness
          enableBroadcast: true,
        },
        this.handleEntryUpdate.bind(this)
      );

      this.isActive = true;
      console.log('Entry status broadcaster started successfully');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId }
      });
      throw error;
    }
  }

  /**
   * Stop broadcasting service
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      console.log('Stopping entry status broadcaster');

      // Unsubscribe from updates
      if (this.subscriptionId) {
        await subscriptionManager.unsubscribe(this.subscriptionId);
      }

      // Clear timers
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }

      // Process any remaining queue
      this.processBatchedUpdates();

      // Clear data
      this.lastUpdates.clear();
      this.updateQueue.clear();

      this.isActive = false;
      console.log('Entry status broadcaster stopped');

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { showId: this.showId }
      });
    }
  }

  /**
   * Handle entry database updates
   */
  private handleEntryUpdate(event: {
    payload?: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    };
    data?: Record<string, unknown>;
  }): void {
    try {
      const entryData = event.payload?.new || event.data;
      if (!entryData) return;

      const data = entryData as Record<string, unknown>;
      const update: EntryStatusUpdate = {
        entryId: data.id as string,
        dogId: data.dog_id as string,
        dogName: (data.dog_name as string) || 'Unknown',
        ownerName: (data.owner_name as string) || 'Unknown',
        armband: (data.armband as string) || '',
        classId: data.class_id as string,
        className: (data.class_name as string) || 'Unknown Class',
        checkInStatus: (data.check_in_status as CheckInStatus) || 'none',
        ringStatus: (data.ring_status as EntryStatusUpdate['ringStatus']) || 'waiting',
        sequence: (data.sequence as number) || 0,
        estimatedCallTime: data.estimated_call_time ? new Date(data.estimated_call_time as string) : undefined,
        actualCallTime: data.actual_call_time ? new Date(data.actual_call_time as string) : undefined,
        completedTime: data.completed_time ? new Date(data.completed_time as string) : undefined,
        ringAssignment: data.ring_assignment as string,
        judgeId: data.judge_id as string,
        judgeName: data.judge_name as string,
        notes: data.notes as string,
        updatedAt: new Date(data.updated_at as string),
        updatedBy: (data.updated_by as string) || 'system',
      };

      // Check if this is a significant change
      if (this.isSignificantChange(update)) {
        this.queueUpdate(update);
        this.generateRingEvents(update);
      }

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { event, showId: this.showId }
      });
    }
  }

  /**
   * Check if the update represents a significant change
   */
  private isSignificantChange(update: EntryStatusUpdate): boolean {
    const lastUpdate = this.lastUpdates.get(update.entryId);
    
    if (!lastUpdate) return true;

    // Check for significant field changes
    return (
      lastUpdate.checkInStatus !== update.checkInStatus ||
      lastUpdate.ringStatus !== update.ringStatus ||
      lastUpdate.sequence !== update.sequence ||
      lastUpdate.ringAssignment !== update.ringAssignment ||
      Math.abs(lastUpdate.updatedAt.getTime() - update.updatedAt.getTime()) > 1000 // 1 second threshold
    );
  }

  /**
   * Queue update for batched processing
   */
  private queueUpdate(update: EntryStatusUpdate): void {
    this.updateQueue.set(update.entryId, update);
    this.lastUpdates.set(update.entryId, update);

    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Set new batch timer
    this.batchTimer = setTimeout(() => {
      this.processBatchedUpdates();
    }, 500);
  }

  /**
   * Process batched updates
   */
  private processBatchedUpdates(): void {
    if (this.updateQueue.size === 0) return;

    const updates = Array.from(this.updateQueue.values());
    this.updateQueue.clear();

    // Notify all status update listeners
    updates.forEach(update => {
      this.statusUpdateListeners.forEach(listener => {
        try {
          listener(update);
        } catch (error) {
          console.error('Error in status update listener:', error);
        }
      });
    });

    // Broadcast to other clients
    this.broadcastUpdates(updates);

    console.log(`Processed ${updates.length} entry status updates`);
  }

  /**
   * Generate ring events based on status changes
   */
  private generateRingEvents(update: EntryStatusUpdate): void {
    const lastUpdate = this.lastUpdates.get(update.entryId);
    
    // Detect ring status transitions
    if (lastUpdate && lastUpdate.ringStatus !== update.ringStatus) {
      const event: RingStatusEvent = {
        type: this.mapRingStatusToEventType(update.ringStatus),
        entryId: update.entryId,
        armband: update.armband,
        dogName: update.dogName,
        ringAssignment: update.ringAssignment || 'Unknown',
        timestamp: update.updatedAt,
        sequence: update.sequence,
        metadata: {
          estimatedTime: update.estimatedCallTime,
          judgeId: update.judgeId,
          ringNumber: update.ringAssignment,
          priority: this.determinePriority(update.ringStatus),
        },
      };

      // Notify ring event listeners
      this.ringEventListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in ring event listener:', error);
        }
      });

      // Generate call notification if appropriate
      if (update.ringStatus === 'on-deck' || update.ringStatus === 'called') {
        this.generateCallNotification(update);
      }
    }
  }

  /**
   * Map ring status to event type
   */
  private mapRingStatusToEventType(ringStatus: EntryStatusUpdate['ringStatus']): RingStatusEvent['type'] {
    switch (ringStatus) {
      case 'called': return 'entry-called';
      case 'on-deck': return 'entry-on-deck';
      case 'in-ring': return 'entry-in-ring';
      case 'completed': return 'entry-completed';
      case 'absent': return 'entry-absent';
      case 'excused': return 'entry-excused';
      default: return 'entry-called';
    }
  }

  /**
   * Determine priority level for ring events
   */
  private determinePriority(ringStatus: EntryStatusUpdate['ringStatus']): 'medium' | 'critical' {
    return (ringStatus === 'called' || ringStatus === 'in-ring') ? 'critical' : 'medium';
  }

  /**
   * Generate call to ring notification
   */
  private generateCallNotification(update: EntryStatusUpdate): void {
    const notification: CallToRingNotification = {
      entryId: update.entryId,
      armband: update.armband,
      dogName: update.dogName,
      ownerName: update.ownerName,
      className: update.className,
      ringAssignment: update.ringAssignment || 'Ring',
      callType: update.ringStatus === 'on-deck' ? 'on-deck' : 'called',
      sequence: update.sequence,
      estimatedTime: update.estimatedCallTime || new Date(),
      urgency: update.ringStatus === 'called' ? 'urgent' : 'normal',
      timestamp: update.updatedAt,
    };

    // Notify call notification listeners
    this.callNotificationListeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error in call notification listener:', error);
      }
    });
  }

  /**
   * Broadcast updates to other clients
   */
  private async broadcastUpdates(updates: EntryStatusUpdate[]): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'entry-status-batch',
        payload: {
          updates,
          timestamp: Date.now(),
          showId: this.showId,
        },
        metadata: {
          priority: 'high',
          timestamp: Date.now(),
        },
      });

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { updatesCount: updates.length, showId: this.showId }
      });
    }
  }

  /**
   * Manually update entry ring status
   */
  async updateEntryRingStatus(
    entryId: string,
    ringStatus: EntryStatusUpdate['ringStatus'],
    metadata: {
      ringAssignment?: string;
      estimatedCallTime?: Date;
      actualCallTime?: Date;
      notes?: string;
      updatedBy: string;
    }
  ): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'manual-entry-update',
        payload: {
          entryId,
          ringStatus,
          ...metadata,
          timestamp: Date.now(),
        },
        metadata: {
          priority: 'critical',
          timestamp: Date.now(),
        },
      });

      console.log(`Manual entry update: ${entryId} -> ${ringStatus}`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { entryId, ringStatus, metadata, showId: this.showId }
      });
      throw error;
    }
  }

  /**
   * Update entry sequence/running order
   */
  async updateSequence(sequenceUpdate: SequenceUpdate): Promise<void> {
    try {
      await subscriptionManager.broadcast(this.channelName, {
        type: 'sequence-update',
        payload: sequenceUpdate,
        metadata: {
          priority: 'high',
          timestamp: Date.now(),
        },
      });

      // Notify sequence update listeners
      this.sequenceUpdateListeners.forEach(listener => {
        try {
          listener(sequenceUpdate);
        } catch (error) {
          console.error('Error in sequence update listener:', error);
        }
      });

      console.log(`Sequence updated for class ${sequenceUpdate.classId}: ${sequenceUpdate.entries.length} entries`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { sequenceUpdate, showId: this.showId }
      });
      throw error;
    }
  }

  /**
   * Event listener management
   */
  onStatusUpdate(listener: (update: EntryStatusUpdate) => void): () => void {
    this.statusUpdateListeners.add(listener);
    return () => this.statusUpdateListeners.delete(listener);
  }

  onRingEvent(listener: (event: RingStatusEvent) => void): () => void {
    this.ringEventListeners.add(listener);
    return () => this.ringEventListeners.delete(listener);
  }

  onSequenceUpdate(listener: (update: SequenceUpdate) => void): () => void {
    this.sequenceUpdateListeners.add(listener);
    return () => this.sequenceUpdateListeners.delete(listener);
  }

  onCallNotification(listener: (notification: CallToRingNotification) => void): () => void {
    this.callNotificationListeners.add(listener);
    return () => this.callNotificationListeners.delete(listener);
  }

  /**
   * Get current status for an entry
   */
  getEntryStatus(entryId: string): EntryStatusUpdate | undefined {
    return this.lastUpdates.get(entryId);
  }

  /**
   * Get all current entry statuses
   */
  getAllEntryStatuses(): EntryStatusUpdate[] {
    return Array.from(this.lastUpdates.values());
  }

  /**
   * Check if service is active
   */
  isServiceActive(): boolean {
    return this.isActive;
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    return {
      isActive: this.isActive,
      totalEntries: this.lastUpdates.size,
      queuedUpdates: this.updateQueue.size,
      statusUpdateListeners: this.statusUpdateListeners.size,
      ringEventListeners: this.ringEventListeners.size,
      sequenceUpdateListeners: this.sequenceUpdateListeners.size,
      callNotificationListeners: this.callNotificationListeners.size,
    };
  }
}

export default EntryStatusBroadcaster;