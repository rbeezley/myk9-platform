/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { STORE_CATEGORIES, StoreName, StoreCategory } from '@/store/store-categories';
import { storeMetricsCollector } from '@/store/compositions/StoreComposition';

interface StoreLoadingState {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}

interface StoreProviderState {
  stores: Record<StoreName, StoreLoadingState>;
  loadStore: (storeName: StoreName) => Promise<void>;
  loadStoresByCategory: (category: StoreCategory) => Promise<void>;
  preloadStore: (storeName: StoreName) => Promise<void>;
  isStoreLoaded: (storeName: StoreName) => boolean;
  isStoreLoading: (storeName: StoreName) => boolean;
  getStoreError: (storeName: StoreName) => string | null;
}

const StoreContext = createContext<StoreProviderState | null>(null);

export const useStoreProvider = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStoreProvider must be used within a StoreProvider');
  }
  return context;
};

interface StoreProviderProps {
  children: React.ReactNode;
}

/**
 * Store import mappings for dynamic imports
 */
const STORE_IMPORTS: Record<StoreName, () => Promise<Record<string, unknown>>> = {
  // Critical stores
  userStore: () => import('@/store/userStore'),
  dogStore: () => import('@/store/dogStore'),
  showStore: () => import('@/store/showStore'),
  clubStore: () => import('@/store/clubStore'),
  
  // Important stores
  navigationStore: () => import('@/store/navigationStore'),
  searchHistoryStore: () => import('@/store/searchHistoryStore'),
  syncStore: () => import('@/store/syncStore'),
  entryStore: () => import('@/store/entryStore'),
  registrationsStore: () => import('@/store/registrationsStore'),
  
  // Feature-specific stores
  templateStore: () => import('@/store/templateStore'),
  classTemplateStore: () => import('@/store/classTemplateStore'),
  showTemplateStore: () => import('@/store/showTemplateStore'),
  classCreationStore: () => import('@/store/classCreationStore'),
  wizardStore: () => import('@/store/wizardStore'),
  classStore: () => import('@/store/classStore'),
  trialStore: () => import('@/store/trialStore'),
  competitionStore: () => import('@/store/competitionStore'),
  achievementsStore: () => import('@/store/achievementsStore'),
  armbandStore: () => import('@/store/armbandStore'),
  draftStore: () => import('@/store/draftStore'),
  offlineScoringStore: () => import('@/store/offlineScoringStore'),
  pastResultsStore: () => import('@/store/pastResultsStore'),
  searchAnalyticsStore: () => import('@/store/searchAnalyticsStore'),
  showRegistrationStore: () => import('@/store/showRegistrationStore'),
  
  // UI-specific stores
  dogSidebarStore: () => import('@/store/dogSidebarStore'),
  userSidebarStore: () => import('@/store/userSidebarStore'),
};

