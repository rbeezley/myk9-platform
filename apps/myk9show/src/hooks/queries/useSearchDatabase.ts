/**
 * Search & Analytics React Query Hooks
 * 
 * Custom hooks for managing search functionality, search history, and analytics data
 * with React Query caching, optimistic updates, and error handling.
 */

import { 
  useQuery, 
  useMutation, 
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions 
} from '@tanstack/react-query';
import {
  SearchHistory,
  SearchAnalytics,
  CreateSearchHistoryData,
  UpdateSearchHistoryData,
  CreateSearchAnalyticsData,
  UpdateSearchAnalyticsData,
  SearchHistoryFilters,
  SearchAnalyticsFilters,
  SearchRequest,
  SearchResponse,
  FullTextSearchRequest,
  FullTextSearchResult,
  SearchSuggestion,
  PopularSearch,
  SearchPerformanceMetrics,
  SearchAnalyticsSummary,
  SearchType,
  SearchPeriod
} from '../../types/search-analytics';
import {
  searchHistoryQueries,
  searchAnalyticsQueries,
  fullTextSearchQueries,
  searchSuggestionQueries,
  searchPerformanceQueries,
  searchAnalyticsOperations
} from '../../services/database/queries/searchQueries';
import { 
  searchHistoryMappers, 
  searchAnalyticsMappers, 
  searchRequestMappers 
} from '../../services/mappers/searchMappers';

// Query Keys
export const searchHistoryKeys = {
  all: ['searchHistory'] as const,
  lists: () => [...searchHistoryKeys.all, 'list'] as const,
  list: (filters: SearchHistoryFilters) => [...searchHistoryKeys.lists(), filters] as const,
  details: () => [...searchHistoryKeys.all, 'detail'] as const,
  detail: (id: string) => [...searchHistoryKeys.details(), id] as const,
  byUser: (userId: string) => [...searchHistoryKeys.all, 'byUser', userId] as const,
  byUserFiltered: (userId: string, filters: SearchHistoryFilters) => 
    [...searchHistoryKeys.byUser(userId), filters] as const,
  recent: (userId: string, limit: number) => [...searchHistoryKeys.all, 'recent', userId, limit] as const,
  terms: (userId: string, limit: number) => [...searchHistoryKeys.all, 'terms', userId, limit] as const
};

export const searchAnalyticsKeys = {
  all: ['searchAnalytics'] as const,
  lists: () => [...searchAnalyticsKeys.all, 'list'] as const,
  list: (filters: SearchAnalyticsFilters) => [...searchAnalyticsKeys.lists(), filters] as const,
  details: () => [...searchAnalyticsKeys.all, 'detail'] as const,
  detail: (id: string) => [...searchAnalyticsKeys.details(), id] as const,
  popular: (type?: SearchType, limit?: number) => [...searchAnalyticsKeys.all, 'popular', type, limit] as const,
  summary: (period: SearchPeriod) => [...searchAnalyticsKeys.all, 'summary', period] as const,
  performance: (period: SearchPeriod) => [...searchAnalyticsKeys.all, 'performance', period] as const
};

export const searchFunctionalityKeys = {
  all: ['searchFunctionality'] as const,
  fullText: (request: FullTextSearchRequest) => [...searchFunctionalityKeys.all, 'fullText', request] as const,
  suggestions: (query: string, type?: SearchType, limit?: number) => 
    [...searchFunctionalityKeys.all, 'suggestions', query, type, limit] as const,
  autocomplete: (query: string, userId?: string, limit?: number) => 
    [...searchFunctionalityKeys.all, 'autocomplete', query, userId, limit] as const
};

// Search History Hooks
export function useSearchHistory(
  userId: string,
  filters?: SearchHistoryFilters,
  options?: Omit<UseQueryOptions<SearchHistory[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: filters ? 
      searchHistoryKeys.byUserFiltered(userId, filters) : 
      searchHistoryKeys.byUser(userId),
    queryFn: () => searchHistoryQueries.getByUserId(userId, filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!userId,
    ...options
  });
}

export function useSearchHistoryItem(
  id: string,
  options?: Omit<UseQueryOptions<SearchHistory | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchHistoryKeys.detail(id),
    queryFn: () => searchHistoryQueries.getById(id),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!id,
    ...options
  });
}

