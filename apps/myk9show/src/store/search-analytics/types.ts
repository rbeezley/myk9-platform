export interface SearchQuery {
  id: string;
  query: string;
  searchType: 'dogs' | 'people' | 'shows' | 'classes' | 'trials' | 'clubs' | 'templates' | 'global';
  timestamp: Date;
  userId: string;
  sessionId: string;
  filters?: Record<string, unknown> | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface SearchResult {
  queryId: string;
  resultCount: number;
  executionTime: number; // milliseconds
  relevanceScore?: number | undefined;
  clickedResults: string[]; // IDs of results that were clicked
  wasSuccessful: boolean;
  errorMessage?: string | undefined;
}

export interface SearchSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date | undefined;
  totalQueries: number;
  successfulQueries: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  mostSearchedType: string;
  userAgent?: string | undefined;
  deviceType?: 'desktop' | 'tablet' | 'mobile' | undefined;
}

export interface SearchAnalytics {
  totalSearches: number;
  totalSessions: number;
  averageQueriesPerSession: number;
  mostPopularSearchTypes: Record<string, number>;
  mostCommonQueries: Record<string, number>;
  averageExecutionTime: number;
  successRate: number;
  searchTrends: Array<{
    date: string;
    searches: number;
    averageTime: number;
    successRate: number;
  }>;
  performanceMetrics: {
    fastQueries: number; // < 100ms
    normalQueries: number; // 100-500ms
    slowQueries: number; // > 500ms
  };
}

export interface UserSearchBehavior {
  userId: string;
  totalSearches: number;
  favoriteSearchTypes: Record<string, number>;
  averageSessionDuration: number;
  mostActiveTimeOfDay: number; // hour 0-23
  mostActiveDayOfWeek: number; // 0-6
  searchEfficiency: number; // clicks per search
  commonSearchPatterns: string[];
}

export interface SearchAnalyticsState {
  queries: SearchQuery[];
  results: SearchResult[];
  sessions: SearchSession[];
  currentSessionId: string | null;
  isTracking: boolean;
}

export interface QueryOperationsSlice {
  logSearchQuery: (
    query: string,
    searchType: SearchQuery['searchType'],
    userId: string,
    filters?: Record<string, unknown>,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc'
  ) => string;
  logSearchResult: (
    queryId: string,
    resultCount: number,
    executionTime: number,
    wasSuccessful: boolean,
    errorMessage?: string
  ) => void;
  logResultClick: (queryId: string, resultId: string) => void;
}

export interface SessionManagementSlice {
  startSearchSession: (userId: string) => string;
  endSearchSession: (sessionId: string) => void;
  getCurrentSession: () => SearchSession | null;
  updateSessionInfo: (sessionId: string, info: Partial<SearchSession>) => void;
}

export interface AnalyticsReportingSlice {
  generateAnalytics: (timeRange?: { start: Date; end: Date }) => SearchAnalytics;
  getUserBehavior: (userId: string, timeRange?: { start: Date; end: Date }) => UserSearchBehavior;
  getSearchTrends: (days: number) => SearchAnalytics['searchTrends'];
  getPopularQueries: (limit?: number, searchType?: SearchQuery['searchType']) => Array<{
    query: string;
    count: number;
    averageTime: number;
    successRate: number;
  }>;
}

export interface PerformanceAnalysisSlice {
  getPerformanceMetrics: (searchType?: SearchQuery['searchType']) => {
    averageExecutionTime: number;
    medianExecutionTime: number;
    p95ExecutionTime: number;
    fastQueries: number;
    normalQueries: number;
    slowQueries: number;
    totalQueries: number;
  };
  getSlowestQueries: (limit?: number) => Array<{
    query: string;
    searchType: string;
    executionTime: number;
    timestamp: Date;
  }>;
  getFailedQueries: (limit?: number) => Array<{
    query: string;
    searchType: string;
    errorMessage: string;
    timestamp: Date;
  }>;
}

export interface UserInsightsSlice {
  getMostActiveUsers: (limit?: number) => Array<{
    userId: string;
    searchCount: number;
    sessionCount: number;
    averageSessionDuration: number;
  }>;
  getSearchTypeDistribution: () => Record<string, {
    count: number;
    percentage: number;
    averageTime: number;
    successRate: number;
  }>;
}

export interface DataManagementSlice {
  cleanupOldData: (retentionDays: number) => number;
  exportAnalytics: (format: 'json' | 'csv', timeRange?: { start: Date; end: Date }) => string;
  importAnalytics: (data: string, format: 'json' | 'csv') => number;
}

export interface MonitoringConfigSlice {
  getRealtimeMetrics: () => {
    activeUsers: number;
    queriesLastHour: number;
    averageResponseTime: number;
    errorRate: number;
  };
  setTracking: (enabled: boolean) => void;
  getTrackingStatus: () => boolean;
  clearAnalytics: () => void;
  clearUserData: (userId: string) => void;
  resetMetrics: () => void;
}

export type SearchAnalyticsStore = SearchAnalyticsState &
  QueryOperationsSlice &
  SessionManagementSlice &
  AnalyticsReportingSlice &
  PerformanceAnalysisSlice &
  UserInsightsSlice &
  DataManagementSlice &
  MonitoringConfigSlice;
