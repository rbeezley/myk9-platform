/**
 * Shared types and interfaces for performance optimization hooks.
 * Used across usePagination, usePerformanceMetrics, useMemoryMonitoring,
 * useDebouncedSearch, and other performance-related hooks.
 */

export interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface VirtualizedResult<T> {
  visibleItems: T[];
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  scrollTop: number;
}

export interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  queryTime: number;
  totalRecords: number;
  timestamp: number;
}

export interface PerformanceConfig {
  enableLazyLoading: boolean;
  enableVirtualization: boolean;
  enableMemoization: boolean;
  enableImageOptimization: boolean;
  enablePreloading: boolean;
  enablePagination: boolean;
  enableChunkedProcessing: boolean;
  debounceDelay: number;
  throttleDelay: number;
  intersectionThreshold: number;
  paginationPageSize: number;
  chunkSize: number;
}

export interface UsePaginationOptions<T = unknown> extends PaginationOptions {
  data: T[];
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface LayoutShift extends PerformanceEntry {
  value: number;
}
