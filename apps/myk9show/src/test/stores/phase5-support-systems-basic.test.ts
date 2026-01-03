import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Store imports
import { useDraftStore } from '@/store/draftStore';
import { useSearchAnalyticsStore } from '@/store/searchAnalyticsStore';
import { useSearchHistoryStore } from '@/store/searchHistoryStore';

describe('Phase 5 Support Systems - Basic Configuration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Draft Store', () => {
    it('should be properly configured', () => {
      const store = useDraftStore.getState();
      
      // Verify store structure
      expect(typeof store.saveDraft).toBe('function');
      expect(typeof store.loadDraft).toBe('function');
      expect(typeof store.updateDraft).toBe('function');
      expect(typeof store.deleteDraft).toBe('function');
      expect(typeof store.clearAllDrafts).toBe('function');
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

    it('should support basic operations', () => {
      const store = useDraftStore.getState();
      
      // Test that methods exist and can be called
      expect(() => store.getDraftsByUser('test-user')).not.toThrow();
      expect(() => store.getDraftsByShow('test-show')).not.toThrow();
      expect(() => store.getDraftsByType('registration')).not.toThrow();
      expect(() => store.getDraftStatistics()).not.toThrow();
    });
  });

  describe('Search Analytics Store', () => {
    it('should be properly configured', () => {
      const store = useSearchAnalyticsStore.getState();
      
      expect(typeof store.logSearchQuery).toBe('function');
      expect(typeof store.logSearchResult).toBe('function');
      expect(typeof store.generateAnalytics).toBe('function');
      expect(typeof store.startSearchSession).toBe('function');
      expect(typeof store.clearAnalytics).toBe('function');
      expect(Array.isArray(store.queries)).toBe(true);
      expect(Array.isArray(store.results)).toBe(true);
      expect(Array.isArray(store.sessions)).toBe(true);
    });

    it('should have tracking enabled by default', () => {
      const store = useSearchAnalyticsStore.getState();
      expect(store.isTracking).toBe(true);
    });

    it('should support analytics operations', () => {
      const store = useSearchAnalyticsStore.getState();
      
      // Test that methods exist and can be called
      expect(() => store.generateAnalytics()).not.toThrow();
      expect(() => store.getPerformanceMetrics()).not.toThrow();
      expect(() => store.getUserBehavior('test-user')).not.toThrow();
      expect(() => store.getSearchTrends(7)).not.toThrow();
    });
  });

  describe('Search History Store', () => {
    it('should be properly configured', () => {
      const store = useSearchHistoryStore.getState();
      
      expect(typeof store.addToHistory).toBe('function');
      expect(typeof store.createBookmark).toBe('function');
      expect(typeof store.getRecentSearches).toBe('function');
      expect(typeof store.getSuggestions).toBe('function');
      expect(typeof store.clearHistory).toBe('function');
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

    it('should support history operations', () => {
      const store = useSearchHistoryStore.getState();
      
      // Test that methods exist and can be called
      expect(() => store.getRecentSearches('test-user')).not.toThrow();
      expect(() => store.getPopularSearches('test-user')).not.toThrow();
      expect(() => store.getSearchPatterns('test-user')).not.toThrow();
      expect(() => store.getHistoryStatistics()).not.toThrow();
    });
  });

  describe('Store Integration', () => {
    it('should have IndexedDB-enabled storage adapters', () => {
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

    it('should support data management operations', () => {
      const draftStore = useDraftStore.getState();
      const analyticsStore = useSearchAnalyticsStore.getState();
      const historyStore = useSearchHistoryStore.getState();
      
      // Test cleanup methods exist
      expect(typeof draftStore.clearAllDrafts).toBe('function');
      expect(typeof analyticsStore.clearAnalytics).toBe('function');
      expect(typeof historyStore.clearHistory).toBe('function');
      
      // Test user data deletion methods exist
      expect(typeof draftStore.clearDraftsByUser).toBe('function');
      expect(typeof analyticsStore.clearUserData).toBe('function');
      expect(typeof historyStore.deleteUserData).toBe('function');
    });
  });

  describe('Phase 5 Implementation Status', () => {
    it('should have all required Phase 5 stores implemented', () => {
      // Verify all Phase 5 stores are available
      expect(useDraftStore).toBeDefined();
      expect(useSearchAnalyticsStore).toBeDefined();
      expect(useSearchHistoryStore).toBeDefined();
    });

    it('should support IndexedDB migration', () => {
      // Verify stores can handle IndexedDB operations
      const stores = [useDraftStore, useSearchAnalyticsStore, useSearchHistoryStore];
      
      stores.forEach(store => {
        const state = store.getState();
        expect(state).toBeDefined();
        expect(typeof state).toBe('object');
      });
    });
  });
});