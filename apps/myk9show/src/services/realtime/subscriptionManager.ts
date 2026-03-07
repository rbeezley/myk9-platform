/**
 * Subscription Manager for Real-time Data
 * Phase 6.1: Real-time Infrastructure
 *
 * Manages real-time subscriptions with intelligent lifecycle management,
 * automatic cleanup, and performance optimization.
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { realtimeClient } from './realtimeClient';
import { errorMonitor } from '../../lib/errorMonitoring';
import { logger } from '../../services/LoggingService';
import type {
  RealtimeSubscription,
  RealtimeEventCallback,
  RealtimeEventType,
  PresenceTrackingData,
  LiveScoringSession,
} from '../../types/realtime-types';
import type {
  SubscriptionConfig,
  SubscriptionMetrics,
  BroadcastEvent,
} from './subscriptionManager.types';
import {
  generateChannelName,
  createInitialMetrics,
  parsePresenceState,
} from './subscriptionManager.helpers';

// Re-export types for backwards compatibility
export type {
  SubscriptionConfig,
  SubscriptionMetrics,
  BroadcastEvent,
} from './subscriptionManager.types';

/**
 * Manages real-time subscriptions with advanced lifecycle and performance features
 */
export class SubscriptionManager {
  private subscriptions = new Map<string, RealtimeSubscription>();
  private channels = new Map<string, RealtimeChannel>();
  private metrics = new Map<string, SubscriptionMetrics>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private batchTimers = new Map<string, NodeJS.Timeout>();
  private batchBuffers = new Map<string, unknown[]>();
  private presenceStates = new Map<string, PresenceTrackingData[]>();

  constructor() {
    this.startCleanupRoutine();
  }

  /** Subscribe to real-time updates for a table */
  async subscribe<T = unknown>(
    subscriptionId: string,
    config: SubscriptionConfig,
    callback: RealtimeEventCallback<T>
  ): Promise<string> {
    if (this.subscriptions.has(subscriptionId)) {
      logger.warn('Subscription already exists', 'realtime', { subscriptionId });
      return subscriptionId;
    }

    try {
      const channelName = generateChannelName(config);
      let channel = this.channels.get(channelName);

      if (!channel) {
        const channelOptions: {
          table?: string;
          filter?: string;
          enablePresence?: boolean;
          enableBroadcast?: boolean;
          lowLatency?: boolean;
        } = {
          table: config.table,
          lowLatency: config.priority === 'critical',
        };
        if (config.filter !== undefined) channelOptions.filter = config.filter;
        if (config.enablePresence !== undefined)
          channelOptions.enablePresence = config.enablePresence;
        if (config.enableBroadcast !== undefined)
          channelOptions.enableBroadcast = config.enableBroadcast;

        channel = await realtimeClient.createChannel(channelName, channelOptions);
        this.channels.set(channelName, channel);
      }

      const subscription: RealtimeSubscription = {
        id: subscriptionId,
        channelName,
        table: config.table,
        filter: config.filter,
        events: config.events || ['*'],
        callback: this.wrapCallback(subscriptionId, callback, config) as (payload: unknown) => void,
        isActive: true,
        createdAt: new Date(),
      };

      if (
        config.events?.includes('*') ||
        config.events?.some(e => ['INSERT', 'UPDATE', 'DELETE'].includes(e))
      ) {
        const events = config.events?.includes('*') ? '*' : config.events?.join(',') || '*';
        channel.on(
          'postgres_changes' as 'system',
          {
            event: events as '*' | 'INSERT' | 'UPDATE' | 'DELETE',
            schema: 'public',
            table: config.table,
            ...(config.filter !== undefined && { filter: config.filter }),
          },
          payload => {
            this.handleDatabaseChange(subscriptionId, payload as Record<string, unknown>, config);
          }
        );
      }

      if (config.enablePresence) this.setupPresenceTracking(subscriptionId, channel);
      if (config.enableBroadcast) this.setupBroadcastListener(subscriptionId, channel);

      this.subscriptions.set(subscriptionId, subscription);
      this.metrics.set(subscriptionId, createInitialMetrics(subscriptionId));

      logger.debug('Subscription created', 'realtime', { subscriptionId, table: config.table });
      return subscriptionId;
    } catch (error) {
      errorMonitor.captureError(error as Error, { additionalData: { subscriptionId, config } });
      throw error;
    }
  }

