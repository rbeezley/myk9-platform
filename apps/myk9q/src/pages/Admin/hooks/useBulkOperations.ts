/**
 * useBulkOperations Hook
 *
 * Manages bulk operations on selected classes (visibility, self check-in, results release).
 * Handles class selection state and batch update operations.
 *
 * Extracted from CompetitionAdmin.tsx
 */

import { useState, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bulkSetClassVisibility,
  bulkSetClassSelfCheckin,
} from '@/services/resultVisibilityService';
import type { VisibilityPreset } from '@/types/visibility';
import type { ClassInfo } from './useCompetitionAdminData';
import { logger } from '@/utils/logger';

/**
 * Result type for async operations
 */
export interface BulkOperationResult {
  success: boolean;
  error?: string;
  affectedClasses?: string[]; // Array of class descriptions for UI feedback
}

/**
 * Hook return type
 */
export interface UseBulkOperationsReturn {
  // State
  selectedClasses: Set<number>;

  // Selection actions
  setSelectedClasses: (classes: Set<number>) => void;
  toggleClassSelection: (classId: number) => void;
  selectAllClasses: (classes: ClassInfo[]) => void;
  clearSelection: () => void;

  // Bulk operations
  handleBulkSetClassVisibility: (
    preset: VisibilityPreset,
    classes: ClassInfo[],
    adminName: string
  ) => Promise<BulkOperationResult>;
  handleBulkSetClassSelfCheckin: (
    enabled: boolean,
    classes: ClassInfo[],
    adminName: string
  ) => Promise<BulkOperationResult>;
  handleBulkReleaseResults: (
    classes: ClassInfo[],
    adminName: string,
    supabaseClient: SupabaseClient
  ) => Promise<BulkOperationResult>;
}

/**
 * Custom hook for managing bulk operations on selected classes
 *
 * Provides state and methods for:
 * - Class selection management (toggle, select all, clear)
 * - Bulk visibility updates (apply preset to multiple classes)
 * - Bulk self check-in updates (enable/disable for multiple classes)
 * - Bulk results release (release results for multiple classes)
 *
 * **Selection Pattern**: Selected classes are tracked in a Set<number> for O(1) lookups
 * **Batch Operations**: All bulk operations validate selection before proceeding
 * **Error Handling**: Returns result objects with success flag and error messages
 *
 * @returns Bulk operation state and control methods
 *
 * @example
 * ```tsx
 * function CompetitionAdmin() {
 *   const {
 *     selectedClasses,
 *     toggleClassSelection,
 *     handleBulkSetClassVisibility
 *   } = useBulkOperations();
 *
 *   const handleApplyVisibility = async (preset: VisibilityPreset) => {
 *     const result = await handleBulkSetClassVisibility(preset, classes, 'John Doe');
 *     if (result.success) {
 *       logger.log(`Updated ${result.affectedClasses?.length} classes`);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       {classes.map(cls => (
 *         <div key={cls.id}>
 *           <input
 *             type="checkbox"
 *             checked={selectedClasses.has(cls.id)}
 *             onChange={() => toggleClassSelection(cls.id)}
 *           />
 *           {cls.element} - {cls.level}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useBulkOperations(): UseBulkOperationsReturn {
  // State
  const [selectedClasses, setSelectedClasses] = useState<Set<number>>(new Set());

  /**
   * Toggle selection for a single class
   */
  const toggleClassSelection = useCallback((classId: number) => {
    setSelectedClasses(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(classId)) {
        newSelection.delete(classId);
      } else {
        newSelection.add(classId);
      }
      return newSelection;
    });
  }, []);

  /**
   * Select all classes
   */
  const selectAllClasses = useCallback((classes: ClassInfo[]) => {
    setSelectedClasses(new Set(classes.map(c => c.id)));
  }, []);

  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    setSelectedClasses(new Set());
  }, []);

  /**
   * Bulk apply visibility preset to selected classes
   */
  const handleBulkSetClassVisibility = useCallback(async (
    preset: VisibilityPreset,
    classes: ClassInfo[],
    adminName: string
  ): Promise<BulkOperationResult> => {
    if (selectedClasses.size === 0) {
      return {
        success: false,
        error: 'Please select at least one class to apply visibility settings.'
      };
    }

    try {
      const selectedClassDetails = classes
        .filter(cls => selectedClasses.has(cls.id))
        .map(cls => `${cls.element} (${cls.level} • ${cls.section})`);

      await bulkSetClassVisibility(
        Array.from(selectedClasses),
        preset,
        adminName
      );

      setSelectedClasses(new Set());

      return {
        success: true,
        affectedClasses: selectedClassDetails
      };
    } catch (err) {
      logger.error('Error bulk setting class visibility:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update class visibility'
      };
    }
  }, [selectedClasses]);

  /**
   * Bulk set self check-in for selected classes
   */
  const handleBulkSetClassSelfCheckin = useCallback(async (
    enabled: boolean,
    classes: ClassInfo[],
    _adminName: string
  ): Promise<BulkOperationResult> => {
    if (selectedClasses.size === 0) {
      return {
        success: false,
        error: 'Please select at least one class to apply self check-in settings.'
      };
    }

    try {
      const selectedClassDetails = classes
        .filter(cls => selectedClasses.has(cls.id))
        .map(cls => `${cls.element} (${cls.level} • ${cls.section})`);

      await bulkSetClassSelfCheckin(
        Array.from(selectedClasses),
        enabled
      );

      setSelectedClasses(new Set());

      return {
        success: true,
        affectedClasses: selectedClassDetails
      };
    } catch (err) {
      logger.error('Error bulk setting class self check-in:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update class self check-in'
      };
    }
  }, [selectedClasses]);

  /**
   * Bulk release results for selected classes
   */
  const handleBulkReleaseResults = useCallback(async (
    classes: ClassInfo[],
    adminName: string,
    supabaseClient: SupabaseClient
  ): Promise<BulkOperationResult> => {
    if (selectedClasses.size === 0) {
      return {
        success: false,
        error: 'Please select at least one class to release results for.'
      };
    }

    try {
      const selectedClassDetails = classes
        .filter(cls => selectedClasses.has(cls.id))
        .map(cls => `${cls.element} (${cls.level} • ${cls.section})`);

      const updates = Array.from(selectedClasses).map(classId =>
        supabaseClient
          .from('classes')
          .update({
            results_released_by: adminName
          })
          .eq('id', classId)
      );

      await Promise.all(updates);

      setSelectedClasses(new Set());

      return {
        success: true,
        affectedClasses: selectedClassDetails
      };
    } catch (err) {
      logger.error('Error releasing results:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to release results'
      };
    }
  }, [selectedClasses]);

  return {
    // State
    selectedClasses,

    // Selection actions
    setSelectedClasses,
    toggleClassSelection,
    selectAllClasses,
    clearSelection,

    // Bulk operations
    handleBulkSetClassVisibility,
    handleBulkSetClassSelfCheckin,
    handleBulkReleaseResults,
  };
}
