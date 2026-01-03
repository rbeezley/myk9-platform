/**
 * Search & Analytics Database Queries
 * 
 * Comprehensive database operations for search functionality, search history tracking,
 * analytics aggregation, and performance monitoring across the myK9Show application.
 */

import { supabase } from '../supabaseClient';
import {
  SearchHistory,
  SearchAnalytics,
  CreateSearchHistoryData,
  UpdateSearchHistoryData,
  CreateSearchAnalyticsData,
  UpdateSearchAnalyticsData,
  SearchHistoryFilters,
  SearchAnalyticsFilters,
  FullTextSearchRequest,
  FullTextSearchResult,
  SearchSuggestion,
  PopularSearch,
  SearchPerformanceMetrics,
  SearchAnalyticsSummary,
  SearchableTable,
  SearchType,
  SearchPeriod
} from '../../../types/search-analytics';
import { searchHistoryMappers, searchAnalyticsMappers } from '../../mappers/searchMappers';

// Search History Operations
export const searchHistoryQueries = {
  // Create new search history entry
  async create(data: CreateSearchHistoryData): Promise<SearchHistory> {
    const dbData = searchHistoryMappers.toDatabase(data);
    const { data: searchHistory, error } = await supabase
      .from('search_history')
      .insert([dbData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create search history: ${error.message}`);
    }

    return searchHistoryMappers.fromDatabase(searchHistory);
  },

  // Get search history by ID
  async getById(id: string): Promise<SearchHistory | null> {
    const { data: searchHistory, error } = await supabase
      .from('search_history')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch search history: ${error.message}`);
    }

    return searchHistoryMappers.fromDatabase(searchHistory);
  },

  // Get search history for a user
  async getByUserId(userId: string, filters?: SearchHistoryFilters): Promise<SearchHistory[]> {
    let query = supabase
      .from('search_history')
      .select('*')
      .eq('user_id', userId);

    // Apply filters
    if (filters?.search_type) {
      query = query.eq('search_type', filters.search_type);
    }
    if (filters?.search_context) {
      query = query.eq('search_context', filters.search_context);
    }
    if (filters?.results_found !== undefined) {
      query = query.eq('results_found', filters.results_found);
    }
    if (filters?.session_id) {
      query = query.eq('session_id', filters.session_id);
    }
    if (filters?.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('created_at', filters.date_to);
    }
    if (filters?.search_term) {
      query = query.ilike('search_term', `%${filters.search_term}%`);
    }

    query = query.order('created_at', { ascending: false });

    const { data: searchHistory, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch search history: ${error.message}`);
    }

    return (searchHistory || []).map(item => searchHistoryMappers.fromDatabase(item));
  },

  // Update search history (typically for click tracking)
  async update(data: UpdateSearchHistoryData): Promise<SearchHistory> {
    const { id, ...updateData } = data;
    
    const { data: searchHistory, error } = await supabase
      .from('search_history')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update search history: ${error.message}`);
    }

    return searchHistoryMappers.fromDatabase(searchHistory);
  },

  // Delete search history
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('search_history')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete search history: ${error.message}`);
    }
  },

  // Get recent searches for user
  async getRecentSearches(userId: string, limit: number = 10): Promise<SearchHistory[]> {
    const { data: searches, error } = await supabase
      .from('search_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch recent searches: ${error.message}`);
    }

    return (searches || []).map(item => searchHistoryMappers.fromDatabase(item));
  },

  // Get unique search terms for user
  async getUniqueSearchTerms(userId: string, limit: number = 20): Promise<string[]> {
    const { data: searches, error } = await supabase
      .from('search_history')
      .select('search_term')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100); // Get more to deduplicate

    if (error) {
      throw new Error(`Failed to fetch search terms: ${error.message}`);
    }

    // Deduplicate and limit
    const uniqueTerms = [...new Set(searches?.map(s => s.search_term) || [])];
    return uniqueTerms.slice(0, limit);
  },

  // Batch create search history entries
  async batchCreate(entries: CreateSearchHistoryData[]): Promise<SearchHistory[]> {
    const dbEntries = entries.map(entry => searchHistoryMappers.toDatabase(entry));
    const { data: searchHistory, error } = await supabase
      .from('search_history')
      .insert(dbEntries)
      .select();

    if (error) {
      throw new Error(`Failed to create search history batch: ${error.message}`);
    }

    return (searchHistory || []).map(item => searchHistoryMappers.fromDatabase(item));
  }
};

