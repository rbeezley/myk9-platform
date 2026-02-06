import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/services/LoggingService';
import { LazyLoadCache, computeLoadState } from '@/hooks/lazyLoadingHelpers';

export interface LazyLoadConfig {
  /** Number of items to load per batch (default: 20) */
  batchSize?: number;
  /** Root margin for intersection observer (default: '100px') */
  rootMargin?: string;
  /** Threshold for triggering load (default: 0.1) */
  threshold?: number;
  /** Enable prefetching of next batch (default: true) */
  prefetch?: boolean;
  /** Cache loaded data (default: true) */
  enableCache?: boolean;
  /** Debug logging (default: false) */
  debug?: boolean;
}

export interface LazyLoadState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  totalCount: number;
  loadedCount: number;
}

export interface LazyDataSource<T> {
  /** Function to fetch a batch of items */
  fetchBatch: (offset: number, limit: number) => Promise<{ items: T[]; totalCount: number }>;
  /** Optional function to get item by ID for prefetching */
  getItemById?: (id: string) => Promise<T | null>;
  /** Cache key for the data source */
  cacheKey: string;
}

const DEFAULT_CONFIG: Required<LazyLoadConfig> = {
  batchSize: 20,
  rootMargin: '100px',
  threshold: 0.1,
  prefetch: true,
  enableCache: true,
  debug: false
};

/**
 * Hook for implementing lazy loading with intersection observer
 */
export function useLazyLoading<T extends { id: string }>(
  dataSource: LazyDataSource<T>,
  config: LazyLoadConfig = {}
) {
  const { batchSize, prefetch, enableCache, debug } = { ...DEFAULT_CONFIG, ...config };

  const [state, setState] = useState<LazyLoadState<T>>({
    items: [],
    loading: false,
    error: null,
    hasMore: true,
    totalCount: 0,
    loadedCount: 0
  });

  const cacheRef = useRef(new LazyLoadCache<T>());
  const loadingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const log = useCallback((message: string, ...args: unknown[]) => {
    if (debug) {
      logger.debug(`[LazyLoading] ${message}`, 'hooks', { args });
    }
  }, [debug]);

  // Prefetch next batch in background
  const schedulePrefetch = useCallback((nextOffset: number, cacheKey: string) => {
    if (cacheRef.current.get(cacheKey)) return;

    setTimeout(async () => {
      try {
        const result = await dataSource.fetchBatch(nextOffset, batchSize);
        if (enableCache) {
          cacheRef.current.set(cacheKey, result.items, result.totalCount);
          log('Prefetched batch for offset:', nextOffset);
        }
      } catch (err) {
        log('Prefetch failed:', err);
      }
    }, 100);
  }, [dataSource, batchSize, enableCache, log]);

  // Load next batch of items
  const loadNextBatch = useCallback(async (reset = false) => {
    if (loadingRef.current || (!state.hasMore && !reset)) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    loadingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));

    const offset = reset ? 0 : state.loadedCount;
    const cacheKey = `${dataSource.cacheKey}-${offset}-${batchSize}`;

    try {
      // Try cache first
      const cached = enableCache ? cacheRef.current.get(cacheKey) : null;
      const result = cached ?? await dataSource.fetchBatch(offset, batchSize);

      if (cached) {
        log('Using cached data for offset:', offset);
      } else if (enableCache) {
        cacheRef.current.set(cacheKey, result.items, result.totalCount);
      }

      const newState = computeLoadState(state.items, result.items, result.totalCount, reset);
      setState({
        ...newState,
        loading: false,
        error: null,
      });

      log('Loaded batch:', result.items.length, 'items. Total loaded:', offset + result.items.length);

      // Prefetch next batch if we have more data
      if (prefetch && (offset + result.items.length) < result.totalCount) {
        schedulePrefetch(offset + batchSize, `${dataSource.cacheKey}-${offset + batchSize}-${batchSize}`);
      }
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') {
        log('Request aborted');
        return;
      }
      log('Load failed:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: (error as Error).message || 'Failed to load data'
      }));
    } finally {
      loadingRef.current = false;
    }
  }, [state.hasMore, state.loadedCount, state.items, dataSource, batchSize, enableCache, prefetch, log, schedulePrefetch]);

  // Refresh data (reload from beginning)
  const refresh = useCallback(() => {
    log('Refreshing data');
    if (enableCache) cacheRef.current.invalidateByPrefix(dataSource.cacheKey);
    loadNextBatch(true);
  }, [loadNextBatch, dataSource.cacheKey, enableCache, log]);

  // Get item by ID (for lazy item details)
  const getItem = useCallback(async (id: string): Promise<T | null> => {
    const existingItem = state.items.find(item => item.id === id);
    if (existingItem) return existingItem;

    if (!dataSource.getItemById) return null;

    try {
      log('Fetching item by ID:', id);
      return await dataSource.getItemById(id);
    } catch (err) {
      log('Failed to fetch item by ID:', err);
      return null;
    }
  }, [state.items, dataSource, log]);

  // Clear cache
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    log('Cache cleared');
  }, [log]);

  // Initial load
  useEffect(() => {
    if (state.items.length === 0 && !loadingRef.current) {
      loadNextBatch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  return {
    // State
    ...state,

    // Actions
    loadMore: () => loadNextBatch(false),
    refresh,
    getItem,
    clearCache,

    // Status
    isEmpty: state.items.length === 0 && !state.loading,
    isInitialLoad: state.items.length === 0 && state.loading,

    // Cache info
    cacheSize: cacheRef.current.size,
    getCacheStats: () => ({
      entries: cacheRef.current.size,
      totalSize: cacheRef.current.totalItemCount,
    })
  };
}
