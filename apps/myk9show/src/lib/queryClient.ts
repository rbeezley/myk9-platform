import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';

// Create custom query cache with enhanced deduplication
const queryCache = new QueryCache({
  onError: (error, query) => {
    logger.error('Query error', 'query', { queryKey: query.queryKey }, error as Error);
  },
  onSuccess: (data, query) => {
    // Log successful queries for debugging in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Query success', 'query', { queryKey: query.queryKey, dataSize: JSON.stringify(data).length });
    }
  },
});

// Create custom mutation cache
const mutationCache = new MutationCache({
  onError: (error, variables) => {
    logger.error('Mutation error', 'query', { variables }, error as Error);
  },
  onSuccess: (_data, _variables, _context, mutation) => {
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Mutation success', 'query', { mutationKey: mutation.options.mutationKey });
    }
  },
});

export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      // Enhanced stale time based on data type with performance optimization
      staleTime: 5 * 60 * 1000, // 5 minutes default
      // Enhanced cache time for better memory management
      gcTime: 10 * 60 * 1000, // 10 minutes default
      // Smart retry strategy with exponential backoff
      retry: (failureCount, error: unknown) => {
        // Don't retry for client errors (4xx)
        if (error && typeof error === 'object' && 'status' in error) {
          const statusError = error as { status: number };
          if (statusError.status >= 400 && statusError.status < 500) {
            return false;
          }
        }
        // Retry up to 2 times for server errors (reduced for performance)
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 15000), // Faster retry with shorter backoff
      
      // Optimized refetch settings for mobile performance
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always', // Always refetch on reconnect for fresh data
      refetchOnMount: true, // Reduced frequency for performance
      
      // Enhanced request deduplication for mobile
      networkMode: 'online',
      
      // Optimistic updates for better UX with mobile considerations
      placeholderData: (previousData: unknown) => previousData,
      
      // Performance optimizations for mobile
      refetchInterval: false, // Disable auto-refetch to save battery/data
      refetchIntervalInBackground: false,
      
      // Enhanced query function timeout for mobile networks
      meta: {
        timeout: 15000, // 15 seconds timeout for 3G networks
      },
    },
    mutations: {
      // Enhanced retry strategy for mutations
      retry: (failureCount, error: unknown) => {
        // Don't retry for client errors
        if (error && typeof error === 'object' && 'status' in error) {
          const statusError = error as { status: number };
          if (statusError.status >= 400 && statusError.status < 500) {
            return false;
          }
        }
        // Only retry once for mutations to avoid duplicate operations
        return failureCount < 1;
      },
      retryDelay: 1000, // 1 second delay before retry
      networkMode: 'online',
    },
  },
});

