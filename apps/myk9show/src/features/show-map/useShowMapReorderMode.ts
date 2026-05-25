import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
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
  // INTENT: Optimistic order overlay per class. When the secretary drops a
  // row we update this synchronously in onDragEnd so the visual order
  // commits immediately; the DB write fires in parallel and onSettled
  // clears the overlay + invalidates the source query so the next render
  // falls back to server truth. Without this, slow networks left rows
  // snapping back to their pre-drag position until the refetch landed.
  // Keyed by classId (raw, no `class:` prefix); values are prefixed entry
  // node IDs (`entry:abc`) matching the SortableContext items contract.
  const [optimisticOrderByClassId, setOptimisticOrderByClassId] = useState<
    Record<string, string[] | undefined>
  >({});
  // Mirrored to a ref so the (stable-identity) drag-end handler sees the
  // latest active class without needing to be re-bound to every state change.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // INTENT: iOS Safari's default `touch-action: pan-y` on the grip area
    // wins against PointerSensor's touch-event coalescing — the browser
    // claims the touch for page scrolling and the drag never activates.
    // TouchSensor with a short delay + tolerance window gives a clean
    // long-press activation that survives the scroll-vs-drag arbitration.
    // Pair this with `touch-action: none` on the grip handle itself.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
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
    // Clear any optimistic overlays — once the secretary leaves reorder
    // mode the next render should reflect server truth (the most recent
    // persist's onSettled has already invalidated, the refetch is in
    // flight). Holding stale optimistic state would briefly show the
    // pending order in the static tree on re-entry.
    setOptimisticOrderByClassId({});
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
      if (variables?.classId) {
        // Clear the optimistic overlay BEFORE invalidating so the next
        // render falls back to the freshly-refetched server order. On
        // failure this naturally reverts the row to its pre-drag slot
        // because the refetch returns unchanged data.
        setOptimisticOrderByClassId(current => {
          if (current[variables.classId] === undefined) return current;
          const next = { ...current };
          delete next[variables.classId];
          return next;
        });
        invalidateForClass(variables.classId);
      }
    },
  });

  // INTENT: Ref-based guard so a second drop fired before React commits the
  // first mutation's isPending flag does NOT enter another mutation. Each
  // persist refetches + rewrites all run_orders for the class, so
  // interleaved persists would race and leave run_order in an unintended
  // final state.
  const isPersistingRef = useRef(false);

  // INTENT: Builds the DndContext.onDragEnd handler with a snapshot of the
  // current SortableContext items in closure. The structure table calls
  // this per-render with `visibleChildIds` so onDragEnd can apply
  // arrayMove synchronously and commit the optimistic overlay in the
  // same frame as the drop. Without this, slow networks left rows
  // visually snapping back to their pre-drag position until the DB write
  // + refetch landed.
  const buildOnDragEnd = useCallback(
    (currentItems: readonly string[]) => (event: DragEndEvent) => {
      const current = activeRef.current;
      if (!current) return;
      if (isPersistingRef.current) return;
      // INTENT: useSortable id is the prefixed ShowMapNode id (entry:abc).
      // The mutation looks entries up by their raw DB id — strip the
      // prefix here or every drop silently no-ops.
      const activePrefixedId = String(event.active.id);
      const overPrefixedId = event.over ? String(event.over.id) : null;
      const activeId = stripEntryPrefix(activePrefixedId);
      const overId = overPrefixedId ? stripEntryPrefix(overPrefixedId) : null;
      if (!activeId || !overId || activeId === overId) return;

      const fromIndex = currentItems.indexOf(activePrefixedId);
      const toIndex = currentItems.indexOf(overPrefixedId!);
      const classId = current.classId;
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        const reordered = arrayMove([...currentItems], fromIndex, toIndex);
        setOptimisticOrderByClassId(currentMap => ({ ...currentMap, [classId]: reordered }));
      }

      isPersistingRef.current = true;
      persistMutation.mutate(
        { classId, activeId, overId },
        {
          onSettled: () => {
            isPersistingRef.current = false;
          },
        }
      );
    },
    [persistMutation]
  );

  // INTENT: Back-compat shim — callers that don't (yet) provide the items
  // snapshot get a non-optimistic drag-end. This keeps the optimistic
  // path opt-in per call site; the structure table opts in by passing
  // `visibleChildIds` via buildOnDragEnd above.
  const onDragEnd = useCallback(
    (event: DragEndEvent) => buildOnDragEnd([])(event),
    [buildOnDragEnd]
  );

  const getOptimisticOrder = useCallback(
    (classId: string): readonly string[] | undefined => optimisticOrderByClassId[classId],
    [optimisticOrderByClassId]
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

      // INTENT: Mirror onDragEnd's optimistic overlay so the visible
      // order commits in the same frame as the keystroke (the same
      // regression PR #348 fixed for drag). Derive from the mutation's
      // assignment function so the overlay matches what the persist
      // will write.
      const classId = current.classId;
      const assignments = computeShowMapReorderAssignments(entries, activeId, overId);
      if (assignments.length > 0) {
        const optimisticIds = assignments.map(a => `entry:${a.id}`);
        setOptimisticOrderByClassId(currentMap => ({
          ...currentMap,
          [classId]: optimisticIds,
        }));
      }

      isPersistingRef.current = true;
      persistMutation.mutate(
        { classId, activeId, overId },
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
    // Build a drag-end handler closed over the current SortableContext
    // items so onDragEnd can apply arrayMove synchronously for optimistic
    // UX. Per-render call; caller passes the items array it just used to
    // build <SortableContext items={…}>.
    buildOnDragEnd,
    // Look up the optimistic order overlay for a class (returns
    // `entry:…` prefixed node IDs or undefined when no overlay is
    // active). Cleared in the mutation's onSettled.
    getOptimisticOrder,
    onKeyboardReorder,
  };
}

export type ShowMapReorderModeControls = ReturnType<typeof useShowMapReorderMode>;
