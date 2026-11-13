/**
 * dragRunOrder: the run-order numbers a drag-to-reorder writes (MYK9-1914).
 *
 * Drag mode lists only the PENDING dogs, so scored, pulled and in-ring dogs are hidden from the
 * dragged list but still hold run orders. Renumbering the dragged list 1..N would collide with
 * them. Scored dogs keep their slots; the drag only permutes the dragged dogs among the slots
 * those dogs already held.
 */

import type { Entry } from '../../../stores/entryStore';
import { compareByRunOrder } from '../runQueue';

export interface DragRunOrderResult {
  /** The reordered entries to write, with their new `exhibitorOrder`. */
  written: Entry[];
  /** The same entries as they were before the drop, so the host writes only rows that changed. */
  previous: Entry[];
  /** Every entry of the class after the drop (what the page keeps in local state). */
  allEntries: Entry[];
  /** The reordered dragged dogs, with new orders, in display order. */
  dragged: Entry[];
}

function withOrder(entry: Entry, exhibitorOrder: number): Entry {
  return { ...entry, exhibitorOrder };
}

/**
 * @param snapshot the dragged list at drag start (the dogs the user sees), in display order
 * @param reordered the same dogs after the move
 * @param localEntries every entry of the class (or merged A/B queue), scored dogs included
 */
export function computeDragRunOrder(
  snapshot: Entry[],
  reordered: Entry[],
  localEntries: Entry[]
): DragRunOrderResult {
  const draggedIds = new Set(snapshot.map(e => e.id));
  const outside = localEntries.filter(e => !draggedIds.has(e.id));

  // Whole class dragged: renumber 1..N, which also heals dogs that shared a run order (MYK9-1808).
  if (outside.length > 0) {
    const slots = snapshot.map(e => e.exhibitorOrder ?? 0).sort((a, b) => a - b);
    const outsideOrders = new Set(outside.map(e => e.exhibitorOrder ?? 0));
    const usable =
      slots.every(s => s > 0) &&
      new Set(slots).size === slots.length &&
      slots.every(s => !outsideOrders.has(s));
    if (usable) {
      const dragged = reordered.map((e, i) => withOrder(e, slots[i]));
      return {
        written: dragged,
        previous: snapshot,
        allEntries: [...outside, ...dragged],
        dragged,
      };
    }
  }

  // Heal: order the whole class, drop the reordered dogs into the positions the dragged dogs
  // held, leave every other dog where it is, then number the full order 1..N.
  const everyone = [...outside, ...snapshot].sort(compareByRunOrder);
  let next = 0;
  const merged = everyone.map(e => (draggedIds.has(e.id) ? reordered[next++] : e));
  const numbered = merged.map((e, i) => withOrder(e, i + 1));
  const dragged = reordered.map(e => numbered.find(n => n.id === e.id) ?? e);
  return {
    written: numbered,
    previous: everyone,
    allEntries: numbered,
    dragged,
  };
}
