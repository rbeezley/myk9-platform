// Advanced Query Optimizations - Phase 3.2
// Intelligent prefetching, debouncing, deduplication, and cache invalidation strategies

import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';
import { useCallback, useRef, useEffect } from 'react';
import { queryKeys, cacheStrategies } from './queryClient';
import { 
  getAllDogs, 
  getDogById,
  getAllUsers,
  getUserById,
  getAllShows,
  getAllClubs,
  getClubById
} from '@/services/database/queries';

// Debouncing utility for search queries
export const useDebounce = <T extends unknown[]>(
  callback: (...args: T) => void,
  delay: number
) => {
  const timeoutRef = useRef<NodeJS.Timeout>();

  const debouncedCallback = useCallback((...args: T) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
};

// Request deduplication for search queries
export const useSearchDeduplication = () => {
  const lastSearchRef = useRef<{ term: string; timestamp: number } | null>(null);
  const DEDUPLICATION_WINDOW = 500; // 500ms

  return useCallback((searchTerm: string): boolean => {
    const now = Date.now();
    const lastSearch = lastSearchRef.current;

    // If same search term within deduplication window, skip
    if (
      lastSearch &&
      lastSearch.term === searchTerm &&
      now - lastSearch.timestamp < DEDUPLICATION_WINDOW
    ) {
      return false; // Skip this search
    }

    // Update last search
    lastSearchRef.current = { term: searchTerm, timestamp: now };
    return true; // Allow this search
  }, []);
};

// Intelligent prefetching patterns based on navigation predictability
export class IntelligentPrefetcher {
  private queryClient: QueryClient;
  private navigationPatterns: Map<string, number> = new Map();
  private prefetchQueue: Set<string> = new Set();

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.setupNavigationTracking();
  }

  // Track navigation patterns to predict future queries
  private setupNavigationTracking() {
    // Track route changes and common navigation flows
    if (typeof window !== 'undefined') {
      const trackNavigation = () => {
        const currentPath = window.location.pathname;
        this.recordNavigationPattern(currentPath);
        this.triggerPredictivePrefetch(currentPath);
      };

      window.addEventListener('popstate', trackNavigation);
      
      // Track initial load
      this.recordNavigationPattern(window.location.pathname);
    }
  }

  private recordNavigationPattern(path: string) {
    const count = this.navigationPatterns.get(path) || 0;
    this.navigationPatterns.set(path, count + 1);
  }

  // Predictive prefetching based on common patterns
  private triggerPredictivePrefetch(currentPath: string) {
    // Dogs list → Dog details (prefetch first 5 dogs)
    if (currentPath === '/dogs') {
      this.prefetchDogsList();
    }
    
    // Dog details → Related dogs by same owner
    if (currentPath.startsWith('/dogs/')) {
      const dogId = currentPath.split('/')[2];
      this.prefetchRelatedDogData(dogId);
    }
    
    // Shows list → Show details (prefetch upcoming shows)
    if (currentPath === '/shows') {
      this.prefetchUpcomingShows();
    }
    
    // Show details → Show classes and entries
    if (currentPath.startsWith('/shows/')) {
      const showId = currentPath.split('/')[2];
      this.prefetchShowRelatedData(showId);
    }
    
    // People list → Person details and their dogs
    if (currentPath === '/people') {
      this.prefetchPeopleList();
    }
  }

  // Prefetch dogs list with intelligent batching
  private async prefetchDogsList() {
    const cacheKey = 'dogs-list-prefetch';
    if (this.prefetchQueue.has(cacheKey)) return;
    
    this.prefetchQueue.add(cacheKey);
    
    try {
      // Prefetch dogs list
      await this.queryClient.prefetchQuery({
        queryKey: queryKeys.dogs,
        queryFn: async () => {
          const { data, error } = await getAllDogs();
          if (error) throw error;
          return data;
        },
        staleTime: cacheStrategies.moderate.staleTime,
      });

      // Get the dogs data and prefetch first 3 dog details
      const dogsData = this.queryClient.getQueryData(queryKeys.dogs) as Array<{ id: string }> | undefined;
      if (dogsData && dogsData.length > 0) {
        const topDogs = dogsData.slice(0, 3);
        await Promise.all(
          topDogs.map(dog => 
            this.queryClient.prefetchQuery({
              queryKey: queryKeys.dog(dog.id),
              queryFn: async () => {
                const { data, error } = await getDogById(dog.id);
                if (error) throw error;
                return data;
              },
              staleTime: cacheStrategies.moderate.staleTime,
            })
          )
        );
      }
    } catch (error) {
      logger.warn('Prefetch dogs list failed', 'query', {}, error as Error);
    } finally {
      this.prefetchQueue.delete(cacheKey);
    }
  }

  // Prefetch related dog data (owner, registrations, health records)
  private async prefetchRelatedDogData(dogId: string) {
    const cacheKey = `dog-${dogId}-related`;
    if (this.prefetchQueue.has(cacheKey)) return;
    
    this.prefetchQueue.add(cacheKey);
    
    try {
      // Get current dog data
      const dogData = this.queryClient.getQueryData(queryKeys.dog(dogId)) as { owner_id?: string } | undefined;
      
      if (dogData?.owner_id) {
        // Prefetch owner details
        await this.queryClient.prefetchQuery({
          queryKey: queryKeys.users.detail(dogData.owner_id),
          queryFn: async () => {
            const { data, error } = await getUserById(dogData.owner_id!);
            if (error) throw error;
            return data;
          },
          staleTime: cacheStrategies.moderate.staleTime,
        });

        // Prefetch other dogs by same owner
        await this.queryClient.prefetchQuery({
          queryKey: queryKeys.users.dogs(dogData.owner_id),
          queryFn: async () => {
            // This would be implemented in dog queries
            return [];
          },
          staleTime: cacheStrategies.moderate.staleTime,
        });
      }

      // Prefetch dog registrations and health records
      await Promise.all([
        this.queryClient.prefetchQuery({
          queryKey: queryKeys.dogRegistrations(dogId),
          queryFn: async () => [],
          staleTime: cacheStrategies.dynamic.staleTime,
        }),
        this.queryClient.prefetchQuery({
          queryKey: queryKeys.dogHealthRecords(dogId),
          queryFn: async () => [],
          staleTime: cacheStrategies.moderate.staleTime,
        }),
      ]);
    } catch (error) {
      logger.warn('Prefetch related dog data failed', 'query', { dogId }, error as Error);
    } finally {
      this.prefetchQueue.delete(cacheKey);
    }
  }

  // Prefetch upcoming shows
  private async prefetchUpcomingShows() {
    const cacheKey = 'upcoming-shows-prefetch';
    if (this.prefetchQueue.has(cacheKey)) return;
    
    this.prefetchQueue.add(cacheKey);
    
    try {
      // Prefetch upcoming shows
      await this.queryClient.prefetchQuery({
        queryKey: queryKeys.upcomingShows,
        queryFn: async () => {
          const { data, error } = await getAllShows();
          if (error) throw error;
          
          // Filter to upcoming shows (mock implementation)
          const now = new Date();
          return data?.filter((show: Record<string, unknown>) => {
            const showDate = show.date || show.start_date || show.event_date;
            return showDate ? new Date(showDate as string) > now : true;
          }) || [];
        },
        staleTime: cacheStrategies.dynamic.staleTime,
      });

      // Prefetch clubs for shows
      await this.queryClient.prefetchQuery({
        queryKey: queryKeys.clubs,
        queryFn: async () => {
          const { data, error } = await getAllClubs();
          if (error) throw error;
          return data;
        },
        staleTime: cacheStrategies.static.staleTime,
      });
    } catch (error) {
      logger.warn('Prefetch upcoming shows failed', 'query', {}, error as Error);
    } finally {
      this.prefetchQueue.delete(cacheKey);
    }
  }

  // Prefetch show related data (classes, entries)
  private async prefetchShowRelatedData(showId: string) {
    const cacheKey = `show-${showId}-related`;
    if (this.prefetchQueue.has(cacheKey)) return;
    
    this.prefetchQueue.add(cacheKey);
    
    try {
      // Get show data first
      const showData = this.queryClient.getQueryData(queryKeys.show(showId)) as { club_id?: string } | undefined;
      
      if (showData?.club_id) {
        // Prefetch club details
        await this.queryClient.prefetchQuery({
          queryKey: queryKeys.club(showData.club_id),
          queryFn: async () => {
            const { data, error } = await getClubById(showData.club_id!);
            if (error) throw error;
            return data;
          },
          staleTime: cacheStrategies.static.staleTime,
        });
      }

      // Prefetch show classes and entries
      await Promise.all([
        this.queryClient.prefetchQuery({
          queryKey: queryKeys.showClasses(showId),
          queryFn: async () => [],
          staleTime: cacheStrategies.dynamic.staleTime,
        }),
        this.queryClient.prefetchQuery({
          queryKey: queryKeys.showEntries(showId),
          queryFn: async () => [],
          staleTime: cacheStrategies.realtime.staleTime,
        }),
      ]);
    } catch (error) {
      logger.warn('Prefetch show related data failed', 'query', { showId }, error as Error);
    } finally {
      this.prefetchQueue.delete(cacheKey);
    }
  }

  // Prefetch people list
  private async prefetchPeopleList() {
    const cacheKey = 'people-list-prefetch';
    if (this.prefetchQueue.has(cacheKey)) return;
    
    this.prefetchQueue.add(cacheKey);
    
    try {
      // Prefetch users list
      await this.queryClient.prefetchQuery({
        queryKey: queryKeys.users.all,
        queryFn: async () => {
          const { data, error } = await getAllUsers();
          if (error) throw error;
          return data;
        },
        staleTime: cacheStrategies.moderate.staleTime,
      });
    } catch (error) {
      logger.warn('Prefetch people list failed', 'query', {}, error as Error);
    } finally {
      this.prefetchQueue.delete(cacheKey);
    }
  }

  // Get prefetch statistics
  getStats() {
    return {
      navigationPatternsCount: this.navigationPatterns.size,
      activePrefetches: this.prefetchQueue.size,
      topNavigationPatterns: Array.from(this.navigationPatterns.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5),
    };
  }
}

