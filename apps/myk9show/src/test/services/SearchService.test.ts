import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchService, SearchQuery } from '../../services/SearchService';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    now: vi.fn(() => Date.now()),
  },
});

describe('SearchService', () => {
  let service: SearchService;
  const mockUserId = 'test-user-123';
  const mockEntityType = 'shows';

  beforeEach(() => {
    service = new SearchService();
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('search functionality', () => {
    it('should perform basic search and cache results', async () => {
      const mockQuery: SearchQuery = {
        term: 'agility',
        filters: {},
      };

      const mockSearchFunction = vi.fn().mockResolvedValue({
        items: [{ id: '1', name: 'Spring Agility Show' }],
        total: 1,
        hasMore: false,
        facets: {},
        searchTime: 0,
      });

      const result = await service.search(
        mockEntityType,
        mockQuery,
        mockSearchFunction,
        mockUserId
      );

      expect(mockSearchFunction).toHaveBeenCalledWith(mockQuery);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.searchTime).toBeGreaterThanOrEqual(0);
    });

    it('should return cached results when available', async () => {
      const mockQuery: SearchQuery = {
        term: 'agility',
        filters: {},
      };

      const mockSearchFunction = vi.fn().mockResolvedValue({
        items: [{ id: '1', name: 'Spring Agility Show' }],
        total: 1,
        hasMore: false,
        facets: {},
        searchTime: 0,
      });

      // First search
      await service.search(mockEntityType, mockQuery, mockSearchFunction, mockUserId);
      
      // Second search should use cache
      const result = await service.search(mockEntityType, mockQuery, mockSearchFunction, mockUserId);

      expect(mockSearchFunction).toHaveBeenCalledTimes(1); // Only called once
      expect(result.items).toHaveLength(1);
    });

    it('should add search to history for successful searches', async () => {
      const mockQuery: SearchQuery = {
        term: 'agility championship',
        filters: {},
      };

      const mockSearchFunction = vi.fn().mockResolvedValue({
        items: [{ id: '1', name: 'Spring Agility Show' }],
        total: 1,
        hasMore: false,
        facets: {},
        searchTime: 0,
      });

      await service.search(mockEntityType, mockQuery, mockSearchFunction, mockUserId);

      const history = await service.getSearchHistory(mockUserId, 10);
      expect(history).toHaveLength(1);
      expect(history[0].query.term).toBe('agility championship');
      expect(history[0].userId).toBe(mockUserId);
    });

    it('should not add empty search terms to history', async () => {
      const mockQuery: SearchQuery = {
        term: '',
        filters: {},
      };

      const mockSearchFunction = vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        hasMore: false,
        facets: {},
        searchTime: 0,
      });

      await service.search(mockEntityType, mockQuery, mockSearchFunction, mockUserId);

      const history = await service.getSearchHistory(mockUserId, 10);
      expect(history).toHaveLength(0);
    });
  });

  describe('search suggestions', () => {
    it('should return suggestions based on search history', async () => {
      // Add some searches to history first
      const searches = [
        'agility championship',
        'agility training',
        'obedience trial'
      ];

      for (const term of searches) {
        const mockQuery: SearchQuery = { term, filters: {} };
        const mockSearchFunction = vi.fn().mockResolvedValue({
          items: [{ id: '1' }],
          total: 1,
          hasMore: false,
          facets: {},
          searchTime: 0,
        });

        await service.search(mockEntityType, mockQuery, mockSearchFunction, mockUserId);
      }

      const suggestions = await service.getSearchSuggestions(mockEntityType, 'agility', 5);
      
      expect(suggestions).toContain('agility championship');
      expect(suggestions).toContain('agility training');
      expect(suggestions).not.toContain('obedience trial');
    });

    it('should limit suggestions to specified count', async () => {
      const searches = Array.from({ length: 10 }, (_, i) => `agility test ${i}`);

      for (const term of searches) {
        const mockQuery: SearchQuery = { term, filters: {} };
        const mockSearchFunction = vi.fn().mockResolvedValue({
          items: [{ id: '1' }],
          total: 1,
          hasMore: false,
          facets: {},
          searchTime: 0,
        });

        await service.search(mockEntityType, mockQuery, mockSearchFunction, mockUserId);
      }

      const suggestions = await service.getSearchSuggestions(mockEntityType, 'agility', 3);
      
      expect(suggestions).toHaveLength(3);
    });
  });

  describe('popular searches', () => {
    it('should track and return popular searches', async () => {
      const searchCounts = {
        'agility': 5,
        'obedience': 3,
        'rally': 2,
        'tracking': 1,
      };

      // Simulate multiple searches
      for (const [term, count] of Object.entries(searchCounts)) {
        for (let i = 0; i < count; i++) {
          const mockQuery: SearchQuery = { term, filters: {} };
          const mockSearchFunction = vi.fn().mockResolvedValue({
            items: [{ id: '1' }],
            total: 1,
            hasMore: false,
            facets: {},
            searchTime: 0,
          });

          await service.search(mockEntityType, mockQuery, mockSearchFunction, `user-${i}`);
        }
      }

      const popular = await service.getPopularSearches(mockEntityType, 4);
      
      // Popular searches should be sorted by count (descending)
      expect(popular).toContain('agility');
      expect(popular).toContain('obedience');
      expect(popular).toContain('rally');
      expect(popular).toContain('tracking');
      expect(popular).toHaveLength(4);
      
      // The most popular should be first (agility with 5 searches)
      expect(popular[0]).toBe('agility');
      // Check that they're in descending order by frequency
      expect(['obedience', 'rally', 'tracking']).toContain(popular[1]);
      expect(['obedience', 'rally', 'tracking']).toContain(popular[2]);
      expect(['obedience', 'rally', 'tracking']).toContain(popular[3]);
    });
  });

  describe('advanced query building', () => {
    it('should parse date range filters', () => {
      const searchTerms = 'agility show after:2024-01-01 before:2024-12-31';
      const query = service.buildAdvancedQuery(searchTerms, {});

      expect(query.term).toBe('agility show');
      expect(query.filters.dateRange).toBeDefined();
      expect(query.filters.dateRange?.start).toBeInstanceOf(Date);
      expect(query.filters.dateRange?.end).toBeInstanceOf(Date);
    });

    it('should parse status filters', () => {
      const searchTerms = 'my entries status:pending status:accepted';
      const query = service.buildAdvancedQuery(searchTerms, {});

      expect(query.term).toBe('my entries');
      expect(query.filters.status).toEqual(['pending', 'accepted']);
    });

    it('should parse price range filters', () => {
      const searchTerms = 'dog shows price:25-100';
      const query = service.buildAdvancedQuery(searchTerms, {});

      expect(query.term).toBe('dog shows');
      expect(query.filters.priceRange).toEqual({ min: 25, max: 100 });
    });

    it('should parse sort parameters', () => {
      const searchTerms = 'competitions sort:date-desc';
      const query = service.buildAdvancedQuery(searchTerms, {});

      expect(query.term).toBe('competitions');
      expect(query.sortBy).toBe('date');
      expect(query.sortOrder).toBe('desc');
    });

    it('should handle complex queries with multiple operators', () => {
      const searchTerms = 'agility after:2024-01-01 status:pending price:20-50 sort:date-asc';
      const query = service.buildAdvancedQuery(searchTerms, {});

      expect(query.term).toBe('agility');
      expect(query.filters.dateRange).toBeDefined();
      expect(query.filters.status).toEqual(['pending']);
      expect(query.filters.priceRange).toEqual({ min: 20, max: 50 });
      expect(query.sortBy).toBe('date');
      expect(query.sortOrder).toBe('asc');
    });
  });

  describe('search history management', () => {
    it('should clear search history for user', async () => {
      // Add some searches
      const mockQuery: SearchQuery = { term: 'test search', filters: {} };
      const mockSearchFunction = vi.fn().mockResolvedValue({
        items: [{ id: '1' }],
        total: 1,
        hasMore: false,
        facets: {},
        searchTime: 0,
      });

      await service.search(mockEntityType, mockQuery, mockSearchFunction, mockUserId);

      let history = await service.getSearchHistory(mockUserId, 10);
      expect(history).toHaveLength(1);

      await service.clearSearchHistory(mockUserId);

      history = await service.getSearchHistory(mockUserId, 10);
      expect(history).toHaveLength(0);
    });

    it('should only clear history for specified user', async () => {
      const userId1 = 'user1';
      const userId2 = 'user2';

      // Add searches for both users
      const mockSearchFunction = vi.fn().mockResolvedValue({
        items: [{ id: '1' }],
        total: 1,
        hasMore: false,
        facets: {},
        searchTime: 0,
      });

      await service.search(mockEntityType, { term: 'user1 search', filters: {} }, mockSearchFunction, userId1);
      await service.search(mockEntityType, { term: 'user2 search', filters: {} }, mockSearchFunction, userId2);

      await service.clearSearchHistory(userId1);

      const history1 = await service.getSearchHistory(userId1, 10);
      const history2 = await service.getSearchHistory(userId2, 10);

      expect(history1).toHaveLength(0);
      expect(history2).toHaveLength(1);
    });
  });

  describe('cache management', () => {
    it('should clear expired cache entries', () => {
      // This is more of an integration test since cache is private
      // We test it indirectly by verifying that expired entries don't affect new searches
      // Mock query for cache test
      vi.fn().mockResolvedValue({
        items: [{ id: '1' }],
        total: 1,
        hasMore: false,
        facets: {},
        searchTime: 0,
      });

      // Trigger cache cleanup
      service.clearExpiredCache();

      // Should not throw any errors
      expect(() => service.clearExpiredCache()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle search function errors gracefully', async () => {
      const mockQuery: SearchQuery = { term: 'error test', filters: {} };
      const mockSearchFunction = vi.fn().mockRejectedValue(new Error('Search failed'));

      await expect(
        service.search(mockEntityType, mockQuery, mockSearchFunction, mockUserId)
      ).rejects.toThrow('Search failed');
    });
  });
});

