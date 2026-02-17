/**
 * Production Monitoring Service
 *
 * Comprehensive production monitoring with error tracking, performance monitoring,
 * user analytics, and real-time alerting for production deployments.
 */

import { logger } from '@/services/LoggingService';
import { MonitoringConfig, MetricType } from '../../types/deployment-types';

import type {
  ErrorReport,
  ErrorContext,
  Breadcrumb,
  PerformanceMetric,
  WebVitalsReport,
  UserEvent,
  LocationInfo,
  UserSession,
  AlertRule,
  Alert,
} from './production-monitoring-types';

import {
  generateId,
  generateErrorFingerprint,
  getDeviceInfo,
  getMetricUnit,
  parseUTMParameters,
  getMemoryInfo,
  evaluateAlertCondition,
  getErrorSummary,
  getPerformanceSummary,
  getUserSummary,
  getAlertSummary,
} from './production-monitoring-helpers';

import {
  DEFAULT_MONITORING_CONFIG,
  DEFAULT_ALERT_RULES,
  MONITORING_INTERVALS,
  DATA_RETENTION_MS,
} from './production-monitoring-constants';

// Re-export all types so existing consumers can still import from this file
export type {
  ErrorReport,
  ErrorContext,
  Breadcrumb,
  PerformanceMetric,
  WebVitalsReport,
  UserEvent,
  DeviceInfo,
  LocationInfo,
  UserSession,
  AlertRule,
  AlertCondition,
  Alert,
} from './production-monitoring-types';

// Re-export types that aren't used in this file but were previously accessible
export type { TransactionTrace, TraceSpan, SpanLog } from './production-monitoring-types';

/**
 * Main Production Monitoring Service
 */
