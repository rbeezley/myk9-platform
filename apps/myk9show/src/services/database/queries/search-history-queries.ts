/**
 * Search History Database Queries
 *
 * CRUD operations and query methods for the search_history table.
 * Handles creating, reading, updating, and deleting search history entries,
 * plus convenience methods for recent searches and unique term extraction.
 */

import type {
  SearchHistory,
  CreateSearchHistoryData,
  UpdateSearchHistoryData,
  SearchHistoryFilters,
} from '../../../types/search-analytics';
import { searchHistoryMappers } from '../../mappers/searchMappers';
import { untypedFrom, type SearchHistoryRow } from './search-query-helpers';

export const searchHistoryQueries = {
  // Create new search history entry
  async create(data: CreateSearchHistoryData): Promise<SearchHistory> {
    const dbData = searchHistoryMappers.toDatabase(data);
    const { data: searchHistory, error } = await untypedFrom('search_history')
      .insert([dbData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create search history: ${(error as Error).message}`);
    }

    return searchHistoryMappers.fromDatabase(searchHistory as SearchHistoryRow);
  },

  // Get search history by ID
  async getById(id: string): Promise<SearchHistory | null> {
    const { data: searchHistory, error } = await untypedFrom('search_history')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch search history: ${(error as Error).message}`);
    }

    return searchHistoryMappers.fromDatabase(searchHistory as SearchHistoryRow);
  },

  // Get search history for a user
  async getByUserId(userId: string, filters?: SearchHistoryFilters): Promise<SearchHistory[]> {
    let query: ReturnType<typeof untypedFrom> = untypedFrom('search_history')
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
      throw new Error(`Failed to fetch search history: ${(error as Error).message}`);
    }

    return ((searchHistory as SearchHistoryRow[]) || []).map(item =>
      searchHistoryMappers.fromDatabase(item)
    );
  },

  // Update search history (typically for click tracking)
  async update(data: UpdateSearchHistoryData): Promise<SearchHistory> {
    const { id, ...updateData } = data;

    const { data: searchHistory, error } = await untypedFrom('search_history')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update search history: ${(error as Error).message}`);
    }

    return searchHistoryMappers.fromDatabase(searchHistory as SearchHistoryRow);
  },

  // Delete search history
  async delete(id: string): Promise<void> {
    const { error } = await untypedFrom('search_history').delete().eq('id', id);

    if (error) {
      throw new Error(`Failed to delete search history: ${(error as Error).message}`);
    }
  },

  // Get recent searches for user
  async getRecentSearches(userId: string, limit: number = 10): Promise<SearchHistory[]> {
    const { data: searches, error } = await untypedFrom('search_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch recent searches: ${(error as Error).message}`);
    }

    return ((searches as SearchHistoryRow[]) || []).map(item =>
      searchHistoryMappers.fromDatabase(item)
    );
  },

  // Get unique search terms for user
  async getUniqueSearchTerms(userId: string, limit: number = 20): Promise<string[]> {
    const { data: searches, error } = await untypedFrom('search_history')
      .select('search_term')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100); // Get more to deduplicate

    if (error) {
      throw new Error(`Failed to fetch search terms: ${(error as Error).message}`);
    }

    // Deduplicate and limit
    const uniqueTerms = [
      ...new Set(((searches as SearchHistoryRow[]) || []).map(s => s.search_term)),
    ];
    return uniqueTerms.slice(0, limit);
  },

  // Batch create search history entries
  async batchCreate(entries: CreateSearchHistoryData[]): Promise<SearchHistory[]> {
    const dbEntries = entries.map(entry => searchHistoryMappers.toDatabase(entry));
    const { data: searchHistory, error } = await untypedFrom('search_history')
      .insert(dbEntries)
      .select();

    if (error) {
      throw new Error(`Failed to create search history batch: ${(error as Error).message}`);
    }

    return ((searchHistory as SearchHistoryRow[]) || []).map(item =>
      searchHistoryMappers.fromDatabase(item)
    );
  },
};
