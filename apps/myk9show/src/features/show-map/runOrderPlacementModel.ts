import {
  isInQueue,
  isInRingEntry,
  pendingByRunOrder,
  compareByRunOrder,
  type RunQueueEntry,
} from '@myk9/ringside/run-queue';

// The single model behind hand placement and the Armband/Random presets
// (MYK9-972, MYK9-990). The run number IS the run order, and only dogs still
// waiting to run are reorderable.
//
// WAITING = on the class run list (`isOnClassRunList`, applied by the adapter)
//   AND in the canonical queue `pendingByRunOrder`: not scored, not pulled, not
//   in the ring. The adapter folds every "has run / in the ring" signal into
//   the queue row first, so none of them can be mistaken for waiting: is_scored,
//   scoring completed, check-in completed (all -> scored), check-in in-ring,
//   is_in_ring, ring_entry_time (-> in the ring), pulled and non-runnable
//   lifecycle states (-> pulled).
//
// Dogs that ran or are in the ring are shown read-only and their run_order is
// NEVER written. A write renumbers the waiting dogs only, consecutively from
// (the highest run_order held by any dog that is not being renumbered, or 0) + 1,
// in their final order; only rows whose number changes are written.

export interface PlacementInput {
  id: string;
  /** Armband after the armbands-table fallback; null when none. */
  armband: string | null;
  runOrder: number | null;
  /** On the class run list (not withdrawn, scratched, moved, deleted...). */
  onRunList: boolean;
  /** Scored or otherwise finished. */
  isScored: boolean;
  /** Queue status: 'pulled', 'in-ring', or any other check-in state. */
  status?: string | undefined;
  inRing: boolean;
}

export interface PlacementRow {
  id: string;
  armband: string | null;
  runOrder: number | null;
  pulled: boolean;
}

export interface RunOrderPlacementModel {
  /** Dogs still to run, in the order the run queue serves them. */
  waiting: PlacementRow[];
  inRing: PlacementRow[];
  /** On the run list but not waiting and not in the ring: ran, or pulled. */
  finished: PlacementRow[];
  /** Highest run_order held by any dog that is not waiting, or 0. */
  baseRunOrder: number;
}

export interface PlacementMove {
  id: string;
  runOrder: number;
  /** The run_order before the move, null when the entry had none. */
  priorRunOrder: number | null;
}

interface QueueRow extends RunQueueEntry {
  input: PlacementInput;
}

function toQueueRow(input: PlacementInput): QueueRow {
  const armband = Number.parseInt(input.armband ?? '', 10);
  return {
    id: input.id,
    armband: Number.isNaN(armband) ? null : armband,
    exhibitorOrder: input.runOrder,
    isScored: input.isScored,
    status: input.status,
    inRing: input.inRing,
    input,
  };
}

const toRow = ({ input }: QueueRow): PlacementRow => ({
  id: input.id,
  armband: input.armband,
  runOrder: input.runOrder,
  pulled: input.status === 'pulled',
});

export function buildRunOrderPlacementModel(
  inputs: readonly PlacementInput[]
): RunOrderPlacementModel {
  const queue = inputs.filter(input => input.onRunList).map(toQueueRow);
  const waiting = pendingByRunOrder(queue);
  const waitingIds = new Set(waiting.map(row => row.id));
  const baseRunOrder = inputs
    .filter(input => !waitingIds.has(input.id))
    .reduce((max, input) => Math.max(max, input.runOrder ?? 0), 0);
  return {
    waiting: waiting.map(toRow),
    inRing: queue
      .filter(row => isInQueue(row) && isInRingEntry(row))
      .sort(compareByRunOrder)
      .map(toRow),
    finished: queue
      .filter(row => !isInQueue(row))
      .sort(compareByRunOrder)
      .map(toRow),
    baseRunOrder,
  };
}

/**
 * Renumber the waiting dogs into `orderedIds` (all of them, final order),
 * consecutively after `baseRunOrder`. Returns only the dogs whose number changes.
 */
export function planRenumber(
  model: RunOrderPlacementModel,
  orderedIds: readonly string[]
): PlacementMove[] {
  const prior = new Map(model.waiting.map(row => [row.id, row.runOrder]));
  const changes: PlacementMove[] = [];
  orderedIds.forEach((id, index) => {
    const runOrder = model.baseRunOrder + index + 1;
    const priorRunOrder = prior.get(id) ?? null;
    if (priorRunOrder !== runOrder) changes.push({ id, runOrder, priorRunOrder });
  });
  return changes;
}

/**
 * Move waiting dog `entryId` to 1-based `toPosition` in the waiting list.
 * Empty for a no-op or a move that is not allowed (a dog that is not waiting,
 * or a position outside the list).
 */
export function movePlacement(
  model: RunOrderPlacementModel,
  entryId: string,
  toPosition: number
): PlacementMove[] {
  const ids = model.waiting.map(row => row.id);
  const from = ids.indexOf(entryId);
  if (from < 0 || !Number.isInteger(toPosition) || toPosition < 1 || toPosition > ids.length) {
    return [];
  }
  if (from === toPosition - 1) return [];
  ids.splice(from, 1);
  ids.splice(toPosition - 1, 0, entryId);
  return planRenumber(model, ids);
}