// Hook for intelligent prefetching
export const useIntelligentPrefetching = () => {
  const queryClient = useQueryClient();
  const prefetcherRef = useRef<IntelligentPrefetcher>();

  if (!prefetcherRef.current) {
    prefetcherRef.current = new IntelligentPrefetcher(queryClient);
  }

  return prefetcherRef.current;
};

// Pagination utilities for large result sets
export const usePaginationConfig = () => {
  const DEFAULT_PAGE_SIZE = 20;
  const MAX_PAGE_SIZE = 100;

  return {
    dogs: {
      pageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
      staleTime: cacheStrategies.moderate.staleTime,
    },
    users: {
      pageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
      staleTime: cacheStrategies.moderate.staleTime,
    },
    shows: {
      pageSize: 15, // Slightly smaller for shows
      maxPageSize: 50,
      staleTime: cacheStrategies.dynamic.staleTime,
    },
    search: {
      pageSize: 10, // Smaller for search results
      maxPageSize: 30,
      staleTime: cacheStrategies.dynamic.staleTime,
    },
  };
};

// Query invalidation strategies for related data
export const createInvalidationStrategy = (queryClient: QueryClient) => {
  const strategies = {
    // Invalidate all related queries when a dog is modified
    invalidateDogRelated: (dogId: string, ownerId?: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
      queryClient.invalidateQueries({ queryKey: queryKeys.dog(dogId) });
      
      if (ownerId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.users.dogs(ownerId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(ownerId) });
      }
      
      // Invalidate statistics
      queryClient.invalidateQueries({ queryKey: ['dogs', 'statistics'] });
    },

    // Invalidate all related queries when a user is modified
    invalidateUserRelated: (userId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.dogs(userId) });
      
      // Invalidate user statistics
      queryClient.invalidateQueries({ queryKey: queryKeys.users.statistics() });
    },

    // Invalidate all related queries when a show is modified
    invalidateShowRelated: (showId: string, clubId?: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows });
      queryClient.invalidateQueries({ queryKey: queryKeys.show(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.showClasses(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.upcomingShows });
      
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.clubShows(clubId) });
      }
    },

    // Invalidate all related queries when a club is modified
    invalidateClubRelated: (clubId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clubs });
      queryClient.invalidateQueries({ queryKey: queryKeys.club(clubId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clubShows(clubId) });
    },

    // Smart invalidation based on mutation type
    smartInvalidation: (entityType: string, entityId: string, metadata?: Record<string, unknown>) => {
      switch (entityType) {
        case 'dog':
          strategies.invalidateDogRelated(entityId, metadata?.ownerId as string | undefined);
          break;
        case 'user':
          strategies.invalidateUserRelated(entityId);
          break;
        case 'show':
          strategies.invalidateShowRelated(entityId, metadata?.clubId as string | undefined);
          break;
        case 'club':
          strategies.invalidateClubRelated(entityId);
          break;
        default:
          logger.warn('Unknown entity type for invalidation', 'query', { entityType });
      }
    },
  };
  
  return strategies;
};

