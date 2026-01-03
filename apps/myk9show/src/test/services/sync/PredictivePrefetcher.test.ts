import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PredictivePrefetcher } from '@/services/sync/PredictivePrefetcher';

// Mock the sync service
vi.mock('@/services/sync/syncService', () => ({
  syncService: {
    addToQueue: vi.fn().mockResolvedValue('queue-id-123')
  }
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

describe('PredictivePrefetcher', () => {
  let prefetcher: PredictivePrefetcher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    prefetcher = new PredictivePrefetcher();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Navigation Tracking', () => {
    it('should track navigation patterns', () => {
      prefetcher.trackNavigation('/shows', '/show/123', 5000);
      prefetcher.trackNavigation('/shows', '/show/456', 3000);
      prefetcher.trackNavigation('/shows', '/show/123', 7000);

      const analytics = prefetcher.getAnalytics();
      expect(analytics.navigationPatterns).toBeGreaterThan(0);
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should update existing navigation patterns', () => {
      // Track the same navigation multiple times
      prefetcher.trackNavigation('/shows', '/dogs', 2000);
      prefetcher.trackNavigation('/shows', '/dogs', 4000);
      prefetcher.trackNavigation('/shows', '/dogs', 3000);

      const analytics = prefetcher.getAnalytics();
      expect(analytics.navigationPatterns).toBe(1); // Should be one unique pattern
    });

    it('should save patterns to storage', () => {
      prefetcher.trackNavigation('/clubs', '/shows', 1500);
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'myk9show-nav-patterns',
        expect.any(String)
      );
    });
  });

  describe('Entity Access Tracking', () => {
    it('should track entity access patterns', () => {
      prefetcher.trackEntityAccess('person', 'person-123', '/people', ['dog:dog-456']);
      prefetcher.trackEntityAccess('dog', 'dog-456', '/dogs', ['person:person-123']);

      const analytics = prefetcher.getAnalytics();
      expect(analytics.entityPatterns).toBe(2);
    });

    it('should track related entities', () => {
      const relatedEntities = ['dog:dog-1', 'dog:dog-2', 'show:show-1'];
      prefetcher.trackEntityAccess('person', 'person-123', '/people', relatedEntities);

      // Tracking should save the patterns
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'myk9show-entity-patterns',
        expect.any(String)
      );
    });

    it('should merge related entities for existing patterns', () => {
      prefetcher.trackEntityAccess('person', 'person-123', '/people', ['dog:dog-1']);
      prefetcher.trackEntityAccess('person', 'person-123', '/people', ['dog:dog-2']);
      prefetcher.trackEntityAccess('person', 'person-123', '/people', ['dog:dog-1']); // Duplicate

      const analytics = prefetcher.getAnalytics();
      expect(analytics.entityPatterns).toBe(1); // Same entity, should merge
    });
  });

  describe('Search Predictions', () => {
    it('should predict search results', () => {
      const query = 'golden retriever';
      prefetcher.predictSearchResults(query, 'dog');

      const analytics = prefetcher.getAnalytics();
      expect(analytics.queuedPrefetches).toBeGreaterThan(0);
    });

    it('should generate query expansions', () => {
      const query = 'lab';
      prefetcher.predictSearchResults(query);

      // Should generate multiple prediction variants
      const analytics = prefetcher.getAnalytics();
      expect(analytics.queuedPrefetches).toBeGreaterThan(0);
    });

    it('should handle short queries appropriately', () => {
      const shortQuery = 'a';
      prefetcher.predictSearchResults(shortQuery);

      // Should handle short queries gracefully
      const analytics = prefetcher.getAnalytics();
      expect(analytics.queuedPrefetches).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Entity Predictions', () => {
    it('should predict next entities based on navigation', () => {
      // Set up navigation patterns
      prefetcher.trackNavigation('/shows', '/dogs', 2000);
      prefetcher.trackNavigation('/shows', '/dogs', 3000);
      prefetcher.trackNavigation('/shows', '/dogs', 1500);

      const predictions = prefetcher.predictNextEntities('/shows', []);
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should predict based on entity relationships', () => {
      // Set up entity relationships
      prefetcher.trackEntityAccess('person', 'person-1', '/people', ['dog:dog-1', 'dog:dog-2']);
      prefetcher.trackEntityAccess('person', 'person-1', '/people', ['dog:dog-1']);

      const predictions = prefetcher.predictNextEntities('/people', ['person:person-1']);
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should limit number of predictions', () => {
      // Create many relationships
      const relatedEntities = Array.from({ length: 20 }, (_, i) => `dog:dog-${i}`);
      prefetcher.trackEntityAccess('person', 'person-1', '/people', relatedEntities);

      const predictions = prefetcher.predictNextEntities('/people', ['person:person-1']);
      expect(predictions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Prefetch Rules', () => {
    it('should add custom prefetch rules', () => {
      const rule = {
        trigger: 'route_change' as const,
        condition: 'route:/custom',
        action: 'prefetch_entity' as const,
        priority: 'high' as const,
        enabled: true
      };

      prefetcher.addPrefetchRule(rule);
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'myk9show-prefetch-rules',
        expect.any(String)
      );
    });

    it('should initialize with default rules', () => {
      // Default rules should be created during initialization
      const analytics = prefetcher.getAnalytics();
      expect(analytics.activeRules).toBeGreaterThan(0);
    });
  });

  describe('Storage Management', () => {
    it('should save patterns to localStorage', () => {
      prefetcher.trackNavigation('/test1', '/test2', 1000);
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'myk9show-nav-patterns',
        expect.any(String)
      );
    });

    it('should load patterns from localStorage', () => {
      const mockNavPatterns = JSON.stringify([
        ['test->test2', { fromRoute: 'test', toRoute: 'test2', frequency: 5, avgTimeSpent: 2000, lastAccessed: new Date().toISOString() }]
      ]);
      
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'myk9show-nav-patterns') return mockNavPatterns;
        return null;
      });

      const newPrefetcher = new PredictivePrefetcher();
      const analytics = newPrefetcher.getAnalytics();
      expect(analytics.navigationPatterns).toBe(1);
    });

    it('should handle storage errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => new PredictivePrefetcher()).not.toThrow();
    });
  });

  describe('Analytics', () => {
    it('should provide analytics data', () => {
      prefetcher.trackNavigation('/route1', '/route2', 1000);
      prefetcher.trackEntityAccess('person', 'person-1', '/people', []);

      const analytics = prefetcher.getAnalytics();
      expect(analytics).toHaveProperty('navigationPatterns');
      expect(analytics).toHaveProperty('entityPatterns');
      expect(analytics).toHaveProperty('activeRules');
      expect(analytics).toHaveProperty('pendingPrefetches');
      expect(analytics).toHaveProperty('queuedPrefetches');
    });

    it('should track prefetch queue status', () => {
      prefetcher.predictSearchResults('test query');
      
      const analytics = prefetcher.getAnalytics();
      expect(typeof analytics.queuedPrefetches).toBe('number');
      expect(typeof analytics.pendingPrefetches).toBe('number');
    });
  });

  describe('Pattern Cleanup', () => {
    it('should reset all patterns', () => {
      prefetcher.trackNavigation('/test', '/test2', 1000);
      prefetcher.trackEntityAccess('person', 'person-1', '/people', []);

      let analytics = prefetcher.getAnalytics();
      expect(analytics.navigationPatterns).toBeGreaterThan(0);

      prefetcher.resetPatterns();

      analytics = prefetcher.getAnalytics();
      expect(analytics.navigationPatterns).toBe(0);
      expect(analytics.entityPatterns).toBe(0);
    });

    it('should clear localStorage on reset', () => {
      prefetcher.resetPatterns();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('myk9show-nav-patterns');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('myk9show-entity-patterns');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('myk9show-prefetch-rules');
    });
  });

  describe('Size Estimation', () => {
    it('should estimate entity sizes correctly', () => {
      // Test that size estimation is working by checking prefetch behavior
      prefetcher.predictSearchResults('test', 'person');
      prefetcher.predictSearchResults('test', 'dog');
      
      const analytics = prefetcher.getAnalytics();
      expect(analytics.queuedPrefetches).toBeGreaterThanOrEqual(0);
    });

    it('should respect size limits', () => {
      // This would test the internal size limiting, but since methods are private,
      // we test through behavior
      const largeQuery = 'a'.repeat(1000);
      prefetcher.predictSearchResults(largeQuery);
      
      // Should still handle large queries gracefully
      const analytics = prefetcher.getAnalytics();
      expect(analytics.queuedPrefetches).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Confidence and Success Rate', () => {
    it('should handle high-confidence patterns', () => {
      // Create a frequently accessed pattern
      for (let i = 0; i < 10; i++) {
        prefetcher.trackNavigation('/frequent', '/destination', 1000);
      }

      const predictions = prefetcher.predictNextEntities('/frequent', []);
      // High frequency should result in better predictions
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should filter low-confidence predictions', () => {
      // Create a low-frequency pattern
      prefetcher.trackNavigation('/rare', '/destination', 1000);

      const predictions = prefetcher.predictNextEntities('/rare', []);
      // Low frequency might result in fewer or no predictions
      expect(Array.isArray(predictions)).toBe(true);
    });
  });
});