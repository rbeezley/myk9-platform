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
import { computeShowMapReorderAssignments } from './showMapReorderMode';

export interface ShowMapReorderEnterInput {
  classId: string;
  classLabel: string;
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
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setActive(null);
      }
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

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const current = activeRef.current;
      if (!current) return;
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId || activeId === overId) return;
      persistMutation.mutate({ classId: current.classId, activeId, overId });
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
  };
}

export type ShowMapReorderModeControls = ReturnType<typeof useShowMapReorderMode>;
