/**
 * Production Performance Monitoring
 * Tracks Core Web Vitals and custom metrics
 *
 * Analytics reporting uses a pluggable reporter pattern:
 * - In development: logs metrics to the console via the logger
 * - In production: sends batched metrics via navigator.sendBeacon() if
 *   VITE_ANALYTICS_ENDPOINT is configured, otherwise uses a no-op reporter
 * - Custom reporters can be registered via performanceMonitor.setReporter()
 */

import { logger } from './logger';

interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

/**
 * Pluggable analytics reporter interface.
 *
 * Implement this to send performance metrics to any analytics backend
 * (e.g., Google Analytics, Datadog, a custom API, Supabase, etc.).
 */
export interface AnalyticsReporter {
  /** Called for each recorded metric */
  report(metric: PerformanceMetric): void;
  /** Called on page unload to flush any buffered data */
  flush?(): void;
}

/**
 * No-op reporter -- silently discards metrics.
 * Used when no analytics endpoint is configured in production.
 */
export const noopReporter: AnalyticsReporter = {
  report() {},
};

/**
 * Console reporter -- logs metrics via the app logger.
 * Default reporter in development builds.
 */
export const consoleReporter: AnalyticsReporter = {
  report(metric: PerformanceMetric) {
    const label = metric.rating === 'poor' ? 'POOR' : metric.rating === 'needs-improvement' ? 'WARN' : 'OK';
    logger.debug(`[analytics] ${metric.name} = ${metric.value.toFixed(2)} [${label}]`);
  },
};

/**
 * Beacon reporter -- batches metrics and sends them via navigator.sendBeacon()
 * on flush (page unload) or when the batch reaches a configurable size.
 *
 * Uses sendBeacon so the request is non-blocking and survives page navigation.
 *
 * @param endpoint  The URL to POST metrics to
 * @param batchSize Number of metrics to accumulate before auto-flushing (default 10)
 */
export function createBeaconReporter(endpoint: string, batchSize = 10): AnalyticsReporter {
  let buffer: PerformanceMetric[] = [];

  function send() {
    if (buffer.length === 0) return;

    const payload = JSON.stringify({
      metrics: buffer,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      sentAt: Date.now(),
    });

    buffer = [];

    // navigator.sendBeacon is non-blocking and works during page unload
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(endpoint, blob);
      if (!sent) {
        logger.warn('[analytics] sendBeacon failed, falling back to fetch');
        // Fallback: fire-and-forget fetch
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {
          // Silently ignore -- this is best-effort analytics
        });
      }
    }
  }

  return {
    report(metric: PerformanceMetric) {
      buffer.push(metric);
      if (buffer.length >= batchSize) {
        send();
      }
    },
    flush() {
      send();
    },
  };
}

/**
 * Layout Shift entry for CLS measurement
 * @see https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift
 */
interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

/**
 * Resolve the default reporter based on the environment:
 * - DEV mode: consoleReporter (visible in devtools)
 * - PROD with VITE_ANALYTICS_ENDPOINT: beaconReporter pointed at the endpoint
 * - PROD without endpoint: noopReporter (zero overhead)
 */
