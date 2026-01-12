import { EventEmitter } from 'events';
import { logger } from '@/services/LoggingService';

export interface RealtimeEvent {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  data: unknown;
  timestamp: Date;
  source: 'local' | 'remote';
  userId?: string;
  sessionId?: string;
}

export interface EventFilter {
  types?: string[];
  entityTypes?: string[];
  entityIds?: string[];
  sources?: ('local' | 'remote')[];
  userIds?: string[];
}

export interface EventSubscription {
  id: string;
  filter: EventFilter;
  callback: (event: RealtimeEvent) => void;
  priority: number;
  once: boolean;
}

export class RealtimeEventBus extends EventEmitter {
  private static instance: RealtimeEventBus;
  private subscriptions = new Map<string, EventSubscription>();
  private eventHistory: RealtimeEvent[] = [];
  private maxHistorySize = 1000;
  private eventSequence = 0;

  private constructor() {
    super();
    this.setMaxListeners(100); // Increase max listeners limit
  }

  static getInstance(): RealtimeEventBus {
    if (!RealtimeEventBus.instance) {
      RealtimeEventBus.instance = new RealtimeEventBus();
    }
    return RealtimeEventBus.instance;
  }

  /**
   * Emit a realtime event
   */
  emitRealtimeEvent(event: Omit<RealtimeEvent, 'id' | 'timestamp'>): void {
    const realtimeEvent: RealtimeEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date()
    };

    // Add to history
    this.addToHistory(realtimeEvent);

    // Process subscriptions
    this.processEvent(realtimeEvent);

