/**
 * quickAdvanceReplicated — turns offline-first `ReplicatedEntry` rows into the
 * post-save "up next" chips (MYK9-83).
 *
 * INTENT (product decision, MYK9-83): these chips are a SHORTCUT, never a
 * prediction. Run order holds only about half the time at the gate, so we
 * surface three candidates and let the judge or timer steward pick the dog that
 * physically walked up — nothing here navigates on its own.
 *
 * Each chip carries the BREED as well as armband and call name: at an
 * unfamiliar ring the breed is the fastest visual match ("the golden that just
 * walked up"), which a name or number alone can't give.
 *
 * Ranking is entirely ringside's `quickAdvanceCandidates` — the same gate-aware
 * layer over the shared run queue the entry list uses — so at-gate promotion
 * and the "in-ring dog is not in the queue" semantic stay in one place.
 */

import { quickAdvanceCandidates, gateStatusLabel, type QuickAdvanceEntry } from '@myk9/ringside';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { toRunQueueEntry } from './replicatedRunQueue';

/** Everything a chip renders, resolved at render time (no stale locking). */
export interface QuickAdvanceChip {
  entryId: string;
  /** Display armband, e.g. "412". Empty when the row has none. */
  armband: string;
  callName: string;
  breed: string;
  /** "At gate" / "Called to gate" when a status exists, otherwise null. */
  gateLabel: string | null;
}

export const QUICK_ADVANCE_CHIP_LIMIT = 3;

interface ReplicatedQuickAdvanceEntry extends QuickAdvanceEntry {
  entry: ReplicatedEntry;
}

/**
 * `toRunQueueEntry` already resolves the show-day check-in axis (where `pulled`
 * and `in-ring` live) ahead of the entry lifecycle, so queue membership needs no
 * extra filtering here. This only carries the raw check-in status through for
 * gate ranking, which needs `at-gate` / `come-to-gate` specifically.
 */
function toQuickAdvanceEntry(entry: ReplicatedEntry): ReplicatedQuickAdvanceEntry {
  return {
    ...toRunQueueEntry(entry),
    checkInStatus: entry.checkInStatus ?? entry.check_in_status,
  };
}

function toChip(row: ReplicatedQuickAdvanceEntry): QuickAdvanceChip {
  const { entry } = row;
  return {
    entryId: entry.id,
    armband: entry.armband ?? entry.armbandNumber ?? '',
    callName: entry.dogCallName ?? '',
    breed: entry.dogBreed ?? '',
    gateLabel: gateStatusLabel(row),
  };
}

export interface QuickAdvanceChipOptions {
  /** The entry just scored — excluded even if its row hasn't settled yet. */
  excludeEntryId?: string | undefined;
  limit?: number | undefined;
}

/**
 * Up to `limit` one-tap candidates, best first. Empty when the class has no
 * dogs left to run — callers render nothing rather than an empty shell.
 */
export function toQuickAdvanceChips(
  entries: readonly ReplicatedEntry[],
  { excludeEntryId, limit = QUICK_ADVANCE_CHIP_LIMIT }: QuickAdvanceChipOptions = {}
): QuickAdvanceChip[] {
  const rows = entries.filter(entry => entry.id !== excludeEntryId).map(toQuickAdvanceEntry);
  return quickAdvanceCandidates(rows, limit).map(toChip);
}

/** One-line chip label: "#412 Bella — Golden Retriever", degrading gracefully. */
export function formatChipLabel(chip: QuickAdvanceChip): string {
  const identity = [chip.armband ? `#${chip.armband}` : '', chip.callName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const name = identity || 'Next dog';
  return chip.breed ? `${name} — ${chip.breed}` : name;
}