export function useRecentSearches(
  userId: string,
  limit: number = 10,
  options?: Omit<UseQueryOptions<SearchHistory[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchHistoryKeys.recent(userId, limit),
    queryFn: () => searchHistoryQueries.getRecentSearches(userId, limit),
    staleTime: 1 * 60 * 1000, // 1 minute
    enabled: !!userId,
    ...options
  });
}

export function useUniqueSearchTerms(
  userId: string,
  limit: number = 20,
  options?: Omit<UseQueryOptions<string[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchHistoryKeys.terms(userId, limit),
    queryFn: () => searchHistoryQueries.getUniqueSearchTerms(userId, limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!userId,
    ...options
  });
}

export function useCreateSearchHistory(
  options?: UseMutationOptions<SearchHistory, Error, CreateSearchHistoryData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSearchHistoryData) => {
      const errors = searchHistoryMappers.validate(data);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return searchHistoryQueries.create(data);
    },
    onSuccess: (searchHistory) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.byUser(searchHistory.user_id) });
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.recent(searchHistory.user_id, 10) });
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.terms(searchHistory.user_id, 20) });
      
      // Update the cache with the new search history
      queryClient.setQueryData(searchHistoryKeys.detail(searchHistory.id), searchHistory);
    },
    ...options
  });
}

export function useUpdateSearchHistory(
  options?: UseMutationOptions<SearchHistory, Error, UpdateSearchHistoryData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSearchHistoryData) => searchHistoryQueries.update(data),
    onSuccess: (searchHistory) => {
      // Update the cache
      queryClient.setQueryData(searchHistoryKeys.detail(searchHistory.id), searchHistory);
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.byUser(searchHistory.user_id) });
    },
    ...options
  });
}

export function useDeleteSearchHistory(
  options?: UseMutationOptions<void, Error, { id: string; userId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; userId: string }) => searchHistoryQueries.delete(id),
    onSuccess: (_, { id, userId }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: searchHistoryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.byUser(userId) });
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.recent(userId, 10) });
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.terms(userId, 20) });
    },
    ...options
  });
}

// Search Analytics Hooks
export function useSearchAnalytics(
  filters?: SearchAnalyticsFilters,
  options?: Omit<UseQueryOptions<SearchAnalytics[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchAnalyticsKeys.list(filters || {}),
    queryFn: () => searchAnalyticsQueries.getAll(filters),
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...options
  });
}

export function useSearchAnalyticsItem(
  id: string,
  options?: Omit<UseQueryOptions<SearchAnalytics | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchAnalyticsKeys.detail(id),
    queryFn: () => searchAnalyticsQueries.getById(id),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!id,
    ...options
  });
}

export function usePopularSearches(
  searchType?: SearchType,
  limit: number = 20,
  options?: Omit<UseQueryOptions<PopularSearch[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchAnalyticsKeys.popular(searchType, limit),
    queryFn: () => searchAnalyticsQueries.getPopularSearches(searchType, limit),
    staleTime: 15 * 60 * 1000, // 15 minutes
    ...options
  });
}

export function useSearchAnalyticsSummary(
  period: SearchPeriod = 'last_month',
  options?: Omit<UseQueryOptions<SearchAnalyticsSummary>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchAnalyticsKeys.summary(period),
    queryFn: () => searchAnalyticsOperations.getAnalyticsSummary(period),
    staleTime: 30 * 60 * 1000, // 30 minutes
    ...options
  });
}

export function useSearchPerformanceMetrics(
  period: SearchPeriod = 'last_month',
  options?: Omit<UseQueryOptions<SearchPerformanceMetrics>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchAnalyticsKeys.performance(period),
    queryFn: () => searchPerformanceQueries.getPerformanceMetrics(period),
    staleTime: 20 * 60 * 1000, // 20 minutes
    ...options
  });
}

export function useCreateSearchAnalytics(
  options?: UseMutationOptions<SearchAnalytics, Error, CreateSearchAnalyticsData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSearchAnalyticsData) => {
      const errors = searchAnalyticsMappers.validate(data);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return searchAnalyticsQueries.create(data);
    },
    onSuccess: (analytics) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: searchAnalyticsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: searchAnalyticsKeys.popular() });
      
      // Update the cache with the new analytics
      queryClient.setQueryData(searchAnalyticsKeys.detail(analytics.id), analytics);
    },
    ...options
  });
}

