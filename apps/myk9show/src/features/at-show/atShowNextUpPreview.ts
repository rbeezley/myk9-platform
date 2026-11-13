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

import {
  getClassIds,
  isCombinedEntry,
  type ClassEntry,
  type EffectiveClassStatus,
} from '@myk9/ringside';
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
 * `no-status`, `setup`, `start_time` and `completed`: a preview there would be
 * noise, and the row's tap target must stay uncluttered. `break` is included:
 * the class is still in progress and the run order matters when judging resumes
 * (before MYK9-1513 a break reached the card as `in_progress` and kept the preview).
 */
const LIVE_STATUSES = new Set<EffectiveClassStatus>([
  'briefing',
  'break',
  'in-progress',
  'offline-scoring',
]);

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
 * Pick the preview for a class card. A combined A & B card (one row for both
 * sections) is built from the MERGED entries of both sections, through the same
 * run-queue rule the combined entry list uses, so the card and the list always
 * name the same next dog and the counts above describe the same dogs. Before
 * MYK9-1809 the card showed ONE section's preview beside a counter that summed
 * both. A single-section card reads its own class preview unchanged.
 */
export function selectNextUpForCard(
  entry: ClassEntry,
  previews: ReadonlyMap<string, AtShowNextUpPreview>,
  entriesByClassId: ReadonlyMap<string, ReplicatedEntry[]>
): AtShowNextUpPreview | undefined {
  if (!isCombinedEntry(entry)) return previews.get(entry.id);

  const classIds = getClassIds(entry);
  if (!classIds.some(id => entriesByClassId.has(id))) return previews.get(entry.id);
  return buildNextUpPreview(classIds.flatMap(id => entriesByClassId.get(id) ?? []));
}
