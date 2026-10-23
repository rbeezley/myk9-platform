/**
 * Prop comparison for the memoised SortableEntryCard (MYK9-1365).
 *
 * The page rebuilds `entries` on every replication nudge, so a card's `entry`
 * is usually a new object that holds the same values; comparing by identity
 * would re-render all 60 cards for one dog's check-in. Entry rows are flat
 * (primitives only), so a shallow field compare is exact. `dogsAhead` is
 * rebuilt per entry on every list change for the same reason and compares by
 * value; every other prop compares by identity, which is why the list hands
 * the card stable callbacks.
 */

import type { Entry } from '../../stores/entryStore';
import type { DogsAheadResult } from './dogsAheadInList';
import type { SortableEntryCardProps } from './SortableEntryCard';

export function areEntriesEqual(a: Entry, b: Entry): boolean {
  if (a === b) return true;
  const aRecord = a as unknown as Record<string, unknown>;
  const bRecord = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);
  for (const key of keys) {
    if (!Object.is(aRecord[key], bRecord[key])) return false;
  }
  return true;
}

export function areDogsAheadEqual(a: DogsAheadResult | undefined, b: DogsAheadResult | undefined) {
  if (a === b) return true;
  if (!a || !b) return (a ?? null) === (b ?? null);
  if (a.kind !== b.kind) return false;
  return a.kind === 'waiting' && b.kind === 'waiting' ? a.dogsAhead === b.dogsAhead : true;
}

export function areSortableEntryCardPropsEqual(
  prev: SortableEntryCardProps,
  next: SortableEntryCardProps
): boolean {
  const prevRecord = prev as unknown as Record<string, unknown>;
  const nextRecord = next as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(prevRecord), ...Object.keys(nextRecord)]);
  for (const key of keys) {
    if (key === 'entry') {
      if (!areEntriesEqual(prev.entry, next.entry)) return false;
    } else if (key === 'dogsAhead') {
      if (!areDogsAheadEqual(prev.dogsAhead, next.dogsAhead)) return false;
    } else if (!Object.is(prevRecord[key], nextRecord[key])) {
      return false;
    }
  }
  return true;
}
