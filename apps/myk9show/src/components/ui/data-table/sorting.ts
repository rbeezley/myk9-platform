import type { SortingFn } from '@tanstack/react-table';

/**
 * Level progression order for scent work classes.
 * Used as a custom TanStack Table sorting function.
 */
const LEVEL_ORDER = ['Introductory', 'Novice', 'Intermediate', 'Senior', 'Master', 'Champion'];

export const levelProgressionSort: SortingFn<unknown> = (rowA, rowB, columnId) => {
  const aVal = String(rowA.getValue(columnId) ?? '');
  const bVal = String(rowB.getValue(columnId) ?? '');
  const a = LEVEL_ORDER.indexOf(aVal);
  const b = LEVEL_ORDER.indexOf(bVal);
  // Unknown levels sort to the end
  const aIdx = a === -1 ? LEVEL_ORDER.length : a;
  const bIdx = b === -1 ? LEVEL_ORDER.length : b;
  return aIdx - bIdx;
};

/**
 * Format a stream of digits into M:SS.hh search time format.
 * Rule: last 2 digits = hundredths, next 2 = seconds, remainder = minutes.
 * Seconds >59 overflow into minutes.
 */
export function formatSearchTime(digits: string): string {
  if (!digits) return '';

  // Pad to at least 4 digits so we always have hundredths + seconds
  const padded = digits.padStart(4, '0');
  const hundredths = padded.slice(-2);
  const secondsStr = padded.slice(-4, -2);
  const minutesStr = padded.slice(0, -4) || '0';

  let rawSeconds = parseInt(secondsStr, 10) || 0;
  let minutes = parseInt(minutesStr, 10) || 0;

  // Overflow: seconds >= 60 carry into minutes
  if (rawSeconds >= 60) {
    minutes += Math.floor(rawSeconds / 60);
    rawSeconds = rawSeconds % 60;
  }

  return `${minutes}:${String(rawSeconds).padStart(2, '0')}.${hundredths}`;
}

/**
 * Parse formatted time (M:SS.hh) back to raw digits for editing.
 * Strips leading zeros from the result.
 */
export function parseSearchTimeDigits(formatted: string): string {
  const match = formatted.match(/^(\d+):(\d{2})\.(\d{2})$/);
  if (!match) return formatted;
  const [, min, sec, hundredths] = match;
  const raw = `${min}${sec}${hundredths}`;
  // Strip leading zeros but keep at least the hundredths
  return raw.replace(/^0+/, '') || hundredths;
}
