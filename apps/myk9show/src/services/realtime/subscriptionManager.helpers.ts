/**
 * Helper functions for Subscription Manager
 * Phase 6.1: Real-time Infrastructure
 */

import type { PresenceTrackingData } from '../../types/realtime-types';
import type { SubscriptionConfig, SubscriptionMetrics } from './subscriptionManager.types';

/** Generate channel name based on configuration */
export function generateChannelName(config: SubscriptionConfig): string {
  const parts = [config.table];
  if (config.filter) {
    parts.push(encodeURIComponent(config.filter));
  }
  return parts.join('-');
}

/** Initialize metrics for a subscription */
export function createInitialMetrics(subscriptionId: string): SubscriptionMetrics {
  return {
    subscriptionId,
    messagesReceived: 0,
    messagesProcessed: 0,
    averageProcessingTime: 0,
    errorCount: 0,
    lastActivity: null,
    isActive: true,
    memoryUsage: 0,
  };
}

/** Parse presence state from Supabase format */
export function parsePresenceState(state: Record<string, unknown>): PresenceTrackingData[] {
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
