import { useCallback } from 'react';
import { useOptimisticUpdate } from '../../../hooks/useOptimisticUpdate';
import { updateEntryCheckinStatus, resetEntryScore, markInRing, markEntryCompleted } from '../../../services/entryService';
import { Entry as _Entry } from '../../../stores/entryStore';
import type { ReplicatedEntriesTable } from '../../../services/replication/tables/ReplicatedEntriesTable';
import { logger } from '@/utils/logger';

/**
 * Shared hook for entry list actions with optimistic updates.
 * Handles check-in status changes, reset score, and in-ring status.
 */
export const useEntryListActions = (_onRefresh: () => void) => {
  // Optimistic update hook for check-in status changes
  const { update, isSyncing, hasError } = useOptimisticUpdate();

  /**
   * Update entry check-in status with optimistic updates
   */
  const handleStatusChange = useCallback(
    async (entryId: number, newStatus: 'no-status' | 'checked-in' | 'conflict' | 'pulled' | 'at-gate' | 'come-to-gate') => {
      // 🚀 OFFLINE-FIRST: Update replication cache immediately
      // This creates an optimistic update that works offline and persists across refreshes
      try {
const { getReplicationManager } = await import('../../../services/replication');
        const manager = getReplicationManager();
        if (manager) {
          const entriesTable = manager.getTable('entries');
          if (entriesTable && 'updateEntryStatus' in entriesTable) {
            // Type narrowing confirms method exists; cast through unknown for type safety
            await (entriesTable as unknown as ReplicatedEntriesTable).updateEntryStatus(String(entryId), newStatus, true);
          }
        }
      } catch (error) {
        logger.error('❌ Could not update replication cache optimistically:', error);
      }

      // Use the optimistic update hook for retry logic and error handling
      await update({
        optimisticData: { entryId, status: newStatus },
        serverUpdate: async () => {
          await updateEntryCheckinStatus(entryId, newStatus);
          return { entryId, status: newStatus };
        },
        onSuccess: () => {}, // Real-time subscriptions will clear the pending change
        onError: (error) => logger.error('Status update failed:', error)
      });
    },
    [update]
  );

  /**
   * Reset entry score with optimistic update
   */
  const handleResetScore = useCallback(
    async (entryId: number) => {
      // Sync with server in background (silently fails if offline)
      try {
        await resetEntryScore(entryId);
        // Real-time subscription will update the cache when database confirms
      } catch (error) {
        logger.error('Error resetting score in background:', error);
        // Don't throw - offline-first means this is transparent
      }
    },
    []
  );

  /**
   * Toggle in-ring status
   */
  const handleToggleInRing = useCallback(
    async (entryId: number, currentInRing: boolean) => {
      const newInRing = !currentInRing;

      // Sync with server in background (silently fails if offline)
      try {
        await markInRing(entryId, newInRing);
        // Real-time subscription will update the cache when database confirms
      } catch (error) {
        logger.error('Error toggling in-ring status in background:', error);
        // Don't throw - offline-first means this is transparent
      }
    },
    []
  );

  /**
   * Mark entry as in-ring (for manual ring management)
   * @param entryId - Entry to mark as in-ring
   * @param currentStatus - Entry's current status (optional, for restoration on cancel)
   */
  const handleMarkInRing = useCallback(
    async (entryId: number, currentStatus?: _Entry['status']) => {
      // Sync with server in background (silently fails if offline)
      try {
        // Pass currentStatus so it can be restored if scoresheet is canceled
        await markInRing(entryId, true, currentStatus);
        // Real-time subscription will update the cache when database confirms
      } catch (error) {
        logger.error('Error marking entry in-ring in background:', error);
        // Don't throw - offline-first means this is transparent
      }
    },
    []
  );

  /**
   * Mark entry as completed without full score (for manual ring management)
   */
  const handleMarkCompleted = useCallback(
    async (entryId: number) => {
      // Sync with server in background (silently fails if offline)
      try {
        await markEntryCompleted(entryId);
        // Real-time subscription will update the cache when database confirms
      } catch (error) {
        logger.error('Error marking entry completed in background:', error);
        // Don't throw - offline-first means this is transparent
      }
    },
    []
  );

  /**
   * Batch status update (for future use)
   */
  const handleBatchStatusUpdate = useCallback(
    async (entryIds: number[], newStatus: 'no-status' | 'checked-in' | 'conflict' | 'pulled' | 'at-gate' | 'come-to-gate') => {
      // Sync with server in background (silently fails if offline)
      try {
        await Promise.all(
          entryIds.map((id) => updateEntryCheckinStatus(id, newStatus))
        );
        // Real-time subscriptions will update the cache when database confirms
      } catch (error) {
        logger.error('Error in batch update in background:', error);
        // Don't throw - offline-first means this is transparent
      }
    },
    []
  );

  return {
    handleStatusChange,
    handleResetScore,
    handleToggleInRing,
    handleMarkInRing,
    handleMarkCompleted,
    handleBatchStatusUpdate,
    isSyncing,
    hasError
  };
};
