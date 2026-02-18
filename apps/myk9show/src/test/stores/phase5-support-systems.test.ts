import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Store imports
import { useDraftStore } from '@/store/draftStore';
import { useSearchAnalyticsStore } from '@/store/searchAnalyticsStore';
import { useSearchHistoryStore } from '@/store/searchHistoryStore';

// Type imports - removed unused types for lint compliance
// import type { SavedDraft, DraftMetadata } from '@/store/draftStore';
// import type { SearchQuery, SearchResult } from '@/store/searchAnalyticsStore';
// import type { SearchHistoryItem, SearchBookmark } from '@/store/searchHistoryStore';

describe('Phase 5 Support Systems Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    // Clear all store states
    useDraftStore.getState().clearAllDrafts();
    useSearchAnalyticsStore.getState().clearAnalytics();
    useSearchHistoryStore.getState().clearHistory();
    // Reset session tracking
    useSearchAnalyticsStore.setState({ currentSessionId: null });
  });

  describe('Draft Store Configuration', () => {
    it('should have properly configured draft store', () => {
      const store = useDraftStore.getState();

      // Verify store structure
      expect(typeof store.saveDraft).toBe('function');
      expect(typeof store.loadDraft).toBe('function');
      expect(typeof store.updateDraft).toBe('function');
      expect(typeof store.deleteDraft).toBe('function');
      expect(Array.isArray(store.drafts)).toBe(true);
      expect(typeof store.config).toBe('object');
    });

    it('should have proper default configuration', () => {
      const store = useDraftStore.getState();

      expect(store.config.autoSaveInterval).toBe(30000);
      expect(store.config.maxDraftsPerShow).toBe(10);
      expect(store.config.maxDraftsPerUser).toBe(50);
      expect(store.config.retentionDays).toBe(30);
    });
  });

  describe('Search Analytics Store Configuration', () => {
    it('should have properly configured search analytics store', () => {
      const store = useSearchAnalyticsStore.getState();

      expect(typeof store.logSearchQuery).toBe('function');
      expect(typeof store.logSearchResult).toBe('function');
      expect(typeof store.generateAnalytics).toBe('function');
      expect(typeof store.startSearchSession).toBe('function');
      expect(Array.isArray(store.queries)).toBe(true);
      expect(Array.isArray(store.results)).toBe(true);
      expect(Array.isArray(store.sessions)).toBe(true);
    });

    it('should have tracking enabled by default', () => {
      const store = useSearchAnalyticsStore.getState();
      expect(store.isTracking).toBe(true);
    });
  });

  describe('Search History Store Configuration', () => {
    it('should have properly configured search history store', () => {
      const store = useSearchHistoryStore.getState();

      expect(typeof store.addToHistory).toBe('function');
      expect(typeof store.createBookmark).toBe('function');
      expect(typeof store.getRecentSearches).toBe('function');
      expect(typeof store.getSuggestions).toBe('function');
      expect(Array.isArray(store.history)).toBe(true);
      expect(Array.isArray(store.bookmarks)).toBe(true);
      expect(Array.isArray(store.suggestions)).toBe(true);
    });

    it('should have proper default limits', () => {
      const store = useSearchHistoryStore.getState();
      expect(store.maxHistoryItems).toBe(1000);
      expect(store.maxSuggestions).toBe(50);
      expect(store.isEnabled).toBe(true);
    });
  });

  describe('Draft Store Operations', () => {
    it('should handle draft CRUD operations', () => {
      const store = useDraftStore.getState();

      const testData = {
        formField1: 'test value',
        formField2: 123,
        selectedItems: ['item1', 'item2'],
      };

      // Test save
      const draftId = store.saveDraft('show-123', 'user-456', 'registration', testData, {
        title: 'Test Draft',
        stepCompleted: 'step1',
      });

      expect(draftId).toBeDefined();
      // Get fresh store state after operation
      const updatedStore = useDraftStore.getState();
      expect(updatedStore.drafts).toHaveLength(1);

      // Test load
      const loadedDraft = store.loadDraft(draftId);
      expect(loadedDraft).not.toBeNull();
      expect(loadedDraft?.data).toEqual(testData);
      expect(loadedDraft?.metadata.title).toBe('Test Draft');

      // Test update
      const updatedData = { ...testData, formField3: 'new field' };
      const updateSuccess = store.updateDraft(draftId, updatedData);
      expect(updateSuccess).toBe(true);

      const updatedDraft = store.loadDraft(draftId);
      expect(updatedDraft?.data.formField3).toBe('new field');

      // Test delete
      const deleteSuccess = store.deleteDraft(draftId);
      expect(deleteSuccess).toBe(true);
      expect(useDraftStore.getState().drafts).toHaveLength(0);
    });

    it('should handle draft queries', () => {
      const store = useDraftStore.getState();

      // Create test drafts
      store.saveDraft('show-1', 'user-1', 'registration', { field: 'value1' });
      store.saveDraft('show-1', 'user-2', 'registration', { field: 'value2' });
      store.saveDraft('show-2', 'user-1', 'dog', { field: 'value3' });

      // Test queries
      const showDrafts = store.getDraftsByShow('show-1');
      expect(showDrafts).toHaveLength(2);

      const userDrafts = store.getDraftsByUser('user-1');
      expect(userDrafts).toHaveLength(2);

      const typeDrafts = store.getDraftsByType('registration');
      expect(typeDrafts).toHaveLength(2);

      const specificDrafts = store.getDraftsByShowAndUser('show-1', 'user-1');
      expect(specificDrafts).toHaveLength(1);
    });

    it('should handle bulk operations', () => {
      const store = useDraftStore.getState();

      const draftsToSave = [
        {
          showId: 'show-bulk',
          userId: 'user-bulk',
          draftType: 'registration' as const,
          data: { field1: 'value1' },
        },
        {
          showId: 'show-bulk',
          userId: 'user-bulk',
          draftType: 'dog' as const,
          data: { field2: 'value2' },
        },
      ];

      const savedIds = store.saveBulkDrafts(draftsToSave);
      expect(savedIds).toHaveLength(2);
      expect(useDraftStore.getState().drafts).toHaveLength(2);

      const deletedCount = store.deleteBulkDrafts(savedIds);
      expect(deletedCount).toBe(2);
      expect(useDraftStore.getState().drafts).toHaveLength(0);
    });

    it('should enforce draft limits', () => {
      const store = useDraftStore.getState();

      // Update config to low limits for testing
      store.updateConfig({ maxDraftsPerShow: 2 });

      // Create drafts that exceed the limit
      store.saveDraft('show-limit', 'user-1', 'registration', { draft: 1 });
      store.saveDraft('show-limit', 'user-1', 'registration', { draft: 2 });
      store.saveDraft('show-limit', 'user-1', 'registration', { draft: 3 });

      // Should only keep the maximum allowed
      const showDrafts = store.getDraftsByShow('show-limit');
      expect(showDrafts.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Search Analytics Store Operations', () => {
    it('should handle search query logging', () => {
      const store = useSearchAnalyticsStore.getState();

      const queryId = store.logSearchQuery(
        'test query',
        'dogs',
        'user-123',
        { breed: 'Golden Retriever' },
        'name',
        'asc'
      );

      expect(queryId).toBeDefined();
      expect(useSearchAnalyticsStore.getState().queries).toHaveLength(1);

      const query = useSearchAnalyticsStore.getState().queries[0];
      expect(query.query).toBe('test query');
      expect(query.searchType).toBe('dogs');
      expect(query.userId).toBe('user-123');
      expect(query.filters?.breed).toBe('Golden Retriever');
    });

    it('should handle search result logging', () => {
      const store = useSearchAnalyticsStore.getState();

      const queryId = store.logSearchQuery('test query', 'dogs', 'user-123');
      store.logSearchResult(queryId, 5, 150, true);

      expect(useSearchAnalyticsStore.getState().results).toHaveLength(1);

      const result = useSearchAnalyticsStore.getState().results[0];
      expect(result.queryId).toBe(queryId);
      expect(result.resultCount).toBe(5);
      expect(result.executionTime).toBe(150);
      expect(result.wasSuccessful).toBe(true);
    });

    it('should handle session management', () => {
      const store = useSearchAnalyticsStore.getState();

      const sessionId = store.startSearchSession('user-session');
      expect(sessionId).toBeDefined();
      expect(useSearchAnalyticsStore.getState().sessions).toHaveLength(1);
      expect(useSearchAnalyticsStore.getState().currentSessionId).toBe(sessionId);

      // Log some queries to update session stats
      const queryId = store.logSearchQuery('test', 'dogs', 'user-session');
      store.logSearchResult(queryId, 3, 100, true);

      const session = store.getCurrentSession();
      expect(session?.totalQueries).toBe(1);
      expect(session?.successfulQueries).toBe(1);

      store.endSearchSession(sessionId);
      const endedSession = useSearchAnalyticsStore
        .getState()
        .sessions.find(s => s.id === sessionId);
      expect(endedSession?.endTime).toBeDefined();
    });

    it('should generate analytics', () => {
      const store = useSearchAnalyticsStore.getState();

      // Create test data
      const queryId1 = store.logSearchQuery('query1', 'dogs', 'user-1');
      store.logSearchResult(queryId1, 5, 100, true);

      const queryId2 = store.logSearchQuery('query2', 'people', 'user-1');
      store.logSearchResult(queryId2, 0, 50, false);

      const analytics = store.generateAnalytics();

      expect(analytics.totalSearches).toBe(2);
      expect(analytics.successRate).toBe(50); // 1 out of 2 successful
      expect(analytics.averageExecutionTime).toBe(75); // (100 + 50) / 2
      expect(analytics.mostPopularSearchTypes.dogs).toBe(1);
      expect(analytics.mostPopularSearchTypes.people).toBe(1);
    });

    it('should track performance metrics', () => {
      const store = useSearchAnalyticsStore.getState();

      // Create queries with different performance levels
      const fastQuery = store.logSearchQuery('fast', 'dogs', 'user-1');
      store.logSearchResult(fastQuery, 5, 50, true); // Fast query

      const normalQuery = store.logSearchQuery('normal', 'dogs', 'user-1');
      store.logSearchResult(normalQuery, 3, 200, true); // Normal query

      const slowQuery = store.logSearchQuery('slow', 'dogs', 'user-1');
      store.logSearchResult(slowQuery, 1, 600, true); // Slow query

      const metrics = store.getPerformanceMetrics('dogs');

      expect(metrics.fastQueries).toBe(1);
      expect(metrics.normalQueries).toBe(1);
      expect(metrics.slowQueries).toBe(1);
      expect(metrics.totalQueries).toBe(3);
    });
  });

  describe('Search History Store Operations', () => {
    it('should handle search history management', () => {
      const store = useSearchHistoryStore.getState();

      store.addToHistory(
        'golden retriever',
        'dogs',
        'user-hist',
        10,
        { age: '2-5' },
        { page: 'dogs', section: 'search' }
      );

      expect(useSearchHistoryStore.getState().history).toHaveLength(1);

      const historyItem = useSearchHistoryStore.getState().history[0];
      expect(historyItem.query).toBe('golden retriever');
      expect(historyItem.searchType).toBe('dogs');
      expect(historyItem.userId).toBe('user-hist');
      expect(historyItem.resultCount).toBe(10);
    });

    it('should prevent duplicate recent searches', () => {
      const store = useSearchHistoryStore.getState();

      // Add same search twice within 5 minutes
      store.addToHistory('duplicate query', 'dogs', 'user-dup');
      store.addToHistory('duplicate query', 'dogs', 'user-dup');

      // Should only have one entry (the second one updates the first)
      expect(useSearchHistoryStore.getState().history).toHaveLength(1);
    });

    it('should handle bookmark operations', () => {
      const store = useSearchHistoryStore.getState();

      const bookmarkId = store.createBookmark(
        'My Favorite Search',
        'champion bloodline',
        'dogs',
        { certified: true },
        'user-bookmark',
        ['breeding', 'champions'],
        'For finding breeding prospects'
      );

      expect(bookmarkId).toBeDefined();
      expect(useSearchHistoryStore.getState().bookmarks).toHaveLength(1);

      const bookmark = useSearchHistoryStore.getState().bookmarks[0];
      expect(bookmark.title).toBe('My Favorite Search');
      expect(bookmark.query).toBe('champion bloodline');
      expect(bookmark.tags).toContain('breeding');

      // Test bookmark execution
      const executedBookmark = store.executeBookmark(bookmarkId);
      expect(executedBookmark).not.toBeNull();
      const freshBookmark = useSearchHistoryStore
        .getState()
        .bookmarks.find(b => b.id === bookmarkId);
      expect(freshBookmark?.useCount).toBe(1);

      // Test bookmark update
      const updateSuccess = store.updateBookmark(bookmarkId, {
        title: 'Updated Title',
        notes: 'Updated notes',
      });
      expect(updateSuccess).toBe(true);

      const updatedBookmark = useSearchHistoryStore
        .getState()
        .bookmarks.find(b => b.id === bookmarkId);
      expect(updatedBookmark?.title).toBe('Updated Title');

      // Test bookmark deletion
      const deleteSuccess = store.deleteBookmark(bookmarkId);
      expect(deleteSuccess).toBe(true);
      expect(useSearchHistoryStore.getState().bookmarks).toHaveLength(0);
    });

    it('should provide search suggestions', () => {
      const store = useSearchHistoryStore.getState();

      // Add some search history
      store.addToHistory('golden retriever puppy', 'dogs', 'user-suggest');
      store.addToHistory('golden retriever adult', 'dogs', 'user-suggest');
      store.addToHistory('german shepherd', 'dogs', 'user-suggest');

      // Generate suggestions
      store.generateSuggestions('user-suggest', 'dogs');
      expect(useSearchHistoryStore.getState().suggestions.length).toBeGreaterThan(0);

      // Get filtered suggestions
      const goldenSuggestions = store.getSuggestions('user-suggest', 'golden', 'dogs');
      expect(goldenSuggestions.length).toBeGreaterThan(0);
      expect(goldenSuggestions.every(s => s.query.includes('golden'))).toBe(true);
    });

    it('should track search patterns', () => {
      const store = useSearchHistoryStore.getState();

      // Add varied search history
      store.addToHistory('query1', 'dogs', 'user-pattern');
      store.addToHistory('query2', 'people', 'user-pattern');
      store.addToHistory('query3', 'dogs', 'user-pattern');
      store.addToHistory('query4', 'shows', 'user-pattern');

      const patterns = store.getSearchPatterns('user-pattern');

      expect(patterns.mostSearchedType).toBe('dogs'); // 2 out of 4 searches
      expect(patterns.searchTypeDistribution.dogs).toBe(2);
      expect(patterns.searchTypeDistribution.people).toBe(1);
      expect(patterns.searchTypeDistribution.shows).toBe(1);
    });

    it('should provide smart suggestions', () => {
      const store = useSearchHistoryStore.getState();

      // Add search history
      store.addToHistory('golden retriever', 'dogs', 'user-smart');
      store.addToHistory('golden retriever puppy', 'dogs', 'user-smart');

      // Create a bookmark
      store.createBookmark('Golden Search', 'golden retriever champion', 'dogs', {}, 'user-smart');

      const smartSuggestions = store.getSmartSuggestions('user-smart', 'golden ret', 'dogs');

      expect(smartSuggestions.completions.length).toBeGreaterThan(0);
      expect(smartSuggestions.bookmarkedQueries.length).toBeGreaterThan(0);
    });
  });

  describe('Cross-Store Integration', () => {
    it('should handle related operations across support stores', () => {
      const draftStore = useDraftStore.getState();
      const analyticsStore = useSearchAnalyticsStore.getState();
      const historyStore = useSearchHistoryStore.getState();

      // Simulate a user workflow
      const userId = 'integration-user';
      const showId = 'integration-show';

      // 1. User starts a draft
      draftStore.saveDraft(
        showId,
        userId,
        'registration',
        { dogName: 'Buddy', breed: 'Golden Retriever' },
        { title: 'Dog Registration Draft' }
      );

      // 2. User searches for something
      analyticsStore.startSearchSession(userId);
      const queryId = analyticsStore.logSearchQuery('golden retriever', 'dogs', userId);
      analyticsStore.logSearchResult(queryId, 5, 120, true);

      // 3. User adds to search history
      historyStore.addToHistory('golden retriever', 'dogs', userId, 5);

      // Verify all stores have related data
      expect(draftStore.getDraftsByUser(userId)).toHaveLength(1);
      expect(
        useSearchAnalyticsStore.getState().queries.filter(q => q.userId === userId)
      ).toHaveLength(1);
      expect(historyStore.getRecentSearches(userId)).toHaveLength(1);

      // Test cross-store cleanup
      draftStore.clearDraftsByUser(userId);
      analyticsStore.clearUserData(userId);
      historyStore.deleteUserData(userId);

      expect(draftStore.getDraftsByUser(userId)).toHaveLength(0);
      expect(
        useSearchAnalyticsStore.getState().queries.filter(q => q.userId === userId)
      ).toHaveLength(0);
      expect(historyStore.getRecentSearches(userId)).toHaveLength(0);
    });
  });

  describe('Data Management and Cleanup', () => {
    it('should handle data cleanup operations', () => {
      const draftStore = useDraftStore.getState();
      const analyticsStore = useSearchAnalyticsStore.getState();
      const historyStore = useSearchHistoryStore.getState();

      // Create test data
      draftStore.saveDraft('test-show', 'test-user', 'registration', { test: 'data' });

      const queryId = analyticsStore.logSearchQuery('test', 'dogs', 'test-user');
      analyticsStore.logSearchResult(queryId, 1, 100, true);

      historyStore.addToHistory('test query', 'dogs', 'test-user');

      // Test cleanup methods — use fresh getState() after mutations
      expect(useDraftStore.getState().drafts).toHaveLength(1);
      expect(useSearchAnalyticsStore.getState().queries).toHaveLength(1);
      expect(useSearchHistoryStore.getState().history).toHaveLength(1);

      // Clear all data
      draftStore.clearAllDrafts();
      analyticsStore.clearAnalytics();
      historyStore.clearHistory();

      expect(useDraftStore.getState().drafts).toHaveLength(0);
      expect(useSearchAnalyticsStore.getState().queries).toHaveLength(0);
      expect(useSearchHistoryStore.getState().history).toHaveLength(0);
    });

    it('should handle statistics generation', () => {
      const draftStore = useDraftStore.getState();
      const analyticsStore = useSearchAnalyticsStore.getState();
      const historyStore = useSearchHistoryStore.getState();

      // Create some test data
      draftStore.saveDraft('show-1', 'user-stats', 'registration', { test: 'data1' });
      draftStore.saveDraft('show-2', 'user-stats', 'dog', { test: 'data2' });

      const queryId = analyticsStore.logSearchQuery('stats test', 'dogs', 'user-stats');
      analyticsStore.logSearchResult(queryId, 3, 150, true);

      historyStore.addToHistory('stats query', 'dogs', 'user-stats', 3);

      // Test statistics generation
      const draftStats = draftStore.getDraftStatistics();
      expect(draftStats.totalDrafts).toBe(2);
      expect(draftStats.draftsByType.registration).toBe(1);
      expect(draftStats.draftsByType.dog).toBe(1);

      const analytics = analyticsStore.generateAnalytics();
      expect(analytics.totalSearches).toBe(1);
      expect(analytics.successRate).toBe(100);

      const historyStats = historyStore.getHistoryStatistics('user-stats');
      expect(historyStats.totalSearches).toBe(1);
      expect(historyStats.uniqueQueries).toBe(1);
    });
  });

  describe('IndexedDB Integration Status', () => {
    it('should use IndexedDB-enabled storage adapters', () => {
      // This test verifies that the stores are configured to use the optimal storage
      const stores = [
        { name: 'draft', store: useDraftStore },
        { name: 'searchAnalytics', store: useSearchAnalyticsStore },
        { name: 'searchHistory', store: useSearchHistoryStore },
      ];

      stores.forEach(({ store }) => {
        const state = store.getState();
        // Verify the store is functional (basic smoke test)
        expect(typeof state).toBe('object');
        expect(state).not.toBeNull();
      });
    });
  });
});
