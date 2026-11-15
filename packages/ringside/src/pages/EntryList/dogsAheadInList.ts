/**
 * dogsAheadInList — queue position for an entry within the class's live run
 * order, computed from the SAME entries array the list renders so the pill can
 * never disagree with the visible list.
 *
 * INTENT (user decision 2026-06-11): the in-ring dog is EXCLUDED from the
 * count — "You're next" shows while a dog is still in the ring, because that is
 * how exhibitors think about the queue ("I'm next after this one"). This
 * deliberately diverges from the legacy `computeDogsAhead` convention, which
 * counted the in-ring dog; every app-side counterpart has since been
 * consolidated onto this rule and the legacy helper deleted.
 *
 * The ordering rule itself now lives in ./runQueue — this module is the
 * exhibitor-facing "how far away am I" projection of it.
 */

import type { Entry } from '../../stores/entryStore';
import {
  formatRunQueueState,
  isInQueue,
  isInRingEntry,
  pendingByRunOrder,
  type ClaimState,
} from './runQueue';

/**
 * `paper` and `stale` (MYK9-1970) are never a countdown: a paper class reports its position in
 * the running order, a quiet phone class says the order may be out of date.
 */
export type DogsAheadResult =
  | { kind: 'in-ring' }
  | { kind: 'waiting'; dogsAhead: number }
  | { kind: 'paper'; place: number }
  | { kind: 'stale' }
  | null;

export function computeDogsAheadInList(
  entries: Entry[],
  entryId: string,
  /** The server's claim state for this entry (MYK9-1969); `live` or absent counts as before. */
  claim?: ClaimState | null
): DogsAheadResult {
  const target = entries.find(entry => entry.id === entryId);
  if (!target || !isInQueue(target)) return null;
  if (isInRingEntry(target)) return { kind: 'in-ring' };

  // Waiting queue only — the in-ring dog is excluded (see INTENT above).
  const position = pendingByRunOrder(entries).findIndex(entry => entry.id === entryId);
  if (position === -1) return null;
  // MYK9-1970: a paper class never gets a count of dogs ahead, only its place in the running order.
  if (claim === 'paper') return { kind: 'paper', place: position + 1 };
  if (claim === 'stale') return { kind: 'stale' };
  return { kind: 'waiting', dogsAhead: position };
}

export function formatDogsAheadInList(result: DogsAheadResult): string | null {
  if (result === null) return null;
  if (result.kind === 'in-ring') return 'In the ring';
  if (result.kind === 'paper' || result.kind === 'stale') return formatRunQueueState(result);
  if (result.dogsAhead === 0) return "You're next";
  if (result.dogsAhead === 1) return '1 dog ahead';
  return `${result.dogsAhead} dogs ahead`;
}

/**
 * Ownership annotations the host shim passes into the entry list pages.
 * Built from the shim's `localEntries` (the array the page renders) plus the
 * account's own-entry id set.
 */
export interface EntryListOwnership {
  ownEntryIds: ReadonlySet<string>;
  dogsAheadByEntryId: ReadonlyMap<string, DogsAheadResult>;
  /**
   * Ring-conflict annotations: entry id → human label describing the OTHER
   * class ("Also 2 away in Container Master"). Computed app-side from
   * show-wide replicated data; ringside only renders.
   */
  conflictLabelByEntryId?: ReadonlyMap<string, string>;
}

export function buildEntryListOwnership(
  entries: Entry[],
  ownEntryIds: ReadonlySet<string>,
  conflictLabelByEntryId?: ReadonlyMap<string, string>,
  /**
   * False while the show's entries have not all arrived on this device (MYK9-1809): a count over
   * a partial list would put the dog in the wrong place in line, so no place is shown.
   */
  entriesComplete = true,
  /** The claim state per own entry: the server's answer, or `paper` from the class it is in. */
  claimByEntryId?: ReadonlyMap<string, ClaimState>
): EntryListOwnership | undefined {
  if (ownEntryIds.size === 0) return undefined;
  const dogsAheadByEntryId = new Map<string, DogsAheadResult>();
  for (const entry of entries) {
    if (!ownEntryIds.has(entry.id)) continue;
    dogsAheadByEntryId.set(
      entry.id,
      entriesComplete
        ? computeDogsAheadInList(
            entries,
            entry.id,
            // A supplied map decides every own entry: no claim in it is never a live count.
            claimByEntryId ? (claimByEntryId.get(entry.id) ?? 'stale') : undefined
          )
        : null
    );
  }
  if (dogsAheadByEntryId.size === 0) return undefined;
  return { ownEntryIds, dogsAheadByEntryId, conflictLabelByEntryId };
}
