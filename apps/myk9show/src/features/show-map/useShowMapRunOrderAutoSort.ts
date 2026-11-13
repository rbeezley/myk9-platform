import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { entryInvalidationKeys } from '@/services/database/entries/invalidation';
import { RUN_ORDER_COPY, ShowDayRefusal, showDayErrorMessage } from './showDayErrorCopy';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import {
  planPresetPlacement,
  type ShowMapAutoSortKind,
  type ShowMapAutoSortSnapshotItem,
} from './showMapRunOrderAutoSort';
import { movePlacement, type PlacementMove } from './runOrderPlacementModel';
import { classPlacementKey, loadClassPlacement } from './classPlacementSource';
import { toPriorSnapshot } from './showMapHandPlacement';

export const AUTO_SORT_UNDO_BANNER_TIMEOUT_MS = 8000;

const SUCCESS_LABELS: Record<ShowMapAutoSortKind, string> = {
  'armband-asc': 'Sorted by armband (ascending)',
  'armband-desc': 'Sorted by armband (descending)',
  random: 'Run order randomized',
};

export interface ShowMapAutoSortInput {
  classId: string;
  kind: ShowMapAutoSortKind;
  classLabel?: string | undefined;
}

interface ShowMapHandPlaceBase {
  classId: string;
  entryId: string;
  entryLabel?: string | undefined;
}

/**
 * Where the dog goes: a 1-based slot among the waiting dogs, or (the drag) the dog it was dropped
 * on. The drop names the dog, never a number, so the slot is resolved against the placement model
 * as the write reads it, and a list that went stale cannot put the dog in the wrong place.
 */
export type ShowMapHandPlaceInput = ShowMapHandPlaceBase &
  ({ toPosition: number } | { overEntryId: string });

export interface ShowMapAutoSortSnapshot {
  classId: string;
  classLabel?: string | undefined;
  kind: ShowMapAutoSortKind | 'hand';
  /** What the success toast says; set for a hand placement. */
  summary?: string | undefined;
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
  assignments: readonly Pick<PlacementMove, 'id' | 'runOrder'>[]
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

