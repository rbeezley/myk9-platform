/**
 * dogsAheadInList — queue position for an entry within the class's live run
 * order, computed from the SAME entries array the list renders so the pill can
 * never disagree with the visible list.
 *
 * Semantics match the platform's existing `computeDogsAhead` convention: the
 * in-ring dog counts as "ahead", so 0 = "you're next" means every entry before
 * yours is scored and the gate is yours NOW.
 */

import type { Entry } from '../../stores/entryStore';

export type DogsAheadResult = { kind: 'in-ring' } | { kind: 'waiting'; dogsAhead: number } | null;

function isInRing(entry: Entry): boolean {
  return entry.inRing === true || entry.status === 'in-ring';
}

/** Entries still due to run: unscored and not pulled from the class. */
function isInQueue(entry: Entry): boolean {
  return !entry.isScored && entry.status !== 'pulled';
}

/** Run-order comparator (mirrors the `run` sort: exhibitorOrder, armband fallback). */
function byRunOrder(a: Entry, b: Entry): number {
  return (a.exhibitorOrder || a.armband) - (b.exhibitorOrder || b.armband);
}

export function computeDogsAheadInList(entries: Entry[], entryId: string): DogsAheadResult {
  const target = entries.find(entry => entry.id === entryId);
  if (!target || !isInQueue(target)) return null;
  if (isInRing(target)) return { kind: 'in-ring' };

  const queue = entries.filter(isInQueue).sort((a, b) => {
    // In-ring first — the display list floats it to the top for the same reason.
    if (isInRing(a) !== isInRing(b)) return isInRing(a) ? -1 : 1;
    return byRunOrder(a, b);
  });

  const position = queue.findIndex(entry => entry.id === entryId);
  if (position === -1) return null;
  return { kind: 'waiting', dogsAhead: position };
}

export function formatDogsAheadInList(result: DogsAheadResult): string | null {
  if (result === null) return null;
  if (result.kind === 'in-ring') return 'In the ring';
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
}

export function buildEntryListOwnership(
  entries: Entry[],
  ownEntryIds: ReadonlySet<string>
): EntryListOwnership | undefined {
  if (ownEntryIds.size === 0) return undefined;
  const dogsAheadByEntryId = new Map<string, DogsAheadResult>();
  for (const entry of entries) {
    if (!ownEntryIds.has(entry.id)) continue;
    dogsAheadByEntryId.set(entry.id, computeDogsAheadInList(entries, entry.id));
  }
  if (dogsAheadByEntryId.size === 0) return undefined;
  return { ownEntryIds, dogsAheadByEntryId };
}
