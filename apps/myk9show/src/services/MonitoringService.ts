/**
 * Monitoring Service for myK9Show
 * Comprehensive application monitoring including performance, errors, and user analytics
 */

import { logger } from './LoggingService';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  metadata?: Record<string, unknown> | undefined;
}

export interface ErrorMetric {
  message: string;
  stack?: string | undefined;
  component?: string | undefined;
  userId?: string | undefined;
  timestamp: number;
  fingerprint: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface UserMetric {
  event: string;
  userId?: string | undefined;
  sessionId: string;
  timestamp: number;
  properties?: Record<string, unknown> | undefined;
}

/**
 * Performance Monitor
 */
class PerformanceMonitor {
  private observers: PerformanceObserver[] = [];
  private metrics = new Map<string, PerformanceMetric[]>();
  private isInitialized = false;

  constructor() {
    // Only initialize performance monitoring in development or when explicitly enabled
    if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_PERFORMANCE_MONITORING === 'true') {
      this.initialize();
    }
  }

  private initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.setupPerformanceObservers();
    this.trackWebVitals();
  }

  public enableMonitoring(): void {
    if (!this.isInitialized) {
      this.initialize();
    }
  }

  private setupPerformanceObservers(): void {
    // Navigation timing
    if ('PerformanceObserver' in window) {
      try {
        const navObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === 'navigation') {
              const navEntry = entry as PerformanceNavigationTiming;
              this.recordMetric('navigation.domContentLoaded', navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart, 'ms', {
                type: navEntry.type,
                url: navEntry.name,
              });
              
              this.recordMetric('navigation.load', navEntry.loadEventEnd - navEntry.loadEventStart, 'ms', {
                type: navEntry.type,
                url: navEntry.name,
              });
            }
          });
        });
        navObserver.observe({ entryTypes: ['navigation'] });
        this.observers.push(navObserver);
      } catch (error) {
        logger.warn('Failed to setup navigation observer', 'monitoring', { error: error?.toString() });
      }

      // Resource timing
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === 'resource') {
              const resourceEntry = entry as PerformanceResourceTiming;
              this.recordMetric('resource.load', resourceEntry.duration, 'ms', {
                name: resourceEntry.name,
                type: this.getResourceType(resourceEntry.name),
                size: resourceEntry.transferSize,
              });
            }
          });
        });
        resourceObserver.observe({ entryTypes: ['resource'] });
        this.observers.push(resourceObserver);
      } catch (error) {
        logger.warn('Failed to setup resource observer', 'monitoring', { error: error?.toString() });
      }

      // Long tasks
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === 'longtask') {
              this.recordMetric('longtask.duration', entry.duration, 'ms', {
                name: entry.name,
                startTime: entry.startTime,
              });
              
              // Only log in development to avoid performance overhead
              if (import.meta.env.DEV) {
                logger.warn(`Long task detected: ${entry.duration}ms`, 'performance', {
                  duration: entry.duration,
                  startTime: entry.startTime,
                });
              }
            }
          });
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch (error) {
        logger.warn('Failed to setup long task observer', 'monitoring', { error: error?.toString() });
      }
    }
  }

  private trackWebVitals(): void {
    // First Input Delay (FID)
    if ('PerformanceObserver' in window) {
      try {
        const fidObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === 'first-input') {
              const fidEntry = entry as PerformanceEventTiming;
              this.recordMetric('webvitals.fid', fidEntry.processingStart - fidEntry.startTime, 'ms');
            }
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch (error) {
        logger.warn('Failed to setup FID observer', 'monitoring', { error: error?.toString() });
      }
    }

    // Largest Contentful Paint (LCP)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as PerformancePaintTiming;
          if (lastEntry) {
            this.recordMetric('webvitals.lcp', lastEntry.startTime, 'ms', {
              element: 'element' in lastEntry ? (lastEntry as unknown as { element?: { tagName?: string } }).element?.tagName : undefined,
            });
          }
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.push(lcpObserver);
      } catch (error) {
        logger.warn('Failed to setup LCP observer', 'monitoring', { error: error?.toString() });
      }
    }

    // Cumulative Layout Shift (CLS)
    if ('PerformanceObserver' in window) {
      try {
        let clsScore = 0;
        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.entryType === 'layout-shift' && !('hadRecentInput' in entry && (entry as unknown as { hadRecentInput: boolean }).hadRecentInput)) {
              clsScore += 'value' in entry ? (entry as unknown as { value: number }).value : 0;
            }
          });
          this.recordMetric('webvitals.cls', clsScore, 'score');
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(clsObserver);
      } catch (error) {
        logger.warn('Failed to setup CLS observer', 'monitoring', { error: error?.toString() });
      }
    }
  }

  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'stylesheet';
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    return 'other';
  }

  recordMetric(name: string, value: number, unit: string, metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      metadata,
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(metric);

    // Log performance issues
    if (this.isPerformanceIssue(name, value)) {
      logger.warn(`Performance issue detected: ${name} = ${value}${unit}`, 'performance', metadata);
    }

    // Send to external monitoring if configured
    this.sendToExternalMonitoring(metric);
  }

  private isPerformanceIssue(name: string, value: number): boolean {
    const thresholds: Record<string, number> = {
      'webvitals.fid': 100, // 100ms
      'webvitals.lcp': 2500, // 2.5s
      'webvitals.cls': 0.1, // 0.1 score
      'longtask.duration': 50, // 50ms
    };

    return Boolean(thresholds[name] && value > thresholds[name]);
  }

  private sendToExternalMonitoring(metric: PerformanceMetric): void {
    // Send to DataDog, New Relic, or other monitoring services
    if (import.meta.env.VITE_DATADOG_CLIENT_TOKEN && window.DD_RUM) {
      window.DD_RUM.addUserAction(metric.name, {
        value: metric.value,
        unit: metric.unit,
        ...metric.metadata,
      });
    }

    // Send to Google Analytics
    if (window.gtag) {
      window.gtag('event', 'performance_metric', {
        metric_name: metric.name,
        metric_value: metric.value,
        metric_unit: metric.unit,
      });
    }
  }

  getMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      return this.metrics.get(name) || [];
    }
    return Array.from(this.metrics.values()).flat();
  }

  destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

