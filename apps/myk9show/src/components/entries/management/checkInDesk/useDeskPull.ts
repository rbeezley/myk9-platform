import { useState } from 'react';
import { toast } from 'sonner';
import { showUndoToast } from '@/lib/undoToast';
import { getUserFriendlyError } from '@/utils/errorMessages';
import {
  scratchShowMapEntry,
  undoShowMapScratch,
} from '@/features/show-map/showMapActionMutations';
import type { PeopleRosterClassRow } from './peopleRoster';

/**
 * Pulled on the Check-in desk is the real Pull (owner, MYK9-1749): the entry is stored as pulled
 * (scratched) and goes to refund review, the same write as Entries' Pull. It asks first
 * (`PullAtShowDialog`) and offers Undo afterwards, which puts the entry and its check-in back.
 */
export function useDeskPull(onRefreshEntries?: () => void | Promise<void>) {
  const [pullRow, setPullRow] = useState<PeopleRosterClassRow | null>(null);
  const [isPulling, setIsPulling] = useState(false);

  const refresh = async () => {
    try {
      await onRefreshEntries?.();
    } catch {
      // The write landed; the next read shows it.
    }
  };

  const confirmPull = async (reason: string | undefined) => {
    if (!pullRow || isPulling) return;
    const row = pullRow;
    setIsPulling(true);
    try {
      const undoInput = await scratchShowMapEntry(
        row.entryId,
        reason,
        'Pulled at the check-in desk'
      );
      setPullRow(null);
      await refresh();
      showUndoToast({
        message: `${row.dogName} pulled from ${row.className}`,
        onUndo: () => {
          void undoShowMapScratch(undoInput)
            .then(refresh)
            .catch(error => toast.error(getUserFriendlyError(error)));
        },
      });
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsPulling(false);
    }
  };

  return {
    pullRow,
    isPulling,
    requestPull: setPullRow,
    cancelPull: () => setPullRow(null),
    confirmPull,
  };
}
