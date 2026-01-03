/**
 * useClassSelection Hook
 *
 * Manages class selection state for bulk operations in Competition Admin.
 * Extracts ~60 lines of selection logic from CompetitionAdmin.tsx.
 *
 * Features:
 * - Toggle individual class selection
 * - Select all classes
 * - Clear selection
 * - Check if a class is selected
 * - Get count of selected classes
 *
 * Dependencies: None
 */

import { useState, useCallback } from 'react';

export interface UseClassSelectionOptions {
  /**
   * Optional initial set of selected class IDs
   */
  initialSelection?: Set<number>;

  /**
   * Optional callback when selection changes
   */
  onSelectionChange?: (selectedIds: Set<number>) => void;
}

export interface UseClassSelectionReturn {
  /**
   * Set of selected class IDs
   */
  selectedClasses: Set<number>;

  /**
   * Toggle selection for a class
   */
  toggleClass: (classId: number) => void;

  /**
   * Select all classes by IDs
   */
  selectAll: (classIds: number[]) => void;

  /**
   * Clear all selections
   */
  clearSelection: () => void;

  /**
   * Check if a class is selected
   */
  isSelected: (classId: number) => boolean;

  /**
   * Get count of selected classes
   */
  selectionCount: number;

  /**
   * Check if any classes are selected
   */
  hasSelection: boolean;
}

/**
 * Custom hook for managing class selection state
 *
 * Consolidates the selection logic from CompetitionAdmin.tsx (lines 42, 242-260).
 * Provides a clean API for bulk operations on classes.
 *
 * @param options - Configuration options
 * @returns Selection state and methods
 *
 * @example
 * ```typescript
 * const {
 *   selectedClasses,
 *   toggleClass,
 *   selectAll,
 *   clearSelection,
 *   isSelected,
 *   selectionCount
 * } = useClassSelection();
 *
 * // Toggle selection
 * toggleClass(123);
 *
 * // Select all classes
 * selectAll(classes.map(c => c.id));
 *
 * // Clear selection
 * clearSelection();
 *
 * // Check if selected
 * if (isSelected(123)) {
 *   // ...
 * }
 * ```
 */
export function useClassSelection(
  options: UseClassSelectionOptions = {}
): UseClassSelectionReturn {
  const { initialSelection = new Set(), onSelectionChange } = options;

  const [selectedClasses, setSelectedClasses] = useState<Set<number>>(initialSelection);

  // Toggle class selection
  const toggleClass = useCallback(
    (classId: number) => {
      setSelectedClasses((prev) => {
        const newSelection = new Set(prev);
        if (newSelection.has(classId)) {
          newSelection.delete(classId);
        } else {
          newSelection.add(classId);
        }

        // Notify callback if provided
        if (onSelectionChange) {
          onSelectionChange(newSelection);
        }

        return newSelection;
      });
    },
    [onSelectionChange]
  );

  // Select all classes
  const selectAll = useCallback(
    (classIds: number[]) => {
      const newSelection = new Set(classIds);
      setSelectedClasses(newSelection);

      // Notify callback if provided
      if (onSelectionChange) {
        onSelectionChange(newSelection);
      }
    },
    [onSelectionChange]
  );

  // Clear selection
  const clearSelection = useCallback(() => {
    const emptySet = new Set<number>();
    setSelectedClasses(emptySet);

    // Notify callback if provided
    if (onSelectionChange) {
      onSelectionChange(emptySet);
    }
  }, [onSelectionChange]);

  // Check if a class is selected
  const isSelected = useCallback(
    (classId: number): boolean => {
      return selectedClasses.has(classId);
    },
    [selectedClasses]
  );

  // Get selection count
  const selectionCount = selectedClasses.size;

  // Check if any classes are selected
  const hasSelection = selectionCount > 0;

  return {
    selectedClasses,
    toggleClass,
    selectAll,
    clearSelection,
    isSelected,
    selectionCount,
    hasSelection,
  };
}
