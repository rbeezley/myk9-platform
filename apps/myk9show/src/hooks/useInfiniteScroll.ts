import { useState, useCallback, useRef, useEffect } from 'react';
// useIntersectionObserver import removed - not used in this hook

export interface InfiniteScrollConfig {
  /** Initial page size (default: 100) */
  pageSize?: number;
  /** Threshold for triggering next load (default: 0.1) */
  threshold?: number;
  /** Root margin for intersection observer (default: '200px') */
  rootMargin?: string;
  /** Enable prefetching of next page (default: true) */
  prefetch?: boolean;
  /** Cache pages for performance (default: true) */
  enableCache?: boolean;
  /** Maximum number of cached pages (default: 10) */
  maxCachedPages?: number;
  /** Auto-retry failed loads (default: true) */
  autoRetry?: boolean;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Debug logging (default: false) */
  debug?: boolean;
}

export interface PageData<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface LoadPage<T> {
  (page: number, pageSize: number): Promise<PageData<T>>;
}

export interface InfiniteScrollState<T> {
  items: T[];
  pages: Map<number, PageData<T>>;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  retryCount: number;
}

const DEFAULT_CONFIG: Required<InfiniteScrollConfig> = {
  pageSize: 100,
  threshold: 0.1,
  rootMargin: '200px',
  prefetch: true,
  enableCache: true,
  maxCachedPages: 10,
  autoRetry: true,
  maxRetries: 3,
  debug: false
};

/**
 * Hook for implementing infinite scroll with advanced pagination
 */
export function useInfiniteScroll<T extends { id: string }>(
  loadPage: LoadPage<T>,
  config: InfiniteScrollConfig = {}
) {
  const {
    pageSize,
    prefetch,
    enableCache,
    maxCachedPages,
    autoRetry,
    maxRetries,
    debug
  } = { ...DEFAULT_CONFIG, ...config };

  const [state, setState] = useState<InfiniteScrollState<T>>({
    items: [],
    pages: new Map(),
    currentPage: 0,
    totalPages: 0,
    totalCount: 0,
    loading: false,
    error: null,
    hasMore: true,
    retryCount: 0
  });

  const loadingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const log = useCallback((message: string, ...args: unknown[]) => {
    if (debug) {
      console.log(`[InfiniteScroll] ${message}`, ...args);
    }
  }, [debug]);

  // Load a specific page
  const loadPageData = useCallback(async (pageNumber: number, isRetry = false) => {
    if (loadingRef.current && !isRetry) return null;

    // Check cache first
    if (enableCache && state.pages.has(pageNumber)) {
      log('Using cached page:', pageNumber);
      return state.pages.get(pageNumber)!;
    }

    loadingRef.current = true;
    
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState(prev => ({ 
      ...prev, 
      loading: true, 
      error: null,
      retryCount: isRetry ? prev.retryCount + 1 : 0
    }));

    try {
      log('Loading page:', pageNumber, 'pageSize:', pageSize);
      const pageData = await loadPage(pageNumber, pageSize);

      // Cache the page
      if (enableCache) {
        setState(prev => {
          const newPages = new Map(prev.pages);
          
          // Remove oldest pages if cache is full
          if (newPages.size >= maxCachedPages) {
            const oldestKey = Math.min(...Array.from(newPages.keys()));
            newPages.delete(oldestKey);
          }
          
          newPages.set(pageNumber, pageData);
          
          return { ...prev, pages: newPages };
        });
      }

      log('Loaded page:', pageNumber, 'items:', pageData.items.length);
      return pageData;

    } catch (error: unknown) {
      const errorObj = error as Error;
      if (errorObj?.name === 'AbortError') {
        log('Page load aborted:', pageNumber);
        return null;
      }

      const errorMessage = errorObj?.message || 'Unknown error';
      log('Page load failed:', pageNumber, errorMessage);
      
      // Auto-retry logic
      if (autoRetry && state.retryCount < maxRetries) {
        log('Retrying page load:', pageNumber, 'attempt:', state.retryCount + 1);
        setTimeout(() => {
          loadPageData(pageNumber, true);
        }, Math.pow(2, state.retryCount) * 1000); // Exponential backoff
        return null;
      }

      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage || `Failed to load page ${pageNumber}`
      }));
      
      return null;
    } finally {
      loadingRef.current = false;
    }
  }, [loadPage, pageSize, enableCache, maxCachedPages, autoRetry, maxRetries, state.pages, state.retryCount, log]);

  // Load next page and append to items
  const loadNextPage = useCallback(async () => {
    if (!state.hasMore || loadingRef.current) return;

    const nextPage = state.currentPage + 1;
    const pageData = await loadPageData(nextPage);
    
    if (pageData) {
      setState(prev => {
        const newItems = [...prev.items, ...pageData.items];
        
        return {
          ...prev,
          items: newItems,
          currentPage: nextPage,
          totalPages: pageData.totalPages,
          totalCount: pageData.totalCount,
          hasMore: pageData.hasNextPage,
          loading: false,
          error: null,
          retryCount: 0
        };
      });

      // Prefetch next page if enabled
      if (prefetch && pageData.hasNextPage) {
        if (prefetchTimeoutRef.current) {
          clearTimeout(prefetchTimeoutRef.current);
        }
        
        prefetchTimeoutRef.current = setTimeout(() => {
          loadPageData(nextPage + 1);
        }, 500);
      }
    }
  }, [state.hasMore, state.currentPage, loadPageData, prefetch]);

  // Reset pagination (reload from beginning)
  const reset = useCallback(() => {
    log('Resetting infinite scroll');
    
    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Clear prefetch timeout
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
    }

    setState({
      items: [],
      pages: new Map(),
      currentPage: 0,
      totalPages: 0,
      totalCount: 0,
      loading: false,
      error: null,
      hasMore: true,
      retryCount: 0
    });

    loadingRef.current = false;
  }, [log]);

  // Go to specific page (for pagination controls)
  const goToPage = useCallback(async (pageNumber: number) => {
    if (pageNumber < 1) return;

    const pageData = await loadPageData(pageNumber);
    
    if (pageData) {
      setState(prev => ({
        ...prev,
        items: pageData.items,
        currentPage: pageNumber,
        totalPages: pageData.totalPages,
        totalCount: pageData.totalCount,
        hasMore: pageData.hasNextPage,
        loading: false,
        error: null,
        retryCount: 0
      }));
    }
  }, [loadPageData]);

  // Load initial page
  useEffect(() => {
    if (state.items.length === 0 && !loadingRef.current) {
      loadNextPage();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    items: state.items,
    loading: state.loading,
    error: state.error,
    hasMore: state.hasMore,
    currentPage: state.currentPage,
    totalPages: state.totalPages,
    totalCount: state.totalCount,
    
    // Actions
    loadMore: loadNextPage,
    reset,
    goToPage,
    retry: () => loadPageData(state.currentPage + 1),
    
    // Status
    isEmpty: state.items.length === 0 && !state.loading,
    isInitialLoad: state.items.length === 0 && state.loading,
    loadedPages: state.pages.size,
    
    // Cache stats
    getCacheStats: () => ({
      cachedPages: state.pages.size,
      totalCachedItems: Array.from(state.pages.values()).reduce(
        (sum, page) => sum + page.items.length, 0
      )
    })
  };
}

// InfiniteScrollTrigger component moved to separate .tsx file