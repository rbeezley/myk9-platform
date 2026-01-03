import { useEffect, useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { predictivePrefetcher } from '@/services/sync/PredictivePrefetcher';
import { userBehaviorLearning } from '@/services/analytics/UserBehaviorLearning';

interface PredictiveSyncState {
  isActive: boolean;
  prefetchingCount: number;
  analyticsEnabled: boolean;
  lastPredictions: Array<{
    type: string;
    prediction: string;
    confidence: number;
    timestamp: Date;
  }>;
}

interface PredictiveSyncOptions {
  enablePrefetching?: boolean;
  enableAnalytics?: boolean;
  trackNavigation?: boolean;
  trackEntityAccess?: boolean;
  minConfidenceThreshold?: number;
}

/**
 * Hook for predictive sync functionality
 * Integrates user behavior learning with predictive prefetching
 */
export function usePredictiveSync(options: PredictiveSyncOptions = {}) {
  const {
    enablePrefetching = true,
    enableAnalytics = true,
    trackNavigation = true,
    trackEntityAccess: shouldTrackEntityAccess = true,
    minConfidenceThreshold = 0.5
  } = options;

  const location = useLocation();
  const [state, setState] = useState<PredictiveSyncState>({
    isActive: enablePrefetching,
    prefetchingCount: 0,
    analyticsEnabled: enableAnalytics,
    lastPredictions: []
  });

  const [routeStartTime, setRouteStartTime] = useState<Date>(new Date());
  const [previousRoute, setPreviousRoute] = useState<string>('');

  // Track navigation changes
  useEffect(() => {
    if (!trackNavigation) return;

    const currentRoute = location.pathname;
    const currentTime = new Date();

    if (previousRoute && previousRoute !== currentRoute) {
      const timeSpent = currentTime.getTime() - routeStartTime.getTime();
      
      // Track navigation in behavior learning
      if (enableAnalytics) {
        userBehaviorLearning.trackNavigation(previousRoute, currentRoute, timeSpent);
      }

      // Track navigation in predictive prefetcher
      if (enablePrefetching) {
        predictivePrefetcher.trackNavigation(previousRoute, currentRoute, timeSpent);
      }
    }

    setPreviousRoute(currentRoute);
    setRouteStartTime(currentTime);
  }, [location.pathname, enableAnalytics, enablePrefetching, trackNavigation, previousRoute, routeStartTime]);

  /**
   * Track entity access
   */
  const trackEntityAccess = useCallback((
    entityType: 'club' | 'person' | 'dog' | 'show' | 'entry',
    entityId: string,
    relatedEntities: string[] = [],
    timeSpent?: number
  ) => {
    if (!shouldTrackEntityAccess || (!enableAnalytics && !enablePrefetching)) return;

    const currentRoute = location.pathname;

    if (enableAnalytics) {
      userBehaviorLearning.trackEntityAccess(entityType, entityId, currentRoute, timeSpent);
    }

    if (enablePrefetching) {
      predictivePrefetcher.trackEntityAccess(entityType, entityId, currentRoute, relatedEntities);
    }
  }, [shouldTrackEntityAccess, enableAnalytics, enablePrefetching, location.pathname]);

  /**
   * Track search behavior
   */
  const trackSearch = useCallback((query: string, resultsCount?: number) => {
    if (!enableAnalytics && !enablePrefetching) return;

    const currentRoute = location.pathname;

    if (enableAnalytics) {
      userBehaviorLearning.trackSearch(query, currentRoute, resultsCount);
    }

    if (enablePrefetching) {
      predictivePrefetcher.predictSearchResults(query);
    }
  }, [enableAnalytics, enablePrefetching, location.pathname]);

  /**
   * Track user actions (create, update, delete)
   */
  const trackAction = useCallback((
    actionType: 'create' | 'update' | 'delete',
    entityType: 'club' | 'person' | 'dog' | 'show' | 'entry',
    entityId: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!enableAnalytics) return;

    userBehaviorLearning.trackAction({
      type: actionType,
      entityType,
      entityId,
      route: location.pathname,
      metadata
    });
  }, [enableAnalytics, location.pathname]);

  /**
   * Get predictions for current context
   */
  const getPredictions = useCallback((recentEntities: string[] = []) => {
    if (!enablePrefetching && !enableAnalytics) return [];

    const currentRoute = location.pathname;
    const predictions: Array<{
      type: string;
      prediction: string;
      confidence: number;
      timestamp: Date;
    }> = [];

    // Get predictions from behavior learning
    if (enableAnalytics) {
      const behaviorInsights = userBehaviorLearning.getPredictions(currentRoute, recentEntities);
      predictions.push(...behaviorInsights.map(insight => ({
        type: insight.type,
        prediction: insight.prediction,
        confidence: insight.confidence,
        timestamp: new Date()
      })));
    }

    // Get predictions from predictive prefetcher
    if (enablePrefetching) {
      const prefetchPredictions = predictivePrefetcher.predictNextEntities(currentRoute, recentEntities);
      predictions.push(...prefetchPredictions.map(entityId => ({
        type: 'next_entity',
        prediction: entityId,
        confidence: 0.7, // Default confidence for prefetch predictions
        timestamp: new Date()
      })));
    }

    // Filter by confidence threshold and update state
    const filteredPredictions = predictions.filter(p => p.confidence >= minConfidenceThreshold);
    
    setState(prev => ({
      ...prev,
      lastPredictions: filteredPredictions.slice(0, 10) // Keep last 10 predictions
    }));

    return filteredPredictions;
  }, [enablePrefetching, enableAnalytics, location.pathname, minConfidenceThreshold]);

  /**
   * Manually trigger prefetch for specific entities
   */
  const triggerPrefetch = useCallback((entityType: string, entityId?: string, searchQuery?: string) => {
    if (!enablePrefetching) return;

    if (searchQuery) {
      predictivePrefetcher.predictSearchResults(searchQuery, entityType);
    } else if (entityId) {
      // Create a prefetch task manually
      console.log(`Manual prefetch triggered for ${entityType}:${entityId}`);
    }

    setState(prev => ({
      ...prev,
      prefetchingCount: prev.prefetchingCount + 1
    }));

    // Simulate prefetch completion
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        prefetchingCount: Math.max(0, prev.prefetchingCount - 1)
      }));
    }, 1000);
  }, [enablePrefetching]);

  /**
   * Get analytics summary
   */
  const getAnalytics = useCallback(() => {
    if (!enableAnalytics && !enablePrefetching) return null;

    const analytics: Record<string, unknown> = {};

    if (enableAnalytics) {
      analytics.behavior = userBehaviorLearning.getAnalytics();
    }

    if (enablePrefetching) {
      analytics.prefetch = predictivePrefetcher.getAnalytics();
    }

    return analytics;
  }, [enableAnalytics, enablePrefetching]);

  /**
   * Reset all learning data
   */
  const resetLearningData = useCallback(() => {
    if (enableAnalytics) {
      userBehaviorLearning.resetBehaviorData();
    }

    if (enablePrefetching) {
      predictivePrefetcher.resetPatterns();
    }

    setState(prev => ({
      ...prev,
      lastPredictions: []
    }));
  }, [enableAnalytics, enablePrefetching]);

  /**
   * Toggle predictive sync functionality
   */
  const togglePredictiveSync = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      isActive: enabled
    }));
  }, []);

  /**
   * Add custom prefetch rule
   */
  const addPrefetchRule = useCallback((rule: {
    trigger: 'route_change' | 'entity_access' | 'search_query' | 'time_based';
    condition: string;
    action: 'prefetch_entity' | 'prefetch_related' | 'prefetch_search_results';
    priority: 'high' | 'medium' | 'low';
    enabled: boolean;
  }) => {
    if (!enablePrefetching) return;

    predictivePrefetcher.addPrefetchRule(rule);
  }, [enablePrefetching]);

  // Monitor prefetch queue size
  useEffect(() => {
    if (!enablePrefetching) return;

    const interval = setInterval(() => {
      const analytics = predictivePrefetcher.getAnalytics();
      setState(prev => ({
        ...prev,
        prefetchingCount: analytics.pendingPrefetches + analytics.queuedPrefetches
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, [enablePrefetching]);

  return {
    // State
    isActive: state.isActive,
    prefetchingCount: state.prefetchingCount,
    analyticsEnabled: state.analyticsEnabled,
    lastPredictions: state.lastPredictions,

    // Tracking methods
    trackEntityAccess,
    trackSearch,
    trackAction,

    // Prediction methods
    getPredictions,
    triggerPrefetch,

    // Analytics methods
    getAnalytics,
    resetLearningData,

    // Control methods
    togglePredictiveSync,
    addPrefetchRule
  };
}

/**
 * Hook specifically for entity tracking
 * Simplified interface for tracking entity access patterns
 */
export function useEntityTracking() {
  const { trackEntityAccess, trackAction } = usePredictiveSync({
    enablePrefetching: true,
    enableAnalytics: true,
    trackNavigation: false, // Don't duplicate navigation tracking
    trackEntityAccess: false // We'll handle this manually
  });

  const trackView = useCallback((
    entityType: 'club' | 'person' | 'dog' | 'show' | 'entry',
    entityId: string,
    timeSpent?: number
  ) => {
    trackEntityAccess(entityType, entityId, [], timeSpent);
  }, [trackEntityAccess]);

  const trackCreate = useCallback((
    entityType: 'club' | 'person' | 'dog' | 'show' | 'entry',
    entityId: string
  ) => {
    trackAction('create', entityType, entityId);
  }, [trackAction]);

  const trackUpdate = useCallback((
    entityType: 'club' | 'person' | 'dog' | 'show' | 'entry',
    entityId: string
  ) => {
    trackAction('update', entityType, entityId);
  }, [trackAction]);

  const trackDelete = useCallback((
    entityType: 'club' | 'person' | 'dog' | 'show' | 'entry',
    entityId: string
  ) => {
    trackAction('delete', entityType, entityId);
  }, [trackAction]);

  return {
    trackView,
    trackCreate,
    trackUpdate,
    trackDelete
  };
}

/**
 * Hook for search-specific predictive features
 */
export function useSearchTracking() {
  const { trackSearch, getPredictions, triggerPrefetch } = usePredictiveSync({
    enablePrefetching: true,
    enableAnalytics: true,
    trackNavigation: false,
    trackEntityAccess: false
  });

  const trackSearchQuery = useCallback((query: string, resultsCount?: number) => {
    trackSearch(query, resultsCount);
  }, [trackSearch]);

  const getSearchPredictions = useCallback(() => {
    return getPredictions().filter(p => p.type === 'prefetch_opportunity');
  }, [getPredictions]);

  const prefetchSearchResults = useCallback((query: string, entityType?: string) => {
    triggerPrefetch(entityType || 'person', undefined, query);
  }, [triggerPrefetch]);

  return {
    trackSearchQuery,
    getSearchPredictions,
    prefetchSearchResults
  };
}