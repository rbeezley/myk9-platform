/**
 * Search Analytics Database Queries
 *
 * CRUD operations for the search_analytics table, including popular search
 * retrieval, upsert logic, and aggregation of search history into analytics.
 */

import type {
  SearchAnalytics,
  CreateSearchAnalyticsData,
  UpdateSearchAnalyticsData,
  SearchAnalyticsFilters,
  PopularSearch,
  SearchType,
  SearchPeriod
} from '../../../types/search-analytics';
import { searchAnalyticsMappers } from '../../mappers/searchMappers';
import { untypedFrom, type SearchHistoryRow } from './search-query-helpers';

export const searchAnalyticsQueries = {
  // Create new analytics entry
  async create(data: CreateSearchAnalyticsData): Promise<SearchAnalytics> {
    const dbData = searchAnalyticsMappers.toDatabase(data);
    const { data: analytics, error } = await untypedFrom('search_analytics')
      .insert([dbData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create search analytics: ${(error as Error).message}`);
    }

    return searchAnalyticsMappers.fromDatabase(analytics as Record<string, unknown>);
  },

  // Get analytics by ID
  async getById(id: string): Promise<SearchAnalytics | null> {
    const { data: analytics, error } = await untypedFrom('search_analytics')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch search analytics: ${(error as Error).message}`);
    }

    return searchAnalyticsMappers.fromDatabase(analytics as Record<string, unknown>);
  },

  // Get all analytics with filters
  async getAll(filters?: SearchAnalyticsFilters): Promise<SearchAnalytics[]> {
    let query = untypedFrom('search_analytics')
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
      throw new Error(`Failed to fetch search analytics: ${(error as Error).message}`);
    }

    return ((analytics as Record<string, unknown>[]) || []).map(item => searchAnalyticsMappers.fromDatabase(item));
  },

  // Update analytics
  async update(data: UpdateSearchAnalyticsData): Promise<SearchAnalytics> {
    const { id, ...updateData } = data;

    const { data: analytics, error } = await untypedFrom('search_analytics')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update search analytics: ${(error as Error).message}`);
    }

    return analytics as SearchAnalytics;
  },

  // Delete analytics
  async delete(id: string): Promise<void> {
    const { error } = await untypedFrom('search_analytics')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete search analytics: ${(error as Error).message}`);
    }
  },

  // Get popular search terms
  async getPopularSearches(searchType?: SearchType, limit: number = 20): Promise<PopularSearch[]> {
    let query = untypedFrom('search_analytics')
      .select('search_term, search_type, frequency, success_rate, last_searched_at');

    if (searchType) {
      query = query.eq('search_type', searchType);
    }

    query = query
      .order('frequency', { ascending: false })
      .limit(limit);

    const { data: analytics, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch popular searches: ${(error as Error).message}`);
    }

    // Transform to PopularSearch format
    return ((analytics as Array<{ search_term: string; search_type: string; frequency: number; success_rate: number }>) || []).map(item => ({
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
    const { data: analytics, error } = await untypedFrom('search_analytics')
      .upsert([data], {
        onConflict: 'search_term,search_type',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert search analytics: ${(error as Error).message}`);
    }

    return analytics as SearchAnalytics;
  },

  // Aggregate search history into analytics
  async aggregateSearchHistory(): Promise<void> {
    // Note: This would need a custom RPC function in Supabase
    // For now, we'll implement basic aggregation logic
    try {
      // Get recent search history that hasn't been aggregated
      const { data: recentSearches, error } = await untypedFrom('search_history')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        throw new Error(`Failed to fetch recent searches: ${(error as Error).message}`);
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
      ((recentSearches as SearchHistoryRow[]) || []).forEach(search => {
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
        const avgClickPos = agg.click_positions.length > 0 ?
          agg.click_positions.reduce((sum: number, pos: number) => sum + pos, 0) / agg.click_positions.length : undefined;
        const analyticsData: CreateSearchAnalyticsData = {
          search_term: agg.search_term,
          search_type: agg.search_type,
          frequency: agg.total_searches,
          success_rate: agg.total_searches > 0 ? agg.successful_searches / agg.total_searches : 0,
          avg_results_count: agg.total_searches > 0 ? agg.total_results / agg.total_searches : 0,
          ...(avgClickPos !== undefined && { avg_click_position: avgClickPos }),
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
