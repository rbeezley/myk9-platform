import { logger } from '@/services/LoggingService';

/**
 * Performance monitoring and optimization utilities for search functionality
 */

export interface SearchMetrics {
  searchTime: number;
  indexBuildTime: number;
  resultsCount: number;
  queryLength: number;
  timestamp: number;
}

export interface PerformanceReport {
  averageSearchTime: number;
  slowestSearch: SearchMetrics;
  fastestSearch: SearchMetrics;
  totalSearches: number;
  indexSize: number;
  averageResultsCount: number;
}

class SearchPerformanceMonitor {
  private metrics: SearchMetrics[] = [];
  private maxMetrics = 1000; // Keep last 1000 searches

  /**
   * Record search performance metrics
   */
  recordSearch(metrics: SearchMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    
    // Log slow searches for debugging
    if (metrics.searchTime > 100) {
      logger.warn('Slow search detected:', 'utils', { data: {
        query: `${metrics.queryLength} chars`,
        time: `${metrics.searchTime}ms`,
        results: metrics.resultsCount
      } });
    }
  }

  /**
   * Get performance report
   */
  getReport(): PerformanceReport | null {
    if (this.metrics.length === 0) {
      return null;
    }

    const searchTimes = this.metrics.map(m => m.searchTime);
    const averageSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
    
    const slowestSearch = this.metrics.reduce((prev, current) => 
      prev.searchTime > current.searchTime ? prev : current
    );
    
    const fastestSearch = this.metrics.reduce((prev, current) => 
      prev.searchTime < current.searchTime ? prev : current
    );

    const averageResultsCount = this.metrics.reduce((sum, m) => sum + m.resultsCount, 0) / this.metrics.length;

    return {
      averageSearchTime,
      slowestSearch,
      fastestSearch,
      totalSearches: this.metrics.length,
      indexSize: 0, // Will be populated by the caller
      averageResultsCount
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Get recent metrics (last N searches)
   */
  getRecentMetrics(count = 10): SearchMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Check if search performance is degrading
   */
  isPerformanceDegrading(): boolean {
    if (this.metrics.length < 20) {
      return false;
    }

    const recent = this.metrics.slice(-10);
    const older = this.metrics.slice(-20, -10);

    const recentAvg = recent.reduce((sum, m) => sum + m.searchTime, 0) / recent.length;
    const olderAvg = older.reduce((sum, m) => sum + m.searchTime, 0) / older.length;

    // Performance is degrading if recent searches are 50% slower
    return recentAvg > olderAvg * 1.5;
  }
}

// Global performance monitor
export const searchPerformanceMonitor = new SearchPerformanceMonitor();

/**
 * Performance measurement decorator for search functions
 */
export function measureSearchPerformance<T extends unknown[], R>(
  fn: (...args: T) => Promise<R> | R,
  metricType: 'search' | 'index'
) {
  return async (...args: T): Promise<R> => {
    const startTime = performance.now();
    
    try {
      const result = await fn(...args);
      const endTime = performance.now();
      const duration = endTime - startTime;

      if (metricType === 'search') {
        // Assume first arg is query string and result has length property
        const query = args[0] as string;
        const resultsCount = Array.isArray(result) ? result.length : 0;
        
        searchPerformanceMonitor.recordSearch({
          searchTime: duration,
          indexBuildTime: 0,
          resultsCount,
          queryLength: query?.length || 0,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      logger.error(`${metricType} operation failed after ${duration}ms:`, 'utils', {}, error as Error);
      throw error;
    }
  };
}

/**
 * Memory usage monitoring for search index
 */
export function getSearchMemoryUsage(): {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
} | null {
  if ('memory' in performance) {
    const memory = (performance as { memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit
    };
  }
  return null;
}

/**
 * Optimize search index based on usage patterns
 */
export function optimizeSearchIndex(metrics: SearchMetrics[]): {
  shouldRebuildIndex: boolean;
  shouldClearCache: boolean;
  recommendedMaxResults: number;
} {
  if (metrics.length === 0) {
    return {
      shouldRebuildIndex: false,
      shouldClearCache: false,
      recommendedMaxResults: 50
    };
  }

  const averageSearchTime = metrics.reduce((sum, m) => sum + m.searchTime, 0) / metrics.length;
  const averageResultsCount = metrics.reduce((sum, m) => sum + m.resultsCount, 0) / metrics.length;

  return {
    shouldRebuildIndex: averageSearchTime > 200, // Rebuild if searches are consistently slow
    shouldClearCache: metrics.length > 500, // Clear cache if too many metrics
    recommendedMaxResults: Math.max(10, Math.min(100, Math.floor(averageResultsCount * 1.2)))
  };
}

/**
 * Search performance hooks for React components
 */
export function useSearchPerformance() {
  return {
    recordSearch: searchPerformanceMonitor.recordSearch.bind(searchPerformanceMonitor),
    getReport: searchPerformanceMonitor.getReport.bind(searchPerformanceMonitor),
    clear: searchPerformanceMonitor.clear.bind(searchPerformanceMonitor),
    isPerformanceDegrading: searchPerformanceMonitor.isPerformanceDegrading.bind(searchPerformanceMonitor),
    getMemoryUsage: getSearchMemoryUsage
  };
}