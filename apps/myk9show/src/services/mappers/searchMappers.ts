/**
 * Search & Analytics Data Mappers
 * 
 * Transform data between database format and application format,
 * handle validation, and provide utility functions for search and analytics data.
 */

import {
  SearchHistory,
  SearchAnalytics,
  CreateSearchHistoryData,
  CreateSearchAnalyticsData,
  SearchRequest,
  SearchResult,
  SearchResponse,
  SearchSuggestion,
  PopularSearch,
  SearchType,
  SearchContext,
  SearchableTable,
  SearchPeriod,
  FullTextSearchRequest,
  SEARCH_TYPES,
  SEARCH_CONTEXTS,
  SEARCHABLE_TABLES
} from '../../types/search-analytics';

// Search History Mappers
export const searchHistoryMappers = {
  // Map database search history to app format
  fromDatabase(dbSearchHistory: Record<string, unknown>): SearchHistory {
    // Helper to safely parse JSON
    const parseJSON = (value: unknown): Record<string, unknown> | null => {
      if (!value) return null;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }
      if (typeof value === 'object') return value as Record<string, unknown>;
      return null;
    };

    return {
      id: dbSearchHistory.id as string,
      user_id: dbSearchHistory.user_id as string,
      search_term: dbSearchHistory.search_term as string,
      search_type: dbSearchHistory.search_type as string,
      search_context: dbSearchHistory.search_context as string || undefined,
      results_count: dbSearchHistory.results_count as number || undefined,
      results_found: dbSearchHistory.results_found as boolean || undefined,
      search_filters: parseJSON(dbSearchHistory.search_filters) || undefined,
      search_sort: parseJSON(dbSearchHistory.search_sort) || undefined,
      search_duration_ms: dbSearchHistory.search_duration_ms as number || undefined,
      clicked_result_id: dbSearchHistory.clicked_result_id as string || undefined,
      clicked_result_position: dbSearchHistory.clicked_result_position as number || undefined,
      session_id: dbSearchHistory.session_id as string || undefined,
      created_at: dbSearchHistory.created_at as string
    };
  },

  // Map app search history to database format
  toDatabase(searchHistory: CreateSearchHistoryData) {
    return {
      user_id: searchHistory.user_id,
      search_term: searchHistory.search_term,
      search_type: searchHistory.search_type,
      search_context: searchHistory.search_context || null,
      results_count: searchHistory.results_count || null,
      results_found: searchHistory.results_found || null,
      search_filters: searchHistory.search_filters ? JSON.stringify(searchHistory.search_filters) : null,
      search_sort: searchHistory.search_sort ? JSON.stringify(searchHistory.search_sort) : null,
      search_duration_ms: searchHistory.search_duration_ms || null,
      clicked_result_id: searchHistory.clicked_result_id || null,
      clicked_result_position: searchHistory.clicked_result_position || null,
      session_id: searchHistory.session_id || null
    };
  },

  // Validate search history data
  validate(data: CreateSearchHistoryData): string[] {
    const errors: string[] = [];

    if (!data.user_id) {
      errors.push('User ID is required');
    }

    if (!data.search_term || data.search_term.trim().length === 0) {
      errors.push('Search term is required');
    }

    if (data.search_term && data.search_term.length > 1000) {
      errors.push('Search term is too long (max 1000 characters)');
    }

    if (!data.search_type) {
      errors.push('Search type is required');
    }

    if (data.search_type && !SEARCH_TYPES.includes(data.search_type as SearchType)) {
      errors.push(`Invalid search type: ${data.search_type}`);
    }

    if (data.search_context && !SEARCH_CONTEXTS.includes(data.search_context as SearchContext)) {
      errors.push(`Invalid search context: ${data.search_context}`);
    }

    if (data.results_count !== undefined && data.results_count < 0) {
      errors.push('Results count cannot be negative');
    }

    if (data.search_duration_ms !== undefined && data.search_duration_ms < 0) {
      errors.push('Search duration cannot be negative');
    }

    if (data.clicked_result_position !== undefined && data.clicked_result_position < 1) {
      errors.push('Clicked result position must be at least 1');
    }

    return errors;
  },

  // Create search history from search request
  fromSearchRequest(
    searchRequest: SearchRequest, 
    userId: string, 
    results: SearchResponse
  ): CreateSearchHistoryData {
    return {
      user_id: userId,
      search_term: searchRequest.query,
      search_type: searchRequest.type,
      search_context: searchRequest.context,
      results_count: results.total_count,
      results_found: results.total_count > 0,
      search_filters: searchRequest.filters,
      search_sort: searchRequest.sort,
      search_duration_ms: results.search_time_ms,
      session_id: searchRequest.session_id
    };
  }
};

