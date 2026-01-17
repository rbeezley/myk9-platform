/**
 * Connection Manager for Real-time Infrastructure
 * Phase 6.1: Real-time Infrastructure
 * 
 * Manages connection state, retry logic, and health monitoring
 * with exponential backoff and intelligent recovery strategies.
 */

import { realtimeClient } from './realtimeClient';
import { subscriptionManager } from './subscriptionManager';
import { errorMonitor } from '../../lib/errorMonitoring';
import { RetryEngine } from '../../lib/connectionRecovery';
import { logger } from '../../services/LoggingService';
import type { ConnectionState, ConnectionMetrics } from '../../types/realtime-types';
import type { ConnectionHealth as RealtimeConnectionHealth } from '../../types/realtime-types';
import type { ConnectionHealth as ClientConnectionHealth } from './realtimeClient';
import type { SubscriptionMetrics } from './subscriptionManager';

export interface ConnectionManagerConfig {
  // Retry configuration
  maxRetryAttempts: number;
  baseRetryDelay: number;
  maxRetryDelay: number;
  retryMultiplier: number;
  
  // Health monitoring
  healthCheckInterval: number;
  degradedThreshold: number; // Latency threshold for degraded state
  unhealthyThreshold: number; // Latency threshold for unhealthy state
  
  // Recovery strategies
  enablePredictiveRecovery: boolean;
  enableQualityMonitoring: boolean;
  enableAdaptiveConfiguration: boolean;
  
  // Performance optimization
  enableConnectionPooling: boolean;
  maxConcurrentConnections: number;
  connectionTimeout: number;
}

export interface NetworkQualityMetrics {
  bandwidth: number; // Mbps
  latency: number; // ms
  packetLoss: number; // percentage
  jitter: number; // ms
  stability: number; // 0-100 score
  timestamp: Date;
}

export interface ConnectionEvent {
  type: 'connected' | 'disconnected' | 'reconnecting' | 'error' | 'degraded' | 'recovered';
  timestamp: Date;
  details?: {
    reason?: string;
    attempt?: number;
    latency?: number;
    error?: Error;
  };
}

export interface RecoveryStrategy {
  name: string;
  priority: number;
  condition: (metrics: ConnectionMetrics, health: ClientConnectionHealth) => boolean;
  action: () => Promise<void>;
  timeout: number;
}

/**
 * Advanced Connection Manager with Intelligent Recovery
 */
export class ConnectionManager {
  private config: ConnectionManagerConfig;
  private retryEngine: RetryEngine;
  private connectionState: ConnectionState;
  private networkQuality: NetworkQualityMetrics | null = null;
  private connectionHistory: ConnectionEvent[] = [];
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private qualityMonitorTimer: NodeJS.Timeout | null = null;
  private recoveryStrategies: RecoveryStrategy[] = [];
  private isRecovering = false;
  private eventListeners = new Map<string, Set<(event: ConnectionEvent) => void>>();

  constructor(customConfig?: Partial<ConnectionManagerConfig>) {
    this.config = {
      maxRetryAttempts: 15,
      baseRetryDelay: 500,
      maxRetryDelay: 10000,
      retryMultiplier: 1.5,
      
      healthCheckInterval: 10000, // 10 seconds
      degradedThreshold: 200, // 200ms
      unhealthyThreshold: 1000, // 1 second
      
      enablePredictiveRecovery: true,
      enableQualityMonitoring: true,
      enableAdaptiveConfiguration: true,
      
      enableConnectionPooling: false, // For future use
      maxConcurrentConnections: 5,
      connectionTimeout: 8000,
      
      ...customConfig,
    };

    this.retryEngine = new RetryEngine();
    this.connectionState = {
      status: 'disconnected',
      lastConnected: null,
      reconnectAttempts: 0,
      error: null,
    };

    this.initializeRecoveryStrategies();
    this.startHealthMonitoring();
    this.setupNetworkMonitoring();
  }

