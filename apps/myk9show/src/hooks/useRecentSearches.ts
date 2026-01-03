import { useState, useEffect, useCallback } from 'react';

export interface RecentSearch {
  id: string;
  query: string;
  timestamp: number;
  context: string; // e.g., 'dogs', 'people', 'shows'
  metadata?: {
    resultCount?: number;
    filters?: Record<string, unknown>;
    selectedCommand?: string;
  };
}

interface UseRecentSearchesOptions {
  maxItems?: number;
  storageKey?: string;
  context: string;
}

const DEFAULT_OPTIONS: Required<Omit<UseRecentSearchesOptions, 'context'>> = {
  maxItems: 10,
  storageKey: 'myK9Show_recentSearches'
};

export function useRecentSearches(options: UseRecentSearchesOptions) {
  const { maxItems, storageKey, context } = { ...DEFAULT_OPTIONS, ...options };
  
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const allSearches: RecentSearch[] = JSON.parse(stored);
        // Filter by context and sort by timestamp (most recent first)
        const contextSearches = allSearches
          .filter(search => search.context === context)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, maxItems);
        setRecentSearches(contextSearches);
      }
    } catch (error) {
      console.warn('Failed to load recent searches:', error);
      setRecentSearches([]);
    }
  }, [storageKey, context, maxItems]);

  // Save recent searches to localStorage
  const saveToStorage = useCallback((searches: RecentSearch[]) => {
    try {
      // Load all searches from storage
      const stored = localStorage.getItem(storageKey);
      const allSearches: RecentSearch[] = stored ? JSON.parse(stored) : [];
      
      // Remove old searches for this context
      const otherContextSearches = allSearches.filter(search => search.context !== context);
      
      // Combine with new searches for this context
      const updatedSearches = [...otherContextSearches, ...searches];
      
      // Save back to localStorage
      localStorage.setItem(storageKey, JSON.stringify(updatedSearches));
    } catch (error) {
      console.warn('Failed to save recent searches:', error);
    }
  }, [storageKey, context]);

  // Add a new search
  const addSearch = useCallback((query: string, metadata?: RecentSearch['metadata']) => {
    if (!query.trim()) return;

    const newSearch: RecentSearch = {
      id: `${context}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      query: query.trim(),
      timestamp: Date.now(),
      context,
      metadata
    };

    setRecentSearches(prev => {
      // Remove any existing search with the same query
      const filtered = prev.filter(search => 
        search.query.toLowerCase() !== query.toLowerCase()
      );
      
      // Add new search at the beginning and limit to maxItems
      const updated = [newSearch, ...filtered].slice(0, maxItems);
      
      // Save to localStorage
      saveToStorage(updated);
      
      return updated;
    });
  }, [context, maxItems, saveToStorage]);

  // Remove a specific search
  const removeSearch = useCallback((searchId: string) => {
    setRecentSearches(prev => {
      const updated = prev.filter(search => search.id !== searchId);
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  // Clear all recent searches for this context
  const clearSearches = useCallback(() => {
    setRecentSearches([]);
    saveToStorage([]);
  }, [saveToStorage]);

  // Get search suggestions based on current query
  const getSuggestions = useCallback((currentQuery: string, limit: number = 5): RecentSearch[] => {
    if (!currentQuery.trim()) {
      return recentSearches.slice(0, limit);
    }

    const query = currentQuery.toLowerCase();
    return recentSearches
      .filter(search => search.query.toLowerCase().includes(query))
      .slice(0, limit);
  }, [recentSearches]);

  // Get most frequent searches
  const getFrequentSearches = useCallback((limit: number = 5): { query: string; count: number }[] => {
    const queryCount = new Map<string, number>();
    
    recentSearches.forEach(search => {
      const query = search.query.toLowerCase();
      queryCount.set(query, (queryCount.get(query) || 0) + 1);
    });

    return Array.from(queryCount.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }, [recentSearches]);

  return {
    recentSearches,
    addSearch,
    removeSearch,
    clearSearches,
    getSuggestions,
    getFrequentSearches
  };
}