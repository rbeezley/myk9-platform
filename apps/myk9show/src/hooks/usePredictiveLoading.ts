import { useEffect, useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { predictiveLoader } from '@/services/sync/PredictiveLoader';

interface PredictiveLoadingState {
  isActive: boolean;
  preloadingCount: number;
  lastPreloadTime: Date | null;
  showEntryPredictions: Array<{
    showId: string;
    showName: string;
    dogId: string;
    dogName: string;
    confidence: number;
  }>;
}

interface PredictiveLoadingOptions {
  enablePreloading?: boolean;
  enableShowPredictions?: boolean;
  trackNavigation?: boolean;
  trackRelationships?: boolean;
  preloadThreshold?: number;
}

/**
 * Hook for predictive loading functionality
 * Provides preloading of likely next views and related data
 */
export function usePredictiveLoading(options: PredictiveLoadingOptions = {}) {
  const {
    enablePreloading = true,
    enableShowPredictions = true,
    trackNavigation = true,
    trackRelationships = true,
    preloadThreshold = 0.3
  } = options;

  const location = useLocation();
  const [state, setState] = useState<PredictiveLoadingState>({
    isActive: enablePreloading,
    preloadingCount: 0,
    lastPreloadTime: null,
    showEntryPredictions: []
  });

  const [routeStartTime, setRouteStartTime] = useState<Date>(new Date());
  const [previousRoute, setPreviousRoute] = useState<string>('');

  // Track navigation patterns
  useEffect(() => {
    if (!trackNavigation || !enablePreloading) return;

    const currentRoute = location.pathname;
    const currentTime = new Date();

    if (previousRoute && previousRoute !== currentRoute) {
      const loadTime = currentTime.getTime() - routeStartTime.getTime();
      
      // Track navigation pattern
      predictiveLoader.trackNavigationPattern(previousRoute, currentRoute, loadTime);
      
      // Trigger preloading for next likely views
      predictiveLoader.preloadLikelyViews(currentRoute);
      
      setState(prev => ({
        ...prev,
        lastPreloadTime: currentTime
      }));
    }

    setPreviousRoute(currentRoute);
    setRouteStartTime(currentTime);
  }, [location.pathname, enablePreloading, trackNavigation, previousRoute, routeStartTime]);

  /**
   * Track entity access and relationships
   */
  const trackEntityAccess = useCallback((
    entityType: 'club' | 'person' | 'dog' | 'show' | 'entry',
    entityId: string,
    relatedEntities?: Array<{ type: 'club' | 'person' | 'dog' | 'show' | 'entry'; ids: string[] }>
  ) => {
    if (!trackRelationships || !enablePreloading) return;

    // Track each relationship
    if (relatedEntities) {
      for (const related of relatedEntities) {
        predictiveLoader.trackRelationshipAccess(
          entityType,
          entityId,
          related.type,
          related.ids
        );
      }
    }
  }, [enablePreloading, trackRelationships]);

  /**
   * Generate show entry predictions for a dog
   */
  const generateShowPredictions = useCallback((dogId?: string) => {
    if (!enableShowPredictions) return [];

    const predictions = predictiveLoader.generateShowEntryPredictions(dogId);
    
    setState(prev => ({
      ...prev,
      showEntryPredictions: predictions.map(pred => ({
        showId: pred.showId,
        showName: pred.showName,
        dogId: pred.dogId,
        dogName: pred.dogName,
        confidence: pred.confidence
      }))
    }));

    return predictions;
  }, [enableShowPredictions]);

  /**
   * Get show entry predictions for a specific dog
   */
  const getShowPredictions = useCallback((dogId: string) => {
    if (!enableShowPredictions) return [];
    
    const predictions = predictiveLoader.getShowEntryPredictions(dogId);
    return predictions.filter(pred => pred.confidence >= preloadThreshold);
  }, [enableShowPredictions, preloadThreshold]);

  /**
   * Manually trigger preloading for a specific route or entity
   */
  const triggerPreload = useCallback((target: string, type: 'route' | 'entity' = 'route') => {
    if (!enablePreloading) return;

    console.log(`Manual preload triggered for ${type}: ${target}`);
    
    setState(prev => ({
      ...prev,
      preloadingCount: prev.preloadingCount + 1,
      lastPreloadTime: new Date()
    }));

    // Simulate preload completion
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        preloadingCount: Math.max(0, prev.preloadingCount - 1)
      }));
    }, 1500);
  }, [enablePreloading]);

  /**
   * Get analytics about predictive loading performance
   */
  const getAnalytics = useCallback(() => {
    if (!enablePreloading) return null;

    return predictiveLoader.getAnalytics();
  }, [enablePreloading]);

  /**
   * Reset all predictive data
   */
  const resetPredictiveData = useCallback(() => {
    predictiveLoader.resetPredictiveData();
    
    setState(prev => ({
      ...prev,
      showEntryPredictions: [],
      lastPreloadTime: null
    }));
  }, []);

  /**
   * Toggle predictive loading functionality
   */
  const togglePredictiveLoading = useCallback((enabled: boolean) => {
    setState(prev => ({
      ...prev,
      isActive: enabled
    }));
  }, []);

  // Monitor preload queue status
  useEffect(() => {
    if (!enablePreloading) return;

    const interval = setInterval(() => {
      const analytics = predictiveLoader.getAnalytics();
      setState(prev => ({
        ...prev,
        preloadingCount: analytics.preloadQueue.pending + analytics.preloadQueue.loading
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, [enablePreloading]);

  // Generate initial show predictions
  useEffect(() => {
    if (enableShowPredictions) {
      generateShowPredictions();
    }
  }, [enableShowPredictions, generateShowPredictions]);

  return {
    // State
    isActive: state.isActive,
    preloadingCount: state.preloadingCount,
    lastPreloadTime: state.lastPreloadTime,
    showEntryPredictions: state.showEntryPredictions,

    // Tracking methods
    trackEntityAccess,
    
    // Prediction methods
    generateShowPredictions,
    getShowPredictions,
    triggerPreload,

    // Analytics and control
    getAnalytics,
    resetPredictiveData,
    togglePredictiveLoading
  };
}

/**
 * Hook specifically for route preloading
 * Simplified interface for preloading likely next routes
 */
export function useRoutePreloading() {
  const { triggerPreload, getAnalytics, isActive } = usePredictiveLoading({
    enablePreloading: true,
    enableShowPredictions: false,
    trackNavigation: true,
    trackRelationships: false
  });

  const preloadRoute = useCallback((route: string) => {
    triggerPreload(route, 'route');
  }, [triggerPreload]);

  const getPreloadStats = useCallback(() => {
    const analytics = getAnalytics();
    return analytics ? {
      navigationPatterns: analytics.navigationPatterns,
      successRate: analytics.successRate,
      queueSize: analytics.preloadQueue.total
    } : null;
  }, [getAnalytics]);

  return {
    isActive,
    preloadRoute,
    getPreloadStats
  };
}

/**
 * Hook for show entry predictions
 * Specialized for predicting likely show entries
 */
export function useShowEntryPredictions(dogId?: string) {
  const { 
    generateShowPredictions, 
    getShowPredictions, 
    showEntryPredictions 
  } = usePredictiveLoading({
    enablePreloading: false,
    enableShowPredictions: true,
    trackNavigation: false,
    trackRelationships: false
  });

  const predictions = dogId ? getShowPredictions(dogId) : showEntryPredictions;

  const refreshPredictions = useCallback(() => {
    generateShowPredictions(dogId);
  }, [generateShowPredictions, dogId]);

  const getHighConfidencePredictions = useCallback((minConfidence = 0.5) => {
    return predictions.filter(pred => pred.confidence >= minConfidence);
  }, [predictions]);

  return {
    predictions,
    refreshPredictions,
    getHighConfidencePredictions,
    hasPredictions: predictions.length > 0
  };
}

/**
 * Hook for smart relationship preloading
 * Handles preloading of related entities
 */
export function useRelationshipPreloading() {
  const { trackEntityAccess, getAnalytics } = usePredictiveLoading({
    enablePreloading: true,
    enableShowPredictions: false,
    trackNavigation: false,
    trackRelationships: true
  });

  const trackDogRelationships = useCallback((dogId: string, ownerId?: string, showIds?: string[]) => {
    const relatedEntities = [];
    
    if (ownerId) {
      relatedEntities.push({ type: 'person' as const, ids: [ownerId] });
    }
    
    if (showIds && showIds.length > 0) {
      relatedEntities.push({ type: 'show' as const, ids: showIds });
    }

    trackEntityAccess('dog', dogId, relatedEntities);
  }, [trackEntityAccess]);

  const trackPersonRelationships = useCallback((personId: string, dogIds?: string[], clubIds?: string[]) => {
    const relatedEntities = [];
    
    if (dogIds && dogIds.length > 0) {
      relatedEntities.push({ type: 'dog' as const, ids: dogIds });
    }
    
    if (clubIds && clubIds.length > 0) {
      relatedEntities.push({ type: 'club' as const, ids: clubIds });
    }

    trackEntityAccess('person', personId, relatedEntities);
  }, [trackEntityAccess]);

  const trackShowRelationships = useCallback((showId: string, clubId?: string, entryIds?: string[]) => {
    const relatedEntities = [];
    
    if (clubId) {
      relatedEntities.push({ type: 'club' as const, ids: [clubId] });
    }
    
    if (entryIds && entryIds.length > 0) {
      relatedEntities.push({ type: 'entry' as const, ids: entryIds });
    }

    trackEntityAccess('show', showId, relatedEntities);
  }, [trackEntityAccess]);

  const getRelationshipStats = useCallback(() => {
    const analytics = getAnalytics();
    return analytics ? {
      relationshipHints: analytics.relationshipHints,
      successRate: analytics.successRate
    } : null;
  }, [getAnalytics]);

  return {
    trackDogRelationships,
    trackPersonRelationships,
    trackShowRelationships,
    getRelationshipStats
  };
}