import { auditService } from './AuditService';
import { AuditAction } from '@/types/audit-types';
import { logger } from '@/services/LoggingService';

/**
 * Represents a search query with filters, sorting, and pagination options.
 */
export interface SearchQuery {
  term: string;
  filters: SearchFilters;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * Configuration object for filtering search results.
 * Supports various filter types including categories, date ranges, and custom fields.
 */
export interface SearchFilters {
  categories?: string[] | undefined;
  dateRange?: {
    start: Date;
    end: Date;
  } | undefined;
  status?: string[] | undefined;
  roles?: string[] | undefined;
  organizations?: string[] | undefined;
  locations?: string[] | undefined;
  priceRange?: {
    min: number;
    max: number;
  } | undefined;
  customFields?: Record<string, unknown> | undefined;
}

/**
 * Generic search result container with metadata and faceting information.
 * 
 * @template T - The type of items being returned in the search results
 */
export interface SearchResult<T = unknown> {
  items: T[];
  total: number;
  hasMore: boolean;
  facets: SearchFacets;
  suggestions?: string[];
  searchTime: number;
}

/**
 * Faceting information for search results, providing counts for different filter values.
 * Used for building dynamic filter UI components.
 */
export interface SearchFacets {
  [key: string]: {
    [value: string]: number;
  };
}

/**
 * Represents a single entry in the user's search history.
 * Used for providing search suggestions and analytics.
 */
export interface SearchHistoryEntry {
  id: string;
  query: SearchQuery;
  timestamp: Date;
  resultCount: number;
  userId: string;
}

/**
 * Comprehensive search service with caching, history tracking, and analytics.
 * Provides a unified interface for searching across different entity types with
 * advanced features like faceting, suggestions, and performance monitoring.
 * 
 * Features:
 * - Intelligent caching with TTL
 * - Search history and suggestions
 * - Advanced query parsing with operators
 * - Faceted search results
 * - Performance analytics
 * - User behavior tracking
 * 
 * @example
 * ```typescript
 * // Basic search
 * const results = await searchService.search(
 *   'dogs',
 *   { term: 'golden retriever', filters: {} },
 *   (query) => dogSearchFunction(query),
 *   'user-123'
 * );
 * 
 * // Advanced search with filters
 * const advancedQuery = searchService.buildAdvancedQuery(
 *   'status:active after:2024-01-01 sort:name-desc',
 *   { categories: ['competition'] }
 * );
 * 
 * // Get search suggestions
 * const suggestions = await searchService.getSearchSuggestions('dogs', 'gold');
 * ```
 */
export class SearchService {
  private searchHistory: SearchHistoryEntry[] = [];
  private searchCache = new Map<string, { result: SearchResult; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Initializes the search service and loads existing search history from localStorage.
   */
  constructor() {
    this.loadSearchHistory();
  }

  /**
   * Performs a search operation with caching, analytics, and history tracking.
   * 
   * @template T - The type of entities being searched
   * @param entityType - The type of entity being searched (e.g., 'dogs', 'shows', 'people')
   * @param query - The search query configuration
   * @param searchFunction - Function that performs the actual search operation
   * @param userId - Optional user ID for history tracking and analytics
   * @returns Promise resolving to search results with metadata
   * 
   * @example
   * ```typescript
   * const results = await searchService.search(
   *   'dogs',
   *   {
   *     term: 'golden retriever',
   *     filters: { categories: ['sporting'] },
   *     sortBy: 'name',
   *     sortOrder: 'asc'
   *   },
   *   async (query) => {
   *     // Custom search implementation
   *     return await performDogSearch(query);
   *   },
   *   'user-123'
   * );
   * ```
   */
  async search<T>(
    entityType: string,
    query: SearchQuery,
    searchFunction: (query: SearchQuery) => Promise<SearchResult<T>>,
    userId?: string
  ): Promise<SearchResult<T>> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(entityType, query);

    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result as SearchResult<T>;
    }

    try {
      // Perform search
      const result = await searchFunction(query);
      const searchTime = performance.now() - startTime;
      
      result.searchTime = searchTime;

      // Cache result
      this.searchCache.set(cacheKey, {
        result: result as SearchResult,
        timestamp: Date.now()
      });

      // Add to search history
      if (userId && query.term.trim()) {
        await this.addToSearchHistory(query, result.total, userId);
      }

      // Log search analytics
      await auditService.log({
        action: AuditAction.READ,
        entityType: 'search_analytics',
        entityId: `search_${Date.now()}`,
        metadata: {
          entityType,
          query: query.term,
          filters: Object.keys(query.filters).filter(key => 
            query.filters[key as keyof SearchFilters] !== undefined &&
            query.filters[key as keyof SearchFilters] !== null
          ),
          resultCount: result.total,
          searchTime: searchTime,
          userId,
          hasFilters: Object.keys(query.filters).length > 0
        }
      });

      return result;
    } catch (error) {
      logger.error('Search failed:', 'services', {}, error as Error);
      throw error;
    }
  }

