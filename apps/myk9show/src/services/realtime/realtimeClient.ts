/**
 * Enhanced Supabase Real-time Client Configuration
 * Phase 6.1: Real-time Infrastructure
 * 
 * Provides optimized real-time client with advanced connection management,
 * exponential backoff, and performance monitoring for <50ms latency.
 */

import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../database/supabaseClient';
import { errorMonitor } from '../../lib/errorMonitoring';
// import { RETRY_CONFIGS } from '../../lib/connectionRecovery'; // Future use for retry configuration

export interface RealtimeClientConfig {
  // Connection settings
  heartbeatInterval: number;
  reconnectBaseDelay: number;
  reconnectMaxDelay: number;
  maxReconnectAttempts: number;
  connectionTimeout: number;
  
  // Performance settings
  targetLatency: number; // Target <50ms
  maxChannels: number;
  enableMetrics: boolean;
  batchSize: number;
  
  // Feature flags
  enablePresence: boolean;
  enableBroadcast: boolean;
  enableAutomaticReconnect: boolean;
  enableCompressionOptimization: boolean;
}

export interface RealtimeMetrics {
  // Connection metrics
  connectionLatency: number;
  reconnectCount: number;
  connectionUptime: number;
  lastHeartbeat: Date | null;
  
  // Channel metrics
  activeChannels: number;
  totalSubscriptions: number;
  messagesSent: number;
  messagesReceived: number;
  
  // Performance metrics
  averageLatency: number;
  peakLatency: number;
  messageQueueSize: number;
  memoryUsage: number;
  
  // Error metrics
  connectionErrors: number;
  subscriptionErrors: number;
  lastError: string | null;
}

export interface ConnectionHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  score: number; // 0-100
  factors: {
    latency: number;
    stability: number;
    errorRate: number;
    uptime: number;
  };
  recommendations: string[];
}

/**
 * Enhanced Real-time Client with Performance Optimization
 */
export class EnhancedRealtimeClient {
  private client: SupabaseClient;
  private config: RealtimeClientConfig;
  private metrics: RealtimeMetrics;
  private channels = new Map<string, RealtimeChannel>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private latencySamples: number[] = [];
  private connectionStartTime: number | null = null;
  private reconnectAttempts = 0;
  private isConnected = false;
  
  // Performance monitoring
  private messageQueue: Array<{
    id: string;
    timestamp: number;
    data: unknown;
  }> = [];
  
  constructor(customConfig?: Partial<RealtimeClientConfig>) {
    this.client = supabase;
    this.config = {
      // Default configuration optimized for <50ms latency
      heartbeatInterval: 15000, // 15s for balance of detection vs overhead
      reconnectBaseDelay: 250, // Start with 250ms
      reconnectMaxDelay: 5000, // Max 5s for real-time needs
      maxReconnectAttempts: 20,
      connectionTimeout: 8000,
      
      targetLatency: 50, // 50ms target
      maxChannels: 50,
      enableMetrics: true,
      batchSize: 10,
      
      enablePresence: true,
      enableBroadcast: true,
      enableAutomaticReconnect: true,
      enableCompressionOptimization: true,
      
      ...customConfig,
    };
    
    this.metrics = this.initializeMetrics();
    this.setupEventListeners();
    this.startMetricsCollection();
  }

  private initializeMetrics(): RealtimeMetrics {
    return {
      connectionLatency: 0,
      reconnectCount: 0,
      connectionUptime: 0,
      lastHeartbeat: null,
      activeChannels: 0,
      totalSubscriptions: 0,
      messagesSent: 0,
      messagesReceived: 0,
      averageLatency: 0,
      peakLatency: 0,
      messageQueueSize: 0,
      memoryUsage: 0,
      connectionErrors: 0,
      subscriptionErrors: 0,
      lastError: null,
    };
  }

  private setupEventListeners(): void {
    if (typeof window === 'undefined') return;

    // Network status monitoring
    window.addEventListener('online', this.handleNetworkRestore.bind(this));
    window.addEventListener('offline', this.handleNetworkLoss.bind(this));
    
    // Visibility change optimization
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', this.cleanup.bind(this));
  }

