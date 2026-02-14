/**
 * Helper functions for Connection Manager
 * Phase 6.1: Real-time Infrastructure
 *
 * Pure/stateless utility functions extracted from ConnectionManager
 * for better testability and separation of concerns.
 */

import type { ConnectionMetrics } from '../../types/realtime-types';
import type { ConnectionHealth as RealtimeConnectionHealth } from '../../types/realtime-types';
import type { RealtimeMetrics, ConnectionHealth as ClientConnectionHealth } from './realtimeClient';
import type { ConnectionManagerConfig, NetworkQualityMetrics } from './connection-manager-types';

/**
 * Create a default ConnectionManagerConfig with optional overrides.
 */
export function createDefaultConfig(
  overrides?: Partial<ConnectionManagerConfig>
): ConnectionManagerConfig {
  return {
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

    ...overrides,
  };
}

/**
 * Convert RealtimeMetrics from the realtime client into the
 * ConnectionMetrics format expected by recovery strategies and consumers.
 */
export function buildConnectionMetrics(
  realtimeMetrics: RealtimeMetrics
): ConnectionMetrics {
  return {
    totalConnections: realtimeMetrics.reconnectCount + 1,
    totalDisconnections: realtimeMetrics.reconnectCount,
    averageReconnectTime: realtimeMetrics.averageLatency || 0,
    lastReconnectTime: realtimeMetrics.connectionLatency || 0,
    connectionUptime: realtimeMetrics.connectionUptime || 0,
  };
}

/**
 * Compute NetworkQualityMetrics from an array of latency samples.
 * Pure computation with no side effects.
 */
export function computeNetworkQualityFromSamples(
  samples: number[]
): NetworkQualityMetrics {
  const avgLatency = samples.reduce((sum, l) => sum + l, 0) / samples.length;
  const jitter = Math.sqrt(
    samples.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / samples.length
  );

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
 * Compute adaptive configuration updates based on current network quality.
 * Returns a partial config update object, or null if no changes needed.
 */
export function computeAdaptiveConfigUpdates(
  quality: NetworkQualityMetrics,
  currentConfig: { heartbeatInterval: number; reconnectMaxDelay: number; targetLatency: number; maxChannels: number },
  thresholds: { degradedThreshold: number; unhealthyThreshold: number }
): Partial<typeof currentConfig & { enableCompressionOptimization: boolean }> | null {
  if (quality.latency > thresholds.unhealthyThreshold) {
    // Poor network - optimize for reliability
    return {
      heartbeatInterval: Math.min(60000, currentConfig.heartbeatInterval * 2),
      reconnectMaxDelay: Math.min(30000, currentConfig.reconnectMaxDelay * 2),
      targetLatency: Math.max(currentConfig.targetLatency, quality.latency * 1.5),
      maxChannels: Math.max(5, Math.floor(currentConfig.maxChannels * 0.5)),
      enableCompressionOptimization: true,
    };
  } else if (quality.latency < thresholds.degradedThreshold && quality.stability > 80) {
    // Good network - optimize for performance
    return {
      heartbeatInterval: Math.max(10000, currentConfig.heartbeatInterval * 0.8),
      reconnectMaxDelay: Math.max(2000, currentConfig.reconnectMaxDelay * 0.8),
      targetLatency: Math.max(25, quality.latency * 0.8),
      maxChannels: Math.min(100, currentConfig.maxChannels * 1.2),
      enableCompressionOptimization: false,
    };
  }

  return null;
}

/**
 * Convert the client-level ConnectionHealth into the RealtimeConnectionHealth
 * format expected by consumers of the connection manager.
 */
export function convertToRealtimeHealth(
  clientHealth: ClientConnectionHealth
): RealtimeConnectionHealth {
  return {
    isConnected: clientHealth.status === 'healthy' || clientHealth.status === 'degraded',
    connectionQuality:
      clientHealth.status === 'healthy'
        ? 'excellent'
        : clientHealth.status === 'degraded'
          ? 'good'
          : 'poor',
    latency: clientHealth.factors?.latency || 0,
    packetLoss: clientHealth.factors?.stability
      ? Math.max(0, (100 - clientHealth.factors.stability) / 100)
      : 0,
  };
}
