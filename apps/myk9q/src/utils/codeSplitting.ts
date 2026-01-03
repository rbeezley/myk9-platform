/**
 * Code Splitting Utilities
 *
 * Advanced lazy loading with retry logic, preloading, and error handling.
 */

import { lazy, ComponentType } from 'react';
import { logger } from '@/utils/logger';

/**
 * A preloadable lazy component with optional preload method
 * Generic constraint uses Record for props flexibility
 */
export type PreloadableLazyComponent<T extends ComponentType<Record<string, unknown>>> =
  React.LazyExoticComponent<T> & { preload?: () => Promise<void> };

/**
 * Cached component type - unknown since components can have any shape
 */
type CachedComponent = unknown;

export interface LazyOptions {
  /** Retry attempts on failure */
  retries?: number;

  /** Delay between retries (ms) */
  retryDelay?: number;

  /** Preload this component */
  preload?: boolean;

  /** Chunk name for debugging */
  chunkName?: string;
}

/**
 * Enhanced lazy loading with retry logic
 */
export function lazyWithRetry<T extends ComponentType<Record<string, unknown>>>(
  importFn: () => Promise<{ default: T }>,
  options: LazyOptions = {}
): React.LazyExoticComponent<T> & { preload: () => Promise<void> } {
  const {
    retries = 3,
    retryDelay = 1000,
    chunkName,
  } = options;

  let preloadPromise: Promise<{ default: T }> | null = null;

  const attemptImport = async (attemptsLeft: number): Promise<{ default: T }> => {
    try {
      const module = await importFn();
      return module;
    } catch (error) {
      if (attemptsLeft <= 0) {
        logger.error(`[Code Split] Failed to load chunk after ${retries} attempts${chunkName ? `: ${chunkName}` : ''}`, error);
        throw error;
      }

      logger.warn(`[Code Split] Retry loading chunk (${attemptsLeft} attempts left)${chunkName ? `: ${chunkName}` : ''}`);

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay));

      return attemptImport(attemptsLeft - 1);
    }
  };

  const Component = lazy(() => {
    if (preloadPromise) {
      return preloadPromise;
    }
    return attemptImport(retries);
  }) as React.LazyExoticComponent<T> & { preload: () => Promise<void> };

  // Add preload method
  Component.preload = () => {
    if (!preloadPromise) {
      preloadPromise = attemptImport(retries);
    }
    return preloadPromise.then(() => undefined);
  };

  return Component;
}

/**
 * Preload multiple components
 */
export async function preloadComponents(
  components: Array<PreloadableLazyComponent<ComponentType<Record<string, unknown>>>>
): Promise<void> {
  const promises = components.map(Component => {
    if (Component.preload) {
      return Component.preload();
    }
    return Promise.resolve();
  });

  await Promise.all(promises);
}

/**
 * Preload component on hover (for links/buttons)
 */
export function usePreloadOnHover(
  component: PreloadableLazyComponent<ComponentType<Record<string, unknown>>>
) {
  return {
    onMouseEnter: () => {
      if (component.preload) {
        component.preload();
      }
    },
    onTouchStart: () => {
      if (component.preload) {
        component.preload();
      }
    },
  };
}

/**
 * Preload component on viewport intersection
 */
export function preloadOnIntersection(
  component: PreloadableLazyComponent<ComponentType<Record<string, unknown>>>,
  element: HTMLElement | null,
  options: IntersectionObserverInit = {}
): () => void {
  if (!element || !component.preload) {
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && component.preload) {
          component.preload();
          observer.disconnect();
        }
      });
    },
    { rootMargin: '50px', ...options }
  );

  observer.observe(element);

  return () => observer.disconnect();
}

/**
 * Preload components based on route
 */
export interface RoutePreloadConfig {
  [route: string]: Array<PreloadableLazyComponent<ComponentType<Record<string, unknown>>>>;
}

const routePreloadMap: RoutePreloadConfig = {};

export function registerRoutePreload(
  route: string,
  components: Array<PreloadableLazyComponent<ComponentType<Record<string, unknown>>>>
): void {
  routePreloadMap[route] = components;
}

export async function preloadRoute(route: string): Promise<void> {
  const components = routePreloadMap[route];
  if (!components) return;

  await preloadComponents(components);
}

