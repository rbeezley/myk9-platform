/**
 * Real-time Optimization Utilities
 * 
 * Utility functions for optimizing Phase 6 real-time features performance
 * Provides helpers for connection management, message optimization, and resource efficiency
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { eventEmitter } from '../services/sync/eventEmitter';
import { logger } from '@/services/LoggingService';

// Define types for better type safety
type RealtimeMessage = Record<string, unknown>;
type MessageProcessor = (messages: RealtimeMessage[]) => void;
type EventListener = (...args: unknown[]) => void;

/**
 * Connection pool for reusing WebSocket connections
 */
class ConnectionPool {
  private static instance: ConnectionPool;
  private connections = new Map<string, { channel: RealtimeChannel; lastUsed: number; inUse: boolean }>();
  private maxConnections = 10;
  private connectionTTL = 300000; // 5 minutes

  static getInstance(): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool();
    }
    return ConnectionPool.instance;
  }

  getConnection(channelName: string): RealtimeChannel | null {
    const connection = this.connections.get(channelName);
    
    if (connection && !connection.inUse && Date.now() - connection.lastUsed < this.connectionTTL) {
      connection.inUse = true;
      connection.lastUsed = Date.now();
      return connection.channel;
    }
    
    return null;
  }

  addConnection(channelName: string, channel: RealtimeChannel): void {
    // Clean up old connections if at limit
    if (this.connections.size >= this.maxConnections) {
      this.cleanupOldConnections();
    }

    this.connections.set(channelName, {
      channel,
      lastUsed: Date.now(),
      inUse: true
    });
  }

  releaseConnection(channelName: string): void {
    const connection = this.connections.get(channelName);
    if (connection) {
      connection.inUse = false;
      connection.lastUsed = Date.now();
    }
  }

  private cleanupOldConnections(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.connections.forEach((connection, channelName) => {
      if (!connection.inUse && now - connection.lastUsed > this.connectionTTL) {
        connection.channel.unsubscribe();
        toDelete.push(channelName);
      }
    });

    toDelete.forEach(channelName => this.connections.delete(channelName));
  }
}

/**
 * Message batching for high-frequency updates
 */
class MessageBatcher {
  private static instance: MessageBatcher;
  private batches = new Map<string, { messages: RealtimeMessage[]; timeout: NodeJS.Timeout | null }>();
  private batchDelay = 16; // ~60fps
  private maxBatchSize = 50;

  static getInstance(): MessageBatcher {
    if (!MessageBatcher.instance) {
      MessageBatcher.instance = new MessageBatcher();
    }
    return MessageBatcher.instance;
  }

  addMessage(channel: string, message: RealtimeMessage, processFn: MessageProcessor): void {
    if (!this.batches.has(channel)) {
      this.batches.set(channel, { messages: [], timeout: null });
    }

    const batch = this.batches.get(channel)!;
    batch.messages.push(message);

    // Process immediately if batch is full
    if (batch.messages.length >= this.maxBatchSize) {
      this.processBatch(channel, processFn);
      return;
    }

    // Schedule batch processing
    if (!batch.timeout) {
      batch.timeout = setTimeout(() => {
        this.processBatch(channel, processFn);
      }, this.batchDelay);
    }
  }

  private processBatch(channel: string, processFn: MessageProcessor): void {
    const batch = this.batches.get(channel);
    if (!batch || batch.messages.length === 0) return;

    processFn(batch.messages);

    // Clear batch
    batch.messages = [];
    if (batch.timeout) {
      clearTimeout(batch.timeout);
      batch.timeout = null;
    }
  }

  clearBatch(channel: string): void {
    const batch = this.batches.get(channel);
    if (batch) {
      if (batch.timeout) {
        clearTimeout(batch.timeout);
      }
      this.batches.delete(channel);
    }
  }
}

/**
 * Adaptive message compression for bandwidth optimization
 */
class MessageCompressor {
  private static instance: MessageCompressor;
  private compressionStats = new Map<string, { 
    totalMessages: number; 
    totalSavings: number; 
    avgCompressionRatio: number; 
  }>();

  static getInstance(): MessageCompressor {
    if (!MessageCompressor.instance) {
      MessageCompressor.instance = new MessageCompressor();
    }
    return MessageCompressor.instance;
  }

