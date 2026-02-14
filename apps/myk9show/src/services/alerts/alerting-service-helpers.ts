/**
 * Pure helper functions for the AlertingService.
 *
 * All functions in this module are stateless and do not depend on class
 * instance data, making them easy to test and reuse independently.
 */

import type {
  AlertConfig,
  AlertRule,
  AlertSeverity,
  AlertThreshold,
} from '../../types/alert-types';
import {
  AlertType as AlertTypeEnum,
  AlertSeverity as AlertSeverityEnum,
  NotificationChannel,
} from '../../types/alert-types';
import type { SyncMetrics } from '../../types/analytics-types';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Generate a unique alert ID. */
export function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Generate a unique rule ID. */
export function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** Derive a grouping key from the rule and optional details. */
export function generateGroupKey(
  rule: AlertRule,
  details?: Record<string, unknown>,
): string {
  if (!rule.groupBy || !details) return rule.id;

  const groupValues = rule.groupBy
    .map((field) => details[field] || '')
    .join('|');
  return `${rule.id}:${groupValues}`;
}

// ---------------------------------------------------------------------------
// Metric evaluation
// ---------------------------------------------------------------------------

/** Safely extract a numeric value from a nested metrics object using a dot-separated path. */
export function getMetricValue(
  metricPath: string,
  metrics: SyncMetrics,
): number | undefined {
  const parts = metricPath.split('.');
  let value: unknown = metrics;

  for (const part of parts) {
    value = (value as Record<string, unknown>)?.[part];
    if (value === undefined) return undefined;
  }

  return typeof value === 'number' ? value : undefined;
}

/** Evaluate a single threshold against a set of metrics. */
export function evaluateThreshold(
  threshold: AlertThreshold,
  metrics: SyncMetrics,
): boolean {
  const value = getMetricValue(threshold.metric, metrics);
  if (value === undefined) return false;

  switch (threshold.operator) {
    case 'gt':
      return value > threshold.value;
    case 'lt':
      return value < threshold.value;
    case 'gte':
      return value >= threshold.value;
    case 'lte':
      return value <= threshold.value;
    case 'eq':
      return value === threshold.value;
    case 'neq':
      return value !== threshold.value;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Alert content generation
// ---------------------------------------------------------------------------

/** Generate a human-readable alert title from a rule. */
export function generateAlertTitle(
  rule: AlertRule,
  _metrics: SyncMetrics,
): string {
  switch (rule.type) {
    case AlertTypeEnum.SYNC_FAILURE:
      return `Sync Failure Rate Alert: ${rule.name}`;
    case AlertTypeEnum.CONFLICT_SURGE:
      return `Conflict Surge Detected: ${rule.name}`;
    case AlertTypeEnum.PERFORMANCE_DEGRADATION:
      return `Performance Degradation: ${rule.name}`;
    case AlertTypeEnum.DATA_INTEGRITY:
      return `Data Integrity Issue: ${rule.name}`;
    case AlertTypeEnum.NETWORK_CONNECTIVITY:
      return `Network Connectivity Alert: ${rule.name}`;
    case AlertTypeEnum.STORAGE_QUOTA:
      return `Storage Quota Warning: ${rule.name}`;
    default:
      return `Alert: ${rule.name}`;
  }
}

/** Build a descriptive alert message including current metric value. */
export function generateAlertMessage(
  rule: AlertRule,
  metrics: SyncMetrics,
): string {
  const threshold = rule.thresholds[0];
  if (!threshold) return rule.description;

  const value = getMetricValue(threshold.metric, metrics);
  return `${rule.description}. Current value: ${value}, Threshold: ${threshold.operator} ${threshold.value}`;
}

/** Extract structured details to attach to an alert. */
export function extractAlertDetails(
  rule: AlertRule,
  metrics: SyncMetrics,
): Record<string, unknown> {
  return {
    ruleType: rule.type,
    severity: rule.severity,
    thresholds: rule.thresholds,
    metrics: metrics,
    timestamp: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------

/** Return the icon path for a given alert severity. */
export function getNotificationIcon(severity: AlertSeverity): string {
  switch (severity) {
    case AlertSeverityEnum.CRITICAL:
      return '/icons/alert-critical.png';
    case AlertSeverityEnum.HIGH:
      return '/icons/alert-high.png';
    case AlertSeverityEnum.MEDIUM:
      return '/icons/alert-medium.png';
    default:
      return '/icons/alert-low.png';
  }
}

// ---------------------------------------------------------------------------
// Default configuration & rules
// ---------------------------------------------------------------------------

/** Return the default AlertConfig. */
export function getDefaultConfig(): AlertConfig {
  return {
    defaultRules: [],
    retentionDays: 30,
    maxAlertsPerRule: 100,
    debounceMs: 5000,
    throttleMs: 60000,
    soundUrl: '/sounds/alert.mp3',
  };
}

/** Return the set of built-in alert rules. */
export function getDefaultRules(): AlertRule[] {
  return [
    {
      id: 'sync_failure_rate',
      name: 'High Sync Failure Rate',
      description: 'Sync failure rate has exceeded acceptable threshold',
      type: AlertTypeEnum.SYNC_FAILURE,
      severity: AlertSeverityEnum.HIGH,
      enabled: true,
      thresholds: [
        {
          metric: 'sync.failureRate',
          operator: 'gt',
          value: 0.1, // 10% failure rate
          window: 300000, // 5 minutes
        },
      ],
      channels: [NotificationChannel.IN_APP, NotificationChannel.BROWSER],
      cooldown: 300000, // 5 minutes
      groupBy: ['entityType'],
    },
    {
      id: 'conflict_surge',
      name: 'Conflict Surge Detection',
      description: 'Unusually high number of sync conflicts detected',
      type: AlertTypeEnum.CONFLICT_SURGE,
      severity: AlertSeverityEnum.MEDIUM,
      enabled: true,
      thresholds: [
        {
          metric: 'conflicts.rate',
          operator: 'gt',
          value: 5, // 5 conflicts per minute
          window: 60000, // 1 minute
        },
      ],
      channels: [NotificationChannel.IN_APP],
      cooldown: 600000, // 10 minutes
    },
    {
      id: 'performance_degradation',
      name: 'Sync Performance Degradation',
      description: 'Sync operations are taking longer than expected',
      type: AlertTypeEnum.PERFORMANCE_DEGRADATION,
      severity: AlertSeverityEnum.MEDIUM,
      enabled: true,
      thresholds: [
        {
          metric: 'sync.averageDuration',
          operator: 'gt',
          value: 10000, // 10 seconds
          window: 300000, // 5 minutes
        },
      ],
      channels: [NotificationChannel.IN_APP],
      cooldown: 900000, // 15 minutes
    },
    {
      id: 'storage_quota_warning',
      name: 'Storage Quota Warning',
      description: 'Local storage quota is running low',
      type: AlertTypeEnum.STORAGE_QUOTA,
      severity: AlertSeverityEnum.HIGH,
      enabled: true,
      thresholds: [
        {
          metric: 'storage.usagePercent',
          operator: 'gt',
          value: 85, // 85% usage
        },
      ],
      channels: [NotificationChannel.IN_APP, NotificationChannel.BROWSER],
      cooldown: 3600000, // 1 hour
    },
  ];
}
