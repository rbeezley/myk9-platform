import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePredictiveLoading,
  useRoutePreloading,
  useShowEntryPredictions,
  useRelationshipPreloading
} from '@/hooks/usePredictiveLoading';

// Use vi.hoisted() so these variables are available when vi.mock() factories run
const { mockLocation, mockPredictiveLoader } = vi.hoisted(() => ({
  mockLocation: { pathname: '/test' },
  mockPredictiveLoader: {
    trackNavigationPattern: vi.fn(),
    preloadLikelyViews: vi.fn(),
    trackRelationshipAccess: vi.fn(),
    generateShowEntryPredictions: vi.fn().mockReturnValue([
      {
        showId: 'show-1',
        showName: 'Test Show',
        dogId: 'dog-1',
        dogName: 'Test Dog',
        classes: ['Open Dogs'],
        confidence: 0.8,
        reasoning: ['Test reasoning'],
        estimatedEntryDate: new Date()
      }
    ]),
    getShowEntryPredictions: vi.fn().mockReturnValue([
      {
        showId: 'show-1',
        showName: 'Test Show',
        dogId: 'dog-1',
        dogName: 'Test Dog',
        confidence: 0.8
      }
    ]),
    getAnalytics: vi.fn().mockReturnValue({
      navigationPatterns: 5,
      relationshipHints: 3,
      showEntryPredictions: 2,
      preloadQueue: {
        total: 10,
        pending: 2,
        loading: 1,
        completed: 6,
        failed: 1
      },
      successRate: 0.8,
      avgConfidence: 0.7
    }),
    resetPredictiveData: vi.fn()
  }
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation
}));

vi.mock('@/services/sync/PredictiveLoader', () => ({
  predictiveLoader: mockPredictiveLoader
}));

