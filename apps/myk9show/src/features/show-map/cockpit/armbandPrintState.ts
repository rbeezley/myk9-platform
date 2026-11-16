import { buildPrintedLabelIndex, labelPrintStatus } from '@/lib/labels/armbandPrintIndex';

import type { PaperworkDescriptor, PaperworkPrintEvidence } from './paperworkPrintState';

/** A print the panel marked as one dog's label (`coverage.oneDog`). */
const isOneDogPrint = (record: PaperworkPrintEvidence): boolean => record.coverage.oneDog === true;

/**
 * The armband labels card's print state, per dog and day (MYK9-2073). Prints of labels are
 * partial by nature (one dog, a day, only what was added), so "the newest record wins" would let
 * one reprint speak for the whole class. Each current label is judged by the newest print that
 * holds it; the card is printed when every label is, stale when any label changed or was added
 * after the others printed, and not confirmed when nothing was printed. The existing states
 * carry all three; no new state is needed.
 */
export function deriveArmbandPrintState(
  records: readonly PaperworkPrintEvidence[],
  current: PaperworkDescriptor
): {
  state: 'current' | 'stale' | 'unconfirmed';
  record: PaperworkPrintEvidence | null;
  staleSubjectKeys: readonly string[];
} {
  const index = buildPrintedLabelIndex(records);
  const subjects = current.coverage.subjectFingerprints;
  const covering: PaperworkPrintEvidence[] = [];
  let changed = false;
  let unprinted = false;
  const staleSubjectKeys: string[] = [];
  for (const [key, fingerprint] of Object.entries(subjects)) {
    const status = labelPrintStatus(index, key, fingerprint);
    const held = index.get(key);
    if (held) covering.push(held.record);
    if (status === 'changed') changed = true;
    if (status === 'not-printed') unprinted = true;
    if (status !== 'printed') staleSubjectKeys.push(key);
  }
  if (covering.length === 0) return { state: 'unconfirmed', record: null, staleSubjectKeys: [] };
  const newestFirst = [...covering].sort((left, right) =>
    right.printedAt.localeCompare(left.printedAt)
  );
  // A one-dog reprint says nothing about the rest of the class, so the card names the real print.
  const fullPrint = newestFirst.find(record => !isOneDogPrint(record));
  // "Stale" means printed, then the class changed. Labels added after a real print, or any
  // label that changed, are that. Only one dog's label ever printed is simply not confirmed.
  const state =
    changed || (unprinted && fullPrint) ? 'stale' : unprinted ? 'unconfirmed' : 'current';
  return {
    state,
    record: fullPrint ?? newestFirst[0] ?? null,
    staleSubjectKeys: staleSubjectKeys.sort(),
  };
}
