import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';

export interface SearchHistoryItem {
  id: string;
  query: string;
  searchType: 'dogs' | 'people' | 'shows' | 'classes' | 'trials' | 'clubs' | 'templates' | 'global';
  timestamp: Date;
  userId: string;
  resultCount?: number | undefined;
  selectedResultId?: string | undefined;
  filters?: Record<string, unknown> | undefined;
  context?: {
    page: string;
    section?: string | undefined;
    previousQuery?: string | undefined;
  } | undefined;
}

export interface SearchSuggestion {
  id: string;
  query: string;
  searchType: SearchHistoryItem['searchType'];
  frequency: number;
  lastUsed: Date;
  averageResultCount: number;
  popularFilters: Record<string, unknown>;
  isBookmarked: boolean;
}

export interface SearchBookmark {
  id: string;
  title: string;
  query: string;
  searchType: SearchHistoryItem['searchType'];
  filters: Record<string, unknown>;
  userId: string;
  createdAt: Date;
  lastUsed?: Date | undefined;
  useCount: number;
  tags: string[];
  notes?: string | undefined;
}

export interface SearchFrequency {
  query: string;
  searchType: SearchHistoryItem['searchType'];
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  averageResultCount: number;
  successRate: number;
}

interface SearchHistoryStore {
  // State
  history: SearchHistoryItem[];
  suggestions: SearchSuggestion[];
  bookmarks: SearchBookmark[];
  maxHistoryItems: number;
  maxSuggestions: number;
  isEnabled: boolean;
  
  // History Management
  addToHistory: (
    query: string,
    searchType: SearchHistoryItem['searchType'],
    userId: string,
    resultCount?: number,
    filters?: Record<string, unknown>,
    context?: SearchHistoryItem['context']
  ) => void;
  
  updateHistoryItem: (id: string, updates: Partial<SearchHistoryItem>) => void;
  removeFromHistory: (id: string) => void;
  clearHistory: (userId?: string) => void;
  clearHistoryByType: (searchType: SearchHistoryItem['searchType'], userId?: string) => void;
  
  // Query Operations
  getRecentSearches: (userId: string, limit?: number, searchType?: SearchHistoryItem['searchType']) => SearchHistoryItem[];
  getPopularSearches: (userId: string, limit?: number, searchType?: SearchHistoryItem['searchType']) => SearchFrequency[];
  getSearchesByContext: (userId: string, page: string, section?: string) => SearchHistoryItem[];
  
  // Suggestion Management
  generateSuggestions: (userId: string, searchType?: SearchHistoryItem['searchType']) => SearchSuggestion[];
  getSuggestions: (
    userId: string,
    partialQuery?: string,
    searchType?: SearchHistoryItem['searchType'],
    limit?: number
  ) => SearchSuggestion[];
  
  updateSuggestionFrequency: (query: string, searchType: SearchHistoryItem['searchType']) => void;
  
  // Bookmark Management
  createBookmark: (
    title: string,
    query: string,
    searchType: SearchHistoryItem['searchType'],
    filters: Record<string, unknown>,
    userId: string,
    tags?: string[],
    notes?: string
  ) => string;
  
  updateBookmark: (id: string, updates: Partial<SearchBookmark>) => boolean;
  deleteBookmark: (id: string) => boolean;
  getBookmarks: (userId: string, searchType?: SearchHistoryItem['searchType']) => SearchBookmark[];
  getBookmarksByTag: (userId: string, tag: string) => SearchBookmark[];
  executeBookmark: (id: string) => SearchBookmark | null;
  
  // Search Analysis
  getSearchPatterns: (userId: string) => {
    mostSearchedType: string;
    averageQueriesPerDay: number;
    peakSearchHours: number[];
    commonQueryPrefixes: string[];
    searchTypeDistribution: Record<string, number>;
  };
  
  getQueryFrequency: (userId: string, days?: number) => SearchFrequency[];
  getRelatedQueries: (query: string, userId: string, limit?: number) => string[];
  
