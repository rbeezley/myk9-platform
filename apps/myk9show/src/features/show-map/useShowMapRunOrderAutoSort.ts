import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import {
  computeShowMapAutoSortAssignments,
  snapshotPriorRunOrders,
  type ShowMapAutoSortAssignment,
  type ShowMapAutoSortKind,
  type ShowMapAutoSortSnapshotItem,
} from './showMapRunOrderAutoSort';

export const AUTO_SORT_UNDO_BANNER_TIMEOUT_MS = 8000;

const SUCCESS_LABELS: Record<ShowMapAutoSortKind, string> = {
  'armband-asc': 'Sorted by armband (ascending)',
  'armband-desc': 'Sorted by armband (descending)',
  'random': 'Run order randomized',
};

export interface ShowMapAutoSortInput {
  classId: string;
  kind: ShowMapAutoSortKind;
  classLabel?: string | undefined;
}

export interface ShowMapAutoSortSnapshot {
  classId: string;
  classLabel?: string | undefined;
  kind: ShowMapAutoSortKind;
  priorOrders: readonly ShowMapAutoSortSnapshotItem[];
}

interface ShowMapAutoSortResult {
  snapshot: ShowMapAutoSortSnapshot;
  failedCount: number;
}

interface UseShowMapRunOrderAutoSortInput {
  showId: string;
}

interface ApplyAssignmentsResult {
  failedCount: number;
}

async function applyAssignments(
  assignments: ShowMapAutoSortAssignment[]
): Promise<ApplyAssignmentsResult> {
  const results = await Promise.allSettled(
    assignments.map(a => replicatedEntriesTable.updateEntry(a.id, { runOrder: a.runOrder }))
  );
  return { failedCount: results.filter(r => r.status === 'rejected').length };
}

export function useShowMapRunOrderAutoSort({ showId }: UseShowMapRunOrderAutoSortInput) {
  const queryClient = useQueryClient();
  const [lastAutoSort, setLastAutoSort] = useState<ShowMapAutoSortSnapshot | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimer = useCallback(() => {
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPendingTimer(), [clearPendingTimer]);

  const invalidateForClass = useCallback(
    (classId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.show(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.classEntries(classId) });
      queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
      queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });
    },
    [queryClient, showId]
  );

  const autoSortMutation = useMutation({
    mutationFn: async (input: ShowMapAutoSortInput): Promise<ShowMapAutoSortResult> => {
      const entries = await replicatedEntriesTable.getEntriesByClass(input.classId);
      if (entries.length < 2) {
        throw new Error('Auto-sort needs at least two entries in this class.');
      }
      const assignments = computeShowMapAutoSortAssignments(entries, input.kind);
      const snapshot: ShowMapAutoSortSnapshot = {
        classId: input.classId,
        ...(input.classLabel !== undefined ? { classLabel: input.classLabel } : {}),
        kind: input.kind,
        priorOrders: snapshotPriorRunOrders(entries),
      };
      const { failedCount } = await applyAssignments(assignments);
      // INTENT: Even on partial failure, return the snapshot so the user keeps
      // an Undo affordance to roll back the writes that did succeed.
      return { snapshot, failedCount };
    },
    onSuccess: ({ snapshot, failedCount }, input) => {
      if (failedCount > 0) {
        toast.warning(
          `Run order partially updated — ${failedCount} ${failedCount === 1 ? 'entry' : 'entries'} could not be saved. Use Undo to roll back.`
        );
      } else {
        toast.success(SUCCESS_LABELS[input.kind]);
      }
      clearPendingTimer();
      setLastAutoSort(snapshot);
      clearTimerRef.current = setTimeout(() => {
        clearTimerRef.current = null;
        setLastAutoSort(null);
      }, AUTO_SORT_UNDO_BANNER_TIMEOUT_MS);
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.classId) invalidateForClass(variables.classId);
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (snapshot: ShowMapAutoSortSnapshot): Promise<void> => {
      // INTENT: Entries whose prior run_order was null must be cleared
      // (not skipped) — otherwise the number auto-sort assigned would
      // survive Undo and the table would lie about the prior state.
      // updateEntry({ runOrder: undefined }) flows through
      // toSupabaseRow's `entry.runOrder ?? null` mapping and clears the
      // column on the server.
      const results = await Promise.allSettled(
        snapshot.priorOrders.map(item =>
          replicatedEntriesTable.updateEntry(item.id, {
            runOrder: item.runOrder === null ? undefined : item.runOrder,
          })
        )
      );
      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) {
        throw new Error(
          `Could not restore ${failedCount} ${failedCount === 1 ? 'entry' : 'entries'} to the prior run order.`
        );
      }
    },
    onMutate: () => {
      // Stop the auto-dismiss the moment the user engages with Undo. If the
      // network call later fails, the banner stays visible so the user can
      // retry instead of having it disappear under them.
      clearPendingTimer();
    },
    onSuccess: () => {
      toast.success('Run order restored');
      setLastAutoSort(null);
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, snapshot) => {
      if (snapshot?.classId) invalidateForClass(snapshot.classId);
    },
  });

  // INTENT: Both writes mutate the same `entries` rows, so we treat them as a
  // single channel — issuing an auto-sort while undo is in flight (or vice
  // versa) would interleave run_order writes and leave `lastAutoSort`
  // pointing at a half-applied state. `isAutoSorting` reflects either path so
  // the dropdown and the Undo button both disable while any write is active.
  const isBusy = autoSortMutation.isPending || undoMutation.isPending;

  return {
    autoSort: (input: ShowMapAutoSortInput) => {
      if (isBusy) return;
      autoSortMutation.mutate(input);
    },
    isAutoSorting: isBusy,
    lastAutoSort,
    undoLastAutoSort: () => {
      if (!lastAutoSort || isBusy) return;
      undoMutation.mutate(lastAutoSort);
    },
    isUndoingAutoSort: undoMutation.isPending,
  };
}

export type ShowMapRunOrderAutoSortControls = ReturnType<typeof useShowMapRunOrderAutoSort>;
