/**
 * Real-time Performance Monitor
 * 
 * Monitors and optimizes performance of all Phase 6 real-time features
 * Maintains <50ms latency targets for live competition features
 */

import { performanceMonitor } from './PerformanceMonitor';
import { RealtimeConnectionManager } from '../realtime/RealtimeConnectionManager';
import { eventEmitter } from '../sync/eventEmitter';
import { logger } from '@/services/LoggingService';

export interface RealtimePerformanceMetrics {
  /** Connection performance */
  connection: {
    latency: number;
    reconnectCount: number;
    uptimePercentage: number;
    messageLatency: number;
    connectionStability: number;
  };
  
  /** Real-time update performance */
  updates: {
    averageLatency: number;
    messagesPerSecond: number;
    queueDepth: number;
    dropRate: number;
    duplicateRate: number;
  };
  
  /** Presence tracking performance */
  presence: {
    activeUsers: number;
    presenceLatency: number;
    heartbeatInterval: number;
    presenceAccuracy: number;
  };
  
  /** Subscription performance */
  subscriptions: {
    activeChannels: number;
    subscriptionLatency: number;
    unsubscribeLatency: number;
    channelOverhead: number;
  };
  
  /** Memory and resource usage */
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    batteryImpact: number;
    networkBandwidth: number;
  };
}

export interface PerformanceAlert {
  id: string;
  type: 'warning' | 'critical';
  metric: string;
  threshold: number;
  currentValue: number;
  timestamp: Date;
  message: string;
  suggestions: string[];
}

export interface RealtimeOptimizationConfig {
  /** Target latency in milliseconds */
  targetLatency: number;
  
  /** Maximum queue depth before optimization */
  maxQueueDepth: number;
  
  /** Memory limit in MB */
  memoryLimit: number;
  
  /** Enable aggressive optimization */
  aggressiveOptimization: boolean;
  
  /** Enable smart batching */
  smartBatching: boolean;
  
  /** Connection pooling configuration */
  connectionPooling: {
    enabled: boolean;
    maxConnections: number;
    reuseConnections: boolean;
  };
}

export class RealtimePerformanceMonitor {
  private static instance: RealtimePerformanceMonitor;
  private metrics: RealtimePerformanceMetrics;
  private config: RealtimeOptimizationConfig;
  private alerts: PerformanceAlert[] = [];
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private latencyBuffer: number[] = [];
  private messageQueue: Array<{ timestamp: number; latency?: number }> = [];
  private connectionManager: RealtimeConnectionManager;

  private constructor() {
    this.connectionManager = RealtimeConnectionManager.getInstance();
    this.metrics = this.initializeMetrics();
    this.config = this.getDefaultConfig();
    this.setupEventListeners();
  }

  static getInstance(): RealtimePerformanceMonitor {
    if (!RealtimePerformanceMonitor.instance) {
      RealtimePerformanceMonitor.instance = new RealtimePerformanceMonitor();
    }
    return RealtimePerformanceMonitor.instance;
  }

  private initializeMetrics(): RealtimePerformanceMetrics {
    return {
      connection: {
        latency: 0,
        reconnectCount: 0,
        uptimePercentage: 100,
        messageLatency: 0,
        connectionStability: 1.0
      },
      updates: {
        averageLatency: 0,
        messagesPerSecond: 0,
        queueDepth: 0,
        dropRate: 0,
        duplicateRate: 0
      },
      presence: {
        activeUsers: 0,
        presenceLatency: 0,
        heartbeatInterval: 30000,
        presenceAccuracy: 1.0
      },
      subscriptions: {
        activeChannels: 0,
        subscriptionLatency: 0,
        unsubscribeLatency: 0,
        channelOverhead: 0
      },
      resources: {
        memoryUsage: 0,
        cpuUsage: 0,
        batteryImpact: 0,
        networkBandwidth: 0
      }
    };
  }

  private getDefaultConfig(): RealtimeOptimizationConfig {
    return {
      targetLatency: 50, // 50ms target
      maxQueueDepth: 100,
      memoryLimit: 100, // 100MB
      aggressiveOptimization: false,
      smartBatching: true,
      connectionPooling: {
        enabled: true,
        maxConnections: 5,
        reuseConnections: true
      }
    };
  }