  compressMessage(channel: string, message: RealtimeMessage): {
    compressed: RealtimeMessage;
    originalSize: number;
    compressedSize: number;
    ratio: number;
  } {
    try {
      const originalData = JSON.stringify(message);
      const originalSize = new Blob([originalData]).size;

      let compressedData = message;
      let compressionRatio = 0;

      if (originalSize > 1024) {
        compressedData = this.applyCompression(message);
        const compressedSize = new Blob([JSON.stringify(compressedData)]).size;
        compressionRatio = 1 - (compressedSize / originalSize);
        this.updateCompressionStats(channel, originalSize, compressedSize, compressionRatio);
      }

      return {
        compressed: compressedData,
        originalSize,
        compressedSize: new Blob([JSON.stringify(compressedData)]).size,
        ratio: compressionRatio
      };
    } catch {
      const originalSize = new Blob([JSON.stringify(message)]).size;
      return {
        compressed: message,
        originalSize,
        compressedSize: originalSize,
        ratio: 0
      };
    }
  }

  private applyCompression(message: RealtimeMessage): RealtimeMessage {
    // Implement actual compression logic here
    // For now, just remove unnecessary whitespace and apply simple optimizations
    return {
      _compressed: true,
      _algorithm: 'simple',
      data: this.removeRedundantData(message)
    };
  }

  private removeRedundantData(data: RealtimeMessage): RealtimeMessage {
    if (typeof data !== 'object' || data === null) return data;
    
    const optimized: RealtimeMessage = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Skip null/undefined values
      if (value == null) continue;
      
      // Skip empty arrays/objects
      if (Array.isArray(value) && value.length === 0) continue;
      if (typeof value === 'object' && Object.keys(value).length === 0) continue;
      
      // Recursively optimize nested objects
      if (typeof value === 'object' && value !== null && 'type' in value && 'data' in value) {
        const optimizedValue = this.removeRedundantData(value as RealtimeMessage);
        if (optimizedValue && Object.keys(optimizedValue).length > 0) {
          optimized[key] = optimizedValue;
        }
      } else {
        optimized[key] = value;
      }
    }
    
    return optimized;
  }

  private updateCompressionStats(
    channel: string, 
    originalSize: number, 
    compressedSize: number, 
    ratio: number
  ): void {
    if (!this.compressionStats.has(channel)) {
      this.compressionStats.set(channel, {
        totalMessages: 0,
        totalSavings: 0,
        avgCompressionRatio: 0
      });
    }

    const stats = this.compressionStats.get(channel)!;
    stats.totalMessages++;
    stats.totalSavings += originalSize - compressedSize;
    stats.avgCompressionRatio = (stats.avgCompressionRatio * (stats.totalMessages - 1) + ratio) / stats.totalMessages;
  }

  getCompressionStats(channel?: string): Record<string, unknown> {
    if (channel) {
      return this.compressionStats.get(channel) || {};
    }
    return Object.fromEntries(this.compressionStats);
  }
}

/**
 * Smart heartbeat manager for optimal connection health
 */
class SmartHeartbeat {
  private static instance: SmartHeartbeat;
  private intervals = new Map<string, NodeJS.Timeout>();
  private adaptiveIntervals = new Map<string, number>();
  private connectionHealth = new Map<string, { 
    latency: number; 
    missedBeats: number; 
    lastResponse: number; 
  }>();

  static getInstance(): SmartHeartbeat {
    if (!SmartHeartbeat.instance) {
      SmartHeartbeat.instance = new SmartHeartbeat();
    }
    return SmartHeartbeat.instance;
  }

  startHeartbeat(
    channel: string, 
    sendFn: () => Promise<void>, 
    initialInterval: number = 30000
  ): void {
    this.adaptiveIntervals.set(channel, initialInterval);
    this.connectionHealth.set(channel, {
      latency: 0,
      missedBeats: 0,
      lastResponse: Date.now()
    });

    this.scheduleNextHeartbeat(channel, sendFn);
  }

  stopHeartbeat(channel: string): void {
    const interval = this.intervals.get(channel);
    if (interval) {
      clearTimeout(interval);
      this.intervals.delete(channel);
    }
    this.adaptiveIntervals.delete(channel);
    this.connectionHealth.delete(channel);
  }

  recordHeartbeatResponse(channel: string, latency: number): void {
    const health = this.connectionHealth.get(channel);
    if (health) {
      health.latency = latency;
      health.missedBeats = 0;
      health.lastResponse = Date.now();
      
      // Adapt interval based on latency
      this.adaptHeartbeatInterval(channel, latency);
    }
  }

  recordMissedHeartbeat(channel: string): void {
    const health = this.connectionHealth.get(channel);
    if (health) {
      health.missedBeats++;
      
      // Increase frequency if missing heartbeats
      if (health.missedBeats >= 2) {
        this.adaptHeartbeatInterval(channel, health.latency, true);
      }
    }
  }

