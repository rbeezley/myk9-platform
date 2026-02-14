/**
 * Memory usage monitoring hook.
 * Polls the browser's memory API (when available) and logs warnings
 * when heap usage exceeds 80% of the limit.
 */

import { useState, useEffect } from 'react';
import { logger } from '@/services/LoggingService';

export const useMemoryMonitoring = () => {
  const [memoryInfo, setMemoryInfo] = useState<{
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  } | null>(null);

  useEffect(() => {
    const updateMemoryInfo = () => {
      if ('memory' in performance) {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        if (memory) {
          setMemoryInfo({
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
          });

          // Log memory usage if it's getting high
          const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
          if (usagePercent > 80) {
          logger.warn(`High memory usage: ${usagePercent.toFixed(2)}%`, 'performance', {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
          });
          }
        }
      }
    };

    // Update immediately
    updateMemoryInfo();

    // Update every 30 seconds
    const interval = setInterval(updateMemoryInfo, 30000);

    return () => clearInterval(interval);
  }, []);

  return memoryInfo;
};
