/**
 * useClassCompletion - Hook to detect when a class is completed and show celebration
 *
 * Event-driven approach that triggers celebration when:
 * - All entries in the class have been scored
 * - Listens to entry scoring events (works both online and offline)
 * - No polling - only checks when explicitly called after scoring
 *
 * Usage:
 * ```tsx
 * const { CelebrationModal, checkCompletion } = useClassCompletion(classId);
 * // Call checkCompletion() after successfully scoring an entry
 * await submitScore(...);
 * await checkCompletion();
 * return (<>{CelebrationModal}</>);
 * ```
 */

import React, { useState, useCallback, useRef } from 'react';
import { ClassCompletionCelebration } from '@/components/ClassCompletionCelebration';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Entry } from '@/services/replication/tables/ReplicatedEntriesTable';
import type { Class } from '@/services/replication/tables/ReplicatedClassesTable';
import { logger } from '@/utils/logger';

interface UseClassCompletionReturn {
  CelebrationModal: React.ReactElement | null;
  checkCompletion: () => Promise<void>;
}

export function useClassCompletion(classId: string | undefined): UseClassCompletionReturn {
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{
    className: string;
    totalDogs: number;
    qualifiedDogs: number;
    actualStartTime: string;
    actualEndTime: string;
  } | null>(null);

  // Use ref to prevent showing celebration multiple times
  const hasShownCelebrationRef = useRef(false);

  /**
   * Check if class is completed and show celebration if appropriate.
   * This should be called after scoring each entry.
   */
  const checkCompletion = useCallback(async () => {
    if (!classId || hasShownCelebrationRef.current) return;

    try {
      const replicationManager = await ensureReplicationManager();
      const classesTable = replicationManager.getTable<Class>('classes');
      const entriesTable = replicationManager.getTable<Entry>('entries');

      if (!classesTable || !entriesTable) return;

      // Get all entries for this class from IndexedDB
      const allEntries = await entriesTable.getAll();
      const entries = allEntries.filter(entry => entry.class_id === classId);

      if (entries.length === 0) return;

      // Count scored entries
      const scoredEntries = entries.filter(entry => entry.is_scored);

      // Only proceed if ALL entries are scored
      if (scoredEntries.length < entries.length) {
        return; // Not all entries scored yet
      }

      // All entries are scored! Now get class data to check for timestamps
      const classData = await classesTable.get(classId);

      if (!classData) return;

      // In offline mode, actual_start_time and actual_end_time might not be set yet
      // (triggers run on server). Calculate times locally if needed.
      let startTime = classData.actual_start_time;
      let endTime = classData.actual_end_time;

      // Fallback: If timestamps not set, use entry timestamps
      if (!startTime || !endTime) {
        const timestamps = scoredEntries
          .map(e => e.updated_at)
          .filter(Boolean)
          .sort();

        if (timestamps.length > 0) {
          startTime = timestamps[0]!;
          endTime = timestamps[timestamps.length - 1]!;
        } else {
          // No timestamps available, skip celebration
          return;
        }
      }

      // Count qualified dogs (result_status === 'qualified')
      const qualifiedDogs = scoredEntries.filter(
        entry => entry.result_status?.toLowerCase() === 'qualified'
      ).length;

      // Format class name
      const className = `${classData.element} ${classData.level}${classData.section ? ' ' + classData.section : ''}`;

      setCelebrationData({
        className,
        totalDogs: entries.length,
        qualifiedDogs,
        actualStartTime: startTime,
        actualEndTime: endTime,
      });

      setShowCelebration(true);
      hasShownCelebrationRef.current = true;
    } catch (error) {
      logger.error('[useClassCompletion] Error checking class completion:', error);
    }
  }, [classId]);

  const handleCloseCelebration = useCallback(() => {
    setShowCelebration(false);
  }, []);

  const renderCelebrationModal = () => {
    if (!celebrationData || !showCelebration) {
      return null;
    }

    return (
      <ClassCompletionCelebration
        isOpen={showCelebration}
        onClose={handleCloseCelebration}
        className={celebrationData.className}
        totalDogs={celebrationData.totalDogs}
        qualifiedDogs={celebrationData.qualifiedDogs}
        actualStartTime={celebrationData.actualStartTime}
        actualEndTime={celebrationData.actualEndTime}
      />
    );
  };

  return {
    CelebrationModal: renderCelebrationModal(),
    checkCompletion
  };
}
