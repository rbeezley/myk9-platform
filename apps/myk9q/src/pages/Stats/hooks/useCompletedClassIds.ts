/**
 * useCompletedClassIds Hook
 *
 * Fetches IDs of completed classes for the current show.
 * Used to filter time-based statistics for non-admin/judge users,
 * ensuring fair competition in unknown-hide searches.
 */

import { useState, useEffect } from 'react';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import { logger } from '@/utils/logger';
import type { Trial } from '@/services/replication/tables/ReplicatedTrialsTable';
import type { Class } from '@/services/replication/tables/ReplicatedClassesTable';

interface UseCompletedClassIdsOptions {
  showId: string | undefined;
  enabled: boolean;  // Set to false for admin/judge who don't need filtering
}

/**
 * Returns a Set of class IDs for completed classes in the current show.
 *
 * @param options - Configuration options
 * @returns Set of completed class IDs
 */
export function useCompletedClassIds({ showId, enabled }: UseCompletedClassIdsOptions): Set<number> {
  const [completedClassIds, setCompletedClassIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchCompletedClasses = async () => {
      // Skip if not enabled (admin/judge) or no show context
      if (!enabled || !showId) return;

      try {
        const manager = await ensureReplicationManager();
        const classesTable = manager.getTable('classes');
        const trialsTable = manager.getTable('trials');

        if (classesTable && trialsTable) {
          const allTrials = await trialsTable.getAll() as Trial[];
          const allClasses = await classesTable.getAll() as Class[];

          // Filter to current show's trials
          const showTrialIds = new Set(
            allTrials
              .filter(t => String(t.show_id) === String(showId))
              .map(t => String(t.id))
          );

          // Get IDs of completed classes
          const completedIds = new Set(
            allClasses
              .filter(c => showTrialIds.has(String(c.trial_id)) && c.class_status === 'completed')
              .map(c => Number(c.id))
          );

          setCompletedClassIds(completedIds);
          logger.log(`📊 Stats: Found ${completedIds.size} completed classes for filtering`);
        }
      } catch (error) {
        logger.error('Error fetching completed class IDs:', error);
      }
    };

    fetchCompletedClasses();
  }, [showId, enabled]);

  return completedClassIds;
}
