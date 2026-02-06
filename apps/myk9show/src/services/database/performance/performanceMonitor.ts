import { logQuery } from '../supabaseClient';
import { logger } from '@/services/LoggingService';

interface PerformanceMetric {
  operation: string;
  table: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string | undefined;
  rowCount?: number | undefined;
}

interface PerformanceStats {
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalQueries: number;
  failedQueries: number;
  successRate: number;
  slowQueries: number; // > 1000ms
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 1000; // Keep last 1000 metrics in memory
  private slowQueryThreshold = 1000; // 1 second

  // Add a metric
  addMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);
    
    // Keep only the last maxMetrics entries
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
    
    // Log slow queries
    if (metric.duration > this.slowQueryThreshold) {
      logger.warn('🐌 Slow query detected:', 'database', { data: {
        operation: metric.operation,
        table: metric.table,
        duration: `${metric.duration}ms`,
        timestamp: new Date(metric.timestamp).toISOString(),
      } });
    }
    
    // Send to external monitoring service if configured
    if (import.meta.env.VITE_MONITORING_ENABLED === 'true') {
      this.sendToMonitoringService(metric);
    }
  }

  // Get performance statistics
  getStats(timeWindow?: number): PerformanceStats {
    const now = Date.now();
    const relevantMetrics = timeWindow
      ? this.metrics.filter(m => now - m.timestamp <= timeWindow)
      : this.metrics;
    
    if (relevantMetrics.length === 0) {
      return {
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        totalQueries: 0,
        failedQueries: 0,
        successRate: 100,
        slowQueries: 0,
      };
    }
    
    const durations = relevantMetrics
      .filter(m => m.success)
      .map(m => m.duration)
      .sort((a, b) => a - b);
    
    const totalQueries = relevantMetrics.length;
    const failedQueries = relevantMetrics.filter(m => !m.success).length;
    const slowQueries = relevantMetrics.filter(m => m.duration > this.slowQueryThreshold).length;
    
    return {
      averageResponseTime: durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0,
      p95ResponseTime: this.getPercentile(durations, 0.95),
      p99ResponseTime: this.getPercentile(durations, 0.99),
      totalQueries,
      failedQueries,
      successRate: totalQueries > 0 ? ((totalQueries - failedQueries) / totalQueries) * 100 : 100,
      slowQueries,
    };
  }

  // Get metrics by table
  getTableStats(table: string): PerformanceStats {
    const tableMetrics = this.metrics.filter(m => m.table === table);
    
    if (tableMetrics.length === 0) {
      return this.getEmptyStats();
    }
    
    const durations = tableMetrics
      .filter(m => m.success)
      .map(m => m.duration)
      .sort((a, b) => a - b);
    
    const totalQueries = tableMetrics.length;
    const failedQueries = tableMetrics.filter(m => !m.success).length;
    const slowQueries = tableMetrics.filter(m => m.duration > this.slowQueryThreshold).length;
    
    return {
      averageResponseTime: durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0,
      p95ResponseTime: this.getPercentile(durations, 0.95),
      p99ResponseTime: this.getPercentile(durations, 0.99),
      totalQueries,
      failedQueries,
      successRate: totalQueries > 0 ? ((totalQueries - failedQueries) / totalQueries) * 100 : 100,
      slowQueries,
    };
  }

  // Get slow queries
  getSlowQueries(limit = 10): PerformanceMetric[] {
    return [...this.metrics]
      .filter(m => m.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  // Clear metrics
  clearMetrics() {
    this.metrics = [];
  }

  // Private helper methods
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.min(index, sortedArray.length - 1)];
  }

  private getEmptyStats(): PerformanceStats {
    return {
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      totalQueries: 0,
      failedQueries: 0,
      successRate: 100,
      slowQueries: 0,
    };
  }

  // Send metrics to external monitoring service (placeholder)
  private sendToMonitoringService(_metric: PerformanceMetric) {
    // This would integrate with services like:
    // - Datadog
    // - New Relic
    // - Sentry Performance Monitoring
    // - Custom analytics endpoint
    
    // For now, just log in development mode
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Performance metric would be sent:', 'database', { data: _metric.operation });
    }
    
    // TODO: Implement remote metrics reporting if needed
  }

  // Export metrics for analysis
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  // Get performance report
  getPerformanceReport() {
    const stats = this.getStats();
    const tableStats = new Map<string, PerformanceStats>();
    
    // Get unique tables
    const tables = [...new Set(this.metrics.map(m => m.table))];
    
    // Calculate stats per table
    tables.forEach(table => {
      tableStats.set(table, this.getTableStats(table));
    });
    
    return {
      overall: stats,
      byTable: Object.fromEntries(tableStats),
      slowQueries: this.getSlowQueries(5),
      timestamp: new Date().toISOString(),
    };
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Wrapper function to track query performance
export const trackQueryPerformance = async <T>(
  operation: () => Promise<T>,
  table: string,
  operationType: string
): Promise<T> => {
  const startTime = performance.now();
  let success = true;
  let error: string | undefined;
  
  try {
    const result = await operation();
    return result;
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : 'Unknown error';
    throw err;
  } finally {
    const duration = performance.now() - startTime;
    
    performanceMonitor.addMetric({
      operation: operationType,
      table,
      duration,
      timestamp: Date.now(),
      success,
      error,
    });
    
    // Also log using existing logQuery function
    logQuery(table, operationType, duration, error);
  }
};

// React hook for accessing performance stats
export const usePerformanceStats = (_refreshInterval = 5000) => {
  // This would be implemented as a React hook
  // that returns live performance statistics
  // Updated every _refreshInterval milliseconds
  
  // Placeholder implementation - would use React hooks in actual implementation
  logger.debug(`Performance stats would refresh every ${_refreshInterval}ms`, 'database', {});
  return null;
};

// Export performance data as CSV
export const exportPerformanceCSV = (): string => {
  const metrics = performanceMonitor.exportMetrics();
  
  const headers = ['Timestamp', 'Table', 'Operation', 'Duration (ms)', 'Success', 'Error'];
  const rows = metrics.map(m => [
    new Date(m.timestamp).toISOString(),
    m.table,
    m.operation,
    m.duration.toString(),
    m.success.toString(),
    m.error || '',
  ]);
  
  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');
};

// Performance baseline targets
export const PERFORMANCE_TARGETS = {
  QUERY_P95: 100, // 100ms
  QUERY_P99: 200, // 200ms
  MUTATION_P95: 200, // 200ms
  MUTATION_P99: 500, // 500ms
  BATCH_P95: 500, // 500ms
  BATCH_P99: 1000, // 1000ms
};

// Check if current performance meets targets
export const checkPerformanceTargets = (): {
  meetsTargets: boolean;
  violations: string[];
} => {
  const stats = performanceMonitor.getStats();
  const violations: string[] = [];
  
  if (stats.p95ResponseTime > PERFORMANCE_TARGETS.QUERY_P95) {
    violations.push(`P95 response time (${stats.p95ResponseTime.toFixed(0)}ms) exceeds target (${PERFORMANCE_TARGETS.QUERY_P95}ms)`);
  }
  
  if (stats.p99ResponseTime > PERFORMANCE_TARGETS.QUERY_P99) {
    violations.push(`P99 response time (${stats.p99ResponseTime.toFixed(0)}ms) exceeds target (${PERFORMANCE_TARGETS.QUERY_P99}ms)`);
  }
  
  return {
    meetsTargets: violations.length === 0,
    violations,
  };
};