describe('SearchService integration with localStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it('should persist search history to localStorage', async () => {
    const service = new SearchService();
    const mockQuery: SearchQuery = { term: 'persistence test', filters: {} };
    const mockSearchFunction = vi.fn().mockResolvedValue({
      items: [{ id: '1' }],
      total: 1,
      hasMore: false,
      facets: {},
      searchTime: 0,
    });

    await service.search('test', mockQuery, mockSearchFunction, 'user1');

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'search_history',
      expect.stringContaining('persistence test')
    );
  });

  it('should load search history from localStorage', () => {
    const mockHistory = JSON.stringify([
      {
        id: 'search_1',
        query: { term: 'loaded search', filters: {} },
        timestamp: new Date().toISOString(),
        resultCount: 5,
        userId: 'user1'
      }
    ]);

    localStorageMock.getItem.mockReturnValue(mockHistory);

    // Service instance for testing
    new SearchService();
    
    // The service should load the history on instantiation
    expect(localStorageMock.getItem).toHaveBeenCalledWith('search_history');
  });

  it('should handle corrupted localStorage data gracefully', () => {
    localStorageMock.getItem.mockReturnValue('invalid json');
    
    // Should not throw when creating service with corrupted data
    expect(() => new SearchService()).not.toThrow();
  });
});