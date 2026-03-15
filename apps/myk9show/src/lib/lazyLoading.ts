// Bundle splitting and lazy loading optimization
// Phase 3.2: Advanced Query Optimizations

import { lazy } from 'react';
import { logger } from '@/services/LoggingService';

// Lazy loading utilities for store modules and components
export const lazyLoadWithRetry = <T extends React.ComponentType>(
  importFn: () => Promise<{ default: T }>,
  retries = 3
): React.LazyExoticComponent<T> => {
  return lazy(async () => {
    let attempt = 0;

    while (attempt < retries) {
      try {
        return await importFn();
      } catch (error) {
        attempt++;

        if (attempt >= retries) {
          logger.error(
            'Failed to load module after multiple attempts',
            'loading',
            { retries },
            error as Error
          );
          throw error;
        }

        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error('Unreachable code');
  });
};

// Pre-cache dynamic imports for faster subsequent loads
const importCache = new Map<string, Promise<unknown>>();

export const preloadImport = async <T>(key: string, importFn: () => Promise<T>): Promise<void> => {
  if (!importCache.has(key)) {
    importCache.set(key, importFn());
  }

  try {
    await importCache.get(key);
  } catch (error) {
    importCache.delete(key);
    logger.warn('Failed to preload module', 'loading', { key }, error as Error);
  }
};

// Cached dynamic import with retry logic
export const cachedDynamicImport = async <T>(
  key: string,
  importFn: () => Promise<T>,
  retries = 3
): Promise<T> => {
  if (importCache.has(key)) {
    return importCache.get(key) as Promise<T>;
  }

  let attempt = 0;

  while (attempt < retries) {
    try {
      const importPromise = importFn();
      importCache.set(key, importPromise);
      return await importPromise;
    } catch (error) {
      importCache.delete(key);
      attempt++;

      if (attempt >= retries) {
        logger.error(
          'Failed to import module after multiple attempts',
          'loading',
          { key, retries },
          error as Error
        );
        throw error;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  throw new Error('Unreachable code');
};

// Lazy load store hooks with intelligent preloading
export const storeLazyLoaders = {
  dogs: {
    key: 'dogs-store',
    load: () => cachedDynamicImport('dogs-store', () => import('@/hooks/queries/useDogsDatabase')),
    preload: () => preloadImport('dogs-store', () => import('@/hooks/queries/useDogsDatabase')),
  },

  users: {
    key: 'users-store',
    load: () =>
      cachedDynamicImport('users-store', () => import('@/hooks/queries/useUsersDatabase')),
    preload: () => preloadImport('users-store', () => import('@/hooks/queries/useUsersDatabase')),
  },

  shows: {
    key: 'shows-store',
    load: () =>
      cachedDynamicImport('shows-store', () => import('@/hooks/queries/useShowsDatabase')),
    preload: () => preloadImport('shows-store', () => import('@/hooks/queries/useShowsDatabase')),
  },

  clubs: {
    key: 'clubs-store',
    load: () =>
      cachedDynamicImport('clubs-store', () => import('@/hooks/queries/useClubsDatabase')),
    preload: () => preloadImport('clubs-store', () => import('@/hooks/queries/useClubsDatabase')),
  },

  classes: {
    key: 'classes-store',
    load: () =>
      cachedDynamicImport('classes-store', () => import('@/hooks/queries/useClassesDatabase')),
    preload: () =>
      preloadImport('classes-store', () => import('@/hooks/queries/useClassesDatabase')),
  },

  search: {
    key: 'search-hooks',
    load: () =>
      cachedDynamicImport('search-hooks', () => import('@/hooks/queries/useOptimizedSearch')),
    preload: () =>
      preloadImport('search-hooks', () => import('@/hooks/queries/useOptimizedSearch')),
  },

  pagination: {
    key: 'pagination-hooks',
    load: () =>
      cachedDynamicImport('pagination-hooks', () => import('@/hooks/queries/usePaginatedQueries')),
    preload: () =>
      preloadImport('pagination-hooks', () => import('@/hooks/queries/usePaginatedQueries')),
  },
} as const;

// Lazy load UI components with retry logic
export const componentLazyLoaders = {
  // Dog components
  dogDetailsMain: lazyLoadWithRetry(() =>
    import('@/components/dogs/DogDetailsMain').then(module => ({
      default: module.default as React.ComponentType<{ dog?: unknown }>,
    }))
  ),
} as const;

// Intelligent preloading based on route patterns
export class RouteBasedPreloader {
  private preloadedRoutes = new Set<string>();
  private preloadingQueue = new Set<string>();

  constructor() {
    this.setupRouteListening();
  }

  private setupRouteListening() {
    if (typeof window === 'undefined') return;

    // Listen for route changes and preload likely next components
    const handleRouteChange = () => {
      const currentPath = window.location.pathname;
      this.preloadForRoute(currentPath);
    };

    // Initial preload
    handleRouteChange();

    // Listen for navigation
    window.addEventListener('popstate', handleRouteChange);
  }

  private async preloadForRoute(path: string) {
    if (this.preloadedRoutes.has(path) || this.preloadingQueue.has(path)) {
      return;
    }

    this.preloadingQueue.add(path);

    try {
      // Preload based on current route
      if (path === '/') {
        // Dashboard: preload most common components
        await Promise.all([
          storeLazyLoaders.dogs.preload(),
          storeLazyLoaders.users.preload(),
          storeLazyLoaders.shows.preload(),
        ]);
      } else if (path.startsWith('/dogs')) {
        // Dogs section: preload dog-related components
        await Promise.all([
          storeLazyLoaders.dogs.preload(),
          storeLazyLoaders.search.preload(),
          storeLazyLoaders.pagination.preload(),
        ]);
      } else if (path.startsWith('/people')) {
        // People section: preload user-related components
        await Promise.all([
          storeLazyLoaders.users.preload(),
          storeLazyLoaders.dogs.preload(), // Users often view their dogs
          storeLazyLoaders.search.preload(),
        ]);
      } else if (path.startsWith('/shows')) {
        // Shows section: preload show-related components
        await Promise.all([
          storeLazyLoaders.shows.preload(),
          storeLazyLoaders.clubs.preload(),
          storeLazyLoaders.classes.preload(),
        ]);
      } else if (path.includes('template')) {
        // Template section: preload template components
        await Promise.all([storeLazyLoaders.classes.preload(), storeLazyLoaders.shows.preload()]);
      }

      this.preloadedRoutes.add(path);
    } catch (error) {
      logger.warn('Failed to preload for route', 'loading', { path }, error as Error);
    } finally {
      this.preloadingQueue.delete(path);
    }
  }

  // Manually trigger preloading for specific route
  preloadRoute(path: string) {
    return this.preloadForRoute(path);
  }

  // Get preloading statistics
  getStats() {
    return {
      preloadedRoutes: Array.from(this.preloadedRoutes),
      preloadingQueue: Array.from(this.preloadingQueue),
      cacheSize: importCache.size,
      cachedModules: Array.from(importCache.keys()),
    };
  }

  // Clear preload cache
  clearCache() {
    importCache.clear();
    this.preloadedRoutes.clear();
    this.preloadingQueue.clear();
  }
}

// Bundle size optimization utilities
export const bundleOptimizations = {
  // Load critical stores immediately
  preloadCriticalStores: async () => {
    try {
      await Promise.all([storeLazyLoaders.dogs.preload(), storeLazyLoaders.users.preload()]);
    } catch (error) {
      logger.warn('Failed to preload critical stores', 'loading', {}, error as Error);
    }
  },

  // Load all store modules (for initial app hydration)
  preloadAllStores: async () => {
    try {
      await Promise.all(Object.values(storeLazyLoaders).map(loader => loader.preload()));
    } catch (error) {
      logger.warn('Failed to preload all stores', 'loading', {}, error as Error);
    }
  },

  // Intelligent preloading based on user patterns
  preloadByUserRole: async (userRole: string) => {
    const rolePreloadMap: Record<string, Array<keyof typeof storeLazyLoaders>> = {
      admin: ['dogs', 'users', 'shows', 'clubs', 'classes'],
      secretary: ['shows', 'classes', 'users', 'dogs'],
      exhibitor: ['dogs', 'shows', 'users'],
      judge: ['shows', 'classes', 'dogs'],
      viewer: ['dogs', 'shows'],
    };

    const storesForRole = rolePreloadMap[userRole] || ['dogs', 'users'];

    try {
      await Promise.all(storesForRole.map(store => storeLazyLoaders[store].preload()));
    } catch (error) {
      logger.warn('Failed to preload stores for role', 'loading', { userRole }, error as Error);
    }
  },

  // Memory management: periodically clean unused imports
  cleanupUnusedImports: () => {
    // This is a simplified cleanup - in production, you'd track usage timestamps
    if (importCache.size > 20) {
      logger.debug('Cache size large, consider cleanup strategies', 'loading', {
        cacheSize: importCache.size,
      });
    }
  },
};

// Initialize route-based preloader
export const routePreloader = new RouteBasedPreloader();

// Hook for using lazy loading in components
export const useLazyLoading = () => {
  return {
    storeLazyLoaders,
    componentLazyLoaders,
    routePreloader,
    bundleOptimizations,
  };
};

// Performance monitoring for lazy loading
export const useLazyLoadingPerformance = () => {
  const getMetrics = () => {
    const stats = routePreloader.getStats();

    return {
      ...stats,
      importCacheSize: importCache.size,
      memoryEstimate: JSON.stringify(Array.from(importCache.keys())).length,
      preloadEfficiency:
        stats.preloadedRoutes.length /
          (stats.preloadedRoutes.length + stats.preloadingQueue.length) || 0,
    };
  };

  return {
    getMetrics,
    clearCache: () => routePreloader.clearCache(),
    preloadRoute: (path: string) => routePreloader.preloadRoute(path),
  };
};
