/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Enhanced Lazy Loading Utilities
 * 
 * Provides intelligent component lazy loading with prefetching,
 * priority-based loading, and performance monitoring
 */

import { lazy, ComponentType } from 'react';
import { logger } from '@/services/LoggingService';

// Enhanced lazy loading options
export interface LazyLoadOptions {
  // Preload the component on hover/focus for better UX
  preloadOnHover?: boolean;
  
  // Preload after initial page load completes
  preloadOnIdle?: boolean;
  
  // Priority level for loading order
  priority?: 'high' | 'medium' | 'low';
  
  // Custom loading timeout in ms
  timeout?: number;
  
  // Retry failed loads
  retryAttempts?: number;
  
  // Component display name for debugging
  displayName?: string;
}

// Lazy loading with enhanced options
export function createEnhancedLazy<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T } | T>,
  options: LazyLoadOptions = {}
): ComponentType<any> {
  const {
    preloadOnHover = false,
    preloadOnIdle = false,
    priority = 'medium',
    timeout = 30000,
    retryAttempts = 2,
    displayName = 'LazyComponent'
  } = options;

  let preloadPromise: Promise<{ default: T } | T> | null = null;
  let retryCount = 0;

  // Enhanced import with retry logic
  const enhancedImport = async (): Promise<{ default: T } | T> => {
    try {
      const startTime = performance.now();
      
      // Apply timeout
      const importPromise = importFn();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Import timeout for ${displayName}`)), timeout)
      );
      
      const result = await Promise.race([importPromise, timeoutPromise]);
      
      // Track performance
      const loadTime = performance.now() - startTime;
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`📦 Lazy loaded ${displayName} in ${loadTime.toFixed(2)}ms`, 'utils', {});
      }
      
      return result;
    } catch (error) {
      retryCount++;
      
      if (retryCount <= retryAttempts) {
        logger.warn(`🔄 Retrying import for ${displayName} (attempt ${retryCount}/${retryAttempts})`, 'utils', {});
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return enhancedImport();
      }
      
      logger.error(`❌ Failed to load ${displayName} after ${retryAttempts} attempts:`, 'utils', {}, error as Error);
      throw error;
    }
  };

  // Create the lazy component  
  const LazyComponent = lazy(() => enhancedImport().then(module => {
    // Handle both { default: T } and T patterns
    if (typeof module === 'object' && module !== null && 'default' in module) {
      return { default: (module as any).default };
    }
    return { default: module as ComponentType<any> };
  }));
  
  // Set display name for debugging
  (LazyComponent as any).displayName = displayName;

  // Preload functions
  const preload = () => {
    if (!preloadPromise) {
      preloadPromise = enhancedImport();
    }
    return preloadPromise;
  };

  // Schedule preloading based on options
  if (preloadOnIdle) {
    // Preload when browser is idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        preload();
      }, { timeout: 5000 });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(preload, 2000);
    }
  }

  // Add preload method to component for manual triggering
  (LazyComponent as any).preload = preload;
  (LazyComponent as any).options = options;

  return LazyComponent;
}

// Route-specific lazy loading presets
export const RouteLazyPresets = {
  // High priority routes (likely to be visited immediately)
  highPriority: {
    priority: 'high' as const,
    preloadOnIdle: true,
    timeout: 15000,
    retryAttempts: 3
  },
  
  // Medium priority routes (common user flows)
  mediumPriority: {
    priority: 'medium' as const,
    preloadOnHover: true,
    preloadOnIdle: false,
    timeout: 20000,
    retryAttempts: 2
  },
  
  // Low priority routes (admin/advanced features)
  lowPriority: {
    priority: 'low' as const,
    preloadOnHover: false,
    preloadOnIdle: false,
    timeout: 30000,
    retryAttempts: 1
  },
  
  // Critical routes (core app functionality)
  critical: {
    priority: 'high' as const,
    preloadOnIdle: true,
    timeout: 10000,
    retryAttempts: 5
  }
};

// Intelligent preloader that analyzes user navigation patterns
export class IntelligentPreloader {
  private static navigationHistory: string[] = [];
  private static preloadCache = new Map<string, Promise<any>>();
  private static routePatterns = new Map<string, string[]>();

  // Track navigation for pattern analysis
  static trackNavigation(path: string) {
    this.navigationHistory.push(path);
    
    // Keep only last 20 navigations
    if (this.navigationHistory.length > 20) {
      this.navigationHistory.shift();
    }
    
    this.analyzePatterns();
  }

  // Analyze common navigation patterns
  private static analyzePatterns() {
    const patterns = new Map<string, Map<string, number>>();
    
    for (let i = 0; i < this.navigationHistory.length - 1; i++) {
      const current = this.navigationHistory[i];
      const next = this.navigationHistory[i + 1];
      
      if (!patterns.has(current)) {
        patterns.set(current, new Map());
      }
      
      const nextRoutes = patterns.get(current)!;
      nextRoutes.set(next, (nextRoutes.get(next) || 0) + 1);
    }
    
    // Convert to likely next routes
    for (const [route, nextRoutes] of patterns) {
      const sortedNext = Array.from(nextRoutes.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3) // Top 3 most likely
        .map(([path]) => path);
      
      this.routePatterns.set(route, sortedNext);
    }
  }

  // Get likely next routes for preloading
  static getLikelyNextRoutes(currentPath: string): string[] {
    return this.routePatterns.get(currentPath) || [];
  }

  // Preload components for likely routes
  static preloadForRoute(currentPath: string, lazyComponents: Map<string, ComponentType<any>>) {
    const likelyRoutes = this.getLikelyNextRoutes(currentPath);
    
    for (const route of likelyRoutes) {
      const component = lazyComponents.get(route);
      if (component && (component as any).preload && !this.preloadCache.has(route)) {
        const preloadPromise = (component as any).preload();
        this.preloadCache.set(route, preloadPromise);
        
        if (process.env.NODE_ENV === 'development') {
          logger.debug(`🎯 Preloading likely route: ${route}`, 'utils', {});
        }
      }
    }
  }

  // Clear preload cache
  static clearCache() {
    this.preloadCache.clear();
  }
}

// Performance monitoring for lazy loaded components
export class LazyLoadingMonitor {
  private static loadTimes = new Map<string, number[]>();
  private static failedLoads = new Map<string, number>();

  static recordLoadTime(componentName: string, loadTime: number) {
    if (!this.loadTimes.has(componentName)) {
      this.loadTimes.set(componentName, []);
    }
    
    const times = this.loadTimes.get(componentName)!;
    times.push(loadTime);
    
    // Keep only last 10 measurements
    if (times.length > 10) {
      times.shift();
    }
  }

  static recordFailedLoad(componentName: string) {
    const current = this.failedLoads.get(componentName) || 0;
    this.failedLoads.set(componentName, current + 1);
  }

  static getAverageLoadTime(componentName: string): number {
    const times = this.loadTimes.get(componentName) || [];
    if (times.length === 0) return 0;
    
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  static getFailureRate(componentName: string): number {
    const failed = this.failedLoads.get(componentName) || 0;
    const total = (this.loadTimes.get(componentName)?.length || 0) + failed;
    
    return total > 0 ? failed / total : 0;
  }

  static getPerformanceReport(): Record<string, {
    averageLoadTime: number;
    failureRate: number;
    totalLoads: number;
  }> {
    const report: Record<string, any> = {};
    
    const allComponents = new Set([
      ...this.loadTimes.keys(),
      ...this.failedLoads.keys()
    ]);
    
    for (const component of allComponents) {
      report[component] = {
        averageLoadTime: this.getAverageLoadTime(component),
        failureRate: this.getFailureRate(component),
        totalLoads: (this.loadTimes.get(component)?.length || 0) + (this.failedLoads.get(component) || 0)
      };
    }
    
    return report;
  }
}

// Utility to batch preload multiple components
export function batchPreload(components: ComponentType<any>[], delay = 100): Promise<void[]> {
  const preloadPromises = components.map((component, index) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        if ((component as any).preload) {
          (component as any).preload().then(() => resolve()).catch(() => resolve());
        } else {
          resolve();
        }
      }, delay * index);
    });
  });
  
  return Promise.all(preloadPromises);
}

// Development helper to expose performance data
if (process.env.NODE_ENV === 'development') {
  (window as any).__lazyLoadingDebug = {
    IntelligentPreloader,
    LazyLoadingMonitor,
    routePatterns: () => IntelligentPreloader['routePatterns'],
    navigationHistory: () => IntelligentPreloader['navigationHistory'],
    performanceReport: () => LazyLoadingMonitor.getPerformanceReport()
  };
}