// Query key factory for consistent key management
export const queryKeys = {
  // Dogs
  dogs: ['dogs'] as const,
  dog: (id: string) => ['dogs', id] as const,
  dogRegistrations: (dogId: string) => ['dogs', dogId, 'registrations'] as const,
  dogHealthRecords: (dogId: string) => ['dogs', dogId, 'health'] as const,
  dogCompetitions: (dogId: string) => ['dogs', dogId, 'competitions'] as const,
  dogAchievements: (dogId: string) => ['dogs', dogId, 'achievements'] as const,
  dogTitles: (dogId: string) => ['dogs', dogId, 'titles'] as const,
  dogTraining: (dogId: string) => ['dogs', dogId, 'training'] as const,
  dogPedigree: (dogId: string) => ['dogs', dogId, 'pedigree'] as const,

  // Users
  users: {
    all: ['users'] as const,
    lists: () => ['users', 'list'] as const,
    list: (filters?: Record<string, unknown>) => ['users', 'list', filters] as const,
    details: () => ['users', 'detail'] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
    byRole: (role: string) => ['users', 'role', role] as const,
    search: (searchTerm: string) => ['users', 'search', searchTerm] as const,
    withDogCounts: () => ['users', 'dogCounts'] as const,
    statistics: () => ['users', 'statistics'] as const,
    dogs: (userId: string) => ['users', userId, 'dogs'] as const,
  },
  
  // Legacy aliases for backward compatibility (to be removed after migration)
  people: ['users'] as const,
  person: (id: string) => ['users', 'detail', id] as const,
  personDogs: (userId: string) => ['users', userId, 'dogs'] as const,
  peopleByRole: (role: string) => ['users', 'role', role] as const,
  peopleSearch: (searchTerm: string) => ['users', 'search', searchTerm] as const,

  // Shows
  shows: ['shows'] as const,
  show: (id: string) => ['shows', id] as const,
  showTrials: (showId: string) => ['shows', showId, 'trials'] as const,
  showClasses: (showId: string) => ['shows', showId, 'classes'] as const,
  showEntries: (showId: string) => ['shows', showId, 'entries'] as const,
  showsByDateRange: (startDate: string, endDate: string) => ['shows', 'dateRange', startDate, endDate] as const,
  showsByClub: (clubId: string) => ['shows', 'club', clubId] as const,
  showsByStatus: (status: string) => ['shows', 'status', status] as const,
  upcomingShows: ['shows', 'upcoming'] as const,
  showsWithFilters: (filters: Record<string, unknown>) => ['shows', 'filters', filters] as const,

  // Clubs
  clubs: ['clubs'] as const,
  club: (id: string) => ['clubs', id] as const,
  clubShows: (clubId: string) => ['clubs', clubId, 'shows'] as const,

  // Health Records
  allergies: (dogId: string) => ['health', dogId, 'allergies'] as const,
  medications: (dogId: string) => ['health', dogId, 'medications'] as const,
  vaccinations: (dogId: string) => ['health', dogId, 'vaccinations'] as const,
  vetVisits: (dogId: string) => ['health', dogId, 'vet-visits'] as const,

  // Registrations
  registrations: ['registrations'] as const,
  registration: (id: string) => ['registrations', id] as const,
  registrationsByShow: (showId: string) => ['registrations', 'show', showId] as const,
  registrationsByDog: (dogId: string) => ['registrations', 'dog', dogId] as const,
  registrationsByOwner: (ownerId: string) => ['registrations', 'owner', ownerId] as const,
  registrationsByStatus: (status: string) => ['registrations', 'status', status] as const,
  registrationStats: (showId?: string) => ['registrations', 'stats', showId] as const,

  // Competitions/Results
  competitions: ['competitions'] as const,
  competition: (id: string) => ['competitions', id] as const,
  pastResults: (dogId: string) => ['results', dogId] as const,

  // Trials
  trials: ['trials'] as const,
  trial: (id: string) => ['trials', id] as const,
  trialClasses: (trialId: string) => ['trials', trialId, 'classes'] as const,
  trialPromoCodes: (trialId: string) => ['trials', trialId, 'promo-codes'] as const,
  trialFinancialSummary: (trialId: string) => ['trials', trialId, 'financial-summary'] as const,

  // Pipeline
  trialChecklist: (trialId: string) => ['trials', trialId, 'checklist'] as const,
  trialActivityLog: (trialId: string) => ['trials', trialId, 'activity-log'] as const,

  // Sport Templates (DB-driven)
  sportTemplates: ['sport-templates'] as const,
  sportTemplate: (code: string) => ['sport-templates', code] as const,
  sportTemplateRules: (templateId: string) => ['sport-templates', templateId, 'rules'] as const,
  sportTemplateTitles: (templateId: string) => ['sport-templates', templateId, 'titles'] as const,

  // Templates
  classTemplates: ['templates', 'class'] as const,
  classTemplate: (id: string) => ['templates', 'class', id] as const,
  classTemplatesByOrganization: (org: string) => ['templates', 'class', 'organization', org] as const,
  showTemplates: ['templates', 'show'] as const,
  showTemplate: (id: string) => ['templates', 'show', id] as const,
  showTemplatesByOrganization: (org: string) => ['templates', 'show', 'organization', org] as const,
  templateFields: (templateId: string) => ['templates', 'fields', templateId] as const,
  templateStatistics: ['templates', 'statistics'] as const,
  mostUsedTemplates: ['templates', 'most-used'] as const,
  templateSearch: (searchTerm: string) => ['templates', 'search', searchTerm] as const,

  // Entries
  entries: ['entries'] as const,
  entry: (id: string) => ['entries', id] as const,
  entriesByShow: (showId: string) => ['entries', 'show', showId] as const,
  entriesByClass: (classId: string) => ['entries', 'class', classId] as const,
  entriesByDog: (dogId: string) => ['entries', 'dog', dogId] as const,
  entriesByStatus: (status: string) => ['entries', 'status', status] as const,
  entriesSearch: (searchTerm: string) => ['entries', 'search', searchTerm] as const,
  entryStatistics: (showId?: string) => ['entries', 'statistics', showId] as const,
  
  // Legacy aliases for backward compatibility with existing showEntries key
  classEntries: (classId: string) => ['entries', 'class', classId] as const,
  dogEntries: (dogId: string) => ['entries', 'dog', dogId] as const,
  showStatistics: (showId: string) => ['shows', showId, 'statistics'] as const,
} as const;

