import { useCallback, useMemo, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import type { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { changeSecretaryEntryStatus } from '@/services/secretary/entry-workflow';
import {
  executeStatusUndo,
  executeBulkStatusUndo,
  buildStatusUndoToastMessage,
  buildBulkStatusUndoToastMessage,
  type StatusUndoAdapters,
  type BulkStatusUndoItem,
} from '@/services/database/entries/statusUndo';

interface UseEntryStatusUndoProps {
  /** Freshest local entries snapshot — supersession reads through this, not a captured render. */
  entriesRef: MutableRefObject<EntryManagementEntry[]>;
  setEntries: React.Dispatch<React.SetStateAction<EntryManagementEntry[]>>;
  userId?: string | undefined;
}

interface UseEntryStatusUndoResult {
  /** Revert a single entry's status change, with a supersession guard + honest toast. */
  runSingleUndo: (
    entryId: string,
    priorStatus: EntryStatus,
    producedStatus: EntryStatus
  ) => Promise<void>;
  /** Revert a succeeded bulk subset item-by-item, each with its own supersession guard. */
  runBulkUndo: (
    succeeded: EntryManagementEntry[],
    priorById: Map<string, EntryStatus>,
    producedStatus: EntryStatus
  ) => Promise<void>;
}

/**
 * Undo wiring for secretary entry-status changes (design.md decision D6). Kept in
 * its own hook so the forward-change orchestration in useEntryManagementActions
 * stays readable — this owns only the adapters and the result-toast dispatch.
 */
export function useEntryStatusUndo({
  entriesRef,
  setEntries,
  userId,
}: UseEntryStatusUndoProps): UseEntryStatusUndoResult {
  const adapters = useMemo<StatusUndoAdapters>(
    () => ({
      getCurrentEntry: entryId => entriesRef.current.find(e => e.id === entryId),
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
      changeSecretaryStatus: changeSecretaryEntryStatus,
      patchEntries: setEntries,
      ...(userId ? { userId } : {}),
    }),
    [entriesRef, setEntries, userId]
  );

  const runSingleUndo = useCallback(
    async (entryId: string, priorStatus: EntryStatus, producedStatus: EntryStatus) => {
      const outcome = await executeStatusUndo({ entryId, priorStatus, producedStatus }, adapters);
      const { kind, message } = buildStatusUndoToastMessage(outcome);
      toast[kind](message);
    },
    [adapters]
  );

  const runBulkUndo = useCallback(
    async (
      succeeded: EntryManagementEntry[],
      priorById: Map<string, EntryStatus>,
      producedStatus: EntryStatus
    ) => {
      const items = succeeded.reduce<BulkStatusUndoItem[]>((acc, entry) => {
        const priorStatus = priorById.get(entry.id);
        if (priorStatus !== undefined) acc.push({ entryId: entry.id, priorStatus });
        return acc;
      }, []);
      if (items.length === 0) return;
      const result = await executeBulkStatusUndo(items, producedStatus, adapters);
      const { kind, message } = buildBulkStatusUndoToastMessage(result);
      toast[kind](message);
    },
    [adapters]
  );

  return { runSingleUndo, runBulkUndo };
}