export function useUpdateSearchAnalytics(
  options?: UseMutationOptions<SearchAnalytics, Error, UpdateSearchAnalyticsData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSearchAnalyticsData) => {
      // Note: Validation would need to be adapted for update data
      return searchAnalyticsQueries.update(data);
    },
    onSuccess: (analytics) => {
      // Update the cache
      queryClient.setQueryData(searchAnalyticsKeys.detail(analytics.id), analytics);
      queryClient.invalidateQueries({ queryKey: searchAnalyticsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: searchAnalyticsKeys.popular() });
    },
    ...options
  });
}

export function useUpsertSearchAnalytics(
  options?: UseMutationOptions<SearchAnalytics, Error, CreateSearchAnalyticsData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSearchAnalyticsData) => {
      const errors = searchAnalyticsMappers.validate(data);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return searchAnalyticsQueries.upsert(data);
    },
    onSuccess: (analytics) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: searchAnalyticsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: searchAnalyticsKeys.popular() });
      
      // Update the cache
      queryClient.setQueryData(searchAnalyticsKeys.detail(analytics.id), analytics);
    },
    ...options
  });
}

export function useAggregateSearchAnalytics(
  options?: UseMutationOptions<void, Error, void>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => searchAnalyticsQueries.aggregateSearchHistory(),
    onSuccess: () => {
      // Invalidate all analytics queries to refresh with new aggregated data
      queryClient.invalidateQueries({ queryKey: searchAnalyticsKeys.all });
    },
    ...options
  });
}

// Search Functionality Hooks
export function useFullTextSearch(
  request: FullTextSearchRequest,
  options?: Omit<UseQueryOptions<FullTextSearchResult[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchFunctionalityKeys.fullText(request),
    queryFn: () => {
      const errors = searchRequestMappers.validateFullTextSearchRequest(request);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return fullTextSearchQueries.search(request);
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    enabled: !!(request.query && request.tables?.length > 0),
    ...options
  });
}

export function useSearchSuggestions(
  query: string,
  searchType?: SearchType,
  limit: number = 10,
  options?: Omit<UseQueryOptions<SearchSuggestion[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchFunctionalityKeys.suggestions(query, searchType, limit),
    queryFn: () => searchSuggestionQueries.getSuggestions(query, searchType, limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!(query && query.length >= 2),
    ...options
  });
}

export function useAutocompleteSuggestions(
  query: string,
  userId?: string,
  limit: number = 5,
  options?: Omit<UseQueryOptions<string[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: searchFunctionalityKeys.autocomplete(query, userId, limit),
    queryFn: () => searchSuggestionQueries.getAutocompleteSuggestions(query, userId, limit),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!(query && query.length >= 1),
    ...options
  });
}

// Batch Operations
export function useBatchCreateSearchHistory(
  options?: UseMutationOptions<SearchHistory[], Error, CreateSearchHistoryData[]>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entries: CreateSearchHistoryData[]) => {
      // Validate all entries
      for (const entry of entries) {
        const errors = searchHistoryMappers.validate(entry);
        if (errors.length > 0) {
          throw new Error(`Validation failed for entry: ${errors.join(', ')}`);
        }
      }
      return searchHistoryQueries.batchCreate(entries);
    },
    onSuccess: (searchHistories) => {
      // Invalidate queries for all affected users
      const affectedUsers = [...new Set(searchHistories.map(sh => sh.user_id))];
      affectedUsers.forEach(userId => {
        queryClient.invalidateQueries({ queryKey: searchHistoryKeys.byUser(userId) });
        queryClient.invalidateQueries({ queryKey: searchHistoryKeys.recent(userId, 10) });
        queryClient.invalidateQueries({ queryKey: searchHistoryKeys.terms(userId, 20) });
      });
    },
    ...options
  });
}

