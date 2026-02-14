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

export interface LayoutShift extends PerformanceEntry {
  value: number;
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