  /**
   * Initialize connection with retry logic
   */
  async connect(): Promise<void> {
    if (this.connectionState.status === 'connecting') {
      logger.debug('Connection already in progress', 'realtime');
      return;
    }

    this.updateConnectionState('connecting');
    this.addConnectionEvent('reconnecting', { attempt: this.connectionState.reconnectAttempts + 1 });

    try {
      await this.retryEngine.executeWithRetry(
        async () => {
          await realtimeClient.connect();
          
          // Verify connection health
          const health = await this.checkConnectionHealth();
          if (health.status === 'unhealthy') {
            throw new Error('Connection established but health check failed');
          }
          
          return true;
        },
        {
          maxAttempts: this.config.maxRetryAttempts,
          baseDelay: this.config.baseRetryDelay,
          maxDelay: this.config.maxRetryDelay,
          backoffMultiplier: this.config.retryMultiplier,
          jitter: true,
          retryCondition: (error: Error, attempt: number) => {
            logger.warn('Connection attempt failed', 'realtime', { attempt, error: error.message });
            return attempt < this.config.maxRetryAttempts;
          },
        },
        'realtime-connection'
      );

      // Connection successful
      this.updateConnectionState('connected');
      this.addConnectionEvent('connected');
      
      // Start adaptive monitoring
      if (this.config.enableAdaptiveConfiguration) {
        this.startAdaptiveMonitoring();
      }

      logger.info('Real-time connection established successfully', 'realtime');

    } catch (error) {
      this.handleConnectionFailure(error as Error);
      throw error;
    }
  }

  /**
   * Disconnect with cleanup
   */
  async disconnect(): Promise<void> {
    this.updateConnectionState('disconnected');
    this.addConnectionEvent('disconnected');
    
    // Stop monitoring
    this.stopHealthMonitoring();
    this.stopQualityMonitoring();
    
    // Cleanup subscriptions
    await subscriptionManager.cleanup();
    
    // Disconnect client
    await realtimeClient.disconnect();

    logger.info('Real-time connection disconnected', 'realtime');
  }