/**
 * Error Monitor
 */
class ErrorMonitor {
  private errors: ErrorMetric[] = [];

  constructor() {
    this.setupErrorHandlers();
  }

  private setupErrorHandlers(): void {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.recordError({
        message: event.message,
        stack: event.error?.stack,
        component: 'global',
        timestamp: Date.now(),
        fingerprint: this.generateFingerprint(event.message, event.filename),
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.recordError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        component: 'promise',
        timestamp: Date.now(),
        fingerprint: this.generateFingerprint(`promise-${event.reason}`, 'unhandled'),
        metadata: {
          reason: event.reason,
        },
      });
    });
  }

  recordError(error: Omit<ErrorMetric, 'fingerprint'> & { fingerprint?: string }): void {
    const errorMetric: ErrorMetric = {
      ...error,
      fingerprint: error.fingerprint || this.generateFingerprint(error.message, error.component),
    };

    this.errors.push(errorMetric);

    // Log to logging service
    logger.error(errorMetric.message, 'error-monitor', {
      component: errorMetric.component,
      stack: errorMetric.stack,
      ...errorMetric.metadata,
    });

    // Send to external error tracking
    this.sendToExternalErrorTracking(errorMetric);
  }

  private generateFingerprint(message: string, component?: string): string {
    const normalized = message.replace(/\d+/g, 'X').substring(0, 100);
    return `${component || 'unknown'}-${normalized}`;
  }

  private sendToExternalErrorTracking(error: ErrorMetric): void {
    // Send to Sentry
    if (window.Sentry) {
      window.Sentry.captureException(new Error(error.message), {
        tags: {
          component: error.component,
        },
        extra: error.metadata,
        fingerprint: [error.fingerprint],
      });
    }

    // Send to DataDog
    if (window.DD_RUM) {
      window.DD_RUM.addError(new Error(error.message), {
        component: error.component,
        ...error.metadata,
      });
    }
  }

  getErrors(): ErrorMetric[] {
    return [...this.errors];
  }

  getErrorsByFingerprint(): Map<string, ErrorMetric[]> {
    const grouped = new Map<string, ErrorMetric[]>();
    this.errors.forEach(error => {
      if (!grouped.has(error.fingerprint)) {
        grouped.set(error.fingerprint, []);
      }
      grouped.get(error.fingerprint)!.push(error);
    });
    return grouped;
  }
}

