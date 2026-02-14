import { useState, useEffect, useCallback } from 'react';
import { monitoring } from '../../services/MonitoringService';
import { logger } from '@/services/LoggingService';
import type { PerformanceMetrics, LayoutShift } from './types';

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

    updateMemoryInfo();

    const interval = setInterval(updateMemoryInfo, 30000);

    return () => clearInterval(interval);
  }, []);

  return memoryInfo;
};

export const useBundleOptimization = () => {
  const [bundleInfo, setBundleInfo] = useState<{
    jsSize: number;
    cssSize: number;
    totalSize: number;
  }>({ jsSize: 0, cssSize: 0, totalSize: 0 });

  useEffect(() => {
    const calculateBundleSizes = () => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      let jsSize = 0;
      let cssSize = 0;

      resources.forEach(resource => {
        if (resource.name.includes('.js')) {
          jsSize += resource.transferSize || 0;
        } else if (resource.name.includes('.css')) {
          cssSize += resource.transferSize || 0;
        }
      });

      const totalSize = jsSize + cssSize;
      setBundleInfo({ jsSize, cssSize, totalSize });

      monitoring.recordPerformanceMetric('bundle.js_size', jsSize, 'bytes');
      monitoring.recordPerformanceMetric('bundle.css_size', cssSize, 'bytes');
      monitoring.recordPerformanceMetric('bundle.total_size', totalSize, 'bytes');

      if (totalSize > 1024 * 1024) {
        logger.warn(`Large bundle size detected: ${(totalSize / 1024 / 1024).toFixed(2)}MB`, 'performance', {
          jsSize,
          cssSize,
          totalSize,
        });
      }
    };

    if (document.readyState === 'complete') {
      calculateBundleSizes();
      return undefined;
    } else {
      window.addEventListener('load', calculateBundleSizes);
      return () => window.removeEventListener('load', calculateBundleSizes);
    }
  }, []);

  return bundleInfo;
};

export const usePerformanceBudget = (budgets: {
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  cumulativeLayoutShift?: number;
  totalBlockingTime?: number;
  bundleSize?: number;
}) => {
  const [budgetStatus, setBudgetStatus] = useState<Record<string, 'pass' | 'warn' | 'fail'>>({});

  useEffect(() => {
    const checkBudgets = () => {
      const status: Record<string, 'pass' | 'warn' | 'fail'> = {};

      if ('PerformanceObserver' in window) {
        const checkMetric = (entryType: string, budgetKey: keyof typeof budgets, getValue: (entry: PerformanceEntry) => number) => {
          if (!budgets[budgetKey]) return;

          try {
            const observer = new PerformanceObserver((list) => {
              const entries = list.getEntries();
              if (entries.length > 0) {
                const value = getValue(entries[entries.length - 1]);
                const budget = budgets[budgetKey]!;

                if (value <= budget) {
                  status[budgetKey] = 'pass';
                } else if (value <= budget * 1.5) {
                  status[budgetKey] = 'warn';
                } else {
                  status[budgetKey] = 'fail';
                }

                setBudgetStatus(prev => ({ ...prev, ...status }));
                observer.disconnect();
              }
            });

            observer.observe({ entryTypes: [entryType] });
          } catch (error) {
            logger.warn(`Failed to observe ${entryType}`, 'performance', { error: error?.toString() });
          }
        };

        if (budgets.firstContentfulPaint) {
          checkMetric('paint', 'firstContentfulPaint', (entry) => entry.startTime);
        }

        if (budgets.largestContentfulPaint) {
          checkMetric('largest-contentful-paint', 'largestContentfulPaint', (entry) => entry.startTime);
        }

        if (budgets.cumulativeLayoutShift) {
          checkMetric('layout-shift', 'cumulativeLayoutShift', (entry) => (entry as LayoutShift).value);
        }
      }
    };

    checkBudgets();
  }, [budgets]);

  return budgetStatus;
};

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