function resolveDefaultReporter(): AnalyticsReporter {
  if (import.meta.env.DEV) {
    return consoleReporter;
  }

  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  if (endpoint && typeof endpoint === 'string' && endpoint.length > 0) {
    return createBeaconReporter(endpoint);
  }

  return noopReporter;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private isEnabled: boolean;
  private reporter: AnalyticsReporter;

  constructor() {
    // Only enable in production or when explicitly enabled
    this.isEnabled = !import.meta.env.DEV || import.meta.env.VITE_ENABLE_PERF_MONITORING === 'true';
    this.reporter = resolveDefaultReporter();

    // Flush buffered metrics on page unload so nothing is lost
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.reporter.flush?.();
        }
      });
    }
  }

  /**
   * Replace the analytics reporter at runtime.
   *
   * Use this to plug in a custom reporter (e.g., one that forwards to
   * MetricsApiService / Supabase, Google Analytics, Datadog, etc.).
   *
   * @example
   * ```ts
   * performanceMonitor.setReporter({
   *   report(metric) { gtag('event', 'web_vitals', { metric_name: metric.name, value: metric.value }); },
   * });
   * ```
   */
  setReporter(reporter: AnalyticsReporter) {
    // Flush any pending data from the previous reporter before switching
    this.reporter.flush?.();
    this.reporter = reporter;
  }

  /**
   * Get the currently active reporter (useful for testing)
   */
  getReporter(): AnalyticsReporter {
    return this.reporter;
  }

  /**
   * Track Core Web Vitals
   */
  trackWebVitals() {
    if (!this.isEnabled) return;

    // Largest Contentful Paint (LCP)
    this.observeLCP();

    // First Input Delay (FID)
    this.observeFID();

    // Cumulative Layout Shift (CLS)
    this.observeCLS();

    // First Contentful Paint (FCP)
    this.observeFCP();

    // Time to First Byte (TTFB)
    this.observeTTFB();
  }

  private observeLCP() {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        const value = lastEntry.startTime;

        this.recordMetric({
          name: 'LCP',
          value,
          rating: this.rateLCP(value),
          timestamp: Date.now()
        });

        logger.info('LCP:', value.toFixed(2), 'ms');
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (error) {
      logger.error('LCP observation failed:', error);
    }
  }

  private observeFID() {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          // PerformanceEventTiming has processingStart for FID measurement
          const fidEntry = entry as PerformanceEventTiming;
          const value = fidEntry.processingStart - fidEntry.startTime;

          this.recordMetric({
            name: 'FID',
            value,
            rating: this.rateFID(value),
            timestamp: Date.now()
          });

          logger.info('FID:', value.toFixed(2), 'ms');
        });
      });

      observer.observe({ type: 'first-input', buffered: true });
    } catch (error) {
      logger.error('FID observation failed:', error);
    }
  }

  private observeCLS() {
    try {
      let clsValue = 0;

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as LayoutShiftEntry;
          if (!layoutShift.hadRecentInput) {
            clsValue += layoutShift.value;

            this.recordMetric({
              name: 'CLS',
              value: clsValue,
              rating: this.rateCLS(clsValue),
              timestamp: Date.now()
            });
          }
        }

        logger.info('CLS:', clsValue.toFixed(3));
      });

      observer.observe({ type: 'layout-shift', buffered: true });
    } catch (error) {
      logger.error('CLS observation failed:', error);
    }
  }

  private observeFCP() {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const value = entry.startTime;

          this.recordMetric({
            name: 'FCP',
            value,
            rating: this.rateFCP(value),
            timestamp: Date.now()
          });

          logger.info('FCP:', value.toFixed(2), 'ms');
        });
      });

      observer.observe({ type: 'paint', buffered: true });
    } catch (error) {
      logger.error('FCP observation failed:', error);
    }
  }

  private observeTTFB() {
    try {
      const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navTiming) {
        const value = navTiming.responseStart - navTiming.requestStart;

        this.recordMetric({
          name: 'TTFB',
          value,
          rating: this.rateTTFB(value),
          timestamp: Date.now()
        });

        logger.info('TTFB:', value.toFixed(2), 'ms');
      }
    } catch (error) {
      logger.error('TTFB observation failed:', error);
    }
  }

  /**
   * Track custom performance marks
   */
  mark(name: string) {
    if (!this.isEnabled) return;

    try {
      performance.mark(name);
      logger.debug('Performance mark:', name);
    } catch (error) {
      logger.error('Performance mark failed:', error);
    }
  }

  /**
   * Measure time between two marks
   */
  measure(name: string, startMark: string, endMark?: string) {
    if (!this.isEnabled) return;

    try {
      if (endMark) {
        performance.measure(name, startMark, endMark);
      } else {
        performance.measure(name, startMark);
      }

      const entries = performance.getEntriesByName(name, 'measure');
      const duration = entries[entries.length - 1]?.duration || 0;

      this.recordMetric({
        name,
        value: duration,
        rating: 'good',
        timestamp: Date.now()
      });

      logger.info(`Performance measure ${name}:`, duration.toFixed(2), 'ms');
      return duration;
    } catch (error) {
      logger.error('Performance measure failed:', error);
      return null;
    }
  }

  /**
   * Track component render time
   */
  trackComponentRender(componentName: string, duration: number) {
    if (!this.isEnabled) return;

    this.recordMetric({
      name: `render:${componentName}`,
      value: duration,
      rating: duration < 16 ? 'good' : duration < 50 ? 'needs-improvement' : 'poor',
      timestamp: Date.now()
    });

    if (duration > 50) {
      logger.warn(`Slow render: ${componentName} took ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics summary
   */
  getSummary() {
    const summary: { [key: string]: { avg: number; min: number; max: number; count: number } } = {};

    this.metrics.forEach(metric => {
      if (!summary[metric.name]) {
        summary[metric.name] = {
          avg: 0,
          min: metric.value,
          max: metric.value,
          count: 0
        };
      }

      const s = summary[metric.name];
      s.count++;
      s.avg = ((s.avg * (s.count - 1)) + metric.value) / s.count;
      s.min = Math.min(s.min, metric.value);
      s.max = Math.max(s.max, metric.value);
    });

    return summary;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = [];
  }

  // Rating helpers based on web.dev thresholds
  private rateLCP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 2500) return 'good';
    if (value <= 4000) return 'needs-improvement';
    return 'poor';
  }

  private rateFID(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 100) return 'good';
    if (value <= 300) return 'needs-improvement';
    return 'poor';
  }

  private rateCLS(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 0.1) return 'good';
    if (value <= 0.25) return 'needs-improvement';
    return 'poor';
  }

  private rateFCP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 1800) return 'good';
    if (value <= 3000) return 'needs-improvement';
    return 'poor';
  }

  private rateTTFB(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 800) return 'good';
    if (value <= 1800) return 'needs-improvement';
    return 'poor';
  }

  private recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);

    // Keep only last 100 metrics to prevent memory issues
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }

    // Send to analytics if configured
    this.sendToAnalytics(metric);
  }

  private sendToAnalytics(metric: PerformanceMetric) {
    try {
      this.reporter.report(metric);
    } catch (error) {
      // Analytics should never break the app -- log and continue
      logger.error('[analytics] Reporter error:', error);
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Auto-start tracking on load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    performanceMonitor.trackWebVitals();
  });
}