export class ProductionMonitoringService {
  private static instance: ProductionMonitoringService;
  private config: MonitoringConfig;
  private errors: ErrorReport[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private userEvents: UserEvent[] = [];
  private sessions: UserSession[] = [];
  private alerts: Alert[] = [];
  private alertRules: AlertRule[] = [];
  private isInitialized = false;

  private constructor() {
    this.config = { ...DEFAULT_MONITORING_CONFIG };
    this.alertRules = [...DEFAULT_ALERT_RULES];
  }

  public static getInstance(): ProductionMonitoringService {
    if (!ProductionMonitoringService.instance) {
      ProductionMonitoringService.instance = new ProductionMonitoringService();
    }
    return ProductionMonitoringService.instance;
  }

  // === Initialization ===

  /**
   * Initialize monitoring with configuration
   */
  public async initialize(config?: Partial<MonitoringConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    try {
      // Initialize error tracking
      await this.initializeErrorTracking();

      // Initialize performance monitoring
      await this.initializePerformanceMonitoring();

      // Initialize user analytics
      await this.initializeUserAnalytics();

      // Start monitoring loops
      this.startMonitoringLoops();

      this.isInitialized = true;
      logger.info('Production monitoring initialized successfully', 'monitoring');
    } catch (error) {
      logger.error('Failed to initialize production monitoring', 'monitoring', {}, error as Error);
      throw error;
    }
  }

  // === Error Tracking ===

  /**
   * Report an error to the monitoring system
   */
  public reportError(error: Error, context?: Partial<ErrorContext>): string {
    const errorId = generateId('error');
    const fingerprint = generateErrorFingerprint(error);

    // Check if this error has been seen before
    const existingError = this.errors.find(e => e.fingerprint === fingerprint);

    if (existingError) {
      existingError.count++;
      existingError.lastSeen = new Date();
      return existingError.id;
    }

    const errorReport: ErrorReport = {
      id: errorId,
      message: error.message,
      stack: error.stack || '',
      timestamp: new Date(),
      level: 'error',
      context: {
        sessionId: this.getCurrentSessionId(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        breadcrumbs: this.getBreadcrumbs(),
        ...context,
      },
      fingerprint,
      count: 1,
      firstSeen: new Date(),
      lastSeen: new Date(),
      resolved: false,
      tags: this.extractErrorTags(error, context),
    };

    this.errors.push(errorReport);

    // Send to external error tracking service
    this.sendToErrorTrackingService(errorReport);

    // Check for alert thresholds
    this.checkErrorAlerts(errorReport);

    return errorId;
  }

  /**
   * Add breadcrumb for error context
   */
  public addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'timestamp'>): void {
    const session = this.getCurrentSession();
    if (session) {
      // Add to session breadcrumbs (stored in memory/sessionStorage)
      this.addBreadcrumbToSession(session.id, {
        ...breadcrumb,
        timestamp: new Date(),
      });
    }
  }

  // === Performance Monitoring ===

  /**
   * Record a performance metric
   */
  public recordMetric(
    name: string,
    value: number,
    type: MetricType = 'gauge',
    tags: Record<string, string> = {}
  ): void {
    const metric: PerformanceMetric = {
      id: generateId('metric'),
      name,
      type,
      value,
      unit: getMetricUnit(name),
      timestamp: new Date(),
      tags: {
        ...tags,
        environment: this.config.errorTracking?.environment || 'production',
      },
      source: 'browser',
    };

    this.performanceMetrics.push(metric);

    // Send to performance monitoring service
    this.sendToPerformanceService(metric);

    // Check for performance alerts
    this.checkPerformanceAlerts(metric);
  }

  /**
   * Record Web Vitals metrics
   */
  public recordWebVitals(vitals: Omit<WebVitalsReport, 'sessionId' | 'timestamp'>): void {
    const report: WebVitalsReport = {
      ...vitals,
      sessionId: this.getCurrentSessionId(),
      timestamp: new Date(),
    };

    // Record individual metrics
    Object.entries(report.metrics).forEach(([key, value]) => {
      this.recordMetric(`web_vitals.${key}`, value, 'gauge', {
        url: report.url,
        device_type: report.deviceInfo.type,
      });
    });

    logger.debug('Web Vitals recorded', 'monitoring', { report });
  }

  /**
   * Start a performance trace
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public startTrace(name: string, tags: Record<string, string> = {}): string {
    const traceId = generateId('trace');

    // In a real implementation, this would start a distributed trace
    logger.debug('Started trace', 'monitoring', { name, traceId });

    return traceId;
  }

  /**
   * Finish a performance trace
   */
  public finishTrace(traceId: string, status: 'success' | 'error' | 'timeout' = 'success'): void {
    // In a real implementation, this would finish the distributed trace
    logger.debug('Finished trace', 'monitoring', { traceId, status });
  }

  // === User Analytics ===

  /**
   * Track a user event
   */
  public trackEvent(
    event: string,
    properties: Record<string, unknown> = {},
    userId?: string
  ): void {
    const userEvent: UserEvent = {
      id: generateId('event'),
      event,
      userId,
      sessionId: this.getCurrentSessionId(),
      timestamp: new Date(),
      properties: {
        ...properties,
        page_url: window.location.href,
        page_title: document.title,
      },
      deviceInfo: getDeviceInfo(),
      location: this.getLocationInfo(),
    };

    this.userEvents.push(userEvent);

    // Send to analytics service
    this.sendToAnalyticsService(userEvent);

    // Update session event count
    this.updateSessionEventCount(userEvent.sessionId);
  }

  /**
   * Track page view
   */
  public trackPageView(url?: string): void {
    this.trackEvent('page_view', {
      url: url || window.location.href,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
    });

    // Update session page view count
    const sessionId = this.getCurrentSessionId();
    this.updateSessionPageViewCount(sessionId);
  }

  /**
   * Identify a user
   */
  public identifyUser(userId: string, traits: Record<string, unknown> = {}): void {
    // Update current session with user ID
    const session = this.getCurrentSession();
    if (session && !session.userId) {
      session.userId = userId;
    }

    this.trackEvent(
      'identify',
      {
        user_id: userId,
        traits,
      },
      userId
    );
  }

  // === Alert Management ===

  /**
   * Create an alert rule
   */
  public createAlertRule(rule: Omit<AlertRule, 'id'>): string {
    const ruleId = generateId('alert_rule');
    const alertRule: AlertRule = {
      ...rule,
      id: ruleId,
    };

    this.alertRules.push(alertRule);
    return ruleId;
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(
    rule: AlertRule,
    value: number,
    context: Record<string, unknown> = {}
  ): void {
    // Check cooldown period
    if (rule.lastTriggered) {
      const timeSinceLastAlert = Date.now() - rule.lastTriggered.getTime();
      if (timeSinceLastAlert < rule.cooldown * 60 * 1000) {
        return; // Still in cooldown period
      }
    }

    const alert: Alert = {
      id: generateId('alert'),
      ruleId: rule.id,
      triggered: new Date(),
      severity: rule.severity,
      message: `${rule.name}: ${rule.metric} is ${value}, threshold is ${rule.threshold}`,
      value,
      threshold: rule.threshold,
      context,
      acknowledged: false,
    };

    this.alerts.push(alert);
    rule.lastTriggered = new Date();

    // Send notifications
    this.sendAlertNotifications(alert, rule);

    logger.warn('Alert triggered', 'monitoring', { message: alert.message });
  }

  /**
   * Acknowledge an alert
   */
  public acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    return true;
  }

  // === Dashboard Data ===

  /**
   * Get monitoring dashboard data
   */
  public getDashboardData() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - DATA_RETENTION_MS);

