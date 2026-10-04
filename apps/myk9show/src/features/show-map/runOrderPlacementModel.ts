import { compareByRunOrder } from '@myk9/ringside';
import { isOnClassRunList } from '@/features/_shared/entryAccounting';

// The single model behind hand placement (MYK9-972). The panel renders it and
// the mutation moves dogs through it, so the rows a secretary sees and the
// slots a write targets cannot disagree: one membership rule (the class run
// list), one order (`compareByRunOrder`, the run-queue comparator), one pin
// predicate. Adapters in `showMapHandPlacement.ts` normalize each data source
// (the secretary read, the replicated row) into `PlacementInput` first.
//
// Pin signals, unioned from the existing code and INTENT: a dog that is
// scored, has scoring completed, is checked in as completed, is in the ring by
// check-in status, by the `is_in_ring` flag, or by a ring entry time.

export interface PlacementInput {
  id: string;
  /** Armband after the armbands-table fallback; null when none. */
  armband: string | null;
  runOrder: number | null;
  entryStatus?: string | undefined;
  deletedAt?: string | null | undefined;
  isScored?: boolean | undefined;
  scoringCompletedAt?: string | null | undefined;
  checkInStatus?: string | null | undefined;
  isInRing?: boolean | undefined;
  ringEntryTime?: string | null | undefined;
}

export type PlacementPinReason = 'already-ran' | 'in-ring';

export interface PlacementSlot {
  id: string;
  /** 1-based slot in the class run list. */
  position: number;
  armband: string | null;
  runOrder: number | null;
  pinned: PlacementPinReason | null;
}

export interface PlacementMove {
  id: string;
  runOrder: number;
  /** The run_order before the move, null when the entry had none. */
  priorRunOrder: number | null;
}

function pinReason(input: PlacementInput): PlacementPinReason | null {
  if (input.isScored || input.scoringCompletedAt || input.checkInStatus === 'completed') {
    return 'already-ran';
  }
  if (input.isInRing || input.checkInStatus === 'in-ring' || input.ringEntryTime) {
    return 'in-ring';
  }
  return null;
}

function queueKey(input: PlacementInput) {
  const armband = Number.parseInt(input.armband ?? '', 10);
  return {
    id: input.id,
    armband: Number.isNaN(armband) ? null : armband,
    exhibitorOrder: input.runOrder,
  };
}

/** The class run list in run order, each dog with its slot and pin state. */
export function buildRunOrderPlacementModel(inputs: readonly PlacementInput[]): PlacementSlot[] {
  return inputs
    .filter(input =>
      isOnClassRunList({
        entry_status: input.entryStatus,
        deleted_at: input.deletedAt,
      })
    )
    .sort((a, b) => compareByRunOrder(queueKey(a), queueKey(b)) || a.id.localeCompare(b.id))
    .map((input, index) => ({
      id: input.id,
      position: index + 1,
      armband: input.armband,
      runOrder: input.runOrder,
      pinned: pinReason(input),
    }));
}

/**
 * Move `entryId` to the open slot at `toPosition`. Pinned dogs hold their slot
 * and nothing shifts past them. Returns only the dogs whose run_order changes;
 * empty for a no-op or a move that is not allowed (unknown or pinned dog,
 * pinned or missing destination).
 */
export function movePlacement(
  slots: readonly PlacementSlot[],
  entryId: string,
  toPosition: number
): PlacementMove[] {
  const target = Number.isInteger(toPosition) ? slots[toPosition - 1] : undefined;
  const moving = slots.find(slot => slot.id === entryId);
  if (!target || !moving || moving.pinned || target.pinned || target.id === entryId) return [];

  const open = slots.filter(slot => !slot.pinned);
  const reordered = [...open];
  reordered.splice(open.indexOf(moving), 1);
  reordered.splice(open.indexOf(target), 0, moving);
  return assignOpenSlots(slots, reordered);
}

/**
 * Pour `openOrder` (every unpinned dog, in the new order) into the unpinned
 * slots; pinned dogs hold their slot. Returns only the dogs whose run_order
 * changes. Shared by hand placement and the Armband/Random presets so both
 * write the same way.
 */
export function assignOpenSlots(
  slots: readonly PlacementSlot[],
  openOrder: readonly PlacementSlot[]
): PlacementMove[] {
  let cursor = 0;
  const changes: PlacementMove[] = [];
  slots.forEach((slot, index) => {
    const id = slot.pinned ? slot.id : openOrder[cursor++]!.id;
    const runOrder = index + 1;
    const prior = slots.find(candidate => candidate.id === id)!.runOrder;
    if (prior !== runOrder) changes.push({ id, runOrder, priorRunOrder: prior });
  });
  return changes;
}