/**
 * User Analytics Monitor
 */
class UserAnalyticsMonitor {
  private sessionId: string;
  private userId?: string;
  private events: UserMetric[] = [];

  constructor() {
    this.sessionId = this.generateSessionId();
    this.trackPageViews();
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private trackPageViews(): void {
    // Track initial page view
    this.trackEvent('page_view', {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
    });

    // Track navigation changes (for SPA)
    let currentUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        this.trackEvent('page_view', {
          url: currentUrl,
          title: document.title,
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  trackEvent(event: string, properties?: Record<string, unknown>): void {
    const metric: UserMetric = {
      event,
      userId: this.userId,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      properties: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        ...properties,
      },
    };

    this.events.push(metric);

    // Log user action
    logger.logUserAction(event, String(properties?.target) || 'unknown', properties);

    // Send to external analytics
    this.sendToExternalAnalytics(metric);
  }

  private sendToExternalAnalytics(metric: UserMetric): void {
    // Send to Google Analytics
    if (window.gtag) {
      window.gtag('event', metric.event, {
        user_id: metric.userId,
        session_id: metric.sessionId,
        ...metric.properties,
      });
    }

    // Send to Mixpanel
    if (window.mixpanel) {
      window.mixpanel.track(metric.event, {
        distinct_id: metric.userId,
        ...metric.properties,
      });
    }

    // Send to custom analytics endpoint
    if (import.meta.env.VITE_ANALYTICS_ENDPOINT) {
      fetch(import.meta.env.VITE_ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metric),
      }).catch(error => {
        logger.warn('Failed to send analytics event', 'analytics', { error: error.toString() });
      });
    }
  }

  getEvents(): UserMetric[] {
    return [...this.events];
  }

  getSessionEvents(): UserMetric[] {
    return this.events.filter(event => event.sessionId === this.sessionId);
  }
}

/**
 * Main Monitoring Service
 */
export class MonitoringService {
  private static instance: MonitoringService;
  private performanceMonitor: PerformanceMonitor;
  private errorMonitor: ErrorMonitor;
  private userAnalyticsMonitor: UserAnalyticsMonitor;

  private constructor() {
    this.performanceMonitor = new PerformanceMonitor();
    this.errorMonitor = new ErrorMonitor();
    this.userAnalyticsMonitor = new UserAnalyticsMonitor();
  }

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  // Performance monitoring
  recordPerformanceMetric(name: string, value: number, unit: string, metadata?: Record<string, unknown>): void {
    this.performanceMonitor.recordMetric(name, value, unit, metadata);
  }

  getPerformanceMetrics(name?: string): PerformanceMetric[] {
    return this.performanceMonitor.getMetrics(name);
  }

  enablePerformanceMonitoring(): void {
    this.performanceMonitor.enableMonitoring();
  }

  // Error monitoring
  recordError(message: string, component?: string, metadata?: Record<string, unknown>, error?: Error): void {
    this.errorMonitor.recordError({
      message,
      stack: error?.stack,
      component,
      timestamp: Date.now(),
      fingerprint: this.generateErrorFingerprint(message, component),
      metadata,
    });
  }

  getErrors(): ErrorMetric[] {
    return this.errorMonitor.getErrors();
  }

  getErrorsByFingerprint(): Map<string, ErrorMetric[]> {
    return this.errorMonitor.getErrorsByFingerprint();
  }

  // User analytics
  setUserId(userId: string): void {
    this.userAnalyticsMonitor.setUserId(userId);
    logger.setUserId(userId);
  }

