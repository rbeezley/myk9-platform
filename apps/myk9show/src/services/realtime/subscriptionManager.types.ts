/**
 * Types for Subscription Manager
 * Phase 6.1: Real-time Infrastructure
 */

import type { Priority } from '../../types/realtime-types';

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
