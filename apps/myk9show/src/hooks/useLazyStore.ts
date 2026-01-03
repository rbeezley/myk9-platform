import { useEffect, useState } from 'react';
import { useStoreProvider } from '@/providers/StoreProvider';
import { StoreName, getStoreCategory } from '@/store/store-categories';

/**
 * Hook for lazy loading stores only when needed
 * Automatically loads the store on first access and provides loading state
 */
export function useLazyStore(storeName: StoreName) {
  const { loadStore, isStoreLoaded, isStoreLoading, getStoreError } = useStoreProvider();
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

  useEffect(() => {
    if (!hasAttemptedLoad && !isStoreLoaded(storeName) && !isStoreLoading(storeName)) {
      const category = getStoreCategory(storeName);
      console.log(`🔄 Lazy loading ${category} store: ${storeName}`);
      
      setHasAttemptedLoad(true);
      loadStore(storeName).catch(error => {
        console.error(`❌ Failed to lazy load store ${storeName}:`, error);
      });
    }
  }, [storeName, hasAttemptedLoad, isStoreLoaded, isStoreLoading, loadStore]);

  return {
    isLoaded: isStoreLoaded(storeName),
    isLoading: isStoreLoading(storeName),
    error: getStoreError(storeName),
    hasAttemptedLoad
  };
}

/**
 * Hook for lazy loading multiple stores when a feature is accessed
 */
export function useLazyStores(storeNames: StoreName[]) {
  const { loadStore, isStoreLoaded, isStoreLoading } = useStoreProvider();
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

  const allLoaded = storeNames.every(name => isStoreLoaded(name));
  const anyLoading = storeNames.some(name => isStoreLoading(name));

  useEffect(() => {
    if (!hasAttemptedLoad && !allLoaded && !anyLoading) {
      console.log(`🔄 Lazy loading feature stores:`, storeNames);
      
      setHasAttemptedLoad(true);
      
      // Load stores in parallel
      Promise.all(storeNames.map(name => loadStore(name))).catch(error => {
        console.error('❌ Failed to lazy load feature stores:', error);
      });
    }
  }, [storeNames, hasAttemptedLoad, allLoaded, anyLoading, loadStore]);

  return {
    allLoaded,
    anyLoading,
    hasAttemptedLoad
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
    if (route.startsWith('/browse-shows')) return 'shows';
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