  private scheduleNextHeartbeat(channel: string, sendFn: () => Promise<void>): void {
    const interval = this.adaptiveIntervals.get(channel) || 30000;
    
    const timeoutId = setTimeout(async () => {
      const startTime = Date.now();
      
      try {
        await sendFn();
        const latency = Date.now() - startTime;
        this.recordHeartbeatResponse(channel, latency);
      } catch (error) {
        this.recordMissedHeartbeat(channel);
        logger.warn(`Heartbeat failed for channel ${channel}:`, 'utils', {}, error as Error);
      }
      
      // Schedule next heartbeat
      this.scheduleNextHeartbeat(channel, sendFn);
    }, interval);
    
    this.intervals.set(channel, timeoutId);
  }

  private adaptHeartbeatInterval(channel: string, latency: number, forceFaster: boolean = false): void {
    const currentInterval = this.adaptiveIntervals.get(channel) || 30000;
    let newInterval = currentInterval;

    if (forceFaster) {
      // Reduce interval for unreliable connections
      newInterval = Math.max(5000, currentInterval * 0.7);
    } else if (latency < 100) {
      // Good connection - can increase interval
      newInterval = Math.min(60000, currentInterval * 1.1);
    } else if (latency > 500) {
      // Poor connection - decrease interval
      newInterval = Math.max(10000, currentInterval * 0.8);
    }

    if (newInterval !== currentInterval) {
      this.adaptiveIntervals.set(channel, newInterval);
      
      eventEmitter.emit('realtime:heartbeat-adapted', {
        channel,
        oldInterval: currentInterval,
        newInterval,
        latency
      });
    }
  }

  getConnectionHealth(channel: string): Record<string, unknown> {
    return this.connectionHealth.get(channel) || {};
  }
}

/**
 * Memory-efficient event listener manager
 */
class EventListenerManager {
  private static instance: EventListenerManager;
  private listeners = new Map<string, Map<string, Set<EventListener>>>();
  private weakListeners = new WeakMap<object, Map<string, Set<EventListener>>>();

  static getInstance(): EventListenerManager {
    if (!EventListenerManager.instance) {
      EventListenerManager.instance = new EventListenerManager();
    }
    return EventListenerManager.instance;
  }

  addListener(
    channel: string, 
    event: string, 
    listener: EventListener, 
    component?: object
  ): () => void {
    if (component) {
      // Use WeakMap for component-scoped listeners
      return this.addWeakListener(component, event, listener);
    }

    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Map());
    }

    const channelListeners = this.listeners.get(channel)!;
    if (!channelListeners.has(event)) {
      channelListeners.set(event, new Set());
    }

    channelListeners.get(event)!.add(listener);

    // Return cleanup function
    return () => {
      channelListeners.get(event)?.delete(listener);
      
      // Cleanup empty structures
      if (channelListeners.get(event)?.size === 0) {
        channelListeners.delete(event);
      }
      if (channelListeners.size === 0) {
        this.listeners.delete(channel);
      }
    };
  }

  private addWeakListener(component: object, event: string, listener: EventListener): () => void {
    if (!this.weakListeners.has(component)) {
      this.weakListeners.set(component, new Map());
    }

    const componentListeners = this.weakListeners.get(component)!;
    if (!componentListeners.has(event)) {
      componentListeners.set(event, new Set());
    }

    componentListeners.get(event)!.add(listener);

    return () => {
      componentListeners.get(event)?.delete(listener);
    };
  }

  removeAllListeners(channel: string): void {
    this.listeners.delete(channel);
  }

  getListenerCount(channel?: string): number {
    if (channel) {
      const channelListeners = this.listeners.get(channel);
      if (!channelListeners) return 0;
      
      let count = 0;
      channelListeners.forEach(eventListeners => {
        count += eventListeners.size;
      });
      return count;
    }

    let totalCount = 0;
    this.listeners.forEach(channelListeners => {
      channelListeners.forEach(eventListeners => {
        totalCount += eventListeners.size;
      });
    });
    return totalCount;
  }

  cleanup(): void {
    // Force cleanup of all listeners
    this.listeners.clear();
    // WeakMap will be cleaned up automatically by GC
  }
}

// Export singleton instances
export const connectionPool = ConnectionPool.getInstance();
export const messageBatcher = MessageBatcher.getInstance();
export const messageCompressor = MessageCompressor.getInstance();
export const smartHeartbeat = SmartHeartbeat.getInstance();
export const eventListenerManager = EventListenerManager.getInstance();

/**
 * Utility functions for real-time optimization
 */

/**
 * Optimize channel subscription with connection pooling
 */
