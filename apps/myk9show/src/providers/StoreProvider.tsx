/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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
        console.log(`📦 Loading store: ${storeName}`);
        
        // Simplified: Skip complex dependency loading for better performance
        // await optimizedDependencyManager.loadStoreDependencies(storeName, loadStore);
        
        const storeModule = await STORE_IMPORTS[storeName]();
        
        // Trigger rehydration if the store has persist middleware (non-blocking)
        const storeHookName = `use${storeName.charAt(0).toUpperCase() + storeName.slice(1)}`;
        const storeHook = storeModule[storeHookName];
        
        if (storeHook && typeof storeHook === 'object' && 'persist' in storeHook) {
          const persist = (storeHook as Record<string, { rehydrate?: () => void }>).persist;
          if (persist?.rehydrate) {
            console.log(`🔄 Rehydrating store: ${storeName}`);
            // Make rehydration non-blocking by not awaiting it
            Promise.resolve().then(() => persist.rehydrate?.()).catch(err => {
              console.warn(`Failed to rehydrate ${storeName}:`, err);
            });
          }
        }

        const loadEndTime = performance.now();
        const loadDuration = loadEndTime - loadStartTime;
        console.log(`✅ Store ${storeName} loaded in ${loadDuration.toFixed(2)}ms`);
        
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

        console.log(`✅ Store loaded: ${storeName} (${loadTime.toFixed(2)}ms)`);
      } catch (error) {
        console.error(`❌ Failed to load store ${storeName}:`, error);
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
    console.log(`📦 Loading ${category} stores (${storeNames.length} stores) in parallel...`);
    const startTime = performance.now();
    
    // Load stores in parallel for better performance
    await Promise.all(storeNames.map(storeName => loadStore(storeName)));
    
    const endTime = performance.now();
    console.log(`✅ ${category} stores loaded in ${(endTime - startTime).toFixed(2)}ms`);
  };

  const preloadStore = async (storeName: StoreName): Promise<void> => {
    // Preload in background without blocking
    loadStore(storeName).catch(error => {
      console.warn(`⚠️ Failed to preload store ${storeName}:`, error);
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
    console.log('🚀 StoreProvider initialized - aggressive lazy loading enabled');
    
    // Load only critical stores immediately (minimal set)
    const loadCriticalStores = async () => {
      const criticalStores = STORE_CATEGORIES.CRITICAL;
      if (criticalStores.length > 0) {
        console.log(`⚡ Loading ${criticalStores.length} critical stores:`, criticalStores);
        await Promise.all(criticalStores.map(store => loadStore(store)));
        console.log('✅ Critical stores loaded');
      } else {
        console.log('⚡ No critical stores to load - maximum performance mode');
      }
    };

    // Start loading critical stores immediately
    loadCriticalStores().catch(error => {
      console.error('❌ Failed to load critical stores:', error);
    });
  }, [loadStore]);

  // Disabled preloading for performance - load only when needed
  // useEffect(() => {
  //   const preloadImportantStores = async () => {
  //     try {
  //       await optimizedDependencyManager.loadImportantStores(loadStore);
  //     } catch (error) {
  //       console.warn('⚠️ Failed to preload important stores:', error);
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