// Enhanced cache strategies for different data types
export const cacheStrategies = {
  // Static/rarely changing data (30 minutes stale, 1 hour cache)
  static: {
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  },
  
  // Moderately dynamic data (5 minutes stale, 10 minutes cache)
  moderate: {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  },
  
  // Highly dynamic data (1 minute stale, 2 minutes cache)
  dynamic: {
    staleTime: 1 * 60 * 1000,
    gcTime: 2 * 60 * 1000,
  },
  
  // Real-time data (30 seconds stale, 1 minute cache)
  realtime: {
    staleTime: 30 * 1000,
    gcTime: 60 * 1000,
  },
} as const;

// Request deduplication utilities
export const deduplicationUtils = {
  /**
   * Create a query key that includes user context for deduplication
   */
  withUserContext: (baseKey: readonly unknown[], userId?: string) => {
    return userId ? [...baseKey, 'user', userId] as const : baseKey;
  },

  /**
   * Create a query key with filtering parameters for better cache hits
   */
  withFilters: (baseKey: readonly unknown[], filters: Record<string, unknown>) => {
    // Sort filters to ensure consistent key generation
    const sortedFilters = Object.keys(filters)
      .sort()
      .reduce((acc, key) => {
        acc[key] = filters[key];
        return acc;
      }, {} as Record<string, unknown>);
    
    return [...baseKey, 'filters', sortedFilters] as const;
  },

  /**
   * Create a query key with pagination parameters
   */
  withPagination: (baseKey: readonly unknown[], page: number, limit: number) => {
    return [...baseKey, 'page', page, 'limit', limit] as const;
  },
};

