import { useCallback, useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { replicatedClassesTable } from '@/services/replication';
import { notifications } from '@/lib/notifications';
import { computePipelineReorder } from '../utils/pipelineReorder';
import type { ClassPipelineItem, ClassPipelineStage } from '../mission-control-types';

/**
 * Drag handlers shared by every Kanban surface that shows the class pipeline.
 *
 * Writes through the replicated table so IndexedDB updates first (subscribers
 * re-render immediately) before the mutation is queued to Supabase.
 *
 * Also tracks the active item so the parent can render a `<DragOverlay>`
 * preview that follows the cursor.
 */
export function useClassPipelineDragEnd(pipelineClasses: ClassPipelineItem[]) {
  const [activeItem, setActiveItem] = useState<ClassPipelineItem | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as { item?: ClassPipelineItem } | undefined;
    if (data?.item) setActiveItem(data.item);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveItem(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as
        | { type?: string; item?: ClassPipelineItem }
        | undefined;
      const draggedItem = activeData?.item;
      if (!draggedItem) return;

      const overData = over.data.current as
        | { stage?: ClassPipelineStage; item?: ClassPipelineItem }
        | undefined;
      const targetStage = overData?.stage ?? overData?.item?.stage;
      if (!targetStage) return;

      const updates = computePipelineReorder({
        allClasses: pipelineClasses,
        activeId: String(active.id),
        overId: String(over.id),
        targetStage,
      });
      if (updates.length === 0) return;

      const results = await Promise.allSettled(
        updates.map(u => replicatedClassesTable.updateClass(u.classId, u.updates))
      );
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failures.length > 0) {
        for (const f of failures) console.error('[pipeline drag] write failed', f.reason);
        notifications.error(`Failed to move ${draggedItem.name}`);
        return;
      }
      if (draggedItem.stage !== targetStage) {
        notifications.success(`${draggedItem.name} moved to ${targetStage.replace(/-/g, ' ')}`);
      }
    },
    [pipelineClasses]
  );

  const handleDragCancel = useCallback(() => setActiveItem(null), []);

  return { activeItem, handleDragStart, handleDragEnd, handleDragCancel };
}
