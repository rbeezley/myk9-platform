/**
 * Search & Analytics System Integration Tests
 * 
 * Comprehensive test suite for search functionality, search history tracking,
 * analytics aggregation, and performance monitoring.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '@/services/LoggingService';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Import the hooks and services we're testing
import {
  useSearchHistory,
  useSearchAnalytics,
  useCreateSearchHistory,
  useUpdateSearchHistory,
  useDeleteSearchHistory,
  usePopularSearches,
  useSearchSuggestions,
  useFullTextSearch,
  useSearchWithTracking,
  useSearchPerformanceMetrics
} from '../../hooks/queries/useSearchDatabase';

import {
  searchHistoryQueries,
  searchAnalyticsQueries,
  fullTextSearchQueries,
  searchSuggestionQueries,
  searchPerformanceQueries
} from '../../services/database/queries/searchQueries';

import {
  searchHistoryMappers,
  searchAnalyticsMappers,
  searchRequestMappers,
  searchResultMappers,
  searchUtils
} from '../../services/mappers/searchMappers';

import {
  SearchHistory,
  SearchAnalytics,
  CreateSearchHistoryData,
  CreateSearchAnalyticsData,
  SearchRequest,
  SearchResponse,
  FullTextSearchRequest,
  SearchType,
  SearchPeriod
} from '../../types/search-analytics';

// Mock Supabase client
vi.mock('../../services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      upsert: vi.fn().mockReturnThis(),
      rpc: vi.fn()
    }))
  }
}));

// Test data

const mockSearchHistory: SearchHistory = {
  id: 'search-history-123',
  user_id: 'user-123',
  search_term: 'golden retriever',
  search_type: 'dogs' as SearchType,
  search_context: 'list_view',
  results_count: 15,
  results_found: true,
  search_filters: { breed: 'Golden Retriever' },
  search_sort: { field: 'name', direction: 'asc' },
  search_duration_ms: 145,
  clicked_result_id: 'dog-456',
  clicked_result_position: 2,
  session_id: 'session-789',
  created_at: '2024-01-15T10:30:00Z'
};

const mockSearchAnalytics: SearchAnalytics = {
  id: 'analytics-123',
  search_term: 'golden retriever',
  search_type: 'dogs' as SearchType,
  frequency: 25,
  success_rate: 0.92,
  avg_results_count: 18.5,
  avg_click_position: 2.1,
  avg_search_duration_ms: 167,
  total_searches: 25,
  successful_searches: 23,
  first_searched_at: '2024-01-01T00:00:00Z',
  last_searched_at: '2024-01-15T10:30:00Z',
  last_aggregated_at: '2024-01-15T11:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T11:00:00Z'
};

const mockCreateSearchHistoryData: CreateSearchHistoryData = {
  user_id: 'user-123',
  search_term: 'labrador',
  search_type: 'dogs',
  search_context: 'quick_search',
  results_count: 8,
  results_found: true,
  search_duration_ms: 98,
  session_id: 'session-789'
};

const mockCreateSearchAnalyticsData: CreateSearchAnalyticsData = {
  search_term: 'labrador',
  search_type: 'dogs',
  frequency: 1,
  success_rate: 1.0,
  avg_results_count: 8,
  avg_search_duration_ms: 98,
  total_searches: 1,
  successful_searches: 1,
  first_searched_at: '2024-01-15T12:00:00Z',
  last_searched_at: '2024-01-15T12:00:00Z'
};

const mockSearchRequest: SearchRequest = {
  query: 'golden retriever',
  type: 'dogs',
  context: 'list_view',
  filters: { breed: 'Golden Retriever' },
  sort: { field: 'name', direction: 'asc' },
  pagination: { page: 1, per_page: 20 },
  session_id: 'session-789'
};

const mockSearchResponse: SearchResponse = {
  results: [
    {
      id: 'dog-456',
      type: 'dogs',
      title: 'Buddy - Golden Retriever',
      description: 'Male, 3 years old, AKC registered',
      data: { id: 'dog-456', name: 'Buddy', breed: 'Golden Retriever' },
      relevance_score: 9.5
    }
  ],
  total_count: 15,
  search_time_ms: 145,
  query: 'golden retriever',
  search_type: 'dogs',
  filters_applied: { breed: 'Golden Retriever' },
  sort_applied: { field: 'name', direction: 'asc' },
  pagination: {
    page: 1,
    per_page: 20,
    total_pages: 1,
    has_next: false,
    has_previous: false
  },
  suggestions: ['golden retriever puppy', 'golden retriever training']
};

const mockFullTextSearchRequest: FullTextSearchRequest = {
  query: 'golden',
  tables: ['dog', 'user', 'show'],
  weights: { dog: 1.5, user: 1.0, show: 0.8 },
  max_results: 50,
  min_relevance: 2.0
};

// Test wrapper
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('Search System Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Search History Operations', () => {
    it('should create search history entry successfully', async () => {
      // Mock the database call
      vi.mocked(searchHistoryQueries.create).mockResolvedValue(mockSearchHistory);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useCreateSearchHistory(), { wrapper });

      await waitFor(async () => {
        const newHistory = await result.current.mutateAsync(mockCreateSearchHistoryData);
        expect(newHistory).toEqual(mockSearchHistory);
      });

      expect(searchHistoryQueries.create).toHaveBeenCalledWith(mockCreateSearchHistoryData);
    });

    it('should validate search history data before creation', async () => {
      const invalidData = {
        ...mockCreateSearchHistoryData,
        user_id: '', // Invalid: empty user_id
        search_term: '', // Invalid: empty search_term
        search_type: 'invalid_type' // Invalid: not in enum
      };

      const wrapper = createWrapper();
      const { result } = renderHook(() => useCreateSearchHistory(), { wrapper });

      await waitFor(async () => {
        await expect(result.current.mutateAsync(invalidData as CreateSearchHistoryData))
          .rejects.toThrow('Validation failed');
      });

      expect(searchHistoryQueries.create).not.toHaveBeenCalled();
    });

    it('should fetch search history for user with filters', async () => {
      const mockHistoryArray = [mockSearchHistory];
      vi.mocked(searchHistoryQueries.getByUserId).mockResolvedValue(mockHistoryArray);

      const wrapper = createWrapper();
      const filters = { search_type: 'dogs' as SearchType, results_found: true };
      
      const { result } = renderHook(
        () => useSearchHistory('user-123', filters),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual(mockHistoryArray);
      });

      expect(searchHistoryQueries.getByUserId).toHaveBeenCalledWith('user-123', filters);
    });

    it('should update search history with click tracking', async () => {
      const updatedHistory = {
        ...mockSearchHistory,
        clicked_result_id: 'dog-789',
        clicked_result_position: 1
      };

      vi.mocked(searchHistoryQueries.update).mockResolvedValue(updatedHistory);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useUpdateSearchHistory(), { wrapper });

      const updateData = {
        id: 'search-history-123',
        clicked_result_id: 'dog-789',
        clicked_result_position: 1
      };

      await waitFor(async () => {
        const updated = await result.current.mutateAsync(updateData);
        expect(updated).toEqual(updatedHistory);
      });

      expect(searchHistoryQueries.update).toHaveBeenCalledWith(updateData);
    });

    it('should delete search history entry', async () => {
      vi.mocked(searchHistoryQueries.delete).mockResolvedValue();

      const wrapper = createWrapper();
      const { result } = renderHook(() => useDeleteSearchHistory(), { wrapper });

      await waitFor(async () => {
        await result.current.mutateAsync({ id: 'search-history-123', userId: 'user-123' });
      });

      expect(searchHistoryQueries.delete).toHaveBeenCalledWith('search-history-123');
    });
  });

  describe('Search Analytics Operations', () => {
    it('should fetch search analytics with filters', async () => {
      const mockAnalyticsArray = [mockSearchAnalytics];
      vi.mocked(searchAnalyticsQueries.getAll).mockResolvedValue(mockAnalyticsArray);

      const wrapper = createWrapper();
      const filters = { search_type: 'dogs' as SearchType, min_frequency: 10 };
      
      const { result } = renderHook(
        () => useSearchAnalytics(filters),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual(mockAnalyticsArray);
      });

      expect(searchAnalyticsQueries.getAll).toHaveBeenCalledWith(filters);
    });

    it('should fetch popular searches', async () => {
      const mockPopularSearches = [
        {
          search_term: 'golden retriever',
          search_type: 'dogs' as SearchType,
          frequency: 25,
          success_rate: 0.92,
          trend: 'up' as const,
          period: 'last_month' as SearchPeriod
        }
      ];

      vi.mocked(searchAnalyticsQueries.getPopularSearches).mockResolvedValue(mockPopularSearches);

      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePopularSearches('dogs', 10),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual(mockPopularSearches);
      });

      expect(searchAnalyticsQueries.getPopularSearches).toHaveBeenCalledWith('dogs', 10);
    });

    it('should get search performance metrics', async () => {
      const mockMetrics = {
        avg_search_duration_ms: 167,
        total_searches: 1250,
        successful_searches: 1140,
        success_rate: 0.912,
        popular_terms: [],
        slow_queries: [],
        failed_searches: [],
        search_trends: []
      };

      vi.mocked(searchPerformanceQueries.getPerformanceMetrics).mockResolvedValue(mockMetrics);

      const wrapper = createWrapper();
      const { result } = renderHook(
        () => useSearchPerformanceMetrics('last_month'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual(mockMetrics);
      });

      expect(searchPerformanceQueries.getPerformanceMetrics).toHaveBeenCalledWith('last_month');
    });
  });

  describe('Search Functionality', () => {
    it('should perform full-text search across multiple tables', async () => {
      const mockResults = [
        {
          table: 'dog' as const,
          id: 'dog-123',
          title: 'Golden Retriever',
          content: 'Beautiful golden retriever, 3 years old',
          relevance_score: 8.5,
          highlighted_content: 'Beautiful <mark>golden</mark> retriever, 3 years old',
          data: { id: 'dog-123', name: 'Buddy', breed: 'Golden Retriever' }
        }
      ];

      vi.mocked(fullTextSearchQueries.search).mockResolvedValue(mockResults);

      const wrapper = createWrapper();
      const { result } = renderHook(
        () => useFullTextSearch(mockFullTextSearchRequest),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual(mockResults);
      });

      expect(fullTextSearchQueries.search).toHaveBeenCalledWith(mockFullTextSearchRequest);
    });

    it('should validate full-text search request', async () => {
      const invalidRequest = {
        ...mockFullTextSearchRequest,
        query: '', // Invalid: empty query
        tables: [] // Invalid: no tables specified
      };

      const wrapper = createWrapper();
      const { result } = renderHook(
        () => useFullTextSearch(invalidRequest as FullTextSearchRequest),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
        expect(result.current.error?.message).toContain('Validation failed');
      });

      expect(fullTextSearchQueries.search).not.toHaveBeenCalled();
    });

    it('should get search suggestions', async () => {
      const mockSuggestions = [
        {
          suggestion: 'golden retriever',
          type: 'dogs' as SearchType,
          frequency: 25,
          success_rate: 0.92
        },
        {
          suggestion: 'golden retriever puppy',
          type: 'dogs' as SearchType,
          frequency: 12,
          success_rate: 0.85
        }
      ];

      vi.mocked(searchSuggestionQueries.getSuggestions).mockResolvedValue(mockSuggestions);

      const wrapper = createWrapper();
      const { result } = renderHook(
        () => useSearchSuggestions('golden', 'dogs', 10),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.data).toEqual(mockSuggestions);
      });

      expect(searchSuggestionQueries.getSuggestions).toHaveBeenCalledWith('golden', 'dogs', 10);
    });
  });

  describe('Search with Tracking', () => {
    it('should execute search and track history', async () => {
      // Mock the search function
      const mockSearchFunction = vi.fn().mockResolvedValue(mockSearchResponse);
      
      // Mock the history creation
      vi.mocked(searchHistoryQueries.create).mockResolvedValue(mockSearchHistory);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSearchWithTracking(), { wrapper });

      await waitFor(async () => {
        const response = await result.current.executeSearch(
          mockSearchRequest,
          'user-123',
          mockSearchFunction
        );
        
        expect(response).toEqual(mockSearchResponse);
      });

      expect(mockSearchFunction).toHaveBeenCalledWith(mockSearchRequest);
      expect(searchHistoryQueries.create).toHaveBeenCalled();
    });

    it('should track failed searches', async () => {
      // Mock a search function that throws an error
      const mockSearchFunction = vi.fn().mockRejectedValue(new Error('Search failed'));
      
      // Mock the history creation for failed search
      vi.mocked(searchHistoryQueries.create).mockResolvedValue({
        ...mockSearchHistory,
        results_found: false,
        results_count: 0
      });

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSearchWithTracking(), { wrapper });

      await waitFor(async () => {
        await expect(
          result.current.executeSearch(mockSearchRequest, 'user-123', mockSearchFunction)
        ).rejects.toThrow('Search failed');
      });

      // Should still track the failed search
      expect(searchHistoryQueries.create).toHaveBeenCalled();
    });
  });

  describe('Data Mappers', () => {
    it('should validate search history data correctly', () => {
      // Valid data
      const validData = mockCreateSearchHistoryData;
      const validErrors = searchHistoryMappers.validate(validData);
      expect(validErrors).toHaveLength(0);

      // Invalid data
      const invalidData = {
        ...validData,
        user_id: '',
        search_term: '',
        search_type: 'invalid_type',
        results_count: -1,
        search_duration_ms: -50
      };

      const invalidErrors = searchHistoryMappers.validate(invalidData as CreateSearchHistoryData);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors).toContain('User ID is required');
      expect(invalidErrors).toContain('Search term is required');
      expect(invalidErrors).toContain('Invalid search type: invalid_type');
      expect(invalidErrors).toContain('Results count cannot be negative');
      expect(invalidErrors).toContain('Search duration cannot be negative');
    });

    it('should validate search analytics data correctly', () => {
      // Valid data
      const validData = mockCreateSearchAnalyticsData;
      const validErrors = searchAnalyticsMappers.validate(validData);
      expect(validErrors).toHaveLength(0);

      // Invalid data
      const invalidData = {
        ...validData,
        search_term: '',
        search_type: 'invalid_type',
        success_rate: 1.5, // > 1.0
        frequency: -5,
        avg_click_position: 0, // < 1
        total_searches: 10,
        successful_searches: 15 // > total_searches
      };

      const invalidErrors = searchAnalyticsMappers.validate(invalidData as CreateSearchAnalyticsData);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors).toContain('Search term is required');
      expect(invalidErrors).toContain('Invalid search type: invalid_type');
      expect(invalidErrors).toContain('Success rate must be between 0 and 1');
      expect(invalidErrors).toContain('Frequency cannot be negative');
      expect(invalidErrors).toContain('Average click position must be at least 1');
      expect(invalidErrors).toContain('Successful searches cannot exceed total searches');
    });

    it('should validate search requests correctly', () => {
      // Valid request
      const validRequest = mockSearchRequest;
      const validErrors = searchRequestMappers.validateSearchRequest(validRequest);
      expect(validErrors).toHaveLength(0);

      // Invalid request
      const invalidRequest = {
        ...validRequest,
        query: '',
        type: 'invalid_type' as SearchType,
        context: 'invalid_context',
        pagination: { page: 0, per_page: 1001 }
      };

      const invalidErrors = searchRequestMappers.validateSearchRequest(invalidRequest);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors).toContain('Search query is required');
      expect(invalidErrors).toContain('Invalid search type: invalid_type');
      expect(invalidErrors).toContain('Invalid search context: invalid_context');
      expect(invalidErrors).toContain('Page number must be at least 1');
      expect(invalidErrors).toContain('Per page must be between 1 and 1000');
    });

    it('should sanitize search queries', () => {
      const maliciousQuery = '<script>alert("xss")</script>"DROP TABLE users;"';
      const sanitized = searchRequestMappers.sanitizeQuery(maliciousQuery);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('"');
      expect(sanitized).toBe('scriptalert(xss)/scriptDROP TABLE users;');
    });

    it('should parse advanced search queries', () => {
      const advancedQuery = 'golden retriever "exact phrase" -excluded *wild*card';
      const parsed = searchRequestMappers.parseAdvancedQuery(advancedQuery);

      expect(parsed.terms).toContain('golden');
      expect(parsed.terms).toContain('retriever');
      expect(parsed.exact_phrases).toContain('exact phrase');
      expect(parsed.excluded_terms).toContain('excluded');
      expect(parsed.wildcards).toContain('*wild*card');
    });
  });

  describe('Search Utilities', () => {
    it('should normalize search terms correctly', () => {
      const messyTerm = '  GOLDEN   Retriever!!!  ';
      const normalized = searchUtils.normalizeSearchTerm(messyTerm);
      expect(normalized).toBe('golden retriever');
    });

    it('should extract keywords from search terms', () => {
      const term = 'golden retriever puppy training';
      const keywords = searchUtils.extractKeywords(term);
      
      expect(keywords).toContain('golden');
      expect(keywords).toContain('retriever');
      expect(keywords).toContain('puppy');
      expect(keywords).toContain('training');
      expect(keywords).toHaveLength(4);
    });

    it('should validate search terms correctly', () => {
      expect(searchUtils.isValidSearchTerm('golden retriever')).toBe(true);
      expect(searchUtils.isValidSearchTerm('abc')).toBe(true);
      expect(searchUtils.isValidSearchTerm('')).toBe(false);
      expect(searchUtils.isValidSearchTerm('   ')).toBe(false);
      expect(searchUtils.isValidSearchTerm('a'.repeat(1001))).toBe(false);
      expect(searchUtils.isValidSearchTerm('!!@#$%')).toBe(false);
      expect(searchUtils.isValidSearchTerm('aaaaaaaaaaaaaaaaaaa')).toBe(false);
    });

    it('should format search durations correctly', () => {
      expect(searchUtils.formatSearchDuration(500)).toBe('500ms');
      expect(searchUtils.formatSearchDuration(1500)).toBe('1.5s');
      expect(searchUtils.formatSearchDuration(75000)).toBe('1m 15s');
    });

    it('should format success rates correctly', () => {
      expect(searchUtils.formatSuccessRate(0.856)).toBe('85.6%');
      expect(searchUtils.formatSuccessRate(1.0)).toBe('100.0%');
      expect(searchUtils.formatSuccessRate(0.0)).toBe('0.0%');
    });

    it('should generate search query variations', () => {
      const query = 'Golden Retriever!';
      const variations = searchUtils.generateQueryVariations(query);
      
      expect(variations).toContain('Golden Retriever!');
      expect(variations).toContain('golden retriever!');
      expect(variations).toContain('Golden Retriever');
      expect(variations).toContain('Golden');
      expect(variations).toContain('Retriever');
    });
  });

  describe('Result Transformation', () => {
    it('should transform database records to search results', () => {
      const dbRecord = {
        id: 'dog-123',
        name: 'Buddy',
        breed: 'Golden Retriever',
        age: 3,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z'
      };

      const searchResult = searchResultMappers.transformToSearchResult(
        dbRecord,
        'dogs',
        'golden',
        8.5
      );

      expect(searchResult.id).toBe('dog-123');
      expect(searchResult.type).toBe('dogs');
      expect(searchResult.title).toBe('Buddy');
      expect(searchResult.relevance_score).toBe(8.5);
      expect(searchResult.data).toEqual(dbRecord);
      expect(searchResult.metadata?.table).toBe('dog');
    });

    it('should highlight query terms in result fields', () => {
      const record = {
        id: 'dog-123',
        name: 'Golden Buddy',
        breed: 'Golden Retriever',
        description: 'A beautiful golden colored dog'
      };

      const highlighted = searchResultMappers.highlightFields(
        record,
        'golden',
        ['name', 'breed', 'description']
      );

      expect(highlighted.name).toBe('<mark>Golden</mark> Buddy');
      expect(highlighted.breed).toBe('<mark>Golden</mark> Retriever');
      expect(highlighted.description).toBe('A beautiful <mark>golden</mark> colored dog');
    });
  });
});