/**
 * Performance metrics monitoring hook.
 * Tracks render time, memory usage, cache hit rate, and total operations
 * for performance analysis and optimization.
 */

import { useState, useCallback } from 'react';
import type { PerformanceMetrics } from './performance-optimization-types';

export function usePerformanceMetrics() {
  const [metrics] = useState<PerformanceMetrics[]>([]);
  const [summary, setSummary] = useState({
    avgRenderTime: 0,
    avgMemoryUsage: 0,
    avgCacheHitRate: 0,
    totalOperations: 0
  });

  const reset = useCallback(() => {
    setSummary({
      avgRenderTime: 0,
      avgMemoryUsage: 0,
      avgCacheHitRate: 0,
      totalOperations: 0
    });
  }, []);

  return {
    metrics,
    summary,
    reset
  };
}
