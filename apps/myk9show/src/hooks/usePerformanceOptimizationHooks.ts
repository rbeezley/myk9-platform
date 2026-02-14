/**
 * Collection of performance optimization hooks.
 * Includes the main optimization hook, debounce/throttle utilities,
 * lazy loading, image optimization, virtual scrolling, resource preloading,
 * bundle optimization, performance budgets, advanced virtualization,
 * and chunked data processing.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { monitoring } from '../services/MonitoringService';
import { logger } from '@/services/LoggingService';
import type { PerformanceConfig, VirtualizedResult, LayoutShift } from './performance-optimization-types';
import { calculateVirtualizedItems, defaultConfig } from './performance-optimization-utils';

/**
 * Main performance optimization hook
 */
export const usePerformanceOptimization = (config: Partial<PerformanceConfig> = {}) => {
  const finalConfig = useMemo(() => ({ ...defaultConfig, ...config }), [config]);
  const [isOptimized, setIsOptimized] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, number>>({});

  useEffect(() => {
    queueMicrotask(() => {
      setIsOptimized(true);
    });
    logger.info('Performance optimization enabled', 'performance', finalConfig);
  }, [finalConfig]);

  const recordMetric = useCallback((name: string, value: number, unit = 'ms') => {
    setMetrics(prev => ({ ...prev, [name]: value }));
    monitoring.recordPerformanceMetric(`optimization.${name}`, value, unit);
  }, []);

  return {
    isOptimized,
    metrics,
    recordMetric,
    config: finalConfig,
  };
};

/**
 * Debounced value hook for performance optimization
 */
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Throttled callback hook
 */
export const useThrottle = <T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T => {
  const lastRun = useRef<number>(0);

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRun.current >= delay) {
      lastRun.current = now;
      return callback(...args);
    }
    return undefined;
  }, [callback, delay]) as T;
};

/**
 * Intersection Observer hook for lazy loading
 */
export const useIntersectionObserver = (
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLElement | null>, boolean] => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const targetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        ...options,
      }
    );

    observer.observe(target);

    return () => {
      observer.unobserve(target);
    };
  }, [options]);

  return [targetRef, isIntersecting];
};

/**
 * Lazy loading hook for components
 */
export const useLazyLoading = (shouldLoad: boolean = true) => {
  const [isVisible, setIsVisible] = useState(!shouldLoad);
  const [ref, inView] = useIntersectionObserver();

  useEffect(() => {
    if (shouldLoad && inView && !isVisible) {
      queueMicrotask(() => {
        setIsVisible(true);
      });
      monitoring.trackFeatureUsage('lazy_loading');
    }
  }, [inView, shouldLoad, isVisible]);

  return {
    ref,
    isVisible: isVisible || !shouldLoad,
    inView,
  };
};

/**
 * Image optimization hook
 */
export const useImageOptimization = (src: string, options: {
  quality?: number;
  format?: 'webp' | 'avif' | 'auto';
  sizes?: string[];
  lazy?: boolean;
} = {}) => {
  const { quality = 85, format = 'auto', sizes = [], lazy = true } = options;
  const [optimizedSrc, setOptimizedSrc] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateOptimizedUrl = useCallback((originalSrc: string) => {
    // If using a CDN service like Cloudinary or ImageKit
    if (import.meta.env.VITE_CDN_URL) {
      const params = new URLSearchParams();
      params.set('q', quality.toString());
      if (format !== 'auto') params.set('f', format);
      if (sizes.length > 0) params.set('w', sizes[0]);

      return `${import.meta.env.VITE_CDN_URL}/${originalSrc}?${params.toString()}`;
    }

    return originalSrc;
  }, [quality, format, sizes]);

  useEffect(() => {
    if (!src) return;

    const optimized = generateOptimizedUrl(src);
    queueMicrotask(() => {
      setOptimizedSrc(optimized);
    });

    if (!lazy) {
      // Preload the image
      const img = new Image();
      img.onload = () => setIsLoaded(true);
      img.onerror = () => setError('Failed to load image');
      img.src = optimized;
    }
  }, [src, generateOptimizedUrl, lazy]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    monitoring.recordPerformanceMetric('image.load_time', performance.now(), 'ms');
  }, []);

  const handleError = useCallback(() => {
    setError('Failed to load image');
    logger.error('Image load failed', 'performance', { src: optimizedSrc });
  }, [optimizedSrc]);

  return {
    src: optimizedSrc,
    isLoaded,
    error,
    onLoad: handleLoad,
    onError: handleError,
  };
};

/**
 * Virtual scrolling hook for large lists
 */
