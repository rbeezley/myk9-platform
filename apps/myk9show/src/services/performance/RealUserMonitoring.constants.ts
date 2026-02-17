/**
 * Constants for RealUserMonitoringService
 */

import type { PerformanceBudget } from './RealUserMonitoring.types';

/** Performance budgets based on Core Web Vitals thresholds */
export const PERFORMANCE_BUDGETS: PerformanceBudget[] = [
  {
    metric: 'LCP',
    threshold: 2500,
    severity: 'error',
    description: 'Largest Contentful Paint should be under 2.5s',
  },
  {
    metric: 'FCP',
    threshold: 1800,
    severity: 'warning',
    description: 'First Contentful Paint should be under 1.8s',
  },
  {
    metric: 'CLS',
    threshold: 0.1,
    severity: 'error',
    description: 'Cumulative Layout Shift should be under 0.1',
  },
  {
    metric: 'FID',
    threshold: 100,
    severity: 'error',
    description: 'First Input Delay should be under 100ms',
  },
  {
    metric: 'TTFB',
    threshold: 600,
    severity: 'warning',
    description: 'Time to First Byte should be under 600ms',
  },
  {
    metric: 'INP',
    threshold: 200,
    severity: 'error',
    description: 'Interaction to Next Paint should be under 200ms',
  },
];

/** Memory monitoring interval in milliseconds */
export const MEMORY_MONITORING_INTERVAL = 30000;

/** Slow resource load time threshold in milliseconds */
export const SLOW_RESOURCE_THRESHOLD = 2000;

/** Long task alert threshold in milliseconds */
export const LONG_TASK_ALERT_THRESHOLD = 200;

/** Max custom metrics before trimming */
export const MAX_CUSTOM_METRICS = 1000;

/** Number of custom metrics to keep after trimming */
export const CUSTOM_METRICS_TRIM_SIZE = 500;

/** Max errors before trimming */
export const MAX_ERRORS = 100;

/** Number of errors to keep after trimming */
export const ERRORS_TRIM_SIZE = 50;

/** Max alerts before trimming */
export const MAX_ALERTS = 50;

/** Number of alerts to keep after trimming */
export const ALERTS_TRIM_SIZE = 25;

/** Max stored sessions in localStorage */
export const MAX_STORED_SESSIONS = 10;
