import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';

export interface SearchQuery {
  id: string;
  query: string;
  searchType: 'dogs' | 'people' | 'shows' | 'classes' | 'trials' | 'clubs' | 'templates' | 'global';
  timestamp: Date;
  userId: string;
  sessionId: string;
  filters?: Record<string, unknown>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  queryId: string;
  resultCount: number;
  executionTime: number; // milliseconds
  relevanceScore?: number;
  clickedResults: string[]; // IDs of results that were clicked
  wasSuccessful: boolean;
  errorMessage?: string;
}

export interface SearchSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  totalQueries: number;
  successfulQueries: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  mostSearchedType: string;
  userAgent?: string;
  deviceType?: 'desktop' | 'tablet' | 'mobile';
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

interface SearchAnalyticsStore {
  // State
  queries: SearchQuery[];
  results: SearchResult[];
  sessions: SearchSession[];
  currentSessionId: string | null;
  isTracking: boolean;
  
  // Query Operations
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
  
  // Session Management
  startSearchSession: (userId: string) => string;
  endSearchSession: (sessionId: string) => void;
  getCurrentSession: () => SearchSession | null;
  updateSessionInfo: (sessionId: string, info: Partial<SearchSession>) => void;
  
  // Analytics Generation
  generateAnalytics: (timeRange?: { start: Date; end: Date }) => SearchAnalytics;
  getUserBehavior: (userId: string, timeRange?: { start: Date; end: Date }) => UserSearchBehavior;
  getSearchTrends: (days: number) => SearchAnalytics['searchTrends'];
  getPopularQueries: (limit?: number, searchType?: SearchQuery['searchType']) => Array<{
    query: string;
    count: number;
    averageTime: number;
    successRate: number;
  }>;
  
  // Performance Analysis
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
  
  // User Insights
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
  
  // Data Management
  cleanupOldData: (retentionDays: number) => number;
  exportAnalytics: (format: 'json' | 'csv', timeRange?: { start: Date; end: Date }) => string;
  importAnalytics: (data: string, format: 'json' | 'csv') => number;
  
  // Real-time Monitoring
  getRealtimeMetrics: () => {
    activeUsers: number;
    queriesLastHour: number;
    averageResponseTime: number;
    errorRate: number;
  };
  
  // Configuration
  setTracking: (enabled: boolean) => void;
  getTrackingStatus: () => boolean;
  
  // Reset and Clear
  clearAnalytics: () => void;
  clearUserData: (userId: string) => void;
  resetMetrics: () => void;
}

