import type { ScoreData, ScoresheetEntry } from '../types/scoreData';

/** The timer options that keep a run across a restart (MYK9-2007). */
export function timerPersist(entry: ScoresheetEntry): {
  persistKey: string;
  hasSavedScore: boolean;
} {
  return {
    persistKey: entry.id,
    hasSavedScore: Boolean(entry.existingScore || entry.hasSavedScore),
  };
}

/** The saved score a sheet reopens on, and the timers its save retires. */
export function scoringSource(entry: ScoresheetEntry): {
  existingScore?: ScoreData;
  timerKey: string;
} {
  return {
    ...(entry.existingScore && { existingScore: entry.existingScore }),
    timerKey: entry.id,
  };
}
