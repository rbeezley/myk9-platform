import { formatTimeLimitSeconds } from '@myk9/scoring-ui';
import { parseSearchTimeDigits } from '@/components/ui/data-table/sorting';

/** Display codes used in UI buttons */
export type PaperResult = 'Q' | 'NQ' | 'ABS' | 'EX' | 'DQ';

export const PAPER_NQ_REASONS = [
  'Incorrect Call',
  'Max Time',
  'Point to Hide',
  'Harsh Correction',
  'Significant Disruption',
] as const;

export const PAPER_EXCUSED_REASONS = [
  'Dog Eliminated in Area',
  'Handler Request',
  'Out of Control',
  'Overly Stressed',
  'Other',
] as const;

export function resultRequiresReason(result: PaperResult | null): result is 'NQ' | 'EX' | 'DQ' {
  return result === 'NQ' || result === 'EX' || result === 'DQ';
}

export function getReasonOptions(result: PaperResult | null): readonly string[] {
  if (result === 'NQ') return PAPER_NQ_REASONS;
  if (result === 'EX') return PAPER_EXCUSED_REASONS;
  // A DQ's reason is free text ("brief description", AKC Ch.3 s.36), not a preset.
  return [];
}

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
 * A formatted time ("1:23.45", as a saved result is loaded) reads the same.
 * "" or "0" → 0
 */
export function digitsToSeconds(input: string): number {
  const digits = parseSearchTimeDigits(input);
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

/**
 * Inline warning when a Q carries a time over the class time limit, else null.
 * Same comparison as the scoresheet's validate() in scoring-ui, which warns
 * "Time … exceeds max …"; like it, this warns
 * and does not block: the limit can be the 180s default for a class with no stored
 * limit, and a secretary must still be able to enter a valid paper Q.
 */
export function overTimeLimitWarning(
  result: PaperResult | null,
  timeDigits: string,
  maxTimeSeconds: number | undefined
): string | null {
  if (result !== 'Q' || !maxTimeSeconds || maxTimeSeconds <= 0) return null;
  if (digitsToSeconds(timeDigits) <= maxTimeSeconds) return null;
  return `Over the class time limit of ${formatTimeLimitSeconds(maxTimeSeconds)} — check the score sheet; a run over time is normally NQ (Max Time).`;
}
