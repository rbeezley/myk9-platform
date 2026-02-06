// Pure helper functions for useIntelligentPreloading

import type { ComponentType } from 'react';
import { LazyLoadingMonitor } from '@/utils/enhancedLazyLoading';

/**
 * Options attached to enhanced lazy components.
 */
interface LazyComponentOptions {
  preloadOnHover?: boolean;
}

/**
 * A lazy component that may have preload and options properties.
 */
export type EnhancedLazyComponent<P = Record<string, unknown>> = ComponentType<P> & {
  preload?: (() => Promise<unknown>) | undefined;
  options?: LazyComponentOptions | undefined;
};

/**
 * Checks whether a component has a `.preload()` method.
 */
export function isPreloadable(
  component: ComponentType<Record<string, unknown>>,
): boolean {
  return typeof (component as EnhancedLazyComponent).preload === 'function';
}

/**
 * Calls `.preload()` on a component. Caller should verify `isPreloadable` first.
 */
function callPreload(component: ComponentType<Record<string, unknown>>): Promise<unknown> {
  return (component as EnhancedLazyComponent).preload!();
}

/**
 * Filters routes to only those that are preloadable and not already queued/active.
 */
export function filterPreloadableRoutes(
  routes: string[],
  queued: Set<string>,
  active: Set<string>,
  maxConcurrent: number,
): string[] {
  return routes
    .filter(route => !queued.has(route))
    .filter(route => !active.has(route))
    .slice(0, maxConcurrent);
}

/**
 * Preloads a single component and records performance metrics.
 * Returns a promise that resolves when preloading completes or fails.
 */
export async function preloadSingleComponent(
  route: string,
  component: ComponentType<Record<string, unknown>>,
  enablePerformanceMonitoring: boolean,
): Promise<void> {
  const startTime = performance.now();

  try {
    await callPreload(component);
    const loadTime = performance.now() - startTime;
    if (enablePerformanceMonitoring) {
      LazyLoadingMonitor.recordLoadTime(route, loadTime);
    }
  } catch {
    if (enablePerformanceMonitoring) {
      LazyLoadingMonitor.recordFailedLoad(route);
    }
  }
}