// Combined Search Operations
export function useSearchWithTracking() {
  const createSearchHistory = useCreateSearchHistory();
  const updateSearchHistory = useUpdateSearchHistory();
  const upsertAnalytics = useUpsertSearchAnalytics();

  return {
    // Perform a search and track it
    executeSearch: async <T>(
      searchRequest: SearchRequest,
      userId: string,
      searchFunction: (request: SearchRequest) => Promise<SearchResponse<T>>
    ): Promise<SearchResponse<T>> => {
      const startTime = Date.now();
      
      try {
        // Validate search request
        const validationErrors = searchRequestMappers.validateSearchRequest(searchRequest);
        if (validationErrors.length > 0) {
          throw new Error(`Invalid search request: ${validationErrors.join(', ')}`);
        }

        // Execute the actual search
        const response = await searchFunction(searchRequest);
        const searchDuration = Date.now() - startTime;

        // Create search history entry
        const historyData = searchHistoryMappers.fromSearchRequest(
          searchRequest,
          userId,
          { ...response, search_time_ms: searchDuration }
        );

        await createSearchHistory.mutateAsync(historyData);

        // Update analytics (fire and forget)
        const analyticsData: CreateSearchAnalyticsData = {
          search_term: searchRequest.query,
          search_type: searchRequest.type,
          total_searches: 1,
          successful_searches: response.total_count > 0 ? 1 : 0,
          success_rate: response.total_count > 0 ? 1 : 0,
          avg_results_count: response.total_count,
          avg_search_duration_ms: searchDuration,
          first_searched_at: new Date().toISOString(),
          last_searched_at: new Date().toISOString(),
          last_aggregated_at: new Date().toISOString()
        };

        upsertAnalytics.mutate(analyticsData);

        return response;
      } catch (error) {
        // Track failed search
        const searchDuration = Date.now() - startTime;
        const historyData: CreateSearchHistoryData = {
          user_id: userId,
          search_term: searchRequest.query,
          search_type: searchRequest.type,
          search_context: searchRequest.context,
          results_count: 0,
          results_found: false,
          search_filters: searchRequest.filters,
          search_sort: searchRequest.sort,
          search_duration_ms: searchDuration,
          session_id: searchRequest.session_id
        };

        await createSearchHistory.mutateAsync(historyData);

        throw error;
      }
    },

    // Track click on search result
    trackResultClick: async (searchHistoryId: string, resultId: string, position: number) => {
      const updateData: UpdateSearchHistoryData = {
        id: searchHistoryId,
        clicked_result_id: resultId,
        clicked_result_position: position
      };

      return updateSearchHistory.mutateAsync(updateData);
    }
  };
}

// Utility Hooks
export function useInvalidateSearchData() {
  const queryClient = useQueryClient();

  return {
    invalidateHistory: (userId?: string) => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: searchHistoryKeys.byUser(userId) });
      } else {
        queryClient.invalidateQueries({ queryKey: searchHistoryKeys.all });
      }
    },
    
    invalidateAnalytics: () => {
      queryClient.invalidateQueries({ queryKey: searchAnalyticsKeys.all });
    },
    
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: searchHistoryKeys.all });
      queryClient.invalidateQueries({ queryKey: searchAnalyticsKeys.all });
      queryClient.invalidateQueries({ queryKey: searchFunctionalityKeys.all });
    }
  };
}

export function usePrefetchSearchData() {
  const queryClient = useQueryClient();

  return {
    prefetchPopularSearches: (searchType?: SearchType) => {
      queryClient.prefetchQuery({
        queryKey: searchAnalyticsKeys.popular(searchType, 20),
        queryFn: () => searchAnalyticsQueries.getPopularSearches(searchType, 20),
        staleTime: 15 * 60 * 1000
      });
    },
    
    prefetchUserHistory: (userId: string) => {
      queryClient.prefetchQuery({
        queryKey: searchHistoryKeys.recent(userId, 10),
        queryFn: () => searchHistoryQueries.getRecentSearches(userId, 10),
        staleTime: 1 * 60 * 1000
      });
    },
    
    prefetchAnalyticsSummary: (period: SearchPeriod = 'last_month') => {
      queryClient.prefetchQuery({
        queryKey: searchAnalyticsKeys.summary(period),
        queryFn: () => searchAnalyticsOperations.getAnalyticsSummary(period),
        staleTime: 30 * 60 * 1000
      });
    }
  };
}