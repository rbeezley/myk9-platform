import { useState, useEffect, useMemo, useCallback } from 'react';
import { useShowStore } from '@/store/showStore';
import { useRoleBasedDogs, useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { globalSearchIndex, createSearchableItem, SearchResult, SearchOptions } from '@/utils/searchIndex';
import { useDebounce } from './useDebounce';
import { useSearchAnalytics } from '@/lib/searchCache';

interface UseGlobalSearchOptions {
  debounceMs?: number;
  maxResults?: number;
  categories?: Array<'dog' | 'person' | 'show' | 'club'>;
  minScore?: number;
}

interface UseGlobalSearchResult {
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  isIndexReady: boolean;
  suggestions: string[];
  stats: {
    totalItems: number;
    indexedTerms: number;
    ready: boolean;
  };
  clearSearch: () => void;
}

/**
 * Hook for performing global search across all data types
 * Automatically maintains search index and provides debounced search
 */
export function useGlobalSearch(options: UseGlobalSearchOptions = {}): UseGlobalSearchResult {
  const {
    debounceMs = 300,
    maxResults = 50,
    categories = [],
    minScore = 0.1
  } = options;

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isIndexReady, setIsIndexReady] = useState(false);

  // Get data from stores - use role-based filtering for dogs and people
  const dogs = useRoleBasedDogs();
  const people = useRoleBasedPeople();
  const shows = useShowStore(state => state.shows);

  // Debounce the search query
  const debouncedQuery = useDebounce(query, debounceMs);

  // Build search index when data changes
  useEffect(() => {
    const buildIndex = async () => {
      setIsSearching(true);

      try {
        globalSearchIndex.clear();

        const dogItems = dogs.map(dog => createSearchableItem('dog', dog as unknown as Record<string, unknown>));
        const peopleItems = people.map(person => createSearchableItem('person', person as unknown as Record<string, unknown>));
        const showItems = shows.map(show => createSearchableItem('show', show as unknown as Record<string, unknown>));

        const searchableItems = [...dogItems, ...peopleItems, ...showItems];

        // Use requestIdleCallback for non-blocking index building
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            globalSearchIndex.addItems(searchableItems);
            setIsIndexReady(true);
            setIsSearching(false);
          });
        } else {
          setTimeout(() => {
            globalSearchIndex.addItems(searchableItems);
            setIsIndexReady(true);
            setIsSearching(false);
          }, 0);
        }
      } catch {
        setIsIndexReady(false);
        setIsSearching(false);
      }
    };

    buildIndex();
  }, [dogs, people, shows]);

  const { logSearch } = useSearchAnalytics();
  const stableLogSearch = useCallback(logSearch, [logSearch]);

  // Perform search when debounced query changes
  const results = useMemo(() => {
    if (!isIndexReady || !debouncedQuery.trim()) {
      return [];
    }

    setIsSearching(true);
    const searchStartTime = performance.now();

    try {
      const searchOptions: SearchOptions = {
        maxResults,
        ...(categories.length > 0 && { categories }),
        minScore,
        fuzzyThreshold: 0.6
      };

      const searchResults = globalSearchIndex.search(debouncedQuery, searchOptions);

      const responseTime = performance.now() - searchStartTime;
      stableLogSearch({
        query: debouncedQuery,
        context: 'global',
        resultCount: searchResults.length,
        responseTime,
        cacheHit: false,
        timestamp: Date.now()
      });

      return searchResults;
    } catch {
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [debouncedQuery, isIndexReady, maxResults, categories, minScore, stableLogSearch]);

  // Get search suggestions
  const suggestions = useMemo(() => {
    if (!isIndexReady || query.length < 2) {
      return [];
    }
    return globalSearchIndex.getSuggestions(query, 5);
  }, [query, isIndexReady]);

  // Get index statistics
  const stats = useMemo(() => globalSearchIndex.getStats(), []);

  const clearSearch = useCallback(() => setQuery(''), []);

  return {
    query,
    setQuery,
    results,
    isSearching: isSearching || (debouncedQuery !== query && query.length > 0),
    isIndexReady,
    suggestions,
    stats,
    clearSearch
  };
}

/**
 * Hook for category-specific search
 */
export function useCategorySearch(category: 'dog' | 'person' | 'show' | 'club', options: UseGlobalSearchOptions = {}) {
  return useGlobalSearch({
    ...options,
    categories: [category]
  });
}

/**
 * Hook for quick search (fewer results, faster)
 */
export function useQuickSearch(options: UseGlobalSearchOptions = {}) {
  return useGlobalSearch({
    debounceMs: 150,
    maxResults: 10,
    ...options
  });
}
