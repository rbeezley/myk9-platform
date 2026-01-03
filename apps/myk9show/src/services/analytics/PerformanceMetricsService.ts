/**
 * Performance Metrics Service for monitoring application performance
 * Provides comprehensive performance tracking, user experience metrics, and optimization insights
 */

import { logger } from '../LoggingService';

/**
 * Web Vitals metrics for tracking user experience
 */
export interface WebVitalsMetrics {
  /** First Contentful Paint - when first content is rendered */
  fcp?: number;
  /** Largest Contentful Paint - when main content is likely loaded */
  lcp?: number;
  /** First Input Delay - responsiveness to user interaction */
  fid?: number;
  /** Cumulative Layout Shift - visual stability */
  cls?: number;
  /** Time to First Byte - server response time */
  ttfb?: number;
}

/**
 * Custom performance metrics specific to the application
 */
export interface CustomMetrics {
  /** Time from navigation to interactive state */
  timeToInteractive?: number;
  /** IndexedDB query performance */
  dbQueryTime?: number;
  /** Component render time */
  componentRenderTime?: number;
  /** Bundle load time */
  bundleLoadTime?: number;
  /** Offline data sync time */
  syncTime?: number;
}

/**
 * Performance measurement result
 */
export interface PerformanceMeasurement {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  category: string;
  metadata?: Record<string, unknown>;
}

/**
 * Performance baseline for comparison
 */
export interface PerformanceBaseline {
  metric: string;
  target: number;
  warning: number;
  critical: number;
  description: string;
}

/**
 * Performance alert configuration
 */
export interface PerformanceAlert {
  metric: string;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  frequency: 'immediate' | 'throttled' | 'daily';
}

/**
 * Enhanced Performance Metrics Service
 */
export class PerformanceMetricsService {
  private static instance: PerformanceMetricsService;
  private measurements: Map<string, PerformanceMeasurement[]> = new Map();
  private activeTimers: Map<string, number> = new Map();
  private webVitals: WebVitalsMetrics = {};
  private customMetrics: CustomMetrics = {};
  private baselines: PerformanceBaseline[] = [];
  private alerts: PerformanceAlert[] = [];
  private isEnabled = true;

  private constructor() {
    this.setupBaselines();
    this.setupAlerts();
    this.initializeWebVitalsTracking();
    this.setupNavigationTiming();
  }

  /**
   * Get singleton instance of the performance metrics service
   */
  static getInstance(): PerformanceMetricsService {
    if (!PerformanceMetricsService.instance) {
      PerformanceMetricsService.instance = new PerformanceMetricsService();
    }
    return PerformanceMetricsService.instance;
  }

  /**
   * Set up performance baselines for comparison
   * @private
   */
  private setupBaselines(): void {
    this.baselines = [
      {
        metric: 'fcp',
        target: 1500,
        warning: 2500,
        critical: 4000,
        description: 'First Contentful Paint should be under 1.5s'
      },
      {
        metric: 'lcp',
        target: 2500,
        warning: 4000,
        critical: 6000,
        description: 'Largest Contentful Paint should be under 2.5s'
      },
      {
        metric: 'fid',
        target: 100,
        warning: 200,
        critical: 300,
        description: 'First Input Delay should be under 100ms'
      },
      {
        metric: 'cls',
        target: 0.1,
        warning: 0.25,
        critical: 0.4,
        description: 'Cumulative Layout Shift should be under 0.1'
      },
      {
        metric: 'componentRenderTime',
        target: 16,
        warning: 50,
        critical: 100,
        description: 'Component render time should be under 16ms'
      },
      {
        metric: 'dbQueryTime',
        target: 50,
        warning: 200,
        critical: 500,
        description: 'Database query time should be under 50ms'
      }
    ];
  }

  /**
   * Set up performance alerts
   * @private
   */
  private setupAlerts(): void {
    this.alerts = [
      {
        metric: 'lcp',
        threshold: 4000,
        severity: 'warning',
        message: 'Page load performance is degraded',
        frequency: 'throttled'
      },
      {
        metric: 'fid',
        threshold: 300,
        severity: 'error',
        message: 'User interaction responsiveness is poor',
        frequency: 'immediate'
      },
      {
        metric: 'dbQueryTime',
        threshold: 500,
        severity: 'warning',
        message: 'Database queries are slow',
        frequency: 'throttled'
      }
    ];
  }

