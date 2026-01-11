/**
 * ShowDataProvider - Context provider for show-specific data scoping
 * 
 * This provider creates isolated data contexts for individual shows,
 * ensuring that components only load and work with data relevant to
 * the current show context. This prevents memory bloat and improves
 * performance when working with multiple shows.
 * 
 * Features:
 * - Automatic data scoping based on active show
 * - Role-based data filtering
 * - Lazy loading of show-specific data
 * - Automatic cleanup on show context change
 * - Memory-efficient data boundaries
 */

/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getDataScopeForRole, applyRoleDataFilter } from '@/services/data-scoping/role-profiles';
import { logger } from '@/services/LoggingService';
import type { DataScope } from '@/services/data-scoping/role-profiles';

interface ShowDataContextValue {
  /** Current active show ID */
  activeShowId: string | null;
  /** Current user role for data scoping */
  userRole: string;
  /** Current user ID for filtering */
  userId: string | null;
  /** Data scope configuration for current role */
  dataScope: DataScope;
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Error state if data loading fails */
  error: string | null;
  /** Set the active show context */
  setActiveShow: (showId: string | null) => void;
  /** Load data for current show context */
  loadShowData: () => Promise<void>;
  /** Clear all show-specific data */
  clearShowData: () => void;
  /** Get filtered data for current role and show */
  getFilteredData: <T>(data: T[], dataType: string) => T[];
  /** Check if current role has access to specific data */
  hasAccess: (dataType: string, operation: 'read' | 'write' | 'delete') => boolean;
}

const ShowDataContext = createContext<ShowDataContextValue | null>(null);

interface ShowDataProviderProps {
  children: React.ReactNode;
  /** Default user role */
  defaultRole?: string;
  /** Default user ID */
  defaultUserId?: string;
  /** Whether to auto-load data on show change */
  autoLoad?: boolean;
}

