import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { notifications } from '@/lib/notifications';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

interface UseRunOrderDragParams {
  rawEntries: RawEntryRow[];
}

export function useRunOrderDrag({ rawEntries }: UseRunOrderDragParams) {
  // dragOverride holds the reordered ids during/after a drag; null means use server order
  const [dragOverride, setDragOverride] = useState<string[] | null>(null);
  // Prevents a second drag from starting while writes are in flight
  const isPersistingRef = useRef(false);

  const serverSortedIds = useMemo(
    () =>
      [...rawEntries]
        .sort((a, b) => {
          if (a.run_order == null && b.run_order == null) return 0;
          if (a.run_order == null) return 1;
          if (b.run_order == null) return -1;
          return a.run_order - b.run_order;
        })
        .map(e => e.id),
    [rawEntries]
  );

  const orderedIds = dragOverride ?? serverSortedIds;

  // Once rawEntries updates to reflect the new order, hand control back to the server.
  // This avoids the visual snap-back that would occur if we cleared the override immediately
  // while rawEntries still holds stale run_order values.
  useEffect(() => {
    if (!dragOverride) return;
    if (
      dragOverride.length === serverSortedIds.length &&
      dragOverride.every((id, i) => id === serverSortedIds[i])
    ) {
      setDragOverride(null);
    }
  }, [serverSortedIds, dragOverride]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (isPersistingRef.current) return;

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const snapshot = orderedIds;
      const oldIndex = snapshot.indexOf(String(active.id));
      const newIndex = snapshot.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const newIds = arrayMove(snapshot, oldIndex, newIndex);
      setDragOverride(newIds);

      const updates = newIds.map((id, idx) => ({ id, runOrder: idx + 1 }));

      isPersistingRef.current = true;
      const results = await Promise.allSettled(
        updates.map(u => replicatedEntriesTable.updateEntry(u.id, { runOrder: u.runOrder }))
      );
      isPersistingRef.current = false;

      const allSucceeded = results.every(r => r.status === 'fulfilled');
      if (!allSucceeded) {
        setDragOverride(snapshot);
        notifications.error('Failed to save run order');
      }
      // On success, the useEffect above will clear dragOverride once rawEntries reflects
      // the new order, avoiding a flash back to the stale server order.
    },
    [orderedIds]
  );

  return { orderedIds, sensors, onDragEnd };
}
