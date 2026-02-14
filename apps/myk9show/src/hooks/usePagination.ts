/**
 * Advanced pagination hook for large datasets.
 * Provides sorting, filtering, auto-refresh, and page navigation
 * for paginated data views.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '@/services/LoggingService';
import type { PaginatedResult, UsePaginationOptions } from './performance-optimization-types';
import { paginateData } from './performance-optimization-utils';

export function usePagination<T>(options: UsePaginationOptions) {
  const {
    data,
    page: initialPage = 1,
    pageSize: initialPageSize = 20,
    sortBy,
    sortDirection = 'asc',
    filters = {},
    autoRefresh = false,
    refreshInterval = 30000
  } = options;

  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [currentSortBy, setCurrentSortBy] = useState(sortBy);
  const [currentSortDirection, setCurrentSortDirection] = useState<'asc' | 'desc'>(sortDirection);
  const [currentFilters, setCurrentFilters] = useState(filters);
  const [result, setResult] = useState<PaginatedResult<T> | null>(null);
  const [loading, setLoading] = useState(false);

  // Memoize pagination options
  const paginationOptions = useMemo(() => ({
    page,
    pageSize,
    ...(currentSortBy !== undefined && { sortBy: currentSortBy }),
    sortDirection: currentSortDirection,
    filters: currentFilters
  }), [page, pageSize, currentSortBy, currentSortDirection, currentFilters]);

  // Calculate paginated result
  useEffect(() => {
    if (!data.length) {
      setResult(null);
      return;
    }

    setLoading(true);

    // Use requestAnimationFrame to avoid blocking UI
    const timeoutId = setTimeout(() => {
      try {
        const paginatedResult = paginateData(data, paginationOptions);
        setResult(paginatedResult as PaginatedResult<T>);
      } catch (error) {
        logger.error('Pagination error:', 'hooks', {}, error as Error);
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [data, paginationOptions]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      if (data.length > 0) {
        const paginatedResult = paginateData(data, paginationOptions);
        setResult(paginatedResult as PaginatedResult<T>);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, data, paginationOptions]);

  const goToPage = useCallback((newPage: number) => {
    setPage(Math.max(1, newPage));
  }, []);

  const changePageSize = useCallback((newPageSize: number) => {
    setPageSize(Math.max(1, newPageSize));
    setPage(1); // Reset to first page
  }, []);

  const updateSort = useCallback((field: string, direction?: 'asc' | 'desc') => {
    setCurrentSortBy(field);
    setCurrentSortDirection(direction || (currentSortDirection === 'asc' ? 'desc' : 'asc'));
    setPage(1); // Reset to first page
  }, [currentSortDirection]);

  const updateFilters = useCallback((newFilters: Record<string, unknown>) => {
    setCurrentFilters(newFilters);
    setPage(1); // Reset to first page
  }, []);

  const clearFilters = useCallback(() => {
    setCurrentFilters({});
    setPage(1);
  }, []);

  return {
    result,
    loading,
    page,
    pageSize,
    sortBy: currentSortBy,
    sortDirection: currentSortDirection,
    filters: currentFilters,
    goToPage,
    changePageSize,
    updateSort,
    updateFilters,
    clearFilters,
    hasNextPage: result?.pagination.hasNextPage || false,
    hasPreviousPage: result?.pagination.hasPreviousPage || false,
    totalPages: result?.pagination.totalPages || 0,
    totalItems: result?.pagination.totalItems || 0
  };
}