  /**
   * Generates search suggestions based on search history and partial query input.
   * 
   * @param entityType - The type of entity being searched
   * @param partialQuery - Partial search term to match against
   * @param limit - Maximum number of suggestions to return (default: 5)
   * @returns Promise resolving to array of search suggestions
   * 
   * @example
   * ```typescript
   * // Get suggestions for partial input
   * const suggestions = await searchService.getSearchSuggestions(
   *   'dogs',
   *   'gold',
   *   10
   * );
   * // Returns: ['golden retriever', 'golden doodle', 'goldendoodle']
   * ```
   */
  async getSearchSuggestions(
    _entityType: string,
    partialQuery: string,
    limit: number = 5
  ): Promise<string[]> {
    // Get suggestions from search history
    const historySuggestions = this.searchHistory
      .filter(entry => 
        entry.query.term.toLowerCase().includes(partialQuery.toLowerCase()) &&
        entry.resultCount > 0
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map(entry => entry.query.term);

    // Remove duplicates and return
    return Array.from(new Set(historySuggestions));
  }

  /**
   * Retrieves the most popular search terms based on search frequency.
   * 
   * @param entityType - The type of entity to get popular searches for
   * @param limit - Maximum number of popular searches to return (default: 10)
   * @returns Promise resolving to array of popular search terms
   * 
   * @example
   * ```typescript
   * const popular = await searchService.getPopularSearches('dogs', 5);
   * // Returns: ['golden retriever', 'labrador', 'german shepherd', ...]
   * ```
   */
  async getPopularSearches(_entityType: string, limit: number = 10): Promise<string[]> {
    const searchCounts = new Map<string, number>();
    
    this.searchHistory
      .filter(entry => entry.resultCount > 0)
      .forEach(entry => {
        const term = entry.query.term.toLowerCase().trim();
        if (term) {
          searchCounts.set(term, (searchCounts.get(term) || 0) + 1);
        }
      });

    return Array.from(searchCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term]) => term);
  }

  /**
   * Retrieves search history for a specific user.
   * 
   * @param userId - The user ID to get search history for
   * @param limit - Maximum number of history entries to return (default: 20)
   * @returns Promise resolving to array of search history entries
   * 
   * @example
   * ```typescript
   * const history = await searchService.getSearchHistory('user-123', 10);
   * history.forEach(entry => {
   *   logger.debug(`${entry.query.term} - ${entry.resultCount} results`, 'services', {});
   * });
   * ```
   */
  async getSearchHistory(userId: string, limit: number = 20): Promise<SearchHistoryEntry[]> {
    return this.searchHistory
      .filter(entry => entry.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Clears all search history for a specific user.
   * 
   * @param userId - The user ID to clear search history for
   * @returns Promise that resolves when history is cleared
   * 
   * @example
   * ```typescript
   * await searchService.clearSearchHistory('user-123');
   * logger.debug('Search history cleared', 'services', {});
   * ```
   */
  async clearSearchHistory(userId: string): Promise<void> {
    this.searchHistory = this.searchHistory.filter(entry => entry.userId !== userId);
    this.saveSearchHistory();
    
    await auditService.log({
      action: AuditAction.DELETE,
      entityType: 'search_history',
      entityId: userId,
      metadata: {
        action: 'clear_search_history',
        userId
      }
    });
  }

  /**
   * Builds an advanced search query by parsing search operators and combining with filters.
   * 
   * Supported operators:
   * - `after:YYYY-MM-DD` - Filter by date after
   * - `before:YYYY-MM-DD` - Filter by date before
   * - `status:value` - Filter by status
   * - `price:min-max` - Filter by price range
   * - `sort:field` or `sort:field-desc` - Sort results
   * 
   * @param searchTerms - Raw search string with operators
   * @param filters - Additional filters to apply
   * @param _fuzzyMatch - Whether to enable fuzzy matching (currently unused)
   * @returns Parsed search query object
   * 
   * @example
   * ```typescript
   * const query = searchService.buildAdvancedQuery(
   *   'golden retriever after:2024-01-01 status:active sort:name-desc',
   *   { categories: ['sporting'] }
   * );
   * // Results in:
   * // {
   * //   term: 'golden retriever',
   * //   filters: {
   * //     categories: ['sporting'],
   * //     dateRange: { start: Date('2024-01-01'), end: Date() },
   * //     status: ['active']
   * //   },
   * //   sortBy: 'name',
   * //   sortOrder: 'desc'
   * // }
   * ```
   */
  buildAdvancedQuery(
    searchTerms: string,
    filters: SearchFilters,
     
    _fuzzyMatch: boolean = true
  ): SearchQuery {
    // Parse search terms for advanced operators
    const terms = this.parseSearchTerms(searchTerms);
    
    return {
      term: terms.main,
      filters: {
        ...filters,
        // Add parsed filters from search terms
        ...terms.filters
      },
      ...(terms.sortBy !== undefined && { sortBy: terms.sortBy }),
      ...(terms.sortOrder !== undefined && { sortOrder: terms.sortOrder })
    };
  }

  /**
   * Parses search terms to extract operators and build filter objects.
   * 
   * @private
   * @param searchTerms - Raw search string to parse
   * @returns Parsed components including main term, filters, and sort options
   */
  private parseSearchTerms(searchTerms: string): {
    main: string;
    filters: Partial<SearchFilters>;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } {
    let main = searchTerms;
    const filters: Partial<SearchFilters> = {};
    let sortBy: string | undefined;
    let sortOrder: 'asc' | 'desc' | undefined;

    // Parse date ranges: "after:2024-01-01", "before:2024-12-31"
    const dateMatches = main.match(/(after|before):(\d{4}-\d{2}-\d{2})/g);
    if (dateMatches) {
      const dateRange = { start: new Date(0), end: new Date() };
      dateMatches.forEach(match => {
        const [operator, dateStr] = match.split(':');
        const date = new Date(dateStr);
        if (operator === 'after') dateRange.start = date;
        if (operator === 'before') dateRange.end = date;
        main = main.replace(match, '').trim();
      });
      filters.dateRange = dateRange;
    }

    // Parse status filters: "status:pending", "status:accepted"
    const statusMatches = main.match(/status:(\w+)/g);
    if (statusMatches) {
      filters.status = statusMatches.map(match => match.split(':')[1]);
      statusMatches.forEach(match => {
        main = main.replace(match, '').trim();
      });
    }

    // Parse price ranges: "price:10-50"
    const priceMatch = main.match(/price:(\d+)-(\d+)/);
    if (priceMatch) {
      filters.priceRange = {
        min: parseInt(priceMatch[1]),
        max: parseInt(priceMatch[2])
      };
      main = main.replace(priceMatch[0], '').trim();
    }

    // Parse sort: "sort:date", "sort:name-desc"
    const sortMatch = main.match(/sort:(\w+)(?:-(\w+))?/);
    if (sortMatch) {
      sortBy = sortMatch[1];
      sortOrder = sortMatch[2] as 'asc' | 'desc' || 'asc';
      main = main.replace(sortMatch[0], '').trim();
    }

    return {
      main: main.replace(/\s+/g, ' ').trim(),
      filters,
      ...(sortBy !== undefined && { sortBy }),
      ...(sortOrder !== undefined && { sortOrder }),
    };
  }

  /**
   * Generates a unique cache key for a search query.
   * 
   * @private
   * @param entityType - The type of entity being searched
   * @param query - The search query object
   * @returns Unique cache key string
   */
  private generateCacheKey(entityType: string, query: SearchQuery): string {
    return `${entityType}_${JSON.stringify(query)}`;
  }

  /**
   * Adds a search query to the user's search history.
   * 
   * @private
   * @param query - The search query to add
   * @param resultCount - Number of results returned
   * @param userId - User ID for the search
   */
  private async addToSearchHistory(
    query: SearchQuery,
    resultCount: number,
    userId: string
  ): Promise<void> {
    const entry: SearchHistoryEntry = {
      id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      query,
      timestamp: new Date(),
      resultCount,
      userId
    };

    this.searchHistory.unshift(entry);
    
    // Keep only last 1000 entries
    if (this.searchHistory.length > 1000) {
      this.searchHistory = this.searchHistory.slice(0, 1000);
    }

    this.saveSearchHistory();
  }

  /**
   * Loads search history from localStorage with error handling.
   * 
   * @private
   */
  private loadSearchHistory(): void {
    try {
      const stored = localStorage.getItem('search_history');
      if (stored) {
        const parsed = JSON.parse(stored) as unknown[];
        this.searchHistory = parsed
          .filter((entry): entry is Record<string, unknown> => 
            typeof entry === 'object' && entry !== null
          )
          .map((entry) => {
            // Type guard to ensure proper structure
            if (
              typeof entry.id === 'string' &&
              typeof entry.query === 'object' &&
              entry.query !== null &&
              typeof (entry.query as Record<string, unknown>).term === 'string' &&
              typeof entry.resultCount === 'number' &&
              typeof entry.userId === 'string'
            ) {
              return {
                id: entry.id,
                query: entry.query as SearchQuery,
                timestamp: new Date(entry.timestamp as string),
                resultCount: entry.resultCount,
                userId: entry.userId
              } as SearchHistoryEntry;
            }
            throw new Error('Invalid search history entry structure');
          });
      }
    } catch (error) {
      logger.error('Failed to load search history:', 'services', {}, error as Error);
      this.searchHistory = [];
    }
  }

  /**
   * Saves current search history to localStorage.
   * 
   * @private
   */
  private saveSearchHistory(): void {
    try {
      localStorage.setItem('search_history', JSON.stringify(this.searchHistory));
    } catch (error) {
      logger.error('Failed to save search history:', 'services', {}, error as Error);
    }
  }

  /**
   * Removes expired entries from the search cache to free up memory.
   * Called automatically every 10 minutes via setInterval.
   * 
   * @example
   * ```typescript
   * // Manually trigger cache cleanup
   * searchService.clearExpiredCache();
   * ```
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.searchCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.searchCache.delete(key);
      }
    }
  }
}

export const searchService = new SearchService();

// Cleanup cache every 10 minutes
setInterval(() => {
  searchService.clearExpiredCache();
}, 10 * 60 * 1000);