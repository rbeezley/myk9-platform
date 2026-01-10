/**
 * Base class for show-scoped store functionality
 * 
 * Provides common functionality for stores that need to operate within
 * show-specific contexts, including role-based data filtering, pagination,
 * and automatic data cleanup.
 */

import { StateStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { applyRoleDataFilter, getPaginationForRole } from '@/services/data-scoping/role-profiles';

export interface ShowScopedData {
  /** Current active show ID for scoping */
  activeShowId: string | null;
  /** Current user role for data filtering */
  userRole: string | null;
  /** Current user ID for filtering */
  userId: string | null;
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Last time data was loaded */
  lastLoaded: number | null;
  /** Current page for pagination */
  currentPage: number;
  /** Total pages available */
  totalPages: number;
  /** Items per page based on role */
  pageSize: number;
}

export interface ShowScopedActions<T> {
  /** Load data for a specific show and role */
  loadShowData: (showId: string, userRole: string, userId?: string) => Promise<void>;
  /** Clear show-specific data */
  clearShowData: () => void;
  /** Set active show context */
  setShowContext: (showId: string | null, userRole: string, userId?: string) => void;
  /** Get filtered data based on current role and context */
  getFilteredData: () => T[];
  /** Load next page of data */
  loadNextPage: () => Promise<void>;
  /** Load specific page */
  loadPage: (page: number) => Promise<void>;
  /** Refresh current data */
  refreshData: () => Promise<void>;
}

/**
 * Create show-scoped store state with default values
 */
export function createShowScopedState(): ShowScopedData {
  return {
    activeShowId: null,
    userRole: null,
    userId: null,
    isLoading: false,
    error: null,
    lastLoaded: null,
    currentPage: 1,
    totalPages: 1,
    pageSize: 50,
  };
}

/**
 * Create show-scoped actions for a store
 */
export function createShowScopedActions<T>(
  dataType: string,
  loadDataFn: (showId: string, userRole: string, userId?: string, page?: number, pageSize?: number) => Promise<{ data: T[], totalPages: number }>,
  setDataFn: (data: T[]) => void,
  getAllDataFn: () => T[]
): Partial<ShowScopedActions<T>> {
  
  return {
    loadShowData: async (showId: string, userRole: string, userId?: string) => {
      // eslint-disable-next-line prefer-rest-params
      const state = arguments[3] as ShowScopedData; // Pass state as 4th argument
      // eslint-disable-next-line prefer-rest-params
      const setState = arguments[4] as (updates: Partial<ShowScopedData>) => void; // Pass setState as 5th argument
      
      setState({ 
        isLoading: true, 
        error: null,
        activeShowId: showId,
        userRole,
        userId: userId || null,
        pageSize: getPaginationForRole(userRole, dataType),
      });

      try {
        const result = await loadDataFn(showId, userRole, userId, 1, state.pageSize);
        
        setDataFn(result.data);
        setState({ 
          isLoading: false,
          lastLoaded: Date.now(),
          currentPage: 1,
          totalPages: result.totalPages,
        });

      } catch (error) {
        console.error(`Failed to load ${dataType} data:`, error);
        setState({ 
          isLoading: false, 
          error: error instanceof Error ? error.message : `Failed to load ${dataType} data` 
        });
      }
    },

    clearShowData: () => {
      // eslint-disable-next-line prefer-rest-params
      const setState = arguments[0] as (updates: Partial<ShowScopedData>) => void;
      
      setDataFn([]);
      setState({
        activeShowId: null,
        userRole: null,
        userId: null,
        isLoading: false,
        error: null,
        lastLoaded: null,
        currentPage: 1,
        totalPages: 1,
      });

    },

    setShowContext: (showId: string | null, userRole: string, userId?: string) => {
      // eslint-disable-next-line prefer-rest-params
      const setState = arguments[3] as (updates: Partial<ShowScopedData>) => void;
      
      setState({
        activeShowId: showId,
        userRole,
        userId: userId || null,
        pageSize: showId ? getPaginationForRole(userRole, dataType) : 50,
      });
    },

    getFilteredData: () => {
      // eslint-disable-next-line prefer-rest-params
      const state = arguments[0] as ShowScopedData;
      const allData = getAllDataFn();
      
      if (!state.userRole || !state.activeShowId) {
        return allData;
      }

      return applyRoleDataFilter(
        allData, 
        state.userRole, 
        dataType, 
        state.userId || undefined,
        state.activeShowId
      );
    },

    loadNextPage: async () => {
      // eslint-disable-next-line prefer-rest-params
      const state = arguments[0] as ShowScopedData;
      
      if (state.currentPage < state.totalPages) {
        // eslint-disable-next-line prefer-rest-params
        await arguments[2](state.currentPage + 1); // Call loadPage
      }
    },

    loadPage: async (page: number) => {
      // eslint-disable-next-line prefer-rest-params
      const state = arguments[1] as ShowScopedData;
      // eslint-disable-next-line prefer-rest-params
      const setState = arguments[2] as (updates: Partial<ShowScopedData>) => void;
      
      if (!state.activeShowId || !state.userRole) {
        return;
      }

      setState({ isLoading: true, error: null });

      try {
        const result = await loadDataFn(state.activeShowId, state.userRole, state.userId || undefined, page, state.pageSize);
        
        setDataFn(result.data);
        setState({ 
          isLoading: false,
          currentPage: page,
          totalPages: result.totalPages,
          lastLoaded: Date.now(),
        });
      } catch (error) {
        console.error(`Failed to load page ${page}:`, error);
        setState({ 
          isLoading: false, 
          error: error instanceof Error ? error.message : `Failed to load page ${page}` 
        });
      }
    },

    refreshData: async () => {
      // eslint-disable-next-line prefer-rest-params
      const state = arguments[0] as ShowScopedData;
      // eslint-disable-next-line prefer-rest-params
      const loadShowData = arguments[1] as ShowScopedActions<T>['loadShowData'];
      
      if (state.activeShowId && state.userRole) {
        await loadShowData!(state.activeShowId, state.userRole, state.userId || undefined);
      }
    },
  };
}

/**
 * Create storage configuration for show-scoped stores
 */
export function createShowScopedStorage(storeName: string): StateStorage {
  return getOptimalStorage(`show-scoped-${storeName}`);
}

/**
 * Utility function to check if data needs refresh based on age
 */
export function shouldRefreshData(lastLoaded: number | null, maxAgeMs: number = 5 * 60 * 1000): boolean {
  if (!lastLoaded) return true;
  return Date.now() - lastLoaded > maxAgeMs;
}

/**
 * Create pagination info object
 */
export function createPaginationInfo(currentPage: number, totalPages: number, pageSize: number, totalItems: number) {
  return {
    currentPage,
    totalPages,
    pageSize,
    totalItems,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    startItem: (currentPage - 1) * pageSize + 1,
    endItem: Math.min(currentPage * pageSize, totalItems),
  };
}

/**
 * Helper to create mock paginated data for development
 */
export function mockPaginatedData<T>(
  allData: T[],
  page: number,
  pageSize: number
): { data: T[], totalPages: number } {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  
  return {
    data: allData.slice(startIndex, endIndex),
    totalPages: Math.ceil(allData.length / pageSize),
  };
}