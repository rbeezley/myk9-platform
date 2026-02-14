/**
 * Type definitions for Connection Manager
 * Phase 6.1: Real-time Infrastructure
 *
 * Contains all interfaces and type definitions used by the
 * ConnectionManager class and its helper functions.
 */

import type { ConnectionMetrics } from '../../types/realtime-types';
import type { ConnectionHealth as ClientConnectionHealth } from './realtimeClient';

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
