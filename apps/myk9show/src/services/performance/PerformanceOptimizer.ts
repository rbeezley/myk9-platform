import { logger } from '@/services/LoggingService';

/**
 * Performance optimization service for handling large datasets efficiently
 */

export interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface VirtualizedConfig {
  itemHeight: number;
  containerHeight: number;
  overscan: number;
}

export interface VirtualizedResult<T> {
  visibleItems: T[];
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  scrollTop: number;
}

export interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
}

export interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  queryTime: number;
  totalRecords: number;
  timestamp: number;
}

/**
 * Memory-efficient cache with LRU eviction
 */
class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();
  private maxSize: number;
  private ttl: number;

  constructor(config: CacheConfig) {
    this.maxSize = config.maxSize;
    this.ttl = config.ttl;
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    // Check TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key: string, value: T): void {
    // Remove oldest items if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      usage: (this.cache.size / this.maxSize) * 100
    };
  }
}

/**
 * Main performance optimization service
 */
export class PerformanceOptimizer {
  private static instance: PerformanceOptimizer;
  private cache: LRUCache<unknown>;
  private metrics: PerformanceMetrics[] = [];
  private batchQueue: Array<() => Promise<unknown>> = [];
  private processingBatch = false;

  private constructor() {
    this.cache = new LRUCache({
      maxSize: 1000,
      ttl: 5 * 60 * 1000 // 5 minutes
    });
  }