  // Smart Features
  getSmartSuggestions: (
    userId: string,
    currentQuery: string,
    searchType: SearchHistoryItem['searchType'],
    context?: { page: string; section?: string }
  ) => {
    completions: string[];
    corrections: string[];
    relatedQueries: string[];
    bookmarkedQueries: SearchBookmark[];
  };
  
  predictNextQuery: (userId: string, currentQuery: string) => string[];
  getContextualSuggestions: (userId: string, page: string, section?: string) => SearchSuggestion[];
  
  // Data Management
  cleanupOldHistory: (retentionDays: number) => number;
  compressHistory: () => number;
  exportHistory: (userId: string, format: 'json' | 'csv') => string;
  importHistory: (data: string, format: 'json' | 'csv', userId: string) => number;
  
  // Configuration
  setMaxHistoryItems: (max: number) => void;
  setMaxSuggestions: (max: number) => void;
  setEnabled: (enabled: boolean) => void;
  
  // Privacy and GDPR
  anonymizeUserData: (userId: string) => number;
  deleteUserData: (userId: string) => number;
  
  // Utilities
  searchInHistory: (userId: string, searchTerm: string) => SearchHistoryItem[];
  getHistoryStatistics: (userId?: string) => {
    totalSearches: number;
    uniqueQueries: number;
    averageQueryLength: number;
    mostActiveDay: string;
    searchFrequencyByType: Record<string, number>;
  };
}

const DEFAULT_MAX_HISTORY = 1000;
const DEFAULT_MAX_SUGGESTIONS = 50;

