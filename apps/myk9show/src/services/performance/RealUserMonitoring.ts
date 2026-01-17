/**
 * Real User Monitoring (RUM) Service
 *
 * Collects and analyzes real user performance metrics including
 * Core Web Vitals, custom metrics, and user experience data.
 */

import { logger } from '@/services/LoggingService';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface WebVital {
  name: 'FCP' | 'LCP' | 'CLS' | 'FID' | 'TTFB' | 'INP';
  value: number;
  delta: number;
  entries: PerformanceEntry[];
  id: string;
  navigationType?: string;
}

export interface CustomMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface UserSession {
  sessionId: string;
  userId?: string;
  startTime: number;
  endTime?: number;
  pageViews: number;
  totalTime: number;
  device: DeviceInfo;
  connection: ConnectionInfo;
  vitals: WebVital[];
  customMetrics: CustomMetric[];
  errors: ErrorInfo[];
}

export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser: string;
  version: string;
  screenResolution: string;
  pixelRatio: number;
}

export interface ConnectionInfo {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

export interface ErrorInfo {
  message: string;
  stack?: string;
  url: string;
  lineNumber?: number;
  columnNumber?: number;
  timestamp: number;
  userId?: string;
}

export interface PerformanceBudget {
  metric: string;
  threshold: number;
  severity: 'error' | 'warning' | 'info';
  description: string;
}

export interface PerformanceAlert {
  id: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'error' | 'warning' | 'info';
  timestamp: number;
  url: string;
  userId?: string;
  resolved: boolean;
}

const PERFORMANCE_BUDGETS: PerformanceBudget[] = [
  { metric: 'LCP', threshold: 2500, severity: 'error', description: 'Largest Contentful Paint should be under 2.5s' },
  { metric: 'FCP', threshold: 1800, severity: 'warning', description: 'First Contentful Paint should be under 1.8s' },
  { metric: 'CLS', threshold: 0.1, severity: 'error', description: 'Cumulative Layout Shift should be under 0.1' },
  { metric: 'FID', threshold: 100, severity: 'error', description: 'First Input Delay should be under 100ms' },
  { metric: 'TTFB', threshold: 600, severity: 'warning', description: 'Time to First Byte should be under 600ms' },
  { metric: 'INP', threshold: 200, severity: 'error', description: 'Interaction to Next Paint should be under 200ms' },
];

export class RealUserMonitoringService {
  private sessionId: string;
  private session: UserSession;
  private longTaskObserver: PerformanceObserver | null = null;
  private alerts: PerformanceAlert[] = [];
  private isInitialized = false;

