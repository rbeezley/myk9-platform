import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { classKeys, useUpdateClassMutation } from '@/hooks/queries/useClassesDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { useConnectionHint } from '@/hooks/useConnectionHint';
import { mapClassInputToUpdate } from '@/services/mappers/classMappers';
import { replicatedClassesTable } from '@/services/replication';

/** A selected class, as bulk Set entry fee reads it. */
export interface BulkFeeClass {
  id: string;
  name: string | null;
}

/**
 * Bulk "Set entry fee" in Select classes (MYK9-1931): the class edit form's own write
 * (`useUpdateClassMutation` with `mapClassInputToUpdate`, online-only like that form's Save),
 * once per selected class, through `useBulkDispatch` like bulk status and Assign judge.
 *
 * `fee` is the class's own fee; `null` returns the classes to the show's fee, stored as an
 * empty `entry_fee`, never 0 (zero is never a price). Entries already made keep their fee.
 */
export function useBulkClassEntryFee() {
  const queryClient = useQueryClient();
  const connectionHint = useConnectionHint();
  const { mutateAsync } = useUpdateClassMutation();
  const getLabel = useCallback((cls: BulkFeeClass) => cls.name || 'Untitled Class', []);
  const dispatch = useBulkDispatch<BulkFeeClass>({ getLabel });

  const setFee = useCallback(
    async (classes: readonly BulkFeeClass[], fee: number | null): Promise<boolean> => {
      if (classes.length === 0) return false;
      if (connectionHint) {
        toast.error(`Can't change the entry fee: ${connectionHint.toLowerCase()}.`);
        return false;
      }
      const updates = mapClassInputToUpdate({ entryFee: fee !== null && fee > 0 ? fee : 0 });
      // The schedule reads the replica, which this online write does not touch: re-sync it once
      // the batch settles (as the class form's Save does for one class), not once per class.
      const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: classKeys.all });
        try {
          await replicatedClassesTable.sync('');
        } catch {
          // The write landed; background sync converges the replica.
        }
      };
      // A toast's "Retry failed" runs after the batch settled, so each retried class refreshes.
      let settled = false;
      const outcome = await dispatch.run([...classes], async cls => {
        await mutateAsync({ id: cls.id, updates });
        if (settled) await refresh();
      });
      settled = true;
      if (outcome !== null && outcome.succeeded.length > 0) await refresh();
      return outcome !== null && outcome.failed.length === 0;
    },
    [connectionHint, dispatch, mutateAsync, queryClient]
  );

  return { setFee, busy: dispatch.isBusy };
}