/**
 * Preload based on user navigation patterns
 */
const navigationHistory: string[] = [];
const HISTORY_LIMIT = 10;

export function trackNavigation(route: string): void {
  navigationHistory.push(route);

  if (navigationHistory.length > HISTORY_LIMIT) {
    navigationHistory.shift();
  }

  // Predict next route and preload
  predictAndPreload();
}

function predictAndPreload(): void {
  if (navigationHistory.length < 2) return;

  // Simple prediction: if user visited A -> B multiple times, preload B when on A
  const current = navigationHistory[navigationHistory.length - 1];
  const patterns: { [key: string]: string[] } = {};

  for (let i = 0; i < navigationHistory.length - 1; i++) {
    const from = navigationHistory[i];
    const to = navigationHistory[i + 1];

    if (!patterns[from]) {
      patterns[from] = [];
    }
    patterns[from].push(to);
  }

  // Find most common next route
  const nextRoutes = patterns[current];
  if (!nextRoutes) return;

  const frequency: { [key: string]: number } = {};
  nextRoutes.forEach(route => {
    frequency[route] = (frequency[route] || 0) + 1;
  });

  const predicted = Object.keys(frequency).reduce((a, b) =>
    frequency[a] > frequency[b] ? a : b
  );

  // Preload predicted route
  if (predicted) {
    requestIdleCallback(() => {
      preloadRoute(predicted);
    });
  }
}

/**
 * Component cache for faster re-renders
 */
const componentCache = new Map<string, CachedComponent>();

export function getCachedComponent(key: string): CachedComponent {
  return componentCache.get(key);
}

export function setCachedComponent(key: string, component: CachedComponent): void {
  componentCache.set(key, component);
}

export function clearComponentCache(): void {
  componentCache.clear();
}

/**
 * Measure chunk load times for analytics
 */
const chunkLoadTimes: { [chunk: string]: number[] } = {};

export function recordChunkLoadTime(chunkName: string, duration: number): void {
  if (!chunkLoadTimes[chunkName]) {
    chunkLoadTimes[chunkName] = [];
  }
  chunkLoadTimes[chunkName].push(duration);
}

export function getChunkLoadStats(chunkName: string): {
  avg: number;
  min: number;
  max: number;
  count: number;
} | null {
  const times = chunkLoadTimes[chunkName];
  if (!times || times.length === 0) return null;

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  return { avg, min, max, count: times.length };
}

export function getAllChunkStats(): { [chunk: string]: ReturnType<typeof getChunkLoadStats> } {
  const stats: { [chunk: string]: ReturnType<typeof getChunkLoadStats> } = {};

  Object.keys(chunkLoadTimes).forEach(chunk => {
    stats[chunk] = getChunkLoadStats(chunk);
  });

  return stats;
}

/**
 * Prefetch chunks during idle time
 */
export function prefetchChunksDuringIdle(
  components: Array<PreloadableLazyComponent<ComponentType<Record<string, unknown>>>>
): void {
  if (!window.requestIdleCallback) {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => preloadComponents(components), 1000);
    return;
  }

  requestIdleCallback(
    () => {
      preloadComponents(components);
    },
    { timeout: 5000 }
  );
}

/**
 * Critical chunk preloader
 * Preloads essential chunks immediately after initial render
 */
export async function preloadCriticalChunks(
  chunks: Array<PreloadableLazyComponent<ComponentType<Record<string, unknown>>>>
): Promise<void> {
  // Wait for initial render to complete
  await new Promise(resolve => {
    if (document.readyState === 'complete') {
      resolve(undefined);
    } else {
      window.addEventListener('load', () => resolve(undefined), { once: true });
    }
  });

  // Preload in batches to avoid network congestion
  const BATCH_SIZE = 3;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    await preloadComponents(batch);
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Monitor chunk loading errors
 */
let chunkErrorCallback: ((error: Error, chunkName?: string) => void) | null = null;

export function onChunkError(callback: (error: Error, chunkName?: string) => void): void {
  chunkErrorCallback = callback;
}

export function reportChunkError(error: Error, chunkName?: string): void {
  if (chunkErrorCallback) {
    chunkErrorCallback(error, chunkName);
  }
}
