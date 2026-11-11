import { arrayMove } from '@dnd-kit/sortable';

import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';

/**
 * The rows a secretary may drag, in run order: the dogs the placement model lists as waiting
 * (`model.waiting`, the same list the write renumbers), that this table also shows. The table's
 * own `state` is never consulted, so the grips and the write cannot disagree about who can move.
 */
export function movableEntries(
  entries: readonly SecretaryCockpitClassEntry[],
  waitingIds: readonly string[]
): SecretaryCockpitClassEntry[] {
  const byEntryId = new Map(entries.map(entry => [entry.entryId, entry]));
  return waitingIds.flatMap(id => byEntryId.get(id) ?? []);
}

/**
 * Where a dropped dog lands, in the placement model's numbering: the 1-based slot among the
 * waiting dogs (what `onPlaceEntry` takes as `toPosition`). Null when nothing moves: dropped on
 * itself, or on or from a row that is not movable.
 */
export function dropPosition(
  movableIds: readonly string[],
  activeId: string,
  overId: string | null | undefined
): number | null {
  if (!overId || overId === activeId) return null;
  const from = movableIds.indexOf(activeId);
  const to = movableIds.indexOf(overId);
  if (from < 0 || to < 0) return null;
  const moved = arrayMove([...movableIds], from, to);
  return moved.indexOf(activeId) + 1;
}

export const RUN_ORDER_DRAG_INSTRUCTIONS =
  'Press Space or Enter to pick up a dog, arrow keys to move, Space or Enter to drop, Escape to cancel.';

/** A waiting dog as the drag announcements name it: the sortable id and "#armband dog". */
export interface DragAnnouncementItem {
  id: string;
  label: string;
}

type DragRef = { active: { id: string | number }; over?: { id: string | number } | null };

/**
 * What a screen reader hears during a keyboard drag: dog names and run-order slots among the
 * waiting dogs, never dnd-kit's default "Draggable item entry:<uuid> was moved over droppable
 * area ..." (MYK9-1872). `items` is the waiting dogs in run order.
 */
export function runOrderAnnouncements(items: readonly DragAnnouncementItem[]) {
  const ids = items.map(item => item.id);
  const total = items.length;
  const labelOf = (id: string | number) =>
    items.find(item => item.id === String(id))?.label ?? 'Dog';
  const positionOf = (id: string | number) => ids.indexOf(String(id)) + 1;
  return {
    onDragStart: ({ active }: Pick<DragRef, 'active'>) =>
      `Picked up ${labelOf(active.id)}, position ${positionOf(active.id)} of ${total}`,
    // dnd-kit fires this right after the pick-up (over the dog's own slot) and so replaces the
    // pick-up message in the live region; it must still say which dog and where.
    onDragOver: ({ active, over }: DragRef) => {
      if (!over) return `${labelOf(active.id)} is not over a position`;
      const verb = over.id === active.id ? 'at' : 'moved to';
      return `${labelOf(active.id)} ${verb} position ${positionOf(over.id)} of ${total}`;
    },
    onDragEnd: ({ active, over }: DragRef) => {
      const to = dropPosition(ids, String(active.id), over && String(over.id));
      return to === null
        ? `${labelOf(active.id)} dropped. Run order unchanged, still position ${positionOf(active.id)}`
        : `${labelOf(active.id)} dropped at position ${to}. Saving run order.`;
    },
    onDragCancel: ({ active }: Pick<DragRef, 'active'>) =>
      `Move cancelled. ${labelOf(active.id)} stays at position ${positionOf(active.id)}`,
  };
}
