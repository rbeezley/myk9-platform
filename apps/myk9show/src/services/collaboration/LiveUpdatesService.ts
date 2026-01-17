import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';
import { presenceService } from './PresenceService';
import { logger } from '@/services/LoggingService';

export interface LiveUpdate {
  id: string;
  entityType: 'show' | 'dog' | 'person' | 'club' | 'entry' | 'class' | 'score';
  entityId: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed';
  data?: Record<string, unknown>;
  previousData?: Record<string, unknown>;
  userId: string;
  userName: string;
  timestamp: Date;
  showId?: string; // For scoped updates
}

export interface LiveUpdateSubscription {
  id: string;
  entityType?: string;
  entityId?: string;
  showId?: string;
  callback: (update: LiveUpdate) => void;
}

export class LiveUpdatesService {
  private static instance: LiveUpdatesService;
  private channels: Map<string, RealtimeChannel> = new Map();
  private subscriptions: Map<string, LiveUpdateSubscription> = new Map();
  private updateQueue: LiveUpdate[] = [];
  private isProcessing = false;
  private batchTimeout: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): LiveUpdatesService {
    if (!LiveUpdatesService.instance) {
      LiveUpdatesService.instance = new LiveUpdatesService();
    }
    return LiveUpdatesService.instance;
  }

  // Subscribe to live updates for a specific entity
  subscribeToEntity(
    entityType: string,
    entityId: string,
    callback: (update: LiveUpdate) => void,
    showId?: string
  ): string {
    const subscriptionId = `${entityType}:${entityId}:${Date.now()}`;
    
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      entityType,
      entityId,
      showId,
      callback
    });

    // Create or get channel for this entity type
    this.ensureChannel(entityType, showId);

    return subscriptionId;
  }

  // Subscribe to all updates for an entity type
  subscribeToEntityType(
    entityType: string,
    callback: (update: LiveUpdate) => void,
    showId?: string
  ): string {
    const subscriptionId = `${entityType}:*:${Date.now()}`;
    
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      entityType,
      showId,
      callback
    });

    this.ensureChannel(entityType, showId);

    return subscriptionId;
  }

  // Subscribe to all updates for a show
  subscribeToShow(
    showId: string,
    callback: (update: LiveUpdate) => void
  ): string {
    const subscriptionId = `show:${showId}:${Date.now()}`;
    
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      showId,
      callback
    });

    this.ensureChannel('show', showId);

    return subscriptionId;
  }

  // Unsubscribe from updates
  unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
    
    // Clean up channels if no more subscriptions
    this.cleanupUnusedChannels();
  }

  // Broadcast an update to all subscribers
  async broadcastUpdate(update: Omit<LiveUpdate, 'id' | 'timestamp'>): Promise<void> {
    const fullUpdate: LiveUpdate = {
      ...update,
      id: `${update.entityType}_${update.entityId}_${Date.now()}`,
      timestamp: new Date()
    };

    try {
      // Get appropriate channel
      const channelKey = this.getChannelKey(update.entityType, update.showId);
      const channel = this.channels.get(channelKey);

      if (channel) {
        await channel.send({
          type: 'broadcast',
          event: 'live_update',
          payload: fullUpdate
        });
      }

      // Also process locally for immediate feedback
      this.processUpdate(fullUpdate);

    } catch (error) {
      logger.error('Failed to broadcast update:', 'collaboration', {}, error as Error);
    }
  }

  // Broadcast entry count updates
  async broadcastEntryCountUpdate(
    showId: string,
    classId: string,
    newCount: number,
    previousCount: number
  ): Promise<void> {
    await this.broadcastUpdate({
      entityType: 'entry',
      entityId: classId,
      action: 'updated',
      data: { count: newCount },
      previousData: { count: previousCount },
      userId: presenceService.getActiveUsers().find(u => u.status === 'online')?.id || 'system',
      userName: 'System',
      showId
    });
  }

  // Broadcast scoring updates
  async broadcastScoringUpdate(
    showId: string,
    entryId: string,
    scoreData: Record<string, unknown>,
    judgeId: string,
    judgeName: string
  ): Promise<void> {
    await this.broadcastUpdate({
      entityType: 'score',
      entityId: entryId,
      action: 'updated',
      data: scoreData,
      userId: judgeId,
      userName: judgeName,
      showId
    });
  }

  // Broadcast judge assignment updates
  async broadcastJudgeAssignment(
    showId: string,
    classId: string,
    judgeId: string,
    judgeName: string,
    assignedBy: string
  ): Promise<void> {
    await this.broadcastUpdate({
      entityType: 'class',
      entityId: classId,
      action: 'updated',
      data: { judgeId, judgeName, assignedAt: new Date() },
      userId: assignedBy,
      userName: presenceService.getActiveUsers().find(u => u.id === assignedBy)?.name || 'Unknown',
      showId
    });
  }

  // Broadcast show status changes
  async broadcastShowStatusUpdate(
    showId: string,
    newStatus: string,
    previousStatus: string,
    userId: string
  ): Promise<void> {
    await this.broadcastUpdate({
      entityType: 'show',
      entityId: showId,
      action: 'status_changed',
      data: { status: newStatus },
      previousData: { status: previousStatus },
      userId,
      userName: presenceService.getActiveUsers().find(u => u.id === userId)?.name || 'Unknown',
      showId
    });
  }

  private ensureChannel(entityType: string, showId?: string): void {
    const channelKey = this.getChannelKey(entityType, showId);
    
    if (!this.channels.has(channelKey)) {
      const channel = supabase.channel(channelKey);
      
      channel
        .on('broadcast', { event: 'live_update' }, (payload) => {
          this.handleIncomingUpdate(payload.payload as LiveUpdate);
        })
        .subscribe();

      this.channels.set(channelKey, channel);
    }
  }

  private getChannelKey(entityType: string, showId?: string): string {
    return showId ? `live_updates:${showId}:${entityType}` : `live_updates:${entityType}`;
  }

  private handleIncomingUpdate(update: LiveUpdate): void {
    // Add to queue for batch processing
    this.updateQueue.push(update);
    
    if (!this.isProcessing) {
      this.processBatch();
    }
  }

  private processBatch(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.isProcessing = true;
      
      const updates = [...this.updateQueue];
      this.updateQueue = [];

      // Process updates in batches to avoid overwhelming the UI
      updates.forEach(update => this.processUpdate(update));
      
      this.isProcessing = false;
      
      // Process any new updates that came in
      if (this.updateQueue.length > 0) {
        this.processBatch();
      }
    }, 100); // 100ms debounce
  }

  private processUpdate(update: LiveUpdate): void {
    // Find matching subscriptions
    const matchingSubscriptions = Array.from(this.subscriptions.values()).filter(sub => {
      // Check entity type match
      if (sub.entityType && sub.entityType !== update.entityType) {
        return false;
      }

      // Check entity ID match (if specified)
      if (sub.entityId && sub.entityId !== update.entityId) {
        return false;
      }

      // Check show ID match (if specified)
      if (sub.showId && sub.showId !== update.showId) {
        return false;
      }

      return true;
    });

    // Notify matching subscribers
    matchingSubscriptions.forEach(sub => {
      try {
        sub.callback(update);
      } catch (error) {
        logger.error('Live update callback error:', 'collaboration', {}, error as Error);
      }
    });
  }

  private cleanupUnusedChannels(): void {
    // Remove channels that have no active subscriptions
    for (const [channelKey, channel] of this.channels.entries()) {
      const hasActiveSubscriptions = Array.from(this.subscriptions.values()).some(sub => {
        const expectedKey = this.getChannelKey(sub.entityType || '', sub.showId);
        return expectedKey === channelKey;
      });

      if (!hasActiveSubscriptions) {
        channel.unsubscribe();
        this.channels.delete(channelKey);
      }
    }
  }

  async cleanup(): Promise<void> {
    // Clear batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Unsubscribe from all channels
    for (const channel of this.channels.values()) {
      await channel.unsubscribe();
    }

    this.channels.clear();
    this.subscriptions.clear();
    this.updateQueue = [];
  }

  // Utility methods for common update patterns
  getRecentUpdates(_entityType?: string, _entityId?: string, _limit = 10): LiveUpdate[] {
    // This would typically come from a database query
    // For now, return empty array as this is handled by the queue
    return [];
  }

  // Get statistics about live updates
  getUpdateStats(): {
    activeChannels: number;
    activeSubscriptions: number;
    queuedUpdates: number;
  } {
    return {
      activeChannels: this.channels.size,
      activeSubscriptions: this.subscriptions.size,
      queuedUpdates: this.updateQueue.length
    };
  }
}

export const liveUpdatesService = LiveUpdatesService.getInstance();