    // Emit standard EventEmitter event
    this.emit('realtime-event', realtimeEvent);
    this.emit(`realtime-event:${event.type}`, realtimeEvent);
    this.emit(`realtime-event:${event.entityType}`, realtimeEvent);
  }

  /**
   * Subscribe to realtime events with filtering
   */
  subscribe(
    filter: EventFilter,
    callback: (event: RealtimeEvent) => void,
    options: { priority?: number; once?: boolean } = {}
  ): string {
    const subscriptionId = this.generateSubscriptionId();
    
    const subscription: EventSubscription = {
      id: subscriptionId,
      filter,
      callback,
      priority: options.priority || 0,
      once: options.once || false
    };

    this.subscriptions.set(subscriptionId, subscription);

    return subscriptionId;
  }

  /**
   * Unsubscribe from realtime events
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Subscribe to specific event types
   */
  onScoreUpdate(callback: (event: RealtimeEvent) => void): string {
    return this.subscribe(
      { types: ['score-created', 'score-updated', 'score-deleted'] },
      callback
    );
  }

  onPlacementUpdate(callback: (event: RealtimeEvent) => void): string {
    return this.subscribe(
      { types: ['placement-updated', 'placement-calculated'] },
      callback
    );
  }

  onJudgeActivity(callback: (event: RealtimeEvent) => void): string {
    return this.subscribe(
      { types: ['judge-joined', 'judge-left', 'judge-status-changed'] },
      callback
    );
  }

  onConflictDetected(callback: (event: RealtimeEvent) => void): string {
    return this.subscribe(
      { types: ['conflict-detected', 'conflict-resolved'] },
      callback
    );
  }

  onSyncEvent(callback: (event: RealtimeEvent) => void): string {
    return this.subscribe(
      { types: ['sync-started', 'sync-completed', 'sync-failed'] },
      callback
    );
  }

  /**
   * Get event history with optional filtering
   */
  getEventHistory(filter?: EventFilter, limit?: number): RealtimeEvent[] {
    let events = [...this.eventHistory];

    if (filter) {
      events = events.filter(event => this.matchesFilter(event, filter));
    }

    if (limit) {
      events = events.slice(-limit);
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get events since a specific timestamp
   */
  getEventsSince(timestamp: Date, filter?: EventFilter): RealtimeEvent[] {
    const events = this.eventHistory.filter(event => event.timestamp > timestamp);
    
    if (filter) {
      return events.filter(event => this.matchesFilter(event, filter));
    }

    return events;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Replay events to a callback
   */
  replayEvents(
    callback: (event: RealtimeEvent) => void,
    filter?: EventFilter,
    fromTimestamp?: Date
  ): void {
    const events = fromTimestamp ? 
      this.getEventsSince(fromTimestamp, filter) :
      this.getEventHistory(filter);

    // Sort chronologically for replay
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    events.forEach(event => {
      try {
        callback(event);
      } catch (error) {
        logger.error('Error replaying event:', 'realtime', { data: error, event });
      }
    });
  }

  /**
   * Batch emit multiple events
   */
  emitBatch(events: Omit<RealtimeEvent, 'id' | 'timestamp'>[]): void {
    const realtimeEvents = events.map(event => ({
      ...event,
      id: this.generateEventId(),
      timestamp: new Date()
    }));

    // Add all to history
    realtimeEvents.forEach(event => this.addToHistory(event));

    // Process all events
    realtimeEvents.forEach(event => this.processEvent(event));

    // Emit batch event
    this.emit('realtime-event-batch', realtimeEvents);
  }

  /**
   * Get subscription statistics
   */
  getSubscriptionStats(): {
    totalSubscriptions: number;
    subscriptionsByType: Record<string, number>;
    subscriptionsByPriority: Record<number, number>;
  } {
    const stats = {
      totalSubscriptions: this.subscriptions.size,
      subscriptionsByType: {} as Record<string, number>,
      subscriptionsByPriority: {} as Record<number, number>
    };

    this.subscriptions.forEach(subscription => {
      // Count by filter types
      if (subscription.filter.types) {
        subscription.filter.types.forEach(type => {
          stats.subscriptionsByType[type] = (stats.subscriptionsByType[type] || 0) + 1;
        });
      }

      // Count by priority
      const priority = subscription.priority;
      stats.subscriptionsByPriority[priority] = (stats.subscriptionsByPriority[priority] || 0) + 1;
    });

    return stats;
  }

  /**
   * Private methods
   */
  private processEvent(event: RealtimeEvent): void {
    // Get matching subscriptions
    const matchingSubscriptions = Array.from(this.subscriptions.values())
      .filter(subscription => this.matchesFilter(event, subscription.filter))
      .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)

    // Process subscriptions
    matchingSubscriptions.forEach(subscription => {
      try {
        subscription.callback(event);
        
        // Remove one-time subscriptions
        if (subscription.once) {
          this.subscriptions.delete(subscription.id);
        }
      } catch (error) {
        logger.error('Error in event subscription callback:', 'realtime', { data: error, {
          subscriptionId: subscription.id,
          event
        } });
      }
    });
  }

  private matchesFilter(event: RealtimeEvent, filter: EventFilter): boolean {
    // Check event types
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(event.type)) {
        return false;
      }
    }

    // Check entity types
    if (filter.entityTypes && filter.entityTypes.length > 0) {
      if (!filter.entityTypes.includes(event.entityType)) {
        return false;
      }
    }

    // Check entity IDs
    if (filter.entityIds && filter.entityIds.length > 0) {
      if (!filter.entityIds.includes(event.entityId)) {
        return false;
      }
    }

    // Check sources
    if (filter.sources && filter.sources.length > 0) {
      if (!filter.sources.includes(event.source)) {
        return false;
      }
    }

    // Check user IDs
    if (filter.userIds && filter.userIds.length > 0) {
      if (!event.userId || !filter.userIds.includes(event.userId)) {
        return false;
      }
    }

    return true;
  }

  private addToHistory(event: RealtimeEvent): void {
    this.eventHistory.push(event);

    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private generateEventId(): string {
    return `event-${Date.now()}-${++this.eventSequence}`;
  }

  private generateSubscriptionId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Debug methods
   */
  getDebugInfo(): {
    subscriptionsCount: number;
    historySize: number;
    listenerCount: number;
    eventSequence: number;
  } {
    return {
      subscriptionsCount: this.subscriptions.size,
      historySize: this.eventHistory.length,
      listenerCount: this.listenerCount('realtime-event'),
      eventSequence: this.eventSequence
    };
  }

  /**
   * Configuration
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = size;
    
    // Trim current history if needed
    if (this.eventHistory.length > size) {
      this.eventHistory = this.eventHistory.slice(-size);
    }
  }

  getMaxHistorySize(): number {
    return this.maxHistorySize;
  }
}