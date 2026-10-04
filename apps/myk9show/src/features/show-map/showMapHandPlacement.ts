import { buildShowArmbandMaps, resolveEntryArmband } from '@/features/_shared/entryArmband';
import type { ReplicatedArmband } from '@/services/replication/ReplicatedArmbandsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import {
  buildRunOrderPlacementModel,
  type PlacementInput,
  type PlacementMove,
  type PlacementPinReason,
  type PlacementSlot,
} from './runOrderPlacementModel';
import type { ShowMapAutoSortSnapshotItem } from './showMapRunOrderAutoSort';

// Hand placement (MYK9-972). Positions are slots in the SAME run list the
// presets sort and `runQueue.ts` reads; ordering, membership and pinning live
// in `runOrderPlacementModel.ts` only. The panel and the mutation both get
// their slots from `buildClassPlacement`, built from the same replicated rows
// and armbands, so what is shown is what a write targets. A preset pressed
// afterwards re-sorts every unpinned dog, so it replaces hand placements;
// there is no stored flag.

export type HandPlacementChange = PlacementMove;
export type HandPlacementPinReason = PlacementPinReason;

export interface ClassPlacement {
  slots: PlacementSlot[];
  entriesById: ReadonlyMap<string, ReplicatedEntry>;
}

function toPlacementInput(
  entry: ReplicatedEntry,
  maps: ReturnType<typeof buildShowArmbandMaps<ReplicatedArmband>>
): PlacementInput {
  return {
    id: entry.id,
    armband: resolveEntryArmband(entry, maps),
    runOrder: entry.runOrder ?? null,
    entryStatus: entry.entryStatus ?? entry.status,
    deletedAt: entry.deletedAt ?? entry.deleted_at,
    isScored: Boolean(entry.isScored ?? entry.is_scored),
    scoringCompletedAt: entry.scoringCompletedAt ?? entry.scoring_completed_at,
    checkInStatus: entry.checkInStatus ?? entry.check_in_status,
    isInRing: Boolean(entry.isInRing ?? entry.is_in_ring),
    ringEntryTime: entry.ring_entry_time,
  };
}

/** The one place a class's replicated rows become placement slots. */
export function buildClassPlacement(
  entries: readonly ReplicatedEntry[],
  armbands: readonly ReplicatedArmband[]
): ClassPlacement {
  const maps = buildShowArmbandMaps(armbands);
  return {
    slots: buildRunOrderPlacementModel(entries.map(entry => toPlacementInput(entry, maps))),
    entriesById: new Map(entries.map(entry => [entry.id, entry])),
  };
}

export function toPriorSnapshot(
  changes: readonly HandPlacementChange[]
): ShowMapAutoSortSnapshotItem[] {
  return changes.map(change => ({ id: change.id, runOrder: change.priorRunOrder }));
}

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

export function buildHandPlacementRows({ slots, entriesById }: ClassPlacement): HandPlacementRow[] {
  const openSlots = slots.filter(slot => !slot.pinned).map(slot => slot.position);
  return slots.map(slot => {
    const entry = entriesById.get(slot.id);
    const dog = entry?.dogCallName || 'Dog';
    const open = openSlots.indexOf(slot.position);
    return {
      id: slot.id,
      position: slot.position,
      label: slot.armband ? `#${slot.armband} ${dog}` : dog,
      subtitle: entry?.handler || null,
      pinned: slot.pinned,
      destinations: slot.pinned ? [] : openSlots.filter(position => position !== slot.position),
      upTo: slot.pinned || open < 1 ? null : (openSlots[open - 1] ?? null),
      downTo: slot.pinned ? null : (openSlots[open + 1] ?? null),
    };
  });
}