  // Returns the placement refresh only. The mutations await it so their
  // controls stay disabled until the panel shows the new order (a second press
  // on stale positions would be rejected as a no-op). The other keys are not
  // awaited: offline their refetches pause, and awaiting one would leave the
  // controls disabled until reconnect. The placement read is a local replica
  // read (networkMode 'always'), so it settles offline too.
  const invalidateForClass = useCallback(
    (classId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.show(showId) });
      queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });
      entryInvalidationKeys({ showId, classId }).forEach(k =>
        queryClient.invalidateQueries({ queryKey: k })
      );
      return queryClient.invalidateQueries({ queryKey: classPlacementKey(showId, classId) });
    },
    [queryClient, showId]
  );

  const announceChange = (
    snapshot: ShowMapAutoSortSnapshot,
    failedCount: number,
    successLabel: string
  ) => {
    if (failedCount > 0) {
      toast.warning(
        `The run order was only partly saved: ${failedCount} ${failedCount === 1 ? 'dog was' : 'dogs were'} not moved. Press Undo to put it back, then try again.`
      );
    } else {
      toast.success(successLabel);
    }
    clearPendingTimer();
    setLastAutoSort(snapshot);
    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      setLastAutoSort(null);
    }, AUTO_SORT_UNDO_BANNER_TIMEOUT_MS);
  };

  const autoSortMutation = useMutation({
    // Local replicated write (queued offline); the default 'online' mode would
    // pause it before it reached the table.
    networkMode: 'always',
    mutationFn: async (input: ShowMapAutoSortInput): Promise<ShowMapAutoSortResult> => {
      const { model } = await loadClassPlacement(showId, input.classId);
      if (model.waiting.length < 2) {
        throw new ShowDayRefusal('Auto-sort needs at least two dogs still waiting to run.');
      }
      const assignments = planPresetPlacement(model, input.kind);
      const snapshot: ShowMapAutoSortSnapshot = {
        classId: input.classId,
        ...(input.classLabel !== undefined ? { classLabel: input.classLabel } : {}),
        kind: input.kind,
        summary: SUCCESS_LABELS[input.kind],
        priorOrders: toPriorSnapshot(assignments),
      };
      const { failedCount } = await applyAssignments(assignments);
      // INTENT: Even on partial failure, return the snapshot so the user keeps
      // an Undo affordance to roll back the writes that did succeed.
      return { snapshot, failedCount };
    },
    onSuccess: ({ snapshot, failedCount }, input) =>
      announceChange(snapshot, failedCount, SUCCESS_LABELS[input.kind]),
    onError: error => {
      toast.error(showDayErrorMessage(error, RUN_ORDER_COPY.sortFailed));
    },
    onSettled: (_data, _error, variables) => {
      return variables?.classId ? invalidateForClass(variables.classId) : undefined;
    },
  });

  // Hand placement: one dog to a chosen slot. Same write path and Undo
  // snapshot as the presets, so the two can never disagree about run_order.
  const placeMutation = useMutation({
    // Local replicated write (queued offline); the default 'online' mode would
    // pause it before it reached the table.
    networkMode: 'always',
    mutationFn: async (input: ShowMapHandPlaceInput): Promise<ShowMapAutoSortResult> => {
      const { model } = await loadClassPlacement(showId, input.classId);
      const waitingIds = model.waiting.map(row => row.id);
      const toPosition =
        'toPosition' in input
          ? input.toPosition
          : waitingIds.includes(input.entryId) && waitingIds.includes(input.overEntryId)
            ? waitingIds.indexOf(input.overEntryId) + 1
            : 0;
      const changes = movePlacement(model, input.entryId, toPosition);
      if (changes.length === 0) {
        throw new ShowDayRefusal(
          'That dog cannot go in that spot. Only dogs still waiting to run can be moved.'
        );
      }
      const snapshot: ShowMapAutoSortSnapshot = {
        classId: input.classId,
        kind: 'hand',
        summary: `Moved ${input.entryLabel ?? 'dog'} to position ${toPosition}`,
        priorOrders: toPriorSnapshot(changes),
      };
      const { failedCount } = await applyAssignments(changes);
      return { snapshot, failedCount };
    },
    onSuccess: ({ snapshot, failedCount }) =>
      announceChange(snapshot, failedCount, snapshot.summary ?? 'Run order updated'),
    onError: error => {
      toast.error(showDayErrorMessage(error, RUN_ORDER_COPY.placeFailed));
    },
    onSettled: (_data, _error, variables) => {
      return variables?.classId ? invalidateForClass(variables.classId) : undefined;
    },
  });

  const undoMutation = useMutation({
    // Local replicated write (queued offline); the default 'online' mode would
    // pause it before it reached the table.
    networkMode: 'always',
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
      toast.error(showDayErrorMessage(error, RUN_ORDER_COPY.undoFailed));
    },
    onSettled: (_data, _error, snapshot) => {
      return snapshot?.classId ? invalidateForClass(snapshot.classId) : undefined;
    },
  });

  // INTENT: Both writes mutate the same `entries` rows, so we treat them as a
  // single channel — issuing an auto-sort while undo is in flight (or vice
  // versa) would interleave run_order writes and leave `lastAutoSort`
  // pointing at a half-applied state. `isAutoSorting` reflects either path so
  // the dropdown and the Undo button both disable while any write is active.
  const isBusy = autoSortMutation.isPending || placeMutation.isPending || undoMutation.isPending;

  return {
    autoSort: (input: ShowMapAutoSortInput) => {
      if (isBusy) return;
      autoSortMutation.mutate(input);
    },
    placeEntry: (input: ShowMapHandPlaceInput) => {
      if (isBusy) return;
      placeMutation.mutate(input);
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
