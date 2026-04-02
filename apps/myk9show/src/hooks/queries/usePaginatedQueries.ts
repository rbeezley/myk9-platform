// Paginated query hooks for large result sets
// Phase 3.2: Advanced Query Optimizations

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState, useCallback } from 'react';
import { cacheStrategies } from '@/lib/queryClient';
import { usePaginationConfig } from '@/lib/queryOptimizations';
import { getAllDogs, getAllUsers, getAllShows } from '@/services/database/queries';
import { useCurrentPersonId } from '@/hooks/useCurrentPersonId';

// Enhanced pagination utilities
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// Paginated dogs query
export const usePaginatedDogs = (options: PaginationOptions = {}) => {
  const paginationConfig = usePaginationConfig();
  const personId = useCurrentPersonId();

  const {
    page = 1,
    pageSize = paginationConfig.dogs.pageSize,
    sortBy = 'name',
    sortOrder = 'asc',
    filters = {},
  } = options;

  return useQuery({
    queryKey: ['dogs', 'paginated', personId, page, pageSize, sortBy, sortOrder, filters],
    queryFn: async (): Promise<PaginatedResult<unknown>> => {
      // For now, simulate pagination with client-side logic
      // In production, this would be server-side pagination
      const { data: allDogs, error } = await getAllDogs(personId!);
      if (error) throw error;

      if (!allDogs) {
        return {
          data: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        };
      }

      // Apply filters
      let filteredDogs = allDogs;
      if (Object.keys(filters).length > 0) {
        filteredDogs = allDogs.filter(dog => {
          return Object.entries(filters).every(([key, value]) => {
            const dogValue = (dog as Record<string, unknown>)[key];
            if (typeof value === 'string' && typeof dogValue === 'string') {
              return dogValue.toLowerCase().includes(value.toLowerCase());
            }
            return dogValue === value;
          });
        });
      }

      // Apply sorting
      filteredDogs.sort((a, b) => {
        const aValue = (a as Record<string, unknown>)[sortBy];
        const bValue = (b as Record<string, unknown>)[sortBy];

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return sortOrder === 'desc' ? -comparison : comparison;
        }

        if ((aValue as number) < (bValue as number)) return sortOrder === 'desc' ? 1 : -1;
        if ((aValue as number) > (bValue as number)) return sortOrder === 'desc' ? -1 : 1;
        return 0;
      });

      // Apply pagination
      const total = filteredDogs.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedData = filteredDogs.slice(startIndex, endIndex);

      return {
        data: paginatedData,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    },
    enabled: !!personId,
    ...cacheStrategies.moderate,

    // Optimize pagination UX
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });
};

// Infinite scroll dogs query
export const useInfiniteDogs = (options: Omit<PaginationOptions, 'page'> = {}) => {
  const paginationConfig = usePaginationConfig();
  const personId = useCurrentPersonId();

  const {
    pageSize = paginationConfig.dogs.pageSize,
    sortBy = 'name',
    sortOrder = 'asc',
    filters = {},
  } = options;

  return useInfiniteQuery({
    queryKey: ['dogs', 'infinite', personId, pageSize, sortBy, sortOrder, filters],
    queryFn: async ({ pageParam = 1 }): Promise<PaginatedResult<unknown>> => {
      const { data: allDogs, error } = await getAllDogs(personId!);
      if (error) throw error;

      if (!allDogs) {
        return {
          data: [],
          total: 0,
          page: pageParam,
          pageSize,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        };
      }

      // Apply the same filtering and sorting logic as paginated query
      let filteredDogs = allDogs;
      if (Object.keys(filters).length > 0) {
        filteredDogs = allDogs.filter(dog => {
          return Object.entries(filters).every(([key, value]) => {
            const dogValue = (dog as Record<string, unknown>)[key];
            if (typeof value === 'string' && typeof dogValue === 'string') {
              return dogValue.toLowerCase().includes(value.toLowerCase());
            }
            return dogValue === value;
          });
        });
      }

      filteredDogs.sort((a, b) => {
        const aValue = (a as Record<string, unknown>)[sortBy];
        const bValue = (b as Record<string, unknown>)[sortBy];

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return sortOrder === 'desc' ? -comparison : comparison;
        }

        if ((aValue as number) < (bValue as number)) return sortOrder === 'desc' ? 1 : -1;
        if ((aValue as number) > (bValue as number)) return sortOrder === 'desc' ? -1 : 1;
        return 0;
      });

      const total = filteredDogs.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (pageParam - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedData = filteredDogs.slice(startIndex, endIndex);

      return {
        data: paginatedData,
        total,
        page: pageParam,
        pageSize,
        totalPages,
        hasNextPage: pageParam < totalPages,
        hasPreviousPage: pageParam > 1,
      };
    },
    initialPageParam: 1,
    getNextPageParam: lastPage => {
      return lastPage.hasNextPage ? lastPage.page + 1 : undefined;
    },
    getPreviousPageParam: firstPage => {
      return firstPage.hasPreviousPage ? firstPage.page - 1 : undefined;
    },
    enabled: !!personId,
    ...cacheStrategies.moderate,
    refetchOnWindowFocus: false,
  });
};

