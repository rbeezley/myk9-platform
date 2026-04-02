// Optimized search hooks with debouncing and deduplication
// Phase 3.2: Advanced Query Optimizations

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useDebounce, useSearchDeduplication, usePaginationConfig } from '@/lib/queryOptimizations';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { searchDogs, searchUsers, searchShows, searchClubs } from '@/services/database/queries';
import { useCurrentPersonId } from '@/hooks/useCurrentPersonId';

// Enhanced search configuration
const SEARCH_CONFIG = {
  minSearchLength: 2,
  debounceDelay: 300, // 300ms debounce for search
  maxResults: 50,
  deduplicationWindow: 500, // 500ms deduplication window
} as const;

// Optimized dog search with debouncing and deduplication
export const useOptimizedDogSearch = (
  searchTerm: string,
  options?: {
    enabled?: boolean;
    page?: number;
    pageSize?: number;
  }
) => {
  const personId = useCurrentPersonId();
  const initialTerm = searchTerm.length >= SEARCH_CONFIG.minSearchLength ? searchTerm : '';
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialTerm);
  const shouldDeduplicateSearch = useSearchDeduplication();
  const paginationConfig = usePaginationConfig();

  // Debounce search term updates
  const debouncedUpdate = useDebounce((term: string) => {
    if (shouldDeduplicateSearch(term)) {
      setDebouncedSearchTerm(term);
    }
  }, SEARCH_CONFIG.debounceDelay);

  // Update debounced term when search term changes using render-time sync
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  if (searchTerm !== prevSearchTerm) {
    setPrevSearchTerm(searchTerm);
    if (searchTerm.length >= SEARCH_CONFIG.minSearchLength) {
      debouncedUpdate(searchTerm);
    } else {
      setDebouncedSearchTerm('');
    }
  }

  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? paginationConfig.dogs.pageSize;

  return useQuery({
    queryKey: ['dogs', 'search', debouncedSearchTerm, personId, 'page', page, 'limit', pageSize],
    queryFn: async () => {
      if (!debouncedSearchTerm) return { data: [], total: 0, hasMore: false };

      const { data, error } = await searchDogs(debouncedSearchTerm, personId!);

      if (error) throw error;

      return {
        data: data || [],
        total: data?.length || 0,
        hasMore: (data?.length || 0) === pageSize,
        page,
        pageSize,
      };
    },
    enabled:
      (options?.enabled ?? true) &&
      !!personId &&
      debouncedSearchTerm.length >= SEARCH_CONFIG.minSearchLength,
    ...cacheStrategies.dynamic,

    // Keep previous results while loading new ones
    placeholderData: previousData => previousData,

    // Optimize for search UX
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Optimized user search with debouncing and deduplication
export const useOptimizedUserSearch = (
  searchTerm: string,
  options?: {
    enabled?: boolean;
    page?: number;
    pageSize?: number;
    role?: string;
  }
) => {
  const initialTerm = searchTerm.length >= SEARCH_CONFIG.minSearchLength ? searchTerm : '';
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialTerm);
  const shouldDeduplicateSearch = useSearchDeduplication();
  const paginationConfig = usePaginationConfig();

  const debouncedUpdate = useDebounce((term: string) => {
    if (shouldDeduplicateSearch(term)) {
      setDebouncedSearchTerm(term);
    }
  }, SEARCH_CONFIG.debounceDelay);

  // Update debounced term using render-time sync
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  if (searchTerm !== prevSearchTerm) {
    setPrevSearchTerm(searchTerm);
    if (searchTerm.length >= SEARCH_CONFIG.minSearchLength) {
      debouncedUpdate(searchTerm);
    } else {
      setDebouncedSearchTerm('');
    }
  }

  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? paginationConfig.users.pageSize;

  return useQuery({
    queryKey: [
      'users',
      'search',
      debouncedSearchTerm,
      'role',
      options?.role,
      'page',
      page,
      'limit',
      pageSize,
    ],
    queryFn: async () => {
      if (!debouncedSearchTerm) return { data: [], total: 0, hasMore: false };

      const { data, error } = await searchUsers(debouncedSearchTerm);

      if (error) throw error;

      return {
        data: data || [],
        total: data?.length || 0,
        hasMore: (data?.length || 0) === pageSize,
        page,
        pageSize,
      };
    },
    enabled:
      (options?.enabled ?? true) && debouncedSearchTerm.length >= SEARCH_CONFIG.minSearchLength,
    ...cacheStrategies.dynamic,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Optimized show search with debouncing and deduplication
export const useOptimizedShowSearch = (
  searchTerm: string,
  options?: {
    enabled?: boolean;
    page?: number;
    pageSize?: number;
    dateRange?: { start: string; end: string };
    status?: string;
  }
) => {
  const initialTerm = searchTerm.length >= SEARCH_CONFIG.minSearchLength ? searchTerm : '';
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialTerm);
  const shouldDeduplicateSearch = useSearchDeduplication();
  const paginationConfig = usePaginationConfig();

  const debouncedUpdate = useDebounce((term: string) => {
    if (shouldDeduplicateSearch(term)) {
      setDebouncedSearchTerm(term);
    }
  }, SEARCH_CONFIG.debounceDelay);

  // Update debounced term using render-time sync
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  if (searchTerm !== prevSearchTerm) {
    setPrevSearchTerm(searchTerm);
    if (searchTerm.length >= SEARCH_CONFIG.minSearchLength) {
      debouncedUpdate(searchTerm);
    } else {
      setDebouncedSearchTerm('');
    }
  }

  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? paginationConfig.shows.pageSize;

  return useQuery({
    queryKey: [
      'shows',
      'search',
      debouncedSearchTerm,
      'dateRange',
      options?.dateRange,
      'status',
      options?.status,
      'page',
      page,
      'limit',
      pageSize,
    ],
    queryFn: async () => {
      if (!debouncedSearchTerm) return { data: [], total: 0, hasMore: false };

      const { data, error } = await searchShows(debouncedSearchTerm);

      if (error) throw error;

      return {
        data: data || [],
        total: data?.length || 0,
        hasMore: (data?.length || 0) === pageSize,
        page,
        pageSize,
      };
    },
    enabled:
      (options?.enabled ?? true) && debouncedSearchTerm.length >= SEARCH_CONFIG.minSearchLength,
    ...cacheStrategies.dynamic,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Unified global search across all entities
export const useGlobalSearch = (
  searchTerm: string,
  options?: {
    enabled?: boolean;
    entities?: ('dogs' | 'users' | 'shows' | 'clubs')[];
  }
) => {
  const personId = useCurrentPersonId();
  const initialTerm = searchTerm.length >= SEARCH_CONFIG.minSearchLength ? searchTerm : '';
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialTerm);
  const shouldDeduplicateSearch = useSearchDeduplication();

  const debouncedUpdate = useDebounce((term: string) => {
    if (shouldDeduplicateSearch(term)) {
      setDebouncedSearchTerm(term);
    }
  }, SEARCH_CONFIG.debounceDelay);

  // Update debounced term using render-time sync
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  if (searchTerm !== prevSearchTerm) {
    setPrevSearchTerm(searchTerm);
    if (searchTerm.length >= SEARCH_CONFIG.minSearchLength) {
      debouncedUpdate(searchTerm);
    } else {
      setDebouncedSearchTerm('');
    }
  }

  const enabledEntities = options?.entities ?? ['dogs', 'users', 'shows', 'clubs'];

  return useQuery({
    queryKey: ['global-search', debouncedSearchTerm, personId, 'entities', enabledEntities],
    queryFn: async () => {
      if (!debouncedSearchTerm) {
        return {
          dogs: [],
          users: [],
          shows: [],
          clubs: [],
          total: 0,
        };
      }

      const searchPromises: Promise<void>[] = [];
      const results: Record<string, unknown[]> = {
        dogs: [],
        users: [],
        shows: [],
        clubs: [],
      };

      // Search each enabled entity type in parallel
      if (enabledEntities.includes('dogs') && personId) {
        searchPromises.push(
          searchDogs(debouncedSearchTerm, personId)
            .then(({ data }) => {
              results.dogs = data || [];
            })
            .catch(() => {
              results.dogs = [];
            })
        );
      }

      if (enabledEntities.includes('users')) {
        searchPromises.push(
          searchUsers(debouncedSearchTerm)
            .then(({ data }) => {
              results.users = data || [];
            })
            .catch(() => {
              results.users = [];
            })
        );
      }

      if (enabledEntities.includes('shows')) {
        searchPromises.push(
          searchShows(debouncedSearchTerm)
            .then(({ data }) => {
              results.shows = data || [];
            })
            .catch(() => {
              results.shows = [];
            })
        );
      }

      if (enabledEntities.includes('clubs')) {
        searchPromises.push(
          searchClubs(debouncedSearchTerm)
            .then(({ data }) => {
              results.clubs = data || [];
            })
            .catch(() => {
              results.clubs = [];
            })
        );
      }

      // Wait for all searches to complete
      await Promise.all(searchPromises);

      const total = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

      return {
        ...results,
        total,
        searchTerm: debouncedSearchTerm,
      };
    },
    enabled:
      (options?.enabled ?? true) && debouncedSearchTerm.length >= SEARCH_CONFIG.minSearchLength,
    ...cacheStrategies.dynamic,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Search suggestions with intelligent caching
export const useSearchSuggestions = (
  searchTerm: string,
  entityType: 'dogs' | 'users' | 'shows'
) => {
  const initialTerm = searchTerm.length >= 1 ? searchTerm : '';
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialTerm);

  const debouncedUpdate = useDebounce((term: string) => {
    setDebouncedSearchTerm(term);
  }, 150); // Faster debounce for suggestions

  // Update debounced term using render-time sync
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  if (searchTerm !== prevSearchTerm) {
    setPrevSearchTerm(searchTerm);
    if (searchTerm.length >= 1) {
      // Lower threshold for suggestions
      debouncedUpdate(searchTerm);
    } else {
      setDebouncedSearchTerm('');
    }
  }

  return useQuery({
    queryKey: [entityType, 'suggestions', debouncedSearchTerm],
    queryFn: async () => {
      if (!debouncedSearchTerm) return [];

      // Get cached data first for instant suggestions
      const cacheKey =
        entityType === 'dogs'
          ? queryKeys.dogs
          : entityType === 'users'
            ? queryKeys.users.all
            : queryKeys.shows;

      const cachedData = (
        globalThis as { queryClient?: { getQueryData: (key: unknown) => unknown } }
      ).queryClient?.getQueryData(cacheKey) as Array<{ name: string; id: string }> | undefined;

      if (cachedData && cachedData.length > 0) {
        // Filter cached data for instant suggestions
        return cachedData
          .filter(item => item.name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
          .slice(0, 5)
          .map(item => ({
            id: item.id,
            name: item.name,
            type: entityType,
          }));
      }

      // Fallback to empty array if no cached data
      return [];
    },
    enabled: debouncedSearchTerm.length >= 1,
    staleTime: 2 * 60 * 1000, // 2 minutes for suggestions
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Export search configuration for external use
export { SEARCH_CONFIG };
