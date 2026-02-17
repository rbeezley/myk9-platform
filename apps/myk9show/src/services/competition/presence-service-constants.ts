/**
 * Presence Service Constants
 * Phase 6.2: Live Competition Features
 *
 * Default configuration for the presence tracking service.
 */

import type { PresenceServiceConfig } from './presence-service-types';

export const DEFAULT_PRESENCE_CONFIG: PresenceServiceConfig = {
  heartbeatIntervalMs: 15000, // 15 seconds
  idleTimeoutMs: 2 * 60 * 1000, // 2 minutes
  awayTimeoutMs: 5 * 60 * 1000, // 5 minutes
  offlineTimeoutMs: 10 * 60 * 1000, // 10 minutes
  activityIndicatorTimeoutMs: 30000, // 30 seconds
  maxPresenceHistoryHours: 24,
  enableActivityTracking: true,
  enableAnalytics: true,
};