  /**
   * Establish real-time connection with optimized settings
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    this.connectionStartTime = performance.now();
    
    try {
      // Test connection latency first
      const latency = await this.measureConnectionLatency();
      
      if (latency > this.config.targetLatency * 2) {
        console.warn(`High latency detected: ${latency}ms (target: ${this.config.targetLatency}ms)`);
      }

      this.metrics.connectionLatency = latency;
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Start heartbeat monitoring
      this.startHeartbeat();
      
      console.log(`Real-time connection established. Latency: ${latency}ms`);
      
    } catch (error) {
      this.handleConnectionError(error as Error);
      throw error;
    }
  }

  /**
   * Measure connection latency using ping-pong mechanism
   */
  private async measureConnectionLatency(): Promise<number> {
    const startTime = performance.now();
    const testChannel = this.client.channel(`latency-test-${Date.now()}`);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        testChannel.unsubscribe();
        reject(new Error('Latency test timeout'));
      }, this.config.connectionTimeout);

      testChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const latency = performance.now() - startTime;
          clearTimeout(timeout);
          testChannel.unsubscribe();
          resolve(latency);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          testChannel.unsubscribe();
          reject(new Error(`Latency test failed: ${status}`));
        }
      });
    });
  }

  /**
   * Create optimized channel with performance monitoring
   */
  async createChannel(
    name: string,
    options: {
      table?: string;
      filter?: string;
      enablePresence?: boolean;
      enableBroadcast?: boolean;
      lowLatency?: boolean;
    } = {}
  ): Promise<RealtimeChannel> {
    if (this.channels.has(name)) {
      return this.channels.get(name)!;
    }

    if (this.channels.size >= this.config.maxChannels) {
      throw new Error(`Maximum channel limit reached (${this.config.maxChannels})`);
    }

    const channelConfig = {
      config: {
        presence: {
          key: 'user_id',
        },
        ...(options.lowLatency && {
          ack: true,
          timeout: 5000,
        }),
      },
    };

    const channel = this.client.channel(name, channelConfig);
    
    // Setup channel monitoring
    this.setupChannelMonitoring(channel);
    
    // Subscribe to channel
    channel.subscribe((status) => {
      this.handleChannelStatus(name, status);
    });

    this.channels.set(name, channel);
    this.metrics.activeChannels = this.channels.size;
    this.metrics.totalSubscriptions++;

    return channel;
  }

  /**
   * Setup comprehensive channel monitoring
   */
  private setupChannelMonitoring(channel: RealtimeChannel): void {
    // Monitor presence if enabled
    if (this.config.enablePresence) {
      channel.on('presence', { event: 'sync' }, () => {
        this.metrics.messagesReceived++;
      });
    }

    // Monitor broadcast messages
    if (this.config.enableBroadcast) {
      channel.on('broadcast', { event: '*' }, (payload) => {
        const latency = this.calculateMessageLatency(payload);
        this.recordLatency(latency);
        this.metrics.messagesReceived++;
      });
    }

    // Monitor database changes
    channel.on('postgres_changes', 
      { event: '*', schema: 'public' }, 
      (payload) => {
        const latency = this.calculateMessageLatency(payload);
        this.recordLatency(latency);
        this.metrics.messagesReceived++;
        
        // Process with queue if enabled
        if (this.config.batchSize > 1) {
          this.queueMessage(payload);
        }
      }
    );
  }

  /**
   * Calculate message latency from payload
   */
  private calculateMessageLatency(payload: Record<string, unknown>): number {
    if (payload.timestamp && typeof payload.timestamp === 'number') {
      return performance.now() - payload.timestamp;
    }
    return 0; // No timestamp available
  }

  /**
   * Record latency sample for metrics
   */
  private recordLatency(latency: number): void {
    this.latencySamples.push(latency);
    
    // Keep only recent samples (last 100)
    if (this.latencySamples.length > 100) {
      this.latencySamples.shift();
    }
    
    // Update metrics
    this.metrics.averageLatency = 
      this.latencySamples.reduce((sum, l) => sum + l, 0) / this.latencySamples.length;
    this.metrics.peakLatency = Math.max(...this.latencySamples);
  }

  /**
   * Queue messages for batch processing
   */
  private queueMessage(data: unknown): void {
    this.messageQueue.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: performance.now(),
      data,
    });

    this.metrics.messageQueueSize = this.messageQueue.length;

    // Process batch when full
    if (this.messageQueue.length >= this.config.batchSize) {
      this.processBatch();
    }
  }

  /**
   * Process batched messages
   */
  private processBatch(): void {
    const batch = this.messageQueue.splice(0, this.config.batchSize);
    this.metrics.messageQueueSize = this.messageQueue.length;

    // Process batch (implementation depends on use case)
    batch.forEach(message => {
      // Custom batch processing logic here
      console.debug('Processing batched message:', message.id);
    });
  }

  /**
   * Handle channel status changes
   */
  private handleChannelStatus(channelName: string, status: string): void {
    switch (status) {
      case 'SUBSCRIBED':
        console.log(`Channel ${channelName} subscribed successfully`);
        break;
      
      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
        this.metrics.subscriptionErrors++;
        this.metrics.lastError = `Channel ${channelName} error: ${status}`;
        
        errorMonitor.captureError(new Error(`Channel error: ${status}`), {
          additionalData: { channelName, status }
        });
        
        // Attempt to recreate channel
        this.recreateChannel(channelName);
        break;
    }
  }

  /**
   * Recreate failed channel
   */
  private async recreateChannel(channelName: string): Promise<void> {
    try {
      const oldChannel = this.channels.get(channelName);
      if (oldChannel) {
        await oldChannel.unsubscribe();
        this.channels.delete(channelName);
      }

      // Wait before recreating
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Recreate with exponential backoff
      await this.createChannel(channelName);
      
    } catch (error) {
      console.error(`Failed to recreate channel ${channelName}:`, error);
    }
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      try {
        const startTime = performance.now();
        
        // Send heartbeat via test channel
        const heartbeatChannel = this.channels.get('heartbeat') || 
          await this.createChannel('heartbeat', { lowLatency: true });
        
        await heartbeatChannel.send({
          type: 'broadcast',
          event: 'heartbeat',
          payload: { timestamp: startTime },
        });

        this.metrics.lastHeartbeat = new Date();
        this.metrics.messagesSent++;
        
      } catch (error) {
        console.warn('Heartbeat failed:', error);
        this.handleConnectionError(error as Error);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Handle connection errors with exponential backoff
   */
  private handleConnectionError(error: Error): void {
    this.metrics.connectionErrors++;
    this.metrics.lastError = error.message;
    this.isConnected = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.config.enableAutomaticReconnect && 
        this.reconnectAttempts < this.config.maxReconnectAttempts) {
      
      this.scheduleReconnect();
    }

    errorMonitor.captureError(error, {
      additionalData: {
        reconnectAttempts: this.reconnectAttempts,
        activeChannels: this.channels.size,
        metrics: this.metrics,
      }
    });
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    this.metrics.reconnectCount++;

    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.reconnectMaxDelay
    );

    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Handle network restoration
   */
  private handleNetworkRestore(): void {
    console.log('Network restored, reconnecting...');
    this.reconnectAttempts = 0; // Reset attempts on network restore
    this.connect();
  }

  /**
   * Handle network loss
   */
  private handleNetworkLoss(): void {
    console.log('Network lost, pausing real-time connections');
    this.isConnected = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Handle visibility changes for optimization
   */
  private handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      // Tab became active - ensure connection is healthy
      if (!this.isConnected) {
        this.connect();
      }
    } else {
      // Tab became inactive - reduce heartbeat frequency
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
          // Reduced frequency heartbeat for background
        }, this.config.heartbeatInterval * 3);
      }
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    if (!this.config.enableMetrics) return;

    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, 5000); // Update metrics every 5 seconds
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(): void {
    if (this.connectionStartTime && this.isConnected) {
      this.metrics.connectionUptime = performance.now() - this.connectionStartTime;
    }

    // Update memory usage if available
    if ('memory' in performance) {
      const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
      this.metrics.memoryUsage = perf.memory?.usedJSHeapSize || 0;
    }

    // Log metrics in development
    if (process.env.NODE_ENV === 'development') {
      console.debug('Real-time metrics:', this.getMetrics());
    }
  }

  /**
   * Get current connection health
   */
  getConnectionHealth(): ConnectionHealth {
    const latencyScore = Math.max(0, 100 - (this.metrics.averageLatency / this.config.targetLatency) * 50);
    const stabilityScore = Math.max(0, 100 - this.metrics.reconnectCount * 10);
    const errorScore = Math.max(0, 100 - this.metrics.connectionErrors * 5);
    const uptimeScore = this.isConnected ? 100 : 0;

    const score = (latencyScore + stabilityScore + errorScore + uptimeScore) / 4;
    
    let status: ConnectionHealth['status'] = 'healthy';
    if (score < 50) status = 'unhealthy';
    else if (score < 70) status = 'degraded';
    else if (!this.isConnected) status = 'offline';

    const recommendations: string[] = [];
    if (this.metrics.averageLatency > this.config.targetLatency) {
      recommendations.push('High latency detected - check network connection');
    }
    if (this.metrics.reconnectCount > 3) {
      recommendations.push('Frequent reconnections - check connection stability');
    }
    if (this.channels.size > this.config.maxChannels * 0.8) {
      recommendations.push('High channel usage - consider consolidating subscriptions');
    }

    return {
      status,
      score: Math.round(score),
      factors: {
        latency: Math.round(latencyScore),
        stability: Math.round(stabilityScore),
        errorRate: Math.round(errorScore),
        uptime: Math.round(uptimeScore),
      },
      recommendations,
    };
  }

  /**
   * Get current metrics
   */
  getMetrics(): RealtimeMetrics {
    return { ...this.metrics };
  }

  /**
   * Get configuration
   */
  getConfig(): RealtimeClientConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<RealtimeClientConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Restart timers if intervals changed
    if (updates.heartbeatInterval && this.heartbeatTimer) {
      this.startHeartbeat();
    }
  }

  /**
   * Remove channel
   */
  async removeChannel(name: string): Promise<void> {
    const channel = this.channels.get(name);
    if (channel) {
      await channel.unsubscribe();
      this.channels.delete(name);
      this.metrics.activeChannels = this.channels.size;
    }
  }

  /**
   * Get active channels
   */
  getActiveChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    // Clear timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }

    // Unsubscribe from all channels
    this.channels.forEach(async (channel, name) => {
      try {
        await channel.unsubscribe();
      } catch (error) {
        console.warn(`Error unsubscribing from channel ${name}:`, error);
      }
    });

    this.channels.clear();
    this.isConnected = false;
    this.metrics.activeChannels = 0;
  }

  /**
   * Force reconnection
   */
  async forceReconnect(): Promise<void> {
    await this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.connect();
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.cleanup();
    console.log('Real-time client disconnected');
  }
}

// Create singleton instance
export const realtimeClient = new EnhancedRealtimeClient();

// Export for testing and custom configurations
export default EnhancedRealtimeClient;