export async function optimizedChannelSubscribe(
  channelName: string,
  createChannelFn: () => RealtimeChannel,
  options: {
    usePool?: boolean;
    enableCompression?: boolean;
    batchMessages?: boolean;
  } = {}
): Promise<RealtimeChannel> {
  // Try to get from pool first
  if (options.usePool !== false) {
    const pooledChannel = connectionPool.getConnection(channelName);
    if (pooledChannel) {
      return pooledChannel;
    }
  }

  // Create new channel
  const channel = createChannelFn();

  // Add to pool
  if (options.usePool !== false) {
    connectionPool.addConnection(channelName, channel);
  }

  return channel;
}

/**
 * Optimize message sending with compression and batching
 */
export function optimizedMessageSend(
  channel: RealtimeChannel,
  event: string,
  payload: Record<string, unknown>,
  options: {
    enableCompression?: boolean;
    batchMessages?: boolean;
    priority?: 'high' | 'normal' | 'low';
  } = {}
): void {
  let optimizedPayload = payload;

  // Apply compression if enabled
  if (options.enableCompression) {
    const compressed = messageCompressor.compressMessage(channel.topic, payload);
    optimizedPayload = compressed.compressed;
  }

  // Send immediately for high priority or if batching disabled
  if (options.priority === 'high' || !options.batchMessages) {
    channel.send({
      type: 'broadcast',
      event,
      payload: optimizedPayload
    });
    return;
  }

  // Add to batch for normal/low priority
  messageBatcher.addMessage(
    channel.topic,
    { event, payload: optimizedPayload },
    (messages) => {
      messages.forEach(msg => {
        channel.send({
          type: 'broadcast',
          event: String(msg.event),
          payload: msg.payload
        });
      });
    }
  );
}

/**
 * Setup optimized presence tracking
 */
export function setupOptimizedPresence(
  channel: RealtimeChannel,
  userInfo: Record<string, unknown>,
  options: {
    heartbeatInterval?: number;
    adaptiveHeartbeat?: boolean;
  } = {}
): () => void {
  const channelName = channel.topic;
  
  // Track presence
  channel.on('presence', { event: 'sync' }, () => {
    const presenceState = channel.presenceState();
    eventEmitter.emit('presence:sync', {
      channel: channelName,
      users: Object.keys(presenceState).length,
      state: presenceState
    });
  });

  // Setup adaptive heartbeat if enabled
  if (options.adaptiveHeartbeat !== false) {
    smartHeartbeat.startHeartbeat(
      channelName,
      async () => {
        await channel.track(userInfo);
      },
      options.heartbeatInterval
    );
  }

  // Initial presence track
  channel.track(userInfo);

  // Return cleanup function
  return () => {
    channel.untrack();
    smartHeartbeat.stopHeartbeat(channelName);
  };
}

/**
 * Memory-efficient event listener setup
 */
export function setupOptimizedListeners(
  channel: RealtimeChannel,
  listeners: Record<string, EventListener>,
  component?: object
): () => void {
  const cleanupFunctions: (() => void)[] = [];

  Object.entries(listeners).forEach(([event, listener]) => {
    const cleanup = eventListenerManager.addListener(
      channel.topic,
      event,
      listener,
      component
    );
    cleanupFunctions.push(cleanup);

    // Setup actual channel listener
    channel.on('broadcast', { event }, listener as EventListener);
  });

  // Return cleanup function
  return () => {
    cleanupFunctions.forEach(cleanup => cleanup());
    // Channel cleanup handled by RealtimeConnectionManager
  };
}

/**
 * Calculate optimal message frequency based on performance
 */
export function calculateOptimalMessageFrequency(
  currentLatency: number,
  targetLatency: number = 50,
  currentFrequency: number = 60
): number {
  // Adjust frequency based on latency performance
  if (currentLatency <= targetLatency) {
    // Good performance - can increase frequency
    return Math.min(120, currentFrequency * 1.1);
  } else if (currentLatency > targetLatency * 2) {
    // Poor performance - reduce frequency
    return Math.max(10, currentFrequency * 0.7);
  }
  
  // Maintain current frequency
  return currentFrequency;
}

/**
 * Get real-time optimization statistics
 */
export function getOptimizationStats(): {
  connectionPool: Record<string, unknown>;
  messageCompression: Record<string, unknown>;
  eventListeners: Record<string, unknown>;
  heartbeat: Record<string, unknown>;
} {
  return {
    connectionPool: {
      activeConnections: connectionPool['connections']?.size || 0,
      // Add more pool stats as needed
    },
    messageCompression: messageCompressor.getCompressionStats(),
    eventListeners: {
      totalListeners: eventListenerManager.getListenerCount()
    },
    heartbeat: {
      // Add heartbeat stats as needed
    }
  };
}