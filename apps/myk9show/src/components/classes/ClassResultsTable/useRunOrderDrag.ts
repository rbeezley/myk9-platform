import { useState, useCallback, useMemo } from 'react';
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const snapshot = orderedIds;
      const oldIndex = snapshot.indexOf(String(active.id));
      const newIndex = snapshot.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const newIds = arrayMove(snapshot, oldIndex, newIndex);
      setDragOverride(newIds);

      const updates = newIds.map((id, idx) => ({ id, runOrder: idx + 1 }));

      const results = await Promise.allSettled(
        updates.map(u => replicatedEntriesTable.updateEntry(u.id, { runOrder: u.runOrder }))
      );
      const anySucceeded = results.some(r => r.status === 'fulfilled');
      if (!anySucceeded && updates.length > 0) {
        setDragOverride(snapshot);
        notifications.error('Failed to save run order');
      } else {
        // Server accepted; clear the override so server order takes over on next rawEntries update
        setDragOverride(null);
      }
    },
    [orderedIds]
  );

  return { orderedIds, sensors, onDragEnd };
}
