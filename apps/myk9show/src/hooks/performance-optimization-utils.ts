/**
 * Utility functions for performance optimization hooks.
 * Provides data pagination, debounced search creation, virtualization calculations,
 * and default configuration values.
 */

import type {
  PaginationOptions,
  PaginatedResult,
  VirtualizedResult,
  PerformanceConfig,
} from './performance-optimization-types';

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    if (current != null && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

export function paginateData<T>(data: T[], options: PaginationOptions): PaginatedResult<T> {
  const { page, pageSize, sortBy, sortDirection = 'asc', filters = {} } = options;

  let filteredData = data;
  if (Object.keys(filters).length > 0) {
    filteredData = data.filter(item => {
      return Object.entries(filters).every(([key, value]) => {
        if (value === null || value === undefined || value === '') return true;
        const itemValue = getNestedValue(item as Record<string, unknown>, key);
        if (typeof value === 'string' && typeof itemValue === 'string') {
          return itemValue.toLowerCase().includes(value.toLowerCase());
        }
        return itemValue === value;
      });
    });
  }

  if (sortBy) {
    filteredData = [...filteredData].sort((a, b) => {
      const aValue = getNestedValue(a as Record<string, unknown>, sortBy);
      const bValue = getNestedValue(b as Record<string, unknown>, sortBy);
      const aStr = String(aValue ?? '');
      const bStr = String(bValue ?? '');
      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  return {
    data: filteredData.slice(startIndex, endIndex),
    pagination: {
      page,
      pageSize,
      totalPages,
      totalItems,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export function createDebouncedSearch<T>(
  searchFn: (query: string) => Promise<T[]>,
  delay: number = 300
): (query: string) => Promise<T[]> {
  let timeoutId: NodeJS.Timeout | null = null;
  return (query: string): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        try {
          resolve(await searchFn(query));
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  };
}

export function calculateVirtualizedItems<T>(
  data: T[],
  scrollTop: number,
  config: { itemHeight: number; containerHeight: number; overscan: number }
): VirtualizedResult<T> {
  const { itemHeight, containerHeight, overscan } = config;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(data.length - 1, startIndex + visibleCount + overscan * 2);

  return {
    visibleItems: data.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
    totalHeight: data.length * itemHeight,
    scrollTop: startIndex * itemHeight,
  };
}

export const defaultConfig: PerformanceConfig = {
  enableLazyLoading: true,
  enableVirtualization: true,
  enableMemoization: true,
  enableImageOptimization: true,
  enablePreloading: true,
  enablePagination: true,
  enableChunkedProcessing: true,
  debounceDelay: 300,
  throttleDelay: 100,
  intersectionThreshold: 0.1,
  paginationPageSize: 20,
  chunkSize: 100,
};
