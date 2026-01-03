/**
 * Performance Monitor Service
 *
 * Tracks and reports real-world performance metrics including:
 * - Time to Interactive (TTI)
 * - First Contentful Paint (FCP)
 * - Largest Contentful Paint (LCP)
 * - Cumulative Layout Shift (CLS)
 * - First Input Delay (FID) / Interaction to Next Paint (INP)
 * - Custom action timings
 * - Page load times
 * - Navigation timings
 */

import { logger } from '@/utils/logger';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'score';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceReport {
  sessionId: string;
  metrics: PerformanceMetric[];
  deviceTier: string;
  userAgent: string;
  timestamp: number;
  pageUrl: string;
  duration: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private sessionId: string;
  private sessionStart: number;
  private marks: Map<string, number> = new Map();
  private observers: Map<string, PerformanceObserver> = new Map();
  private enabled: boolean = true;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.sessionStart = performance.now();
    this.initializeObservers();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Initialize Web Performance API observers
   */
  private initializeObservers(): void {
    // Navigation Timing
    this.observeNavigationTiming();

    // Paint Timing (FCP)
    this.observePaintTiming();

    // Largest Contentful Paint (LCP)
    this.observeLargestContentfulPaint();

    // Cumulative Layout Shift (CLS)
    this.observeLayoutShift();

    // First Input Delay / Interaction to Next Paint
    this.observeInteractionTiming();

    // Resource Timing
    this.observeResourceTiming();
  }

  /**
   * Observe Navigation Timing (page load, DOM interactive, page complete)
   */
  private observeNavigationTiming(): void {
    // Wait for page load to complete
    window.addEventListener('load', () => {
      const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (!perfData) return;

      const metrics = {
        'DNS Lookup': perfData.domainLookupEnd - perfData.domainLookupStart,
        'TCP Connection': perfData.connectEnd - perfData.connectStart,
        'Request Time': perfData.responseStart - perfData.requestStart,
        'Response Time': perfData.responseEnd - perfData.responseStart,
        'DOM Interactive': perfData.domInteractive - perfData.fetchStart,
        'DOM Complete': perfData.domComplete - perfData.fetchStart,
        'Page Load': perfData.loadEventEnd - perfData.fetchStart,
      };

      Object.entries(metrics).forEach(([name, value]) => {
        if (value > 0) {
          this.recordMetric(`navigation.${name}`, value, 'ms', { phase: 'page_load' });
        }
      });
    });
  }

  /**
   * Observe First Contentful Paint (FCP)
   */
  private observePaintTiming(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.recordMetric('web_vital.fcp', entry.startTime, 'ms', {
              category: 'paint_timing',
            });
          }
        }
      });

      observer.observe({ type: 'paint', buffered: true });
      this.observers.set('paint', observer);
    } catch (error) {
      logger.warn('Paint Timing observer not supported:', error);
    }
  }

  /**
   * Observe Largest Contentful Paint (LCP)
   */
  private observeLargestContentfulPaint(): void {
    try {
      let lastLcp: number = 0;
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as LargestContentfulPaintEntry;
        lastLcp = lastEntry.renderTime || lastEntry.loadTime;
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observers.set('largest-contentful-paint', observer);

      // Report LCP when page hidden (via pageshow/pagehide for SPA)
      const reportLcp = () => {
        if (lastLcp > 0) {
          this.recordMetric('web_vital.lcp', lastLcp, 'ms', {
            category: 'paint_timing',
          });
        }
      };

      window.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          reportLcp();
        }
      });

      // Also report on unload
      window.addEventListener('beforeunload', reportLcp);
    } catch (error) {
      logger.warn('Largest Contentful Paint observer not supported:', error);
    }
  }

  /**
   * Observe Cumulative Layout Shift (CLS)
   */
  private observeLayoutShift(): void {
    try {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as LayoutShiftEntry).hadRecentInput) {
            clsValue += (entry as LayoutShiftEntry).value;
          }
        }
      });

      observer.observe({ type: 'layout-shift', buffered: true });
      this.observers.set('layout-shift', observer);

      // Report CLS periodically and on hidden
      const reportCls = () => {
        if (clsValue > 0) {
          this.recordMetric('web_vital.cls', clsValue, 'score', {
            category: 'visual_stability',
          });
        }
      };

      window.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          reportCls();
        }
      });
    } catch (error) {
      logger.warn('Layout Shift observer not supported:', error);
    }
  }

  /**
   * Observe First Input Delay (FID) / Interaction to Next Paint (INP)
   */
  private observeInteractionTiming(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const eventTiming = entry as unknown as EventTiming;
          const duration = eventTiming.processingEnd - eventTiming.processingStart;

          if (entry.name === 'first-input') {
            this.recordMetric('web_vital.fid', duration, 'ms', {
              category: 'interactivity',
              entryType: entry.entryType,
            });
          } else if (entry.entryType === 'event') {
            this.recordMetric('web_vital.inp', duration, 'ms', {
              category: 'interactivity',
              eventType: entry.name,
            });
          }
        }
      });

      observer.observe({
        type: 'first-input',
        buffered: true,
      });

      observer.observe({
        type: 'event',
        buffered: true,
      });

      this.observers.set('interaction', observer);
    } catch (error) {
      logger.warn('Interaction Timing observer not supported:', error);
    }
  }

  /**
   * Observe Resource Timing (API calls, assets, etc.)
   */
  private observeResourceTiming(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const resourceTiming = entry as PerformanceResourceTiming;

          // Group by resource type
          const resourceType = this.getResourceType(resourceTiming.name);
          const duration = resourceTiming.duration;

          // Only record slow resources (> 100ms)
          if (duration > 100) {
            this.recordMetric(`resource.${resourceType}`, duration, 'ms', {
              name: this.sanitizeUrl(resourceTiming.name),
              size: resourceTiming.transferSize,
              cached: resourceTiming.transferSize === 0,
            });
          }
        }
      });

      observer.observe({ type: 'resource', buffered: true });
      this.observers.set('resource', observer);
    } catch (error) {
      logger.warn('Resource Timing observer not supported:', error);
    }
  }

  /**
   * Record a custom performance metric
   */
  recordMetric(
    name: string,
    value: number,
    unit: 'ms' | 'score' = 'ms',
    metadata?: Record<string, unknown>
  ): void {
    if (!this.enabled || value < 0) return;

    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: performance.now(),
      metadata,
    };

    this.metrics.push(metric);

    // Log warnings for poor metrics
    if (unit === 'ms') {
      if (name.includes('fcp') && value > 2500) {
        logger.warn(`⚠️ Poor FCP: ${value.toFixed(0)}ms (target: <2.5s)`);
      }
      if (name.includes('lcp') && value > 4000) {
        logger.warn(`⚠️ Poor LCP: ${value.toFixed(0)}ms (target: <4s)`);
      }
      if (name.includes('fid') && value > 100) {
        logger.warn(`⚠️ Poor FID: ${value.toFixed(0)}ms (target: <100ms)`);
      }
      if (name.includes('inp') && value > 200) {
        logger.warn(`⚠️ Poor INP: ${value.toFixed(0)}ms (target: <200ms)`);
      }
    }
  }

  /**
   * Mark the start of a custom performance measurement
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * Measure the duration between a mark and now
   */
  measure(markName: string, metricName?: string): number {
    const startTime = this.marks.get(markName);
    if (!startTime) {
      logger.warn(`Mark not found: ${markName}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    const name = metricName || `custom.${markName}`;

    this.recordMetric(name, duration, 'ms');
    this.marks.delete(markName);

    return duration;
  }

  /**
   * Measure action timing (e.g., "check-in", "score-submission")
   */
  async measureAction<T>(
    actionName: string,
    action: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await action();
      const duration = performance.now() - startTime;
      this.recordMetric(`action.${actionName}.success`, duration, 'ms', metadata);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordMetric(`action.${actionName}.error`, duration, 'ms', {
        ...metadata,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics filtered by name pattern
   */
  getMetricsByName(pattern: string | RegExp): PerformanceMetric[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return this.metrics.filter((m) => regex.test(m.name));
  }

  /**
   * Get summary statistics for a metric
   */
  getMetricStats(metricName: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.metrics
      .filter((m) => m.name === metricName)
      .map((m) => m.value)
      .sort((a, b) => a - b);

    if (values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const p50 = values[Math.floor(values.length * 0.5)];
    const p95 = values[Math.floor(values.length * 0.95)];
    const p99 = values[Math.floor(values.length * 0.99)];

    return {
      count: values.length,
      min: values[0],
      max: values[values.length - 1],
      avg,
      p50,
      p95,
      p99,
    };
  }

  /**
   * Generate performance report
   */
  generateReport(): PerformanceReport {
    return {
      sessionId: this.sessionId,
      metrics: this.metrics,
      deviceTier: this.getDeviceTier(),
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
      pageUrl: window.location.href,
      duration: performance.now() - this.sessionStart,
    };
  }

  /**
   * Send report to analytics server
   * Only sends if there are warnings or errors (smart batching)
   */
  async sendReport(endpoint: string, forceAll = false): Promise<void> {
    try {
      // Smart batching: only send if there are problems
      const warningMetrics = this.getMetricsByName(/poor|warning|error/i);
      const errorMetrics = this.getMetricsByName(/error/i);

      if (!forceAll && warningMetrics.length === 0 && errorMetrics.length === 0) {
        // No problems detected, don't waste database storage
        return;
      }

      const report = this.generateReport();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
      });

      if (!response.ok) {
        logger.warn(`Failed to send performance report: ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Failed to send performance report:', error);
    }
  }

  /**
   * Check if report has any errors or warnings
   */
  hasProblems(): boolean {
    const warningMetrics = this.getMetricsByName(/poor|warning|error/i);
    const slowMetrics = this.metrics.filter((m) => {
      if (m.name.includes('fcp') && m.value > 2500) return true;
      if (m.name.includes('lcp') && m.value > 4000) return true;
      if (m.name.includes('fid') && m.value > 100) return true;
      if (m.name.includes('inp') && m.value > 200) return true;
      return false;
    });

    return warningMetrics.length > 0 || slowMetrics.length > 0;
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.marks.clear();
  }

  /**
   * Cleanup observers
   */
  destroy(): void {
    this.observers.forEach((observer) => {
      try {
        observer.disconnect();
      } catch (error) {
        logger.warn('Failed to disconnect observer:', error);
      }
    });
    this.observers.clear();
  }

  // Helper methods

  private getResourceType(url: string): string {
    if (url.includes('api') || url.includes('supabase')) return 'api';
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'stylesheet';
    if (url.includes('.png') || url.includes('.jpg') || url.includes('.webp'))
      return 'image';
    if (url.includes('.woff') || url.includes('.ttf')) return 'font';
    return 'other';
  }

  private sanitizeUrl(url: string): string {
    // Remove sensitive data from URL
    return url
      .replace(/\?.*$/, '') // Remove query params
      .replace(/^https?:\/\//, '') // Remove protocol
      .split('/')[0]; // Keep only domain
  }

  private getDeviceTier(): string {
    // This would integrate with your device detection
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (nav.deviceMemory) {
      const memory = nav.deviceMemory;
      if (memory >= 8) return 'high';
      if (memory >= 4) return 'medium';
      return 'low';
    }
    return 'unknown';
  }
}

// Type definitions for TS
declare global {
  interface LargestContentfulPaintEntry extends PerformanceEntry {
    renderTime: number;
    loadTime: number;
    size: number;
    url: string;
    element?: Element;
  }

  interface LayoutShiftEntry extends PerformanceEntry {
    value: number;
    hadRecentInput: boolean;
    sources: LayoutShiftSource[];
  }

  interface LayoutShiftSource {
    node?: Node;
    previousRect: DOMRect;
    currentRect: DOMRect;
  }

  interface EventTiming extends PerformanceEntry {
    processingStart: number;
    processingEnd: number;
    cancelable?: boolean;
    toJSON(): Record<string, unknown>;
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
