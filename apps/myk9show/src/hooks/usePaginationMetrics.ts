import { useState, useCallback } from 'react';

/**
 * Hook for collecting pagination performance metrics
 */
export function usePaginationMetrics() {
  const [metrics, setMetrics] = useState({
    renderStartTime: 0,
    renderEndTime: 0,
    itemsRendered: 0,
    cacheStats: { hits: 0, misses: 0, size: 0 }
  });

  const startRender = useCallback(() => {
    setMetrics(prev => ({ ...prev, renderStartTime: performance.now() }));
  }, []);

  const endRender = useCallback((itemCount: number) => {
    const endTime = performance.now();
    setMetrics(prev => ({
      ...prev,
      renderEndTime: endTime,
      itemsRendered: itemCount
    }));
  }, []);

  const updateCacheStats = useCallback((stats: { hits: number; misses: number; size: number }) => {
    setMetrics(prev => ({ ...prev, cacheStats: stats }));
  }, []);

  const getRenderTime = useCallback(() => {
    return metrics.renderEndTime - metrics.renderStartTime;
  }, [metrics]);

  return {
    startRender,
    endRender,
    updateCacheStats,
    getRenderTime,
    metrics: {
      renderTime: getRenderTime(),
      itemsRendered: metrics.itemsRendered,
      cacheStats: metrics.cacheStats
    }
  };
}