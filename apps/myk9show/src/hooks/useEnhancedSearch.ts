import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDebounce } from '@myk9/scoring-ui';
import { useRecentSearches } from './useRecentSearches';
import { useSearchCache, UseSearchOptions, SearchResult } from '@/lib/searchCache';
import { useSearchAnalytics } from '@/lib/searchCache';
import { logger } from '@/services/LoggingService';

export interface EnhancedSearchOptions extends UseSearchOptions {
  enableRecentSearches?: boolean;
  enableAnalytics?: boolean;
  debounceMs?: number;
  minQueryLength?: number;
  prefetchRelated?: boolean;
}

export interface EnhancedSearchResult<T> {
  // Search state
  query: string;
  isSearching: boolean;
  error: Error | null;
  
  // Results
  results: SearchResult<T> | null;
  items: T[];
  totalCount: number;
  hasMore: boolean;
  
  // Performance
  responseTime: number;
  cacheHit: boolean;
  
  // Recent searches
  recentSearches: ReturnType<typeof useRecentSearches>['recentSearches'];
  suggestions: ReturnType<typeof useRecentSearches>['recentSearches'];
  
  // Actions
  search: (newQuery: string, additionalFilters?: Record<string, unknown>) => void;
  clearSearch: () => void;
  selectSuggestion: (suggestion: string) => void;
  loadMore: () => void;
  
  // Cache management
  invalidateCache: () => void;
  prefetchSearch: (searchQuery: string, filters?: Record<string, unknown>) => Promise<void>;
}

export function useEnhancedSearch<T = unknown>(
  searchHook: (options: UseSearchOptions) => {
    data: SearchResult<T> | undefined;
    isFetching: boolean;
    error: Error | null;
    isFetched: boolean;
    isPreviousData: boolean;
  },
  options: EnhancedSearchOptions
): EnhancedSearchResult<T> {
  const {
    context,
    enableRecentSearches = true,
    enableAnalytics = true,
    debounceMs = 300,
    minQueryLength = 1,
    prefetchRelated = false,
    ...searchOptions
  } = options;

  // State
  const [query, setQuery] = useState(options.query || '');
  const [filters, setFilters] = useState(options.filters || {});
  const [responseTime, setResponseTime] = useState(0);

  // Debounced query
  const debouncedQuery = useDebounce(query, debounceMs);

  // Recent searches - always call the hook
  const recentSearchesHook = useRecentSearches({ context });
  const recentSearches = enableRecentSearches
    ? recentSearchesHook
    : {
        recentSearches: [],
        addSearch: () => {},
        getSuggestions: () => [],
        removeSearch: () => {},
        clearSearches: () => {},
        getFrequentSearches: () => []
      };

  // Search cache utilities
  const { prefetchSearch, invalidateSearches } = useSearchCache();

  // Search analytics - always call the hook
  const searchAnalyticsHook = useSearchAnalytics();
  const { logSearch } = enableAnalytics ? searchAnalyticsHook : { logSearch: () => {} };

  // Prepare search options
  const searchParams: UseSearchOptions = useMemo(() => ({
    ...searchOptions,
    query: debouncedQuery,
    filters,
    context,
    enabled: debouncedQuery.length >= minQueryLength
  }), [debouncedQuery, filters, context, minQueryLength, searchOptions]);

  // Execute search with the provided hook
  const searchQuery = searchHook(searchParams);

  // Track search timing using refs to avoid setState in effect body
  const prevIsFetchingRef = useRef(searchQuery.isFetching);
  const prevDataRef = useRef(searchQuery.data);
  const searchStartTimeRef = useRef(0);

  // Track timing state changes via useEffect - use ref for start time
  useEffect(() => {
    // Start timing when fetch begins - use ref to track
    const wasNotFetching = !prevIsFetchingRef.current;
    const isNowFetching = searchQuery.isFetching && !searchQuery.isPreviousData;

    if (isNowFetching && wasNotFetching) {
      searchStartTimeRef.current = Date.now();
    }
    prevIsFetchingRef.current = searchQuery.isFetching;
  }, [searchQuery.isFetching, searchQuery.isPreviousData]);

  // Handle search completion via useEffect
  useEffect(() => {
    if (searchQuery.data !== prevDataRef.current && searchQuery.data && !searchQuery.isFetching) {
      prevDataRef.current = searchQuery.data;

      if (searchStartTimeRef.current > 0) {
        const endTime = Date.now();
        const duration = endTime - searchStartTimeRef.current;
        setResponseTime(duration);
        searchStartTimeRef.current = 0; // Reset for next search

        // Log analytics
        if (enableAnalytics && debouncedQuery.trim()) {
          logSearch({
            query: debouncedQuery,
            context,
            resultCount: searchQuery.data?.totalCount || 0,
            responseTime: duration,
            cacheHit: !searchQuery.isFetched,
            timestamp: endTime
          });
        }

        // Add to recent searches
        if (enableRecentSearches && debouncedQuery.trim()) {
          recentSearchesHook.addSearch(debouncedQuery, {
            resultCount: searchQuery.data?.totalCount || 0,
            filters
          });
        }
      }
    }
  }, [searchQuery.data, searchQuery.isFetching, enableAnalytics, debouncedQuery, context, searchQuery.isFetched, logSearch, enableRecentSearches, recentSearchesHook, filters]);

  // Prefetch related searches
  useEffect(() => {
    if (prefetchRelated && debouncedQuery.length >= 3) {
      // Prefetch searches with common modifications
      const prefetchQueries = [
        debouncedQuery + 's', // plural
        debouncedQuery.slice(0, -1), // singular
        debouncedQuery + ' dog',
        debouncedQuery + ' puppy'
      ];

      prefetchQueries.forEach(prefetchQuery => {
        if (prefetchQuery !== debouncedQuery) {
          prefetchSearch({
            ...searchParams,
            query: prefetchQuery
          }).catch(() => {}); // Ignore prefetch errors
        }
      });
    }
  }, [debouncedQuery, prefetchRelated, prefetchSearch, searchParams]);

  // Search actions
  const search = useCallback((newQuery: string, additionalFilters?: Record<string, unknown>) => {
    setQuery(newQuery);
    if (additionalFilters) {
      setFilters(prev => ({ ...prev, ...additionalFilters }));
    }
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setFilters({});
  }, []);

  const selectSuggestion = useCallback((suggestion: string) => {
    setQuery(suggestion);
  }, []);

  const loadMore = useCallback(() => {
    // Implementation for pagination would go here
    logger.debug('Load more not implemented yet', 'hooks', {});
  }, []);

  const invalidateCache = useCallback(() => {
    invalidateSearches(context);
  }, [invalidateSearches, context]);

  const prefetchSearchAction = useCallback(async (searchQuery: string, prefetchFilters?: Record<string, unknown>) => {
    await prefetchSearch({
      ...searchParams,
      query: searchQuery,
      filters: prefetchFilters || filters
    });
  }, [prefetchSearch, searchParams, filters]);

  // Get suggestions
  const suggestions = useMemo(() => {
    return enableRecentSearches ? recentSearchesHook.getSuggestions(query, 5) : [];
  }, [enableRecentSearches, recentSearchesHook, query]);

  // Check if result came from cache
  const cacheHit = useMemo(() => {
    if (!searchQuery.data || searchQuery.isFetching) return false;
    return !searchQuery.isFetched;
  }, [searchQuery.data, searchQuery.isFetching, searchQuery.isFetched]);

  return {
    // Search state
    query,
    isSearching: searchQuery.isFetching,
    error: searchQuery.error as Error | null,

    // Results
    results: searchQuery.data ?? null,
    items: searchQuery.data?.items ?? [],
    totalCount: searchQuery.data?.totalCount ?? 0,
    hasMore: false, // TODO: Implement pagination

    // Performance
    responseTime,
    cacheHit,

    // Recent searches
    recentSearches: recentSearches.recentSearches,
    suggestions,

    // Actions
    search,
    clearSearch,
    selectSuggestion,
    loadMore,

    // Cache management
    invalidateCache,
    prefetchSearch: prefetchSearchAction
  };
}

