/**
 * Production Monitoring Constants
 *
 * Default configuration values and alert rules used by ProductionMonitoringService.
 */

import type { MonitoringConfig } from '../../types/deployment-types';
import type { AlertRule } from './production-monitoring-types';

/** Default monitoring configuration */
export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  errorTracking: {
    provider: 'sentry',
    dsn: 'https://mock-sentry-dsn@sentry.io/project',
    environment: 'production',
    sampleRate: 1.0,
    enableSourceMaps: true,
    filterErrors: ['Network Error', 'Script error'],
  },
  performanceMonitoring: {
    provider: 'sentry',
    apiKey: 'mock-api-key',
    traceSampleRate: 0.1,
    enableProfiling: false,
    enableWebVitals: true,
  },
  userAnalytics: {
    provider: 'mixpanel',
    apiKey: 'mock-mixpanel-key',
    trackPageViews: true,
    trackUserEvents: true,
    enableHeatmaps: false,
  },
  customMetrics: [],
};

/** Default alert rules applied on service initialization */
export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'high_error_rate',
    name: 'High Error Rate',
    description: 'Error rate exceeds 5% over 5 minutes',
    metric: 'error_rate',
    condition: {
      operator: 'gt',
      timeWindow: 5,
      aggregation: 'avg',
    },
    threshold: 0.05,
    severity: 'error',
    enabled: true,
    channels: ['email', 'slack'],
    cooldown: 15,
  },
  {
    id: 'slow_response_time',
    name: 'Slow Response Time',
    description: 'Average response time exceeds 2 seconds',
    metric: 'response_time',
    condition: {
      operator: 'gt',
      timeWindow: 10,
      aggregation: 'avg',
    },
    threshold: 2000,
    severity: 'warning',
    enabled: true,
    channels: ['slack'],
    cooldown: 30,
  },
];

/** Monitoring loop intervals (in milliseconds) */
export const MONITORING_INTERVALS = {
  SYSTEM_METRICS: 60000, // Every minute
  DATA_CLEANUP: 300000, // Every 5 minutes
  ALERT_EVALUATION: 30000, // Every 30 seconds
} as const;

/** Data retention period (in milliseconds) */
export const DATA_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
