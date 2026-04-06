import { useState, useCallback, useEffect } from 'react';
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { notifications } from '@/lib/notifications';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

interface UseRunOrderDragParams {
  rawEntries: RawEntryRow[];
}

export function useRunOrderDrag({ rawEntries }: UseRunOrderDragParams) {
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isDragging) return;
    const sorted = [...rawEntries].sort((a, b) => {
      if (a.run_order == null && b.run_order == null) return 0;
      if (a.run_order == null) return 1;
      if (b.run_order == null) return -1;
      return a.run_order - b.run_order;
    });
    setOrderedIds(sorted.map(e => e.id));
  }, [rawEntries, isDragging]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragStart = useCallback((_event: DragStartEvent) => {
    setIsDragging(true);
  }, []);

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setIsDragging(false);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const snapshot = orderedIds;
      const oldIndex = snapshot.indexOf(String(active.id));
      const newIndex = snapshot.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const newIds = arrayMove(snapshot, oldIndex, newIndex);
      setOrderedIds(newIds);

      const updates = newIds.map((id, idx) => ({ id, runOrder: idx + 1 }));

      const results = await Promise.allSettled(
        updates.map(u => replicatedEntriesTable.updateEntry(u.id, { runOrder: u.runOrder }))
      );
      const anySucceeded = results.some(r => r.status === 'fulfilled');
      if (!anySucceeded && updates.length > 0) {
        setOrderedIds(snapshot);
        notifications.error('Failed to save run order');
      }
    },
    [orderedIds]
  );

  return { orderedIds, isDragging, sensors, onDragStart, onDragEnd };
}
