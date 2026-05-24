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

interface UseShowMapRunOrderAutoSortInput {
  showId: string;
}

async function applyAssignments(assignments: ShowMapAutoSortAssignment[]): Promise<void> {
  const results = await Promise.allSettled(
    assignments.map(a => replicatedEntriesTable.updateEntry(a.id, { runOrder: a.runOrder }))
  );
  if (results.some(r => r.status === 'rejected')) {
    throw new Error('Some entries could not be reordered. The run order may be partially updated.');
  }
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
    mutationFn: async (input: ShowMapAutoSortInput): Promise<ShowMapAutoSortSnapshot> => {
      const entries = await replicatedEntriesTable.getEntriesByClass(input.classId);
      if (entries.length < 2) {
        throw new Error('Auto-sort needs at least two entries in this class.');
      }
      const assignments = computeShowMapAutoSortAssignments(entries, input.kind);
      const priorOrders = snapshotPriorRunOrders(entries);
      await applyAssignments(assignments);
      return {
        classId: input.classId,
        ...(input.classLabel !== undefined ? { classLabel: input.classLabel } : {}),
        kind: input.kind,
        priorOrders,
      };
    },
    onSuccess: (snapshot, input) => {
      toast.success(SUCCESS_LABELS[input.kind]);
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
      const assignments: ShowMapAutoSortAssignment[] = snapshot.priorOrders
        .filter((item): item is ShowMapAutoSortSnapshotItem & { runOrder: number } =>
          item.runOrder !== null
        )
        .map(item => ({ id: item.id, runOrder: item.runOrder }));
      await applyAssignments(assignments);
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

  return {
    autoSort: (input: ShowMapAutoSortInput) => autoSortMutation.mutate(input),
    isAutoSorting: autoSortMutation.isPending,
    lastAutoSort,
    undoLastAutoSort: () => {
      if (lastAutoSort) undoMutation.mutate(lastAutoSort);
    },
    isUndoingAutoSort: undoMutation.isPending,
  };
}

export type ShowMapRunOrderAutoSortControls = ReturnType<typeof useShowMapRunOrderAutoSort>;