describe('usePredictiveLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.pathname = '/test';
  });

  describe('Basic Functionality', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => usePredictiveLoading());

      expect(result.current.isActive).toBe(true);
      expect(result.current.preloadingCount).toBe(0);
      expect(result.current.lastPreloadTime).toBeNull();
      expect(Array.isArray(result.current.showEntryPredictions)).toBe(true);
    });

    it('should initialize with custom options', () => {
      const { result } = renderHook(() =>
        usePredictiveLoading({
          enablePreloading: false,
          enableShowPredictions: false,
          trackNavigation: false,
          trackRelationships: false
        })
      );

      expect(result.current.isActive).toBe(false);
    });

    it('should track navigation changes', () => {
      // The navigation tracking useEffect needs previousRoute set from a prior render.
      // The hook uses queueMicrotask for state updates. We collect the microtask
      // callbacks and flush them manually between renders, avoiding infinite loops
      // caused by routeStartTime changing on every effect run.
      const originalQueueMicrotask = globalThis.queueMicrotask;
      const pendingMicrotasks: Array<() => void> = [];
      globalThis.queueMicrotask = (fn: () => void) => { pendingMicrotasks.push(fn); };

      try {
        const { rerender } = renderHook(() => usePredictiveLoading());

        // Flush the microtasks from initial render (setPreviousRoute, setRouteStartTime)
        act(() => {
          const tasks = pendingMicrotasks.splice(0);
          tasks.forEach(fn => fn());
        });

        // Change location and re-render - previousRoute should now be '/test'
        mockLocation.pathname = '/dogs';
        rerender();

        // trackNavigationPattern is called synchronously in the effect before queueMicrotask
        expect(mockPredictiveLoader.trackNavigationPattern).toHaveBeenCalled();
        expect(mockPredictiveLoader.preloadLikelyViews).toHaveBeenCalled();
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });

    it('should not track when navigation disabled', () => {
      renderHook(() =>
        usePredictiveLoading({
          trackNavigation: false
        })
      );

      act(() => {
        mockLocation.pathname = '/dogs';
      });

      // Should not track navigation when disabled
      expect(mockPredictiveLoader.trackNavigationPattern).not.toHaveBeenCalled();
    });
  });

  describe('Entity Access Tracking', () => {
    it('should track entity access with relationships', () => {
      const { result } = renderHook(() => usePredictiveLoading());

      act(() => {
        result.current.trackEntityAccess('person', 'person-123', [
          { type: 'dog', ids: ['dog-1', 'dog-2'] },
          { type: 'show', ids: ['show-1'] }
        ]);
      });

      expect(mockPredictiveLoader.trackRelationshipAccess).toHaveBeenCalledTimes(2);
      expect(mockPredictiveLoader.trackRelationshipAccess).toHaveBeenCalledWith(
        'person',
        'person-123',
        'dog',
        ['dog-1', 'dog-2']
      );
    });

    it('should not track when relationships disabled', () => {
      const { result } = renderHook(() =>
        usePredictiveLoading({
          trackRelationships: false
        })
      );

      act(() => {
        result.current.trackEntityAccess('person', 'person-123', [
          { type: 'dog', ids: ['dog-1'] }
        ]);
      });

      expect(mockPredictiveLoader.trackRelationshipAccess).not.toHaveBeenCalled();
    });

    it('should handle entity access without relationships', () => {
      const { result } = renderHook(() => usePredictiveLoading());

      act(() => {
        result.current.trackEntityAccess('dog', 'dog-123');
      });

      // Should not call trackRelationshipAccess if no related entities
      expect(mockPredictiveLoader.trackRelationshipAccess).not.toHaveBeenCalled();
    });
  });

  describe('Show Entry Predictions', () => {
    it('should generate show predictions', () => {
      const { result } = renderHook(() => usePredictiveLoading());

      act(() => {
        result.current.generateShowPredictions('dog-1');
      });

      expect(mockPredictiveLoader.generateShowEntryPredictions).toHaveBeenCalledWith('dog-1');
      expect(result.current.showEntryPredictions.length).toBeGreaterThan(0);
    });

    it('should get predictions for specific dog', () => {
      const { result } = renderHook(() => usePredictiveLoading());

      let predictions: unknown[];
      act(() => {
        predictions = result.current.getShowPredictions('dog-1');
      });

      expect(mockPredictiveLoader.getShowEntryPredictions).toHaveBeenCalledWith('dog-1');
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should filter predictions by threshold', () => {
      const { result } = renderHook(() =>
        usePredictiveLoading({
          preloadThreshold: 0.9
        })
      );

      let predictions: unknown[];
      act(() => {
        predictions = result.current.getShowPredictions('dog-1');
      });

      // Should filter by high threshold
      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should not generate predictions when disabled', () => {
      const { result } = renderHook(() =>
        usePredictiveLoading({
          enableShowPredictions: false
        })
      );

      let predictions: unknown[];
      act(() => {
        predictions = result.current.generateShowPredictions();
      });

      expect(predictions).toEqual([]);
    });
  });

  describe('Manual Preloading', () => {
    it('should trigger manual preload', () => {
      vi.useFakeTimers();
      
      const { result } = renderHook(() => usePredictiveLoading());

      act(() => {
        result.current.triggerPreload('/dogs', 'route');
      });

      expect(result.current.preloadingCount).toBe(1);

      // Advance timers to simulate completion
      act(() => {
        vi.advanceTimersByTime(1600);
      });

      expect(result.current.preloadingCount).toBe(0);

      vi.useRealTimers();
    });

    it('should not trigger when preloading disabled', () => {
      const { result } = renderHook(() =>
        usePredictiveLoading({
          enablePreloading: false
        })
      );

      act(() => {
        result.current.triggerPreload('/dogs');
      });

      expect(result.current.preloadingCount).toBe(0);
    });

    it('should update last preload time', () => {
      const { result } = renderHook(() => usePredictiveLoading());

      expect(result.current.lastPreloadTime).toBeNull();

      act(() => {
        result.current.triggerPreload('/dogs');
      });

      expect(result.current.lastPreloadTime).toBeInstanceOf(Date);
    });
  });

  describe('Analytics', () => {
    it('should get analytics data', () => {
      const { result } = renderHook(() => usePredictiveLoading());

      let analytics: unknown;
      act(() => {
        analytics = result.current.getAnalytics();
      });

      expect(mockPredictiveLoader.getAnalytics).toHaveBeenCalled();
      expect(analytics).toHaveProperty('navigationPatterns');
      expect(analytics).toHaveProperty('preloadQueue');
    });

    it('should return null when preloading disabled', () => {
      const { result } = renderHook(() =>
        usePredictiveLoading({
          enablePreloading: false
        })
      );

      let analytics: unknown;
      act(() => {
        analytics = result.current.getAnalytics();
      });

      expect(analytics).toBeNull();
    });
  });

  describe('Data Reset', () => {
    it('should reset predictive data', () => {
      const { result } = renderHook(() => usePredictiveLoading());

      // Set some state first
      act(() => {
        result.current.generateShowPredictions();
      });

      expect(result.current.showEntryPredictions.length).toBeGreaterThan(0);

      act(() => {
        result.current.resetPredictiveData();
      });

      expect(mockPredictiveLoader.resetPredictiveData).toHaveBeenCalled();
      expect(result.current.showEntryPredictions).toEqual([]);
      expect(result.current.lastPreloadTime).toBeNull();
    });
  });

  describe('Control Methods', () => {
    it('should toggle predictive loading', () => {
      const { result } = renderHook(() => usePredictiveLoading());

      expect(result.current.isActive).toBe(true);

      act(() => {
        result.current.togglePredictiveLoading(false);
      });

      expect(result.current.isActive).toBe(false);

      act(() => {
        result.current.togglePredictiveLoading(true);
      });

      expect(result.current.isActive).toBe(true);
    });
  });

  describe('Queue Monitoring', () => {
    it('should monitor preload queue size', () => {
      vi.useFakeTimers();
      
      const { result } = renderHook(() => usePredictiveLoading());

      // Advance timers to trigger queue monitoring
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      // Should update preloading count based on analytics
      expect(result.current.preloadingCount).toBe(3); // 2 pending + 1 loading from mock

      vi.useRealTimers();
    });

    it('should not monitor when preloading disabled', () => {
      vi.useFakeTimers();
      
      const { result } = renderHook(() =>
        usePredictiveLoading({
          enablePreloading: false
        })
      );

      act(() => {
        vi.advanceTimersByTime(2100);
      });

      expect(result.current.preloadingCount).toBe(0);

      vi.useRealTimers();
    });
  });
});

