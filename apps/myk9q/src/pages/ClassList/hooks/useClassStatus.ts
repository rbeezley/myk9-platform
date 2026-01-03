/**
 * useClassStatus Hook
 *
 * Manages class status changes with and without time values.
 * Handles status updates, paired class synchronization, and database updates.
 *
 * Extracted from ClassList.tsx
 */

import { useState, useCallback } from 'react';
import type { ClassEntry } from './useClassListData';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';

/**
 * Result type for status operations
 */
export interface StatusOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Dependencies for status operations - grouped to reduce parameter count
 */
export interface StatusDependencies {
  classes: ClassEntry[];
  setClasses: React.Dispatch<React.SetStateAction<ClassEntry[]>>;
  supabaseClient: SupabaseClient;
  refetch: () => void | Promise<void>;
}

/**
 * Hook return type
 */
export interface UseClassStatusReturn {
  // State
  statusDialogOpen: boolean;
  selectedClassForStatus: ClassEntry | null;

  // Actions
  setStatusDialogOpen: (open: boolean) => void;
  setSelectedClassForStatus: (classEntry: ClassEntry | null) => void;
  handleStatusChange: (
    classId: number,
    status: ClassEntry['class_status'],
    deps: StatusDependencies
  ) => Promise<StatusOperationResult>;
  handleStatusChangeWithTime: (
    classId: number,
    status: ClassEntry['class_status'],
    timeValue: string,
    deps: StatusDependencies
  ) => Promise<StatusOperationResult>;
}

/**
 * Custom hook for managing class status changes
 *
 * Provides methods for:
 * - **Status Dialog State**: Open/close status selection dialog
 * - **Status Changes**: Update class status without time value
 * - **Timed Status Changes**: Update status with associated time (briefing, break, start)
 * - **Paired Classes**: Automatically syncs status for paired Novice A/B classes
 * - **Optimistic Updates**: Updates local state immediately for better UX
 * - **Error Recovery**: Reverts to server state on update failures
 *
 * **Paired Class Logic**: For combined Novice classes, updates both A and B sections
 * **Database Mapping**: Converts 'no-status' to null for database storage
 * **Time Columns**: Maps time values to appropriate columns (briefing_time, break_until, start_time)
 *
 * @returns Class status state and control methods
 *
 * @example
 * ```tsx
 * function ClassList() {
 *   const {
 *     statusDialogOpen,
 *     selectedClassForStatus,
 *     setStatusDialogOpen,
 *     setSelectedClassForStatus,
 *     handleStatusChange
 *   } = useClassStatus();
 *
 *   // Create deps object once
 *   const statusDeps = { classes, setClasses, supabaseClient: supabase, refetch };
 *
 *   const handleComplete = async (classId: number) => {
 *     const result = await handleStatusChange(classId, 'completed', statusDeps);
 *     if (!result.success) {
 *       logger.error(result.error);
 *     }
 *   };
 *
 *   return (
 *     <StatusDialog
 *       open={statusDialogOpen}
 *       onClose={() => {
 *         setStatusDialogOpen(false);
 *         setSelectedClassForStatus(null);
 *       }}
 *       classEntry={selectedClassForStatus}
 *     />
 *   );
 * }
 * ```
 */
export function useClassStatus(): UseClassStatusReturn {
  // State
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedClassForStatus, setSelectedClassForStatus] = useState<ClassEntry | null>(null);

  /**
   * Handle status change without time value
   * Automatically closes dialog after update
   */
  const handleStatusChange = useCallback(async (
    classId: number,
    status: ClassEntry['class_status'],
    deps: StatusDependencies
  ): Promise<StatusOperationResult> => {
    const { classes, setClasses, supabaseClient, refetch } = deps;

    // Find paired class IDs (for combined Novice A & B)
    const classEntry = classes.find(c => c.id === classId);
    const pairedId = classEntry?.pairedClassId;
    const idsToUpdate = pairedId ? [classId, pairedId] : [classId];

    // Convert 'no-status' to null for database
    const dbStatus = status === 'no-status' ? null : status;
    const updateData = {
      class_status: dbStatus
    };

    // Update local state immediately (optimistic update)
    setClasses(prev => prev.map(c =>
      idsToUpdate.includes(c.id) ? { ...c, class_status: status } : c
    ));

    // Close dialog
    setStatusDialogOpen(false);
    setSelectedClassForStatus(null);

    // Update database
    try {
      const { error } = await supabaseClient
        .from('classes')
        .update(updateData)
        .in('id', idsToUpdate);

      if (error) {
        logger.error('❌ Error updating class status:', error);
        // Revert on error
        await refetch();
        return {
          success: false,
          error: error.message || 'Failed to update class status'
        };
      }

      return { success: true };
    } catch (error) {
      logger.error('💥 Exception updating class status:', error);
      await refetch();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update class status'
      };
    }
  }, []);

  /**
   * Handle status change with associated time value
   * Used for briefing, break, and start_time statuses
   */
  const handleStatusChangeWithTime = useCallback(async (
    classId: number,
    status: ClassEntry['class_status'],
    timeValue: string,
    deps: StatusDependencies
  ): Promise<StatusOperationResult> => {
    const { classes, setClasses, supabaseClient, refetch } = deps;

    // Find paired class IDs
    const classEntry = classes.find(c => c.id === classId);
    const pairedId = classEntry?.pairedClassId;
    const idsToUpdate = pairedId ? [classId, pairedId] : [classId];

    // Convert 'no-status' to null for database
    const dbStatus = status === 'no-status' ? null : status;
    const updateData: {
      class_status: string | null;
      briefing_time?: string;
      break_until?: string;
      start_time?: string;
    } = {
      class_status: dbStatus
    };

    // Map time to appropriate column
    switch (status) {
      case 'briefing':
        updateData.briefing_time = timeValue;
        break;
      case 'break':
        updateData.break_until = timeValue;
        break;
      case 'start_time':
        updateData.start_time = timeValue;
        break;
    }

    // Update local state with both status and time (optimistic update)
    setClasses(prev => prev.map(c => {
      if (idsToUpdate.includes(c.id)) {
        const updatedClass = { ...c, class_status: status };

        // Update time field
        switch (status) {
          case 'briefing':
            updatedClass.briefing_time = timeValue;
            break;
          case 'break':
            updatedClass.break_until = timeValue;
            break;
          case 'start_time':
            updatedClass.start_time = timeValue;
            break;
        }

        return updatedClass;
      }
      return c;
    }));

    // Close dialog
    setStatusDialogOpen(false);
    setSelectedClassForStatus(null);

    // Update database
    try {
      const { error } = await supabaseClient
        .from('classes')
        .update(updateData)
        .in('id', idsToUpdate);

      if (error) {
        logger.error('❌ Error updating class status with time:', error);
        // Revert on error
        await refetch();
        return {
          success: false,
          error: error.message || 'Failed to update class status with time'
        };
      }

      return { success: true };
    } catch (error) {
      logger.error('💥 Exception updating class status:', error);
      await refetch();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update class status with time'
      };
    }
  }, []);

  return {
    // State
    statusDialogOpen,
    selectedClassForStatus,

    // Actions
    setStatusDialogOpen,
    setSelectedClassForStatus,
    handleStatusChange,
    handleStatusChangeWithTime,
  };
}
