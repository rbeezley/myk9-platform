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
import type { 
  RealtimeSubscription, 
  RealtimeEventCallback, 
  RealtimeEventType,
  PresenceTrackingData,
  LiveScoringSession,
  Priority
} from '../../types/realtime-types';

export interface SubscriptionConfig {
  table: string;
  filter?: string;
  events?: Array<'INSERT' | 'UPDATE' | 'DELETE' | '*'>;
  enablePresence?: boolean;
  enableBroadcast?: boolean;
  autoCleanup?: boolean;
  priority?: Priority;
  batchUpdates?: boolean;
  bufferTime?: number; // ms to buffer updates
}

export interface SubscriptionMetrics {
  subscriptionId: string;
  messagesReceived: number;
  messagesProcessed: number;
  averageProcessingTime: number;
  errorCount: number;
  lastActivity: Date | null;
  isActive: boolean;
  memoryUsage: number;
}

export interface BroadcastEvent {
  type: string;
  payload: Record<string, unknown>;
  metadata?: {
    timestamp: number;
    userId?: string;
    sessionId?: string;
    priority?: Priority;
  };
}

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

  /**
   * Subscribe to real-time updates for a table
   */
  async subscribe<T = unknown>(
    subscriptionId: string,
    config: SubscriptionConfig,
    callback: RealtimeEventCallback<T>
  ): Promise<string> {
    // Check if subscription already exists
    if (this.subscriptions.has(subscriptionId)) {
      console.warn(`Subscription ${subscriptionId} already exists`);
      return subscriptionId;
    }

    try {
      const channelName = this.generateChannelName(config);
      let channel = this.channels.get(channelName);

      // Create channel if it doesn't exist
      if (!channel) {
        channel = await realtimeClient.createChannel(channelName, {
          table: config.table,
          filter: config.filter,
          enablePresence: config.enablePresence,
          enableBroadcast: config.enableBroadcast,
          lowLatency: config.priority === 'critical',
        });
        
        this.channels.set(channelName, channel);
      }

      // Setup subscription
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

      // Setup database change listener
      if (config.events?.includes('*') || config.events?.some(e => ['INSERT', 'UPDATE', 'DELETE'].includes(e))) {
        const events = config.events?.includes('*') ? '*' : config.events?.join(',') || '*';
        
        channel.on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any,
          {
            event: events as '*' | 'INSERT' | 'UPDATE' | 'DELETE',
            schema: 'public',
            table: config.table,
            ...(config.filter && { filter: config.filter }),
          },
          (payload) => {
            this.handleDatabaseChange(subscriptionId, payload as Record<string, unknown>, config);
          }
        );
      }

      // Setup presence tracking if enabled
      if (config.enablePresence) {
        this.setupPresenceTracking(subscriptionId, channel);
      }

      // Setup broadcast listener if enabled
      if (config.enableBroadcast) {
        this.setupBroadcastListener(subscriptionId, channel);
      }

      // Store subscription and initialize metrics
      this.subscriptions.set(subscriptionId, subscription);
      this.initializeMetrics(subscriptionId);

      console.log(`Subscription ${subscriptionId} created for table ${config.table}`);
      return subscriptionId;

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { subscriptionId, config }
      });
      throw error;
    }
  }

  /**
   * Unsubscribe from real-time updates
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      console.warn(`Subscription ${subscriptionId} not found`);
      return;
    }

    try {
      // Mark as inactive
      subscription.isActive = false;

      // Clear batch timer if exists
      const batchTimer = this.batchTimers.get(subscriptionId);
      if (batchTimer) {
        clearTimeout(batchTimer);
        this.batchTimers.delete(subscriptionId);
      }

      // Process any remaining batched updates
      this.processBatchedUpdates(subscriptionId);

      // Remove from collections
      this.subscriptions.delete(subscriptionId);
      this.metrics.delete(subscriptionId);
      this.batchBuffers.delete(subscriptionId);
      this.presenceStates.delete(subscriptionId);

      // Check if we can cleanup the channel
      await this.cleanupChannelIfUnused(subscription.channelName);

      console.log(`Subscription ${subscriptionId} removed`);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { subscriptionId }
      });
    }
  }

  /**
   * Subscribe to presence updates for user tracking
   */
  async subscribeToPresence(
    channelName: string,
    callback: (presences: PresenceTrackingData[]) => void
  ): Promise<string> {
    const subscriptionId = `presence-${channelName}`;
    
    const channel = await realtimeClient.createChannel(channelName, {
      enablePresence: true,
    });

    // Track presence joins
    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log('User joined:', key, newPresences);
      this.updatePresenceState(channelName, newPresences);
      callback(this.getPresenceState(channelName));
    });

    // Track presence leaves
    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      console.log('User left:', key, leftPresences);
      this.removeFromPresenceState(channelName, leftPresences);
      callback(this.getPresenceState(channelName));
    });

    // Track presence sync
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      this.syncPresenceState(channelName, state);
      callback(this.getPresenceState(channelName));
    });

    this.channels.set(channelName, channel);
    return subscriptionId;
  }

  /**
   * Track user presence in a channel
   */
  async trackPresence(
    channelName: string,
    userData: PresenceTrackingData
  ): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`);
    }

    try {
      await channel.track(userData);
      console.log(`Tracking presence for user ${userData.user_id} in ${channelName}`);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { channelName, userData }
      });
      throw error;
    }
  }

  /**
   * Stop tracking user presence
   */
  async untrackPresence(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      console.warn(`Channel ${channelName} not found for untracking`);
      return;
    }

    try {
      await channel.untrack();
      console.log(`Stopped tracking presence in ${channelName}`);
    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { channelName }
      });
    }
  }

  /**
   * Broadcast message to all users in a channel
   */
  async broadcast(
    channelName: string,
    event: BroadcastEvent
  ): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`);
    }

    const payload = {
      ...event,
      metadata: {
        timestamp: Date.now(),
        ...event.metadata,
      },
    };

    try {
      await channel.send({
        type: 'broadcast',
        event: event.type,
        payload,
      });

      // Update metrics
      const metrics = this.metrics.get(channelName);
      if (metrics) {
        metrics.messagesProcessed++;
      }

      console.log(`Broadcast sent to ${channelName}:`, event.type);

    } catch (error) {
      errorMonitor.captureError(error as Error, {
        additionalData: { channelName, event }
      });
      throw error;
    }
  }

  /**
   * Subscribe to live scoring session updates
   */
  async subscribeToScoringSession(
    sessionId: string,
    callback: (session: LiveScoringSession) => void
  ): Promise<string> {
    const subscriptionId = `scoring-${sessionId}`;
    
    return this.subscribe(
      subscriptionId,
      {
        table: 'live_scoring_sessions',
        filter: `session_id=eq.${sessionId}`,
        events: ['UPDATE'],
        priority: 'critical',
        batchUpdates: false, // Real-time scoring needs immediate updates
      },
      (event) => {
        if (event.data) {
          callback(event.data as LiveScoringSession);
        }
      }
    );
  }

  /**
   * Subscribe to entry check-ins
   */
  async subscribeToCheckIns(
    showId: string,
    callback: (checkIn: Record<string, unknown>) => void
  ): Promise<string> {
    const subscriptionId = `checkins-${showId}`;
    
    return this.subscribe(
      subscriptionId,
      {
        table: 'entry_checkins',
        filter: `show_id=eq.${showId}`,
        events: ['INSERT', 'UPDATE'],
        priority: 'high',
        batchUpdates: true,
        bufferTime: 1000, // Buffer for 1 second to reduce UI thrashing
      },
      (event) => {
        if (event.data && typeof event.data === 'object' && event.data !== null) {
          callback(event.data as Record<string, unknown>);
        }
      }
    );
  }

  /**
   * Wrap callback with metrics and error handling
   */
  private wrapCallback<T>(
    subscriptionId: string,
    callback: RealtimeEventCallback<T>,
    config: SubscriptionConfig
  ): RealtimeEventCallback<T> {
    return (event) => {
      const startTime = performance.now();
      const metrics = this.metrics.get(subscriptionId);

      try {
        // Handle batching if enabled
        if (config.batchUpdates) {
          this.addToBatch(subscriptionId, event as unknown as Record<string, unknown>, callback, config.bufferTime || 500);
        } else {
          callback(event);
        }

        // Update metrics
        if (metrics) {
          metrics.messagesReceived++;
          metrics.messagesProcessed++;
          metrics.lastActivity = new Date();
          
          const processingTime = performance.now() - startTime;
          metrics.averageProcessingTime = 
            (metrics.averageProcessingTime + processingTime) / 2;
        }

      } catch (error) {
        if (metrics) {
          metrics.errorCount++;
        }

        errorMonitor.captureError(error as Error, {
          additionalData: { subscriptionId, event }
        });
      }
    };
  }

  /**
   * Handle database change events
   */
  private handleDatabaseChange(
    subscriptionId: string,
    payload: Record<string, unknown>,
    config: SubscriptionConfig
  ): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription || !subscription.isActive) return;

    const event = {
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
    };

    subscription.callback(event);
  }

  /**
   * Setup presence tracking for a subscription
   */
  private setupPresenceTracking(
    subscriptionId: string,
    channel: RealtimeChannel
  ): void {
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      this.presenceStates.set(subscriptionId, this.parsePresenceState(state));
    });

    channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      console.log('New presences:', newPresences);
    });

    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      console.log('Left presences:', leftPresences);
    });
  }

  /**
   * Setup broadcast listener for a subscription
   */
  private setupBroadcastListener(
    subscriptionId: string,
    channel: RealtimeChannel
  ): void {
    channel.on('broadcast', { event: '*' }, (payload) => {
      const subscription = this.subscriptions.get(subscriptionId);
      if (!subscription || !subscription.isActive) return;

      const event = {
        event: 'broadcast' as RealtimeEventType,
        payload: payload.payload || payload,
        timestamp: Date.now(),
        channel: subscription.channelName,
      };

      subscription.callback(event);
    });
  }

  /**
   * Add event to batch for processing
   */
  private addToBatch<T>(
    subscriptionId: string,
    event: Record<string, unknown>,
    callback: RealtimeEventCallback<T>,
    bufferTime: number
  ): void {
    // Initialize buffer if needed
    if (!this.batchBuffers.has(subscriptionId)) {
      this.batchBuffers.set(subscriptionId, []);
    }

    // Add to buffer
    this.batchBuffers.get(subscriptionId)!.push({ event, callback });

    // Clear existing timer
    const existingTimer = this.batchTimers.get(subscriptionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.processBatchedUpdates(subscriptionId);
    }, bufferTime);

    this.batchTimers.set(subscriptionId, timer);
  }

  /**
   * Process batched updates
   */
  private processBatchedUpdates(subscriptionId: string): void {
    const buffer = this.batchBuffers.get(subscriptionId);
    if (!buffer || buffer.length === 0) return;

    // Process all batched events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buffer.forEach(({ event, callback }: any) => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error processing batched event:', error);
      }
    });

    // Clear buffer
    this.batchBuffers.set(subscriptionId, []);
  }

  /**
   * Generate channel name based on configuration
   */
  private generateChannelName(config: SubscriptionConfig): string {
    const parts = [config.table];
    if (config.filter) {
      parts.push(encodeURIComponent(config.filter));
    }
    return parts.join('-');
  }

  /**
   * Initialize metrics for a subscription
   */
  private initializeMetrics(subscriptionId: string): void {
    this.metrics.set(subscriptionId, {
      subscriptionId,
      messagesReceived: 0,
      messagesProcessed: 0,
      averageProcessingTime: 0,
      errorCount: 0,
      lastActivity: null,
      isActive: true,
      memoryUsage: 0,
    });
  }

  /**
   * Update presence state
   */
  private updatePresenceState(channelName: string, newPresences: Record<string, unknown>[]): void {
    const current = this.presenceStates.get(channelName) || [];
    const parsed = this.parsePresenceState({ [channelName]: newPresences });
    this.presenceStates.set(channelName, [...current, ...parsed]);
  }

  /**
   * Remove from presence state
   */
  private removeFromPresenceState(channelName: string, leftPresences: Record<string, unknown>[]): void {
    const current = this.presenceStates.get(channelName) || [];
    const leftIds = leftPresences.map(p => p.user_id);
    const filtered = current.filter(p => !leftIds.includes(p.user_id));
    this.presenceStates.set(channelName, filtered);
  }

  /**
   * Sync presence state
   */
  private syncPresenceState(channelName: string, state: Record<string, unknown>): void {
    const parsed = this.parsePresenceState(state);
    this.presenceStates.set(channelName, parsed);
  }

  /**
   * Parse presence state from Supabase format
   */
  private parsePresenceState(state: Record<string, unknown>): PresenceTrackingData[] {
    const presences: PresenceTrackingData[] = [];
    
    Object.values(state).forEach((channelPresences: unknown) => {
      if (Array.isArray(channelPresences)) {
        channelPresences.forEach(presence => {
          presences.push(presence as PresenceTrackingData);
        });
      }
    });

    return presences;
  }

  /**
   * Get presence state for a channel
   */
  private getPresenceState(channelName: string): PresenceTrackingData[] {
    return this.presenceStates.get(channelName) || [];
  }

  /**
   * Cleanup unused channels
   */
  private async cleanupChannelIfUnused(channelName: string): Promise<void> {
    const isUsed = Array.from(this.subscriptions.values())
      .some(sub => sub.channelName === channelName && sub.isActive);

    if (!isUsed) {
      await realtimeClient.removeChannel(channelName);
      this.channels.delete(channelName);
      console.log(`Cleaned up unused channel: ${channelName}`);
    }
  }

  /**
   * Start cleanup routine for inactive subscriptions
   */
  private startCleanupRoutine(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveSubscriptions();
    }, 60000); // Clean up every minute
  }

  /**
   * Cleanup inactive subscriptions
   */
  private cleanupInactiveSubscriptions(): void {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

    this.metrics.forEach((metrics, subscriptionId) => {
      if (metrics.lastActivity && metrics.lastActivity < cutoff && metrics.isActive) {
        console.log(`Auto-cleaning inactive subscription: ${subscriptionId}`);
        this.unsubscribe(subscriptionId);
      }
    });
  }

  /**
   * Get subscription metrics
   */
  getMetrics(subscriptionId?: string): SubscriptionMetrics | SubscriptionMetrics[] {
    if (subscriptionId) {
      return this.metrics.get(subscriptionId) || {} as SubscriptionMetrics;
    }
    return Array.from(this.metrics.values());
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): RealtimeSubscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.isActive);
  }

  /**
   * Get presence state for all channels
   */
  getAllPresenceStates(): Map<string, PresenceTrackingData[]> {
    return new Map(this.presenceStates);
  }

  /**
   * Cleanup all subscriptions and resources
   */
  async cleanup(): Promise<void> {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear all batch timers
    this.batchTimers.forEach(timer => clearTimeout(timer));
    this.batchTimers.clear();

    // Process any remaining batched updates
    this.batchBuffers.forEach((_, subscriptionId) => {
      this.processBatchedUpdates(subscriptionId);
    });

    // Unsubscribe from all subscriptions
    const subscriptionIds = Array.from(this.subscriptions.keys());
    await Promise.all(subscriptionIds.map(id => this.unsubscribe(id)));

    // Clear all collections
    this.subscriptions.clear();
    this.channels.clear();
    this.metrics.clear();
    this.batchBuffers.clear();
    this.presenceStates.clear();

    console.log('Subscription manager cleaned up');
  }
}

// Create singleton instance
export const subscriptionManager = new SubscriptionManager();

export default SubscriptionManager;