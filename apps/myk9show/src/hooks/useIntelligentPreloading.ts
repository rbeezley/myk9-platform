/* eslint-disable @typescript-eslint/no-explicit-any */
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

// Route to component mapping for preloading
interface RouteComponentMap {
  [path: string]: ComponentType<any>;
}

// Configuration for intelligent preloading
interface PreloadingConfig {
  // Enable route pattern analysis
  enablePatternAnalysis: boolean;
  
  // Enable performance monitoring
  enablePerformanceMonitoring: boolean;
  
  // Maximum components to preload simultaneously
  maxConcurrentPreloads: number;
  
  // Delay between preloads to avoid overwhelming the network
  preloadDelay: number;
  
  // Enable debug logging in development
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

      // Filter routes that haven't been preloaded yet
      const routesToPreload = likelyRoutes
        .filter(route => !preloadQueueRef.current.has(route))
        .filter(route => !activePreloadsRef.current.has(route))
        .slice(0, configRef.current.maxConcurrentPreloads);

      // Preload components for likely routes
      for (const [index, route] of routesToPreload.entries()) {
        const component = routeComponentMap[route];
        
        if (component && (component as any).preload) {
          preloadQueueRef.current.add(route);
          
          // Stagger preloads to avoid overwhelming the network
          setTimeout(async () => {
            try {
              activePreloadsRef.current.add(route);
              const startTime = performance.now();
              
              await (component as any).preload();
              
              const loadTime = performance.now() - startTime;
              
              if (configRef.current.enablePerformanceMonitoring) {
                LazyLoadingMonitor.recordLoadTime(route, loadTime);
              }
            } catch {
              if (configRef.current.enablePerformanceMonitoring) {
                LazyLoadingMonitor.recordFailedLoad(route);
              }
            } finally {
              activePreloadsRef.current.delete(route);
              preloadQueueRef.current.delete(route);
            }
          }, index * configRef.current.preloadDelay);
        }
      }
    };

    // Use RAF to avoid blocking the main thread
    requestAnimationFrame(preloadLikelyRoutes);
  }, [location.pathname, routeComponentMap]);

  // Return performance monitoring functions
  return {
    // Get performance report for all lazy loaded components
    getPerformanceReport: LazyLoadingMonitor.getPerformanceReport,
    
    // Get navigation patterns
    getNavigationPatterns: () => IntelligentPreloader['routePatterns'],
    
    // Clear preload cache (useful for testing or memory management)
    clearCache: IntelligentPreloader.clearCache,
    
    // Manually preload a specific route
    preloadRoute: (route: string) => {
      const component = routeComponentMap[route];
      if (component && (component as any).preload) {
        return (component as any).preload();
      }
      return Promise.resolve();
    },
    
    // Get current preload queue status
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
export function useRoutePreloading(_routePath: string, component: ComponentType<any>) {
  const preloadRef = useRef<Promise<any> | null>(null);
  const [isPreloaded, setIsPreloaded] = useState(false);

  const triggerPreload = () => {
    if (!preloadRef.current && (component as any).preload) {
      preloadRef.current = (component as any).preload();
      setIsPreloaded(true);
    }

    return preloadRef.current;
  };

  const onHover = () => {
    const options = (component as any).options;
    if (options?.preloadOnHover) {
      triggerPreload();
    }
  };

  const onFocus = () => {
    const options = (component as any).options;
    if (options?.preloadOnHover) { // Use same flag for focus
      triggerPreload();
    }
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