export const StoreProvider: React.FC<StoreProviderProps> = ({ children }) => {
  const [stores, setStores] = useState<Record<StoreName, StoreLoadingState>>(() => {
    // Initialize all stores as not loaded
    const initialState: Record<StoreName, StoreLoadingState> = {} as Record<StoreName, StoreLoadingState>;
    
    Object.keys(STORE_IMPORTS).forEach((storeName) => {
      initialState[storeName as StoreName] = {
        isLoaded: false,
        isLoading: false,
        error: null,
      };
    });
    
    return initialState;
  });

  const loadingPromises = useRef<Record<StoreName, Promise<void>>>({} as Record<StoreName, Promise<void>>);

  const loadStore = useCallback(async (storeName: StoreName): Promise<void> => {
    // Return existing promise if already loading
    const existingPromise = loadingPromises.current[storeName];
    if (existingPromise) {
      return existingPromise;
    }

    // Don't load if already loaded
    if (stores[storeName]?.isLoaded) {
      return;
    }

    // Create loading promise
    const loadingPromise = async () => {
      const startTime = performance.now();
      
      try {
        setStores(prev => ({
          ...prev,
          [storeName]: {
            ...prev[storeName],
            isLoading: true,
            error: null,
          },
        }));

        const loadStartTime = performance.now();
        logger.debug('Loading store', 'store', { storeName });

        // Simplified: Skip complex dependency loading for better performance
        // await optimizedDependencyManager.loadStoreDependencies(storeName, loadStore);

        const storeModule = await STORE_IMPORTS[storeName]();
        
        // Trigger rehydration if the store has persist middleware (non-blocking)
        const storeHookName = `use${storeName.charAt(0).toUpperCase() + storeName.slice(1)}`;
        const storeHook = storeModule[storeHookName];
        
        if (storeHook && typeof storeHook === 'object' && 'persist' in storeHook) {
          const persist = (storeHook as Record<string, { rehydrate?: () => void }>).persist;
          if (persist?.rehydrate) {
            logger.debug('Rehydrating store', 'store', { storeName });
            // Make rehydration non-blocking by not awaiting it
            Promise.resolve().then(() => persist.rehydrate?.()).catch(err => {
              logger.warn('Failed to rehydrate store', 'store', { storeName }, err as Error);
            });
          }
        }

        const loadEndTime = performance.now();
        const loadDuration = loadEndTime - loadStartTime;
        logger.debug('Store loaded', 'store', { storeName, loadDurationMs: loadDuration.toFixed(2) });
        
        setStores(prev => ({
          ...prev,
          [storeName]: {
            isLoaded: true,
            isLoading: false,
            error: null,
          },
        }));

        // Record metrics (development only)
        const loadTime = performance.now() - startTime;
        if (import.meta.env.DEV) {
          storeMetricsCollector.recordLoadTime(storeName, loadTime);
        }

        logger.info('Store loaded successfully', 'store', { storeName, loadTimeMs: loadTime.toFixed(2) });
      } catch (error) {
        logger.error('Failed to load store', 'store', { storeName }, error as Error);
        setStores(prev => ({
          ...prev,
          [storeName]: {
            isLoaded: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        }));
        throw error;
      }
    };

    loadingPromises.current[storeName] = loadingPromise();
    await loadingPromises.current[storeName];
    delete loadingPromises.current[storeName];
  }, [stores]);

  const loadStoresByCategory = async (category: StoreCategory): Promise<void> => {
    const storeNames = STORE_CATEGORIES[category];
    logger.debug('Loading stores by category', 'store', { category, storeCount: storeNames.length });
    const startTime = performance.now();

    // Load stores in parallel for better performance
    await Promise.all(storeNames.map(storeName => loadStore(storeName)));

    const endTime = performance.now();
    logger.info('Category stores loaded', 'store', { category, loadTimeMs: (endTime - startTime).toFixed(2) });
  };

  const preloadStore = async (storeName: StoreName): Promise<void> => {
    // Preload in background without blocking
    loadStore(storeName).catch(error => {
      logger.warn('Failed to preload store', 'store', { storeName }, error as Error);
    });
  };

  const isStoreLoaded = (storeName: StoreName): boolean => {
    return stores[storeName]?.isLoaded ?? false;
  };

  const isStoreLoading = (storeName: StoreName): boolean => {
    return stores[storeName]?.isLoading ?? false;
  };

  const getStoreError = (storeName: StoreName): string | null => {
    return stores[storeName]?.error ?? null;
  };

  // PERFORMANCE OPTIMIZATION: Only load critical stores on app startup
  useEffect(() => {
    logger.info('StoreProvider initialized - aggressive lazy loading enabled', 'store');

    // Load only critical stores immediately (minimal set)
    const loadCriticalStores = async () => {
      const criticalStores = STORE_CATEGORIES.CRITICAL;
      if (criticalStores.length > 0) {
        logger.debug('Loading critical stores', 'store', { count: criticalStores.length, stores: criticalStores });
        await Promise.all(criticalStores.map(store => loadStore(store)));
        logger.info('Critical stores loaded', 'store');
      } else {
        logger.debug('No critical stores to load - maximum performance mode', 'store');
      }
    };

    // Start loading critical stores immediately
    loadCriticalStores().catch(error => {
      logger.error('Failed to load critical stores', 'store', {}, error as Error);
    });
  }, [loadStore]);

  // Disabled preloading for performance - load only when needed
  // useEffect(() => {
  //   const preloadImportantStores = async () => {
  //     try {
  //       await optimizedDependencyManager.loadImportantStores(loadStore);
  //     } catch (error) {
  //       logger.warn('⚠️ Failed to preload important stores:', 'provider', {}, error as Error);
  //     }
  //   };
  //   const timer = setTimeout(preloadImportantStores, 200);
  //   return () => clearTimeout(timer);
  // }, []);

  const contextValue: StoreProviderState = {
    stores,
    loadStore,
    loadStoresByCategory,
    preloadStore,
    isStoreLoaded,
    isStoreLoading,
    getStoreError,
  };

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};