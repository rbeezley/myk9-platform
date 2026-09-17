/**
 * atShowNextUpPreview — "who's in the ring, who's next" for one class row.
 *
 * myK9Q's class cards answered "do I need to head to the ring?" without opening
 * the entry list: the in-ring armband with an amber dot, the next few waiting
 * armbands in run order, and how many dogs are left. This module rebuilds that
 * line from offline-first replicated entries.
 *
 * Ordering is NOT re-derived here — it delegates entirely to
 * `replicatedRunQueue`, which wraps the shared `@myk9/ringside` run-queue
 * primitive. That keeps the class row, the scoresheet, and ringside on one rule.
 * In particular the in-ring dog is excluded from the waiting queue (INTENT, user
 * decision 2026-06-11) — "next" means "next after the dog currently running".
 */

import type { EffectiveClassStatus } from '@myk9/ringside';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { countEntryAccounting } from '@/features/_shared/entryAccounting';
import { inRingReplicated, nextPendingReplicated } from './replicatedRunQueue';

/** How many waiting armbands the row previews (myK9Q showed 3). */
export const NEXT_UP_PREVIEW_LIMIT = 3;

export interface AtShowNextUpPreview {
  /** Armband of the dog in the ring, or null when none is running. */
  inRingArmband: string | null;
  /** Next waiting armbands in run order, in-ring dog excluded. */
  nextArmbands: string[];
  /** Dogs still to run, including the one in the ring. */
  remaining: number;
  /** Dogs the show expects to run (withdrawn / pulled / moved excluded). */
  total: number;
}

/**
 * Class statuses where a next-up line helps. Deliberately excludes
 * `no-status`, `setup`, `break`, `start_time` and `completed`: a preview there
 * would be noise, and the row's tap target must stay uncluttered.
 */
const LIVE_STATUSES = new Set<EffectiveClassStatus>(['briefing', 'in-progress', 'offline-scoring']);

export function isLiveNextUpStatus(status: EffectiveClassStatus): boolean {
  return LIVE_STATUSES.has(status);
}

function armbandOf(entry: ReplicatedEntry): string | null {
  const raw = entry.armband ?? entry.armbandNumber;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** Build the row preview for one class from its replicated entries. */
export function buildNextUpPreview(entries: ReplicatedEntry[]): AtShowNextUpPreview {
  const inRing = inRingReplicated(entries);
  const nextArmbands = nextPendingReplicated(entries, NEXT_UP_PREVIEW_LIMIT)
    .map(armbandOf)
    .filter((armband): armband is string => armband !== null);

  // ONE membership rule, one ordering rule. `entryAccounting` answers who the
  // show expects to run -- for the counts here AND, since MYK9-645 round 4, for
  // `replicatedRunQueue`'s own `queueStatus`. The queue then answers only the
  // ORDER: who is in the ring, who is next.
  //
  // Both halves of that were separately wrong. Deriving `total` from the
  // queue's exclusions made this line a third counting rule (a 9-runner class
  // read "10 of 10 remaining" above "0 / 9"); and while the queue kept its own
  // status list, a `moved` entry stayed in the ORDER, so the card announced a
  // dog as next up that the counts had already excluded.
  //
  // `remaining` still counts the in-ring dog: an exhibitor deciding whether to
  // walk to the ring cares about dogs still to run, not dogs still queued.
  const counts = countEntryAccounting(entries);

  return {
    inRingArmband: inRing ? armbandOf(inRing) : null,
    nextArmbands,
    remaining: counts.expected - counts.accounted,
    total: counts.expected,
  };
}

/** True when the preview carries nothing worth a second line. */
export function isEmptyNextUpPreview(preview: AtShowNextUpPreview | undefined): boolean {
  return !preview || (preview.inRingArmband === null && preview.nextArmbands.length === 0);
}

/**
 * Pick the preview for a card that may cover several classes (Novice A & B pairs
 * are rendered as one row). Prefer the class that actually has a dog in the
 * ring; otherwise the first class with anyone waiting; otherwise the first
 * known preview so the remaining count still renders.
 */
export function selectNextUpForCard(
  classIds: string[],
  previews: ReadonlyMap<string, AtShowNextUpPreview>
): AtShowNextUpPreview | undefined {
  const candidates = classIds
    .map(id => previews.get(id))
    .filter((preview): preview is AtShowNextUpPreview => preview !== undefined);

  return (
    candidates.find(preview => preview.inRingArmband !== null) ??
    candidates.find(preview => preview.nextArmbands.length > 0) ??
    candidates[0]
  );
}
