/**
 * Search Suggestion Database Queries
 *
 * Provides search suggestions and autocomplete functionality by querying
 * the search_analytics and search_history tables for matching terms.
 */

import type {
  SearchSuggestion,
  SearchType
} from '../../../types/search-analytics';
import {
  type SearchAnalyticsRow,
  type SearchHistoryRow
} from './search-query-helpers';
import { untypedFrom } from '../_shared/untyped-from';

export const searchSuggestionQueries = {
  // Get search suggestions based on query
  async getSuggestions(query: string, searchType?: SearchType, limit: number = 10): Promise<SearchSuggestion[]> {
    let analyticsQuery = untypedFrom('search_analytics')
      .select('search_term, search_type, frequency, success_rate')
      .ilike('search_term', `${query}%`)
      .order('frequency', { ascending: false })
      .limit(limit);

    if (searchType) {
      analyticsQuery = analyticsQuery.eq('search_type', searchType);
    }

    const { data: suggestions, error } = await analyticsQuery;

    if (error) {
      throw new Error(`Failed to fetch suggestions: ${(error as Error).message}`);
    }

    return ((suggestions as SearchAnalyticsRow[]) || []).map(item => ({
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
    const { data: analytics } = await untypedFrom('search_analytics')
      .select('search_term')
      .ilike('search_term', `${query}%`)
      .order('frequency', { ascending: false })
      .limit(limit);

    (analytics as SearchAnalyticsRow[] | null)?.forEach(item => suggestions.add(item.search_term));

    // Get from user history if userId provided
    if (userId) {
      const { data: history } = await untypedFrom('search_history')
        .select('search_term')
        .eq('user_id', userId)
        .ilike('search_term', `${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      (history as SearchHistoryRow[] | null)?.forEach(item => suggestions.add(item.search_term));
    }

    return Array.from(suggestions).slice(0, limit);
  }
};