// Search Analytics Operations
export const searchAnalyticsQueries = {
  // Create new analytics entry
  async create(data: CreateSearchAnalyticsData): Promise<SearchAnalytics> {
    const dbData = searchAnalyticsMappers.toDatabase(data);
    const { data: analytics, error } = await supabase
      .from('search_analytics')
      .insert([dbData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create search analytics: ${error.message}`);
    }

    return searchAnalyticsMappers.fromDatabase(analytics);
  },

  // Get analytics by ID
  async getById(id: string): Promise<SearchAnalytics | null> {
    const { data: analytics, error } = await supabase
      .from('search_analytics')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch search analytics: ${error.message}`);
    }

    return searchAnalyticsMappers.fromDatabase(analytics);
  },

  // Get all analytics with filters
  async getAll(filters?: SearchAnalyticsFilters): Promise<SearchAnalytics[]> {
    let query = supabase
      .from('search_analytics')
      .select('*');

    // Apply filters
    if (filters?.search_type) {
      query = query.eq('search_type', filters.search_type);
    }
    if (filters?.min_frequency) {
      query = query.gte('frequency', filters.min_frequency);
    }
    if (filters?.min_success_rate) {
      query = query.gte('success_rate', filters.min_success_rate);
    }
    if (filters?.date_from) {
      query = query.gte('last_searched_at', filters.date_from);
    }
    if (filters?.date_to) {
      query = query.lte('last_searched_at', filters.date_to);
    }
    if (filters?.search_term) {
      query = query.ilike('search_term', `%${filters.search_term}%`);
    }

    query = query.order('frequency', { ascending: false });

    const { data: analytics, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch search analytics: ${error.message}`);
    }

    return (analytics || []).map(item => searchAnalyticsMappers.fromDatabase(item));
  },

  // Update analytics
  async update(data: UpdateSearchAnalyticsData): Promise<SearchAnalytics> {
    const { id, ...updateData } = data;
    
    const { data: analytics, error } = await supabase
      .from('search_analytics')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update search analytics: ${error.message}`);
    }

    return analytics as SearchAnalytics;
  },

  // Delete analytics
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('search_analytics')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete search analytics: ${error.message}`);
    }
  },

  // Get popular search terms
  async getPopularSearches(searchType?: SearchType, limit: number = 20): Promise<PopularSearch[]> {
    let query = supabase
      .from('search_analytics')
      .select('search_term, search_type, frequency, success_rate, last_searched_at');

    if (searchType) {
      query = query.eq('search_type', searchType);
    }

    query = query
      .order('frequency', { ascending: false })
      .limit(limit);

    const { data: analytics, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch popular searches: ${error.message}`);
    }

    // Transform to PopularSearch format
    return (analytics || []).map(item => ({
      search_term: item.search_term,
      search_type: item.search_type as SearchType,
      frequency: item.frequency || 0,
      success_rate: item.success_rate || 0,
      trend: 'stable' as const, // Would need historical data for true trend
      period: 'all_time' as SearchPeriod
    }));
  },

  // Upsert analytics (create or update)
  async upsert(data: CreateSearchAnalyticsData): Promise<SearchAnalytics> {
    const { data: analytics, error } = await supabase
      .from('search_analytics')
      .upsert([data], { 
        onConflict: 'search_term,search_type',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert search analytics: ${error.message}`);
    }

    return analytics as SearchAnalytics;
  },

  // Aggregate search history into analytics
  async aggregateSearchHistory(): Promise<void> {
    // Note: This would need a custom RPC function in Supabase
    // For now, we'll implement basic aggregation logic
    try {
      // Get recent search history that hasn't been aggregated
      const { data: recentSearches, error } = await supabase
        .from('search_history')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        throw new Error(`Failed to fetch recent searches: ${error.message}`);
      }

      // Group by search term and type
      const aggregations: Record<string, {
        search_term: string;
        search_type: string;
        total_searches: number;
        successful_searches: number;
        total_duration: number;
        total_results: number;
        click_positions: number[];
        first_searched_at: string;
        last_searched_at: string;
      }> = {};
      recentSearches?.forEach(search => {
        const key = `${search.search_term}:${search.search_type}`;
        if (!aggregations[key]) {
          aggregations[key] = {
            search_term: search.search_term,
            search_type: search.search_type,
            total_searches: 0,
            successful_searches: 0,
            total_duration: 0,
            total_results: 0,
            click_positions: [],
            first_searched_at: search.created_at!,
            last_searched_at: search.created_at!
          };
        }

        const agg = aggregations[key];
        agg.total_searches++;
        if (search.results_found) agg.successful_searches++;
        if (search.search_duration_ms) agg.total_duration += search.search_duration_ms;
        if (search.results_count) agg.total_results += search.results_count;
        if (search.clicked_result_position) agg.click_positions.push(search.clicked_result_position);
        if (search.created_at && search.created_at > agg.last_searched_at) agg.last_searched_at = search.created_at;
        if (search.created_at && search.created_at < agg.first_searched_at) agg.first_searched_at = search.created_at;
      });

      // Upsert aggregated data
      for (const agg of Object.values(aggregations)) {
        const analyticsData: CreateSearchAnalyticsData = {
          search_term: agg.search_term,
          search_type: agg.search_type,
          frequency: agg.total_searches,
          success_rate: agg.total_searches > 0 ? agg.successful_searches / agg.total_searches : 0,
          avg_results_count: agg.total_searches > 0 ? agg.total_results / agg.total_searches : 0,
          avg_click_position: agg.click_positions.length > 0 ? 
            agg.click_positions.reduce((sum: number, pos: number) => sum + pos, 0) / agg.click_positions.length : undefined,
          avg_search_duration_ms: agg.total_searches > 0 ? agg.total_duration / agg.total_searches : 0,
          total_searches: agg.total_searches,
          successful_searches: agg.successful_searches,
          first_searched_at: agg.first_searched_at,
          last_searched_at: agg.last_searched_at,
          last_aggregated_at: new Date().toISOString()
        };

        await this.upsert(analyticsData);
      }
    } catch (error) {
      throw new Error(`Failed to aggregate search analytics: ${error}`);
    }
  }
};

// Full-Text Search Operations
export const fullTextSearchQueries = {
  // Perform full-text search across multiple tables
  async search(request: FullTextSearchRequest): Promise<FullTextSearchResult[]> {
    const results: FullTextSearchResult[] = [];

    for (const table of request.tables) {
      try {
        const tableResults = await this.searchTable(table, request);
        results.push(...tableResults);
      } catch (error) {
        console.error(`Search failed for table ${table}:`, error);
        // Continue with other tables
      }
    }

    // Sort by relevance score
    results.sort((a, b) => b.relevance_score - a.relevance_score);

    // Apply max results limit
    if (request.max_results) {
      return results.slice(0, request.max_results);
    }

    return results;
  },

  // Search specific table
  async searchTable(table: SearchableTable, request: FullTextSearchRequest): Promise<FullTextSearchResult[]> {
    const searchConfig = this.getTableSearchConfig(table);
    const actualTableName = this.getActualTableName(table);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseQuery = (supabase as any)
      .from(actualTableName)
      .select('*');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = baseQuery;

    // Apply table-specific search logic
    if (searchConfig.searchFields.length > 0) {
      const searchConditions = searchConfig.searchFields.map(field => 
        `${field}.ilike.%${request.query}%`
      ).join(',');
      
      query = query.or(searchConditions);
    }

    // Apply filters if provided for this table
    if (request.filters && request.filters[table]) {
      const filters = request.filters[table];
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
    }

    const { data: results, error } = await query.limit(100);

    if (error) {
      throw new Error(`Failed to search ${table}: ${error.message}`);
    }

    // Transform results to FullTextSearchResult format
    return (results || []).map((item: Record<string, unknown>) => {
      // Handle potential query errors
      if (!item || typeof item !== 'object' || (item && 'error' in item)) {
        return null;
      }
      
      const itemData = item as Record<string, unknown>;
      const relevanceScore = this.calculateRelevanceScore(
        itemData, 
        request.query, 
        searchConfig.searchFields,
        request.weights?.[table] || 1.0
      );

      // Skip results below minimum relevance
      if (request.min_relevance && relevanceScore < request.min_relevance) {
        return null;
      }

      return {
        table,
        id: String(itemData.id),
        title: this.extractTitle(itemData, searchConfig.titleField),
        content: this.extractContent(itemData, searchConfig.searchFields),
        relevance_score: relevanceScore,
        highlighted_content: this.highlightQuery(
          this.extractContent(itemData, searchConfig.searchFields),
          request.query
        ),
        data: itemData
      };
    }).filter(Boolean) as FullTextSearchResult[];
  },

  // Get search configuration for table
  getTableSearchConfig(table: SearchableTable) {
    const configs: Record<SearchableTable, { searchFields: string[], titleField: string }> = {
      dog: { searchFields: ['name', 'breed', 'registration_number'], titleField: 'name' },
      user: { searchFields: ['first_name', 'last_name', 'email', 'phone'], titleField: 'first_name' },
      show: { searchFields: ['name', 'location', 'description'], titleField: 'name' },
      club: { searchFields: ['name', 'location', 'description'], titleField: 'name' },
      class: { searchFields: ['name', 'description', 'level'], titleField: 'name' },
      achievement: { searchFields: ['title', 'organization', 'notes'], titleField: 'title' },
      competition: { searchFields: ['competition_name', 'location', 'notes'], titleField: 'competition_name' },
      judge_qualification: { searchFields: ['organization', 'qualification_level', 'notes'], titleField: 'organization' },
      registration: { searchFields: ['registration_number', 'organization', 'notes'], titleField: 'registration_number' },
      health_record: { searchFields: ['record_type', 'description', 'notes'], titleField: 'record_type' }
    };

    return configs[table] || { searchFields: ['name'], titleField: 'name' };
  },

  // Map logical table names to actual database table names
  getActualTableName(table: SearchableTable): string {
    const tableMap: Record<SearchableTable, string> = {
      dog: 'dog',
      user: 'user',
      show: 'show',
      club: 'club',
      class: 'class',
      achievement: 'achievement',
      competition: 'competition',
      judge_qualification: 'judge_qualification',
      registration: 'dog_registration', // Maps to actual table name
      health_record: 'health_record'
    };
    
    return tableMap[table] || table;
  },

  // Calculate relevance score
  calculateRelevanceScore(item: Record<string, unknown>, query: string, fields: string[], weight: number): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    fields.forEach(field => {
      const value = String(item[field] || '').toLowerCase();
      
      // Exact match gets highest score
      if (value === queryLower) {
        score += 10;
      }
      // Starts with query gets high score
      else if (value.startsWith(queryLower)) {
        score += 7;
      }
      // Contains query gets medium score
      else if (value.includes(queryLower)) {
        score += 5;
      }
      // Word boundary match gets lower score
      else if (new RegExp(`\\b${queryLower}`, 'i').test(value)) {
        score += 3;
      }
    });

    return score * weight;
  },

  // Extract title from item
  extractTitle(item: Record<string, unknown>, titleField: string): string {
    return String(item[titleField] || item.name || item.id || 'Unknown');
  },

  // Extract content from item
  extractContent(item: Record<string, unknown>, fields: string[]): string {
    return fields
      .map(field => String(item[field] || ''))
      .filter(Boolean)
      .join(' ')
      .substring(0, 200);
  },

  // Highlight query in content
  highlightQuery(content: string, query: string): string {
    if (!query || !content) return content;
    
    const regex = new RegExp(`(${query})`, 'gi');
    return content.replace(regex, '<mark>$1</mark>');
  }
};

// Search Suggestions
export const searchSuggestionQueries = {
  // Get search suggestions based on query
  async getSuggestions(query: string, searchType?: SearchType, limit: number = 10): Promise<SearchSuggestion[]> {
    let analyticsQuery = supabase
      .from('search_analytics')
      .select('search_term, search_type, frequency, success_rate')
      .ilike('search_term', `${query}%`)
      .order('frequency', { ascending: false })
      .limit(limit);

    if (searchType) {
      analyticsQuery = analyticsQuery.eq('search_type', searchType);
    }

    const { data: suggestions, error } = await analyticsQuery;

    if (error) {
      throw new Error(`Failed to fetch suggestions: ${error.message}`);
    }

    return (suggestions || []).map(item => ({
      suggestion: item.search_term,
      type: item.search_type as SearchType,
      frequency: item.frequency || 0,
      success_rate: item.success_rate || 0
    }));
  },

  // Get autocomplete suggestions
  async getAutocompleteSuggestions(query: string, userId?: string, limit: number = 5): Promise<string[]> {
    const suggestions: Set<string> = new Set();

    // Get from analytics
    const { data: analytics } = await supabase
      .from('search_analytics')
      .select('search_term')
      .ilike('search_term', `${query}%`)
      .order('frequency', { ascending: false })
      .limit(limit);

    analytics?.forEach(item => suggestions.add(item.search_term));

    // Get from user history if userId provided
    if (userId) {
      const { data: history } = await supabase
        .from('search_history')
        .select('search_term')
        .eq('user_id', userId)
        .ilike('search_term', `${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      history?.forEach(item => suggestions.add(item.search_term));
    }

    return Array.from(suggestions).slice(0, limit);
  }
};

// Performance Analytics
export const searchPerformanceQueries = {
  // Get performance metrics
  async getPerformanceMetrics(period: SearchPeriod = 'last_month'): Promise<SearchPerformanceMetrics> {
    const dateFilter = this.getPeriodDateFilter(period);
    
    // Get basic metrics
    const { data: metrics, error: metricsError } = await supabase
      .from('search_history')
      .select('search_duration_ms, results_found')
      .gte('created_at', dateFilter);

    if (metricsError) {
      throw new Error(`Failed to fetch performance metrics: ${metricsError.message}`);
    }

    const totalSearches = metrics?.length || 0;
    const successfulSearches = metrics?.filter(m => m.results_found)?.length || 0;
    const avgDuration = metrics?.reduce((sum, m) => sum + (m.search_duration_ms || 0), 0) || 0;

    // Get popular terms
    const popularTerms = await searchAnalyticsQueries.getPopularSearches(undefined, 10);

    // Get slow queries
    const { data: slowQueries } = await supabase
      .from('search_history')
      .select('search_term, search_duration_ms')
      .gte('created_at', dateFilter)
      .gte('search_duration_ms', 1000)
      .order('search_duration_ms', { ascending: false })
      .limit(10);

    const slowQueriesSummary = this.groupSlowQueries((slowQueries || []).filter(q => q.search_duration_ms !== null) as Array<{ search_term: string; search_duration_ms: number }>);

    // Get failed searches
    const { data: failedSearches } = await supabase
      .from('search_history')
      .select('search_term, created_at')
      .eq('results_found', false)
      .gte('created_at', dateFilter)
      .order('created_at', { ascending: false });

    const failedSearchesSummary = this.groupFailedSearches((failedSearches || []).filter(f => f.created_at !== null) as Array<{ search_term: string; created_at: string }>);

    return {
      avg_search_duration_ms: totalSearches > 0 ? avgDuration / totalSearches : 0,
      total_searches: totalSearches,
      successful_searches: successfulSearches,
      success_rate: totalSearches > 0 ? successfulSearches / totalSearches : 0,
      popular_terms: popularTerms,
      slow_queries: slowQueriesSummary,
      failed_searches: failedSearchesSummary,
      search_trends: [] // Would need time-series data aggregation
    };
  },

  // Get period date filter
  getPeriodDateFilter(period: SearchPeriod): string {
    const now = new Date();
    const periods: Record<SearchPeriod, number> = {
      last_hour: 1,
      last_day: 24,
      last_week: 24 * 7,
      last_month: 24 * 30,
      last_quarter: 24 * 90,
      last_year: 24 * 365,
      all_time: 24 * 365 * 10 // 10 years
    };

    const hoursAgo = periods[period];
    const date = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    return date.toISOString();
  },

  // Group slow queries
  groupSlowQueries(queries: Array<{ search_term: string; search_duration_ms: number }>): Array<{
    query: string;
    avg_duration_ms: number;
    frequency: number;
  }> {
    const grouped: Record<string, { total_duration: number; count: number }> = {};

    queries.forEach(q => {
      if (!grouped[q.search_term]) {
        grouped[q.search_term] = { total_duration: 0, count: 0 };
      }
      grouped[q.search_term].total_duration += q.search_duration_ms;
      grouped[q.search_term].count++;
    });

    return Object.entries(grouped).map(([query, stats]) => ({
      query,
      avg_duration_ms: stats.total_duration / stats.count,
      frequency: stats.count
    }));
  },

  // Group failed searches
  groupFailedSearches(searches: Array<{ search_term: string; created_at: string }>): Array<{
    query: string;
    failure_rate: number;
    last_failed_at: string;
  }> {
    const grouped: Record<string, { failures: number; last_failed: string }> = {};

    searches.forEach(s => {
      if (!grouped[s.search_term]) {
        grouped[s.search_term] = { failures: 0, last_failed: s.created_at };
      }
      grouped[s.search_term].failures++;
      if (s.created_at > grouped[s.search_term].last_failed) {
        grouped[s.search_term].last_failed = s.created_at;
      }
    });

    return Object.entries(grouped).map(([query, stats]) => ({
      query,
      failure_rate: 1.0, // Would need total searches to calculate actual rate
      last_failed_at: stats.last_failed
    }));
  }
};

// Combined Analytics
export const searchAnalyticsOperations = {
  // Get comprehensive analytics summary
  async getAnalyticsSummary(period: SearchPeriod = 'last_month'): Promise<SearchAnalyticsSummary> {
    const dateFilter = searchPerformanceQueries.getPeriodDateFilter(period);
    
    // Get basic statistics
    const [historyStats, analyticsStats, performanceMetrics] = await Promise.all([
      this.getSearchHistoryStats(dateFilter),
      this.getSearchAnalyticsStats(),
      searchPerformanceQueries.getPerformanceMetrics(period)
    ]);

    return {
      total_searches: historyStats.total_searches,
      unique_search_terms: analyticsStats.unique_terms,
      avg_success_rate: performanceMetrics.success_rate,
      avg_search_duration_ms: performanceMetrics.avg_search_duration_ms,
      most_popular_types: analyticsStats.popular_types,
      trending_searches: performanceMetrics.popular_terms,
      performance_metrics: performanceMetrics,
      user_search_patterns: historyStats.user_patterns
    };
  },

  // Get search history statistics
  async getSearchHistoryStats(dateFilter: string) {
    const { data: history, error } = await supabase
      .from('search_history')
      .select('user_id, search_type, results_found')
      .gte('created_at', dateFilter);

    if (error) {
      throw new Error(`Failed to fetch history stats: ${error.message}`);
    }

    const uniqueUsers = new Set(history?.map(h => h.user_id) || []).size;
    const totalSearches = history?.length || 0;

    return {
      total_searches: totalSearches,
      user_patterns: {
        power_users: 0, // Would need more complex calculation
        casual_users: uniqueUsers,
        avg_searches_per_user: uniqueUsers > 0 ? totalSearches / uniqueUsers : 0,
        search_frequency_distribution: {}
      }
    };
  },

  // Get search analytics statistics
  async getSearchAnalyticsStats() {
    const { data: analytics, error } = await supabase
      .from('search_analytics')
      .select('search_type, frequency')
      .order('frequency', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch analytics stats: ${error.message}`);
    }

    const typeFrequency: Record<string, number> = {};
    analytics?.forEach(a => {
      typeFrequency[a.search_type] = (typeFrequency[a.search_type] || 0) + (a.frequency || 0);
    });

    const popularTypes = Object.entries(typeFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type]) => type as SearchType);

    return {
      unique_terms: analytics?.length || 0,
      popular_types: popularTypes
    };
  }
};