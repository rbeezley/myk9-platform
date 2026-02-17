/**
 * Production Monitoring Helpers
 *
 * Pure helper functions for device detection, ID generation,
 * and other utilities used by ProductionMonitoringService.
 */

import type {
  DeviceInfo,
  AlertCondition,
  PerformanceMetric,
  UserSession,
  UserEvent,
  ErrorReport,
  Alert,
} from './production-monitoring-types';

// === Device Detection ===

export function detectDeviceType(): 'mobile' | 'desktop' | 'tablet' {
  const userAgent = navigator.userAgent;
  if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    return /iPad/i.test(userAgent) ? 'tablet' : 'mobile';
  }
  return 'desktop';
}

export function detectOS(): string {
  const userAgent = navigator.userAgent;
  if (/Windows NT/i.test(userAgent)) return 'Windows';
  if (/Mac OS X/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  return 'Unknown';
}

export function detectBrowser(): string {
  const userAgent = navigator.userAgent;
  if (/Chrome/i.test(userAgent)) return 'Chrome';
  if (/Firefox/i.test(userAgent)) return 'Firefox';
  if (/Safari/i.test(userAgent)) return 'Safari';
  if (/Edge/i.test(userAgent)) return 'Edge';
  return 'Unknown';
}

export function detectBrowserVersion(): string {
  // Simplified browser version detection
  return '1.0.0';
}

export function getDeviceInfo(): DeviceInfo {
  return {
    type: detectDeviceType(),
    os: detectOS(),
    browser: detectBrowser(),
    version: detectBrowserVersion(),
    screen: {
      width: window.screen.width,
      height: window.screen.height,
    },
  };
}

// === URL Parsing ===

export function parseUTMParameters(): { source?: string; medium?: string; campaign?: string } {
  const urlParams = new URLSearchParams(window.location.search);
  const source = urlParams.get('utm_source') ?? undefined;
  const medium = urlParams.get('utm_medium') ?? undefined;
  const campaign = urlParams.get('utm_campaign') ?? undefined;

  return {
    ...(source !== undefined && { source }),
    ...(medium !== undefined && { medium }),
    ...(campaign !== undefined && { campaign }),
  };
}

// === Metric Utilities ===

export function getMetricUnit(name: string): string {
  if (name.includes('time') || name.includes('duration')) return 'ms';
  if (name.includes('size') || name.includes('bytes')) return 'bytes';
  if (name.includes('rate') || name.includes('percentage')) return '%';
  return 'count';
}

// === ID Generation ===

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateErrorFingerprint(error: Error): string {
  // Create a fingerprint based on error message and stack trace
  const content = `${error.name}:${error.message}:${error.stack?.split('\n')[1] || ''}`;
  return btoa(content).substr(0, 16);
}

// === Browser Memory ===

interface PerformanceMemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/** Read browser memory stats (Chrome-only API). Returns null when unavailable. */
export function getMemoryInfo(): PerformanceMemoryInfo | null {
  if ('memory' in performance) {
    const memory = (performance as Performance & { memory?: PerformanceMemoryInfo }).memory;
    return memory ?? null;
  }
  return null;
}

// === Alert Evaluation ===

export function evaluateAlertCondition(
  condition: AlertCondition,
  value: number,
  threshold: number
): boolean {
  switch (condition.operator) {
    case 'gt':
      return value > threshold;
    case 'lt':
      return value < threshold;
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
    case 'ne':
      return value !== threshold;
    default:
      return false;
  }
}

// === Data Aggregation ===

export function calculateMetricAverage(metrics: PerformanceMetric[]): number {
  if (metrics.length === 0) return 0;
  return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
}

export function calculateAverageSessionDuration(sessions: UserSession[]): number {
  const completedSessions = sessions.filter(s => s.duration);
  if (completedSessions.length === 0) return 0;
  return (
    completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / completedSessions.length
  );
}

export function getTopEvents(events: UserEvent[]): Array<{ event: string; count: number }> {
  const eventCounts = events.reduce(
    (acc, event) => {
      acc[event.event] = (acc[event.event] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return Object.entries(eventCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([event, count]) => ({ event, count }));
}

export function getErrorSummary(
  errors: ErrorReport[],
  startTime: Date,
  endTime: Date
): {
  total: number;
  recent: number;
  byLevel: Record<string, number>;
  topErrors: ErrorReport[];
} {
  const recentErrors = errors.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);

  return {
    total: errors.length,
    recent: recentErrors.length,
    byLevel: recentErrors.reduce(
      (acc, error) => {
        acc[error.level] = (acc[error.level] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
    topErrors: recentErrors.slice(0, 10),
  };
}

export function getPerformanceSummary(
  metrics: PerformanceMetric[],
  startTime: Date,
  endTime: Date
): {
  avgResponseTime: number;
  errorRate: number;
  throughput: number;
  webVitals: { fcp: number; lcp: number; fid: number; cls: number };
} {
  const recentMetrics = metrics.filter(m => m.timestamp >= startTime && m.timestamp <= endTime);

  return {
    avgResponseTime: calculateMetricAverage(recentMetrics.filter(m => m.name === 'response_time')),
    errorRate: 0.02, // Placeholder
    throughput: recentMetrics.filter(m => m.name === 'requests').length,
    webVitals: {
      fcp: calculateMetricAverage(recentMetrics.filter(m => m.name === 'web_vitals.fcp')),
      lcp: calculateMetricAverage(recentMetrics.filter(m => m.name === 'web_vitals.lcp')),
      fid: calculateMetricAverage(recentMetrics.filter(m => m.name === 'web_vitals.fid')),
      cls: calculateMetricAverage(recentMetrics.filter(m => m.name === 'web_vitals.cls')),
    },
  };
}

export function getUserSummary(
  sessions: UserSession[],
  events: UserEvent[],
  startTime: Date,
  endTime: Date
): {
  activeUsers: number;
  totalSessions: number;
  avgSessionDuration: number;
  topEvents: Array<{ event: string; count: number }>;
} {
  const recentSessions = sessions.filter(s => s.startTime >= startTime && s.startTime <= endTime);

  const recentEvents = events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);

  return {
    activeUsers: new Set(recentSessions.map(s => s.userId).filter(Boolean)).size,
    totalSessions: recentSessions.length,
    avgSessionDuration: calculateAverageSessionDuration(recentSessions),
    topEvents: getTopEvents(recentEvents),
  };
}

export function getAlertSummary(
  alerts: Alert[],
  startTime: Date,
  endTime: Date
): {
  active: number;
  acknowledged: number;
  resolved: number;
  recent: Alert[];
} {
  const recentAlerts = alerts.filter(a => a.triggered >= startTime && a.triggered <= endTime);

  return {
    active: alerts.filter(a => !a.resolved && !a.acknowledged).length,
    acknowledged: alerts.filter(a => a.acknowledged && !a.resolved).length,
    resolved: alerts.filter(a => a.resolved).length,
    recent: recentAlerts.slice(0, 10),
  };
}
