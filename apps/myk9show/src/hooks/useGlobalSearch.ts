import { useState, useEffect, useMemo, useCallback } from 'react';
// Removed unused imports - using role-based data hooks instead
import { useShowStore } from '@/store/showStore';
import { useRoleBasedDogs, useRoleBasedPeople } from '@/hooks/useRoleBasedData';
import { globalSearchIndex, createSearchableItem, SearchResult, SearchOptions } from '@/utils/searchIndex';
import { useDebounce } from './useDebounce';
import { debugSearchIndex, debugDogData } from '@/utils/debugSearch';
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
  // const clubs = useClubStore(state => state.clubs); // When available

  // Debounce the search query
  const debouncedQuery = useDebounce(query, debounceMs);

  // Build search index when data changes
  useEffect(() => {
    const buildIndex = async () => {
      setIsSearching(true);
      
      try {
        // Clear existing index
        globalSearchIndex.clear();
        
        // Add all items to index
        console.log('🔍 Building search index with data:', { 
          dogsCount: dogs.length, 
          peopleCount: people.length, 
          showsCount: shows.length,
          totalExpected: dogs.length + people.length + shows.length
        });
        
        // Check localStorage to see if stores are being overridden
        const dogStorage = localStorage.getItem('myk9show-dogs-storage');
        const peopleStorage = localStorage.getItem('myk9show-user-storage');
        const showStorage = localStorage.getItem('myk9show-shows-storage');
        
        console.log('🗄️ LocalStorage check:', {
          dogStorage: dogStorage ? JSON.parse(dogStorage) : 'null',
          peopleStorage: peopleStorage ? JSON.parse(peopleStorage) : 'null',
          showStorage: showStorage ? JSON.parse(showStorage) : 'null'
        });
        
        // Log first few dogs for debugging
        if (dogs.length > 0) {
          console.log('🐕 First few dogs:', dogs.slice(0, 3).map(d => ({ 
            id: d.id, 
            name: d.name, 
            callName: d.callName 
          })));
        } else {
          console.log('❌ No dogs in store');
        }
        
        // If no data, force reload mock data and rebuild
        if (dogs.length === 0 && people.length === 0 && shows.length === 0) {
          console.log('⚠️ No data available, clearing localStorage and forcing reload...');
          
          // Clear localStorage to force stores to reload with mock data
          const keys = [
            'myk9show-dogs-storage',
            'myk9show-user-storage', 
            'myk9show-shows-storage'
          ];
          
          keys.forEach(key => {
            localStorage.removeItem(key);
            console.log(`🗑️ Cleared ${key}`);
          });
          
          setIsSearching(false);
          setIsIndexReady(false);
          
          // Force page reload to reinitialize with mock data
          console.log('🔄 Reloading page to reinitialize stores...');
          setTimeout(() => {
            window.location.reload();
          }, 500);
          return;
        }
        
        const dogItems = dogs.map(dog => createSearchableItem('dog', dog as unknown as Record<string, unknown>));
        const peopleItems = people.map(person => createSearchableItem('person', person as unknown as Record<string, unknown>));
        const showItems = shows.map(show => createSearchableItem('show', show as unknown as Record<string, unknown>));
        
        const searchableItems = [
          ...dogItems,
          ...peopleItems,
          ...showItems,
          // ...clubs.map(club => createSearchableItem('club', club)), // When available
        ];
        
        console.log('Created searchable items by type:', {
          dogs: dogItems.length,
          people: peopleItems.length,
          shows: showItems.length,
          total: searchableItems.length
        });
        
        // Check for ID conflicts
        const allIds = searchableItems.map(item => item.id);
        const uniqueIds = new Set(allIds);
        if (allIds.length !== uniqueIds.size) {
          console.warn('⚠️ ID conflicts detected!', {
            totalItems: allIds.length,
            uniqueIds: uniqueIds.size,
            conflicts: allIds.filter((id, index) => allIds.indexOf(id) !== index)
          });
        }
        
        console.log('Final searchable items:', searchableItems.length);
        
        // Use requestIdleCallback for non-blocking index building
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            globalSearchIndex.addItems(searchableItems);
            setIsIndexReady(true);
            setIsSearching(false);
            
            // Debug logging
            console.log('Search index built with', searchableItems.length, 'items');
            debugDogData(dogs);
            debugSearchIndex();
          });
        } else {
          // Fallback for browsers without requestIdleCallback
          setTimeout(() => {
            globalSearchIndex.addItems(searchableItems);
            setIsIndexReady(true);
            setIsSearching(false);
            
            // Debug logging
            console.log('Search index built with', searchableItems.length, 'items');
            debugDogData(dogs);
            debugSearchIndex();
          }, 0);
        }
      } catch (error) {
        console.error('Failed to build search index:', error);
        setIsIndexReady(false);
        setIsSearching(false);
      }
    };

    buildIndex();
  }, [dogs, people, shows]); // Rebuild when data changes

  // Get analytics hook
  const { logSearch } = useSearchAnalytics();
  
  // Create stable logSearch callback to prevent dependency churn
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
        categories: categories.length > 0 ? categories : undefined,
        minScore,
        fuzzyThreshold: 0.6
      };
      
      const searchResults = globalSearchIndex.search(debouncedQuery, searchOptions);
      
      // Log analytics
      const responseTime = performance.now() - searchStartTime;
      const analyticsData = {
        query: debouncedQuery,
        context: 'global',
        resultCount: searchResults.length,
        responseTime,
        cacheHit: false, // Global search doesn't use React Query cache
        timestamp: Date.now()
      };
      console.log('📊 Logging search analytics:', analyticsData);
      stableLogSearch(analyticsData);
      
      return searchResults;
    } catch (error) {
      console.error('Search failed:', error);
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
  const stats = useMemo(() => {
    return globalSearchIndex.getStats();
  }, []);

  // Clear search function
  const clearSearch = useCallback(() => {
    setQuery('');
  }, []);

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