// Paginated users query
export const usePaginatedUsers = (options: PaginationOptions = {}) => {
  const paginationConfig = usePaginationConfig();

  const {
    page = 1,
    pageSize = paginationConfig.users.pageSize,
    sortBy = 'name',
    sortOrder = 'asc',
    filters = {},
  } = options;

  return useQuery({
    queryKey: ['users', 'paginated', page, pageSize, sortBy, sortOrder, filters],
    queryFn: async (): Promise<PaginatedResult<unknown>> => {
      const { data: allUsers, error } = await getAllUsers();
      if (error) throw error;

      if (!allUsers) {
        return {
          data: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        };
      }

      // Apply filtering and sorting (same pattern as dogs)
      let filteredUsers = allUsers;
      if (Object.keys(filters).length > 0) {
        filteredUsers = allUsers.filter(user => {
          return Object.entries(filters).every(([key, value]) => {
            const userValue = (user as Record<string, unknown>)[key];
            if (typeof value === 'string' && typeof userValue === 'string') {
              return userValue.toLowerCase().includes(value.toLowerCase());
            }
            return userValue === value;
          });
        });
      }

      filteredUsers.sort((a, b) => {
        const aValue = (a as Record<string, unknown>)[sortBy];
        const bValue = (b as Record<string, unknown>)[sortBy];

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return sortOrder === 'desc' ? -comparison : comparison;
        }

        if ((aValue as number) < (bValue as number)) return sortOrder === 'desc' ? 1 : -1;
        if ((aValue as number) > (bValue as number)) return sortOrder === 'desc' ? -1 : 1;
        return 0;
      });

      const total = filteredUsers.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedData = filteredUsers.slice(startIndex, endIndex);

      return {
        data: paginatedData,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    },
    ...cacheStrategies.moderate,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });
};

