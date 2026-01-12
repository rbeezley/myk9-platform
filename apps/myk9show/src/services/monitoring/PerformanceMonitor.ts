/**
 * Performance Monitoring Service
 * 
 * Comprehensive performance monitoring for the MyK9Show application
 * Tracks Core Web Vitals, custom metrics, and user experience indicators
 */

import { logger } from '../LoggingService';
import { logger } from '@/services/LoggingService';

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  details?: Record<string, unknown>;
}

export interface PerformanceThresholds {
  good: number;
  needsImprovement: number;
}

export interface PerformanceReport {
  timestamp: number;
  sessionId: string;
  metrics: PerformanceMetric[];
  pageInfo: {
    url: string;
    title: string;
    referrer: string;
  };
  deviceInfo: {
    userAgent: string;
    viewportSize: string;
    connectionType?: string;
  };
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private observers: Map<string, PerformanceObserver> = new Map();
  private sessionId: string;
  private isMonitoring: boolean = false;

  // Performance thresholds based on Core Web Vitals
  private readonly thresholds: Record<string, PerformanceThresholds> = {
    // Core Web Vitals
    LCP: { good: 2500, needsImprovement: 4000 },      // Largest Contentful Paint
    FID: { good: 100, needsImprovement: 300 },        // First Input Delay
    CLS: { good: 0.1, needsImprovement: 0.25 },       // Cumulative Layout Shift
    
    // Additional important metrics
    FCP: { good: 1800, needsImprovement: 3000 },      // First Contentful Paint
    TTFB: { good: 800, needsImprovement: 1800 },      // Time to First Byte
    TTI: { good: 3800, needsImprovement: 7300 },      // Time to Interactive
    
    // Custom application metrics
    SEARCH_TIME: { good: 500, needsImprovement: 1000 },
    SYNC_TIME: { good: 2000, needsImprovement: 5000 },
    FORM_SUBMIT: { good: 1000, needsImprovement: 3000 },
    REPORT_GENERATION: { good: 3000, needsImprovement: 8000 }
  };

  constructor() {
    this.sessionId = this.generateSessionId();
    this.bindToPageLifecycle();
  }

  /**
   * Start performance monitoring
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      logger.warn('Performance monitoring is already active', 'services', {});
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting performance monitoring', 'performance', { sessionId: this.sessionId });

    // Start observing Core Web Vitals
    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    
    // Start observing additional metrics
    this.observeNavigationTiming();
    this.observePaintTiming();
    this.observeResourceTiming();
    
    // Set up custom metric tracking
    this.setupCustomMetrics();
    
    // Schedule periodic reporting
    this.scheduleReporting();
  }

  /**
   * Stop performance monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    logger.info('Stopping performance monitoring');

    // Disconnect all observers
    this.observers.forEach((observer, name) => {
      observer.disconnect();
      logger.debug('Disconnected performance observer', 'performance', { observerName: name });
    });
    
    this.observers.clear();
  }

  /**
   * Record a custom performance metric
   */
  public recordMetric(name: string, value: number, details?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      rating: this.calculateRating(name, value),
      details
    };

    this.metrics.set(name, metric);
    
    logger.logPerformance(name, value, {
      rating: metric.rating,
      sessionId: this.sessionId,
      ...details
    });

