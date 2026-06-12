/**
 * dogsAheadInList — queue position for an entry within the class's live run
 * order, computed from the SAME entries array the list renders so the pill can
 * never disagree with the visible list.
 *
 * INTENT (user decision 2026-06-11): the in-ring dog is EXCLUDED from the
 * count — "You're next" shows while a dog is still in the ring, because that is
 * how exhibitors think about the queue ("I'm next after this one"). This
 * deliberately diverges from the legacy `computeDogsAhead` convention in
 * apps/myk9show/src/utils/dogsAhead.ts, which counted the in-ring dog.
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

  // Waiting queue only — the in-ring dog is excluded (see INTENT above).
  const queue = entries
    .filter(entry => isInQueue(entry) && !isInRing(entry))
    .sort(byRunOrder);

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
  conflictLabelByEntryId?: ReadonlyMap<string, string>
): EntryListOwnership | undefined {
  if (ownEntryIds.size === 0) return undefined;
  const dogsAheadByEntryId = new Map<string, DogsAheadResult>();
  for (const entry of entries) {
    if (!ownEntryIds.has(entry.id)) continue;
    dogsAheadByEntryId.set(entry.id, computeDogsAheadInList(entries, entry.id));
  }
  if (dogsAheadByEntryId.size === 0) return undefined;
  return { ownEntryIds, dogsAheadByEntryId, conflictLabelByEntryId };
}
