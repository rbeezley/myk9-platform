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

// Import types and helpers from extracted modules
import type {
  ConnectionManagerConfig,
  NetworkQualityMetrics,
  ConnectionEvent,
  RecoveryStrategy,
} from './connection-manager-types';
import {
  createDefaultConfig,
  buildConnectionMetrics,
  computeNetworkQualityFromSamples,
  computeAdaptiveConfigUpdates,
  convertToRealtimeHealth,
} from './connection-manager-helpers';

// Re-export types for backward compatibility
export type {
  ConnectionManagerConfig,
  NetworkQualityMetrics,
  ConnectionEvent,
  RecoveryStrategy,
} from './connection-manager-types';

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
    this.config = createDefaultConfig(customConfig);

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
      const metrics = buildConnectionMetrics(realtimeClient.getMetrics());

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
      {
        name: 'quick-reconnect',
        priority: 100,
        condition: (_metrics, health) => health.status === 'offline',
        action: async () => {
          await realtimeClient.forceReconnect();
        },
        timeout: 5000,
      },
      {
        name: 'adjust-config',
        priority: 80,
        condition: (_metrics, health) => health.factors.latency < 50,
        action: async () => {
          realtimeClient.updateConfig({
            heartbeatInterval: Math.min(30000, realtimeClient.getConfig().heartbeatInterval * 1.5),
            reconnectMaxDelay: Math.min(10000, realtimeClient.getConfig().reconnectMaxDelay * 1.2),
          });
          await realtimeClient.forceReconnect();
        },
        timeout: 8000,
      },
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
      {
        name: 'network-optimization',
        priority: 60,
        condition: () =>
          Boolean(this.networkQuality?.latency && this.networkQuality.latency > this.config.degradedThreshold),
        action: async () => {
          realtimeClient.updateConfig({
            targetLatency: 100,
            maxChannels: Math.max(10, realtimeClient.getConfig().maxChannels / 2),
            enableCompressionOptimization: true,
          });
          await realtimeClient.forceReconnect();
        },
        timeout: 12000,
      },
      {
        name: 'full-reset',
        priority: 10,
        condition: () => true,
        action: async () => {
          logger.info('Performing full connection reset', 'realtime');
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

        if (health.status === 'degraded' && this.connectionState.status === 'connected') {
          this.addConnectionEvent('degraded', { latency: health.factors.latency });
          if (this.config.enablePredictiveRecovery) {
            await this.attemptRecovery();
          }
        }

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

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleNetworkOnline.bind(this));
      window.addEventListener('offline', this.handleNetworkOffline.bind(this));
    }

    this.startQualityMonitoring();
  }

  private startQualityMonitoring(): void {
    if (this.qualityMonitorTimer) {
      clearInterval(this.qualityMonitorTimer);
    }

    this.qualityMonitorTimer = setInterval(async () => {
      try {
        const quality = await this.measureNetworkQuality();
        this.networkQuality = quality;

        if (this.config.enableAdaptiveConfiguration) {
          await this.adaptToNetworkQuality(quality);
        }

      } catch (error) {
        logger.warn('Network quality measurement failed', 'realtime', {}, error as Error);
      }
    }, 30000);
  }

  private stopQualityMonitoring(): void {
    if (this.qualityMonitorTimer) {
      clearInterval(this.qualityMonitorTimer);
      this.qualityMonitorTimer = null;
    }
  }

  /**
   * Measure network quality by sampling channel creation latency
   */
  private async measureNetworkQuality(): Promise<NetworkQualityMetrics> {
    const samples: number[] = [];

    for (let i = 0; i < 5; i++) {
      try {
        const sampleStart = performance.now();
        await realtimeClient.createChannel(`quality-test-${i}`, { lowLatency: true });
        samples.push(performance.now() - sampleStart);
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch {
        samples.push(1000);
      }
    }

    return computeNetworkQualityFromSamples(samples);
  }

  /**
   * Adapt configuration to network quality
   */
  private async adaptToNetworkQuality(quality: NetworkQualityMetrics): Promise<void> {
    const currentConfig = realtimeClient.getConfig();
    const updates = computeAdaptiveConfigUpdates(
      quality,
      currentConfig,
      { degradedThreshold: this.config.degradedThreshold, unhealthyThreshold: this.config.unhealthyThreshold }
    );

    if (updates) {
      logger.debug('Adapting configuration to network quality', 'realtime', { updates });
      realtimeClient.updateConfig(updates);
    }
  }

  /**
   * Start adaptive monitoring based on usage patterns
   */
  private startAdaptiveMonitoring(): void {
    setInterval(() => {
      const subscriptions = subscriptionManager.getActiveSubscriptions();
      const metrics = subscriptionManager.getMetrics() as SubscriptionMetrics[];

      if (subscriptions.length > 20 || metrics.some(m => m.messagesReceived > 100)) {
        this.config.healthCheckInterval = Math.max(5000, this.config.healthCheckInterval * 0.8);
      } else if (subscriptions.length < 5 && metrics.every(m => m.messagesReceived < 10)) {
        this.config.healthCheckInterval = Math.min(30000, this.config.healthCheckInterval * 1.2);
      }
    }, 60000);
  }

  private async checkConnectionHealth(): Promise<ClientConnectionHealth> {
    return realtimeClient.getConnectionHealth();
  }

  private async handleNetworkOnline(): Promise<void> {
    logger.info('Network came online', 'realtime');
    if (this.connectionState.status !== 'connected') {
      await this.connect();
    }
  }

  private handleNetworkOffline(): void {
    logger.warn('Network went offline', 'realtime');
    this.updateConnectionState('disconnected', 'Network offline');
    this.addConnectionEvent('disconnected', { reason: 'Network offline' });
  }

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

    if (prevState !== status) {
      this.notifyListeners('stateChange', {
        type: status as ConnectionEvent['type'],
        timestamp: new Date(),
        ...(error !== undefined && { details: { error: new Error(error) } }),
      });
    }
  }

  private addConnectionEvent(
    type: ConnectionEvent['type'],
    details?: ConnectionEvent['details']
  ): void {
    const event: ConnectionEvent = {
      type,
      timestamp: new Date(),
      ...(details !== undefined && { details }),
    };

    this.connectionHistory.push(event);

    if (this.connectionHistory.length > 100) {
      this.connectionHistory.shift();
    }

    this.notifyListeners(type, event);
  }

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

  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  getConnectionMetrics(): ConnectionMetrics {
    return buildConnectionMetrics(realtimeClient.getMetrics());
  }

  getConnectionHealth(): RealtimeConnectionHealth {
    return convertToRealtimeHealth(realtimeClient.getConnectionHealth());
  }

  getNetworkQuality(): NetworkQualityMetrics | null {
    return this.networkQuality;
  }

  getConnectionHistory(): ConnectionEvent[] {
    return [...this.connectionHistory];
  }

  getConfig(): ConnectionManagerConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<ConnectionManagerConfig>): void {
    this.config = { ...this.config, ...updates };

    if (updates.healthCheckInterval) {
      this.startHealthMonitoring();
    }
  }

  getRecoveryStrategies(): RecoveryStrategy[] {
    return [...this.recoveryStrategies];
  }

  addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    this.recoveryStrategies.sort((a, b) => b.priority - a.priority);
  }

  async cleanup(): Promise<void> {
    this.stopHealthMonitoring();
    this.stopQualityMonitoring();

    this.retryEngine.cancelAllRetries();
    this.eventListeners.clear();

    await this.disconnect();

    logger.info('Connection manager cleaned up', 'realtime');
  }
}

// Create singleton instance
export const connectionManager = new ConnectionManager();

export default ConnectionManager;