    // Check for performance degradation
    this.checkPerformanceThresholds(metric);
  }

  /**
   * Mark the start of a custom performance measurement
   */
  public markStart(name: string): void {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`${name}-start`);
    }
  }

  /**
   * Mark the end of a custom performance measurement and record the duration
   */
  public markEnd(name: string, details?: Record<string, unknown>): number {
    if (typeof performance !== 'undefined' && performance.mark && performance.measure) {
      const endMarkName = `${name}-end`;
      const measureName = `${name}-duration`;
      
      performance.mark(endMarkName);
      performance.measure(measureName, `${name}-start`, endMarkName);
      
      const measure = performance.getEntriesByName(measureName)[0];
      if (measure) {
        const duration = measure.duration;
        this.recordMetric(name.toUpperCase(), duration, details);
        return duration;
      }
    }
    
    return 0;
  }

  /**
   * Get current performance metrics
   */
  public getMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Generate a performance report
   */
  public generateReport(): PerformanceReport {
    return {
      timestamp: Date.now(),
      sessionId: this.sessionId,
      metrics: this.getMetrics(),
      pageInfo: {
        url: window.location.href,
        title: document.title,
        referrer: document.referrer
      },
      deviceInfo: {
        userAgent: navigator.userAgent,
        viewportSize: `${window.innerWidth}x${window.innerHeight}`,
        connectionType: this.getConnectionType()
      }
    };
  }

  /**
   * Observe Largest Contentful Paint (LCP)
   */
  private observeLCP(): void {
    if (!('PerformanceObserver' in window)) {
      logger.warn('PerformanceObserver not supported', 'services', {});
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
        
        // The latest LCP entry is the current LCP value
        const lcpValue = lastEntry.renderTime || lastEntry.loadTime || lastEntry.startTime;
        this.recordMetric('LCP', lcpValue, {
          element: (lastEntry as PerformanceEntry & { element?: { tagName: string } }).element?.tagName,
          url: (lastEntry as PerformanceEntry & { url?: string }).url
        });
      });

      observer.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.set('LCP', observer);
    } catch (error) {
      logger.error('Failed to observe LCP', 'performance', {}, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Observe First Input Delay (FID)
   */
  private observeFID(): void {
    if (!('PerformanceObserver' in window)) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const fidValue = (entry as PerformanceEntry & { processingStart: number }).processingStart - entry.startTime;
          this.recordMetric('FID', fidValue, {
            eventType: (entry as PerformanceEntry & { name: string }).name,
            target: (entry as PerformanceEntry & { target?: { tagName: string } }).target?.tagName
          });
        });
      });

      observer.observe({ entryTypes: ['first-input'] });
      this.observers.set('FID', observer);
    } catch (error) {
      logger.error('Failed to observe FID', 'performance', {}, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Observe Cumulative Layout Shift (CLS)
   */
  private observeCLS(): void {
    if (!('PerformanceObserver' in window)) {
      return;
    }

    try {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          // Only count layout shifts that weren't caused by user input
          if (!(entry as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput) {
            clsValue += (entry as PerformanceEntry & { value: number }).value;
            this.recordMetric('CLS', clsValue, {
              sources: (entry as PerformanceEntry & { sources?: Array<{ node?: { tagName: string }; previousRect: DOMRect; currentRect: DOMRect }> }).sources?.map((source) => ({
                element: source.node?.tagName,
                previousRect: source.previousRect,
                currentRect: source.currentRect
              }))
            });
          }
        });
      });

      observer.observe({ entryTypes: ['layout-shift'] });
      this.observers.set('CLS', observer);
    } catch (error) {
      logger.error('Failed to observe CLS', 'performance', {}, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Observe navigation timing
   */
  private observeNavigationTiming(): void {
    if (!('PerformanceObserver' in window)) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const navEntry = entry as PerformanceNavigationTiming;
          
          // Calculate TTFB
          const ttfb = navEntry.responseStart - navEntry.requestStart;
          this.recordMetric('TTFB', ttfb);
          
          // Calculate DOM content loaded time (using fetchStart as baseline)
          const domContentLoaded = navEntry.domContentLoadedEventEnd - navEntry.fetchStart;
          this.recordMetric('DOM_CONTENT_LOADED', domContentLoaded);
          
          // Calculate full page load time (using fetchStart as baseline)
          const loadComplete = navEntry.loadEventEnd - navEntry.fetchStart;
          this.recordMetric('PAGE_LOAD', loadComplete);
        });
      });

      observer.observe({ entryTypes: ['navigation'] });
      this.observers.set('navigation', observer);
    } catch (error) {
      logger.error('Failed to observe navigation timing', 'performance', {}, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Observe paint timing
   */
  private observePaintTiming(): void {
    if (!('PerformanceObserver' in window)) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.name === 'first-contentful-paint') {
            this.recordMetric('FCP', entry.startTime);
          } else if (entry.name === 'first-paint') {
            this.recordMetric('FP', entry.startTime);
          }
        });
      });

      observer.observe({ entryTypes: ['paint'] });
      this.observers.set('paint', observer);
    } catch (error) {
      logger.error('Failed to observe paint timing', 'performance', {}, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Observe resource timing for critical resources
   */
  private observeResourceTiming(): void {
    if (!('PerformanceObserver' in window)) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const resourceEntry = entry as PerformanceResourceTiming;
          
          // Track slow resources
          if (resourceEntry.duration > 1000) { // Resources taking more than 1 second
            this.recordMetric('SLOW_RESOURCE', resourceEntry.duration, {
              name: resourceEntry.name,
              initiatorType: resourceEntry.initiatorType,
              transferSize: resourceEntry.transferSize
            });
          }
          
          // Track large resources
          if (resourceEntry.transferSize > 1024 * 1024) { // Resources larger than 1MB
            this.recordMetric('LARGE_RESOURCE', resourceEntry.transferSize, {
              name: resourceEntry.name,
              duration: resourceEntry.duration
            });
          }
        });
      });

      observer.observe({ entryTypes: ['resource'] });
      this.observers.set('resource', observer);
    } catch (error) {
      logger.error('Failed to observe resource timing', 'performance', {}, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Set up custom application metrics
   */
  private setupCustomMetrics(): void {
    // Monitor search performance
    this.monitorSearchPerformance();
    
    // Monitor form submission performance
    this.monitorFormPerformance();
    
    // Monitor data sync performance
    this.monitorSyncPerformance();
    
    // Monitor report generation performance
    this.monitorReportGeneration();
  }

  /**
   * Monitor search performance
   */
  private monitorSearchPerformance(): void {
    // Listen for search events
    document.addEventListener('search-started', () => {
      this.markStart('search');
    });

    document.addEventListener('search-completed', ((event: CustomEvent) => {
      const duration = this.markEnd('search', {
        resultCount: event.detail?.resultCount,
        query: event.detail?.query?.substring(0, 50) // Truncate for privacy
      });
      
      // Alert if search is too slow
      if (duration > this.thresholds.SEARCH_TIME.needsImprovement) {
        logger.warn('Slow search performance detected', 'performance', {
          duration,
          threshold: this.thresholds.SEARCH_TIME.needsImprovement
        });
      }
    }) as EventListener);
  }

  /**
   * Monitor form submission performance
   */
  private monitorFormPerformance(): void {
    document.addEventListener('form-submit-started', ((event: CustomEvent) => {
      this.markStart(`form-${event.detail?.formType || 'unknown'}`);
    }) as EventListener);

    document.addEventListener('form-submit-completed', ((event: CustomEvent) => {
      const formType = event.detail?.formType || 'unknown';
      this.markEnd(`form-${formType}`, {
        success: event.detail?.success,
        errorCount: event.detail?.errorCount
      });
    }) as EventListener);
  }

  /**
   * Monitor data synchronization performance
   */
  private monitorSyncPerformance(): void {
    document.addEventListener('sync-started', () => {
      this.markStart('sync');
    });

    document.addEventListener('sync-completed', ((event: CustomEvent) => {
      this.markEnd('sync', {
        itemCount: event.detail?.itemCount,
        conflicts: event.detail?.conflicts,
        success: event.detail?.success
      });
    }) as EventListener);
  }

  /**
   * Monitor report generation performance
   */
  private monitorReportGeneration(): void {
    document.addEventListener('report-generation-started', ((event: CustomEvent) => {
      this.markStart(`report-${event.detail?.reportType || 'unknown'}`);
    }) as EventListener);

    document.addEventListener('report-generation-completed', ((event: CustomEvent) => {
      const reportType = event.detail?.reportType || 'unknown';
      this.markEnd(`report-${reportType}`, {
        format: event.detail?.format,
        size: event.detail?.size,
        recordCount: event.detail?.recordCount
      });
    }) as EventListener);
  }

  /**
   * Calculate performance rating based on thresholds
   */
  private calculateRating(metricName: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const threshold = this.thresholds[metricName];
    if (!threshold) {
      return 'good'; // Default to good if no threshold defined
    }

    if (value <= threshold.good) {
      return 'good';
    } else if (value <= threshold.needsImprovement) {
      return 'needs-improvement';
    } else {
      return 'poor';
    }
  }

  /**
   * Check performance thresholds and alert if necessary
   */
  private checkPerformanceThresholds(metric: PerformanceMetric): void {
    if (metric.rating === 'poor') {
      logger.warn('Poor performance detected', 'performance', {
        metric: metric.name,
        value: metric.value,
        threshold: this.thresholds[metric.name]?.needsImprovement,
        sessionId: this.sessionId
      });

      // Trigger performance alert
      this.triggerPerformanceAlert(metric);
    }
  }

  /**
   * Trigger performance alert
   */
  private triggerPerformanceAlert(metric: PerformanceMetric): void {
    const alertEvent = new CustomEvent('performance-alert', {
      detail: {
        metric: metric.name,
        value: metric.value,
        rating: metric.rating,
        timestamp: metric.timestamp,
        sessionId: this.sessionId
      }
    });

    document.dispatchEvent(alertEvent);
  }

  /**
   * Schedule periodic performance reporting
   */
  private scheduleReporting(): void {
    // Report performance metrics every 30 seconds
    setInterval(() => {
      if (this.isMonitoring && this.metrics.size > 0) {
        const report = this.generateReport();
        logger.info('Performance report generated', 'performance', report as unknown as Record<string, unknown>);
        
        // Clear old metrics to prevent memory leaks
        this.clearOldMetrics();
      }
    }, 30000);
  }

  /**
   * Clear old performance metrics
   */
  private clearOldMetrics(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [name, metric] of this.metrics.entries()) {
      if (now - metric.timestamp > maxAge) {
        this.metrics.delete(name);
      }
    }
  }

  /**
   * Bind to page lifecycle events
   */
  private bindToPageLifecycle(): void {
    // Start monitoring when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isMonitoring) {
        // Page is hidden, generate final report
        const report = this.generateReport();
        logger.info('Performance report generated', 'performance', report as unknown as Record<string, unknown>);
      } else if (!document.hidden && !this.isMonitoring) {
        // Page is visible again, restart monitoring
        this.startMonitoring();
      }
    });

    // Generate report before page unload
    window.addEventListener('beforeunload', () => {
      if (this.isMonitoring) {
        const report = this.generateReport();
        logger.info('Performance report generated', 'performance', report as unknown as Record<string, unknown>);
      }
    });
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get connection type information
   */
  private getConnectionType(): string | undefined {
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string; type?: string }; mozConnection?: { effectiveType?: string; type?: string }; webkitConnection?: { effectiveType?: string; type?: string } }).connection || (navigator as Navigator & { connection?: { effectiveType?: string; type?: string }; mozConnection?: { effectiveType?: string; type?: string }; webkitConnection?: { effectiveType?: string; type?: string } }).mozConnection || (navigator as Navigator & { connection?: { effectiveType?: string; type?: string }; mozConnection?: { effectiveType?: string; type?: string }; webkitConnection?: { effectiveType?: string; type?: string } }).webkitConnection;
    return connection?.effectiveType || connection?.type || 'unknown';
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Auto-start monitoring only in development
if (typeof window !== 'undefined' && 'PerformanceObserver' in window && import.meta.env.DEV) {
  performanceMonitor.startMonitoring();
}

export default performanceMonitor;