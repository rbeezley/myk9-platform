/**
 * Intelligent Preloading Hook
 *
 * Integrates with React Router to provide intelligent component preloading
 * based on user navigation patterns and route priority
 */

import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { IntelligentPreloader, LazyLoadingMonitor } from '@/utils/enhancedLazyLoading';
import type { ComponentType } from 'react';
import {
  isPreloadable,
  filterPreloadableRoutes,
  preloadSingleComponent,
  type EnhancedLazyComponent,
} from '@/hooks/intelligentPreloadingHelpers';

// Route to component mapping for preloading
interface RouteComponentMap {
  [path: string]: ComponentType<Record<string, unknown>>;
}

// Configuration for intelligent preloading
interface PreloadingConfig {
  enablePatternAnalysis: boolean;
  enablePerformanceMonitoring: boolean;
  maxConcurrentPreloads: number;
  preloadDelay: number;
  enableDebugLogging: boolean;
}

const DEFAULT_CONFIG: PreloadingConfig = {
  enablePatternAnalysis: true,
  enablePerformanceMonitoring: true,
  maxConcurrentPreloads: 3,
  preloadDelay: 500,
  enableDebugLogging: process.env.NODE_ENV === 'development'
};

/**
 * Hook to enable intelligent preloading based on navigation patterns
 */
export function useIntelligentPreloading(
  routeComponentMap: RouteComponentMap,
  config: Partial<PreloadingConfig> = {}
) {
  const location = useLocation();
  const configRef = useRef({ ...DEFAULT_CONFIG, ...config });
  const preloadQueueRef = useRef<Set<string>>(new Set());
  const activePreloadsRef = useRef<Set<string>>(new Set());

  // Track navigation for pattern analysis
  useEffect(() => {
    if (configRef.current.enablePatternAnalysis) {
      IntelligentPreloader.trackNavigation(location.pathname);
    }
  }, [location.pathname]);

  // Preload likely next routes
  useEffect(() => {
    if (!configRef.current.enablePatternAnalysis) return;

    const preloadLikelyRoutes = async () => {
      const likelyRoutes = IntelligentPreloader.getLikelyNextRoutes(location.pathname);
      if (likelyRoutes.length === 0) return;

      const routesToPreload = filterPreloadableRoutes(
        likelyRoutes,
        preloadQueueRef.current,
        activePreloadsRef.current,
        configRef.current.maxConcurrentPreloads,
      );

      for (const [index, route] of routesToPreload.entries()) {
        const component = routeComponentMap[route];
        if (!component || !isPreloadable(component)) continue;

        preloadQueueRef.current.add(route);

        // Stagger preloads to avoid overwhelming the network
        setTimeout(async () => {
          activePreloadsRef.current.add(route);
          await preloadSingleComponent(
            route,
            component,
            configRef.current.enablePerformanceMonitoring,
          );
          activePreloadsRef.current.delete(route);
          preloadQueueRef.current.delete(route);
        }, index * configRef.current.preloadDelay);
      }
    };

    requestAnimationFrame(preloadLikelyRoutes);
  }, [location.pathname, routeComponentMap]);

  return {
    getPerformanceReport: LazyLoadingMonitor.getPerformanceReport,
    getNavigationPatterns: () => IntelligentPreloader['routePatterns'],
    clearCache: IntelligentPreloader.clearCache,

    preloadRoute: (route: string) => {
      const component = routeComponentMap[route];
      if (component && isPreloadable(component)) {
        return preloadSingleComponent(route, component, configRef.current.enablePerformanceMonitoring);
      }
      return Promise.resolve();
    },

    getPreloadStatus: () => ({
      queuedPreloads: Array.from(preloadQueueRef.current),
      activePreloads: Array.from(activePreloadsRef.current),
      totalPreloaded: Object.keys(LazyLoadingMonitor.getPerformanceReport()).length
    })
  };
}

/**
 * Hook for route-specific preloading triggers (hover, focus, etc.)
 */
export function useRoutePreloading(_routePath: string, component: EnhancedLazyComponent) {
  const preloadRef = useRef<Promise<unknown> | null>(null);
  const [isPreloaded, setIsPreloaded] = useState(false);

  const triggerPreload = () => {
    if (!preloadRef.current && component.preload) {
      preloadRef.current = component.preload();
      setIsPreloaded(true);
    }
    return preloadRef.current;
  };

  const onHover = () => {
    if (component.options?.preloadOnHover) triggerPreload();
  };

  const onFocus = () => {
    if (component.options?.preloadOnHover) triggerPreload();
  };

  return {
    preload: triggerPreload,
    onMouseEnter: onHover,
    onFocus,
    isPreloaded
  };
}

/**
 * Provider component for intelligent preloading context
 */
export function createPreloadingProvider(routeComponentMap: RouteComponentMap) {
  return function PreloadingProvider({ children }: { children: React.ReactNode }) {
    useIntelligentPreloading(routeComponentMap);
    return children;
  };
}
