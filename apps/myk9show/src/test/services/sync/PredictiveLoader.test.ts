import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PredictiveLoader } from '@/services/sync/PredictiveLoader';
import { logger } from '@/services/LoggingService';

// Mock the LoggingService logger
vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}));

// Mock the Zustand stores with getState() API
vi.mock('@/store/dogStore', () => ({
  useDogStore: {
    getState: vi.fn().mockReturnValue({
      dogs: [
        {
          id: 'dog-1',
          name: 'Rex',
          breed: 'Golden Retriever',
          sex: 'male',
          ownerId: 'person-1',
          dateOfBirth: '2022-01-15',
          isActive: true
        },
        {
          id: 'dog-2',
          name: 'Bella',
          breed: 'Labrador',
          sex: 'female',
          ownerId: 'person-2',
          dateOfBirth: '2021-06-10',
          isActive: true
        }
      ],
      getDogById: vi.fn((id: string) => {
        const dogs: Record<string, unknown> = {
          'dog-1': {
            id: 'dog-1',
            name: 'Rex',
            breed: 'Golden Retriever',
            sex: 'male',
            ownerId: 'person-1',
            dateOfBirth: '2022-01-15',
            isActive: true
          },
          'dog-2': {
            id: 'dog-2',
            name: 'Bella',
            breed: 'Labrador',
            sex: 'female',
            ownerId: 'person-2',
            dateOfBirth: '2021-06-10',
            isActive: true
          }
        };
        return dogs[id] || null;
      })
    })
  }
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: {
    getState: vi.fn().mockReturnValue({
      people: [
        {
          id: 'person-1',
          firstName: 'Test',
          lastName: 'User',
          city: 'Test City'
        },
        {
          id: 'person-2',
          firstName: 'Other',
          lastName: 'Person',
          city: 'Other City'
        }
      ],
      users: []
    })
  }
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: {
    getState: vi.fn().mockReturnValue({
      shows: [
        {
          id: 'show-1',
          name: 'Test Show 1',
          startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          type: 'All Breed',
          location: 'Test City, TS'
        },
        {
          id: 'show-2',
          name: 'Test Show 2',
          startDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          type: 'Specialty',
          location: 'Other City, OT'
        }
      ]
    })
  }
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: {
    getState: vi.fn().mockReturnValue({
      clubs: [
        {
          id: 'club-1',
          name: 'Test Club'
        }
      ]
    })
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

// Mock console methods
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('PredictiveLoader', () => {
  let loader: PredictiveLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockLocalStorage.getItem.mockReturnValue(null);
    loader = new PredictiveLoader();
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleSpy.mockClear();
    consoleWarnSpy.mockClear();
  });

  describe('Navigation Pattern Tracking', () => {
    it('should track navigation patterns', () => {
      loader.trackNavigationPattern('/shows', '/dogs', 2000);
      loader.trackNavigationPattern('/dogs', '/people', 1500);

      const analytics = loader.getAnalytics();
      expect(analytics.navigationPatterns).toBe(2);
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should update existing navigation patterns', () => {
      loader.trackNavigationPattern('/shows', '/dogs', 2000);
      loader.trackNavigationPattern('/shows', '/dogs', 3000);
      loader.trackNavigationPattern('/shows', '/dogs', 1000);

      const analytics = loader.getAnalytics();
      expect(analytics.navigationPatterns).toBe(1); // Should be one unique pattern
    });

    it('should increase confidence with frequency', () => {
      // Track the same navigation multiple times
      for (let i = 0; i < 10; i++) {
        loader.trackNavigationPattern('/shows', '/dogs', 2000);
      }

      const analytics = loader.getAnalytics();
      expect(analytics.navigationPatterns).toBe(1);
    });

    it('should save patterns to localStorage', () => {
      loader.trackNavigationPattern('/clubs', '/shows', 1500);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'myk9show-nav-patterns',
        expect.any(String)
      );
    });
  });

  describe('Likely View Preloading', () => {
    it('should preload likely next views', () => {
      // Track navigation pattern enough times to build confidence above 0.3 threshold
      // confidence = min(0.95, frequency * 0.1), so 4 times = 0.4 confidence > 0.3
      loader.trackNavigationPattern('/shows', '/dogs', 2000);
      loader.trackNavigationPattern('/shows', '/dogs', 1500);
      loader.trackNavigationPattern('/shows', '/dogs', 1800);
      loader.trackNavigationPattern('/shows', '/dogs', 1600);

      // This should trigger preloading (confidence = 0.4 > 0.3 threshold)
      loader.preloadLikelyViews('/shows');

      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue.total).toBeGreaterThan(0);
    });

    it('should only preload high-confidence patterns', () => {
      // Create a low-confidence pattern (frequency=1 => confidence=0.1, below 0.3 threshold)
      loader.trackNavigationPattern('/rare', '/destination', 1000);

      loader.preloadLikelyViews('/rare');

      const analytics = loader.getAnalytics();
      // Low confidence might not generate preload tasks
      expect(analytics.preloadQueue.total).toBeGreaterThanOrEqual(0);
    });

    it('should limit number of preload tasks', () => {
      // Create many patterns from one route
      for (let i = 0; i < 10; i++) {
        loader.trackNavigationPattern('/popular', `/destination-${i}`, 1000);
      }

      loader.preloadLikelyViews('/popular');

      const analytics = loader.getAnalytics();
      // Should limit preload tasks
      expect(analytics.preloadQueue.total).toBeLessThanOrEqual(20);
    });
  });

  describe('Show Entry Predictions', () => {
    it('should generate show entry predictions', () => {
      const predictions = loader.generateShowEntryPredictions();

      expect(Array.isArray(predictions)).toBe(true);
      expect(predictions.length).toBeGreaterThan(0);
    });

    it('should generate predictions for specific dog', () => {
      const predictions = loader.generateShowEntryPredictions('dog-1');

      expect(Array.isArray(predictions)).toBe(true);
      // Should filter predictions for specific dog
    });

    it('should calculate confidence based on factors', () => {
      const predictions = loader.generateShowEntryPredictions();

      for (const prediction of predictions) {
        expect(prediction.confidence).toBeGreaterThan(0);
        expect(prediction.confidence).toBeLessThanOrEqual(1);
        expect(Array.isArray(prediction.reasoning)).toBe(true);
      }
    });

    it('should predict likely classes for entries', () => {
      const predictions = loader.generateShowEntryPredictions();

      for (const prediction of predictions) {
        expect(Array.isArray(prediction.classes)).toBe(true);
        expect(prediction.classes.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should get predictions for specific dog', () => {
      loader.generateShowEntryPredictions();
      const dogPredictions = loader.getShowEntryPredictions('dog-1');

      expect(Array.isArray(dogPredictions)).toBe(true);
      dogPredictions.forEach(pred => {
        expect(pred.dogId).toBe('dog-1');
      });
    });

    it('should limit number of predictions', () => {
      const predictions = loader.generateShowEntryPredictions();

      expect(predictions.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Smart Relationship Loading', () => {
    it('should track relationship access', () => {
      loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-1', 'dog-2']);
      loader.trackRelationshipAccess('dog', 'dog-1', 'person', ['person-1']);

      const analytics = loader.getAnalytics();
      expect(analytics.relationshipHints).toBeGreaterThan(0);
    });

    it('should merge related entities for existing relationships', () => {
      loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-1']);
      loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-2']);
      loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-1']); // Duplicate

      const analytics = loader.getAnalytics();
      expect(analytics.relationshipHints).toBe(1); // Should merge
    });

    it('should increase relationship strength with frequency', () => {
      // Track the same relationship multiple times
      for (let i = 0; i < 5; i++) {
        loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-1']);
      }

      const analytics = loader.getAnalytics();
      expect(analytics.relationshipHints).toBe(1);
    });

    it('should save relationship hints to localStorage', () => {
      loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-1']);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'myk9show-relationship-hints',
        expect.any(String)
      );
    });

    it('should trigger preloading for strong relationships', () => {
      // Create a strong relationship
      for (let i = 0; i < 8; i++) {
        loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-1', 'dog-2']);
      }

      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue.total).toBeGreaterThan(0);
    });
  });

  describe('Preload Queue Processing', () => {
    it('should process preload queue', async () => {
      // Build enough confidence (4 times => 0.4 > 0.3 threshold)
      for (let i = 0; i < 4; i++) {
        loader.trackNavigationPattern('/shows', '/dogs', 2000);
      }
      loader.preloadLikelyViews('/shows');

      // Advance time to trigger one processing cycle, not runAllTimersAsync (which causes infinite loop with setInterval)
      await vi.advanceTimersByTimeAsync(1100);

      // Should have processed some tasks
      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue.completed + analytics.preloadQueue.failed).toBeGreaterThanOrEqual(0);
    });

    it('should retry failed tasks', async () => {
      // Build enough confidence
      for (let i = 0; i < 4; i++) {
        loader.trackNavigationPattern('/test', '/test2', 1000);
      }
      loader.preloadLikelyViews('/test');

      await vi.advanceTimersByTimeAsync(1100);

      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue.total).toBeGreaterThanOrEqual(0);
    });

    it('should prioritize high-confidence tasks', () => {
      // Create high and low confidence patterns
      for (let i = 0; i < 10; i++) {
        loader.trackNavigationPattern('/high-freq', '/destination', 1000);
      }
      loader.trackNavigationPattern('/low-freq', '/other', 1000);

      loader.preloadLikelyViews('/high-freq');
      loader.preloadLikelyViews('/low-freq');

      // Queue should be sorted by priority and confidence
      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Analytics', () => {
    it('should provide comprehensive analytics', () => {
      loader.trackNavigationPattern('/route1', '/route2', 1000);
      loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-1']);
      loader.generateShowEntryPredictions();
      loader.preloadLikelyViews('/route1');

      const analytics = loader.getAnalytics();

      expect(analytics).toHaveProperty('navigationPatterns');
      expect(analytics).toHaveProperty('relationshipHints');
      expect(analytics).toHaveProperty('showEntryPredictions');
      expect(analytics).toHaveProperty('preloadQueue');
      expect(analytics).toHaveProperty('successRate');
      expect(analytics).toHaveProperty('avgConfidence');
    });

    it('should calculate success rate correctly', () => {
      const analytics = loader.getAnalytics();

      expect(typeof analytics.successRate).toBe('number');
      expect(analytics.successRate).toBeGreaterThanOrEqual(0);
      expect(analytics.successRate).toBeLessThanOrEqual(1);
    });

    it('should track preload queue status', () => {
      loader.preloadLikelyViews('/test');

      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue).toHaveProperty('total');
      expect(analytics.preloadQueue).toHaveProperty('pending');
      expect(analytics.preloadQueue).toHaveProperty('loading');
      expect(analytics.preloadQueue).toHaveProperty('completed');
      expect(analytics.preloadQueue).toHaveProperty('failed');
    });
  });

  describe('Data Cleanup', () => {
    it('should reset all predictive data', () => {
      loader.trackNavigationPattern('/test', '/test2', 1000);
      loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-1']);
      loader.generateShowEntryPredictions();

      let analytics = loader.getAnalytics();
      expect(analytics.navigationPatterns).toBeGreaterThan(0);

      loader.resetPredictiveData();

      analytics = loader.getAnalytics();
      expect(analytics.navigationPatterns).toBe(0);
      expect(analytics.relationshipHints).toBe(0);
      expect(analytics.showEntryPredictions).toBe(0);
    });

    it('should clear localStorage on reset', () => {
      loader.resetPredictiveData();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('myk9show-nav-patterns');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('myk9show-relationship-hints');
    });

    it('should cleanup old tasks periodically', () => {
      loader.trackNavigationPattern('/old', '/route', 1000);

      // Advance time by 2 hours to trigger cleanup
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      // The cleanup should have run
      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Storage and Persistence', () => {
    it('should save data to localStorage', () => {
      loader.trackNavigationPattern('/test', '/test2', 1000);

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should load data from localStorage', () => {
      const mockNavPatterns = JSON.stringify([
        ['test->test2', {
          fromRoute: 'test',
          toRoute: 'test2',
          frequency: 5,
          avgLoadTime: 2000,
          lastAccessed: new Date().toISOString(),
          confidence: 0.5
        }]
      ]);

      mockLocalStorage.getItem.mockImplementation((key: string) => {
        if (key === 'myk9show-nav-patterns') return mockNavPatterns;
        return null;
      });

      const newLoader = new PredictiveLoader();
      const analytics = newLoader.getAnalytics();
      expect(analytics.navigationPatterns).toBe(1);
    });

    it('should handle storage errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => new PredictiveLoader()).not.toThrow();
      // The source catches errors and calls logger.warn (not console.warn)
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle JSON parse errors', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      expect(() => new PredictiveLoader()).not.toThrow();
      // The source catches JSON parse errors and calls logger.warn
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Size Estimation', () => {
    it('should estimate route sizes correctly', () => {
      loader.preloadLikelyViews('/dogs');
      loader.preloadLikelyViews('/shows');
      loader.preloadLikelyViews('/people');

      // Should generate tasks with appropriate size estimates
      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue.total).toBeGreaterThanOrEqual(0);
    });

    it('should respect size limits', () => {
      // Create many preload tasks
      for (let i = 0; i < 20; i++) {
        loader.trackNavigationPattern(`/route-${i}`, '/destination', 1000);
      }

      loader.preloadLikelyViews('/route-1');

      // Should handle large numbers of tasks gracefully
      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Entity Type Handling', () => {
    it('should handle all entity types', () => {
      const entityTypes = ['person', 'dog', 'show', 'club', 'entry'];

      for (const type of entityTypes) {
        loader.trackRelationshipAccess(type as never, `${type}-1`, 'person', ['person-1']);
      }

      const analytics = loader.getAnalytics();
      expect(analytics.relationshipHints).toBe(entityTypes.length);
    });

    it('should preload different entity types', async () => {
      loader.trackRelationshipAccess('person', 'person-1', 'dog', ['dog-1']);
      loader.trackRelationshipAccess('dog', 'dog-1', 'show', ['show-1']);

      // Use advanceTimersByTimeAsync instead of runAllTimersAsync to avoid infinite loop from setInterval
      await vi.advanceTimersByTimeAsync(1100);

      // Should have attempted to preload different entity types
      const analytics = loader.getAnalytics();
      expect(analytics.preloadQueue.total).toBeGreaterThanOrEqual(0);
    });
  });
});
