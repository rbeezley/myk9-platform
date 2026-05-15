/**
 * Combined Search Analytics Operations
 *
 * High-level analytics operations that aggregate data from multiple
 * search-related tables to produce comprehensive summaries and statistics.
 */

import type {
  SearchAnalyticsSummary,
  SearchType,
  SearchPeriod
} from '../../../types/search-analytics';
import { searchPerformanceQueries } from './search-performance-queries';
import { untypedFrom } from '../_shared/untyped-from';
import { type SearchAnalyticsRow } from './search-query-helpers';

// Row shape for the partial select on search_history used by history stats
interface HistoryStatsRow {
  user_id: string;
  search_type: string;
  results_found: boolean | null;
}

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
    const { data: history, error } = await untypedFrom('search_history')
      .select('user_id, search_type, results_found')
      .gte('created_at', dateFilter);

    if (error) {
      throw new Error(`Failed to fetch history stats: ${(error as Error).message}`);
    }

    const typedHistory = (history as HistoryStatsRow[]) || [];
    const uniqueUsers = new Set(typedHistory.map(h => h.user_id)).size;
    const totalSearches = typedHistory.length;

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
    const { data: analytics, error } = await untypedFrom('search_analytics')
      .select('search_type, frequency')
      .order('frequency', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch analytics stats: ${(error as Error).message}`);
    }

    const typedAnalytics = (analytics as SearchAnalyticsRow[]) || [];
    const typeFrequency: Record<string, number> = {};
    typedAnalytics.forEach(a => {
      typeFrequency[a.search_type] = (typeFrequency[a.search_type] || 0) + (a.frequency || 0);
    });

    const popularTypes = Object.entries(typeFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type]) => type as SearchType);

    return {
      unique_terms: typedAnalytics.length,
      popular_types: popularTypes
    };
  }
};
