import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { notifications } from '@/lib/notifications';
import { calculateRunOrder } from '@/lib/runOrderUtils';
import type { RunOrderPreset } from '@/lib/runOrderUtils';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

/**
 * Applies a run order preset to all entries in the class.
 * Writes are parallel via Promise.allSettled (matches useRunOrderDrag pattern).
 * On partial failure (some writes succeed, some fail), shows an error toast
 * and re-throws so the calling dialog stays open for retry. Re-applying the
 * same preset overwrites all entries, fixing any partially-written state.
 */
export function useRunOrderPreset(classId: string | undefined, rawEntries: RawEntryRow[]) {
  const [isApplying, setIsApplying] = useState(false);
  const queryClient = useQueryClient();

  const applyPreset = useCallback(
    async (preset: RunOrderPreset): Promise<void> => {
      if (!classId || preset === 'manual') return;

      setIsApplying(true);
      try {
        const updates = calculateRunOrder(rawEntries, preset);
        const results = await Promise.allSettled(
          updates.map(({ id, runOrder }) => replicatedEntriesTable.updateEntry(id, { runOrder }))
        );
        if (results.some(r => r.status === 'rejected')) {
          notifications.error('Failed to set run order');
          throw new Error('Run order update failed');
        }
        await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
      } finally {
        setIsApplying(false);
      }
    },
    [classId, rawEntries, queryClient]
  );

  return { applyPreset, isApplying };
}
