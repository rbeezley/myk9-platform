/**
 * Production Monitoring Service
 *
 * Comprehensive production monitoring with error tracking, performance monitoring,
 * user analytics, and real-time alerting for production deployments.
 */

import { logger } from '@/services/LoggingService';
import {
  MonitoringConfig,
  MetricType,
} from '../../types/deployment-types';

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
  AlertCondition,
  Alert
} from './production-monitoring-types';

import {
  generateId,
  generateErrorFingerprint,
  getDeviceInfo,
  getMetricUnit,
  parseUTMParameters,
} from './production-monitoring-helpers';

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
  Alert
} from './production-monitoring-types';

// Re-export types that aren't used in this file but were previously accessible
export type {
  TransactionTrace,
  TraceSpan,
  SpanLog
} from './production-monitoring-types';

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
    this.config = this.getDefaultConfig();
    this.initializeDefaultAlertRules();
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
        ...context
      },
      fingerprint,
      count: 1,
      firstSeen: new Date(),
      lastSeen: new Date(),
      resolved: false,
      tags: this.extractErrorTags(error, context)
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
        timestamp: new Date()
      });
    }
  }

  // === Performance Monitoring ===

  /**
   * Record a performance metric
   */
  public recordMetric(name: string, value: number, type: MetricType = 'gauge', tags: Record<string, string> = {}): void {
    const metric: PerformanceMetric = {
      id: generateId('metric'),
      name,
      type,
      value,
      unit: getMetricUnit(name),
      timestamp: new Date(),
      tags: {
        ...tags,
        environment: this.config.errorTracking?.environment || 'production'
      },
      source: 'browser'
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
      timestamp: new Date()
    };

    // Record individual metrics
    Object.entries(report.metrics).forEach(([key, value]) => {
      this.recordMetric(`web_vitals.${key}`, value, 'gauge', {
        url: report.url,
        device_type: report.deviceInfo.type
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
  public trackEvent(event: string, properties: Record<string, unknown> = {}, userId?: string): void {
    const userEvent: UserEvent = {
      id: generateId('event'),
      event,
      userId,
      sessionId: this.getCurrentSessionId(),
      timestamp: new Date(),
      properties: {
        ...properties,
        page_url: window.location.href,
        page_title: document.title
      },
      deviceInfo: getDeviceInfo(),
      location: this.getLocationInfo()
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
      timestamp: new Date().toISOString()
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

    this.trackEvent('identify', {
      user_id: userId,
      traits
    }, userId);
  }

  // === Alert Management ===

  /**
   * Create an alert rule
   */
  public createAlertRule(rule: Omit<AlertRule, 'id'>): string {
    const ruleId = generateId('alert_rule');
    const alertRule: AlertRule = {
      ...rule,
      id: ruleId
    };

    this.alertRules.push(alertRule);
    return ruleId;
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(rule: AlertRule, value: number, context: Record<string, unknown> = {}): void {
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
      acknowledged: false
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
  public getDashboardData(): {
    errors: {
      total: number;
      recent: number;
      byLevel: Record<string, number>;
      topErrors: ErrorReport[];
    };
    performance: {
      avgResponseTime: number;
      errorRate: number;
      throughput: number;
      webVitals: {
        fcp: number;
        lcp: number;
        fid: number;
        cls: number;
      };
    };
    users: {
      activeUsers: number;
      totalSessions: number;
      avgSessionDuration: number;
      topEvents: Array<{ event: string; count: number }>;
    };
    alerts: {
      active: number;
      acknowledged: number;
      resolved: number;
      recent: Alert[];
    };
  } {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      errors: this.getErrorSummary(oneDayAgo, now),
      performance: this.getPerformanceSummary(oneDayAgo, now),
      users: this.getUserSummary(oneDayAgo, now),
      alerts: this.getAlertSummary(oneDayAgo, now)
    };
  }

  // === Private Implementation Methods ===

  private getDefaultConfig(): MonitoringConfig {
    return {
      errorTracking: {
        provider: 'sentry',
        dsn: 'https://mock-sentry-dsn@sentry.io/project',
        environment: 'production',
        sampleRate: 1.0,
        enableSourceMaps: true,
        filterErrors: ['Network Error', 'Script error']
      },
      performanceMonitoring: {
        provider: 'sentry',
        apiKey: 'mock-api-key',
        traceSampleRate: 0.1,
        enableProfiling: false,
        enableWebVitals: true
      },
      userAnalytics: {
        provider: 'mixpanel',
        apiKey: 'mock-mixpanel-key',
        trackPageViews: true,
        trackUserEvents: true,
        enableHeatmaps: false
      },
      customMetrics: []
    };
  }

  private async initializeErrorTracking(): Promise<void> {
    // Initialize error tracking provider (Sentry, Bugsnag, etc.)
    logger.debug('Initializing error tracking', 'monitoring');

    // Set up global error handlers
    window.addEventListener('error', (event) => {
      this.reportError(new Error(event.message), {
        url: event.filename,
        additionalData: {
          lineNumber: event.lineno,
          columnNumber: event.colno
        }
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
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
    // Monitor performance metrics
    setInterval(() => {
      this.collectSystemMetrics();
    }, 60000); // Every minute

    // Clean up old data
    setInterval(() => {
      this.cleanupOldData();
    }, 300000); // Every 5 minutes

    // Check alert conditions
    setInterval(() => {
      this.evaluateAlertRules();
    }, 30000); // Every 30 seconds
  }

  private initializeDefaultAlertRules(): void {
    this.alertRules = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        description: 'Error rate exceeds 5% over 5 minutes',
        metric: 'error_rate',
        condition: {
          operator: 'gt',
          timeWindow: 5,
          aggregation: 'avg'
        },
        threshold: 0.05,
        severity: 'error',
        enabled: true,
        channels: ['email', 'slack'],
        cooldown: 15
      },
      {
        id: 'slow_response_time',
        name: 'Slow Response Time',
        description: 'Average response time exceeds 2 seconds',
        metric: 'response_time',
        condition: {
          operator: 'gt',
          timeWindow: 10,
          aggregation: 'avg'
        },
        threshold: 2000,
        severity: 'warning',
        enabled: true,
        channels: ['slack'],
        cooldown: 30
      }
    ];
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
      utm: parseUTMParameters()
    };

    this.sessions.push(session);
  }

  private getLocationInfo(): LocationInfo | undefined {
    // In a real implementation, this would use IP geolocation
    return undefined;
  }

  // Placeholder implementations for external service integrations
  private sendToErrorTrackingService(error: ErrorReport): void {
    logger.debug('Sending error to tracking service', 'monitoring', { errorMessage: error.message });
  }

  private sendToPerformanceService(metric: PerformanceMetric): void {
    logger.debug('Sending performance metric', 'monitoring', { name: metric.name, value: metric.value });
  }

  private sendToAnalyticsService(event: UserEvent): void {
    logger.debug('Sending user event', 'monitoring', { event: event.event, properties: event.properties });
  }

  private sendAlertNotifications(alert: Alert, rule: AlertRule): void {
    rule.channels.forEach(channel => {
      logger.debug('Sending alert notification', 'monitoring', { channel, message: alert.message });
    });
  }

  // Data aggregation methods
  private getErrorSummary(startTime: Date, endTime: Date) {
    const recentErrors = this.errors.filter(e =>
      e.timestamp >= startTime && e.timestamp <= endTime
    );

    return {
      total: this.errors.length,
      recent: recentErrors.length,
      byLevel: recentErrors.reduce((acc, error) => {
        acc[error.level] = (acc[error.level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      topErrors: recentErrors.slice(0, 10)
    };
  }

  private getPerformanceSummary(startTime: Date, endTime: Date) {
    const recentMetrics = this.performanceMetrics.filter(m =>
      m.timestamp >= startTime && m.timestamp <= endTime
    );

    return {
      avgResponseTime: this.calculateAverage(recentMetrics.filter(m => m.name === 'response_time')),
      errorRate: 0.02, // Placeholder
      throughput: recentMetrics.filter(m => m.name === 'requests').length,
      webVitals: {
        fcp: this.calculateAverage(recentMetrics.filter(m => m.name === 'web_vitals.fcp')),
        lcp: this.calculateAverage(recentMetrics.filter(m => m.name === 'web_vitals.lcp')),
        fid: this.calculateAverage(recentMetrics.filter(m => m.name === 'web_vitals.fid')),
        cls: this.calculateAverage(recentMetrics.filter(m => m.name === 'web_vitals.cls'))
      }
    };
  }

  private getUserSummary(startTime: Date, endTime: Date) {
    const recentSessions = this.sessions.filter(s =>
      s.startTime >= startTime && s.startTime <= endTime
    );

    const recentEvents = this.userEvents.filter(e =>
      e.timestamp >= startTime && e.timestamp <= endTime
    );

    return {
      activeUsers: new Set(recentSessions.map(s => s.userId).filter(Boolean)).size,
      totalSessions: recentSessions.length,
      avgSessionDuration: this.calculateAverageSessionDuration(recentSessions),
      topEvents: this.getTopEvents(recentEvents)
    };
  }

  private getAlertSummary(startTime: Date, endTime: Date) {
    const recentAlerts = this.alerts.filter(a =>
      a.triggered >= startTime && a.triggered <= endTime
    );

    return {
      active: this.alerts.filter(a => !a.resolved && !a.acknowledged).length,
      acknowledged: this.alerts.filter(a => a.acknowledged && !a.resolved).length,
      resolved: this.alerts.filter(a => a.resolved).length,
      recent: recentAlerts.slice(0, 10)
    };
  }

  // Helper methods
  private calculateAverage(metrics: PerformanceMetric[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  }

  private calculateAverageSessionDuration(sessions: UserSession[]): number {
    const completedSessions = sessions.filter(s => s.duration);
    if (completedSessions.length === 0) return 0;
    return completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / completedSessions.length;
  }

  private getTopEvents(events: UserEvent[]): Array<{ event: string; count: number }> {
    const eventCounts = events.reduce((acc, event) => {
      acc[event.event] = (acc[event.event] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(eventCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([event, count]) => ({ event, count }));
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
      url: window.location.pathname
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
    // Collect browser performance metrics
    if ('memory' in performance) {
      const memory = (performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        }
      }).memory;
      if (memory) {
        this.recordMetric('memory.used', memory.usedJSHeapSize, 'gauge');
        this.recordMetric('memory.total', memory.totalJSHeapSize, 'gauge');
      }
    }
  }

  private cleanupOldData(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

    this.errors = this.errors.filter(e => e.timestamp > cutoff);
    this.performanceMetrics = this.performanceMetrics.filter(m => m.timestamp > cutoff);
    this.userEvents = this.userEvents.filter(e => e.timestamp > cutoff);
  }

  private evaluateAlertRules(): void {
    // Evaluate alert conditions (simplified implementation)
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      // This would contain complex metric aggregation logic
      const mockValue = Math.random() * 100;
      if (this.evaluateAlertCondition(rule.condition, mockValue, rule.threshold)) {
        this.triggerAlert(rule, mockValue);
      }
    }
  }

  private evaluateAlertCondition(condition: AlertCondition, value: number, threshold: number): boolean {
    switch (condition.operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      case 'ne': return value !== threshold;
      default: return false;
    }
  }
}
