/**
 * Class Filtering Utilities
 *
 * Centralized utilities for filtering, sorting, and counting classes.
 * Eliminates ~90 lines of duplicated filtering logic across ClassList and ClassFilters.
 *
 * Used for:
 * - Class list filtering by status (pending/completed/favorites)
 * - Class list search across multiple fields
 * - Class list sorting by various orders
 * - Tab count calculations
 */

import { getClassDisplayStatus } from './statusUtils';
import type { ClassEntry as BaseClassEntry } from './statusUtils';
import { getLevelSortOrder } from '../lib/utils';

/**
 * Extended ClassEntry type with filtering and sorting fields
 */
export interface ClassEntry extends BaseClassEntry {
  class_name: string;
  element: string;
  level: string;
  section: string;
  class_order: number;
  judge_name: string;
  is_favorite: boolean;
  briefing_time?: string | null;
  break_until?: string | null;
  start_time?: string | null;
}

/**
 * Filter type for class lists
 */
export type ClassFilter = 'pending' | 'favorites' | 'completed';

/**
 * Sort order for class lists
 */
export type ClassSortOrder = 'class_order' | 'element_level' | 'level_element';

/**
 * Options for filtering and sorting classes
 */
export interface FilterOptions {
  /** Filter by status or favorites */
  filter?: ClassFilter;
  /** Search term to match against class properties */
  searchTerm?: string;
  /** Sort order for the class list */
  sortOrder?: ClassSortOrder;
}

/**
 * Class counts by filter type
 */
export interface ClassCounts {
  pending: number;
  favorites: number;
  completed: number;
  total: number;
}

/**
 * Filter classes by status, favorites, and search term
 *
 * Consolidates the filtering logic from ClassList.tsx (lines 765-796).
 * Handles:
 * - Status filtering (pending/completed)
 * - Favorites filtering
 * - Search across class name, element, level, judge, and section
 *
 * @param classes - Array of class entries to filter
 * @param options - Filtering options (filter type, search term)
 * @returns Filtered array of class entries
 *
 * @example
 * ```typescript
 * // Filter pending classes
 * const pending = filterClasses(classes, { filter: 'pending' });
 *
 * // Search for "snooker" classes
 * const snooker = filterClasses(classes, { searchTerm: 'snooker' });
 *
 * // Combined filter and search
 * const results = filterClasses(classes, {
 *   filter: 'favorites',
 *   searchTerm: 'master'
 * });
 * ```
 */