// Enhanced cache optimization utilities
export const cacheUtils = {
  /**
   * Prefetch related data when a query succeeds with mobile performance optimization
   */
  setupRelatedDataPrefetch: () => {
    const prefetchQueue: Array<() => Promise<void>> = [];
    let isProcessingQueue = false;
    
    // Process prefetch queue with request batching
    const processPrefetchQueue = async () => {
      if (isProcessingQueue || prefetchQueue.length === 0) return;
      
      isProcessingQueue = true;
      const batch = prefetchQueue.splice(0, 3); // Process 3 at a time to avoid overwhelming mobile
      
      try {
        await Promise.all(batch.map(fn => fn()));
      } catch (error) {
        logger.warn('Prefetch batch failed', 'query', {}, error as Error);
      }
      
      isProcessingQueue = false;
      
      // Continue processing if more items in queue
      if (prefetchQueue.length > 0) {
        setTimeout(processPrefetchQueue, 100); // Small delay between batches
      }
    };
    
    queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.status === 'success') {
        const queryKey = event.query.queryKey;
        
        // Smart prefetching based on connection quality
        const connection = 'connection' in navigator ? (navigator as typeof navigator & { connection?: { effectiveType?: string } }).connection : undefined;
        const isSlowConnection = connection && (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g');
        const prefetchLimit = isSlowConnection ? 1 : 3; // Reduce prefetching on slow connections
        
        // Auto-prefetch related dog data when dog list is fetched
        if (queryKey[0] === 'dogs' && queryKey.length === 1) {
          const dogs = event.query.state.data as unknown[];
          if (Array.isArray(dogs) && dogs.length > 0) {
            // Prefetch limited dog details based on connection
            dogs.slice(0, prefetchLimit).forEach((dog) => {
              const dogWithId = dog as { id: string };
              prefetchQueue.push(() => 
                queryClient.prefetchQuery({
                  queryKey: queryKeys.dog(dogWithId.id),
                  queryFn: () => Promise.resolve(dog), // Mock for now
                  staleTime: cacheStrategies.moderate.staleTime,
                })
              );
            });
            processPrefetchQueue();
          }
        }
        
        // Auto-prefetch show classes when show is fetched
        if (queryKey[0] === 'shows' && queryKey.length === 2) {
          const showId = queryKey[1] as string;
          queryClient.prefetchQuery({
            queryKey: queryKeys.showClasses(showId),
            queryFn: () => Promise.resolve([]), // Mock for now
            staleTime: cacheStrategies.dynamic.staleTime,
          });
        }
        
        // Auto-prefetch user dogs when user is fetched
        if (queryKey[0] === 'users' && queryKey[1] === 'detail' && queryKey.length === 3) {
          const userId = queryKey[2] as string;
          queryClient.prefetchQuery({
            queryKey: queryKeys.users.dogs(userId),
            queryFn: () => Promise.resolve([]),
            staleTime: cacheStrategies.moderate.staleTime,
          });
        }
        
        // Auto-prefetch club shows when club is fetched
        if (queryKey[0] === 'clubs' && queryKey.length === 2) {
          const clubId = queryKey[1] as string;
          queryClient.prefetchQuery({
            queryKey: queryKeys.clubShows(clubId),
            queryFn: () => Promise.resolve([]),
            staleTime: cacheStrategies.dynamic.staleTime,
          });
        }
      }
    });
  },

  /**
   * Enhanced invalidation strategies for related data
   */
  invalidateRelatedQueries: (entityType: string, entityId: string, metadata?: Record<string, unknown>) => {
    switch (entityType) {
      case 'dog':
        queryClient.invalidateQueries({ queryKey: ['dogs'] });
        queryClient.invalidateQueries({ queryKey: ['dogs', entityId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.dogRegistrations(entityId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.dogHealthRecords(entityId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.dogCompetitions(entityId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.dogAchievements(entityId) });
        
        // Invalidate owner's dogs if owner is specified
        if (metadata?.ownerId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.users.dogs(metadata.ownerId as string) 
          });
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.users.detail(metadata.ownerId as string) 
          });
        }
        
        // Invalidate statistics
        queryClient.invalidateQueries({ queryKey: ['dogs', 'statistics'] });
        break;
        
      case 'user':
      case 'person':
        queryClient.invalidateQueries({ queryKey: ['users'] });
        queryClient.invalidateQueries({ queryKey: ['people'] }); // Legacy support
        queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(entityId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.dogs(entityId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.users.statistics() });
        
        // Invalidate role-based queries if role changed
        if (metadata?.role) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.users.byRole(metadata.role as string) 
          });
        }
        break;
        
      case 'show':
        queryClient.invalidateQueries({ queryKey: ['shows'] });
        queryClient.invalidateQueries({ queryKey: ['shows', entityId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.showTrials(entityId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.showClasses(entityId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(entityId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.upcomingShows });
        
        // Invalidate club shows if club is specified
        if (metadata?.clubId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.clubShows(metadata.clubId as string) 
          });
        }
        
        // Invalidate date range queries
        if (metadata?.date) {
          queryClient.invalidateQueries({ 
            queryKey: ['shows'], 
            predicate: (query) => {
              const key = query.queryKey;
              return key.includes('dateRange') || key.includes('upcoming');
            }
          });
        }
        break;
        
      case 'club':
        queryClient.invalidateQueries({ queryKey: ['clubs'] });
        queryClient.invalidateQueries({ queryKey: ['clubs', entityId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.clubShows(entityId) });
        break;
        
      case 'class':
        queryClient.invalidateQueries({ queryKey: ['classes'] });
        queryClient.invalidateQueries({ queryKey: ['classes', entityId] });
        
        // Invalidate trial classes if trial is specified
        if (metadata?.trialId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.trialClasses(metadata.trialId as string) 
          });
        }
        
        // Invalidate show classes if show is specified
        if (metadata?.showId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.showClasses(metadata.showId as string) 
          });
        }
        break;
        
      case 'entry':
        queryClient.invalidateQueries({ queryKey: queryKeys.entries });
        queryClient.invalidateQueries({ queryKey: queryKeys.entry(entityId) });
        
        // Invalidate entry-related queries by relationship
        if (metadata?.classId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.entriesByClass(metadata.classId as string) 
          });
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.classEntries(metadata.classId as string) 
          });
        }
        
        if (metadata?.showId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.showEntries(metadata.showId as string) 
          });
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.entriesByShow(metadata.showId as string) 
          });
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.entryStatistics(metadata.showId as string) 
          });
        }
        
        if (metadata?.dogId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.entriesByDog(metadata.dogId as string) 
          });
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.dogEntries(metadata.dogId as string) 
          });
        }
        
        if (metadata?.status) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.entriesByStatus(metadata.status as string) 
          });
        }
        
        // Invalidate global entry statistics
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.entryStatistics() 
        });
        break;
        
      case 'registration':
        queryClient.invalidateQueries({ queryKey: ['registrations'] });
        queryClient.invalidateQueries({ queryKey: ['registrations', entityId] });
        
        if (metadata?.showId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.registrationsByShow(metadata.showId as string) 
          });
        }
        
        if (metadata?.dogId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.registrationsByDog(metadata.dogId as string) 
          });
        }
        
        if (metadata?.ownerId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.registrationsByOwner(metadata.ownerId as string) 
          });
        }
        break;
        
      default:
        logger.warn(`Unknown entity type for invalidation: ${entityType}`, 'query', { entityType });
    }
  },

  /**
   * Smart batch invalidation for multiple related entities
   */
  invalidateBatch: (operations: Array<{
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }>) => {
    // Group operations by entity type for efficiency
    const groupedOps = operations.reduce((acc, op) => {
      if (!acc[op.entityType]) {
        acc[op.entityType] = [];
      }
      acc[op.entityType].push(op);
      return acc;
    }, {} as Record<string, typeof operations>);

    // Process each entity type
    Object.entries(groupedOps).forEach(([, ops]) => {
      ops.forEach(op => {
        cacheUtils.invalidateRelatedQueries(op.entityType, op.entityId, op.metadata);
      });
    });
  },

  /**
   * Selective invalidation based on data dependencies
   */
  invalidateByDependency: (
    dependencyType: 'owner_change' | 'club_change' | 'date_change' | 'status_change',
    params: Record<string, unknown>
  ) => {
    switch (dependencyType) {
      case 'owner_change':
        if (params.oldOwnerId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.users.dogs(params.oldOwnerId as string) 
          });
        }
        if (params.newOwnerId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.users.dogs(params.newOwnerId as string) 
          });
        }
        break;
        
      case 'club_change':
        if (params.oldClubId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.clubShows(params.oldClubId as string) 
          });
        }
        if (params.newClubId) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.clubShows(params.newClubId as string) 
          });
        }
        break;
        
      case 'date_change':
        queryClient.invalidateQueries({ queryKey: queryKeys.upcomingShows });
        queryClient.invalidateQueries({ 
          queryKey: ['shows'], 
          predicate: (query) => query.queryKey.includes('dateRange')
        });
        break;
        
      case 'status_change':
        if (params.entityType === 'show') {
          queryClient.invalidateQueries({ queryKey: queryKeys.upcomingShows });
          queryClient.invalidateQueries({ 
            queryKey: ['shows'], 
            predicate: (query) => query.queryKey.includes('status')
          });
        }
        break;
    }
  },

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats: () => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    return {
      totalQueries: queries.length,
      staleQueries: queries.filter(q => q.isStale()).length,
      loadingQueries: queries.filter(q => q.state.status === 'pending').length,
      errorQueries: queries.filter(q => q.state.error !== null).length,
      cacheSize: JSON.stringify(queries.map(q => q.state.data)).length,
    };
  },
};

// Initialize cache optimizations
cacheUtils.setupRelatedDataPrefetch();