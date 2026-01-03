/**
 * Error Analytics Service
 * Provides comprehensive error tracking, analysis, and reporting capabilities
 */

import { logger } from '../LoggingService';
import { performanceMetrics } from './PerformanceMetricsService';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NETWORK = 'network',
  DATABASE = 'database',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  USER_INPUT = 'user_input',
  EXTERNAL_SERVICE = 'external_service',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  UI_RENDER = 'ui_render',
  DATA_INTEGRITY = 'data_integrity',
  CONFIGURATION = 'configuration'
}

/**
 * Error context information
 */
export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  url?: string;
  timestamp: number;
  component?: string;
  action?: string;
  stackTrace?: string;
  breadcrumbs?: ErrorBreadcrumb[];
  metadata?: Record<string, unknown>;
}

/**
 * Error breadcrumb for tracking user actions leading to error
 */
export interface ErrorBreadcrumb {
  timestamp: number;
  category: 'navigation' | 'user_action' | 'api_call' | 'state_change' | 'ui_event';
  message: string;
  level: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

/**
 * Comprehensive error information
 */
export interface ErrorReport {
  id: string;
  timestamp: number;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: ErrorContext;
  fingerprint: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  resolved: boolean;
  tags: string[];
}

/**
 * Error trend analysis
 */
export interface ErrorTrend {
  period: string;
  errorCount: number;
  uniqueErrors: number;
  criticalErrors: number;
  topCategories: Array<{ category: ErrorCategory; count: number }>;
  topComponents: Array<{ component: string; count: number }>;
}

/**
 * Error Analytics Service
 */
export class ErrorAnalyticsService {
  private static instance: ErrorAnalyticsService;
  private errors: Map<string, ErrorReport> = new Map();
  private breadcrumbs: ErrorBreadcrumb[] = [];
  private maxBreadcrumbs = 50;
  private isEnabled = true;

  private constructor() {
    this.setupGlobalErrorHandlers();
    this.startPeriodicReporting();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ErrorAnalyticsService {
    if (!ErrorAnalyticsService.instance) {
      ErrorAnalyticsService.instance = new ErrorAnalyticsService();
    }
    return ErrorAnalyticsService.instance;
  }

  /**
   * Set up global error handlers for automatic error capture
   * @private
   */
  private setupGlobalErrorHandlers(): void {
    // JavaScript errors
    window.addEventListener('error', (event) => {
      this.captureError({
        message: event.message,
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        context: {
          timestamp: Date.now(),
          url: window.location.href,
          stackTrace: event.error?.stack,
          metadata: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            type: 'javascript_error'
          }
        }
      });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        context: {
          timestamp: Date.now(),
          url: window.location.href,
          stackTrace: event.reason?.stack,
          metadata: {
            reason: event.reason,
            type: 'unhandled_promise'
          }
        }
      });
    });