  static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }

  /**
   * Paginate large datasets efficiently
   */
  paginateData<T>(
    data: T[],
    options: PaginationOptions
  ): PaginatedResult<T> {
    const startTime = performance.now();
    
    const { page, pageSize, sortBy, sortDirection = 'asc', filters = {} } = options;
    
    // Apply filters
    let filteredData = data;
    if (Object.keys(filters).length > 0) {
      filteredData = data.filter(item => {
        return Object.entries(filters).every(([key, value]) => {
          if (value === null || value === undefined || value === '') return true;
          
          const itemValue = this.getNestedValue(item as Record<string, unknown>, key);
          if (typeof value === 'string' && typeof itemValue === 'string') {
            return itemValue.toLowerCase().includes(value.toLowerCase());
          }
          return itemValue === value;
        });
      });
    }

    // Apply sorting
    if (sortBy) {
      filteredData.sort((a, b) => {
        const aValue = this.getNestedValue(a as Record<string, unknown>, sortBy);
        const bValue = this.getNestedValue(b as Record<string, unknown>, sortBy);
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((aValue as any) < (bValue as any)) return sortDirection === 'asc' ? -1 : 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((aValue as any) > (bValue as any)) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    
    const paginatedData = filteredData.slice(startIndex, endIndex);

    // Record performance metrics
    this.recordMetric({
      renderTime: performance.now() - startTime,
      memoryUsage: this.getMemoryUsage(),
      cacheHitRate: 0,
      queryTime: performance.now() - startTime,
      totalRecords: totalItems,
      timestamp: Date.now()
    });

    return {
      data: paginatedData,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalItems,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    };
  }

  /**
   * Calculate visible items for virtual scrolling
   */
  calculateVirtualizedItems<T>(
    data: T[],
    scrollTop: number,
    config: VirtualizedConfig
  ): VirtualizedResult<T> {
    const { itemHeight, containerHeight, overscan } = config;
    
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const endIndex = Math.min(data.length - 1, startIndex + visibleCount + overscan * 2);
    
    const visibleItems = data.slice(startIndex, endIndex + 1);
    const totalHeight = data.length * itemHeight;

    return {
      visibleItems,
      startIndex,
      endIndex,
      totalHeight,
      scrollTop: startIndex * itemHeight
    };
  }

  /**
   * Batch operations to reduce re-renders
   */
  async batchOperations<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push(...operations);
      
      if (!this.processingBatch) {
        this.processBatch().then((result) => resolve(result as T[])).catch(reject);
      }
    });
  }

  private async processBatch(): Promise<unknown[]> {
    this.processingBatch = true;
    const currentBatch = [...this.batchQueue];
    this.batchQueue.length = 0;

    try {
      const results = await Promise.all(currentBatch.map(op => op()));
      this.processingBatch = false;
      return results;
    } catch (error) {
      this.processingBatch = false;
      throw error;
    }
  }

  /**
   * Debounced search to prevent excessive API calls
   */
  createDebouncedSearch<T>(
    searchFn: (query: string) => Promise<T[]>,
    delay: number = 300
  ): (query: string) => Promise<T[]> {
    let timeoutId: NodeJS.Timeout | null = null;
    
    return (query: string): Promise<T[]> => {
      return new Promise((resolve, reject) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(async () => {
          try {
            const results = await searchFn(query);
            resolve(results);
          } catch (error) {
            reject(error);
          }
        }, delay);
      });
    };
  }

  /**
   * Memoize expensive calculations
   */
  memoize<T extends unknown[], R>(
    fn: (...args: T) => R,
    getKey?: (...args: T) => string
  ): (...args: T) => R {
    const cache = new Map<string, R>();
    
    return (...args: T): R => {
      const key = getKey ? getKey(...args) : JSON.stringify(args);
      
      if (cache.has(key)) {
        return cache.get(key)!;
      }
      
      const result = fn(...args);
      cache.set(key, result);
      return result;
    };
  }

  /**
   * Lazy load data with caching
   */
  async lazyLoad<T>(
    key: string,
    loader: () => Promise<T>,
    useCache: boolean = true
  ): Promise<T> {
    if (useCache) {
      const cached = this.cache.get(key);
      if (cached) return cached as T;
    }

    const startTime = performance.now();
    const data = await loader();
    const loadTime = performance.now() - startTime;

    if (useCache) {
      this.cache.set(key, data);
    }

    // Record performance metrics
    this.recordMetric({
      renderTime: loadTime,
      memoryUsage: this.getMemoryUsage(),
      cacheHitRate: this.calculateCacheHitRate(),
      queryTime: loadTime,
      totalRecords: Array.isArray(data) ? data.length : 1,
      timestamp: Date.now()
    });

    return data;
  }

  /**
   * Optimize large lists with chunked processing
   */
  async processInChunks<T, R>(
    data: T[],
    processor: (chunk: T[]) => Promise<R[]>,
    chunkSize: number = 100
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const chunkResults = await processor(chunk);
      results.push(...chunkResults);
      
      // Allow other operations to run
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    return results;
  }

  /**
   * Preload data based on user behavior
   */
  async preloadData<T>(
    keys: string[],
    loader: (key: string) => Promise<T>
  ): Promise<void> {
    const loadPromises = keys.map(async (key) => {
      if (!this.cache.get(key)) {
        try {
          const data = await loader(key);
          this.cache.set(key, data);
        } catch (error) {
          logger.warn(`Failed to preload data for key: ${key}`, 'performance', {}, error as Error);
        }
      }
    });

    await Promise.allSettled(loadPromises);
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get latest performance summary
   */
  getPerformanceSummary() {
    if (this.metrics.length === 0) {
      return {
        avgRenderTime: 0,
        avgMemoryUsage: 0,
        avgCacheHitRate: 0,
        totalOperations: 0
      };
    }

    const recent = this.metrics.slice(-100); // Last 100 operations
    
    return {
      avgRenderTime: recent.reduce((sum, m) => sum + m.renderTime, 0) / recent.length,
      avgMemoryUsage: recent.reduce((sum, m) => sum + m.memoryUsage, 0) / recent.length,
      avgCacheHitRate: recent.reduce((sum, m) => sum + m.cacheHitRate, 0) / recent.length,
      totalOperations: this.metrics.length
    };
  }

  /**
   * Clear cache and reset metrics
   */
  reset(): void {
    this.cache.clear();
    this.metrics = [];
    this.batchQueue = [];
  }

  /**
   * Get memory usage estimate
   */
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;
    }
    return 0;
  }

  /**
   * Calculate cache hit rate
   */
  private calculateCacheHitRate(): number {
    const recent = this.metrics.slice(-10);
    if (recent.length === 0) return 0;
    
    return recent.reduce((sum, m) => sum + m.cacheHitRate, 0) / recent.length;
  }

  /**
   * Get nested object value by path
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return path.split('.').reduce((current: any, key: string) => current?.[key], obj);
  }

  /**
   * Record performance metric
   */
  private recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only last 1000 metrics to prevent memory growth
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }
}

// Export singleton instance
export const performanceOptimizer = PerformanceOptimizer.getInstance();

// Types are already exported above, no need to re-export