    return {
      errors: getErrorSummary(this.errors, oneDayAgo, now),
      performance: getPerformanceSummary(this.performanceMetrics, oneDayAgo, now),
      users: getUserSummary(this.sessions, this.userEvents, oneDayAgo, now),
      alerts: getAlertSummary(this.alerts, oneDayAgo, now),
    };
  }

  // === Private Implementation Methods ===

  private async initializeErrorTracking(): Promise<void> {
    // Initialize error tracking provider (Sentry, Bugsnag, etc.)
    logger.debug('Initializing error tracking', 'monitoring');

    // Set up global error handlers
    window.addEventListener('error', event => {
      this.reportError(new Error(event.message), {
        url: event.filename,
        additionalData: {
          lineNumber: event.lineno,
          columnNumber: event.colno,
        },
      });
    });

    window.addEventListener('unhandledrejection', event => {
      this.reportError(new Error(`Unhandled Promise Rejection: ${event.reason}`));
    });
  }

  private async initializePerformanceMonitoring(): Promise<void> {
    // Initialize performance monitoring provider
    logger.debug('Initializing performance monitoring', 'monitoring');

    // Monitor Web Vitals if enabled
    if (this.config.performanceMonitoring?.enableWebVitals) {
      this.setupWebVitalsMonitoring();
    }
  }

  private async initializeUserAnalytics(): Promise<void> {
    // Initialize analytics provider (Mixpanel, Amplitude, etc.)
    logger.debug('Initializing user analytics', 'monitoring');

    // Start a new session
    this.startUserSession();

    // Track page views if enabled
    if (this.config.userAnalytics?.trackPageViews) {
      this.trackPageView();
    }
  }

  private startMonitoringLoops(): void {
    setInterval(() => {
      this.collectSystemMetrics();
    }, MONITORING_INTERVALS.SYSTEM_METRICS);

    setInterval(() => {
      this.cleanupOldData();
    }, MONITORING_INTERVALS.DATA_CLEANUP);

    setInterval(() => {
      this.evaluateAlertRules();
    }, MONITORING_INTERVALS.ALERT_EVALUATION);
  }

  private getCurrentSessionId(): string {
    // Get or create session ID from sessionStorage
    let sessionId = sessionStorage.getItem('monitoring_session_id');
    if (!sessionId) {
      sessionId = generateId('session');
      sessionStorage.setItem('monitoring_session_id', sessionId);
    }
    return sessionId;
  }

  private getCurrentSession(): UserSession | null {
    const sessionId = this.getCurrentSessionId();
    return this.sessions.find(s => s.id === sessionId) || null;
  }

  private startUserSession(): void {
    const sessionId = this.getCurrentSessionId();

    // Check if session already exists
    if (this.sessions.find(s => s.id === sessionId)) {
      return;
    }

    const session: UserSession = {
      id: sessionId,
      startTime: new Date(),
      pageViews: 0,
      events: 0,
      deviceInfo: getDeviceInfo(),
      referrer: document.referrer,
      utm: parseUTMParameters(),
    };

    this.sessions.push(session);
  }

  private getLocationInfo(): LocationInfo | undefined {
    // In a real implementation, this would use IP geolocation
    return undefined;
  }

  // Placeholder implementations for external service integrations
  private sendToErrorTrackingService(error: ErrorReport): void {
    logger.debug('Sending error to tracking service', 'monitoring', {
      errorMessage: error.message,
    });
  }

  private sendToPerformanceService(metric: PerformanceMetric): void {
    logger.debug('Sending performance metric', 'monitoring', {
      name: metric.name,
      value: metric.value,
    });
  }

  private sendToAnalyticsService(event: UserEvent): void {
    logger.debug('Sending user event', 'monitoring', {
      event: event.event,
      properties: event.properties,
    });
  }

  private sendAlertNotifications(alert: Alert, rule: AlertRule): void {
    rule.channels.forEach(channel => {
      logger.debug('Sending alert notification', 'monitoring', { channel, message: alert.message });
    });
  }

  // Placeholder implementations
  private getBreadcrumbs(): Breadcrumb[] {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private addBreadcrumbToSession(sessionId: string, breadcrumb: Breadcrumb): void {
    // Implementation for adding breadcrumbs to session storage
  }

  private extractErrorTags(error: Error, context?: Partial<ErrorContext>): Record<string, string> {
    return {
      error_type: error.name,
      component: context?.component || 'unknown',
      url: window.location.pathname,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private checkErrorAlerts(error: ErrorReport): void {
    // Check if error rate exceeds thresholds
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private checkPerformanceAlerts(metric: PerformanceMetric): void {
    // Check if performance metrics exceed thresholds
  }

  private updateSessionEventCount(sessionId: string): void {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      session.events++;
    }
  }

  private updateSessionPageViewCount(sessionId: string): void {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      session.pageViews++;
    }
  }

  private setupWebVitalsMonitoring(): void {
    // Setup Web Vitals monitoring (would use web-vitals library in real implementation)
    logger.debug('Web Vitals monitoring enabled', 'monitoring');
  }

  private collectSystemMetrics(): void {
    const memoryInfo = getMemoryInfo();
    if (memoryInfo) {
      this.recordMetric('memory.used', memoryInfo.usedJSHeapSize, 'gauge');
      this.recordMetric('memory.total', memoryInfo.totalJSHeapSize, 'gauge');
    }
  }

  private cleanupOldData(): void {
    const cutoff = new Date(Date.now() - DATA_RETENTION_MS);

    this.errors = this.errors.filter(e => e.timestamp > cutoff);
    this.performanceMetrics = this.performanceMetrics.filter(m => m.timestamp > cutoff);
    this.userEvents = this.userEvents.filter(e => e.timestamp > cutoff);
  }

  private evaluateAlertRules(): void {
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      const mockValue = Math.random() * 100;
      if (evaluateAlertCondition(rule.condition, mockValue, rule.threshold)) {
        this.triggerAlert(rule, mockValue);
      }
    }
  }
}
