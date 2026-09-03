import { QueryClient } from '@tanstack/react-query';

// Type for query key structures
type QueryKeyStructure = {
  all: readonly unknown[];
  [key: string]: readonly unknown[] | ((...args: unknown[]) => readonly unknown[]);
};

// Custom retry delay function with exponential backoff
const retryDelay = (attemptIndex: number): number => {
  // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
  return Math.min(1000 * Math.pow(2, attemptIndex), 30000);
};

// Create the query client with optimized settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Cache data for 10 minutes (gcTime in v5)
      gcTime: 10 * 60 * 1000,
      // Retry failed requests 3 times
      retry: 3,
      // Use exponential backoff for retries
      retryDelay,
      // Don't refetch on window focus for better performance
      refetchOnWindowFocus: false,
      // Always refetch when reconnecting to network
      refetchOnReconnect: 'always',
      // Network mode
      networkMode: 'online',
    },
    mutations: {
      // Retry mutations 2 times on failure
      retry: 2,
      // Use same exponential backoff
      retryDelay,
      // Network mode
      networkMode: 'online',
    },
  },
});

// Entity-specific query key factories
export const queryKeys = {
  // Dogs
  dogs: {
    all: ['dogs'] as const,
    lists: () => [...queryKeys.dogs.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.dogs.lists(), filters] as const,
    details: () => [...queryKeys.dogs.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.dogs.details(), id] as const,
    byOwner: (ownerId: string) => [...queryKeys.dogs.all, 'owner', ownerId] as const,
  },

  // Users
  people: {
    all: ['people'] as const,
    lists: () => [...queryKeys.people.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.people.lists(), filters] as const,
    details: () => [...queryKeys.people.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.people.details(), id] as const,
    search: (query: string) => [...queryKeys.people.all, 'search', query] as const,
  },

  // Shows
  shows: {
    all: ['shows'] as const,
    lists: () => [...queryKeys.shows.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.shows.lists(), filters] as const,
    details: () => [...queryKeys.shows.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.shows.details(), id] as const,
    byClub: (clubId: string) => [...queryKeys.shows.all, 'club', clubId] as const,
    upcoming: () => [...queryKeys.shows.all, 'upcoming'] as const,
  },

  // Clubs
  clubs: {
    all: ['clubs'] as const,
    lists: () => [...queryKeys.clubs.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.clubs.lists(), filters] as const,
    details: () => [...queryKeys.clubs.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.clubs.details(), id] as const,
  },

  // Entries
  entries: {
    all: ['entries'] as const,
    lists: () => [...queryKeys.entries.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.entries.lists(), filters] as const,
    byDog: (dogId: string) => [...queryKeys.entries.all, 'dog', dogId] as const,
    byShow: (showId: string) => [...queryKeys.entries.all, 'show', showId] as const,
    byClass: (classId: string) => [...queryKeys.entries.all, 'class', classId] as const,
  },
};

// Cache invalidation helpers
export const invalidateQueries = {
  // Invalidate all queries for an entity
  all: (entity: keyof typeof queryKeys) => {
    return queryClient.invalidateQueries({ queryKey: queryKeys[entity].all });
  },

  // Invalidate specific entity by ID
  byId: (entity: keyof typeof queryKeys, id: string) => {
    const keys = queryKeys[entity] as QueryKeyStructure;
    if (keys.detail && typeof keys.detail === 'function') {
      return queryClient.invalidateQueries({ queryKey: keys.detail(id) });
    }
    return undefined;
  },

  // Invalidate list queries
  lists: (entity: keyof typeof queryKeys) => {
    const keys = queryKeys[entity] as QueryKeyStructure;
    if (keys.lists && typeof keys.lists === 'function') {
      return queryClient.invalidateQueries({ queryKey: keys.lists() });
    }
    return undefined;
  },
};

// Prefetch helpers for predictable navigation
export const prefetchQueries = {
  // Prefetch entity details
  detail: async (entity: keyof typeof queryKeys, id: string, queryFn: () => Promise<unknown>) => {
    const keys = queryKeys[entity] as QueryKeyStructure;
    if (keys.detail && typeof keys.detail === 'function') {
      return queryClient.prefetchQuery({
        queryKey: keys.detail(id),
        queryFn,
        staleTime: 5 * 60 * 1000,
      });
    }
  },

  // Prefetch list data
  list: async (
    entity: keyof typeof queryKeys,
    filters: Record<string, unknown>,
    queryFn: () => Promise<unknown>
  ) => {
    const keys = queryKeys[entity] as QueryKeyStructure;
    if (keys.list && typeof keys.list === 'function') {
      return queryClient.prefetchQuery({
        queryKey: keys.list(filters),
        queryFn,
        staleTime: 5 * 60 * 1000,
      });
    }
  },
};

export default queryClient;