export const useSearchAnalyticsStore = create<SearchAnalyticsStore>()(
  persist(
    (set, get) => ({
      // Initial state
      queries: [],
      results: [],
      sessions: [],
      currentSessionId: null,
      isTracking: true,

      // Query Operations
      logSearchQuery: (query, searchType, userId, filters, sortBy, sortOrder) => {
        if (!get().isTracking) return '';

        const queryId = `query-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const sessionId = get().currentSessionId || get().startSearchSession(userId);

        const searchQuery: SearchQuery = {
          id: queryId,
          query: query.trim(),
          searchType,
          timestamp: new Date(),
          userId,
          sessionId,
          filters,
          sortBy,
          sortOrder
        };

        set(state => ({
          queries: [...state.queries, searchQuery]
        }));

        // Update session statistics
        const session = get().sessions.find(s => s.id === sessionId);
        if (session) {
          get().updateSessionInfo(sessionId, {
            totalQueries: session.totalQueries + 1
          });
        }

        return queryId;
      },

      logSearchResult: (queryId, resultCount, executionTime, wasSuccessful, errorMessage) => {
        if (!get().isTracking) return;

        const searchResult: SearchResult = {
          queryId,
          resultCount,
          executionTime,
          wasSuccessful,
          errorMessage,
          clickedResults: []
        };

        set(state => ({
          results: [...state.results, searchResult]
        }));

        // Update session metrics
        const query = get().queries.find(q => q.id === queryId);
        if (query) {
          const session = get().sessions.find(s => s.id === query.sessionId);
          if (session) {
            const totalTime = session.totalExecutionTime + executionTime;
            const successfulQueries = session.successfulQueries + (wasSuccessful ? 1 : 0);
            
            get().updateSessionInfo(query.sessionId, {
              totalExecutionTime: totalTime,
              averageExecutionTime: totalTime / session.totalQueries,
              successfulQueries
            });
          }
        }
      },

      logResultClick: (queryId, resultId) => {
        if (!get().isTracking) return;

        set(state => ({
          results: state.results.map(result =>
            result.queryId === queryId
              ? { ...result, clickedResults: [...result.clickedResults, resultId] }
              : result
          )
        }));
      },

      // Session Management
      startSearchSession: (userId) => {
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        const session: SearchSession = {
          id: sessionId,
          userId,
          startTime: new Date(),
          totalQueries: 0,
          successfulQueries: 0,
          totalExecutionTime: 0,
          averageExecutionTime: 0,
          mostSearchedType: '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          deviceType: detectDeviceType()
        };

        set(state => ({
          sessions: [...state.sessions, session],
          currentSessionId: sessionId
        }));

        return sessionId;
      },

      endSearchSession: (sessionId) => {
        set(state => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? { ...session, endTime: new Date() }
              : session
          ),
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
        }));
      },

      getCurrentSession: () => {
        const sessionId = get().currentSessionId;
        return sessionId ? get().sessions.find(s => s.id === sessionId) || null : null;
      },

      updateSessionInfo: (sessionId, info) => {
        set(state => ({
          sessions: state.sessions.map(session =>
            session.id === sessionId
              ? { ...session, ...info }
              : session
          )
        }));
      },

      // Analytics Generation
      generateAnalytics: (timeRange) => {
        const { queries, results, sessions } = get();
        
        let filteredQueries = queries;
        let filteredResults = results;
        let filteredSessions = sessions;

        if (timeRange) {
          filteredQueries = queries.filter(q => 
            q.timestamp >= timeRange.start && q.timestamp <= timeRange.end
          );
          
          const queryIds = new Set(filteredQueries.map(q => q.id));
          filteredResults = results.filter(r => queryIds.has(r.queryId));
          
          filteredSessions = sessions.filter(s => 
            s.startTime >= timeRange.start && s.startTime <= timeRange.end
          );
        }

        const totalSearches = filteredQueries.length;
        const totalSessions = filteredSessions.length;
        const successfulSearches = filteredResults.filter(r => r.wasSuccessful).length;
        const totalExecutionTime = filteredResults.reduce((sum, r) => sum + r.executionTime, 0);

        // Search type distribution
        const searchTypeCount: Record<string, number> = {};
        filteredQueries.forEach(q => {
          searchTypeCount[q.searchType] = (searchTypeCount[q.searchType] || 0) + 1;
        });

        // Common queries
        const queryCount: Record<string, number> = {};
        filteredQueries.forEach(q => {
          queryCount[q.query] = (queryCount[q.query] || 0) + 1;
        });

        // Performance metrics
        const fastQueries = filteredResults.filter(r => r.executionTime < 100).length;
        const normalQueries = filteredResults.filter(r => r.executionTime >= 100 && r.executionTime <= 500).length;
        const slowQueries = filteredResults.filter(r => r.executionTime > 500).length;

        return {
          totalSearches,
          totalSessions,
          averageQueriesPerSession: totalSessions > 0 ? totalSearches / totalSessions : 0,
          mostPopularSearchTypes: searchTypeCount,
          mostCommonQueries: queryCount,
          averageExecutionTime: filteredResults.length > 0 ? totalExecutionTime / filteredResults.length : 0,
          successRate: totalSearches > 0 ? (successfulSearches / totalSearches) * 100 : 0,
          searchTrends: get().getSearchTrends(7),
          performanceMetrics: {
            fastQueries,
            normalQueries,
            slowQueries
          }
        };
      },

      getUserBehavior: (userId, timeRange) => {
        const { queries, results, sessions } = get();
        
        let userQueries = queries.filter(q => q.userId === userId);
        let userSessions = sessions.filter(s => s.userId === userId);

        if (timeRange) {
          userQueries = userQueries.filter(q => 
            q.timestamp >= timeRange.start && q.timestamp <= timeRange.end
          );
          userSessions = userSessions.filter(s => 
            s.startTime >= timeRange.start && s.startTime <= timeRange.end
          );
        }

        const searchTypeCount: Record<string, number> = {};
        const hourCount: Record<number, number> = {};
        const dayCount: Record<number, number> = {};
        const queryCount: Record<string, number> = {};

        userQueries.forEach(q => {
          searchTypeCount[q.searchType] = (searchTypeCount[q.searchType] || 0) + 1;
          queryCount[q.query] = (queryCount[q.query] || 0) + 1;
          
          const hour = q.timestamp.getHours();
          const day = q.timestamp.getDay();
          
          hourCount[hour] = (hourCount[hour] || 0) + 1;
          dayCount[day] = (dayCount[day] || 0) + 1;
        });

        const totalClicks = results
          .filter(r => userQueries.some(q => q.id === r.queryId))
          .reduce((sum, r) => sum + r.clickedResults.length, 0);

        const sessionDurations = userSessions
          .filter(s => s.endTime)
          .map(s => s.endTime!.getTime() - s.startTime.getTime());

        return {
          userId,
          totalSearches: userQueries.length,
          favoriteSearchTypes: searchTypeCount,
          averageSessionDuration: sessionDurations.length > 0 
            ? sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length 
            : 0,
          mostActiveTimeOfDay: Object.entries(hourCount).reduce((max, [hour, count]) => 
            count > (hourCount[max] || 0) ? parseInt(hour) : max, 0),
          mostActiveDayOfWeek: Object.entries(dayCount).reduce((max, [day, count]) => 
            count > (dayCount[max] || 0) ? parseInt(day) : max, 0),
          searchEfficiency: userQueries.length > 0 ? totalClicks / userQueries.length : 0,
          commonSearchPatterns: Object.keys(queryCount).slice(0, 10)
        };
      },

      getSearchTrends: (days) => {
        const trends: SearchAnalytics['searchTrends'] = [];
        const { queries, results } = get();
        
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          
          const dayQueries = queries.filter(q => 
            q.timestamp.toISOString().split('T')[0] === dateStr
          );
          
          const dayResults = results.filter(r => 
            dayQueries.some(q => q.id === r.queryId)
          );
          
          const successfulResults = dayResults.filter(r => r.wasSuccessful);
          const totalTime = dayResults.reduce((sum, r) => sum + r.executionTime, 0);
          
          trends.push({
            date: dateStr,
            searches: dayQueries.length,
            averageTime: dayResults.length > 0 ? totalTime / dayResults.length : 0,
            successRate: dayResults.length > 0 ? (successfulResults.length / dayResults.length) * 100 : 0
          });
        }
        
        return trends;
      },

      getPopularQueries: (limit = 10, searchType) => {
        const { queries, results } = get();
        
        let filteredQueries = queries;
        if (searchType) {
          filteredQueries = queries.filter(q => q.searchType === searchType);
        }

        const queryStats: Record<string, {
          count: number;
          totalTime: number;
          successfulCount: number;
        }> = {};

        filteredQueries.forEach(q => {
          if (!queryStats[q.query]) {
            queryStats[q.query] = { count: 0, totalTime: 0, successfulCount: 0 };
          }
          queryStats[q.query].count++;

          const result = results.find(r => r.queryId === q.id);
          if (result) {
            queryStats[q.query].totalTime += result.executionTime;
            if (result.wasSuccessful) {
              queryStats[q.query].successfulCount++;
            }
          }
        });

        return Object.entries(queryStats)
          .map(([query, stats]) => ({
            query,
            count: stats.count,
            averageTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
            successRate: stats.count > 0 ? (stats.successfulCount / stats.count) * 100 : 0
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
      },

      // Performance Analysis
      getPerformanceMetrics: (searchType) => {
        const { queries, results } = get();
        
        let filteredResults = results;
        if (searchType) {
          const typeQueryIds = queries
            .filter(q => q.searchType === searchType)
            .map(q => q.id);
          filteredResults = results.filter(r => typeQueryIds.includes(r.queryId));
        }

        const executionTimes = filteredResults.map(r => r.executionTime).sort((a, b) => a - b);
        const totalTime = executionTimes.reduce((sum, time) => sum + time, 0);

        return {
          averageExecutionTime: executionTimes.length > 0 ? totalTime / executionTimes.length : 0,
          medianExecutionTime: executionTimes.length > 0 ? executionTimes[Math.floor(executionTimes.length / 2)] : 0,
          p95ExecutionTime: executionTimes.length > 0 ? executionTimes[Math.floor(executionTimes.length * 0.95)] : 0,
          fastQueries: filteredResults.filter(r => r.executionTime < 100).length,
          normalQueries: filteredResults.filter(r => r.executionTime >= 100 && r.executionTime <= 500).length,
          slowQueries: filteredResults.filter(r => r.executionTime > 500).length,
          totalQueries: filteredResults.length
        };
      },

      getSlowestQueries: (limit = 10) => {
        const { queries, results } = get();
        
        return results
          .filter(r => !r.wasSuccessful || r.executionTime > 500)
          .map(r => {
            const query = queries.find(q => q.id === r.queryId);
            return query ? {
              query: query.query,
              searchType: query.searchType,
              executionTime: r.executionTime,
              timestamp: query.timestamp
            } : null;
          })
          .filter(Boolean)
          .sort((a, b) => (b?.executionTime || 0) - (a?.executionTime || 0))
          .slice(0, limit) as Array<{
            query: string;
            searchType: string;
            executionTime: number;
            timestamp: Date;
          }>;
      },

      getFailedQueries: (limit = 10) => {
        const { queries, results } = get();
        
        return results
          .filter(r => !r.wasSuccessful)
          .map(r => {
            const query = queries.find(q => q.id === r.queryId);
            return query && r.errorMessage ? {
              query: query.query,
              searchType: query.searchType,
              errorMessage: r.errorMessage,
              timestamp: query.timestamp
            } : null;
          })
          .filter(Boolean)
          .sort((a, b) => (b?.timestamp.getTime() || 0) - (a?.timestamp.getTime() || 0))
          .slice(0, limit) as Array<{
            query: string;
            searchType: string;
            errorMessage: string;
            timestamp: Date;
          }>;
      },

      // User Insights
      getMostActiveUsers: (limit = 10) => {
        const { sessions } = get();
        
        const userStats: Record<string, {
          searchCount: number;
          sessionCount: number;
          totalDuration: number;
        }> = {};

        sessions.forEach(s => {
          if (!userStats[s.userId]) {
            userStats[s.userId] = { searchCount: 0, sessionCount: 0, totalDuration: 0 };
          }
          
          userStats[s.userId].sessionCount++;
          userStats[s.userId].searchCount += s.totalQueries;
          
          if (s.endTime) {
            userStats[s.userId].totalDuration += s.endTime.getTime() - s.startTime.getTime();
          }
        });

        return Object.entries(userStats)
          .map(([userId, stats]) => ({
            userId,
            searchCount: stats.searchCount,
            sessionCount: stats.sessionCount,
            averageSessionDuration: stats.sessionCount > 0 ? stats.totalDuration / stats.sessionCount : 0
          }))
          .sort((a, b) => b.searchCount - a.searchCount)
          .slice(0, limit);
      },

      getSearchTypeDistribution: () => {
        const { queries, results } = get();
        
        const typeStats: Record<string, {
          count: number;
          totalTime: number;
          successfulCount: number;
        }> = {};

        queries.forEach(q => {
          if (!typeStats[q.searchType]) {
            typeStats[q.searchType] = { count: 0, totalTime: 0, successfulCount: 0 };
          }
          typeStats[q.searchType].count++;

          const result = results.find(r => r.queryId === q.id);
          if (result) {
            typeStats[q.searchType].totalTime += result.executionTime;
            if (result.wasSuccessful) {
              typeStats[q.searchType].successfulCount++;
            }
          }
        });

        const totalQueries = queries.length;
        
        return Object.fromEntries(
          Object.entries(typeStats).map(([type, stats]) => [
            type,
            {
              count: stats.count,
              percentage: totalQueries > 0 ? (stats.count / totalQueries) * 100 : 0,
              averageTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
              successRate: stats.count > 0 ? (stats.successfulCount / stats.count) * 100 : 0
            }
          ])
        );
      },

      // Data Management
      cleanupOldData: (retentionDays) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const removedQueries = get().queries.filter(q => q.timestamp < cutoffDate);
        const removedSessions = get().sessions.filter(s => s.startTime < cutoffDate);

        set(state => ({
          queries: state.queries.filter(q => q.timestamp >= cutoffDate),
          sessions: state.sessions.filter(s => s.startTime >= cutoffDate),
          results: state.results.filter(r => 
            state.queries.some(q => q.id === r.queryId && q.timestamp >= cutoffDate)
          )
        }));

        return removedQueries.length + removedSessions.length;
      },

      exportAnalytics: (format, timeRange) => {
        const analytics = get().generateAnalytics(timeRange);
        
        if (format === 'json') {
          return JSON.stringify(analytics, null, 2);
        } else {
          // Basic CSV export
          const lines = [
            'Date,Searches,Average Time,Success Rate',
            ...analytics.searchTrends.map(trend => 
              `${trend.date},${trend.searches},${trend.averageTime.toFixed(2)},${trend.successRate.toFixed(2)}`
            )
          ];
          return lines.join('\n');
        }
      },

      importAnalytics: () => {
        // Implementation would depend on format
        return 0;
      },

      // Real-time Monitoring
      getRealtimeMetrics: () => {
        const { queries, results, sessions } = get();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const recentQueries = queries.filter(q => q.timestamp > oneHourAgo);
        const recentResults = results.filter(r => 
          recentQueries.some(q => q.id === r.queryId)
        );
        const activeSessions = sessions.filter(s => !s.endTime || s.endTime > oneHourAgo);
        
        const failedResults = recentResults.filter(r => !r.wasSuccessful);
        const totalTime = recentResults.reduce((sum, r) => sum + r.executionTime, 0);

        return {
          activeUsers: new Set(activeSessions.map(s => s.userId)).size,
          queriesLastHour: recentQueries.length,
          averageResponseTime: recentResults.length > 0 ? totalTime / recentResults.length : 0,
          errorRate: recentResults.length > 0 ? (failedResults.length / recentResults.length) * 100 : 0
        };
      },

      // Configuration
      setTracking: (enabled) => {
        set({ isTracking: enabled });
      },

      getTrackingStatus: () => {
        return get().isTracking;
      },

      // Reset and Clear
      clearAnalytics: () => {
        set({
          queries: [],
          results: [],
          sessions: [],
          currentSessionId: null
        });
      },

      clearUserData: (userId) => {
        set(state => ({
          queries: state.queries.filter(q => q.userId !== userId),
          sessions: state.sessions.filter(s => s.userId !== userId),
          results: state.results.filter(r => 
            !state.queries.some(q => q.id === r.queryId && q.userId === userId)
          )
        }));
      },

      resetMetrics: () => {
        get().clearAnalytics();
      }
    }),
    {
      name: 'search-analytics-storage',
      storage: createJSONStorage(() => getOptimalStorage('searchAnalytics')),
      partialize: (state) => ({
        queries: state.queries,
        results: state.results,
        sessions: state.sessions,
        isTracking: state.isTracking,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for search analytics
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            // Ensure all data has proper relationships and new fields
            if (state.queries && Array.isArray(state.queries)) {
              state.queries = state.queries.map((query: unknown) => {
                const q = query as Record<string, unknown>;
                return {
                  ...q,
                  timestamp: q.timestamp ? new Date(q.timestamp as string | number | Date) : new Date(),
                  sessionId: q.sessionId || 'unknown-session'
                };
              });
            }
            if (state.sessions && Array.isArray(state.sessions)) {
              state.sessions = state.sessions.map((session: unknown) => {
                const s = session as Record<string, unknown>;
                return {
                  ...s,
                  startTime: s.startTime ? new Date(s.startTime as string | number | Date) : new Date(),
                  endTime: s.endTime ? new Date(s.endTime as string | number | Date) : undefined
                };
              });
            }
          }
        }
        return persistedState;
      },
    }
  )
);

// Helper function to detect device type
function detectDeviceType(): 'desktop' | 'tablet' | 'mobile' {
  if (typeof window === 'undefined') return 'desktop';
  
  const userAgent = navigator.userAgent;
  
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
    return 'tablet';
  }
  
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
    return 'mobile';
  }
  
  return 'desktop';
}