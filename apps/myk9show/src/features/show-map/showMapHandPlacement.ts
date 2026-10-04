import { buildShowArmbandMaps, resolveEntryArmband } from '@/features/_shared/entryArmband';
import { isOnClassRunList } from '@/features/_shared/entryAccounting';
import { toRunQueueEntry } from '@/features/at-show/replicatedRunQueue';
import type { ReplicatedArmband } from '@/services/replication/ReplicatedArmbandsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import {
  buildRunOrderPlacementModel,
  type PlacementInput,
  type PlacementMove,
  type PlacementRow,
  type RunOrderPlacementModel,
} from './runOrderPlacementModel';
import type { ShowMapAutoSortSnapshotItem } from './showMapRunOrderAutoSort';

// Hand placement (MYK9-972, MYK9-990). Only dogs still waiting to run are
// reorderable; dogs that ran or are in the ring are listed read-only. Ordering,
// membership and numbering live in `runOrderPlacementModel.ts` only. The panel
// and the mutation both get the model from `buildClassPlacement`, built from the
// same replicated rows and armbands, so what is shown is what a write targets.
// A preset pressed afterwards re-sorts every waiting dog, so it replaces hand
// placements; there is no stored flag.

export type HandPlacementChange = PlacementMove;

export interface ClassPlacement {
  model: RunOrderPlacementModel;
  entriesById: ReadonlyMap<string, ReplicatedEntry>;
}

function toPlacementInput(
  entry: ReplicatedEntry,
  maps: ReturnType<typeof buildShowArmbandMaps<ReplicatedArmband>>
): PlacementInput {
  // The canonical queue row, plus the "has run / in the ring" signals the
  // queue adapter does not read. A dog is only "in the ring" by ring_entry_time
  // while it is still runnable and unscored.
  const queue = toRunQueueEntry(entry);
  const checkIn = entry.checkInStatus ?? entry.check_in_status;
  const ran =
    Boolean(entry.scoringCompletedAt ?? entry.scoring_completed_at) || checkIn === 'completed';
  return {
    id: entry.id,
    armband: resolveEntryArmband(entry, maps),
    runOrder: entry.runOrder ?? null,
    onRunList: isOnClassRunList({
      entryStatus: entry.entryStatus ?? entry.status,
      deletedAt: entry.deletedAt ?? entry.deleted_at,
    }),
    isScored: Boolean(queue.isScored) || ran,
    status: queue.status,
    pulled: checkIn === 'pulled',
    inRing: Boolean(queue.inRing) || (Boolean(entry.ring_entry_time) && queue.status !== 'pulled'),
  };
}

/** The one place a class's replicated rows become the placement model. */
export function buildClassPlacement(
  entries: readonly ReplicatedEntry[],
  armbands: readonly ReplicatedArmband[]
): ClassPlacement {
  const maps = buildShowArmbandMaps(armbands);
  return {
    model: buildRunOrderPlacementModel(entries.map(entry => toPlacementInput(entry, maps))),
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
  /** 1-based place in the waiting list, computed here, not the stored number. */
  position: number;
  label: string;
  subtitle: string | null;
  /** Places this dog can be sent to, never including its own. */
  destinations: number[];
  upTo: number | null;
  downTo: number | null;
}

/** A dog shown read-only below the reorder list. */
export interface HandPlacementReadOnlyRow {
  id: string;
  label: string;
  subtitle: string | null;
  /** "Pulled" for a pulled dog, null otherwise. */
  note: string | null;
}

export interface HandPlacementSections {
  waiting: HandPlacementRow[];
  inRing: HandPlacementReadOnlyRow[];
  completed: HandPlacementReadOnlyRow[];
}

function describe(
  row: PlacementRow,
  entriesById: ReadonlyMap<string, ReplicatedEntry>
): { label: string; subtitle: string | null } {
  const entry = entriesById.get(row.id);
  const dog = entry?.dogCallName || 'Dog';
  return {
    label: row.armband ? `#${row.armband} ${dog}` : dog,
    subtitle: entry?.handler || null,
  };
}

export function buildHandPlacementSections({
  model,
  entriesById,
}: ClassPlacement): HandPlacementSections {
  const count = model.waiting.length;
  const readOnly = (row: PlacementRow): HandPlacementReadOnlyRow => ({
    id: row.id,
    ...describe(row, entriesById),
    note: row.pulled ? 'Pulled' : null,
  });
  return {
    waiting: model.waiting.map((row, index) => {
      const position = index + 1;
      return {
        id: row.id,
        position,
        ...describe(row, entriesById),
        destinations: Array.from({ length: count }, (_, i) => i + 1).filter(p => p !== position),
        upTo: position > 1 ? position - 1 : null,
        downTo: position < count ? position + 1 : null,
      };
    }),
    inRing: model.inRing.map(readOnly),
    completed: model.finished.map(readOnly),
  };
}
