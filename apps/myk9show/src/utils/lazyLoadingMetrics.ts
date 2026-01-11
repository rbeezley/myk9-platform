/**
 * Lazy Loading Metrics - Performance monitoring for code splitting
 *
 * Tracks loading times, bundle sizes, and user interactions with lazy components
 */

import { logger } from '@/services/LoggingService';

interface LazyLoadMetric {
  componentName: string;
  startTime: number;
  endTime?: number;
  loadTime?: number;
  error?: string;
  retryCount?: number;
}

class LazyLoadingMetrics {
  private metrics: Map<string, LazyLoadMetric> = new Map();
  private listeners: Array<(metric: LazyLoadMetric) => void> = [];

  startLoading(componentName: string): void {
    const metric: LazyLoadMetric = {
      componentName,
      startTime: performance.now(),
      retryCount: 0
    };
    
    this.metrics.set(componentName, metric);
    
    // Report in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Starting to load lazy component', 'performance', { componentName });
    }
  }

  endLoading(componentName: string, success: boolean, error?: string): void {
    const metric = this.metrics.get(componentName);
    if (!metric) return;

    const endTime = performance.now();
    const loadTime = endTime - metric.startTime;

    const updatedMetric: LazyLoadMetric = {
      ...metric,
      endTime,
      loadTime,
      error: success ? undefined : error
    };

    this.metrics.set(componentName, updatedMetric);
    this.notifyListeners(updatedMetric);

    // Report in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Lazy component loaded', 'performance', { componentName, loadTimeMs: loadTime.toFixed(2), success, error });
    }

    // Report performance to analytics in production
    if (process.env.NODE_ENV === 'production' && 'performance' in window) {
      try {
        // Mark the component load completion
        performance.mark(`lazy-component-${componentName}-end`);
        
        // Measure the loading time
        performance.measure(
          `lazy-component-${componentName}`,
          `lazy-component-${componentName}-start`,
          `lazy-component-${componentName}-end`
        );
      } catch {
        // Ignore performance API errors
      }
    }
  }

  recordRetry(componentName: string): void {
    const metric = this.metrics.get(componentName);
    if (metric) {
      const updatedMetric = {
        ...metric,
        retryCount: (metric.retryCount || 0) + 1
      };
      this.metrics.set(componentName, updatedMetric);
    }
  }

  getMetrics(): LazyLoadMetric[] {
    return Array.from(this.metrics.values());
  }

  getComponentMetric(componentName: string): LazyLoadMetric | undefined {
    return this.metrics.get(componentName);
  }

  getAverageLoadTime(): number {
    const metrics = this.getMetrics().filter(m => m.loadTime);
    if (metrics.length === 0) return 0;
    
    const totalTime = metrics.reduce((sum, m) => sum + (m.loadTime || 0), 0);
    return totalTime / metrics.length;
  }

  getFailureRate(): number {
    const metrics = this.getMetrics();
    if (metrics.length === 0) return 0;
    
    const failures = metrics.filter(m => m.error).length;
    return failures / metrics.length;
  }

  onMetricUpdate(listener: (metric: LazyLoadMetric) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(metric: LazyLoadMetric): void {
    this.listeners.forEach(listener => {
      try {
        listener(metric);
      } catch (e) {
        logger.error('Error in lazy loading metric listener', 'performance', { componentName: metric.componentName }, e as Error);
      }
    });
  }

  // Generate performance report
  generateReport(): {
    totalComponents: number;
    averageLoadTime: number;
    failureRate: number;
    slowestComponents: Array<{ name: string; loadTime: number }>;
    failedComponents: Array<{ name: string; error: string; retries: number }>;
  } {
    const metrics = this.getMetrics();
    
    const slowestComponents = metrics
      .filter(m => m.loadTime)
      .sort((a, b) => (b.loadTime || 0) - (a.loadTime || 0))
      .slice(0, 5)
      .map(m => ({ name: m.componentName, loadTime: m.loadTime || 0 }));

    const failedComponents = metrics
      .filter(m => m.error)
      .map(m => ({
        name: m.componentName,
        error: m.error || '',
        retries: m.retryCount || 0
      }));

    return {
      totalComponents: metrics.length,
      averageLoadTime: this.getAverageLoadTime(),
      failureRate: this.getFailureRate(),
      slowestComponents,
      failedComponents
    };
  }

  // Clear metrics (useful for testing)
  clear(): void {
    this.metrics.clear();
  }
}

// Singleton instance
export const lazyLoadingMetrics = new LazyLoadingMetrics();

// Helper functions for tracking
export const trackLazyComponentStart = (componentName: string) => {
  lazyLoadingMetrics.startLoading(componentName);
  
  // Mark in performance API for production tracking
  if (process.env.NODE_ENV === 'production' && 'performance' in window) {
    try {
      performance.mark(`lazy-component-${componentName}-start`);
    } catch {
      // Ignore performance API errors
    }
  }
};

export const trackLazyComponentEnd = (componentName: string, success: boolean, error?: string) => {
  lazyLoadingMetrics.endLoading(componentName, success, error);
};

export const trackLazyComponentRetry = (componentName: string) => {
  lazyLoadingMetrics.recordRetry(componentName);
};

// Development helper to log performance report
export const logLazyLoadingReport = () => {
  if (process.env.NODE_ENV === 'development') {
    const report = lazyLoadingMetrics.generateReport();
    logger.debug('Lazy Loading Performance Report', 'performance', {
      totalComponents: report.totalComponents,
      averageLoadTimeMs: report.averageLoadTime.toFixed(2),
      failureRate: `${(report.failureRate * 100).toFixed(1)}%`,
      slowestComponents: report.slowestComponents,
      failedComponents: report.failedComponents
    });
  }
};