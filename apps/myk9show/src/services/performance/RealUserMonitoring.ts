/**
 * Real User Monitoring (RUM) Service
 *
 * Collects and analyzes real user performance metrics including
 * Core Web Vitals, custom metrics, and user experience data.
 */

import { logger } from '@/services/LoggingService';

import type {
  LayoutShiftEntry,
  PerformanceEventTimingEntry,
  PerformanceLongTaskEntry,
  WebVital,
  CustomMetric,
  UserSession,
  ErrorInfo,
  PerformanceAlert,
} from './RealUserMonitoring.types';

// Re-export all public types for backwards compatibility
export type {
  WebVital,
  CustomMetric,
  UserSession,
  DeviceInfo,
  ConnectionInfo,
  ErrorInfo,
  PerformanceBudget,
  PerformanceAlert,
} from './RealUserMonitoring.types';

import {
  PERFORMANCE_BUDGETS,
  MEMORY_MONITORING_INTERVAL,
  SLOW_RESOURCE_THRESHOLD,
  LONG_TASK_ALERT_THRESHOLD,
  MAX_CUSTOM_METRICS,
  CUSTOM_METRICS_TRIM_SIZE,
  MAX_ERRORS,
  ERRORS_TRIM_SIZE,
  MAX_ALERTS,
  ALERTS_TRIM_SIZE,
  MAX_STORED_SESSIONS,
} from './RealUserMonitoring.constants';

import {
  generateSessionId,
  generateId,
  getNavigationType,
  getDeviceInfo,
  getConnectionInfo,
  isMobileDevice,
  getPerformanceMemory,
} from './RealUserMonitoring.helpers';

export class RealUserMonitoringService {
  private sessionId: string;
  private session: UserSession;
  private longTaskObserver: PerformanceObserver | null = null;
  private alerts: PerformanceAlert[] = [];
  private isInitialized = false;

  constructor() {
    this.sessionId = generateSessionId();
    this.session = this.initializeSession();
  }