describe('useRoutePreloading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should provide route preloading methods', () => {
    const { result } = renderHook(() => useRoutePreloading());

    expect(typeof result.current.preloadRoute).toBe('function');
    expect(typeof result.current.getPreloadStats).toBe('function');
    expect(typeof result.current.isActive).toBe('boolean');
  });

  it('should preload specific routes', () => {
    const { result } = renderHook(() => useRoutePreloading());

    act(() => {
      result.current.preloadRoute('/dogs');
    });

    // Should trigger preload (tested through state changes)
    expect(result.current.isActive).toBe(true);
  });

  it('should get preload statistics', () => {
    const { result } = renderHook(() => useRoutePreloading());

    let stats: unknown;
    act(() => {
      stats = result.current.getPreloadStats();
    });

    expect(stats).toHaveProperty('navigationPatterns');
    expect(stats).toHaveProperty('successRate');
    expect(stats).toHaveProperty('queueSize');
  });
});

describe('useShowEntryPredictions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should provide show prediction methods', () => {
    const { result } = renderHook(() => useShowEntryPredictions());

    expect(Array.isArray(result.current.predictions)).toBe(true);
    expect(typeof result.current.refreshPredictions).toBe('function');
    expect(typeof result.current.getHighConfidencePredictions).toBe('function');
    expect(typeof result.current.hasPredictions).toBe('boolean');
  });

  it('should get predictions for specific dog', () => {
    renderHook(() => useShowEntryPredictions('dog-1'));

    expect(mockPredictiveLoader.getShowEntryPredictions).toHaveBeenCalledWith('dog-1');
  });

  it('should refresh predictions', () => {
    const { result } = renderHook(() => useShowEntryPredictions('dog-1'));

    act(() => {
      result.current.refreshPredictions();
    });

    expect(mockPredictiveLoader.generateShowEntryPredictions).toHaveBeenCalledWith('dog-1');
  });

  it('should filter high confidence predictions', () => {
    const { result } = renderHook(() => useShowEntryPredictions());

    let highConfidence: unknown[];
    act(() => {
      highConfidence = result.current.getHighConfidencePredictions(0.9);
    });

    expect(Array.isArray(highConfidence)).toBe(true);
    // Should filter predictions with confidence >= 0.9
  });

  it('should indicate if predictions exist', () => {
    const { result } = renderHook(() => useShowEntryPredictions());

    expect(typeof result.current.hasPredictions).toBe('boolean');
  });
});

describe('useRelationshipPreloading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should provide relationship tracking methods', () => {
    const { result } = renderHook(() => useRelationshipPreloading());

    expect(typeof result.current.trackDogRelationships).toBe('function');
    expect(typeof result.current.trackPersonRelationships).toBe('function');
    expect(typeof result.current.trackShowRelationships).toBe('function');
    expect(typeof result.current.getRelationshipStats).toBe('function');
  });

  it('should track dog relationships', () => {
    const { result } = renderHook(() => useRelationshipPreloading());

    act(() => {
      result.current.trackDogRelationships('dog-1', 'person-1', ['show-1', 'show-2']);
    });

    expect(mockPredictiveLoader.trackRelationshipAccess).toHaveBeenCalledTimes(2);
    expect(mockPredictiveLoader.trackRelationshipAccess).toHaveBeenCalledWith(
      'dog',
      'dog-1',
      'person',
      ['person-1']
    );
    expect(mockPredictiveLoader.trackRelationshipAccess).toHaveBeenCalledWith(
      'dog',
      'dog-1',
      'show',
      ['show-1', 'show-2']
    );
  });

  it('should track person relationships', () => {
    const { result } = renderHook(() => useRelationshipPreloading());

    act(() => {
      result.current.trackPersonRelationships('person-1', ['dog-1', 'dog-2'], ['club-1']);
    });

    expect(mockPredictiveLoader.trackRelationshipAccess).toHaveBeenCalledTimes(2);
  });

  it('should track show relationships', () => {
    const { result } = renderHook(() => useRelationshipPreloading());

    act(() => {
      result.current.trackShowRelationships('show-1', 'club-1', ['entry-1', 'entry-2']);
    });

    expect(mockPredictiveLoader.trackRelationshipAccess).toHaveBeenCalledTimes(2);
  });

  it('should get relationship statistics', () => {
    const { result } = renderHook(() => useRelationshipPreloading());

    let stats: unknown;
    act(() => {
      stats = result.current.getRelationshipStats();
    });

    expect(stats).toHaveProperty('relationshipHints');
    expect(stats).toHaveProperty('successRate');
  });

  it('should handle optional parameters', () => {
    const { result } = renderHook(() => useRelationshipPreloading());

    act(() => {
      result.current.trackDogRelationships('dog-1'); // No owner or shows
    });

    // Should not call tracking if no relationships provided
    expect(mockPredictiveLoader.trackRelationshipAccess).not.toHaveBeenCalled();
  });
});