// Search Analytics Mappers
export const searchAnalyticsMappers = {
  // Map database search analytics to app format
  fromDatabase(dbSearchAnalytics: Record<string, unknown>): SearchAnalytics {
    return {
      id: dbSearchAnalytics.id as string,
      search_term: dbSearchAnalytics.search_term as string,
      search_type: dbSearchAnalytics.search_type as string,
      frequency: dbSearchAnalytics.frequency as number || undefined,
      success_rate: dbSearchAnalytics.success_rate as number || undefined,
      avg_results_count: dbSearchAnalytics.avg_results_count as number || undefined,
      avg_click_position: dbSearchAnalytics.avg_click_position as number || undefined,
      avg_search_duration_ms: dbSearchAnalytics.avg_search_duration_ms as number || undefined,
      total_searches: dbSearchAnalytics.total_searches as number || undefined,
      successful_searches: dbSearchAnalytics.successful_searches as number || undefined,
      first_searched_at: dbSearchAnalytics.first_searched_at as string || undefined,
      last_searched_at: dbSearchAnalytics.last_searched_at as string || undefined,
      last_aggregated_at: dbSearchAnalytics.last_aggregated_at as string || undefined,
      created_at: dbSearchAnalytics.created_at as string,
      updated_at: dbSearchAnalytics.updated_at as string
    };
  },

  // Map app search analytics to database format
  toDatabase(searchAnalytics: CreateSearchAnalyticsData) {
    return {
      search_term: searchAnalytics.search_term,
      search_type: searchAnalytics.search_type,
      frequency: searchAnalytics.frequency || null,
      success_rate: searchAnalytics.success_rate || null,
      avg_results_count: searchAnalytics.avg_results_count || null,
      avg_click_position: searchAnalytics.avg_click_position || null,
      avg_search_duration_ms: searchAnalytics.avg_search_duration_ms || null,
      total_searches: searchAnalytics.total_searches || null,
      successful_searches: searchAnalytics.successful_searches || null,
      first_searched_at: searchAnalytics.first_searched_at || null,
      last_searched_at: searchAnalytics.last_searched_at || null,
      last_aggregated_at: searchAnalytics.last_aggregated_at || null
    };
  },

  // Validate search analytics data
  validate(data: CreateSearchAnalyticsData): string[] {
    const errors: string[] = [];

    if (!data.search_term || data.search_term.trim().length === 0) {
      errors.push('Search term is required');
    }

    if (data.search_term && data.search_term.length > 1000) {
      errors.push('Search term is too long (max 1000 characters)');
    }

    if (!data.search_type) {
      errors.push('Search type is required');
    }

    if (data.search_type && !SEARCH_TYPES.includes(data.search_type as SearchType)) {
      errors.push(`Invalid search type: ${data.search_type}`);
    }

    if (data.frequency !== undefined && data.frequency < 0) {
      errors.push('Frequency cannot be negative');
    }

    if (data.success_rate !== undefined && (data.success_rate < 0 || data.success_rate > 1)) {
      errors.push('Success rate must be between 0 and 1');
    }

    if (data.avg_results_count !== undefined && data.avg_results_count < 0) {
      errors.push('Average results count cannot be negative');
    }

    if (data.avg_click_position !== undefined && data.avg_click_position < 1) {
      errors.push('Average click position must be at least 1');
    }

    if (data.avg_search_duration_ms !== undefined && data.avg_search_duration_ms < 0) {
      errors.push('Average search duration cannot be negative');
    }

    if (data.total_searches !== undefined && data.total_searches < 0) {
      errors.push('Total searches cannot be negative');
    }

    if (data.successful_searches !== undefined && data.successful_searches < 0) {
      errors.push('Successful searches cannot be negative');
    }

    if (data.total_searches !== undefined && data.successful_searches !== undefined) {
      if (data.successful_searches > data.total_searches) {
        errors.push('Successful searches cannot exceed total searches');
      }
    }

    return errors;
  }
};

