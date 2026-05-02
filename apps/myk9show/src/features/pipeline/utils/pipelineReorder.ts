import type { ReplicatedClass } from '@/services/replication';
import type { ClassPipelineItem, ClassPipelineStage } from '../mission-control-types';
import { stageToDefaultStatus } from './classStageMapping';

// Step between assigned display_order values — leaves room for future inserts
// without renumbering adjacent cards.
export const DISPLAY_ORDER_STEP = 10;

export interface PipelineReorderUpdate {
  classId: string;
  updates: Partial<ReplicatedClass>;
}

export interface PipelineDragInput {
  allClasses: ClassPipelineItem[];
  activeId: string;
  overId: string;
  targetStage: ClassPipelineStage;
}

export function sortByDisplayOrder<T extends { displayOrder?: number | undefined }>(
  items: T[]
): T[] {
  return [...items].sort(
    (a, b) =>
      (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER)
  );
}

/** Returns updates to apply for a Kanban drag, or `[]` if the drop is a no-op. */
export function computePipelineReorder({
  allClasses,
  activeId,
  overId,
  targetStage,
}: PipelineDragInput): PipelineReorderUpdate[] {
  const active = allClasses.find(c => c.id === activeId);
  if (!active) return [];

  const sourceStage = active.stage;
  const stageChanged = sourceStage !== targetStage;

  // Build the target column list in its new order.
  const targetList = allClasses.filter(c => c.stage === targetStage && c.id !== activeId);

  // Determine insert index: before the `over` card if dropped on a card, else end.
  let insertIndex = targetList.length;
  if (overId !== `column-${targetStage}`) {
    const overIdx = targetList.findIndex(c => c.id === overId);
    if (overIdx >= 0) insertIndex = overIdx;
  }

  const newTargetList = [...targetList];
  newTargetList.splice(insertIndex, 0, active);

  // No-op: same stage and same position.
  if (!stageChanged) {
    const original = allClasses.filter(c => c.stage === sourceStage);
    const samePosition = original.every((c, i) => c.id === newTargetList[i]?.id);
    if (samePosition) return [];
  }

  const updates: PipelineReorderUpdate[] = [];

  // Status/finalization changes apply only to the dragged card.
  const { status: dbStatus, is_scoring_finalized } = stageToDefaultStatus(targetStage);

  // Assign fresh display_order values to every card in the target list.
  newTargetList.forEach((card, idx) => {
    const newOrder = (idx + 1) * DISPLAY_ORDER_STEP;
    const cardUpdates: Partial<ReplicatedClass> = {};

    if (card.display_order !== newOrder) {
      cardUpdates.displayOrder = newOrder;
    }

    if (card.id === activeId && stageChanged) {
      cardUpdates.classStatus = dbStatus;
      if (is_scoring_finalized !== undefined) {
        cardUpdates.isScoringFinalized = is_scoring_finalized;
        if (!is_scoring_finalized) {
          cardUpdates.isResultsReviewed = false;
        }
      }
    }

    if (Object.keys(cardUpdates).length > 0) {
      updates.push({ classId: card.id, updates: cardUpdates });
    }
  });

  // When the card leaves its source column, renumber the remaining cards in
  // the source so gaps don't accumulate forever.
  if (stageChanged) {
    const sourceList = allClasses.filter(c => c.stage === sourceStage && c.id !== activeId);
    sourceList.forEach((card, idx) => {
      const newOrder = (idx + 1) * DISPLAY_ORDER_STEP;
      if (card.display_order !== newOrder) {
        updates.push({ classId: card.id, updates: { displayOrder: newOrder } });
      }
    });
  }

  return updates;
}
