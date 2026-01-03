/**
 * useFAQ Hook
 *
 * React hook for consuming FAQ data with automatic caching
 * and offline support.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getFAQData,
  refreshFAQData,
  searchFAQ,
  subscribeToCacheUpdates,
} from './FAQService';
import type { FAQCategoryWithItems, FAQItem } from './types';
import { logger } from '@/utils/logger';

interface UseFAQReturn {
  /** FAQ categories with their items */
  categories: FAQCategoryWithItems[];
  /** Loading state (true during initial load) */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refresh data from Supabase */
  refresh: () => Promise<void>;
  /** Search FAQ items by keyword */
  search: (query: string) => Promise<FAQItem[]>;
}

/**
 * Hook for accessing FAQ data with offline support
 *
 * @param filterCategoryIds - Optional array of category IDs to filter
 * @returns FAQ data and utility functions
 *
 * @example
 * const { categories, isLoading, refresh } = useFAQ();
 *
 * @example
 * // Filter to specific categories
 * const { categories } = useFAQ(['notifications', 'getting-started']);
 */
export function useFAQ(filterCategoryIds?: string[]): UseFAQReturn {
  const [categories, setCategories] = useState<FAQCategoryWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load FAQ data
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const data = await getFAQData();

      // Apply category filter if specified
      const filtered = filterCategoryIds
        ? data.filter((cat) => filterCategoryIds.includes(cat.id))
        : data;

      setCategories(filtered);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load FAQ data';
      logger.error('[useFAQ] Load error:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [filterCategoryIds]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to cache updates
  useEffect(() => {
    const unsubscribe = subscribeToCacheUpdates(() => {
      logger.log('[useFAQ] Cache updated, reloading data');
      loadData();
    });

    return unsubscribe;
  }, [loadData]);

  // Refresh handler
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const data = await refreshFAQData();

      // Apply category filter if specified
      const filtered = filterCategoryIds
        ? data.filter((cat) => filterCategoryIds.includes(cat.id))
        : data;

      setCategories(filtered);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh FAQ data';
      logger.error('[useFAQ] Refresh error:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [filterCategoryIds]);

  // Search handler
  const search = useCallback(async (query: string): Promise<FAQItem[]> => {
    return searchFAQ(query);
  }, []);

  return {
    categories,
    isLoading,
    error,
    refresh,
    search,
  };
}

/**
 * Hook for searching FAQ items
 *
 * @param query - Search query string
 * @returns Search results and loading state
 *
 * @example
 * const { results, isSearching } = useFAQSearch(searchQuery);
 */
export function useFAQSearch(query: string) {
  const [results, setResults] = useState<FAQItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);

    // Debounce search
    const timeoutId = setTimeout(async () => {
      try {
        const searchResults = await searchFAQ(query);
        setResults(searchResults);
      } catch (err) {
        logger.error('[useFAQSearch] Search error:', err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  return {
    results,
    isSearching,
  };
}

export default useFAQ;