  /**
   * Initialize Web Vitals tracking using Performance Observer
   * @private
   */
  private initializeWebVitalsTracking(): void {
    if (!('PerformanceObserver' in window)) return;

    try {
      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
        this.webVitals.lcp = lastEntry.startTime;
        this.checkAlert('lcp', lastEntry.startTime);
        logger.logPerformance('LCP', lastEntry.startTime, { type: 'web-vital' });
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay
      const fidObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach((entry) => {
          const fidEntry = entry as PerformanceEntry & { processingStart: number; startTime: number };
          const fid = fidEntry.processingStart - fidEntry.startTime;
          this.webVitals.fid = fid;
          this.checkAlert('fid', fid);
          logger.logPerformance('FID', fid, { type: 'web-vital' });
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift
      const clsObserver = new PerformanceObserver((entryList) => {
        let clsValue = 0;
        const entries = entryList.getEntries();
        entries.forEach((entry) => {
          const layoutShiftEntry = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!layoutShiftEntry.hadRecentInput) {
            clsValue += layoutShiftEntry.value;
          }
        });
        this.webVitals.cls = clsValue;
        this.checkAlert('cls', clsValue);
        logger.logPerformance('CLS', clsValue, { type: 'web-vital' });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });

    } catch (error) {
      logger.warn('Failed to initialize Web Vitals tracking', 'performance', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Set up navigation timing tracking
   * @private
   */
  private setupNavigationTiming(): void {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          // First Contentful Paint
          const paintEntries = performance.getEntriesByType('paint');
          const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
          if (fcpEntry) {
            this.webVitals.fcp = fcpEntry.startTime;
            logger.logPerformance('FCP', fcpEntry.startTime, { type: 'web-vital' });
          }

          // Time to First Byte
          this.webVitals.ttfb = navigation.responseStart - navigation.requestStart;
          logger.logPerformance('TTFB', this.webVitals.ttfb, { type: 'web-vital' });

          // Time to Interactive (approximation)
          const tti = navigation.loadEventEnd - navigation.fetchStart;
          this.customMetrics.timeToInteractive = tti;
          logger.logPerformance('TTI', tti, { type: 'custom-metric' });
        }
      }, 0);
    });
  }

  /**
   * Start measuring performance for a specific operation
   * @param name - Unique identifier for the measurement
   * @param category - Category for grouping measurements
   * @param metadata - Additional context data
   */
  startMeasurement(name: string, category = 'general', metadata?: Record<string, unknown>): void {
    if (!this.isEnabled) return;

    const startTime = performance.now();
    this.activeTimers.set(name, startTime);

    logger.debug(`Performance measurement started: ${name}`, 'performance', {
      category,
      ...metadata
    });
  }

  /**
   * End a performance measurement and record the result
   * @param name - Identifier used when starting the measurement
   * @param metadata - Additional context data
   * @returns The measurement result
   */
  endMeasurement(name: string, metadata?: Record<string, unknown>): PerformanceMeasurement | null {
    if (!this.isEnabled) return null;

    const startTime = this.activeTimers.get(name);
    if (!startTime) {
      logger.warn(`No active measurement found for: ${name}`, 'performance');
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    this.activeTimers.delete(name);

    const measurement: PerformanceMeasurement = {
      name,
      duration,
      startTime,
      endTime,
      category: 'general',
      metadata
    };

    // Store measurement
    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(measurement);

    // Check for alerts
    this.checkAlert(name, duration);

    // Log the measurement
    logger.logPerformance(name, duration, {
      category: measurement.category,
      ...metadata
    });

    return measurement;
  }

  /**
   * Measure a function execution time
   * @param name - Name for the measurement
   * @param fn - Function to measure
   * @param category - Measurement category
   * @param metadata - Additional context
   * @returns The function result and measurement
   */
  async measureFunction<T>(
    name: string,
    fn: () => Promise<T> | T,
    category = 'function',
    metadata?: Record<string, unknown>
  ): Promise<{ result: T; measurement: PerformanceMeasurement }> {
    this.startMeasurement(name, category, metadata);
    
    try {
      const result = await fn();
      const measurement = this.endMeasurement(name, { success: true, ...metadata })!;
      return { result, measurement };
    } catch (error) {
      this.endMeasurement(name, { 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        ...metadata 
      });
      throw error;
    }
  }

  /**
   * Record a custom metric value
   * @param name - Metric name
   * @param value - Metric value
   * @param category - Metric category
   * @param metadata - Additional context
   */
  recordMetric(name: string, value: number, category = 'custom', metadata?: Record<string, unknown>): void {
    if (!this.isEnabled) return;

    const measurement: PerformanceMeasurement = {
      name,
      duration: value,
      startTime: performance.now(),
      endTime: performance.now(),
      category,
      metadata
    };

    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(measurement);

    this.checkAlert(name, value);
    logger.logPerformance(name, value, { category, ...metadata });
  }

  /**
   * Check if a metric value triggers any alerts
   * @private
   * @param metric - Metric name
   * @param value - Metric value
   */
  private checkAlert(metric: string, value: number): void {
    const alert = this.alerts.find(a => a.metric === metric);
    if (!alert || value < alert.threshold) return;

    const baseline = this.baselines.find(b => b.metric === metric);
    const context = baseline ? { baseline: baseline.description } : {};

    logger.warn(`Performance Alert: ${alert.message}`, 'performance-alert', {
      metric,
      value,
      threshold: alert.threshold,
      severity: alert.severity,
      ...context
    });
  }

  /**
   * Get performance statistics for a metric
   * @param name - Metric name
   * @returns Performance statistics
   */
  getMetricStats(name: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  } | null {
    const measurements = this.measurements.get(name);
    if (!measurements || measurements.length === 0) return null;

    const durations = measurements.map(m => m.duration).sort((a, b) => a - b);
    const count = durations.length;
    const sum = durations.reduce((a, b) => a + b, 0);

    return {
      count,
      average: sum / count,
      min: durations[0],
      max: durations[count - 1],
      p95: durations[Math.floor(count * 0.95)],
      p99: durations[Math.floor(count * 0.99)]
    };
  }

  /**
   * Get all current metrics
   * @returns Object containing all metrics
   */
  getAllMetrics() {
    const measurementStats: Record<string, ReturnType<typeof this.getMetricStats>> = {};
    
    for (const [name] of this.measurements) {
      measurementStats[name] = this.getMetricStats(name);
    }

    return {
      webVitals: this.webVitals,
      customMetrics: this.customMetrics,
      measurementStats
    };
  }

  /**
   * Clear all stored measurements
   */
  clearMeasurements(): void {
    this.measurements.clear();
    this.activeTimers.clear();
    logger.info('Performance measurements cleared', 'performance');
  }

  /**
   * Enable or disable performance tracking
   * @param enabled - Whether to enable tracking
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.info(`Performance tracking ${enabled ? 'enabled' : 'disabled'}`, 'performance');
  }

  /**
   * Generate a performance report
   * @returns Comprehensive performance report
   */
  generateReport(): {
    timestamp: string;
    webVitals: WebVitalsMetrics;
    customMetrics: CustomMetrics;
    alertsTriggered: number;
    recommendations: string[];
    summary: {
      totalMeasurements: number;
      averageLoadTime: number;
      slowestOperations: Array<{ name: string; duration: number }>;
    };
  } {
    const recommendations: string[] = [];
    
    // Generate recommendations based on baselines
    this.baselines.forEach(baseline => {
      const metric = baseline.metric;
      let value: number | undefined;
      
      if (metric in this.webVitals) {
        value = this.webVitals[metric as keyof WebVitalsMetrics];
      } else if (metric in this.customMetrics) {
        value = this.customMetrics[metric as keyof CustomMetrics];
      } else {
        const stats = this.getMetricStats(metric);
        value = stats?.average;
      }
      
      if (value && value > baseline.warning) {
        recommendations.push(
          `${baseline.description}. Current: ${value.toFixed(2)}${metric === 'cls' ? '' : 'ms'}`
        );
      }
    });

    // Find slowest operations
    const slowestOperations: Array<{ name: string; duration: number }> = [];
    for (const [name] of this.measurements) {
      const stats = this.getMetricStats(name);
      if (stats) {
        slowestOperations.push({ name, duration: stats.average });
      }
    }
    slowestOperations.sort((a, b) => b.duration - a.duration);

    const totalMeasurements = Array.from(this.measurements.values())
      .reduce((sum, measurements) => sum + measurements.length, 0);

    return {
      timestamp: new Date().toISOString(),
      webVitals: this.webVitals,
      customMetrics: this.customMetrics,
      alertsTriggered: this.alerts.length,
      recommendations: recommendations.slice(0, 5),
      summary: {
        totalMeasurements,
        averageLoadTime: this.webVitals.lcp || 0,
        slowestOperations: slowestOperations.slice(0, 10)
      }
    };
  }
}

// Export singleton instance
export const performanceMetrics = PerformanceMetricsService.getInstance();

/**
 * Decorator for measuring method execution time
 * @param category - Performance category
 * @param metadata - Additional metadata
 */
export function measurePerformance(category = 'method', metadata?: Record<string, unknown>) {
  return function (target: { constructor: { name: string } }, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const methodName = `${target.constructor.name}.${propertyKey}`;
      const { result } = await performanceMetrics.measureFunction(
        methodName,
        () => originalMethod.apply(this, args),
        category,
        metadata
      );
      return result;
    };

    return descriptor;
  };
}