  /**
   * Initialize RUM monitoring
   */
  public initialize(): void {
    if (this.isInitialized) return;

    logger.debug('Initializing Real User Monitoring', 'performance');

    this.setupWebVitalsCollection();
    this.setupLongTaskMonitoring();
    this.setupErrorTracking();
    this.setupNavigationTracking();
    this.setupResourceTracking();
    this.setupMemoryMonitoring();

    this.isInitialized = true;
    this.session.startTime = Date.now();

    window.addEventListener('beforeunload', () => {
      this.endSession();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.trackCustomMetric('page_hidden', Date.now());
      } else {
        this.trackCustomMetric('page_visible', Date.now());
      }
    });
  }

  // === Web Vitals ===

  private setupWebVitalsCollection(): void {
    this.observeVital('largest-contentful-paint', entries => {
      const lastEntry = entries[entries.length - 1];
      this.recordVital('LCP', lastEntry.startTime, entries);
    });

    this.observeVital('paint', entries => {
      const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint');
      if (fcpEntry) {
        this.recordVital('FCP', fcpEntry.startTime, [fcpEntry]);
      }
    });

    this.observeVital('layout-shift', entries => {
      let clsValue = 0;
      entries.forEach(entry => {
        const shift = entry as LayoutShiftEntry;
        if (!shift.hadRecentInput) {
          clsValue += shift.value;
        }
      });
      this.recordVital('CLS', clsValue, entries);
    });

    this.observeVital('first-input', entries => {
      const firstInput = entries[0] as PerformanceEventTimingEntry;
      const fid = firstInput.processingStart - firstInput.startTime;
      this.recordVital('FID', fid, [firstInput]);
    });

    this.observeVital('navigation', entries => {
      const nav = entries[0] as PerformanceNavigationTiming;
      const ttfb = nav.responseStart - nav.requestStart;
      this.recordVital('TTFB', ttfb, [nav]);
    });
  }

  private observeVital(type: string, callback: (entries: PerformanceEntry[]) => void): void {
    try {
      const observer = new PerformanceObserver(list => {
        callback(list.getEntries());
      });
      observer.observe({ type, buffered: true });
    } catch (error) {
      logger.warn('Failed to observe performance type', 'performance', { type }, error as Error);
    }
  }

  private recordVital(name: WebVital['name'], value: number, entries: PerformanceEntry[]): void {
    const vital: WebVital = {
      name,
      value: Math.round(value * 100) / 100,
      delta: value,
      entries,
      id: generateId(),
      navigationType: getNavigationType(),
    };

    const existingIndex = this.session.vitals.findIndex(v => v.name === name);
    if (existingIndex >= 0) {
      const existing = this.session.vitals[existingIndex];
      vital.delta = vital.value - existing.value;
      this.session.vitals[existingIndex] = vital;
    } else {
      this.session.vitals.push(vital);
    }

    this.checkPerformanceBudget(name, value);
    logger.debug('Web vital recorded', 'performance', { name, valueMs: value.toFixed(2) });
  }

  // === Long Task Monitoring ===

  private setupLongTaskMonitoring(): void {
    try {
      this.longTaskObserver = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          const longTask = entry as PerformanceLongTaskEntry;

          this.trackCustomMetric('long_task_duration', longTask.duration, {
            startTime: longTask.startTime.toString(),
            attribution: longTask.attribution?.[0]?.name || 'unknown',
          });

          if (longTask.duration > LONG_TASK_ALERT_THRESHOLD) {
            this.createAlert(
              'long_task',
              longTask.duration,
              LONG_TASK_ALERT_THRESHOLD,
              'error',
              window.location.href
            );
          }
        });
      });
      this.longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch (error) {
      logger.warn('Long task monitoring not supported', 'performance', {}, error as Error);
    }
  }

  // === Error & Navigation Tracking ===

  private setupErrorTracking(): void {
    window.addEventListener('error', event => {
      this.trackError({
        message: event.message,
        stack: event.error?.stack,
        url: event.filename || window.location.href,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        timestamp: Date.now(),
      });
    });

    window.addEventListener('unhandledrejection', event => {
      this.trackError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        url: window.location.href,
        timestamp: Date.now(),
      });
    });
  }

  private setupNavigationTracking(): void {
    let currentPath = window.location.pathname;

    const trackNavigation = () => {
      if (window.location.pathname !== currentPath) {
        this.session.pageViews++;
        this.trackCustomMetric('navigation', Date.now(), {
          from: currentPath,
          to: window.location.pathname,
        });
        currentPath = window.location.pathname;
      }
    };

    const observer = new MutationObserver(trackNavigation);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-route'],
    });

    window.addEventListener('popstate', trackNavigation);
  }

  // === Resource & Memory Monitoring ===

  private setupResourceTracking(): void {
    this.observeVital('resource', entries => {
      entries.forEach(entry => {
        const resource = entry as PerformanceResourceTiming;
        const loadTime = resource.responseEnd - resource.startTime;

        if (loadTime > SLOW_RESOURCE_THRESHOLD) {
          this.trackCustomMetric('slow_resource', loadTime, {
            name: resource.name,
            type: resource.initiatorType,
            size: resource.encodedBodySize?.toString() || '0',
          });
        }

        if (resource.duration === 0) {
          this.trackCustomMetric('failed_resource', 1, {
            name: resource.name,
            type: resource.initiatorType,
          });
        }
      });
    });
  }

  private setupMemoryMonitoring(): void {
    this.trackMemoryMetrics();

    setInterval(() => {
      this.trackMemoryMetrics();
    }, MEMORY_MONITORING_INTERVAL);

    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      setTimeout(() => this.trackMemoryMetrics(), 1000);
    };
  }

  private trackMemoryMetrics(): void {
    const memInfo = getPerformanceMemory();
    if (!memInfo) {
      this.trackCustomMetric('memory_api_unavailable', 1, {
        reason: 'no_performance_memory',
      });
      return;
    }

    const usedMB = memInfo.usedJSHeapSize / 1024 / 1024;
    const totalMB = memInfo.totalJSHeapSize / 1024 / 1024;
    const limitMB = memInfo.jsHeapSizeLimit / 1024 / 1024;

    this.trackCustomMetric('memory_used', usedMB, { unit: 'MB' });
    this.trackCustomMetric('memory_total', totalMB, { unit: 'MB' });

    const usagePercent = (usedMB / limitMB) * 100;
    const growthRate = totalMB / usedMB;

    if (usagePercent > 80) {
      this.trackCustomMetric('memory_pressure_critical', usagePercent, {
        used: usedMB.toFixed(1),
        limit: limitMB.toFixed(1),
        severity: 'critical',
        recommendation: 'immediate_cleanup',
      });
    } else if (usagePercent > 60) {
      this.trackCustomMetric('memory_pressure_high', usagePercent, {
        used: usedMB.toFixed(1),
        limit: limitMB.toFixed(1),
        severity: 'warning',
        recommendation: 'consider_cleanup',
      });
    }

    if (growthRate > 1.8) {
      this.trackCustomMetric('memory_growth_rapid', growthRate, {
        growth_rate: growthRate.toFixed(2),
        total_mb: totalMB.toFixed(1),
        used_mb: usedMB.toFixed(1),
        concern: 'potential_leak',
      });
    }

    if (isMobileDevice() && usedMB > 50) {
      this.trackCustomMetric('mobile_memory_concern', usedMB, {
        device_type: 'mobile',
        memory_mb: usedMB.toFixed(1),
        recommendation: 'data_scoping_cleanup',
      });
    }

    const domNodes = document.querySelectorAll('*').length;
    this.trackCustomMetric('dom_nodes', domNodes, {
      threshold: domNodes > 1500 ? 'high' : 'normal',
    });
  }

  // === Public API ===

  public trackCustomMetric(name: string, value: number, tags?: Record<string, string>): void {
    const metric: CustomMetric = {
      name,
      value,
      timestamp: Date.now(),
      ...(tags !== undefined && { tags }),
    };

    this.session.customMetrics.push(metric);

    if (this.session.customMetrics.length > MAX_CUSTOM_METRICS) {
      this.session.customMetrics = this.session.customMetrics.slice(-CUSTOM_METRICS_TRIM_SIZE);
    }
  }

  public trackError(error: Omit<ErrorInfo, 'userId'>): void {
    const errorInfo: ErrorInfo = {
      ...error,
      ...(this.session.userId !== undefined && { userId: this.session.userId }),
    };

    this.session.errors.push(errorInfo);
    logger.error('RUM Error tracked', 'performance', { errorInfo });

    if (this.session.errors.length > MAX_ERRORS) {
      this.session.errors = this.session.errors.slice(-ERRORS_TRIM_SIZE);
    }
  }

  public getSessionData(): UserSession {
    return {
      ...this.session,
      totalTime: Date.now() - this.session.startTime,
    };
  }

  public getPerformanceSummary(): {
    vitals: Record<string, number>;
    customMetrics: Record<string, number>;
    errorCount: number;
    alertCount: number;
    sessionDuration: number;
  } {
    const vitals: Record<string, number> = {};
    this.session.vitals.forEach(vital => {
      vitals[vital.name] = vital.value;
    });

    const customMetrics: Record<string, number> = {};
    this.session.customMetrics.forEach(metric => {
      if (!customMetrics[metric.name]) {
        customMetrics[metric.name] = 0;
      }
      customMetrics[metric.name] += metric.value;
    });

    return {
      vitals,
      customMetrics,
      errorCount: this.session.errors.length,
      alertCount: this.alerts.filter(a => !a.resolved).length,
      sessionDuration: Date.now() - this.session.startTime,
    };
  }

  public exportSessionData(): string {
    return JSON.stringify(
      {
        session: this.getSessionData(),
        alerts: this.alerts,
        summary: this.getPerformanceSummary(),
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }

  public endSession(): void {
    this.session.endTime = Date.now();
    this.session.totalTime = this.session.endTime - this.session.startTime;
    this.sendSessionData();
    logger.debug('RUM Session ended', 'performance', this.getPerformanceSummary());
  }

  // === Private Helpers ===

  private checkPerformanceBudget(metric: string, value: number): void {
    const budget = PERFORMANCE_BUDGETS.find(b => b.metric === metric);
    if (!budget) return;

    if (value > budget.threshold) {
      this.createAlert(metric, value, budget.threshold, budget.severity, window.location.href);
    }
  }

  private createAlert(
    metric: string,
    value: number,
    threshold: number,
    severity: 'error' | 'warning' | 'info',
    url: string
  ): void {
    const alert: PerformanceAlert = {
      id: generateId(),
      metric,
      value,
      threshold,
      severity,
      timestamp: Date.now(),
      url,
      ...(this.session.userId !== undefined && { userId: this.session.userId }),
      resolved: false,
    };

    this.alerts.push(alert);
    logger.warn('Performance Alert', 'performance', {
      metric,
      value: value.toFixed(2),
      threshold,
      severity,
    });

    if (this.alerts.length > MAX_ALERTS) {
      this.alerts = this.alerts.slice(-ALERTS_TRIM_SIZE);
    }
  }

  private sendSessionData(): void {
    try {
      const sessionData = this.getSessionData();
      const key = `rum-session-${this.sessionId}`;
      localStorage.setItem(key, JSON.stringify(sessionData));

      const sessions = Object.keys(localStorage)
        .filter(k => k.startsWith('rum-session-'))
        .sort()
        .slice(-MAX_STORED_SESSIONS);

      Object.keys(localStorage)
        .filter(k => k.startsWith('rum-session-') && !sessions.includes(k))
        .forEach(k => localStorage.removeItem(k));
    } catch (error) {
      logger.error('Failed to store session data', 'performance', {}, error as Error);
    }
  }

  private initializeSession(): UserSession {
    return {
      sessionId: this.sessionId,
      startTime: Date.now(),
      pageViews: 1,
      totalTime: 0,
      device: getDeviceInfo(),
      connection: getConnectionInfo(),
      vitals: [],
      customMetrics: [],
      errors: [],
    };
  }
}

// Singleton instance
let rumService: RealUserMonitoringService | null = null;

export function getRumService(): RealUserMonitoringService {
  if (!rumService) {
    rumService = new RealUserMonitoringService();
  }
  return rumService;
}

/**
 * Initialize RUM service
 */
export function initializeRUM(): void {
  const rum = getRumService();
  rum.initialize();
}
