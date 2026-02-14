/**
 * Performance Optimization Hook for myK9Show
 *
 * Barrel re-export module. All types, utilities, and hooks have been
 * extracted into focused modules for maintainability:
 *
 * - performance-optimization-types.ts — Shared interfaces and types
 * - performance-optimization-utils.ts — Utility functions (pagination, search, virtualization)
 * - usePagination.ts — Advanced pagination hook
 * - usePerformanceMetrics.ts — Performance metrics monitoring hook
 * - useMemoryMonitoring.ts — Memory usage monitoring hook
 * - useDebouncedSearch.ts — Debounced search with caching hook
 * - usePerformanceOptimizationHooks.ts — Remaining optimization hooks
 */

// Types
export type {
  PaginationOptions,
  PaginatedResult,
  VirtualizedResult,
  PerformanceMetrics,
  PerformanceConfig,
  UsePaginationOptions,
} from './performance-optimization-types';

// Individual hooks (directly imported by consumers)
export { usePagination } from './usePagination';
export { usePerformanceMetrics } from './usePerformanceMetrics';
export { useMemoryMonitoring } from './useMemoryMonitoring';
export { useDebouncedSearch } from './useDebouncedSearch';

// Remaining hooks
export {
  usePerformanceOptimization,
  useDebounce,
  useThrottle,
  useIntersectionObserver,
  useLazyLoading,
  useImageOptimization,
  useVirtualScrolling,
  useResourcePreloading,
  useBundleOptimization,
  usePerformanceBudget,
  useAdvancedVirtualization,
  useChunkedProcessing,
} from './usePerformanceOptimizationHooks';
