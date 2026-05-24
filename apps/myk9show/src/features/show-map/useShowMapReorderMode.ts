import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import {
  computeShowMapReorderAssignments,
  getReorderableEntryIds,
} from './showMapReorderMode';

export interface ShowMapReorderEnterInput {
  classId: string;
  classLabel: string;
}

function stripEntryPrefix(id: string): string {
  return id.startsWith('entry:') ? id.slice('entry:'.length) : id;
}

export interface ShowMapActiveReorder {
  classId: string;
  classLabel: string;
}

interface UseShowMapReorderModeInput {
  showId: string;
  onActivate?: ((classId: string) => void) | undefined;
}

export function useShowMapReorderMode({ showId, onActivate }: UseShowMapReorderModeInput) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<ShowMapActiveReorder | null>(null);
  // Mirrored to a ref so the (stable-identity) drag-end handler sees the
  // latest active class without needing to be re-bound to every state change.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const enter = useCallback(
    ({ classId, classLabel }: ShowMapReorderEnterInput) => {
      setActive({ classId, classLabel });
      onActivate?.(classId);
    },
    [onActivate]
  );

  const exit = useCallback(() => {
    setActive(null);
  }, []);

  // INTENT: Escape exits reorder mode. Bound to window so the secretary can
  // exit from anywhere — not just when focus is on the reordered class. Only
  // bound while a class is active so we don't intercept Escape elsewhere.
  useEffect(() => {
    if (!active) return undefined;
    // INTENT: Don't stopPropagation — other open popovers/dialogs may
    // legitimately want to close on the same Escape. We only react to the
    // key, not consume it.
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active]);

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

  const persistMutation = useMutation({
    mutationFn: async (input: {
      classId: string;
      activeId: string;
      overId: string;
    }): Promise<void> => {
      const entries = await replicatedEntriesTable.getEntriesByClass(input.classId);
      const assignments = computeShowMapReorderAssignments(entries, input.activeId, input.overId);
      if (assignments.length === 0) return;
      const results = await Promise.allSettled(
        assignments.map(a =>
          replicatedEntriesTable.updateEntry(a.id, { runOrder: a.runOrder })
        )
      );
      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) {
        throw new Error(
          `Could not save ${failedCount} ${failedCount === 1 ? 'entry' : 'entries'}.`
        );
      }
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.classId) invalidateForClass(variables.classId);
    },
  });

  // INTENT: Ref-based guard so a second drop fired before React commits the
  // first mutation's isPending flag does NOT enter another mutation. Each
  // persist refetches + rewrites all run_orders for the class, so
  // interleaved persists would race and leave run_order in an unintended
  // final state.
  const isPersistingRef = useRef(false);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const current = activeRef.current;
      if (!current) return;
      if (isPersistingRef.current) return;
      // INTENT: useSortable id is the prefixed ShowMapNode id (entry:abc).
      // The mutation looks entries up by their raw DB id — strip the prefix
      // here or every drop silently no-ops.
      const activeId = stripEntryPrefix(String(event.active.id));
      const overId = event.over ? stripEntryPrefix(String(event.over.id)) : null;
      if (!activeId || !overId || activeId === overId) return;
      isPersistingRef.current = true;
      persistMutation.mutate(
        { classId: current.classId, activeId, overId },
        {
          onSettled: () => {
            isPersistingRef.current = false;
          },
        }
      );
    },
    [persistMutation]
  );

  // INTENT: Keyboard-driven move. The plan's accessibility criterion was
  // Alt+ArrowUp / Alt+ArrowDown on the focused drag handle. We translate
  // the requested direction into an (activeId, overId) pair by walking the
  // unpinned entry list — pinned entries are skipped over so a keyboard
  // move can't try to displace a scored/in-ring dog. Strip the entry:
  // prefix so the mutation finds the entry by raw DB id (same contract as
  // onDragEnd; covered by the prefix-strip regression test).
  const onKeyboardReorder = useCallback(
    async (nodeId: string, direction: 'up' | 'down') => {
      const current = activeRef.current;
      if (!current) return;
      if (isPersistingRef.current) return;
      const activeId = stripEntryPrefix(nodeId);
      const entries = await replicatedEntriesTable.getEntriesByClass(current.classId);
      const reorderable = getReorderableEntryIds(entries);
      const cursor = reorderable.indexOf(activeId);
      if (cursor === -1) return;
      const targetIndex = direction === 'up' ? cursor - 1 : cursor + 1;
      if (targetIndex < 0 || targetIndex >= reorderable.length) return;
      const overId = reorderable[targetIndex];
      if (!overId) return;
      isPersistingRef.current = true;
      persistMutation.mutate(
        { classId: current.classId, activeId, overId },
        {
          onSettled: () => {
            isPersistingRef.current = false;
          },
        }
      );
    },
    [persistMutation]
  );

  return {
    active,
    isReordering: active !== null,
    isPersisting: persistMutation.isPending,
    sensors,
    enter,
    exit,
    onDragEnd,
    onKeyboardReorder,
  };
}

export type ShowMapReorderModeControls = ReturnType<typeof useShowMapReorderMode>;