// Paginated shows query
export const usePaginatedShows = (options: PaginationOptions = {}) => {
  const paginationConfig = usePaginationConfig();

  const {
    page = 1,
    pageSize = paginationConfig.shows.pageSize,
    sortBy = 'date',
    sortOrder = 'asc',
    filters = {},
  } = options;

  return useQuery({
    queryKey: ['shows', 'paginated', page, pageSize, sortBy, sortOrder, filters],
    queryFn: async (): Promise<PaginatedResult<unknown>> => {
      const { data: allShows, error } = await getAllShows();
      if (error) throw error;

      if (!allShows) {
        return {
          data: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        };
      }

      // Apply filtering and sorting (same pattern)
      let filteredShows = allShows;
      if (Object.keys(filters).length > 0) {
        filteredShows = allShows.filter(show => {
          return Object.entries(filters).every(([key, value]) => {
            const showValue = (show as Record<string, unknown>)[key];
            if (typeof value === 'string' && typeof showValue === 'string') {
              return showValue.toLowerCase().includes(value.toLowerCase());
            }
            return showValue === value;
          });
        });
      }

      filteredShows.sort((a, b) => {
        const aValue = (a as Record<string, unknown>)[sortBy];
        const bValue = (b as Record<string, unknown>)[sortBy];

        // Special handling for dates
        if (sortBy === 'date' && typeof aValue === 'string' && typeof bValue === 'string') {
          const aDate = new Date(aValue);
          const bDate = new Date(bValue);
          const comparison = aDate.getTime() - bDate.getTime();
          return sortOrder === 'desc' ? -comparison : comparison;
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return sortOrder === 'desc' ? -comparison : comparison;
        }

        if ((aValue as number) < (bValue as number)) return sortOrder === 'desc' ? 1 : -1;
        if ((aValue as number) > (bValue as number)) return sortOrder === 'desc' ? -1 : 1;
        return 0;
      });

      const total = filteredShows.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedData = filteredShows.slice(startIndex, endIndex);

      return {
        data: paginatedData,
        total,
        page,
        pageSize,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    },
    ...cacheStrategies.moderate,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });
};

// Combined pagination hook with advanced features
export const useAdvancedPagination = (
  entityType: 'dogs' | 'users' | 'shows',
  options: PaginationOptions & {
    searchTerm?: string;
    enableInfiniteScroll?: boolean;
  } = {}
) => {
  const { enableInfiniteScroll, ...paginationOptions } = options;

  // Call all hooks unconditionally (required by React)
  const infiniteDogs = useInfiniteDogs(paginationOptions);
  const paginatedDogs = usePaginatedDogs(paginationOptions);
  const paginatedUsers = usePaginatedUsers(paginationOptions);
  const paginatedShows = usePaginatedShows(paginationOptions);

  // Select the appropriate result based on options
  let baseQuery;
  if (enableInfiniteScroll && entityType === 'dogs') {
    baseQuery = infiniteDogs;
  } else {
    switch (entityType) {
      case 'dogs':
        baseQuery = paginatedDogs;
        break;
      case 'users':
        baseQuery = paginatedUsers;
        break;
      case 'shows':
        baseQuery = paginatedShows;
        break;
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  // Additional utilities for pagination management
  const paginationUtils = useMemo(() => {
    const isInfinite = 'hasNextPage' in baseQuery && 'fetchNextPage' in baseQuery;

    return {
      isInfiniteQuery: isInfinite,

      // Get flattened data for infinite queries
      getFlattenedData: () => {
        if (isInfinite) {
          const infiniteQuery = baseQuery as ReturnType<typeof useInfiniteDogs>;
          return infiniteQuery.data?.pages.flatMap(page => page.data) || [];
        }
        const regularQuery = baseQuery as ReturnType<typeof usePaginatedDogs>;
        return regularQuery.data?.data || [];
      },

      // Get total count
      getTotalCount: () => {
        if (isInfinite) {
          const infiniteQuery = baseQuery as ReturnType<typeof useInfiniteDogs>;
          return infiniteQuery.data?.pages[0]?.total || 0;
        }
        const regularQuery = baseQuery as ReturnType<typeof usePaginatedDogs>;
        return regularQuery.data?.total || 0;
      },

      // Navigation helpers
      canGoNext: () => {
        if (isInfinite) {
          const infiniteQuery = baseQuery as ReturnType<typeof useInfiniteDogs>;
          return infiniteQuery.hasNextPage;
        }
        const regularQuery = baseQuery as ReturnType<typeof usePaginatedDogs>;
        return regularQuery.data?.hasNextPage || false;
      },

      canGoPrevious: () => {
        if (isInfinite) {
          const infiniteQuery = baseQuery as ReturnType<typeof useInfiniteDogs>;
          return infiniteQuery.hasPreviousPage;
        }
        const regularQuery = baseQuery as ReturnType<typeof usePaginatedDogs>;
        return regularQuery.data?.hasPreviousPage || false;
      },
    };
  }, [baseQuery]);

  return {
    ...baseQuery,
    ...paginationUtils,
  };
};

// Utility hook for managing pagination state
export const usePaginationState = (initialPage = 1, initialPageSize = 20) => {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, unknown>>({});

  const resetPagination = useCallback(() => {
    setPage(1);
  }, []);

  const updateFilter = useCallback(
    (key: string, value: unknown) => {
      setFilters(prev => ({ ...prev, [key]: value }));
      resetPagination();
    },
    [resetPagination]
  );

  const removeFilter = useCallback(
    (key: string) => {
      setFilters(prev => {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      });
      resetPagination();
    },
    [resetPagination]
  );

  const clearFilters = useCallback(() => {
    setFilters({});
    resetPagination();
  }, [resetPagination]);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    resetPagination();
  }, [resetPagination]);

  const changeSortBy = useCallback(
    (newSortBy: string) => {
      setSortBy(newSortBy);
      setSortOrder('asc');
      resetPagination();
    },
    [resetPagination]
  );

  return {
    // State
    page,
    pageSize,
    sortBy,
    sortOrder,
    filters,

    // Actions
    setPage,
    setPageSize: (newSize: number) => {
      setPageSize(newSize);
      resetPagination();
    },
    setSortBy: changeSortBy,
    setSortOrder,
    toggleSortOrder,
    setFilters,
    updateFilter,
    removeFilter,
    clearFilters,
    resetPagination,

    // Computed
    hasFilters: Object.keys(filters).length > 0,
    filterCount: Object.keys(filters).length,
  };
};
