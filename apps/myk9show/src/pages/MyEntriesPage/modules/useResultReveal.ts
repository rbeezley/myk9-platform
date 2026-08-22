/**
 * Result-reveal state for My Shows: which reveals the exhibitor has already
 * seen, and the `?resultEntryId=` deep link that opens one directly.
 *
 * Extracted from `index.tsx` (MYK9-217). Putting it here sets both of the
 * page's inbound URL readers side by side in `modules/` — this and
 * `entryScopeFilter` — and lets the deep link be tested without mounting the
 * page.
 *
 * @module MyEntriesPage/modules/useResultReveal
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  buildResultCardModel,
  buildResultCardVisibility,
  hasSeenResultReveal,
  markResultRevealSeen,
  type ResultCardModel,
} from '@/features/result-card';

import { toDogEntryView } from './myEntryDogView';
import type { EntryClass, MyEntry, MyEntryDogGroup } from './my-entries-types';

/** The query param My Payments and result emails deep-link with. */
export const RESULT_ENTRY_ID_PARAM = 'resultEntryId';

/**
 * Builds the reveal model for one class row. The model is built per DOG, not
 * per order — the card needs the owning dog's identity and an order can span
 * several dogs.
 */
export function buildDogScopedResultModel(
  entry: MyEntry,
  dog: MyEntryDogGroup,
  classEntry: EntryClass
): ResultCardModel | null {
  return buildResultCardModel({
    entry: toDogEntryView(entry, dog),
    classEntry,
    visibility: buildResultCardVisibility(classEntry),
  });
}

/**
 * The release keys this browser has already revealed, across every entry ×
 * dog × class. Read from local storage, so it is per-device by design: seeing
 * a result on a phone should not silence the reveal on a laptop.
 */
export function collectSeenResultReleaseKeys(entries: MyEntry[]): Set<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    for (const dog of entry.dogs) {
      for (const cls of dog.classes) {
        const model = buildDogScopedResultModel(entry, dog, cls);
        if (model && hasSeenResultReveal(model.releaseKey)) keys.add(model.releaseKey);
      }
    }
  }
  return keys;
}

/**
 * Resolves `?resultEntryId=` to the reveal model for that class row.
 *
 * The search stops at the FIRST dog that owns the id, whether or not a model
 * could be built for it. A class row belongs to exactly one dog, so this is
 * equivalent to scanning on — it just says the intent plainly: a dog that owns
 * the row and yields no model (results not released yet) means "nothing to
 * reveal", which the caller must not mistake for a match.
 */
export function findResultRevealModel(
  entries: MyEntry[],
  resultEntryId: string
): ResultCardModel | null {
  for (const entry of entries) {
    for (const dog of entry.dogs) {
      const classEntry = dog.classes.find(cls => cls.id === resultEntryId);
      if (!classEntry) continue;
      return buildDogScopedResultModel(entry, dog, classEntry);
    }
  }
  return null;
}

export interface UseResultRevealResult {
  /** The reveal currently on screen, or null. */
  resultRevealModel: ResultCardModel | null;
  /** Opens a reveal from a card tap. */
  openResultReveal: (model: ResultCardModel) => void;
  closeResultReveal: () => void;
  seenResultReleaseKeys: Set<string>;
  /** Records a reveal as seen, in storage and in this render's set. */
  markSeen: (releaseKey: string) => void;
}

export function useResultReveal(entries: MyEntry[]): UseResultRevealResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const [resultRevealModel, setResultRevealModel] = useState<ResultCardModel | null>(null);
  const [seenResultReleaseKeys, setSeenResultReleaseKeys] = useState<Set<string>>(
    () => new Set<string>()
  );

  useEffect(() => {
    setSeenResultReleaseKeys(collectSeenResultReleaseKeys(entries));
  }, [entries]);

  useEffect(() => {
    const resultEntryId = searchParams.get(RESULT_ENTRY_ID_PARAM);
    if (!resultEntryId || resultRevealModel) return;

    const model = findResultRevealModel(entries, resultEntryId);
    if (!model) return;

    setResultRevealModel(model);
    // Strip the param once it has been honoured, so a refresh or a Back does
    // not re-open a reveal the exhibitor already dismissed.
    const next = new URLSearchParams(searchParams);
    next.delete(RESULT_ENTRY_ID_PARAM);
    setSearchParams(next, { replace: true });
  }, [entries, resultRevealModel, searchParams, setSearchParams]);

  const closeResultReveal = useCallback(() => setResultRevealModel(null), []);

  const markSeen = useCallback((releaseKey: string) => {
    markResultRevealSeen(releaseKey);
    setSeenResultReleaseKeys(prev => {
      if (prev.has(releaseKey)) return prev;
      const next = new Set(prev);
      next.add(releaseKey);
      return next;
    });
  }, []);

  return {
    resultRevealModel,
    openResultReveal: setResultRevealModel,
    closeResultReveal,
    seenResultReleaseKeys,
    markSeen,
  };
}
