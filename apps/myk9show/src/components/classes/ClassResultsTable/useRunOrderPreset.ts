import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { notifications } from '@/lib/notifications';
import { calculateRunOrder, calculateRunOrderScoped } from '@/lib/runOrderUtils';
import type { RunOrderPreset } from '@/lib/runOrderUtils';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { RunOrderScope, RenumberMode } from '@/components/classes/RunOrderDialog';

/**
 * Applies a run order preset to entries in the class.
 *
 * Supports full-class presets and single-section scoped reorders.
 * Writes are parallel via Promise.allSettled (matches useRunOrderDrag pattern).
 * On partial failure shows an error toast and re-throws so the dialog stays
 * open for retry.
 */
export function useRunOrderPreset(classId: string | undefined, rawEntries: RawEntryRow[]) {
  const [isApplying, setIsApplying] = useState(false);
  const queryClient = useQueryClient();

  const applyPreset = useCallback(
    async (
      preset: RunOrderPreset,
      scope: RunOrderScope = 'all',
      renumberMode: RenumberMode = 'renumber'
    ): Promise<void> => {
      if (!classId || preset === 'manual') return;

      setIsApplying(true);
      try {
        // Map RawEntryRow → RunOrderEntry.
        // RawEntryRow does not currently carry a section column (section lives on
        // the classes table, not entries). We default to null so the preset
        // functions degrade gracefully. If section data is added to the query in
        // the future it will flow through automatically.
        const orderEntries = rawEntries.map(e => ({
          id: e.id,
          armband: e.armband,
          section: null as string | null,
        }));

        const updates =
          scope === 'all'
            ? calculateRunOrder(orderEntries, preset)
            : calculateRunOrderScoped(orderEntries, preset, scope, renumberMode);

        const results = await Promise.allSettled(
          updates.map(({ id, runOrder }) => replicatedEntriesTable.updateEntry(id, { runOrder }))
        );
        if (results.some(r => r.status === 'rejected')) {
          throw new Error('Run order update failed');
        }
        await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
      } catch (err) {
        notifications.error('Failed to set run order');
        throw err;
      } finally {
        setIsApplying(false);
      }
    },
    [classId, rawEntries, queryClient]
  );

  return { applyPreset, isApplying };
}