// Bundle splitting and lazy loading optimization
export const optimizeModuleLoading = () => {
  // Dynamic imports for store modules
  const lazyLoadStore = async (storeName: string) => {
    switch (storeName) {
      case 'dogs':
        return import('@/hooks/queries/useDogsDatabase');
      case 'users':
        return import('@/hooks/queries/useUsersDatabase');
      case 'shows':
        return import('@/hooks/queries/useShowsDatabase');
      case 'clubs':
        return import('@/hooks/queries/useClubsDatabase');
      case 'classes':
        return import('@/hooks/queries/useClassesDatabase');
      default:
        throw new Error(`Unknown store: ${storeName}`);
    }
  };

  // Preload critical stores
  const preloadCriticalStores = async () => {
    try {
      await Promise.all([
        lazyLoadStore('dogs'),
        lazyLoadStore('users'),
      ]);
    } catch (error) {
      logger.warn('Failed to preload critical stores', 'query', {}, error as Error);
    }
  };

  return {
    lazyLoadStore,
    preloadCriticalStores,
  };
};

// Performance monitoring for query optimizations
export const useQueryPerformanceMonitoring = () => {
  const queryClient = useQueryClient();

  const getPerformanceMetrics = useCallback(() => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    const metrics = {
      totalQueries: queries.length,
      staleQueries: queries.filter(q => q.isStale()).length,
      loadingQueries: queries.filter(q => q.state.status === 'pending').length,
      errorQueries: queries.filter(q => q.state.error !== null).length,
      successQueries: queries.filter(q => q.state.status === 'success').length,
      
      // Cache hit ratio estimation
      cacheHits: queries.filter(q => q.state.dataUpdatedAt > 0 && !q.isStale()).length,
      cacheMisses: queries.filter(q => q.state.status === 'pending' || q.isStale()).length,
      
      // Memory usage estimation
      estimatedCacheSize: JSON.stringify(queries.map(q => q.state.data)).length,
      
      // Query timing analysis
      averageQueryTime: queries
        .filter(q => q.state.dataUpdatedAt > 0 && q.state.status === 'success')
        .reduce((acc, q, _, arr) => {
          // This is an approximation - real timing would need custom tracking
          const dataUpdatedAt = q.state.dataUpdatedAt || 0;
          const queryStateWithTiming = q.state as { updatedAt?: number };
          const updatedAt = queryStateWithTiming.updatedAt || 0;
          return acc + (dataUpdatedAt - updatedAt) / arr.length;
        }, 0),
    };

    return {
      ...metrics,
      cacheHitRatio: metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) || 0,
      healthScore: (metrics.successQueries / metrics.totalQueries) || 0,
    };
  }, [queryClient]);

  return {
    getPerformanceMetrics,
    monitorQueries: () => {
      const metrics = getPerformanceMetrics();
      logger.debug('Query Performance Metrics', 'query', metrics);
      return metrics;
    },
  };
};