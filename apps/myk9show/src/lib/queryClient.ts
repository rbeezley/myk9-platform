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
      logger.debug('Query success', 'query', {
        queryKey: query.queryKey,
        dataSize: JSON.stringify(data).length,
      });
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
      retryDelay: attemptIndex => Math.min(500 * 2 ** attemptIndex, 15000), // Faster retry with shorter backoff

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
  showPromoCodes: (showId: string) => ['shows', showId, 'promo-codes'] as const,
  showFinancialSummary: (showId: string) => ['shows', showId, 'financial-summary'] as const,
  showsByDateRange: (startDate: string, endDate: string) =>
    ['shows', 'dateRange', startDate, endDate] as const,
  showsByClub: (clubId: string) => ['shows', 'club', clubId] as const,
  showsByStatus: (status: string) => ['shows', 'status', status] as const,
  upcomingShows: ['shows', 'upcoming'] as const,
  showsWithFilters: (filters: Record<string, unknown>) => ['shows', 'filters', filters] as const,

  // Class Requirements
  classRequirements: (org: string, element: string, level: string) =>
    ['classRequirements', org, element, level] as const,

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
  trialEntries: (trialId: string) => ['trials', trialId, 'entries'] as const,
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
  classTemplatesByOrganization: (org: string) =>
    ['templates', 'class', 'organization', org] as const,
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

  // Judges
  judges: {
    rosterSummary: () => ['judges', 'roster-summary'] as const,
    utilization: (filters?: Record<string, unknown>) => ['judges', 'utilization', filters] as const,
    alerts: (days: number) => ['judges', 'alerts', days] as const,
    trends: (year?: number) => ['judges', 'trends', year] as const,
    myStats: (personId: string, year?: number) => ['judges', 'my-stats', personId, year] as const,
    upcoming: (personId: string) => ['judges', 'upcoming', personId] as const,
    qualificationSummary: (personId: string) =>
      ['judges', 'qualification-summary', personId] as const,
  },

  // Show Day (exhibitor live dashboard)
  showDayCheck: (userId: string) => ['show-day', 'check', userId] as const,
  showDayDetails: (userId: string) => ['show-day', 'details', userId] as const,
  showDayRingProgress: (userId: string, classIds: string[]) =>
    ['show-day', 'ring-progress', userId, classIds] as const,

  // Exhibitor Analytics
  myShowStats: (showId: string) => ['analytics', 'show', showId] as const,
  myLifetimeStats: () => ['analytics', 'lifetime'] as const,

  // Public Show & Judge Analytics
  showStats: (showId: string) => ['analytics', 'show-stats', showId] as const,
  showJudges: (showId: string) => ['analytics', 'show-judges', showId] as const,
  judgeShowStats: (judgeId: string, showId: string) =>
    ['analytics', 'judge-show-stats', judgeId, showId] as const,

  // Check-In Report
  checkInReport: (showId: string) => ['check-in-report', showId] as const,

  // Show Officials
  showOfficials: (showId: string) => ['shows', showId, 'officials'] as const,

  // Volunteers
  volunteers: (showId: string) => ['volunteers', showId] as const,
  volunteerClassAssignments: (showId: string) =>
    ['volunteer-assignments', 'class', showId] as const,
  volunteerGeneralAssignments: (showId: string) =>
    ['volunteer-assignments', 'general', showId] as const,

  // Legacy aliases for backward compatibility with existing showEntries key
  classEntries: (classId: string) => ['entries', 'class', classId] as const,
  dogEntries: (dogId: string) => ['entries', 'dog', dogId] as const,
  showStatistics: (showId: string) => ['shows', showId, 'statistics'] as const,

  // TV Display
  tvShow: (showId: string) => ['tv', 'show', showId] as const,
  tvClasses: (showId: string) => ['tv', 'classes', showId] as const,
  tvResults: (showId: string) => ['tv', 'results', showId] as const,

  // Reports
  reportData: (showId: string, trialId: string, classId: string) =>
    ['reports', showId, trialId, classId] as const,

  // Organization Agreements
  organizationAgreement: (org: string) => ['organization-agreements', org] as const,
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