  trackUserEvent(event: string, properties?: Record<string, unknown>): void {
    this.userAnalyticsMonitor.trackEvent(event, properties);
  }

  getUserEvents(): UserMetric[] {
    return this.userAnalyticsMonitor.getEvents();
  }

  getSessionEvents(): UserMetric[] {
    return this.userAnalyticsMonitor.getSessionEvents();
  }

  // Feature usage tracking
  trackFeatureUsage(feature: string, metadata?: Record<string, unknown>): void {
    this.trackUserEvent('feature_used', { feature, ...metadata });
    logger.logFeatureUsage(feature, metadata);
  }

  // API call tracking
  trackApiCall(method: string, url: string, status: number, duration: number, metadata?: Record<string, unknown>): void {
    this.recordPerformanceMetric('api.response_time', duration, 'ms', {
      method,
      url,
      status,
      ...metadata,
    });

    this.trackUserEvent('api_call', {
      method,
      url,
      status,
      duration,
      ...metadata,
    });

    logger.logApiCall(method, url, status, duration, metadata);
  }

  // Resource timing
  measureResourceTiming<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    return fn().then(
      result => {
        const duration = performance.now() - startTime;
        this.recordPerformanceMetric(`resource.${name}`, duration, 'ms');
        return result;
      },
      error => {
        const duration = performance.now() - startTime;
        this.recordPerformanceMetric(`resource.${name}`, duration, 'ms', { error: true });
        this.recordError(`Resource timing error: ${name}`, 'resource', { error: error.toString() }, error);
        throw error;
      }
    );
  }

  // Component performance
  measureComponentRender<T>(componentName: string, fn: () => T): T {
    const startTime = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - startTime;
      this.recordPerformanceMetric(`component.render.${componentName}`, duration, 'ms');
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordPerformanceMetric(`component.render.${componentName}`, duration, 'ms', { error: true });
      this.recordError(`Component render error: ${componentName}`, 'component', {}, error as Error);
      throw error;
    }
  }

  private generateErrorFingerprint(message: string, component?: string): string {
    const normalized = message.replace(/\d+/g, 'X').substring(0, 100);
    return `${component || 'unknown'}-${normalized}`;
  }

  // Health check
  getHealthStatus(): {
    performance: { avg: number; p95: number };
    errors: { total: number; recent: number };
    users: { active: number };
  } {
    const performanceMetrics = this.getPerformanceMetrics();
    const errors = this.getErrors();
    const userEvents = this.getUserEvents();

    const recentErrors = errors.filter(error => 
      Date.now() - error.timestamp < 5 * 60 * 1000 // Last 5 minutes
    );

    const recentEvents = userEvents.filter(event =>
      Date.now() - event.timestamp < 30 * 60 * 1000 // Last 30 minutes
    );

    const activeUsers = new Set(recentEvents.map(e => e.userId).filter(Boolean)).size;

    const performanceTimes = performanceMetrics
      .filter(m => m.unit === 'ms')
      .map(m => m.value)
      .sort((a, b) => a - b);

    const avg = performanceTimes.length > 0 
      ? performanceTimes.reduce((a, b) => a + b, 0) / performanceTimes.length 
      : 0;

    const p95Index = Math.floor(performanceTimes.length * 0.95);
    const p95 = performanceTimes[p95Index] || 0;

    return {
      performance: { avg, p95 },
      errors: { total: errors.length, recent: recentErrors.length },
      users: { active: activeUsers },
    };
  }

  destroy(): void {
    this.performanceMonitor.destroy();
  }
}

// Export singleton instance
export const monitoring = MonitoringService.getInstance();

// Global type declarations for external services
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    mixpanel?: {
      track: (event: string, properties?: Record<string, unknown>) => void;
    };
    DD_RUM?: {
      addUserAction: (name: string, context?: Record<string, unknown>) => void;
      addError: (error: Error, context?: Record<string, unknown>) => void;
    };
    Sentry?: {
      captureException: (error: Error, context?: Record<string, unknown>) => void;
    };
  }
}