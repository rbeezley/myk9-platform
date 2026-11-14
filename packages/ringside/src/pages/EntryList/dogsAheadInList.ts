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
  type QueueClaim,
} from './runQueue';

export type DogsAheadResult =
  | { kind: 'in-ring' }
  | { kind: 'waiting'; dogsAhead: number }
  /** MYK9-1970: a paper class shows its place in the running order, never a countdown. */
  | { kind: 'paper'; place: number }
  /** MYK9-1970: the server will not stand behind the order. */
  | { kind: 'stale' }
  | null;

export function computeDogsAheadInList(entries: Entry[], entryId: string): DogsAheadResult {
  const target = entries.find(entry => entry.id === entryId);
  if (!target || !isInQueue(target)) return null;
  if (isInRingEntry(target)) return { kind: 'in-ring' };

  // Waiting queue only — the in-ring dog is excluded (see INTENT above).
  const position = pendingByRunOrder(entries).findIndex(entry => entry.id === entryId);
  if (position === -1) return null;
  return { kind: 'waiting', dogsAhead: position };
}

export function formatDogsAheadInList(result: DogsAheadResult): string | null {
  if (result === null) return null;
  if (result.kind === 'in-ring') return 'In the ring';
  if (result.kind === 'paper') return formatRunQueueState(result);
  if (result.kind === 'stale') return formatRunQueueState(result);
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

/**
 * A waiting dog's count, restated for the class's claim (MYK9-1970). `paper` keeps the place
 * (dogs ahead + 1) but drops the countdown; `stale` drops the number. The in-ring dog and every
 * other result are facts, not claims, and pass through.
 */
export function applyClaimToDogsAhead(
  result: DogsAheadResult,
  claim: QueueClaim | undefined
): DogsAheadResult {
  if (result?.kind !== 'waiting' || claim === undefined || claim === 'live') return result;
  return claim === 'paper' ? { kind: 'paper', place: result.dogsAhead + 1 } : { kind: 'stale' };
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
  /**
   * How each own entry's place may be shown (MYK9-1970), from the server's answer when there is
   * one, else the class's own paper flag. Absent means live.
   */
  claimByEntryId?: ReadonlyMap<string, QueueClaim>
): EntryListOwnership | undefined {
  if (ownEntryIds.size === 0) return undefined;
  const dogsAheadByEntryId = new Map<string, DogsAheadResult>();
  for (const entry of entries) {
    if (!ownEntryIds.has(entry.id)) continue;
    dogsAheadByEntryId.set(
      entry.id,
      entriesComplete
        ? applyClaimToDogsAhead(
            computeDogsAheadInList(entries, entry.id),
            claimByEntryId?.get(entry.id)
          )
        : null
    );
  }
  if (dogsAheadByEntryId.size === 0) return undefined;
  return { ownEntryIds, dogsAheadByEntryId, conflictLabelByEntryId };
}