export const useVirtualScrolling = <T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) => {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(items.length - 1, start + visibleCount + overscan * 2);

    return { start, end };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end + 1).map((item, index) => ({
      item,
      index: visibleRange.start + index,
    }));
  }, [items, visibleRange]);

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.start * itemHeight;

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    offsetY,
    onScroll: handleScroll,
  };
};

/**
 * Resource preloading hook
 */
export const useResourcePreloading = (resources: Array<{
  href: string;
  as: 'script' | 'style' | 'image' | 'font' | 'document';
  crossorigin?: 'anonymous' | 'use-credentials';
}>) => {
  const [preloadedResources, setPreloadedResources] = useState<Set<string>>(new Set());

  useEffect(() => {
    const preloadResource = (resource: typeof resources[0]) => {
      if (preloadedResources.has(resource.href)) return;

      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = resource.href;
      link.as = resource.as;
      if (resource.crossorigin) {
        link.crossOrigin = resource.crossorigin;
      }

      link.onload = () => {
        setPreloadedResources(prev => new Set(prev).add(resource.href));
        monitoring.recordPerformanceMetric('preload.success', 1, 'count');
      };

      link.onerror = () => {
        logger.warn(`Failed to preload resource: ${resource.href}`, 'performance');
        monitoring.recordPerformanceMetric('preload.error', 1, 'count');
      };

      document.head.appendChild(link);
    };

    resources.forEach(preloadResource);
  }, [resources, preloadedResources]);

  return { preloadedResources };
};

/**
 * Bundle size optimization hook
 */
export const useBundleOptimization = () => {
  const [bundleInfo, setBundleInfo] = useState<{
    jsSize: number;
    cssSize: number;
    totalSize: number;
  }>({ jsSize: 0, cssSize: 0, totalSize: 0 });

  useEffect(() => {
    // Calculate bundle sizes from loaded resources
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

      // Log bundle size metrics
      monitoring.recordPerformanceMetric('bundle.js_size', jsSize, 'bytes');
      monitoring.recordPerformanceMetric('bundle.css_size', cssSize, 'bytes');
      monitoring.recordPerformanceMetric('bundle.total_size', totalSize, 'bytes');

      // Warn about large bundles
      if (totalSize > 1024 * 1024) { // 1MB
        logger.warn(`Large bundle size detected: ${(totalSize / 1024 / 1024).toFixed(2)}MB`, 'performance', {
          jsSize,
          cssSize,
          totalSize,
        });
      }
    };

    // Wait for resources to load
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

/**
 * Performance budget monitoring hook
 */
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

      // Check Web Vitals budgets
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

/**
 * Hook for enhanced virtual scrolling with performance monitoring
 */
export function useAdvancedVirtualization<T>(options: {
  data: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  onScroll?: (scrollTop: number) => void;
}) {
  const {
    data,
    itemHeight,
    containerHeight,
    overscan = 5,
    onScroll
  } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const [result, setResult] = useState<VirtualizedResult<T> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate visible items
  useEffect(() => {
    if (!data.length) {
      queueMicrotask(() => {
        setResult(null);
      });
      return;
    }

    const virtualizedResult = calculateVirtualizedItems(
      data,
      scrollTop,
      { itemHeight, containerHeight, overscan }
    );

    queueMicrotask(() => {
      setResult(virtualizedResult);
    });
  }, [data, scrollTop, itemHeight, containerHeight, overscan]);

  // Handle scroll events with throttling
  const handleScroll = useThrottle(
    useCallback((event: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = event.currentTarget.scrollTop;
      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);
    }, [onScroll]) as (...args: unknown[]) => unknown,
    16 // 60fps
  );

  // Scroll to specific index
  const scrollToIndex = useCallback((index: number) => {
    const newScrollTop = index * itemHeight;
    setScrollTop(newScrollTop);

    if (containerRef.current) {
      containerRef.current.scrollTop = newScrollTop;
    }
  }, [itemHeight]);

  return {
    result,
    containerRef,
    handleScroll,
    scrollToIndex,
    scrollTop
  };
}

/**
 * Hook for chunked data processing
 */
export function useChunkedProcessing<T, R>() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<R[]>([]);

  const processInChunks = useCallback(async (
    data: T[],
    processor: (chunk: T[]) => Promise<R[]>,
    chunkSize: number = 100
  ) => {
    setProcessing(true);
    setProgress(0);
    setResults([]);

    try {
      const allResults: R[] = [];
      const totalChunks = Math.ceil(data.length / chunkSize);

      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const chunkResults = await processor(chunk);
        allResults.push(...chunkResults);

        const currentChunk = Math.floor(i / chunkSize) + 1;
        setProgress((currentChunk / totalChunks) * 100);

        // Allow other operations to run
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      setResults(allResults);
      return allResults;
    } finally {
      setProcessing(false);
    }
  }, []);

  return {
    processing,
    progress,
    results,
    processInChunks
  };
}
