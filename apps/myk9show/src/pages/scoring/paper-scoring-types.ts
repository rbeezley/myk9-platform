/** Display codes used in UI buttons */
export type PaperResult = 'Q' | 'NQ' | 'ABS' | 'EX';

/** Layout mode — persisted in localStorage */
export type PaperScoringMode = 'split' | 'sequential';

/** Whether to show a time field for non-qualifying results */
export type TimeRecordMode = 'q-only' | 'all-runs';

/** Pre-selected result that is highlighted (but not saved) when a dog's panel opens */
export type PreFillOption = 'none' | 'Q' | 'NQ';

export interface SessionSettings {
  preFill: PreFillOption;
  timeRecordMode: TimeRecordMode;
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  preFill: 'none',
  timeRecordMode: 'q-only',
};

/**
 * Convert a TimeInput digit string to floating-point seconds.
 * "12345" → digits padded to "012345" → 1 min 23.45 sec → 83.45
 * "" or "0" → 0
 */
export function digitsToSeconds(digits: string): number {
  if (!digits || digits === '0') return 0;
  const padded = digits.padStart(6, '0');
  const min = parseInt(padded.slice(0, 2), 10);
  const sec = parseInt(padded.slice(2, 4), 10);
  const hundredths = parseInt(padded.slice(4, 6), 10);
  return min * 60 + sec + hundredths / 100;
}

/** localStorage key for persisting mode preference per user */
export function modeStorageKey(userId: string): string {
  return `paper-scoring-mode:${userId}`;
}

/** Sort entries by exhibitorOrder ascending (stable copy). */
export function sortByExhibitorOrder<T extends { exhibitorOrder: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);
}
