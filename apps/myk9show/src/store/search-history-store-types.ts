/**
 * @module search-history-store-types
 * Type definitions for the search history store.
 * Contains all interfaces and types used by the search history Zustand store.
 */

// ── Data Model Interfaces ──────────────────────────────────────────────

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

// ── Store State ────────────────────────────────────────────────────────

export interface SearchHistoryState {
  history: SearchHistoryItem[];
  suggestions: SearchSuggestion[];
  bookmarks: SearchBookmark[];
  maxHistoryItems: number;
  maxSuggestions: number;
  isEnabled: boolean;
}

// ── Action Interfaces ──────────────────────────────────────────────────

export interface HistoryActions {
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
}

export interface QueryActions {
  getRecentSearches: (userId: string, limit?: number, searchType?: SearchHistoryItem['searchType']) => SearchHistoryItem[];
  getPopularSearches: (userId: string, limit?: number, searchType?: SearchHistoryItem['searchType']) => SearchFrequency[];
  getSearchesByContext: (userId: string, page: string, section?: string) => SearchHistoryItem[];
}

export interface SuggestionActions {
  generateSuggestions: (userId: string, searchType?: SearchHistoryItem['searchType']) => SearchSuggestion[];
  getSuggestions: (
    userId: string,
    partialQuery?: string,
    searchType?: SearchHistoryItem['searchType'],
    limit?: number
  ) => SearchSuggestion[];
  updateSuggestionFrequency: (query: string, searchType: SearchHistoryItem['searchType']) => void;
}

export interface BookmarkActions {
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
}

export interface AnalyticsActions {
  getSearchPatterns: (userId: string) => {
    mostSearchedType: string;
    averageQueriesPerDay: number;
    peakSearchHours: number[];
    commonQueryPrefixes: string[];
    searchTypeDistribution: Record<string, number>;
  };
  getQueryFrequency: (userId: string, days?: number) => SearchFrequency[];
  getRelatedQueries: (query: string, userId: string, limit?: number) => string[];
}

export interface SmartFeatureActions {
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
}

export interface DataManagementActions {
  cleanupOldHistory: (retentionDays: number) => number;
  compressHistory: () => number;
  exportHistory: (userId: string, format: 'json' | 'csv') => string;
  importHistory: (data: string, format: 'json' | 'csv', userId: string) => number;
}

export interface ConfigurationActions {
  setMaxHistoryItems: (max: number) => void;
  setMaxSuggestions: (max: number) => void;
  setEnabled: (enabled: boolean) => void;
}

export interface PrivacyActions {
  anonymizeUserData: (userId: string) => number;
  deleteUserData: (userId: string) => number;
}

export interface UtilityActions {
  searchInHistory: (userId: string, searchTerm: string) => SearchHistoryItem[];
  getHistoryStatistics: (userId?: string) => {
    totalSearches: number;
    uniqueQueries: number;
    averageQueryLength: number;
    mostActiveDay: string;
    searchFrequencyByType: Record<string, number>;
  };
}

// ── Composed Store Type ────────────────────────────────────────────────

export type SearchHistoryStore = SearchHistoryState
  & HistoryActions
  & QueryActions
  & SuggestionActions
  & BookmarkActions
  & AnalyticsActions
  & SmartFeatureActions
  & DataManagementActions
  & ConfigurationActions
  & PrivacyActions
  & UtilityActions;
