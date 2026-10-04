import { isOnClassRunList } from '@/features/_shared/entryAccounting';
import type { SecretaryEntry } from '@/services/database/entries';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { computeShowMapReorderAssignments, sortByExistingRunOrder } from './showMapReorderMode';
import { isPinnedRunOrderEntry } from './showMapRunOrderAutoSort';
import type { ShowMapAutoSortSnapshotItem } from './showMapRunOrderAutoSort';

// Hand placement (MYK9-972). The secretary puts one dog into a chosen slot.
//
// There is no second ordering rule here. Positions are slots in the SAME
// sequence the presets sort and `runQueue.ts` reads (`run_order`, run list
// only). The move itself is `computeShowMapReorderAssignments`: pinned dogs
// (scored, in the ring, completed) hold their slot and nothing shifts past
// them. A preset pressed afterwards re-sorts every unpinned dog, so it
// replaces hand placements; there is no stored "hand placed" flag.

export interface HandPlacementChange {
  id: string;
  runOrder: number;
  /** The run_order before the move, null when the entry had none. */
  priorRunOrder: number | null;
}

/** The class run list in run order: the rows a position number refers to. */
export function runListInOrder(entries: readonly ReplicatedEntry[]): ReplicatedEntry[] {
  return sortByExistingRunOrder(entries.filter(entry => isOnClassRunList(entry)));
}

/**
 * Only the entries whose run_order actually changes, for the move of `entryId`
 * to 1-based `toPosition` in the run list. Empty when the move is a no-op or
 * not allowed (unknown dog, pinned dog, pinned destination slot).
 */
export function computeHandPlacementChanges(
  entries: readonly ReplicatedEntry[],
  entryId: string,
  toPosition: number
): HandPlacementChange[] {
  const runList = runListInOrder(entries);
  const target = Number.isInteger(toPosition) ? runList[toPosition - 1] : undefined;
  if (!target) return [];
  const priorById = new Map(runList.map(entry => [entry.id, entry.runOrder ?? null]));
  return computeShowMapReorderAssignments(runList, entryId, target.id)
    .filter(assignment => priorById.get(assignment.id) !== assignment.runOrder)
    .map(assignment => ({
      id: assignment.id,
      runOrder: assignment.runOrder,
      priorRunOrder: priorById.get(assignment.id) ?? null,
    }));
}

export function toPriorSnapshot(
  changes: readonly HandPlacementChange[]
): ShowMapAutoSortSnapshotItem[] {
  return changes.map(change => ({ id: change.id, runOrder: change.priorRunOrder }));
}

export type HandPlacementPinReason = 'already-ran' | 'in-ring';

export interface HandPlacementRow {
  id: string;
  /** 1-based slot in the run list. */
  position: number;
  label: string;
  subtitle: string | null;
  /** Set when the dog cannot be moved, and why. */
  pinned: HandPlacementPinReason | null;
  /** Slots this dog can be sent to, never including its own. */
  destinations: number[];
  /** The neighbouring open slots, or null at either end of the movable dogs. */
  upTo: number | null;
  downTo: number | null;
}

// Adapts the secretary read row to the fields `isPinnedRunOrderEntry` and the
// run-list predicate read. The mutation re-reads the replicated row itself.
function toPlacementEntry(entry: SecretaryEntry): ReplicatedEntry {
  return {
    id: entry.id,
    ...(entry.armband != null && { armband: entry.armband }),
    ...(entry.run_order != null && { runOrder: entry.run_order }),
    ...(entry.entry_status != null && { entryStatus: entry.entry_status }),
    ...(entry.is_scored != null && { isScored: entry.is_scored }),
    ...(entry.scoring_completed_at != null && { scoringCompletedAt: entry.scoring_completed_at }),
    checkInStatus: (entry.is_in_ring
      ? 'in-ring'
      : (entry.check_in_status ?? undefined)) as ReplicatedEntry['checkInStatus'],
  } as ReplicatedEntry;
}

function pinReason(entry: ReplicatedEntry): HandPlacementPinReason | null {
  if (!isPinnedRunOrderEntry(entry)) return null;
  return entry.checkInStatus === 'in-ring' ? 'in-ring' : 'already-ran';
}

function describeEntry(entry: SecretaryEntry): { label: string; subtitle: string | null } {
  const dog = entry.dog?.call_name || entry.dog?.name || 'Dog';
  const person = entry.handler_person;
  const handler =
    entry.handler || [person?.first_name, person?.last_name].filter(Boolean).join(' ') || null;
  return { label: entry.armband ? `#${entry.armband} ${dog}` : dog, subtitle: handler };
}

export function buildHandPlacementRows(
  entries: readonly SecretaryEntry[],
  classId: string
): HandPlacementRow[] {
  const classEntries = entries.filter(entry => entry.class_id === classId);
  const sourceById = new Map(classEntries.map(entry => [entry.id, entry]));
  const runList = runListInOrder(classEntries.map(toPlacementEntry));
  const pins = runList.map(pinReason);
  const openSlots = runList.flatMap((_, index) => (pins[index] === null ? [index + 1] : []));

  return runList.map((placement, index) => {
    const pinned = pins[index] ?? null;
    const slot = openSlots.indexOf(index + 1);
    return {
      id: placement.id,
      position: index + 1,
      ...describeEntry(sourceById.get(placement.id)!),
      pinned,
      destinations: pinned ? [] : openSlots.filter(position => position !== index + 1),
      upTo: pinned || slot < 1 ? null : (openSlots[slot - 1] ?? null),
      downTo: pinned ? null : (openSlots[slot + 1] ?? null),
    };
  });
}