  constructor() {
    this.sessionId = this.generateSessionId();
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

    // Start session tracking
    this.session.startTime = Date.now();
    
    // End session on page unload
    window.addEventListener('beforeunload', () => {
      this.endSession();
    });

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.trackCustomMetric('page_hidden', Date.now());
      } else {
        this.trackCustomMetric('page_visible', Date.now());
      }
    });
  }

  /**
   * Setup Web Vitals collection using the web-vitals library pattern
   */
  private setupWebVitalsCollection(): void {
    // Largest Contentful Paint
    this.observeVital('largest-contentful-paint', (entries) => {
      const lastEntry = entries[entries.length - 1];
      this.recordVital('LCP', lastEntry.startTime, entries);
    });

    // First Contentful Paint
    this.observeVital('paint', (entries) => {
      const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint');
      if (fcpEntry) {
        this.recordVital('FCP', fcpEntry.startTime, [fcpEntry]);
      }
    });

    // Cumulative Layout Shift
    this.observeVital('layout-shift', (entries) => {
      let clsValue = 0;
      entries.forEach(entry => {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      });
      this.recordVital('CLS', clsValue, entries);
    });

    // First Input Delay / Interaction to Next Paint
    this.observeVital('first-input', (entries) => {
      const firstInput = entries[0];
      const fid = (firstInput as any).processingStart - firstInput.startTime;
      this.recordVital('FID', fid, [firstInput]);
    });

    // Navigation timing for TTFB
    this.observeVital('navigation', (entries) => {
      const nav = entries[0] as PerformanceNavigationTiming;
      const ttfb = nav.responseStart - nav.requestStart;
      this.recordVital('TTFB', ttfb, [nav]);
    });
  }

  /**
   * Observe a specific performance entry type
   */
  private observeVital(
    type: string, 
    callback: (entries: PerformanceEntry[]) => void
  ): void {
    try {
      const observer = new PerformanceObserver((list) => {
        callback(list.getEntries());
      });
      observer.observe({ type, buffered: true });
    } catch (error) {
      logger.warn('Failed to observe performance type', 'performance', { type }, error as Error);
    }
  }

  /**
   * Record a web vital measurement
   */
  private recordVital(
    name: WebVital['name'], 
    value: number, 
    entries: PerformanceEntry[]
  ): void {
    const vital: WebVital = {
      name,
      value: Math.round(value * 100) / 100, // Round to 2 decimal places
      delta: value, // For first measurement, delta equals value
      entries,
      id: this.generateId(),
      navigationType: this.getNavigationType(),
    };

    // Update existing vital or add new one
    const existingIndex = this.session.vitals.findIndex(v => v.name === name);
    if (existingIndex >= 0) {
      const existing = this.session.vitals[existingIndex];
      vital.delta = vital.value - existing.value;
      this.session.vitals[existingIndex] = vital;
    } else {
      this.session.vitals.push(vital);
    }

    // Check against performance budgets
    this.checkPerformanceBudget(name, value);

    // Log significant vitals
    logger.debug('Web vital recorded', 'performance', { name, valueMs: value.toFixed(2) });
  }

  /**
   * Setup long task monitoring
   */
  private setupLongTaskMonitoring(): void {
    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach(entry => {
          const longTask = entry as any;
          
          this.trackCustomMetric('long_task_duration', longTask.duration, {
            startTime: longTask.startTime.toString(),
            attribution: longTask.attribution?.[0]?.name || 'unknown'
          });

          // Alert for very long tasks
          if (longTask.duration > 200) {
            this.createAlert(
              'long_task',
              longTask.duration,
              200,
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

  /**
   * Setup error tracking
   */
  private setupErrorTracking(): void {
    window.addEventListener('error', (event) => {
      this.trackError({
        message: event.message,
        stack: event.error?.stack,
        url: event.filename || window.location.href,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        timestamp: Date.now(),
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.trackError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        url: window.location.href,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Setup navigation tracking
   */
  private setupNavigationTracking(): void {
    // Track route changes (for SPAs)
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

    // Use MutationObserver to detect route changes
    const observer = new MutationObserver(trackNavigation);
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['data-route'] // If you use route attributes
    });

    // Also listen for popstate events
    window.addEventListener('popstate', trackNavigation);
  }

  /**
   * Setup resource timing tracking
   */
  private setupResourceTracking(): void {
    this.observeVital('resource', (entries) => {
      entries.forEach(entry => {
        const resource = entry as PerformanceResourceTiming;
        
        // Track slow resources
        const loadTime = resource.responseEnd - resource.startTime;
        if (loadTime > 2000) { // 2 seconds threshold
          this.trackCustomMetric('slow_resource', loadTime, {
            name: resource.name,
            type: resource.initiatorType,
            size: resource.encodedBodySize?.toString() || '0',
          });
        }

        // Track failed resources
        if (resource.duration === 0) {
          this.trackCustomMetric('failed_resource', 1, {
            name: resource.name,
            type: resource.initiatorType,
          });
        }
      });
    });
  }

  /**
   * Setup memory monitoring for production readiness
   */
  private setupMemoryMonitoring(): void {
    // Initial memory check
    this.trackMemoryMetrics();

    // Periodic memory monitoring (every 30 seconds)
    setInterval(() => {
      this.trackMemoryMetrics();
    }, 30000);

    // Monitor during navigation changes
    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      setTimeout(() => this.trackMemoryMetrics(), 1000); // Allow time for navigation
    };
  }

  /**
   * Track comprehensive memory metrics
   */
  private trackMemoryMetrics(): void {
    if (!('memory' in performance)) {
      this.trackCustomMetric('memory_api_unavailable', 1, { reason: 'no_performance_memory' });
      return;
    }

    const memInfo = (performance as any).memory;
    const usedMB = memInfo.usedJSHeapSize / 1024 / 1024;
    const totalMB = memInfo.totalJSHeapSize / 1024 / 1024;
    const limitMB = memInfo.jsHeapSizeLimit / 1024 / 1024;
    
    // Basic memory tracking
    this.trackCustomMetric('memory_used', usedMB, { unit: 'MB' });
    this.trackCustomMetric('memory_total', totalMB, { unit: 'MB' });
    
    // Calculate memory pressure levels
    const usagePercent = (usedMB / limitMB) * 100;
    const growthRate = totalMB / usedMB;

    // Memory pressure alerts
    if (usagePercent > 80) {
      this.trackCustomMetric('memory_pressure_critical', usagePercent, {
        used: usedMB.toFixed(1),
        limit: limitMB.toFixed(1),
        severity: 'critical',
        recommendation: 'immediate_cleanup'
      });
    } else if (usagePercent > 60) {
      this.trackCustomMetric('memory_pressure_high', usagePercent, {
        used: usedMB.toFixed(1),
        limit: limitMB.toFixed(1),
        severity: 'warning',
        recommendation: 'consider_cleanup'
      });
    }

    // Detect potential memory leaks
    if (growthRate > 1.8) {
      this.trackCustomMetric('memory_growth_rapid', growthRate, {
        growth_rate: growthRate.toFixed(2),
        total_mb: totalMB.toFixed(1),
        used_mb: usedMB.toFixed(1),
        concern: 'potential_leak'
      });
    }

    // Mobile device memory concerns
    if (this.isMobileDevice() && usedMB > 50) {
      this.trackCustomMetric('mobile_memory_concern', usedMB, {
        device_type: 'mobile',
        memory_mb: usedMB.toFixed(1),
        recommendation: 'data_scoping_cleanup'
      });
    }

    // DOM node tracking (performance indicator)
    const domNodes = document.querySelectorAll('*').length;
    this.trackCustomMetric('dom_nodes', domNodes, { 
      threshold: domNodes > 1500 ? 'high' : 'normal' 
    });
  }

  /**
   * Check if device is mobile for memory optimization
   */
  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth < 768;
  }

  /**
   * Track custom metric
   */
  public trackCustomMetric(
    name: string, 
    value: number, 
    tags?: Record<string, string>
  ): void {
    const metric: CustomMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags,
    };

    this.session.customMetrics.push(metric);

    // Limit metrics to prevent memory issues
    if (this.session.customMetrics.length > 1000) {
      this.session.customMetrics = this.session.customMetrics.slice(-500);
    }
  }

  /**
   * Track error
   */
  public trackError(error: Omit<ErrorInfo, 'userId'>): void {
    const errorInfo: ErrorInfo = {
      ...error,
      userId: this.session.userId,
    };

    this.session.errors.push(errorInfo);
    logger.error('RUM Error tracked', 'performance', { errorInfo });

    // Limit errors to prevent memory issues
    if (this.session.errors.length > 100) {
      this.session.errors = this.session.errors.slice(-50);
    }
  }

  /**
   * Check performance budget
   */
  private checkPerformanceBudget(metric: string, value: number): void {
    const budget = PERFORMANCE_BUDGETS.find(b => b.metric === metric);
    if (!budget) return;

    if (value > budget.threshold) {
      this.createAlert(
        metric,
        value,
        budget.threshold,
        budget.severity,
        window.location.href
      );
    }
  }

  /**
   * Create performance alert
   */
  private createAlert(
    metric: string,
    value: number,
    threshold: number,
    severity: 'error' | 'warning' | 'info',
    url: string
  ): void {
    const alert: PerformanceAlert = {
      id: this.generateId(),
      metric,
      value,
      threshold,
      severity,
      timestamp: Date.now(),
      url,
      userId: this.session.userId,
      resolved: false,
    };

    this.alerts.push(alert);

    // Log alert
    logger.warn('Performance Alert', 'performance', { metric, value: value.toFixed(2), threshold, severity });

    // Limit alerts
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-25);
    }
  }

  /**
   * Get current session data
   */
  public getSessionData(): UserSession {
    return {
      ...this.session,
      totalTime: Date.now() - this.session.startTime,
    };
  }

  /**
   * Get performance summary
   */
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

  /**
   * Export session data for analysis
   */
  public exportSessionData(): string {
    const data = {
      session: this.getSessionData(),
      alerts: this.alerts,
      summary: this.getPerformanceSummary(),
      exportedAt: new Date().toISOString(),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * End current session
   */
  public endSession(): void {
    this.session.endTime = Date.now();
    this.session.totalTime = this.session.endTime - this.session.startTime;

    // Send session data to analytics service
    this.sendSessionData();

    logger.debug('RUM Session ended', 'performance', this.getPerformanceSummary());
  }

  /**
   * Send session data to analytics service
   */
  private sendSessionData(): void {
    // This would typically send data to your analytics service
    // For now, we'll just store it locally
    try {
      const sessionData = this.getSessionData();
      const key = `rum-session-${this.sessionId}`;
      localStorage.setItem(key, JSON.stringify(sessionData));
      
      // Keep only last 10 sessions
      const sessions = Object.keys(localStorage)
        .filter(key => key.startsWith('rum-session-'))
        .sort()
        .slice(-10);
      
      // Remove old sessions
      Object.keys(localStorage)
        .filter(key => key.startsWith('rum-session-') && !sessions.includes(key))
        .forEach(key => localStorage.removeItem(key));

    } catch (error) {
      logger.error('Failed to store session data', 'performance', {}, error as Error);
    }
  }

  /**
   * Initialize session object
   */
  private initializeSession(): UserSession {
    return {
      sessionId: this.sessionId,
      startTime: Date.now(),
      pageViews: 1,
      totalTime: 0,
      device: this.getDeviceInfo(),
      connection: this.getConnectionInfo(),
      vitals: [],
      customMetrics: [],
      errors: [],
    };
  }

  /**
   * Get device information
   */
  private getDeviceInfo(): DeviceInfo {
    const ua = navigator.userAgent;
    
    return {
      type: this.getDeviceType(),
      os: this.getOS(ua),
      browser: this.getBrowser(ua),
      version: this.getBrowserVersion(ua),
      screenResolution: `${screen.width}x${screen.height}`,
      pixelRatio: window.devicePixelRatio || 1,
    };
  }

  /**
   * Get connection information
   */
  private getConnectionInfo(): ConnectionInfo {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    return {
      effectiveType: connection?.effectiveType || 'unknown',
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0,
      saveData: connection?.saveData || false,
    };
  }

  /**
   * Utility methods
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2);
  }

  private getNavigationType(): string {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const types = ['navigate', 'reload', 'back_forward', 'prerender'];
    return types[(navigation?.type as unknown as number) || 0] || 'navigate';
  }

  private getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const width = screen.width;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  private getOS(ua: string): string {
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  private getBrowser(ua: string): string {
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private getBrowserVersion(ua: string): string {
    const match = ua.match(/(?:Chrome|Firefox|Safari|Edge)\/(\d+)/);
    return match ? match[1] : 'Unknown';
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