  /** Unsubscribe from real-time updates */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      logger.warn('Subscription not found', 'realtime', { subscriptionId });
      return;
    }

    try {
      subscription.isActive = false;
      const batchTimer = this.batchTimers.get(subscriptionId);
      if (batchTimer) {
        clearTimeout(batchTimer);
        this.batchTimers.delete(subscriptionId);
      }
      this.processBatchedUpdates(subscriptionId);
      this.subscriptions.delete(subscriptionId);
      this.metrics.delete(subscriptionId);
      this.batchBuffers.delete(subscriptionId);
      this.presenceStates.delete(subscriptionId);
      await this.cleanupChannelIfUnused(subscription.channelName);
      logger.debug('Subscription removed', 'realtime', { subscriptionId });
    } catch (error) {
      errorMonitor.captureError(error as Error, { additionalData: { subscriptionId } });
    }
  }

  /** Subscribe to presence updates for user tracking */
  async subscribeToPresence(
    channelName: string,
    callback: (presences: PresenceTrackingData[]) => void
  ): Promise<string> {
    const subscriptionId = `presence-${channelName}`;
    const channel = await realtimeClient.createChannel(channelName, { enablePresence: true });

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      logger.debug('User joined', 'realtime', { key, presenceCount: newPresences?.length });
      this.updatePresenceState(channelName, newPresences);
      callback(this.getPresenceState(channelName));
    });

    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      logger.debug('User left', 'realtime', { key, presenceCount: leftPresences?.length });
      this.removeFromPresenceState(channelName, leftPresences);
      callback(this.getPresenceState(channelName));
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      this.syncPresenceState(channelName, state);
      callback(this.getPresenceState(channelName));
    });

    this.channels.set(channelName, channel);
    return subscriptionId;
  }

  /** Track user presence in a channel */
  async trackPresence(channelName: string, userData: PresenceTrackingData): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) throw new Error(`Channel ${channelName} not found`);
    try {
      await channel.track(userData);
      logger.debug('Tracking presence', 'realtime', { userId: userData.user_id, channelName });
    } catch (error) {
      errorMonitor.captureError(error as Error, { additionalData: { channelName, userData } });
      throw error;
    }
  }

  /** Stop tracking user presence */
  async untrackPresence(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      logger.warn('Channel not found for untracking', 'realtime', { channelName });
      return;
    }
    try {
      await channel.untrack();
      logger.debug('Stopped tracking presence', 'realtime', { channelName });
    } catch (error) {
      errorMonitor.captureError(error as Error, { additionalData: { channelName } });
    }
  }

  /** Broadcast message to all users in a channel */
  async broadcast(channelName: string, event: BroadcastEvent): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) throw new Error(`Channel ${channelName} not found`);

    const payload = {
      ...event,
      metadata: { timestamp: Date.now(), ...event.metadata },
    };

    try {
      await channel.send({ type: 'broadcast', event: event.type, payload });
      const metrics = this.metrics.get(channelName);
      if (metrics) metrics.messagesProcessed++;
      logger.debug('Broadcast sent', 'realtime', { channelName, eventType: event.type });
    } catch (error) {
      errorMonitor.captureError(error as Error, { additionalData: { channelName, event } });
      throw error;
    }
  }

  /** Subscribe to live scoring session updates */
  async subscribeToScoringSession(
    sessionId: string,
    callback: (session: LiveScoringSession) => void
  ): Promise<string> {
    return this.subscribe(
      `scoring-${sessionId}`,
      {
        table: 'live_scoring_sessions',
        filter: `session_id=eq.${sessionId}`,
        events: ['UPDATE'],
        priority: 'critical',
        batchUpdates: false,
      },
      event => {
        if (event.data) callback(event.data as LiveScoringSession);
      }
    );
  }

  /** Subscribe to entry check-ins */
  async subscribeToCheckIns(
    showId: string,
    callback: (checkIn: Record<string, unknown>) => void
  ): Promise<string> {
    return this.subscribe(
      `checkins-${showId}`,
      {
        table: 'entry_checkins',
        filter: `show_id=eq.${showId}`,
        events: ['INSERT', 'UPDATE'],
        priority: 'high',
        batchUpdates: true,
        bufferTime: 1000,
      },
      event => {
        if (event.data && typeof event.data === 'object' && event.data !== null) {
          callback(event.data as Record<string, unknown>);
        }
      }
    );
  }

  /** Wrap callback with metrics and error handling */
  private wrapCallback<T>(
    subscriptionId: string,
    callback: RealtimeEventCallback<T>,
    config: SubscriptionConfig
  ): RealtimeEventCallback<T> {
    return event => {
      const startTime = performance.now();
      const metrics = this.metrics.get(subscriptionId);
      try {
        if (config.batchUpdates) {
          this.addToBatch(
            subscriptionId,
            event as unknown as Record<string, unknown>,
            callback,
            config.bufferTime || 500
          );
        } else {
          callback(event);
        }
        if (metrics) {
          metrics.messagesReceived++;
          metrics.messagesProcessed++;
          metrics.lastActivity = new Date();
          const processingTime = performance.now() - startTime;
          metrics.averageProcessingTime = (metrics.averageProcessingTime + processingTime) / 2;
        }
      } catch (error) {
        if (metrics) metrics.errorCount++;
        errorMonitor.captureError(error as Error, { additionalData: { subscriptionId, event } });
      }
    };
  }

  /** Handle database change events */
  private handleDatabaseChange(
    subscriptionId: string,
    payload: Record<string, unknown>,
    config: SubscriptionConfig
  ): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription || !subscription.isActive) return;

    subscription.callback({
      event: `${config.table}-${String(payload.eventType).toLowerCase()}` as RealtimeEventType,
      payload: {
        eventType: payload.eventType,
        new: payload.new,
        old: payload.old,
        table: config.table,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
      channel: subscription.channelName,
    });
  }

  /** Setup presence tracking for a subscription */
  private setupPresenceTracking(subscriptionId: string, channel: RealtimeChannel): void {
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      this.presenceStates.set(subscriptionId, parsePresenceState(state));
    });
    channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      logger.debug('New presences joined', 'realtime', { count: newPresences?.length });
    });
    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      logger.debug('Presences left', 'realtime', { count: leftPresences?.length });
    });
  }

  /** Setup broadcast listener for a subscription */
  private setupBroadcastListener(subscriptionId: string, channel: RealtimeChannel): void {
    channel.on('broadcast', { event: '*' }, payload => {
      const subscription = this.subscriptions.get(subscriptionId);
      if (!subscription || !subscription.isActive) return;
      subscription.callback({
        event: 'broadcast' as RealtimeEventType,
        payload: payload.payload || payload,
        timestamp: Date.now(),
        channel: subscription.channelName,
      });
    });
  }

  /** Add event to batch for processing */
  private addToBatch<T>(
    subscriptionId: string,
    event: Record<string, unknown>,
    callback: RealtimeEventCallback<T>,
    bufferTime: number
  ): void {
    if (!this.batchBuffers.has(subscriptionId)) this.batchBuffers.set(subscriptionId, []);
    this.batchBuffers.get(subscriptionId)!.push({ event, callback });

    const existingTimer = this.batchTimers.get(subscriptionId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => this.processBatchedUpdates(subscriptionId), bufferTime);
    this.batchTimers.set(subscriptionId, timer);
  }

  /** Process batched updates */
  private processBatchedUpdates(subscriptionId: string): void {
    const buffer = this.batchBuffers.get(subscriptionId);
    if (!buffer || buffer.length === 0) return;

    buffer.forEach((item: unknown) => {
      const { event, callback } = item as { event: unknown; callback: (event: unknown) => void };
      try {
        callback(event);
      } catch (error) {
        logger.error('Error processing batched event', 'realtime', {}, error as Error);
      }
    });
    this.batchBuffers.set(subscriptionId, []);
  }

  /** Update presence state */
  private updatePresenceState(channelName: string, newPresences: Record<string, unknown>[]): void {
    const current = this.presenceStates.get(channelName) || [];
    const parsed = parsePresenceState({ [channelName]: newPresences });
    this.presenceStates.set(channelName, [...current, ...parsed]);
  }

  /** Remove from presence state */
  private removeFromPresenceState(
    channelName: string,
    leftPresences: Record<string, unknown>[]
  ): void {
    const current = this.presenceStates.get(channelName) || [];
    const leftIds = leftPresences.map(p => p.user_id);
    this.presenceStates.set(
      channelName,
      current.filter(p => !leftIds.includes(p.user_id))
    );
  }

  /** Sync presence state */
  private syncPresenceState(channelName: string, state: Record<string, unknown>): void {
    this.presenceStates.set(channelName, parsePresenceState(state));
  }

  /** Get presence state for a channel */
  private getPresenceState(channelName: string): PresenceTrackingData[] {
    return this.presenceStates.get(channelName) || [];
  }

  /** Cleanup unused channels */
  private async cleanupChannelIfUnused(channelName: string): Promise<void> {
    const isUsed = Array.from(this.subscriptions.values()).some(
      sub => sub.channelName === channelName && sub.isActive
    );
    if (!isUsed) {
      await realtimeClient.removeChannel(channelName);
      this.channels.delete(channelName);
      logger.debug('Cleaned up unused channel', 'realtime', { channelName });
    }
  }

  /** Start cleanup routine for inactive subscriptions */
  private startCleanupRoutine(): void {
    this.cleanupTimer = setInterval(() => this.cleanupInactiveSubscriptions(), 60000);
  }

  /** Cleanup inactive subscriptions */
  private cleanupInactiveSubscriptions(): void {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    this.metrics.forEach((metrics, subscriptionId) => {
      if (metrics.lastActivity && metrics.lastActivity < cutoff && metrics.isActive) {
        logger.debug('Auto-cleaning inactive subscription', 'realtime', { subscriptionId });
        this.unsubscribe(subscriptionId);
      }
    });
  }

  /** Get subscription metrics */
  getMetrics(subscriptionId?: string): SubscriptionMetrics | SubscriptionMetrics[] {
    if (subscriptionId) return this.metrics.get(subscriptionId) || ({} as SubscriptionMetrics);
    return Array.from(this.metrics.values());
  }

  /** Get all active subscriptions */
  getActiveSubscriptions(): RealtimeSubscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.isActive);
  }

  /** Get presence state for all channels */
  getAllPresenceStates(): Map<string, PresenceTrackingData[]> {
    return new Map(this.presenceStates);
  }

  /** Cleanup all subscriptions and resources */
  async cleanup(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.batchTimers.forEach(timer => clearTimeout(timer));
    this.batchTimers.clear();
    this.batchBuffers.forEach((_, subscriptionId) => this.processBatchedUpdates(subscriptionId));

    const subscriptionIds = Array.from(this.subscriptions.keys());
    await Promise.all(subscriptionIds.map(id => this.unsubscribe(id)));

    this.subscriptions.clear();
    this.channels.clear();
    this.metrics.clear();
    this.batchBuffers.clear();
    this.presenceStates.clear();
    logger.info('Subscription manager cleaned up', 'realtime');
  }
}

// Create singleton instance
export const subscriptionManager = new SubscriptionManager();

export default SubscriptionManager;