  /**
   * Force reconnection
   */
  async forceReconnect(): Promise<void> {
    logger.debug('Forcing reconnection', 'realtime');

    try {
      await this.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.connect();
    } catch (error) {
      this.handleConnectionFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle connection failure with recovery strategies
   */
  private async handleConnectionFailure(error: Error): Promise<void> {
    this.updateConnectionState('error', error.message);
    this.addConnectionEvent('error', { error });
    
    errorMonitor.captureError(error, {
      additionalData: {
        connectionState: this.connectionState,
        networkQuality: this.networkQuality,
        reconnectAttempts: this.connectionState.reconnectAttempts,
      }
    });

    // Try recovery strategies if not already recovering
    if (!this.isRecovering && this.config.enablePredictiveRecovery) {
      await this.attemptRecovery();
    }
  }

  /**
   * Attempt intelligent recovery using strategies
   */
  private async attemptRecovery(): Promise<void> {
    if (this.isRecovering) return;
    
    this.isRecovering = true;
    logger.debug('Attempting intelligent recovery', 'realtime');

    try {
      const health = realtimeClient.getConnectionHealth();
      const realtimeMetrics = realtimeClient.getMetrics();
      
      // Convert to expected ConnectionMetrics format
      const metrics: ConnectionMetrics = {
        totalConnections: realtimeMetrics.reconnectCount + 1,
        totalDisconnections: realtimeMetrics.reconnectCount,
        averageReconnectTime: realtimeMetrics.averageLatency || 0,
        lastReconnectTime: realtimeMetrics.connectionLatency || 0,
        connectionUptime: realtimeMetrics.connectionUptime || 0
      };

      // Try recovery strategies in priority order
      const applicableStrategies = this.recoveryStrategies
        .filter(strategy => strategy.condition(metrics, health))
        .sort((a, b) => b.priority - a.priority);

      for (const strategy of applicableStrategies) {
        logger.debug('Trying recovery strategy', 'realtime', { strategy: strategy.name });
        
        try {
          await Promise.race([
            strategy.action(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Strategy timeout')), strategy.timeout)
            ),
          ]);
          
          // Check if recovery was successful
          const newHealth = await this.checkConnectionHealth();
          if (newHealth.status !== 'unhealthy') {
            logger.info('Recovery successful', 'realtime', { strategy: strategy.name });
            this.addConnectionEvent('recovered');
            break;
          }
          
        } catch (error) {
          logger.warn('Recovery strategy failed', 'realtime', { strategy: strategy.name }, error as Error);
        }
      }

    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Initialize recovery strategies
   */
  private initializeRecoveryStrategies(): void {
    this.recoveryStrategies = [
      // High priority: Quick reconnection
      {
        name: 'quick-reconnect',
        priority: 100,
        condition: (_metrics, health) => health.status === 'offline',
        action: async () => {
          await realtimeClient.forceReconnect();
        },
        timeout: 5000,
      },

      // Medium priority: Configuration adjustment
      {
        name: 'adjust-config',
        priority: 80,
        condition: (_metrics, health) => health.factors.latency < 50,
        action: async () => {
          // Adjust configuration for better performance
          realtimeClient.updateConfig({
            heartbeatInterval: Math.min(30000, realtimeClient.getConfig().heartbeatInterval * 1.5),
            reconnectMaxDelay: Math.min(10000, realtimeClient.getConfig().reconnectMaxDelay * 1.2),
          });
          await realtimeClient.forceReconnect();
        },
        timeout: 8000,
      },

      // Medium priority: Clear and reconnect
      {
        name: 'clear-and-reconnect',
        priority: 70,
        condition: (metrics) => (metrics.totalDisconnections || 0) > 3,
        action: async () => {
          await subscriptionManager.cleanup();
          await realtimeClient.disconnect();
          await new Promise(resolve => setTimeout(resolve, 2000));
          await realtimeClient.connect();
        },
        timeout: 10000,
      },

      // Low priority: Network optimization
      {
        name: 'network-optimization',
        priority: 60,
        condition: () => 
          Boolean(this.networkQuality?.latency && this.networkQuality.latency > this.config.degradedThreshold),
        action: async () => {
          // Optimize for poor network conditions
          realtimeClient.updateConfig({
            targetLatency: 100, // Increase target latency
            maxChannels: Math.max(10, realtimeClient.getConfig().maxChannels / 2),
            enableCompressionOptimization: true,
          });
          await realtimeClient.forceReconnect();
        },
        timeout: 12000,
      },

      // Last resort: Full reset
      {
        name: 'full-reset',
        priority: 10,
        condition: () => true, // Always applicable as last resort
        action: async () => {
          logger.info('Performing full connection reset', 'realtime');

          // Reset all configurations to defaults
          realtimeClient.updateConfig({
            heartbeatInterval: 15000,
            reconnectBaseDelay: 250,
            reconnectMaxDelay: 5000,
            targetLatency: 50,
            maxChannels: 50,
          });
          
          await this.disconnect();
          await new Promise(resolve => setTimeout(resolve, 5000));
          await this.connect();
        },
        timeout: 15000,
      },
    ];
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        const health = await this.checkConnectionHealth();
        
        // Handle degraded connection
        if (health.status === 'degraded' && this.connectionState.status === 'connected') {
          this.addConnectionEvent('degraded', { latency: health.factors.latency });
          
          if (this.config.enablePredictiveRecovery) {
            await this.attemptRecovery();
          }
        }
        
        // Handle unhealthy connection
        if (health.status === 'unhealthy') {
          this.updateConnectionState('error', 'Connection unhealthy');
          
          if (this.config.enablePredictiveRecovery) {
            await this.attemptRecovery();
          }
        }

      } catch (error) {
        logger.warn('Health check failed', 'realtime', {}, error as Error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Setup network quality monitoring
   */
  private setupNetworkMonitoring(): void {
    if (!this.config.enableQualityMonitoring) return;

    // Monitor network events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleNetworkOnline.bind(this));
      window.addEventListener('offline', this.handleNetworkOffline.bind(this));
    }

    // Start quality monitoring
    this.startQualityMonitoring();
  }

  /**
   * Start network quality monitoring
   */
  private startQualityMonitoring(): void {
    if (this.qualityMonitorTimer) {
      clearInterval(this.qualityMonitorTimer);
    }

    this.qualityMonitorTimer = setInterval(async () => {
      try {
        const quality = await this.measureNetworkQuality();
        this.networkQuality = quality;
        
        // Adapt configuration based on quality
        if (this.config.enableAdaptiveConfiguration) {
          await this.adaptToNetworkQuality(quality);
        }

      } catch (error) {
        logger.warn('Network quality measurement failed', 'realtime', {}, error as Error);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop network quality monitoring
   */
  private stopQualityMonitoring(): void {
    if (this.qualityMonitorTimer) {
      clearInterval(this.qualityMonitorTimer);
      this.qualityMonitorTimer = null;
    }
  }

  /**
   * Measure network quality
   */
  private async measureNetworkQuality(): Promise<NetworkQualityMetrics> {
    // const startTime = performance.now(); // Future use for latency measurement
    const samples: number[] = [];
    
    // Take multiple latency samples
    for (let i = 0; i < 5; i++) {
      try {
        const sampleStart = performance.now();
        await realtimeClient.createChannel(`quality-test-${i}`, { lowLatency: true });
        const latency = performance.now() - sampleStart;
        samples.push(latency);
        
        // Small delay between samples
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        samples.push(1000); // Assume high latency on error
      }
    }

    const avgLatency = samples.reduce((sum, l) => sum + l, 0) / samples.length;
    const jitter = Math.sqrt(samples.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / samples.length);
    
    // Calculate stability based on jitter and error rate
    const stability = Math.max(0, 100 - (jitter / avgLatency) * 100);

    return {
      bandwidth: 0, // Would need additional testing for bandwidth
      latency: avgLatency,
      packetLoss: 0, // Would need packet loss detection
      jitter,
      stability,
      timestamp: new Date(),
    };
  }

  /**
   * Adapt configuration to network quality
   */
  private async adaptToNetworkQuality(quality: NetworkQualityMetrics): Promise<void> {
    const config = realtimeClient.getConfig();
    let updates: Partial<typeof config> = {};

    // Adjust based on latency
    if (quality.latency > this.config.unhealthyThreshold) {
      // Poor network - optimize for reliability
      updates = {
        heartbeatInterval: Math.min(60000, config.heartbeatInterval * 2),
        reconnectMaxDelay: Math.min(30000, config.reconnectMaxDelay * 2),
        targetLatency: Math.max(config.targetLatency, quality.latency * 1.5),
        maxChannels: Math.max(5, Math.floor(config.maxChannels * 0.5)),
        enableCompressionOptimization: true,
      };
    } else if (quality.latency < this.config.degradedThreshold && quality.stability > 80) {
      // Good network - optimize for performance
      updates = {
        heartbeatInterval: Math.max(10000, config.heartbeatInterval * 0.8),
        reconnectMaxDelay: Math.max(2000, config.reconnectMaxDelay * 0.8),
        targetLatency: Math.max(25, quality.latency * 0.8),
        maxChannels: Math.min(100, config.maxChannels * 1.2),
        enableCompressionOptimization: false,
      };
    }

    if (Object.keys(updates).length > 0) {
      logger.debug('Adapting configuration to network quality', 'realtime', { updates });
      realtimeClient.updateConfig(updates);
    }
  }

  /**
   * Start adaptive monitoring based on usage patterns
   */
  private startAdaptiveMonitoring(): void {
    // Monitor subscription patterns and adapt accordingly
    setInterval(() => {
      const subscriptions = subscriptionManager.getActiveSubscriptions();
      const metrics = subscriptionManager.getMetrics() as SubscriptionMetrics[];
      
      // Adjust monitoring frequency based on activity
      if (subscriptions.length > 20 || metrics.some(m => m.messagesReceived > 100)) {
        // High activity - increase monitoring
        this.config.healthCheckInterval = Math.max(5000, this.config.healthCheckInterval * 0.8);
      } else if (subscriptions.length < 5 && metrics.every(m => m.messagesReceived < 10)) {
        // Low activity - reduce monitoring
        this.config.healthCheckInterval = Math.min(30000, this.config.healthCheckInterval * 1.2);
      }
    }, 60000); // Check every minute
  }

  /**
   * Check connection health
   */
  private async checkConnectionHealth(): Promise<ClientConnectionHealth> {
    return realtimeClient.getConnectionHealth();
  }

  /**
   * Handle network online event
   */
  private async handleNetworkOnline(): Promise<void> {
    logger.info('Network came online', 'realtime');
    if (this.connectionState.status !== 'connected') {
      await this.connect();
    }
  }

  /**
   * Handle network offline event
   */
  private handleNetworkOffline(): void {
    logger.warn('Network went offline', 'realtime');
    this.updateConnectionState('disconnected', 'Network offline');
    this.addConnectionEvent('disconnected', { reason: 'Network offline' });
  }

  /**
   * Update connection state
   */
  private updateConnectionState(
    status: ConnectionState['status'], 
    error?: string
  ): void {
    const prevState = this.connectionState.status;
    
    this.connectionState = {
      ...this.connectionState,
      status,
      error: error || null,
      ...(status === 'connected' && { lastConnected: new Date() }),
      ...(status === 'connecting' && { reconnectAttempts: this.connectionState.reconnectAttempts + 1 }),
      ...(status === 'connected' && { reconnectAttempts: 0 }),
    };

    // Notify listeners if status changed
    if (prevState !== status) {
      this.notifyListeners('stateChange', {
        type: status as ConnectionEvent['type'],
        timestamp: new Date(),
        details: { error: new Error(error) },
      });
    }
  }

  /**
   * Add connection event to history
   */
  private addConnectionEvent(
    type: ConnectionEvent['type'], 
    details?: ConnectionEvent['details']
  ): void {
    const event: ConnectionEvent = {
      type,
      timestamp: new Date(),
      details,
    };

    this.connectionHistory.push(event);
    
    // Keep only recent history (last 100 events)
    if (this.connectionHistory.length > 100) {
      this.connectionHistory.shift();
    }

    // Notify listeners
    this.notifyListeners(type, event);
  }

  /**
   * Add event listener
   */
  addEventListener(
    event: string,
    listener: (event: ConnectionEvent) => void
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    this.eventListeners.get(event)!.add(listener);
    
    return () => {
      this.eventListeners.get(event)?.delete(listener);
    };
  }

  /**
   * Notify event listeners
   */
  private notifyListeners(event: string, data: ConnectionEvent): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          logger.error('Error in connection event listener', 'realtime', { event }, error as Error);
        }
      });
    }
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Get connection metrics
   */
  getConnectionMetrics(): ConnectionMetrics {
    const realtimeMetrics = realtimeClient.getMetrics();
    
    // Convert from realtime metrics to connection metrics interface
    return {
      totalConnections: realtimeMetrics.reconnectCount + 1,
      totalDisconnections: realtimeMetrics.reconnectCount,
      averageReconnectTime: realtimeMetrics.averageLatency || 0,
      lastReconnectTime: realtimeMetrics.connectionLatency || 0,
      connectionUptime: realtimeMetrics.connectionUptime || 0
    };
  }

  /**
   * Get connection health
   */
  getConnectionHealth(): RealtimeConnectionHealth {
    const clientHealth = realtimeClient.getConnectionHealth();
    
    // Convert from client interface to expected interface
    return {
      isConnected: clientHealth.status === 'healthy' || clientHealth.status === 'degraded',
      connectionQuality: clientHealth.status === 'healthy' ? 'excellent' : 
                        clientHealth.status === 'degraded' ? 'good' :
                        clientHealth.status === 'unhealthy' ? 'poor' : 'poor',
      latency: clientHealth.factors?.latency || 0,
      packetLoss: clientHealth.factors?.stability ? Math.max(0, (100 - clientHealth.factors.stability) / 100) : 0
    };
  }

  /**
   * Get network quality
   */
  getNetworkQuality(): NetworkQualityMetrics | null {
    return this.networkQuality;
  }

  /**
   * Get connection history
   */
  getConnectionHistory(): ConnectionEvent[] {
    return [...this.connectionHistory];
  }

  /**
   * Get configuration
   */
  getConfig(): ConnectionManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ConnectionManagerConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Restart monitoring if intervals changed
    if (updates.healthCheckInterval) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Get recovery strategies
   */
  getRecoveryStrategies(): RecoveryStrategy[] {
    return [...this.recoveryStrategies];
  }

  /**
   * Add custom recovery strategy
   */
  addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    // Sort by priority
    this.recoveryStrategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    this.stopHealthMonitoring();
    this.stopQualityMonitoring();
    
    // Clear retry engine
    this.retryEngine.cancelAllRetries();
    
    // Clear event listeners
    this.eventListeners.clear();
    
    // Disconnect
    await this.disconnect();

    logger.info('Connection manager cleaned up', 'realtime');
  }
}

// Create singleton instance
export const connectionManager = new ConnectionManager();

export default ConnectionManager;