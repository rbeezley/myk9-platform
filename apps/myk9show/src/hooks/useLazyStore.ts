import { useEffect, useRef } from 'react';
import { useStoreProvider } from '@/providers/StoreProvider';
import { StoreName, getStoreCategory } from '@/store/store-categories';
import { logger } from '@/services/LoggingService';

/**
 * Hook for lazy loading stores only when needed
 * Automatically loads the store on first access and provides loading state
 */
export function useLazyStore(storeName: StoreName) {
  const { loadStore, isStoreLoaded, isStoreLoading, getStoreError } = useStoreProvider();
  const hasAttemptedLoadRef = useRef(false);

  const isLoaded = isStoreLoaded(storeName);
  const isLoading = isStoreLoading(storeName);

  useEffect(() => {
    if (!hasAttemptedLoadRef.current && !isLoaded && !isLoading) {
      hasAttemptedLoadRef.current = true;
      const category = getStoreCategory(storeName);
      logger.debug(`Lazy loading ${category} store: ${storeName}`, 'hooks', {});

      loadStore(storeName).catch(error => {
        logger.error(`Failed to lazy load store ${storeName}:`, 'hooks', {}, error as Error);
      });
    }
    // loadStore is stable (no dependencies) so we only need storeName and state checks
  }, [isLoaded, isLoading, storeName, loadStore]);

  return {
    isLoaded,
    isLoading,
    error: getStoreError(storeName),
    // Derived from actual state - true if loading has started or completed
    hasAttemptedLoad: isLoaded || isLoading
  };
}

/**
 * Hook for lazy loading multiple stores when a feature is accessed
 */
export function useLazyStores(storeNames: StoreName[]) {
  const { loadStore, isStoreLoaded, isStoreLoading } = useStoreProvider();
  const hasAttemptedLoadRef = useRef(false);

  const allLoaded = storeNames.every(name => isStoreLoaded(name));
  const anyLoading = storeNames.some(name => isStoreLoading(name));

  useEffect(() => {
    if (!hasAttemptedLoadRef.current && !allLoaded && !anyLoading) {
      hasAttemptedLoadRef.current = true;
      logger.debug(`Lazy loading feature stores:`, 'hooks', { data: storeNames });

      // Load stores in parallel
      Promise.all(storeNames.map(name => loadStore(name))).catch(error => {
        logger.error('Failed to lazy load feature stores:', 'hooks', {}, error as Error);
      });
    }
    // loadStore is stable (no dependencies) so we only need storeNames and state checks
  }, [allLoaded, anyLoading, storeNames, loadStore]);

  return {
    allLoaded,
    anyLoading,
    // Derived from actual state - true if loading has started or completed
    hasAttemptedLoad: allLoaded || anyLoading
  };
}

/**
 * Hook for page-specific store loading
 * Loads appropriate stores based on the current page
 */
export function usePageStores(pageName: string) {
  const storeGroups: Record<string, StoreName[]> = {
    // Homepage - minimal stores needed
    'home': ['showStore'],
    
    // Users pages
    'people': ['userStore', 'searchHistoryStore'],
    'people-details': ['userStore', 'dogStore'],
    
    // Dog pages  
    'dogs': ['dogStore', 'userStore'],
    'dog-details': ['dogStore', 'userStore', 'competitionStore', 'achievementsStore'],
    
    // Show pages
    'shows': ['showStore', 'clubStore'],
    'show-details': ['showStore', 'clubStore', 'entryStore', 'classStore'],
    'show-create': ['showStore', 'wizardStore', 'templateStore'],
    
    // Admin pages
    'admin-templates': ['templateStore', 'classTemplateStore', 'showTemplateStore'],
    'admin-dashboard': ['showStore', 'entryStore', 'userStore', 'dogStore'],
    
    // Secretary pages
    'secretary': ['showStore', 'entryStore', 'registrationsStore', 'armbandStore'],
    'class-creation': ['classCreationStore', 'templateStore', 'showStore'],
    
    // Judge pages
    'judge': ['showStore', 'classStore', 'entryStore', 'offlineScoringStore'],
  };

  const requiredStores = storeGroups[pageName] || [];
  const { allLoaded, anyLoading } = useLazyStores(requiredStores);

  return {
    requiredStores,
    allLoaded,
    anyLoading,
    isPageReady: allLoaded
  };
}

/**
 * Hook for route-based lazy loading
 * Automatically determines stores needed based on current route
 */
export function useRouteLazyLoading(currentRoute: string) {
  const getPageFromRoute = (route: string): string => {
    if (route === '/' || route === '') return 'home';
    if (route.startsWith('/people')) return route.includes('details') ? 'people-details' : 'people';
    if (route.startsWith('/dogs')) return route.includes('details') ? 'dog-details' : 'dogs';
    if (route.startsWith('/shows')) return 'shows';
    if (route.startsWith('/show/')) return 'show-details';
    if (route.startsWith('/admin/templates')) return 'admin-templates';
    if (route.startsWith('/admin')) return 'admin-dashboard';
    if (route.startsWith('/secretary')) return 'secretary';
    if (route.startsWith('/judge')) return 'judge';
    return 'unknown';
  };

  const pageName = getPageFromRoute(currentRoute);
  return usePageStores(pageName);
}