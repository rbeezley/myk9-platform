// Query Performance Monitoring Service
// Phase 0: Performance Infrastructure
import { queryClient } from '@/lib/queryClient';
import { logger } from '@/services/LoggingService';

export interface QueryPerformanceMetrics {
  queryKey: string;
  duration: number;
  status: 'success' | 'error' | 'loading' | 'pending';
  timestamp: number;
  cacheHit: boolean;
  error?: string;
}

export interface PerformanceStats {
  totalQueries: number;
  averageTime: number;
  slowQueries: QueryPerformanceMetrics[];
  errorRate: number;
  cacheHitRate: number;
  lastHour: QueryPerformanceMetrics[];
}

class QueryPerformanceMonitor {
  private metrics: QueryPerformanceMetrics[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 queries
  private readonly slowQueryThreshold = 1000; // 1 second

  constructor() {
    this.setupQueryCacheSubscription();
  }

  private setupQueryCacheSubscription() {
    // Subscribe to query cache events for performance tracking
    queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated') {
        const query = event.query;
        const queryKey = query.queryKey.join('/');
        
        // Track query performance
        const metric: QueryPerformanceMetrics = {
          queryKey,
          duration: Date.now() - (query.state.dataUpdatedAt || Date.now()),
          status: query.state.status,
          timestamp: Date.now(),
          cacheHit: query.state.dataUpdatedAt > 0,
          error: query.state.error?.message,
        };

        this.addMetric(metric);

        // Log slow queries in development
        if (process.env.NODE_ENV === 'development' && metric.duration > this.slowQueryThreshold) {
          logger.warn('Slow query detected', 'performance', { queryKey, durationMs: metric.duration });
        }

        // Log errors
        if (metric.status === 'error' && metric.error) {
          logger.error('Query error', 'performance', { queryKey, error: metric.error });
        }
      }
    });
  }

  private addMetric(metric: QueryPerformanceMetrics) {
    this.metrics.push(metric);
    
    // Keep only the last N metrics to prevent memory bloat
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  public getStats(): PerformanceStats {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    const lastHour = this.metrics.filter(m => m.timestamp > oneHourAgo);
    const successfulQueries = this.metrics.filter(m => m.status === 'success');
    const errorQueries = this.metrics.filter(m => m.status === 'error');
    const cacheHits = this.metrics.filter(m => m.cacheHit);
    const slowQueries = this.metrics.filter(m => m.duration > this.slowQueryThreshold);

    const averageTime = successfulQueries.length > 0
      ? successfulQueries.reduce((sum, m) => sum + m.duration, 0) / successfulQueries.length
      : 0;

    const errorRate = this.metrics.length > 0
      ? errorQueries.length / this.metrics.length
      : 0;

    const cacheHitRate = this.metrics.length > 0
      ? cacheHits.length / this.metrics.length
      : 0;

    return {
      totalQueries: this.metrics.length,
      averageTime: Math.round(averageTime),
      slowQueries: slowQueries.slice(-10), // Last 10 slow queries
      errorRate: Math.round(errorRate * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      lastHour,
    };
  }

  public getSlowQueries(limit = 10): QueryPerformanceMetrics[] {
    return this.metrics
      .filter(m => m.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  public getQueryStats(queryKey: string): {
    totalCalls: number;
    averageTime: number;
    errorRate: number;
    lastCall: QueryPerformanceMetrics | null;
  } {
    const queryMetrics = this.metrics.filter(m => m.queryKey === queryKey);
    const successfulCalls = queryMetrics.filter(m => m.status === 'success');
    const errorCalls = queryMetrics.filter(m => m.status === 'error');

    const averageTime = successfulCalls.length > 0
      ? successfulCalls.reduce((sum, m) => sum + m.duration, 0) / successfulCalls.length
      : 0;

    const errorRate = queryMetrics.length > 0
      ? errorCalls.length / queryMetrics.length
      : 0;

    return {
      totalCalls: queryMetrics.length,
      averageTime: Math.round(averageTime),
      errorRate: Math.round(errorRate * 100) / 100,
      lastCall: queryMetrics[queryMetrics.length - 1] || null,
    };
  }

  public clearMetrics() {
    this.metrics = [];
  }

  public exportMetrics() {
    return {
      metrics: this.metrics,
      stats: this.getStats(),
      timestamp: Date.now(),
    };
  }

  // Enhanced logging for development
  public logPerformanceSummary() {
    if (process.env.NODE_ENV !== 'development') return;

    const stats = this.getStats();

    logger.debug('Query Performance Summary', 'performance', {
      totalQueries: stats.totalQueries,
      averageTimeMs: stats.averageTime,
      cacheHitRate: `${(stats.cacheHitRate * 100).toFixed(1)}%`,
      errorRate: `${(stats.errorRate * 100).toFixed(1)}%`,
      slowQueriesCount: stats.slowQueries.length,
      slowQueries: stats.slowQueries.map(q => ({ queryKey: q.queryKey, durationMs: q.duration }))
    });
  }

  // Detect performance regressions
  public detectRegressions(): {
    hasRegression: boolean;
    details: string[];
  } {
    const stats = this.getStats();
    const details: string[] = [];
    let hasRegression = false;

    // Check for high error rate
    if (stats.errorRate > 0.05) { // 5% error rate threshold
      details.push(`High error rate: ${(stats.errorRate * 100).toFixed(1)}%`);
      hasRegression = true;
    }

    // Check for low cache hit rate
    if (stats.cacheHitRate < 0.7) { // 70% cache hit rate threshold
      details.push(`Low cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
      hasRegression = true;
    }

    // Check for slow average response time
    if (stats.averageTime > 500) { // 500ms threshold
      details.push(`Slow average response: ${stats.averageTime}ms`);
      hasRegression = true;
    }

    // Check for many slow queries
    if (stats.slowQueries.length > 5) {
      details.push(`Many slow queries: ${stats.slowQueries.length} queries > ${this.slowQueryThreshold}ms`);
      hasRegression = true;
    }

    return { hasRegression, details };
  }
}

// Singleton instance
export const queryPerformanceMonitor = new QueryPerformanceMonitor();

// Auto-log performance summary every 5 minutes in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    queryPerformanceMonitor.logPerformanceSummary();
  }, 5 * 60 * 1000);
}

// Detect regressions every minute in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    const regression = queryPerformanceMonitor.detectRegressions();
    if (regression.hasRegression) {
      logger.warn('Performance regression detected', 'performance', { details: regression.details });
    }
  }, 60 * 1000);
}

export default queryPerformanceMonitor;