export function filterClasses(
  classes: ClassEntry[],
  options: FilterOptions = {}
): ClassEntry[] {
  const { filter, searchTerm } = options;

  return classes.filter((classEntry) => {
    // Use the same logic as getClassDisplayStatus to respect manual status
    const displayStatus = getClassDisplayStatus(classEntry);
    const isCompleted = displayStatus === 'completed';

    // Filter by status/favorites
    if (filter === 'pending' && isCompleted) return false;
    if (filter === 'completed' && !isCompleted) return false;
    if (filter === 'favorites' && !classEntry.is_favorite) return false;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesClassName = classEntry.class_name.toLowerCase().includes(searchLower);
      const matchesElement = classEntry.element.toLowerCase().includes(searchLower);
      const matchesLevel = classEntry.level.toLowerCase().includes(searchLower);
      const matchesJudge = classEntry.judge_name.toLowerCase().includes(searchLower);
      const matchesSection =
        classEntry.section && classEntry.section !== '-'
          ? classEntry.section.toLowerCase().includes(searchLower)
          : false;

      if (
        !matchesClassName &&
        !matchesElement &&
        !matchesLevel &&
        !matchesJudge &&
        !matchesSection
      ) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort classes by the specified order
 *
 * Consolidates the sorting logic from ClassList.tsx (lines 798-853).
 * Supports three sort orders:
 * - class_order: Default show order, then element → level → section
 * - element_level: Element first, then level progression
 * - level_element: Level progression first, then element
 *
 * @param classes - Array of class entries to sort
 * @param sortOrder - Desired sort order
 * @returns New sorted array (does not mutate original)
 *
 * @example
 * ```typescript
 * // Sort by class order (default)
 * const sorted = sortClasses(classes, 'class_order');
 *
 * // Sort by element first
 * const byElement = sortClasses(classes, 'element_level');
 *
 * // Sort by level progression
 * const byLevel = sortClasses(classes, 'level_element');
 * ```
 */
export function sortClasses(
  classes: ClassEntry[],
  sortOrder: ClassSortOrder = 'class_order'
): ClassEntry[] {
  // Create a copy to avoid mutating the original array
  const sorted = [...classes];

  sorted.sort((a, b) => {
    switch (sortOrder) {
      case 'class_order':
        // Default: class_order, then element, then level, then section
        if (a.class_order !== b.class_order) {
          return a.class_order - b.class_order;
        }
        if (a.element !== b.element) {
          return a.element.localeCompare(b.element);
        }
        if (a.level !== b.level) {
          const levelOrder = {
            novice: 1,
            advanced: 2,
            excellent: 3,
            master: 4,
            masters: 4,
          };
          const aLevelOrder =
            levelOrder[a.level.toLowerCase() as keyof typeof levelOrder] || 999;
          const bLevelOrder =
            levelOrder[b.level.toLowerCase() as keyof typeof levelOrder] || 999;
          if (aLevelOrder !== bLevelOrder) {
            return aLevelOrder - bLevelOrder;
          }
          return a.level.localeCompare(b.level);
        }
        return a.section.localeCompare(b.section);

      case 'element_level':
        // Sort by element first, then level (standard progression)
        if (a.element !== b.element) {
          return a.element.localeCompare(b.element);
        }
        if (a.level !== b.level) {
          const aLevelOrder = getLevelSortOrder(a.level);
          const bLevelOrder = getLevelSortOrder(b.level);
          if (aLevelOrder !== bLevelOrder) {
            return aLevelOrder - bLevelOrder;
          }
          return a.level.localeCompare(b.level);
        }
        return a.section.localeCompare(b.section);

      case 'level_element':
        // Sort by level first (standard progression), then element
        if (a.level !== b.level) {
          const aLevelOrder = getLevelSortOrder(a.level);
          const bLevelOrder = getLevelSortOrder(b.level);
          if (aLevelOrder !== bLevelOrder) {
            return aLevelOrder - bLevelOrder;
          }
          return a.level.localeCompare(b.level);
        }
        if (a.element !== b.element) {
          return a.element.localeCompare(b.element);
        }
        return a.section.localeCompare(b.section);

      default:
        return 0;
    }
  });

  return sorted;
}

/**
 * Filter and sort classes in one operation
 *
 * Combines filtering and sorting for convenience.
 * This is the main utility function that replaces the useMemo in ClassList.tsx.
 *
 * @param classes - Array of class entries to process
 * @param options - Filtering and sorting options
 * @returns Filtered and sorted array of class entries
 *
 * @example
 * ```typescript
 * const filteredClasses = useMemo(() =>
 *   filterAndSortClasses(classes, {
 *     filter: combinedFilter,
 *     searchTerm: searchTerm,
 *     sortOrder: sortOrder
 *   }),
 *   [classes, combinedFilter, searchTerm, sortOrder]
 * );
 * ```
 */
export function filterAndSortClasses(
  classes: ClassEntry[],
  options: FilterOptions = {}
): ClassEntry[] {
  const { sortOrder = 'class_order', ...filterOptions } = options;

  // First filter
  const filtered = filterClasses(classes, filterOptions);

  // Then sort
  return sortClasses(filtered, sortOrder);
}

/**
 * Calculate class counts for each filter type
 *
 * Consolidates the count logic from ClassFilters.tsx (lines 71-90).
 * Used for displaying tab badges with class counts.
 *
 * @param classes - Array of class entries to count
 * @returns Object with counts for pending, favorites, completed, and total
 *
 * @example
 * ```typescript
 * const counts = getClassCounts(classes);
 * logger.log(`${counts.pending} pending classes`);
 * logger.log(`${counts.favorites} favorite classes`);
 * logger.log(`${counts.completed} completed classes`);
 * ```
 */
export function getClassCounts(classes: ClassEntry[]): ClassCounts {
  const pending = classes.filter((c) => getClassDisplayStatus(c) !== 'completed').length;
  const favorites = classes.filter((c) => c.is_favorite).length;
  const completed = classes.filter((c) => getClassDisplayStatus(c) === 'completed').length;

  return {
    pending,
    favorites,
    completed,
    total: classes.length,
  };
}

/**
 * Check if a class matches a search term
 *
 * Helper function for custom search implementations.
 * Searches across class name, element, level, judge, and section.
 *
 * @param classEntry - Class entry to check
 * @param searchTerm - Search term to match
 * @returns true if the class matches the search term
 *
 * @example
 * ```typescript
 * const matches = classMatchesSearch(classEntry, 'snooker');
 * ```
 */
export function classMatchesSearch(classEntry: ClassEntry, searchTerm: string): boolean {
  if (!searchTerm) return true;

  const searchLower = searchTerm.toLowerCase();
  const matchesClassName = classEntry.class_name.toLowerCase().includes(searchLower);
  const matchesElement = classEntry.element.toLowerCase().includes(searchLower);
  const matchesLevel = classEntry.level.toLowerCase().includes(searchLower);
  const matchesJudge = classEntry.judge_name.toLowerCase().includes(searchLower);
  const matchesSection =
    classEntry.section && classEntry.section !== '-'
      ? classEntry.section.toLowerCase().includes(searchLower)
      : false;

  return (
    matchesClassName || matchesElement || matchesLevel || matchesJudge || matchesSection
  );
}
