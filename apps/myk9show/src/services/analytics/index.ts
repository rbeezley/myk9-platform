// Re-export all analytics types and services
export * from './SyncAnalyticsService';

// Configuration presets
export const ANALYTICS_PRESETS = {
  development: {
    samplingRate: 1.0,
    retentionDays: 7,
    aggregationIntervals: [5, 60] as number[],
    alertThresholds: {
      failureRate: 0.2,
      avgSyncTime: 10000,
      conflictRate: 0.1,
      bandwidthUsage: 50 * 1024 * 1024
    },
    enableRealTimeAlerts: true
  },
  production: {
    samplingRate: 0.1,
    retentionDays: 30,
    aggregationIntervals: [15, 60, 1440] as number[],
    alertThresholds: {
      failureRate: 0.05,
      avgSyncTime: 3000,
      conflictRate: 0.02,
      bandwidthUsage: 10 * 1024 * 1024
    },
    enableRealTimeAlerts: true
  },
  testing: {
    samplingRate: 1.0,
    retentionDays: 1,
    aggregationIntervals: [1] as number[],
    alertThresholds: {
      failureRate: 0.5,
      avgSyncTime: 30000,
      conflictRate: 0.5,
      bandwidthUsage: 100 * 1024 * 1024
    },
    enableRealTimeAlerts: false
  }
} as const;