// Search Request/Response Mappers
export const searchRequestMappers = {
  // Validate search request
  validateSearchRequest(request: SearchRequest): string[] {
    const errors: string[] = [];

    if (!request.query || request.query.trim().length === 0) {
      errors.push('Search query is required');
    }

    if (request.query && request.query.length > 1000) {
      errors.push('Search query is too long (max 1000 characters)');
    }

    if (!request.type) {
      errors.push('Search type is required');
    }

    if (request.type && !SEARCH_TYPES.includes(request.type)) {
      errors.push(`Invalid search type: ${request.type}`);
    }

    if (request.context && !SEARCH_CONTEXTS.includes(request.context)) {
      errors.push(`Invalid search context: ${request.context}`);
    }

    if (request.pagination) {
      if (request.pagination.page < 1) {
        errors.push('Page number must be at least 1');
      }
      if (request.pagination.per_page < 1 || request.pagination.per_page > 1000) {
        errors.push('Per page must be between 1 and 1000');
      }
    }

    return errors;
  },

  // Validate full-text search request
  validateFullTextSearchRequest(request: FullTextSearchRequest): string[] {
    const errors: string[] = [];

    if (!request.query || request.query.trim().length === 0) {
      errors.push('Search query is required');
    }

    if (!request.tables || request.tables.length === 0) {
      errors.push('At least one searchable table must be specified');
    }

    if (request.tables) {
      const invalidTables = request.tables.filter(table => !SEARCHABLE_TABLES.includes(table));
      if (invalidTables.length > 0) {
        errors.push(`Invalid searchable tables: ${invalidTables.join(', ')}`);
      }
    }

    if (request.max_results !== undefined && request.max_results < 1) {
      errors.push('Max results must be at least 1');
    }

    if (request.min_relevance !== undefined && (request.min_relevance < 0 || request.min_relevance > 10)) {
      errors.push('Min relevance must be between 0 and 10');
    }

    return errors;
  },

  // Sanitize search query
  sanitizeQuery(query: string): string {
    if (!query) return '';
    
    return query
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML
      .replace(/['"]/g, '') // Remove quotes that could break SQL
      .substring(0, 1000); // Limit length
  },

  // Parse search query for advanced features
  parseAdvancedQuery(query: string): {
    terms: string[];
    exact_phrases: string[];
    excluded_terms: string[];
    wildcards: string[];
  } {
    const terms: string[] = [];
    const exact_phrases: string[] = [];
    const excluded_terms: string[] = [];
    const wildcards: string[] = [];

    // Find exact phrases (quoted text)
    const phraseMatches = query.match(/"([^"]+)"/g) || [];
    phraseMatches.forEach(match => {
      exact_phrases.push(match.slice(1, -1));
      query = query.replace(match, '');
    });

    // Find excluded terms (starting with -)
    const excludeMatches = query.match(/-\w+/g) || [];
    excludeMatches.forEach(match => {
      excluded_terms.push(match.slice(1));
      query = query.replace(match, '');
    });

    // Find wildcards (containing *)
    const wildcardMatches = query.match(/\w*\*\w*/g) || [];
    wildcardMatches.forEach(match => {
      wildcards.push(match);
      query = query.replace(match, '');
    });

    // Remaining words are regular terms
    const remainingTerms = query.split(/\s+/).filter(term => term.trim().length > 0);
    terms.push(...remainingTerms);

    return {
      terms,
      exact_phrases,
      excluded_terms,
      wildcards
    };
  }
};

// Result Transformation Mappers
export const searchResultMappers = {
  // Transform database record to search result
  transformToSearchResult<T>(
    record: Record<string, unknown>,
    searchType: SearchType,
    query: string,
    relevanceScore?: number
  ): SearchResult<T> {
    const titleField = this.getTitleField(searchType);
    const descriptionFields = this.getDescriptionFields(searchType);

    return {
      id: record.id as string,
      type: searchType,
      title: String(record[titleField] || record.name || record.id || 'Unknown'),
      description: this.buildDescription(record, descriptionFields),
      data: record as T,
      relevance_score: relevanceScore || 0,
      highlighted_fields: this.highlightFields(record, query, [titleField, ...descriptionFields]),
      metadata: {
        table: this.getTableForSearchType(searchType),
        created_at: record.created_at,
        updated_at: record.updated_at
      }
    };
  },

  // Get title field for search type
  getTitleField(searchType: SearchType): string {
    const titleFields: Record<SearchType, string> = {
      dogs: 'name',
      users: 'first_name',
      shows: 'name',
      clubs: 'name',
      classes: 'name',
      achievements: 'title',
      competitions: 'competition_name',
      judges: 'name',
      registrations: 'registration_number',
      health_records: 'record_type',
      global: 'name',
      advanced: 'name'
    };

    return titleFields[searchType] || 'name';
  },

  // Get description fields for search type
  getDescriptionFields(searchType: SearchType): string[] {
    const descriptionFields: Record<SearchType, string[]> = {
      dogs: ['breed', 'registration_number', 'description'],
      users: ['last_name', 'email', 'title'],
      shows: ['location', 'start_date', 'description'],
      clubs: ['location', 'description'],
      classes: ['description', 'level', 'organization'],
      achievements: ['organization', 'discipline', 'level'],
      competitions: ['location', 'placement', 'organization'],
      judges: ['organization', 'qualification_level', 'disciplines'],
      registrations: ['organization', 'registration_type'],
      health_records: ['description', 'date'],
      global: ['description'],
      advanced: ['description']
    };

    return descriptionFields[searchType] || ['description'];
  },

  // Get table name for search type
  getTableForSearchType(searchType: SearchType): SearchableTable {
    const tableMap: Record<SearchType, SearchableTable> = {
      dogs: 'dog',
      users: 'user',
      shows: 'show',
      clubs: 'club',
      classes: 'class',
      achievements: 'achievement',
      competitions: 'competition',
      judges: 'judge_qualification',
      registrations: 'registration',
      health_records: 'health_record',
      global: 'dog', // Default for global search
      advanced: 'dog' // Default for advanced search
    };

    return tableMap[searchType] || 'dog';
  },

  // Build description from multiple fields
  buildDescription(record: Record<string, unknown>, fields: string[]): string {
    const parts = fields
      .map(field => String(record[field] || ''))
      .filter(part => part.length > 0)
      .slice(0, 3); // Limit to first 3 non-empty fields

    return parts.join(' • ').substring(0, 200);
  },

  // Highlight query terms in fields
  highlightFields(
    record: Record<string, unknown>,
    query: string,
    fields: string[]
  ): Record<string, string> {
    const highlighted: Record<string, string> = {};
    const queryLower = query.toLowerCase();

    fields.forEach(field => {
      const value = String(record[field] || '');
      if (value && value.toLowerCase().includes(queryLower)) {
        const regex = new RegExp(`(${query})`, 'gi');
        highlighted[field] = value.replace(regex, '<mark>$1</mark>');
      }
    });

    return highlighted;
  }
};

// Analytics Mappers
export const analyticsMappers = {
  // Transform search suggestion
  transformSearchSuggestion(
    term: string,
    type: SearchType,
    frequency: number,
    successRate: number,
    context?: string
  ): SearchSuggestion {
    return {
      suggestion: term,
      type,
      frequency,
      success_rate: successRate,
      context
    };
  },

  // Transform popular search
  transformPopularSearch(
    term: string,
    type: SearchType,
    frequency: number,
    successRate: number,
    period: SearchPeriod = 'all_time'
  ): PopularSearch {
    return {
      search_term: term,
      search_type: type,
      frequency,
      success_rate: successRate,
      trend: 'stable', // Would need historical data for actual trend calculation
      period
    };
  },

  // Calculate search performance score
  calculatePerformanceScore(
    successRate: number,
    avgDuration: number,
    clickPosition: number
  ): number {
    // Normalize metrics to 0-1 scale and weight them
    const successWeight = 0.5;
    const speedWeight = 0.3;
    const relevanceWeight = 0.2;

    const speedScore = Math.max(0, 1 - (avgDuration / 5000)); // 5 seconds = 0 score
    const relevanceScore = Math.max(0, 1 - (clickPosition - 1) / 9); // Position 10 = 0 score

    return (
      successRate * successWeight +
      speedScore * speedWeight +
      relevanceScore * relevanceWeight
    );
  },

  // Determine search quality category
  getSearchQualityCategory(performanceScore: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (performanceScore >= 0.8) return 'excellent';
    if (performanceScore >= 0.6) return 'good';
    if (performanceScore >= 0.4) return 'fair';
    return 'poor';
  }
};

// Utility Functions
export const searchUtils = {
  // Clean and normalize search term
  normalizeSearchTerm(term: string): string {
    return term
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s-]/g, ''); // Remove special characters except hyphens
  },

  // Extract keywords from search term
  extractKeywords(term: string): string[] {
    return this.normalizeSearchTerm(term)
      .split(' ')
      .filter(word => word.length > 2) // Remove very short words
      .slice(0, 10); // Limit to 10 keywords
  },

  // Generate search query variations
  generateQueryVariations(query: string): string[] {
    const variations = new Set<string>();
    
    // Original query
    variations.add(query);
    
    // Lowercase
    variations.add(query.toLowerCase());
    
    // Without special characters
    variations.add(query.replace(/[^\w\s]/g, ''));
    
    // Individual words
    query.split(/\s+/).forEach(word => {
      if (word.length > 2) {
        variations.add(word);
      }
    });
    
    return Array.from(variations);
  },

  // Check if search term is valid
  isValidSearchTerm(term: string): boolean {
    if (!term || typeof term !== 'string') return false;
    
    const trimmed = term.trim();
    if (trimmed.length < 1 || trimmed.length > 1000) return false;
    
    // Check for suspicious patterns
    if (/^[^a-zA-Z0-9]*$/.test(trimmed)) return false; // Only special characters
    if (/(.)\1{10,}/.test(trimmed)) return false; // Too many repeated characters
    
    return true;
  },

  // Format search duration for display
  formatSearchDuration(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  },

  // Format success rate for display
  formatSuccessRate(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
  },

  // Get search type display name
  getSearchTypeDisplayName(type: SearchType): string {
    const displayNames: Record<SearchType, string> = {
      dogs: 'Dogs',
      users: 'Users',
      shows: 'Shows',
      clubs: 'Clubs',
      classes: 'Classes',
      achievements: 'Achievements',
      competitions: 'Competitions',
      judges: 'Judges',
      registrations: 'Registrations',
      health_records: 'Health Records',
      global: 'Global Search',
      advanced: 'Advanced Search'
    };

    return displayNames[type] || type;
  }
};