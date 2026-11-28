/**
 * The score a judge just saved, as the entry list's "Saved:" line shows it
 * (MYK9-2012).
 *
 * INTENT (MYK9-2012, owner decision 2026-11-14): after a confirmed save the app
 * returns to the class's entry list by itself and says what was saved. It never
 * chooses or suggests the next dog: dogs seldom come in the ring in run order
 * because several rings run at once, and a judge scores whoever walks in. The
 * line stays until she opens another dog.
 *
 * Held in memory, not router state, so going back from the next dog's sheet
 * cannot bring an old line back. A reload drops it, which is fine: the score
 * itself is on the device and on the list.
 */

import { create } from 'zustand';
import type { ScoreData } from '@myk9/scoring-ui';
import { formatSecondsAsMSSCC } from '@/lib/format/searchTime';

export interface SavedScore {
  entryId: string;
  /** Armband and call name, e.g. "100 Willow". */
  dogLabel: string;
  /** "Qualified". */
  resultLabel: string;
  /** "0:04.35", or null when the result carries no time (an excused dog, say). */
  timeLabel: string | null;
  /** "0:09.10": the UKC element time, when the sheet recorded one (MYK9-2068). */
  elementLabel?: string | null;
  /** The entry list the judge returns to (path only). */
  listPath: string;
  /** The scoresheet route that reopens this dog with what was saved. */
  scoreRoute: string;
  /** Where the list was scrolled when the dog was opened; the list returns to it once. */
  scrollY?: number;
}

const RESULT_LABELS: Record<string, string> = {
  Q: 'Qualified',
  NQ: 'Not qualified',
  EX: 'Excused',
  DQ: 'Disqualified',
  ABS: 'Absent',
};

const CLOCK_TIME = /^\d{1,2}:[0-5]\d(\.\d{1,2})?$/;

/** A time the sheet submitted, as the judge reads it: no leading zero on the minutes. */
export function describeSavedTime(searchTime: string | undefined): string | null {
  const raw = (searchTime ?? '').trim();
  if (!raw) return null;
  if (CLOCK_TIME.test(raw)) {
    const shown = raw.replace(/^0(\d:)/, '$1');
    return shown === '0:00' || shown === '0:00.00' ? null : shown;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return formatSecondsAsMSSCC(seconds);
}

/** What the scoresheet knows at save time; the page adds the routes. */
export interface SavedScoreInput {
  entryId: string;
  armband: number | string | null | undefined;
  callName: string;
  scoreData: Pick<ScoreData, 'resultText' | 'searchTime'> & Partial<Pick<ScoreData, 'element'>>;
}

export function toSavedScore(
  input: SavedScoreInput,
  routes: Pick<SavedScore, 'listPath' | 'scoreRoute' | 'scrollY'>
): SavedScore {
  const { scoreData } = input;
  const dogLabel = [input.armband == null ? '' : String(input.armband), input.callName]
    .filter(Boolean)
    .join(' ');
  return {
    entryId: input.entryId,
    dogLabel: dogLabel || 'This dog',
    resultLabel: RESULT_LABELS[scoreData.resultText] ?? scoreData.resultText,
    timeLabel: describeSavedTime(scoreData.searchTime),
    ...(describeSavedTime(scoreData.element)
      ? { elementLabel: describeSavedTime(scoreData.element) }
      : {}),
    ...routes,
  };
}

interface SavedScoreState {
  saved: SavedScore | null;
  set: (saved: SavedScore) => void;
  clear: () => void;
  /** That dog's score was cleared: drop the line only if it names that dog (MYK9-2518). */
  forget: (entryId: string) => void;
  /** The list has scrolled back; do not do it again if the line remounts. */
  clearScroll: () => void;
}

export const useSavedScoreStore = create<SavedScoreState>()(set => ({
  saved: null,
  set: saved => set({ saved }),
  clear: () => set({ saved: null }),
  forget: entryId => set(state => (state.saved?.entryId === entryId ? { saved: null } : state)),
  clearScroll: () =>
    set(state => {
      if (!state.saved) return state;
      const { entryId, dogLabel, resultLabel, timeLabel, elementLabel, listPath, scoreRoute } =
        state.saved;
      return {
        saved: {
          entryId,
          dogLabel,
          resultLabel,
          timeLabel,
          ...(elementLabel ? { elementLabel } : {}),
          listPath,
          scoreRoute,
        },
      };
    }),
}));