  private setupEventListeners(): void {
    // Listen to connection events
    this.connectionManager.addConnectionListener('state-change', () => {
      this.handleConnectionEvent();
    });

    // Listen to message events
    eventEmitter.on('realtime:message-received', (data) => {
      if (typeof data === 'object' && data !== null) {
        this.handleMessageEvent(data as { latency?: number; [key: string]: unknown });
      }
    });

    // Listen to performance events
    eventEmitter.on('performance:measurement', (data) => {
      if (typeof data === 'object' && data !== null) {
        this.handlePerformanceEvent(data as { operation?: string; [key: string]: unknown });
      }
    });
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.analyzePerformance();
      this.optimizeIfNeeded();
    }, 1000); // Monitor every second

    logger.debug('Real-time performance monitoring started', 'performance', {});
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.debug('Real-time performance monitoring stopped', 'performance', {});
  }

  /**
   * Collect current performance metrics
   */
  private async collectMetrics(): Promise<void> {
    const timerId = performanceMonitor.startTimer('realtime-metrics-collection');

    try {
      // Update connection metrics
      const connectionMetrics = this.connectionManager.getConnectionMetrics();
      
      this.metrics.connection = {
        latency: this.calculateAverageLatency(),
        reconnectCount: connectionMetrics.totalDisconnections,
        uptimePercentage: this.calculateUptimePercentage(),
        messageLatency: this.calculateMessageLatency(),
        connectionStability: this.calculateConnectionStability()
      };

      // Update subscription metrics
      this.metrics.subscriptions.activeChannels = this.getActiveChannelCount();

      // Update resource metrics
      this.metrics.resources = {
        memoryUsage: this.getMemoryUsage(),
        cpuUsage: this.getCpuUsage(),
        batteryImpact: this.getBatteryImpact(),
        networkBandwidth: this.getNetworkBandwidth()
      };

      // Update message queue metrics
      this.metrics.updates = {
        averageLatency: this.calculateAverageLatency(),
        messagesPerSecond: this.calculateMessagesPerSecond(),
        queueDepth: this.messageQueue.length,
        dropRate: this.calculateDropRate(),
        duplicateRate: this.calculateDuplicateRate()
      };

      performanceMonitor.endTimer(timerId, { success: true });
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      logger.error('Error collecting real-time metrics:', 'performance', {}, error as Error);
    }
  }

  /**
   * Analyze performance and generate alerts
   */
  private analyzePerformance(): void {
    const alerts: PerformanceAlert[] = [];

    // Check latency
    if (this.metrics.connection.latency > this.config.targetLatency) {
      alerts.push({
        id: `latency-${Date.now()}`,
        type: this.metrics.connection.latency > this.config.targetLatency * 2 ? 'critical' : 'warning',
        metric: 'connection.latency',
        threshold: this.config.targetLatency,
        currentValue: this.metrics.connection.latency,
        timestamp: new Date(),
        message: `High latency detected: ${this.metrics.connection.latency}ms (target: ${this.config.targetLatency}ms)`,
        suggestions: [
          'Enable connection pooling',
          'Reduce message frequency',
          'Enable smart batching',
          'Check network conditions'
        ]
      });
    }

    // Check queue depth
    if (this.metrics.updates.queueDepth > this.config.maxQueueDepth) {
      alerts.push({
        id: `queue-depth-${Date.now()}`,
        type: 'warning',
        metric: 'updates.queueDepth',
        threshold: this.config.maxQueueDepth,
        currentValue: this.metrics.updates.queueDepth,
        timestamp: new Date(),
        message: `High queue depth: ${this.metrics.updates.queueDepth} messages`,
        suggestions: [
          'Enable aggressive optimization',
          'Increase batch processing',
          'Reduce update frequency',
          'Optimize message handling'
        ]
      });
    }

    // Check memory usage
    if (this.metrics.resources.memoryUsage > this.config.memoryLimit) {
      alerts.push({
        id: `memory-${Date.now()}`,
        type: 'critical',
        metric: 'resources.memoryUsage',
        threshold: this.config.memoryLimit,
        currentValue: this.metrics.resources.memoryUsage,
        timestamp: new Date(),
        message: `High memory usage: ${this.metrics.resources.memoryUsage}MB`,
        suggestions: [
          'Clear old message buffers',
          'Reduce subscription count',
          'Enable memory optimization',
          'Restart connections'
        ]
      });
    }

    // Check connection stability
    if (this.metrics.connection.connectionStability < 0.9) {
      alerts.push({
        id: `stability-${Date.now()}`,
        type: 'warning',
        metric: 'connection.connectionStability',
        threshold: 0.9,
        currentValue: this.metrics.connection.connectionStability,
        timestamp: new Date(),
        message: `Poor connection stability: ${(this.metrics.connection.connectionStability * 100).toFixed(1)}%`,
        suggestions: [
          'Check network conditions',
          'Increase reconnect timeout',
          'Enable connection redundancy',
          'Optimize heartbeat frequency'
        ]
      });
    }

    // Update alerts array
    this.alerts = [...this.alerts, ...alerts].slice(-50); // Keep last 50 alerts

    // Emit alerts
    alerts.forEach(alert => {
      eventEmitter.emit('realtime:performance-alert', alert);
    });
  }

  /**
   * Apply optimizations based on current performance
   */
  private optimizeIfNeeded(): void {
    const timerId = performanceMonitor.startTimer('realtime-optimization');

    try {
      // Optimize latency
      if (this.metrics.connection.latency > this.config.targetLatency) {
        this.optimizeLatency();
      }

      // Optimize queue depth
      if (this.metrics.updates.queueDepth > this.config.maxQueueDepth) {
        this.optimizeQueueProcessing();
      }

      // Optimize memory usage
      if (this.metrics.resources.memoryUsage > this.config.memoryLimit) {
        this.optimizeMemoryUsage();
      }

      performanceMonitor.endTimer(timerId, { success: true });
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      logger.error('Error applying real-time optimizations:', 'performance', {}, error as Error);
    }
  }

  /**
   * Optimize latency through various strategies
   */
  private optimizeLatency(): void {
    // Enable connection pooling if not already enabled
    if (!this.config.connectionPooling.enabled) {
      this.config.connectionPooling.enabled = true;
      eventEmitter.emit('realtime:optimization-applied', {
        type: 'connection-pooling',
        reason: 'high-latency'
      });
    }

    // Enable smart batching for high-frequency updates
    if (!this.config.smartBatching) {
      this.config.smartBatching = true;
      eventEmitter.emit('realtime:optimization-applied', {
        type: 'smart-batching',
        reason: 'high-latency'
      });
    }

    // Reduce heartbeat frequency temporarily
    if (this.metrics.presence.heartbeatInterval < 60000) {
      eventEmitter.emit('realtime:heartbeat-optimize', {
        newInterval: Math.min(this.metrics.presence.heartbeatInterval * 1.5, 60000)
      });
    }
  }

  /**
   * Optimize queue processing
   */
  private optimizeQueueProcessing(): void {
    // Enable aggressive optimization
    if (!this.config.aggressiveOptimization) {
      this.config.aggressiveOptimization = true;
      eventEmitter.emit('realtime:optimization-applied', {
        type: 'aggressive-processing',
        reason: 'high-queue-depth'
      });
    }

    // Clear old messages from queue
    const cutoff = Date.now() - 60000; // Remove messages older than 1 minute
    this.messageQueue = this.messageQueue.filter(msg => msg.timestamp > cutoff);

    // Emit queue optimization event
    eventEmitter.emit('realtime:queue-optimize', {
      queueDepth: this.metrics.updates.queueDepth
    });
  }

  /**
   * Optimize memory usage
   */
  private optimizeMemoryUsage(): void {
    // Clear old latency buffer
    this.latencyBuffer = this.latencyBuffer.slice(-100); // Keep only last 100 measurements

    // Clear old message queue
    this.messageQueue = this.messageQueue.slice(-500); // Keep only last 500 messages

    // Clear old alerts
    this.alerts = this.alerts.slice(-20); // Keep only last 20 alerts

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    eventEmitter.emit('realtime:memory-optimized', {
      previousUsage: this.metrics.resources.memoryUsage,
      optimizationType: 'buffer-cleanup'
    });
  }

  /**
   * Handle connection events
   */
  private handleConnectionEvent(): void {
    const timerId = performanceMonitor.startTimer('realtime-connection-event');
    
    // Track connection state changes for stability calculation
    // Implementation would track connection events
    
    performanceMonitor.endTimer(timerId);
  }

  /**
   * Handle message events for latency tracking
   */
  private handleMessageEvent(data: { latency?: number; [key: string]: unknown }): void {
    const now = Date.now();
    const latency = data.latency || 0;
    
    // Add to latency buffer
    this.latencyBuffer.push(latency);
    if (this.latencyBuffer.length > 1000) {
      this.latencyBuffer.shift();
    }

    // Add to message queue
    this.messageQueue.push({
      timestamp: now,
      latency
    });

    // Keep message queue manageable
    if (this.messageQueue.length > 10000) {
      this.messageQueue = this.messageQueue.slice(-5000);
    }
  }

  /**
   * Handle general performance events
   */
  private handlePerformanceEvent(data: { operation?: string; [key: string]: unknown }): void {
    // Track performance events for optimization decisions
    if (data.operation?.includes('realtime')) {
      // Handle real-time specific performance events
    }
  }

  // Metric calculation methods
  private calculateAverageLatency(): number {
    if (this.latencyBuffer.length === 0) return 0;
    return this.latencyBuffer.reduce((sum, lat) => sum + lat, 0) / this.latencyBuffer.length;
  }

  private calculateUptimePercentage(): number {
    const connectionMetrics = this.connectionManager.getConnectionMetrics();
    const totalTime = connectionMetrics.connectionUptime + (connectionMetrics.totalDisconnections * 1000);
    return totalTime > 0 ? (connectionMetrics.connectionUptime / totalTime) * 100 : 100;
  }

  private calculateMessageLatency(): number {
    const recentMessages = this.messageQueue.filter(msg => 
      Date.now() - msg.timestamp < 30000 && msg.latency !== undefined
    );
    if (recentMessages.length === 0) return 0;
    return recentMessages.reduce((sum, msg) => sum + (msg.latency || 0), 0) / recentMessages.length;
  }

  private calculateConnectionStability(): number {
    const connectionMetrics = this.connectionManager.getConnectionMetrics();
    const disconnectRate = connectionMetrics.totalDisconnections / Math.max(connectionMetrics.totalConnections, 1);
    return Math.max(0, 1 - disconnectRate);
  }

  private calculateMessagesPerSecond(): number {
    const oneSecondAgo = Date.now() - 1000;
    const recentMessages = this.messageQueue.filter(msg => msg.timestamp > oneSecondAgo);
    return recentMessages.length;
  }

  private calculateDropRate(): number {
    // Implementation would track dropped messages
    return 0; // Placeholder
  }

  private calculateDuplicateRate(): number {
    // Implementation would track duplicate messages
    return 0; // Placeholder
  }

  private getActiveChannelCount(): number {
    // Would get from connection manager
    return 0; // Placeholder
  }

  private getMemoryUsage(): number {
    if (performance.memory) {
      return performance.memory.usedJSHeapSize / (1024 * 1024); // Convert to MB
    }
    return 0;
  }

  private getCpuUsage(): number {
    // Estimate CPU usage based on performance timing
    return 0; // Placeholder - would need more sophisticated measurement
  }

  private getBatteryImpact(): number {
    // Estimate battery impact based on activity
    return 0; // Placeholder
  }

  private getNetworkBandwidth(): number {
    // Estimate network bandwidth usage
    return 0; // Placeholder
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): RealtimePerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current alerts
   */
  getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Get configuration
   */
  getConfig(): RealtimeOptimizationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RealtimeOptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    eventEmitter.emit('realtime:config-updated', this.config);
  }

  /**
   * Force performance optimization
   */
  forceOptimization(): void {
    logger.debug('Forcing real-time performance optimization...', 'performance', {});
    this.optimizeLatency();
    this.optimizeQueueProcessing();
    this.optimizeMemoryUsage();
  }

  /**
   * Clear all metrics and start fresh
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.alerts = [];
    this.latencyBuffer = [];
    this.messageQueue = [];
    eventEmitter.emit('realtime:performance-reset', {});
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    status: 'excellent' | 'good' | 'poor' | 'critical';
    score: number;
    recommendations: string[];
  } {
    const scores = {
      latency: this.metrics.connection.latency <= this.config.targetLatency ? 1 : 
               this.metrics.connection.latency <= this.config.targetLatency * 2 ? 0.5 : 0,
      stability: this.metrics.connection.connectionStability,
      queueDepth: this.metrics.updates.queueDepth <= this.config.maxQueueDepth ? 1 : 0.5,
      memory: this.metrics.resources.memoryUsage <= this.config.memoryLimit ? 1 : 0.5
    };

    const avgScore = Object.values(scores).reduce((sum, score) => sum + score, 0) / Object.keys(scores).length;
    
    let status: 'excellent' | 'good' | 'poor' | 'critical';
    if (avgScore >= 0.9) status = 'excellent';
    else if (avgScore >= 0.7) status = 'good';
    else if (avgScore >= 0.5) status = 'poor';
    else status = 'critical';

    const recommendations: string[] = [];
    if (scores.latency < 1) recommendations.push('Optimize network latency');
    if (scores.stability < 0.9) recommendations.push('Improve connection stability');
    if (scores.queueDepth < 1) recommendations.push('Optimize message queue processing');
    if (scores.memory < 1) recommendations.push('Reduce memory usage');

    return {
      status,
      score: avgScore,
      recommendations
    };
  }
}

// Export singleton instance
export const realtimePerformanceMonitor = RealtimePerformanceMonitor.getInstance();