export const useSearchHistoryStore = create<SearchHistoryStore>()(
  persist(
    (set, get) => ({
      // Initial state
      history: [],
      suggestions: [],
      bookmarks: [],
      maxHistoryItems: DEFAULT_MAX_HISTORY,
      maxSuggestions: DEFAULT_MAX_SUGGESTIONS,
      isEnabled: true,

      // History Management
      addToHistory: (query, searchType, userId, resultCount, filters, context) => {
        if (!get().isEnabled) return;

        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;

        // Check if this exact query was already searched recently (within last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentDuplicate = get().history.find(item =>
          item.query === trimmedQuery &&
          item.searchType === searchType &&
          item.userId === userId &&
          item.timestamp > fiveMinutesAgo
        );

        if (recentDuplicate) {
          // Update existing item instead of creating duplicate
          get().updateHistoryItem(recentDuplicate.id, {
            timestamp: new Date(),
            resultCount,
            filters
          });
          return;
        }

        const historyItem: SearchHistoryItem = {
          id: `history-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          query: trimmedQuery,
          searchType,
          timestamp: new Date(),
          userId,
          resultCount,
          filters,
          context
        };

        set(state => {
          const newHistory = [historyItem, ...state.history];
          
          // Limit history size per user
          const userHistory = newHistory.filter(item => item.userId === userId);
          if (userHistory.length > state.maxHistoryItems) {
            const itemsToRemove = userHistory.slice(state.maxHistoryItems);
            return {
              history: newHistory.filter(item => 
                item.userId !== userId || !itemsToRemove.includes(item)
              )
            };
          }
          
          return { history: newHistory };
        });

        // Update suggestion frequency
        get().updateSuggestionFrequency(trimmedQuery, searchType);
      },

      updateHistoryItem: (id, updates) => {
        set(state => ({
          history: state.history.map(item =>
            item.id === id ? { ...item, ...updates } : item
          )
        }));
      },

      removeFromHistory: (id) => {
        set(state => ({
          history: state.history.filter(item => item.id !== id)
        }));
      },

      clearHistory: (userId) => {
        if (userId) {
          set(state => ({
            history: state.history.filter(item => item.userId !== userId)
          }));
        } else {
          set({ history: [] });
        }
      },

      clearHistoryByType: (searchType, userId) => {
        set(state => ({
          history: state.history.filter(item => 
            item.searchType !== searchType || (userId && item.userId !== userId)
          )
        }));
      },

      // Query Operations
      getRecentSearches: (userId, limit = 10, searchType) => {
        return get().history
          .filter(item => 
            item.userId === userId && 
            (!searchType || item.searchType === searchType)
          )
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, limit);
      },

      getPopularSearches: (userId, limit = 10, searchType) => {
        const userHistory = get().history.filter(item =>
          item.userId === userId &&
          (!searchType || item.searchType === searchType)
        );

        const queryFrequency: Record<string, SearchFrequency> = {};

        userHistory.forEach(item => {
          const key = `${item.query}-${item.searchType}`;
          if (!queryFrequency[key]) {
            queryFrequency[key] = {
              query: item.query,
              searchType: item.searchType,
              count: 0,
              firstSeen: item.timestamp,
              lastSeen: item.timestamp,
              averageResultCount: 0,
              successRate: 0
            };
          }

          const freq = queryFrequency[key];
          freq.count++;
          freq.lastSeen = item.timestamp > freq.lastSeen ? item.timestamp : freq.lastSeen;
          freq.firstSeen = item.timestamp < freq.firstSeen ? item.timestamp : freq.firstSeen;
          
          if (item.resultCount !== undefined) {
            freq.averageResultCount = (freq.averageResultCount * (freq.count - 1) + item.resultCount) / freq.count;
            freq.successRate = item.resultCount > 0 ? freq.successRate + 1 : freq.successRate;
          }
        });

        // Calculate success rate as percentage
        Object.values(queryFrequency).forEach(freq => {
          freq.successRate = (freq.successRate / freq.count) * 100;
        });

        return Object.values(queryFrequency)
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
      },

      getSearchesByContext: (userId, page, section) => {
        return get().history.filter(item =>
          item.userId === userId &&
          item.context?.page === page &&
          (!section || item.context?.section === section)
        );
      },

      // Suggestion Management
      generateSuggestions: (userId, searchType) => {
        const popularQueries = get().getPopularSearches(userId, 20, searchType);
        
        const suggestions: SearchSuggestion[] = popularQueries.map(freq => ({
          id: `suggestion-${freq.query}-${freq.searchType}`,
          query: freq.query,
          searchType: freq.searchType,
          frequency: freq.count,
          lastUsed: freq.lastSeen,
          averageResultCount: freq.averageResultCount,
          popularFilters: {}, // Would be calculated from actual filter usage
          isBookmarked: get().bookmarks.some(bookmark => 
            bookmark.query === freq.query && 
            bookmark.searchType === freq.searchType &&
            bookmark.userId === userId
          )
        }));

        set(state => ({
          suggestions: suggestions.slice(0, state.maxSuggestions)
        }));

        return suggestions;
      },

      getSuggestions: (_userId, partialQuery, searchType, limit = 10) => {
        let suggestions = get().suggestions.filter(suggestion =>
          (!searchType || suggestion.searchType === searchType)
        );

        if (partialQuery) {
          const lowerPartial = partialQuery.toLowerCase();
          suggestions = suggestions.filter(suggestion =>
            suggestion.query.toLowerCase().includes(lowerPartial)
          );
        }

        return suggestions
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, limit);
      },

      updateSuggestionFrequency: (query, searchType) => {
        const suggestionId = `suggestion-${query}-${searchType}`;
        const existing = get().suggestions.find(s => s.id === suggestionId);

        if (existing) {
          set(state => ({
            suggestions: state.suggestions.map(suggestion =>
              suggestion.id === suggestionId
                ? {
                    ...suggestion,
                    frequency: suggestion.frequency + 1,
                    lastUsed: new Date()
                  }
                : suggestion
            )
          }));
        }
      },

      // Bookmark Management
      createBookmark: (title, query, searchType, filters, userId, tags = [], notes) => {
        const bookmarkId = `bookmark-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        const bookmark: SearchBookmark = {
          id: bookmarkId,
          title,
          query,
          searchType,
          filters,
          userId,
          createdAt: new Date(),
          useCount: 0,
          tags,
          notes
        };

        set(state => ({
          bookmarks: [...state.bookmarks, bookmark]
        }));

        return bookmarkId;
      },

      updateBookmark: (id, updates) => {
        const exists = get().bookmarks.some(bookmark => bookmark.id === id);
        if (!exists) return false;

        set(state => ({
          bookmarks: state.bookmarks.map(bookmark =>
            bookmark.id === id ? { ...bookmark, ...updates } : bookmark
          )
        }));

        return true;
      },

      deleteBookmark: (id) => {
        const exists = get().bookmarks.some(bookmark => bookmark.id === id);
        if (!exists) return false;

        set(state => ({
          bookmarks: state.bookmarks.filter(bookmark => bookmark.id !== id)
        }));

        return true;
      },

      getBookmarks: (userId, searchType) => {
        return get().bookmarks
          .filter(bookmark =>
            bookmark.userId === userId &&
            (!searchType || bookmark.searchType === searchType)
          )
          .sort((a, b) => b.useCount - a.useCount);
      },

      getBookmarksByTag: (userId, tag) => {
        return get().bookmarks.filter(bookmark =>
          bookmark.userId === userId && bookmark.tags.includes(tag)
        );
      },

      executeBookmark: (id) => {
        const bookmark = get().bookmarks.find(b => b.id === id);
        if (!bookmark) return null;

        // Update usage statistics
        set(state => ({
          bookmarks: state.bookmarks.map(b =>
            b.id === id
              ? {
                  ...b,
                  useCount: b.useCount + 1,
                  lastUsed: new Date()
                }
              : b
          )
        }));

        return bookmark;
      },

      // Search Analysis
      getSearchPatterns: (userId) => {
        const userHistory = get().history.filter(item => item.userId === userId);
        
        const typeCount: Record<string, number> = {};
        const hourCount: Record<number, number> = {};
        const queryPrefixes: Record<string, number> = {};

        userHistory.forEach(item => {
          // Search type distribution
          typeCount[item.searchType] = (typeCount[item.searchType] || 0) + 1;
          
          // Peak hours
          const hour = item.timestamp.getHours();
          hourCount[hour] = (hourCount[hour] || 0) + 1;
          
          // Query prefixes (first 3 characters)
          const prefix = item.query.substring(0, 3).toLowerCase();
          if (prefix.length === 3) {
            queryPrefixes[prefix] = (queryPrefixes[prefix] || 0) + 1;
          }
        });

        const peakSearchHours = Object.entries(hourCount)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([hour]) => parseInt(hour, 10));

        const commonQueryPrefixes = Object.entries(queryPrefixes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([prefix]) => prefix);

        const mostSearchedType = Object.entries(typeCount).reduce((max, [type, count]) =>
          count > (typeCount[max] || 0) ? type : max, 'global'
        );

        // Calculate average queries per day
        const days = new Set(userHistory.map(item => 
          item.timestamp.toISOString().split('T')[0]
        )).size;
        const averageQueriesPerDay = days > 0 ? userHistory.length / days : 0;

        return {
          mostSearchedType,
          averageQueriesPerDay,
          peakSearchHours,
          commonQueryPrefixes,
          searchTypeDistribution: typeCount
        };
      },

      getQueryFrequency: (userId, days = 30) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        return get().getPopularSearches(userId, 100).filter(freq =>
          freq.lastSeen > cutoffDate
        );
      },

      getRelatedQueries: (query, userId, limit = 5) => {
        const userHistory = get().history.filter(item => item.userId === userId);
        
        // Find queries that were searched close in time to the given query
        const relatedQueries = new Set<string>();
        
        userHistory.forEach(item => {
          if (item.query === query) {
            // Look for queries within 10 minutes before/after
            const timeWindow = 10 * 60 * 1000; // 10 minutes
            const nearbyQueries = userHistory.filter(other =>
              other.query !== query &&
              Math.abs(other.timestamp.getTime() - item.timestamp.getTime()) < timeWindow
            );
            
            nearbyQueries.forEach(nearby => relatedQueries.add(nearby.query));
          }
        });

        return Array.from(relatedQueries).slice(0, limit);
      },

      // Smart Features
      getSmartSuggestions: (userId, currentQuery, searchType) => {
        const lowerQuery = currentQuery.toLowerCase();
        
        // Query completions
        const completions = get().getSuggestions(userId, currentQuery, searchType, 5)
          .map(s => s.query);

        // Query corrections (simple typo detection)
        const corrections: string[] = [];
        if (currentQuery.length > 2) {
          const popular = get().getPopularSearches(userId, 20, searchType);
          popular.forEach(freq => {
            if (levenshteinDistance(lowerQuery, freq.query.toLowerCase()) <= 2) {
              corrections.push(freq.query);
            }
          });
        }

        // Related queries
        const relatedQueries = get().getRelatedQueries(currentQuery, userId, 3);

        // Bookmarked queries
        const bookmarkedQueries = get().getBookmarks(userId, searchType)
          .filter(bookmark => 
            bookmark.query.toLowerCase().includes(lowerQuery) ||
            bookmark.title.toLowerCase().includes(lowerQuery)
          )
          .slice(0, 3);

        return {
          completions,
          corrections,
          relatedQueries,
          bookmarkedQueries
        };
      },

      predictNextQuery: (userId, currentQuery) => {
        const userHistory = get().history.filter(item => item.userId === userId);
        
        // Find what users typically search after this query
        const nextQueries: Record<string, number> = {};
        
        for (let i = 0; i < userHistory.length - 1; i++) {
          if (userHistory[i].query === currentQuery) {
            const nextQuery = userHistory[i + 1].query;
            nextQueries[nextQuery] = (nextQueries[nextQuery] || 0) + 1;
          }
        }

        return Object.entries(nextQueries)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([query]) => query);
      },

      getContextualSuggestions: (userId, page, section) => {
        const contextualHistory = get().getSearchesByContext(userId, page, section);
        
        if (contextualHistory.length === 0) {
          return get().suggestions.slice(0, 5);
        }

        // Generate suggestions based on what's commonly searched in this context
        const queryCount: Record<string, number> = {};
        contextualHistory.forEach(item => {
          queryCount[item.query] = (queryCount[item.query] || 0) + 1;
        });

        return Object.entries(queryCount)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([query, count]) => ({
            id: `contextual-${query}`,
            query,
            searchType: 'global' as const,
            frequency: count,
            lastUsed: new Date(),
            averageResultCount: 0,
            popularFilters: {},
            isBookmarked: false
          }));
      },

      // Data Management
      cleanupOldHistory: (retentionDays) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const removedItems = get().history.filter(item => item.timestamp < cutoffDate);

        set(state => ({
          history: state.history.filter(item => item.timestamp >= cutoffDate)
        }));

        return removedItems.length;
      },

      compressHistory: () => {
        // Remove duplicate queries (keep most recent)
        const uniqueQueries = new Map<string, SearchHistoryItem>();
        
        get().history.forEach(item => {
          const key = `${item.userId}-${item.query}-${item.searchType}`;
          const existing = uniqueQueries.get(key);
          
          if (!existing || item.timestamp > existing.timestamp) {
            uniqueQueries.set(key, item);
          }
        });

        const compressedHistory = Array.from(uniqueQueries.values());
        const removedCount = get().history.length - compressedHistory.length;

        set({ history: compressedHistory });

        return removedCount;
      },

      exportHistory: (userId, format) => {
        const userHistory = get().history.filter(item => item.userId === userId);
        
        if (format === 'json') {
          return JSON.stringify(userHistory, null, 2);
        } else {
          const headers = 'Query,Search Type,Timestamp,Result Count,Context Page';
          const rows = userHistory.map(item =>
            `"${item.query}","${item.searchType}","${item.timestamp.toISOString()}","${item.resultCount || 0}","${item.context?.page || ''}"`
          );
          return [headers, ...rows].join('\n');
        }
      },

      importHistory: () => {
        // Implementation would depend on format and validation requirements
        return 0;
      },

      // Configuration
      setMaxHistoryItems: (max) => {
        set({ maxHistoryItems: max });
      },

      setMaxSuggestions: (max) => {
        set({ maxSuggestions: max });
      },

      setEnabled: (enabled) => {
        set({ isEnabled: enabled });
      },

      // Privacy and GDPR
      anonymizeUserData: (userId) => {
        const affectedItems = get().history.filter(item => item.userId === userId);
        
        set(state => ({
          history: state.history.map(item =>
            item.userId === userId
              ? { ...item, userId: 'anonymous', selectedResultId: undefined }
              : item
          ),
          bookmarks: state.bookmarks.filter(bookmark => bookmark.userId !== userId)
        }));

        return affectedItems.length;
      },

      deleteUserData: (userId) => {
        const removedHistory = get().history.filter(item => item.userId === userId);
        const removedBookmarks = get().bookmarks.filter(bookmark => bookmark.userId === userId);

        set(state => ({
          history: state.history.filter(item => item.userId !== userId),
          bookmarks: state.bookmarks.filter(bookmark => bookmark.userId !== userId)
        }));

        return removedHistory.length + removedBookmarks.length;
      },

      // Utilities
      searchInHistory: (userId, searchTerm) => {
        const lowerSearchTerm = searchTerm.toLowerCase();
        
        return get().history.filter(item =>
          item.userId === userId &&
          item.query.toLowerCase().includes(lowerSearchTerm)
        );
      },

      getHistoryStatistics: (userId) => {
        const targetHistory = userId
          ? get().history.filter(item => item.userId === userId)
          : get().history;

        const uniqueQueries = new Set(targetHistory.map(item => item.query));
        const queryLengths = targetHistory.map(item => item.query.length);
        const averageQueryLength = queryLengths.length > 0
          ? queryLengths.reduce((sum, length) => sum + length, 0) / queryLengths.length
          : 0;

        // Find most active day
        const dayCount: Record<string, number> = {};
        targetHistory.forEach(item => {
          const day = item.timestamp.toISOString().split('T')[0];
          dayCount[day] = (dayCount[day] || 0) + 1;
        });

        const mostActiveDay = Object.entries(dayCount).reduce((max, [day, count]) =>
          count > (dayCount[max] || 0) ? day : max, ''
        );

        // Search frequency by type
        const searchFrequencyByType: Record<string, number> = {};
        targetHistory.forEach(item => {
          searchFrequencyByType[item.searchType] = (searchFrequencyByType[item.searchType] || 0) + 1;
        });

        return {
          totalSearches: targetHistory.length,
          uniqueQueries: uniqueQueries.size,
          averageQueryLength,
          mostActiveDay,
          searchFrequencyByType
        };
      }
    }),
    {
      name: 'search-history-storage',
      storage: createJSONStorage(() => getOptimalStorage('searchHistory')),
      partialize: (state) => ({
        history: state.history,
        suggestions: state.suggestions,
        bookmarks: state.bookmarks,
        maxHistoryItems: state.maxHistoryItems,
        maxSuggestions: state.maxSuggestions,
        isEnabled: state.isEnabled,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for search history
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            // Ensure all data has proper relationships and new fields
            if (state.history && Array.isArray(state.history)) {
              state.history = state.history.map((item: unknown) => {
                const h = item as Record<string, unknown>;
                return {
                  ...h,
                  timestamp: h.timestamp ? new Date(h.timestamp as string | number | Date) : new Date(),
                  searchType: h.searchType || 'global'
                };
              });
            }
            if (state.bookmarks && Array.isArray(state.bookmarks)) {
              state.bookmarks = state.bookmarks.map((bookmark: unknown) => {
                const b = bookmark as Record<string, unknown>;
                return {
                  ...b,
                  createdAt: b.createdAt ? new Date(b.createdAt as string | number | Date) : new Date(),
                  lastUsed: b.lastUsed ? new Date(b.lastUsed as string | number | Date) : undefined,
                  useCount: b.useCount || 0,
                  tags: b.tags || []
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

// Helper function to calculate Levenshtein distance for typo detection
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}