    // Resource loading errors
    window.addEventListener('error', (event) => {
      const target = event.target as HTMLElement;
      if (target && target !== (window as unknown as HTMLElement)) {
        this.captureError({
          message: `Resource loading failed: ${target.tagName}`,
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.MEDIUM,
          context: {
            timestamp: Date.now(),
            url: window.location.href,
            metadata: {
              resourceType: target.tagName,
              resourceSrc: 'src' in target ? target.src : 'href' in target ? target.href : undefined,
              type: 'resource_error'
            }
          }
        });
      }
    }, true);
  }

  /**
   * Start periodic error reporting
   * @private
   */
  private startPeriodicReporting(): void {
    // Report error statistics every 5 minutes
    setInterval(() => {
      this.reportErrorStatistics();
    }, 5 * 60 * 1000);

    // Clean up old breadcrumbs every minute
    setInterval(() => {
      this.cleanupBreadcrumbs();
    }, 60 * 1000);
  }

  /**
   * Capture an error with full context
   * @param errorData - Error information
   */
  captureError(errorData: {
    message: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    context: ErrorContext;
    tags?: string[];
  }): string {
    if (!this.isEnabled) return '';

    const { message, category, severity, context, tags = [] } = errorData;

    // Generate error fingerprint for deduplication
    const fingerprint = this.generateErrorFingerprint(message, category, context);

    // Get or create error report
    let errorReport = this.errors.get(fingerprint);
    const now = Date.now();

    if (errorReport) {
      // Update existing error
      errorReport.count++;
      errorReport.lastSeen = now;
      errorReport.context = context; // Update with latest context
    } else {
      // Create new error report
      errorReport = {
        id: this.generateErrorId(),
        timestamp: now,
        message,
        category,
        severity,
        context: {
          ...context,
          breadcrumbs: [...this.breadcrumbs]
        },
        fingerprint,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        resolved: false,
        tags
      };

      this.errors.set(fingerprint, errorReport);
    }

    // Log to main logging service
    logger.error(message, 'error-analytics', {
      category,
      severity,
      fingerprint,
      count: errorReport.count,
      component: context.component,
      action: context.action,
      ...context.metadata
    });

    // Track performance impact if this is a performance-related error
    if (category === ErrorCategory.PERFORMANCE) {
      performanceMetrics.recordMetric('error_impact', 1, 'error', {
        category,
        severity,
        component: context.component
      });
    }

    // Auto-escalate critical errors
    if (severity === ErrorSeverity.CRITICAL) {
      this.escalateCriticalError(errorReport);
    }

    return errorReport.id;
  }

  /**
   * Add a breadcrumb to track user actions
   * @param breadcrumb - Breadcrumb information
   */
  addBreadcrumb(breadcrumb: ErrorBreadcrumb): void {
    if (!this.isEnabled) return;

    this.breadcrumbs.push(breadcrumb);

    // Keep only the most recent breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }

    // Log breadcrumb for debugging
    logger.debug('Breadcrumb added', 'breadcrumb', breadcrumb as unknown as Record<string, unknown>);
  }

  /**
   * Add navigation breadcrumb
   * @param from - Previous location
   * @param to - New location
   */
  addNavigationBreadcrumb(from: string, to: string): void {
    this.addBreadcrumb({
      timestamp: Date.now(),
      category: 'navigation',
      message: `Navigated from ${from} to ${to}`,
      level: 'info',
      data: { from, to }
    });
  }

  /**
   * Add user action breadcrumb
   * @param action - Action performed
   * @param target - Target of the action
   * @param metadata - Additional context
   */
  addUserActionBreadcrumb(action: string, target: string, metadata?: Record<string, unknown>): void {
    this.addBreadcrumb({
      timestamp: Date.now(),
      category: 'user_action',
      message: `User ${action} on ${target}`,
      level: 'info',
      data: { action, target, ...metadata }
    });
  }

  /**
   * Add API call breadcrumb
   * @param method - HTTP method
   * @param url - API endpoint
   * @param status - Response status
   * @param duration - Request duration
   */
  addApiCallBreadcrumb(method: string, url: string, status: number, duration: number): void {
    this.addBreadcrumb({
      timestamp: Date.now(),
      category: 'api_call',
      message: `${method} ${url} - ${status} (${duration}ms)`,
      level: status >= 400 ? 'error' : 'info',
      data: { method, url, status, duration }
    });
  }

  /**
   * Add state change breadcrumb
   * @param store - Store name
   * @param action - Action performed
   * @param changes - Number of changes
   */
  addStateChangeBreadcrumb(store: string, action: string, changes: number): void {
    this.addBreadcrumb({
      timestamp: Date.now(),
      category: 'state_change',
      message: `State change in ${store}: ${action} (${changes} changes)`,
      level: 'info',
      data: { store, action, changes }
    });
  }

  /**
   * Generate error fingerprint for deduplication
   * @private
   */
  private generateErrorFingerprint(message: string, category: ErrorCategory, context: ErrorContext): string {
    const normalizedMessage = message
      .replace(/\d+/g, 'N') // Replace numbers with N
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, 'UUID') // Replace UUIDs
      .replace(/https?:\/\/[^\s]+/g, 'URL') // Replace URLs
      .substring(0, 100);

    const componentPart = context.component || 'unknown';
    const actionPart = context.action || 'unknown';

    return `${category}-${componentPart}-${actionPart}-${normalizedMessage}`;
  }

  /**
   * Generate unique error ID
   * @private
   */
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Escalate critical errors
   * @private
   */
  private escalateCriticalError(errorReport: ErrorReport): void {
    logger.fatal(
      `CRITICAL ERROR: ${errorReport.message}`,
      'critical-error',
      {
        errorId: errorReport.id,
        category: errorReport.category,
        context: errorReport.context,
        count: errorReport.count
      }
    );

    // In a real application, this would send alerts to monitoring systems
    console.error('🚨 CRITICAL ERROR DETECTED:', errorReport);
  }

  /**
   * Clean up old breadcrumbs
   * @private
   */
  private cleanupBreadcrumbs(): void {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.breadcrumbs = this.breadcrumbs.filter(b => b.timestamp > oneHourAgo);
  }

  /**
   * Report error statistics
   * @private
   */
  private reportErrorStatistics(): void {
    const stats = this.getErrorStatistics();
    
    logger.info('Error Statistics Report', 'error-statistics', {
      totalErrors: stats.totalErrors,
      uniqueErrors: stats.uniqueErrors,
      criticalErrors: stats.criticalErrors,
      topCategories: stats.topCategories.slice(0, 5),
      errorRate: stats.errorRate
    });
  }

  /**
   * Get comprehensive error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    uniqueErrors: number;
    criticalErrors: number;
    resolvedErrors: number;
    topCategories: Array<{ category: ErrorCategory; count: number }>;
    topComponents: Array<{ component: string; count: number }>;
    errorRate: number;
    averageResolutionTime: number;
  } {
    const errors = Array.from(this.errors.values());
    const totalErrors = errors.reduce((sum, error) => sum + error.count, 0);
    const criticalErrors = errors.filter(e => e.severity === ErrorSeverity.CRITICAL).length;
    const resolvedErrors = errors.filter(e => e.resolved).length;

    // Calculate top categories
    const categoryCount = new Map<ErrorCategory, number>();
    errors.forEach(error => {
      categoryCount.set(error.category, (categoryCount.get(error.category) || 0) + error.count);
    });
    const topCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // Calculate top components
    const componentCount = new Map<string, number>();
    errors.forEach(error => {
      const component = error.context.component || 'unknown';
      componentCount.set(component, (componentCount.get(component) || 0) + error.count);
    });
    const topComponents = Array.from(componentCount.entries())
      .map(([component, count]) => ({ component, count }))
      .sort((a, b) => b.count - a.count);

    // Calculate error rate (errors per session)
    const sessions = new Set(errors.map(e => e.context.sessionId).filter(Boolean));
    const errorRate = sessions.size > 0 ? totalErrors / sessions.size : 0;

    // Calculate average resolution time (for resolved errors)
    const resolvedErrorsWithTime = errors.filter(e => e.resolved && e.lastSeen > e.firstSeen);
    const averageResolutionTime = resolvedErrorsWithTime.length > 0
      ? resolvedErrorsWithTime.reduce((sum, e) => sum + (e.lastSeen - e.firstSeen), 0) / resolvedErrorsWithTime.length
      : 0;

    return {
      totalErrors,
      uniqueErrors: errors.length,
      criticalErrors,
      resolvedErrors,
      topCategories,
      topComponents,
      errorRate,
      averageResolutionTime
    };
  }

  /**
   * Get error trend analysis
   * @param periodHours - Period in hours to analyze
   */
  getErrorTrend(periodHours = 24): ErrorTrend {
    const cutoffTime = Date.now() - (periodHours * 60 * 60 * 1000);
    const recentErrors = Array.from(this.errors.values()).filter(e => e.lastSeen > cutoffTime);

    const errorCount = recentErrors.reduce((sum, error) => sum + error.count, 0);
    const criticalErrors = recentErrors.filter(e => e.severity === ErrorSeverity.CRITICAL).length;

    // Top categories in the period
    const categoryCount = new Map<ErrorCategory, number>();
    recentErrors.forEach(error => {
      categoryCount.set(error.category, (categoryCount.get(error.category) || 0) + error.count);
    });
    const topCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top components in the period
    const componentCount = new Map<string, number>();
    recentErrors.forEach(error => {
      const component = error.context.component || 'unknown';
      componentCount.set(component, (componentCount.get(component) || 0) + error.count);
    });
    const topComponents = Array.from(componentCount.entries())
      .map(([component, count]) => ({ component, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      period: `${periodHours}h`,
      errorCount,
      uniqueErrors: recentErrors.length,
      criticalErrors,
      topCategories,
      topComponents
    };
  }

  /**
   * Get all error reports
   */
  getAllErrors(): ErrorReport[] {
    return Array.from(this.errors.values()).sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /**
   * Get error by ID
   */
  getErrorById(id: string): ErrorReport | undefined {
    return Array.from(this.errors.values()).find(e => e.id === id);
  }

  /**
   * Mark error as resolved
   */
  markErrorResolved(fingerprint: string): boolean {
    const error = this.errors.get(fingerprint);
    if (error) {
      error.resolved = true;
      logger.info(`Error marked as resolved: ${error.message}`, 'error-resolution', {
        fingerprint,
        errorId: error.id,
        category: error.category
      });
      return true;
    }
    return false;
  }

  /**
   * Clear all errors
   */
  clearAllErrors(): void {
    this.errors.clear();
    this.breadcrumbs = [];
    logger.info('All errors cleared', 'error-analytics');
  }

  /**
   * Enable or disable error tracking
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.info(`Error analytics ${enabled ? 'enabled' : 'disabled'}`, 'error-analytics');
  }

  /**
   * Generate comprehensive error report
   */
  generateErrorReport(): {
    timestamp: string;
    summary: ReturnType<ErrorAnalyticsService['getErrorStatistics']>;
    trend: ErrorTrend;
    topErrors: ErrorReport[];
    recommendations: string[];
  } {
    const summary = this.getErrorStatistics();
    const trend = this.getErrorTrend();
    const topErrors = this.getAllErrors().slice(0, 10);

    const recommendations: string[] = [];

    // Generate recommendations based on error patterns
    if (summary.criticalErrors > 0) {
      recommendations.push(`Address ${summary.criticalErrors} critical errors immediately`);
    }

    if (summary.errorRate > 5) {
      recommendations.push('High error rate detected - review error handling and validation');
    }

    const topCategory = summary.topCategories[0];
    if (topCategory && topCategory.count > summary.totalErrors * 0.3) {
      recommendations.push(`${topCategory.category} errors are prevalent - focus on this category`);
    }

    if (summary.averageResolutionTime > 24 * 60 * 60 * 1000) {
      recommendations.push('Improve error resolution process - average resolution time is too high');
    }

    return {
      timestamp: new Date().toISOString(),
      summary,
      trend,
      topErrors,
      recommendations
    };
  }
}

// Export singleton instance
export const errorAnalytics = ErrorAnalyticsService.getInstance();