// Specialized hooks for different entity types
export const useEnhancedDogSearch = (options: Omit<EnhancedSearchOptions, 'context'>) => {
  // This would import the actual search hook when implemented
  const searchHook = (): {
    data: SearchResult<unknown> | undefined;
    isFetching: boolean;
    error: Error | null;
    isFetched: boolean;
    isPreviousData: boolean;
  } => ({
    data: undefined,
    isFetching: false,
    error: null,
    isFetched: false,
    isPreviousData: false
  });

  return useEnhancedSearch(searchHook, { ...options, context: 'dogs' });
};

export const useEnhancedPeopleSearch = (options: Omit<EnhancedSearchOptions, 'context'>) => {
  const searchHook = (): {
    data: SearchResult<unknown> | undefined;
    isFetching: boolean;
    error: Error | null;
    isFetched: boolean;
    isPreviousData: boolean;
  } => ({
    data: undefined,
    isFetching: false,
    error: null,
    isFetched: false,
    isPreviousData: false
  });

  return useEnhancedSearch(searchHook, { ...options, context: 'people' });
};

export const useEnhancedShowSearch = (options: Omit<EnhancedSearchOptions, 'context'>) => {
  const searchHook = (): {
    data: SearchResult<unknown> | undefined;
    isFetching: boolean;
    error: Error | null;
    isFetched: boolean;
    isPreviousData: boolean;
  } => ({
    data: undefined,
    isFetching: false,
    error: null,
    isFetched: false,
    isPreviousData: false
  });

  return useEnhancedSearch(searchHook, { ...options, context: 'shows' });
};