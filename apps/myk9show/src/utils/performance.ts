/**
 * Performance utilities for optimizing realtime operations
 */

/**
 * Debounce function to limit how often a function can be called
 * Useful for throttling UI updates and API calls
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  immediate = false
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    
    if (callNow) func(...args);
  };
}

/**
 * Throttle function to limit how often a function can be executed
 * Useful for scroll events and frequent realtime updates
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Batch function calls to reduce the number of operations
 * Useful for bulk database operations
 */
export function batchify<T>(
  func: (items: T[]) => Promise<void>,
  batchSize: number = 10,
  delay: number = 100
) {
  let batch: T[] = [];
  let timeout: NodeJS.Timeout | null = null;

  const processBatch = async () => {
    if (batch.length === 0) return;
    
    const currentBatch = [...batch];
    batch = [];
    
    try {
      await func(currentBatch);
    } catch (error) {
      console.error('Batch processing error:', error);
      // Re-add failed items to the batch for retry
      batch.unshift(...currentBatch);
    }
  };

  return (item: T) => {
    batch.push(item);
    
    if (batch.length >= batchSize) {
      // Process immediately if batch is full
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      processBatch();
    } else {
      // Schedule processing if not already scheduled
      if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          processBatch();
        }, delay);
      }
    }
  };
}

/**
 * Memoization function to cache expensive computations
 * Useful for placement calculations and data transformations
 */
export function memoize<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  keyFn?: (...args: TArgs) => string
): (...args: TArgs) => TReturn {
  const cache = new Map<string, TReturn>();
  
  return (...args: TArgs): TReturn => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    
    return result;
  };
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private metrics = new Map<string, number[]>();
  private startTimes = new Map<string, number>();

  startTimer(label: string): void {
    this.startTimes.set(label, performance.now());
  }

  endTimer(label: string): number {
    const startTime = this.startTimes.get(label);
    if (!startTime) {
      console.warn(`No start time found for timer: ${label}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.startTimes.delete(label);

    // Store metric
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    this.metrics.get(label)!.push(duration);

    // Keep only last 100 measurements
    const measurements = this.metrics.get(label)!;
    if (measurements.length > 100) {
      measurements.splice(0, measurements.length - 100);
    }

    return duration;
  }

  getAverage(label: string): number {
    const measurements = this.metrics.get(label);
    if (!measurements || measurements.length === 0) {
      return 0;
    }

    const sum = measurements.reduce((acc, val) => acc + val, 0);
    return sum / measurements.length;
  }

  getMetrics(label: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    latest: number;
  } {
    const measurements = this.metrics.get(label) || [];
    
    if (measurements.length === 0) {
      return { count: 0, average: 0, min: 0, max: 0, latest: 0 };
    }

    return {
      count: measurements.length,
      average: measurements.reduce((acc, val) => acc + val, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      latest: measurements[measurements.length - 1]
    };
  }

  getAllMetrics(): Record<string, ReturnType<typeof this.getMetrics>> {
    const result: Record<string, ReturnType<typeof this.getMetrics>> = {};
    
    for (const [label] of this.metrics) {
      result[label] = this.getMetrics(label);
    }
    
    return result;
  }

  clear(label?: string): void {
    if (label) {
      this.metrics.delete(label);
      this.startTimes.delete(label);
    } else {
      this.metrics.clear();
      this.startTimes.clear();
    }
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator for measuring function execution time
 */
export function measurePerformance(label?: string) {
  return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const targetWithConstructor = target as { constructor: { name: string } };
    const methodLabel = label || `${targetWithConstructor.constructor.name}.${propertyKey}`;

    descriptor.value = function (...args: unknown[]) {
      performanceMonitor.startTimer(methodLabel);
      
      try {
        const result = originalMethod.apply(this, args);
        
        // Handle async methods
        if (result instanceof Promise) {
          return result.finally(() => {
            performanceMonitor.endTimer(methodLabel);
          });
        } else {
          performanceMonitor.endTimer(methodLabel);
          return result;
        }
      } catch (error) {
        performanceMonitor.endTimer(methodLabel);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Frame rate limiting for smooth animations
 */
export function requestAnimationFrameThrottle<T extends (...args: unknown[]) => unknown>(
  func: T
): (...args: Parameters<T>) => void {
  let ticking = false;
  let lastArgs: Parameters<T>;

  return function (this: unknown, ...args: Parameters<T>) {
    lastArgs = args;
    
    if (!ticking) {
      requestAnimationFrame(() => {
        func.apply(this, lastArgs);
        ticking = false;
      });
      ticking = true;
    }
  };
}

/**
 * Memory usage monitoring utilities
 */
export class MemoryMonitor {
  private samples: number[] = [];
  private maxSamples = 100;

  sample(): number {
    if ('memory' in performance) {
      const memory = (performance as { memory: { usedJSHeapSize: number } }).memory;
      const usedMB = memory.usedJSHeapSize / 1024 / 1024;
      
      this.samples.push(usedMB);
      
      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }
      
      return usedMB;
    }
    
    return 0;
  }

  getStats(): {
    current: number;
    average: number;
    max: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  } {
    if (this.samples.length === 0) {
      return { current: 0, average: 0, max: 0, trend: 'stable' };
    }

    const current = this.samples[this.samples.length - 1];
    const average = this.samples.reduce((sum, val) => sum + val, 0) / this.samples.length;
    const max = Math.max(...this.samples);
    
    // Calculate trend from last 10 samples
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (this.samples.length >= 10) {
      const recent = this.samples.slice(-10);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const diff = last - first;
      
      if (diff > 1) trend = 'increasing';
      else if (diff < -1) trend = 'decreasing';
    }

    return { current, average, max, trend };
  }
}

// Global memory monitor
export const memoryMonitor = new MemoryMonitor();

/**
 * Utility to check if we should perform expensive operations
 * based on system performance
 */
export function shouldOptimizePerformance(): boolean {
  // Check various performance indicators
  const memoryStats = memoryMonitor.getStats();
  const isLowMemory = memoryStats.current > 100; // > 100MB
  const isMemoryIncreasing = memoryStats.trend === 'increasing';
  
  // Check if we're on a mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  
  // Check connection quality
  const connection = (navigator as { connection?: { effectiveType: string } }).connection;
  const isSlowConnection = Boolean(connection && (
    connection.effectiveType === 'slow-2g' || 
    connection.effectiveType === '2g'
  ));
  
  return isLowMemory || isMemoryIncreasing || isMobile || isSlowConnection;
}

/**
 * Adaptive performance configuration
 */
export function getAdaptiveConfig() {
  const shouldOptimize = shouldOptimizePerformance();
  
  return {
    // Realtime update frequencies
    scoreUpdateThrottle: shouldOptimize ? 1000 : 300,
    placementUpdateDebounce: shouldOptimize ? 2000 : 500,
    presenceUpdateInterval: shouldOptimize ? 10000 : 5000,
    
    // Batch sizes
    syncBatchSize: shouldOptimize ? 5 : 10,
    eventHistorySize: shouldOptimize ? 50 : 100,
    
    // UI optimizations
    enableAnimations: !shouldOptimize,
    enableRealTimePreview: !shouldOptimize,
    
    // Connection settings
    heartbeatInterval: shouldOptimize ? 60000 : 30000,
    reconnectDelay: shouldOptimize ? 5000 : 2000
  };
}