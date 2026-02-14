/**
 * Debounced search hook with caching.
 * Provides query state management, loading/error states, and automatic
 * debouncing of search requests to reduce API calls.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createDebouncedSearch } from './performance-optimization-utils';

export function useDebouncedSearch<T>(
  searchFunction: (query: string) => Promise<T[]>,
  debounceMs: number = 300
) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useMemo(() => {
    return createDebouncedSearch(searchFunction, debounceMs);
  }, [searchFunction, debounceMs]);

  useEffect(() => {
    if (!query.trim()) {
      queueMicrotask(() => {
        setResults([]);
        setLoading(false);
        setError(null);
      });
      return;
    }

    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    debouncedSearch(query)
      .then(searchResults => {
        setResults(searchResults);
        setError(null);
      })
      .catch(err => {
        setError(err.message || 'Search failed');
        setResults([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [query, debouncedSearch]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
  }, []);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    clearSearch
  };
}
