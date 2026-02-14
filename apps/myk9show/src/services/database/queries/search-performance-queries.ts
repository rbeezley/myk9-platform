/**
 * Search Performance Database Queries
 *
 * Performance analytics for the search system, including average durations,
 * success rates, slow query detection, failed search grouping, and
 * period-based date filtering.
 */

import type {
  SearchPerformanceMetrics,
  SearchPeriod
} from '../../../types/search-analytics';
import { searchAnalyticsQueries } from './search-analytics-queries';
import { untypedFrom } from './search-query-helpers';

// Row shapes for partial-select queries on the search_history table
interface MetricsRow {
  search_duration_ms: number | null;
  results_found: boolean | null;
}

interface SlowQueryRow {
  search_term: string;
  search_duration_ms: number | null;
}

interface FailedSearchRow {
  search_term: string;
  created_at: string | null;
}

export const searchPerformanceQueries = {
  // Get performance metrics
  async getPerformanceMetrics(period: SearchPeriod = 'last_month'): Promise<SearchPerformanceMetrics> {
    const dateFilter = this.getPeriodDateFilter(period);

    // Get basic metrics
    const { data: metrics, error: metricsError } = await untypedFrom('search_history')
      .select('search_duration_ms, results_found')
      .gte('created_at', dateFilter);

    if (metricsError) {
      throw new Error(`Failed to fetch performance metrics: ${(metricsError as Error).message}`);
    }

    const typedMetrics = (metrics as MetricsRow[]) || [];
    const totalSearches = typedMetrics.length;
    const successfulSearches = typedMetrics.filter(m => m.results_found).length;
    const avgDuration = typedMetrics.reduce((sum, m) => sum + (m.search_duration_ms || 0), 0);

    // Get popular terms
    const popularTerms = await searchAnalyticsQueries.getPopularSearches(undefined, 10);

    // Get slow queries
    const { data: slowQueries } = await untypedFrom('search_history')
      .select('search_term, search_duration_ms')
      .gte('created_at', dateFilter)
      .gte('search_duration_ms', 1000)
      .order('search_duration_ms', { ascending: false })
      .limit(10);

    const typedSlowQueries = ((slowQueries as SlowQueryRow[]) || []).filter(
      (q): q is SlowQueryRow & { search_duration_ms: number } => q.search_duration_ms !== null
    );
    const slowQueriesSummary = this.groupSlowQueries(typedSlowQueries);

    // Get failed searches
    const { data: failedSearches } = await untypedFrom('search_history')
      .select('search_term, created_at')
      .eq('results_found', false)
      .gte('created_at', dateFilter)
      .order('created_at', { ascending: false });

    const typedFailedSearches = ((failedSearches as FailedSearchRow[]) || []).filter(
      (f): f is FailedSearchRow & { created_at: string } => f.created_at !== null
    );
    const failedSearchesSummary = this.groupFailedSearches(typedFailedSearches);

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
