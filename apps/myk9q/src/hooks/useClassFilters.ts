/**
 * useClassFilters Hook
 *
 * Manages class list filtering, searching, and sorting state with memoized results.
 * Extracts ~100 lines of filtering logic from ClassList.tsx.
 *
 * Features:
 * - Filter by status (pending/completed/favorites)
 * - Search across multiple fields
 * - Sort by class order, element, or level
 * - Search UI collapse state
 * - Memoized filtered results for performance
 *
 * Dependencies:
 * - classFilterUtils (Phase 1)
 * - Novice class grouping logic (optional)
 */

import { useState, useMemo, useCallback } from 'react';
import { filterAndSortClasses, type ClassFilter, type ClassSortOrder } from '../utils/classFilterUtils';
import type { ClassEntry } from '../utils/classFilterUtils';

export interface UseClassFiltersOptions {
  /**
   * Classes to filter and sort
   */
  classes: ClassEntry[];

  /**
   * Optional function to group classes before filtering
   * (e.g., grouping Novice A/B classes together)
   */
  groupClasses?: (classes: ClassEntry[]) => ClassEntry[];

  /**
   * Initial filter state
   */
  initialFilter?: ClassFilter;

  /**
   * Initial sort order
   */
  initialSortOrder?: ClassSortOrder;

  /**
   * Initial search term
   */
  initialSearchTerm?: string;

  /**
   * Initial search collapsed state
   */
  initialSearchCollapsed?: boolean;
}

export interface UseClassFiltersReturn {
  // Filter state
  combinedFilter: ClassFilter;
  setCombinedFilter: (filter: ClassFilter) => void;

  // Search state
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isSearchCollapsed: boolean;
  setIsSearchCollapsed: (collapsed: boolean) => void;

  // Sort state
  sortOrder: ClassSortOrder;
  setSortOrder: (order: ClassSortOrder) => void;

  // Filtered results
  filteredClasses: ClassEntry[];

  // Utility methods
  clearSearch: () => void;
  resetFilters: () => void;
}

/**
 * Custom hook for managing class list filtering, searching, and sorting
 *
 * Consolidates the filtering logic from ClassList.tsx (lines 69-71, 765-856).
 * Provides memoized filtered results and clean state management.
 *
 * @param options - Configuration options
 * @returns Filter state and methods
 *
 * @example
 * ```typescript
 * const {
 *   combinedFilter,
 *   setCombinedFilter,
 *   searchTerm,
 *   setSearchTerm,
 *   sortOrder,
 *   setSortOrder,
 *   filteredClasses,
 *   clearSearch
 * } = useClassFilters({
 *   classes,
 *   groupClasses: groupNoviceClassesCached,
 *   initialFilter: 'pending'
 * });
 * ```
 */
export function useClassFilters(options: UseClassFiltersOptions): UseClassFiltersReturn {
  const {
    classes,
    groupClasses,
    initialFilter = 'pending',
    initialSortOrder = 'class_order',
    initialSearchTerm = '',
    initialSearchCollapsed = true,
  } = options;

  // Filter state
  const [combinedFilter, setCombinedFilter] = useState<ClassFilter>(initialFilter);

  // Search state
  const [searchTerm, setSearchTerm] = useState<string>(initialSearchTerm);
  const [isSearchCollapsed, setIsSearchCollapsed] = useState<boolean>(initialSearchCollapsed);

  // Sort state
  const [sortOrder, setSortOrder] = useState<ClassSortOrder>(initialSortOrder);

  // Memoized filtered and sorted classes
  const filteredClasses = useMemo(() => {
    // Apply optional grouping first (e.g., Novice A/B grouping)
    const classesToFilter = groupClasses ? groupClasses(classes) : classes;

    // Use utility function for filtering and sorting
    return filterAndSortClasses(classesToFilter, {
      filter: combinedFilter,
      searchTerm,
      sortOrder,
    });
  }, [classes, groupClasses, combinedFilter, searchTerm, sortOrder]);

  // Utility: Clear search
  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  // Utility: Reset all filters to initial state
  const resetFilters = useCallback(() => {
    setCombinedFilter(initialFilter);
    setSearchTerm(initialSearchTerm);
    setSortOrder(initialSortOrder);
    setIsSearchCollapsed(initialSearchCollapsed);
  }, [initialFilter, initialSearchTerm, initialSortOrder, initialSearchCollapsed]);

  return {
    // Filter state
    combinedFilter,
    setCombinedFilter,

    // Search state
    searchTerm,
    setSearchTerm,
    isSearchCollapsed,
    setIsSearchCollapsed,

    // Sort state
    sortOrder,
    setSortOrder,

    // Filtered results
    filteredClasses,

    // Utility methods
    clearSearch,
    resetFilters,
  };
}
