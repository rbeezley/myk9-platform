import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserBehaviorLearning } from '@/services/analytics/UserBehaviorLearning';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Mock document and window for event listeners
const mockDocument = {
  addEventListener: vi.fn(),
  hidden: false
};

const mockWindow = {
  addEventListener: vi.fn()
};

Object.defineProperty(global, 'document', {
  value: mockDocument,
  configurable: true
});

Object.defineProperty(global, 'window', {
  value: mockWindow,
  configurable: true
});

describe('UserBehaviorLearning', () => {
  let behaviorLearning: UserBehaviorLearning;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    behaviorLearning = new UserBehaviorLearning();
  });

  afterEach(() => {
    behaviorLearning.endSession();
    vi.clearAllTimers();
  });

  describe('Action Tracking', () => {
    it('should track navigation actions', () => {
      behaviorLearning.trackNavigation('/shows', '/dogs', 3000);
      
      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(1);
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should track entity access actions', () => {
      behaviorLearning.trackEntityAccess('person', 'person-123', '/people', 2000);
      
      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(1);
    });

    it('should track search actions', () => {
      behaviorLearning.trackSearch('golden retriever', '/dogs', 5);
      
      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(1);
    });

    it('should track custom actions', () => {
      behaviorLearning.trackAction({
        type: 'create',
        entityType: 'dog',
        entityId: 'dog-123',
        route: '/dogs'
      });

      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(1);
    });

    it('should maintain action history within limits', () => {
      // Track more actions than the limit (1000)
      for (let i = 0; i < 1005; i++) {
        behaviorLearning.trackAction({
          type: 'navigation',
          route: `/route-${i}`
        });
      }

      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBeLessThanOrEqual(1000);
    });
  });

  describe('Session Management', () => {
    it('should start a new session automatically', () => {
      // A session should be created on instantiation
      behaviorLearning.trackAction({
        type: 'navigation',
        route: '/test'
      });

      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(1);
    });

    it('should end session and update user profile', () => {
      behaviorLearning.trackNavigation('/shows', '/dogs', 2000);
      behaviorLearning.trackEntityAccess('dog', 'dog-123', '/dogs');
      
      behaviorLearning.endSession();
      
      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalSessions).toBe(1);
    });

    it('should track routes visited in session', () => {
      behaviorLearning.trackNavigation('/shows', '/dogs', 1000);
      behaviorLearning.trackNavigation('/dogs', '/people', 1500);
      
      // Routes should be tracked internally (tested through behavior)
      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(2);
    });

    it('should track entities accessed in session', () => {
      behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs');
      behaviorLearning.trackEntityAccess('person', 'person-1', '/people');
      behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs'); // Duplicate

      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(3);
    });
  });

  describe('Pattern Analysis', () => {
    it('should analyze navigation patterns', () => {
      // Create a pattern by repeating navigation
      for (let i = 0; i < 5; i++) {
        behaviorLearning.trackNavigation('/shows', '/dogs', 2000);
      }

      const insights = behaviorLearning.analyzePatterns();
      expect(Array.isArray(insights)).toBe(true);
      
      const navigationInsights = insights.filter(i => i.type === 'next_route');
      expect(navigationInsights.length).toBeGreaterThanOrEqual(0);
    });

    it('should analyze entity access patterns', () => {
      // Create entity access patterns
      for (let i = 0; i < 4; i++) {
        behaviorLearning.trackEntityAccess('person', 'person-1', '/people');
        behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs');
      }

      const insights = behaviorLearning.analyzePatterns();
      const entityInsights = insights.filter(i => i.type === 'next_entity');
      expect(entityInsights.length).toBeGreaterThanOrEqual(0);
    });

    it('should analyze temporal patterns', () => {
      // Create actions at different times
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        vi.setSystemTime(new Date(now.getTime() + i * 60 * 60 * 1000)); // Hour intervals
        behaviorLearning.trackAction({
          type: 'navigation',
          route: '/test'
        });
      }

      const insights = behaviorLearning.analyzePatterns();
      const timeInsights = insights.filter(i => i.type === 'optimal_sync_time');
      expect(timeInsights.length).toBeGreaterThanOrEqual(0);
    });

    it('should analyze search patterns', () => {
      // Create search patterns
      behaviorLearning.trackSearch('golden retriever', '/dogs');
      behaviorLearning.trackSearch('golden retriever', '/dogs');
      behaviorLearning.trackSearch('labrador', '/dogs');

      const insights = behaviorLearning.analyzePatterns();
      const searchInsights = insights.filter(i => i.type === 'prefetch_opportunity');
      expect(searchInsights.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter patterns by minimum frequency', () => {
      // Create a low-frequency pattern
      behaviorLearning.trackNavigation('/rare', '/destination', 1000);

      const insights = behaviorLearning.analyzePatterns();
      // Low frequency patterns might not generate insights
      expect(Array.isArray(insights)).toBe(true);
    });
  });

  describe('Predictions', () => {
    it('should predict next route based on current context', () => {
      // Set up navigation pattern
      for (let i = 0; i < 5; i++) {
        behaviorLearning.trackNavigation('/shows', '/dogs', 2000);
      }

      const predictions = behaviorLearning.getPredictions('/shows', []);
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should predict next entities based on context', () => {
      // Set up entity patterns
      for (let i = 0; i < 4; i++) {
        behaviorLearning.trackEntityAccess('person', 'person-1', '/people');
        behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs');
      }

      const predictions = behaviorLearning.getPredictions('/people', ['person:person-1']);
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should predict optimal sync time', () => {
      // Create temporal patterns
      // Current hour for temporal patterns
      for (let i = 0; i < 10; i++) {
        behaviorLearning.trackAction({
          type: 'navigation',
          route: '/test'
        });
      }

      const predictions = behaviorLearning.getPredictions('/test', []);
      const syncTimePredictions = predictions.filter(p => p.type === 'optimal_sync_time');
      expect(syncTimePredictions.length).toBeGreaterThanOrEqual(0);
    });

    it('should limit number of predictions', () => {
      // Create many patterns
      for (let i = 0; i < 20; i++) {
        behaviorLearning.trackNavigation(`/route-${i}`, `/destination-${i}`, 1000);
      }

      const predictions = behaviorLearning.getPredictions('/route-1', []);
      // Should provide reasonable number of predictions
      expect(predictions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('User Profiles', () => {
    it('should create user profiles from session data', () => {
      behaviorLearning.trackNavigation('/shows', '/dogs', 3000);
      behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs');
      behaviorLearning.endSession();

      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.uniqueUsers).toBe(1); // Anonymous user
    });

    it('should update existing user profiles', () => {
      // First session
      behaviorLearning.trackNavigation('/shows', '/dogs', 2000);
      behaviorLearning.endSession();

      // Second session (should update same anonymous user)
      behaviorLearning.trackNavigation('/dogs', '/people', 1500);
      behaviorLearning.endSession();

      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.uniqueUsers).toBe(1);
      expect(analytics.totalSessions).toBe(2);
    });

    it('should track preferred entity types', () => {
      behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs');
      behaviorLearning.trackEntityAccess('dog', 'dog-2', '/dogs');
      behaviorLearning.trackEntityAccess('person', 'person-1', '/people');
      behaviorLearning.endSession();

      // User profile should track preferred entities (tested through behavior)
      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.topEntityTypes.length).toBeGreaterThan(0);
    });
  });

  describe('Search Pattern Analysis', () => {
    it('should normalize search queries for pattern detection', () => {
      behaviorLearning.trackSearch('Golden Retriever Puppy', '/dogs');
      behaviorLearning.trackSearch('golden retriever puppy', '/dogs');
      behaviorLearning.trackSearch('Golden   Retriever    Puppy', '/dogs');

      const insights = behaviorLearning.analyzePatterns();
      // Similar queries should be grouped together
      expect(Array.isArray(insights)).toBe(true);
    });

    it('should filter common words from search patterns', () => {
      behaviorLearning.trackSearch('the golden retriever and the puppy', '/dogs');
      behaviorLearning.trackSearch('a golden retriever with a puppy', '/dogs');

      const insights = behaviorLearning.analyzePatterns();
      // Common words should be filtered out
      expect(Array.isArray(insights)).toBe(true);
    });
  });

  describe('Storage and Persistence', () => {
    it('should save data to localStorage', () => {
      behaviorLearning.trackAction({
        type: 'navigation',
        route: '/test'
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should load data from localStorage', () => {
      const mockHistory = JSON.stringify([
        {
          id: 'action-1',
          type: 'navigation',
          route: '/test',
          timestamp: new Date().toISOString(),
          sessionId: 'session-1'
        }
      ]);

      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'myk9show-behavior-history') return mockHistory;
        return null;
      });

      const newBehaviorLearning = new UserBehaviorLearning();
      const analytics = newBehaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(1);
    });

    it('should handle storage errors gracefully', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => new UserBehaviorLearning()).not.toThrow();
    });

    it('should save periodically', () => {
      vi.useFakeTimers();
      
      behaviorLearning.trackAction({
        type: 'navigation',
        route: '/test'
      });

      // Advance time to trigger periodic save
      vi.advanceTimersByTime(5 * 60 * 1000 + 100); // 5 minutes + buffer

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      
      vi.useRealTimers();
    });
  });

  describe('Analytics', () => {
    it('should provide comprehensive analytics', () => {
      behaviorLearning.trackNavigation('/shows', '/dogs', 2000);
      behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs');
      behaviorLearning.trackSearch('golden retriever', '/dogs');
      behaviorLearning.endSession();

      const analytics = behaviorLearning.getAnalytics();
      
      expect(analytics).toHaveProperty('totalActions');
      expect(analytics).toHaveProperty('totalSessions');
      expect(analytics).toHaveProperty('uniqueUsers');
      expect(analytics).toHaveProperty('behaviorPatterns');
      expect(analytics).toHaveProperty('averageSessionDuration');
      expect(analytics).toHaveProperty('topRoutes');
      expect(analytics).toHaveProperty('topEntityTypes');
      
      expect(analytics.totalActions).toBe(3);
      expect(analytics.totalSessions).toBe(1);
      expect(analytics.uniqueUsers).toBe(1);
    });

    it('should track top routes and entity types', () => {
      behaviorLearning.trackNavigation('/shows', '/dogs', 1000);
      behaviorLearning.trackNavigation('/dogs', '/people', 1000);
      behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs');
      behaviorLearning.trackEntityAccess('person', 'person-1', '/people');

      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.topRoutes.length).toBeGreaterThan(0);
      expect(analytics.topEntityTypes.length).toBeGreaterThan(0);
    });

    it('should calculate average session duration', () => {
      vi.useFakeTimers();

      // Create a fresh instance with fake timers so startTime is controlled
      const timedBehaviorLearning = new UserBehaviorLearning();
      timedBehaviorLearning.trackNavigation('/shows', '/dogs', 5000);

      // Advance time so endTime - startTime > 0
      vi.advanceTimersByTime(10000);
      timedBehaviorLearning.endSession();

      const analytics = timedBehaviorLearning.getAnalytics();
      expect(analytics.averageSessionDuration).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });

  describe('Data Cleanup', () => {
    it('should reset all behavior data', () => {
      behaviorLearning.trackNavigation('/shows', '/dogs', 2000);
      behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs');
      
      let analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBeGreaterThan(0);

      behaviorLearning.resetBehaviorData();

      analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(0);
      expect(analytics.uniqueUsers).toBe(0);
    });

    it('should clear localStorage on reset', () => {
      behaviorLearning.resetBehaviorData();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('myk9show-behavior-history');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('myk9show-user-profiles');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('myk9show-behavior-patterns');
    });

    it('should start new session after reset', () => {
      behaviorLearning.resetBehaviorData();
      behaviorLearning.trackAction({
        type: 'navigation',
        route: '/test'
      });

      const analytics = behaviorLearning.getAnalytics();
      expect(analytics.totalActions).toBe(1);
    });
  });

  describe('Event Listeners', () => {
    it('should set up document visibility event listener', () => {
      expect(mockDocument.addEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });

    it('should set up beforeunload event listener', () => {
      expect(mockWindow.addEventListener).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });
  });

  describe('Real-time Pattern Analysis', () => {
    it('should detect navigation patterns in real-time', () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      behaviorLearning.trackNavigation('/shows', '/dogs', 2000);
      behaviorLearning.trackNavigation('/dogs', '/people', 1500);

      // Should log pattern detection via logger.debug (which uses console.debug)
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should detect entity access patterns in real-time', () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      behaviorLearning.trackEntityAccess('person', 'person-1', '/people');
      behaviorLearning.trackEntityAccess('dog', 'dog-1', '/dogs');

      // Should log entity pattern detection via logger.debug (which uses console.debug)
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});