export function ShowDataProvider({ 
  children, 
  defaultRole = 'exhibitor',
  defaultUserId,
  autoLoad = true 
}: ShowDataProviderProps) {
  const [activeShowId, setActiveShowId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState(defaultRole);
  const [userId, setUserId] = useState<string | null>(defaultUserId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get data scope for current role
  const dataScope = useMemo(() => getDataScopeForRole(userRole), [userRole]);

  // Store references to loaded data for cleanup
  const [loadedStores, setLoadedStores] = useState<Set<string>>(new Set());

  /**
   * Set active show and optionally load data
   */
  const setActiveShow = useCallback(async (showId: string | null) => {
    // Clear previous show data if switching shows
    if (activeShowId && showId !== activeShowId) {
      logger.debug('Clearing show data for stores', 'show-data', { storeCount: loadedStores.size });

      loadedStores.forEach(async (storeName) => {
        try {
          const storeModule = await import(`@/store/${storeName}.ts`);
          const useStore = storeModule[`use${storeName.charAt(0).toUpperCase() + storeName.slice(1)}`];

          if (useStore) {
            const store = useStore.getState();
            if (store.clearShowData && typeof store.clearShowData === 'function') {
              store.clearShowData();
            }
          }
        } catch (error) {
          logger.warn('Failed to clear store', 'show-data', { storeName }, error as Error);
        }
      });

      setLoadedStores(new Set());
    }

    setActiveShowId(showId);
    setError(null);

    // Auto-load data for new show if enabled - will be handled by useEffect
  }, [activeShowId, loadedStores]);

  /**
   * Load show-specific data based on current role and show
   */
  const loadShowData = useCallback(async () => {
    if (!activeShowId) {
      logger.warn('Cannot load show data: no active show set', 'show-data');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Load critical stores immediately
      const criticalStorePromises = dataScope.criticalStores.map(async (storeName) => {
        try {
          // Dynamic import of store
          const storeModule = await import(`@/store/${storeName}.ts`);
          const useStore = storeModule[`use${storeName.charAt(0).toUpperCase() + storeName.slice(1)}`];
          
          if (useStore) {
            // Initialize store if it has a load method
            const store = useStore.getState();
            if (store.loadShowData && typeof store.loadShowData === 'function') {
              await store.loadShowData(activeShowId, userRole, userId);
            }
            
            setLoadedStores(prev => new Set(prev).add(storeName));
            logger.debug('Loaded critical store', 'show-data', { storeName });
          }
        } catch (error) {
          logger.warn('Failed to load critical store', 'show-data', { storeName }, error as Error);
        }
      });

      await Promise.all(criticalStorePromises);

      logger.info('Show data loaded', 'show-data', { activeShowId, userRole });
      
      // Preload lazy stores in background with lower priority
      setTimeout(() => {
        dataScope.lazyStores.forEach(async (storeName) => {
          try {
            const storeModule = await import(`@/store/${storeName}.ts`);
            const useStore = storeModule[`use${storeName.charAt(0).toUpperCase() + storeName.slice(1)}`];
            
            if (useStore) {
              const store = useStore.getState();
              if (store.loadShowData && typeof store.loadShowData === 'function') {
                await store.loadShowData(activeShowId, userRole, userId);
              }
              
              setLoadedStores(prev => new Set(prev).add(storeName));
              logger.debug('Lazy loaded store', 'show-data', { storeName });
            }
          } catch (error) {
            logger.warn('Failed to lazy load store', 'show-data', { storeName }, error as Error);
          }
        });
      }, 100);

    } catch (error) {
      logger.error('Failed to load show data', 'show-data', {}, error as Error);
      setError(error instanceof Error ? error.message : 'Failed to load show data');
    } finally {
      setIsLoading(false);
    }
  }, [activeShowId, dataScope, userRole, userId]);

  /**
   * Clear all show-specific data to free memory
   */
  const clearShowData = useCallback(() => {
    logger.debug('Clearing show data for stores', 'show-data', { storeCount: loadedStores.size });

    loadedStores.forEach(async (storeName) => {
      try {
        const storeModule = await import(`@/store/${storeName}.ts`);
        const useStore = storeModule[`use${storeName.charAt(0).toUpperCase() + storeName.slice(1)}`];

        if (useStore) {
          const store = useStore.getState();
          if (store.clearShowData && typeof store.clearShowData === 'function') {
            store.clearShowData();
          }
        }
      } catch (error) {
        logger.warn('Failed to clear store', 'show-data', { storeName }, error as Error);
      }
    });

    setLoadedStores(new Set());
    setError(null);
  }, [loadedStores]);

  /**
   * Get filtered data for current role and show context
   */
  const getFilteredData = useCallback(<T,>(data: T[], dataType: string): T[] => {
    return applyRoleDataFilter(data, userRole, dataType, userId || undefined, activeShowId || undefined);
  }, [userRole, userId, activeShowId]);

  /**
   * Check if current role has access to specific data
   */
  const hasAccess = useCallback((_dataType: string, _operation: 'read' | 'write' | 'delete'): boolean => {
    // Import the access control function
    // This would be implemented based on your existing RBAC system
    void _dataType; // Mark as intentionally unused
    void _operation; // Mark as intentionally unused
    return true; // Placeholder - implement actual access control
  }, []);

  // Auto-load data when show changes (if autoLoad is enabled)
  useEffect(() => {
    if (activeShowId && autoLoad) {
      loadShowData();
    }
  }, [activeShowId, autoLoad, loadShowData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearShowData();
    };
  }, [clearShowData]);

  // Update user role and reload data if needed
  useEffect(() => {
    // Get user role from auth context or local storage
    const storedRole = localStorage.getItem('userRole');
    const storedUserId = localStorage.getItem('userId');
    
    if (storedRole && storedRole !== userRole) {
      setUserRole(storedRole);
    }
    
    if (storedUserId && storedUserId !== userId) {
      setUserId(storedUserId);
    }
  }, [userRole, userId]);

  const contextValue: ShowDataContextValue = {
    activeShowId,
    userRole,
    userId,
    dataScope,
    isLoading,
    error,
    setActiveShow,
    loadShowData,
    clearShowData,
    getFilteredData,
    hasAccess,
  };

  return (
    <ShowDataContext.Provider value={contextValue}>
      {children}
    </ShowDataContext.Provider>
  );
}

/**
 * Hook to use show data context
 */
export function useShowData() {
  const context = useContext(ShowDataContext);
  if (!context) {
    throw new Error('useShowData must be used within a ShowDataProvider');
  }
  return context;
}

/**
 * Hook to get show-scoped data for a specific data type
 */
export function useShowScopedData<T>(data: T[], dataType: string) {
  const { getFilteredData, isLoading, error } = useShowData();
  
  const filteredData = useMemo(() => {
    return getFilteredData(data, dataType);
  }, [data, dataType, getFilteredData]);

  return {
    data: filteredData,
    isLoading,
    error,
  };
}

/**
 * Hook to check data access permissions
 */
export function useDataAccess() {
  const { hasAccess, userRole, activeShowId } = useShowData();
  
  return {
    hasAccess,
    userRole,
    activeShowId,
    canRead: (dataType: string) => hasAccess(dataType, 'read'),
    canWrite: (dataType: string) => hasAccess(dataType, 'write'),
    canDelete: (dataType: string) => hasAccess(dataType, 'delete'),
  };
}

/**
 * HOC to wrap components with show data context
 */
export function withShowData<P extends object>(
  Component: React.ComponentType<P>,
  options: Partial<ShowDataProviderProps> = {}
) {
  return function WrappedComponent(props: P) {
    return (
      <ShowDataProvider {...options}>
        <Component {...props} />
      </ShowDataProvider>
    );
  };
}