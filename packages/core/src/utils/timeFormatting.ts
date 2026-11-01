/**
 * Time utility functions for formatting and converting time values
 *
 * This module provides consistent time handling across the myK9 platform.
 * Used for scoresheets, entry lists, and anywhere time values need formatting.
 */

/** Whole minutes, seconds and centiseconds of a duration. */
export interface TimeParts {
  minutes: number;
  seconds: number;
  centis: number;
}

function splitCentis(totalCs: number): TimeParts {
  return {
    minutes: Math.floor(totalCs / 6000),
    seconds: Math.floor((totalCs % 6000) / 100),
    centis: totalCs % 100,
  };
}

/**
 * Split decimal seconds into minutes, seconds and centiseconds.
 *
 * Works in integer centiseconds: flooring the float fraction turns 61.23
 * into 22 centis, and rounding the fraction on its own prints 59.999 as
 * "0:59.100". Rounding first lets a rounded-up hundredth carry into the
 * second and minute. The one rule behind every stored-time display (MYK9-1225).
 * Do not use for a live running clock, which should floor.
 */
export function splitSecondsToCentis(seconds: number): TimeParts {
  return splitCentis(Math.round(seconds * 100));
}

/**
 * Same split for integer milliseconds.
 *
 * `round` (default) is for STORED values: nearest hundredth. `floor` is for a
 * LIVE running clock, which must not show 1:00.00 at 59,996 ms; it still
 * carries safely because the split runs on whole centiseconds.
 */
export function splitMsToCentis(ms: number, mode: 'round' | 'floor' = 'round'): TimeParts {
  return splitCentis(mode === 'floor' ? Math.floor(ms / 10) : Math.round(ms / 10));
}

function joinMSSCC({ minutes, seconds, centis }: TimeParts): string {
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/** Decimal seconds as "M:SS.HH" (unpadded minutes), e.g. 61.23 -> "1:01.23". */
export function formatSecondsAsMSSCC(seconds: number): string {
  return joinMSSCC(splitSecondsToCentis(seconds));
}

/** Integer milliseconds as "M:SS.HH" (unpadded minutes); `floor` for live clocks. */
export function formatMsAsMSSCC(ms: number, mode: 'round' | 'floor' = 'round'): string {
  return joinMSSCC(splitMsToCentis(ms, mode));
}

/**
 * Format milliseconds as "M:SS.ss"
 *
 * @param milliseconds - Time in milliseconds
 * @returns Formatted time string (e.g., "1:23.45")
 *
 * @example
 * formatMilliseconds(83450) // "1:23.45"
 * formatMilliseconds(0)     // "0:00.00"
 */
export function formatMilliseconds(milliseconds: number): string {
  return formatMsAsMSSCC(milliseconds);
}

/**
 * Convert seconds to MM:SS format (no hundredths)
 * Used for displaying max time limits
 *
 * @param seconds - Time in seconds (integer)
 * @returns Formatted time string in MM:SS format
 *
 * @example
 * formatSecondsToMMSS(125) // "02:05"
 * formatSecondsToMMSS(65)  // "01:05"
 */
export function formatSecondsToMMSS(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Convert seconds (decimal) to MM:SS.HH format
 *
 * @param seconds - Time in seconds (can be decimal)
 * @returns Formatted time string in MM:SS.HH format
 *
 * @example
 * formatSecondsToTime(83.45)  // "01:23.45"
 * formatSecondsToTime("60.5") // "01:00.50"
 */
export function formatSecondsToTime(seconds: number | string | null): string {
  if (!seconds || seconds === '') return '00:00.00';

  const numSeconds = typeof seconds === 'string' ? parseFloat(seconds) : seconds;

  if (isNaN(numSeconds) || numSeconds < 0) return '00:00.00';

  const { minutes, seconds: secs, centis } = splitSecondsToCentis(numSeconds);

  // Format: MM:SS.HH
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

/**
 * Format time for display based on the input type
 * If the input is already in MM:SS format, return as-is
 * If the input is in seconds, convert to MM:SS.HH format
 *
 * @param time - Time value (can be seconds or already formatted)
 * @returns Formatted time string
 */
export function formatTimeForDisplay(time: string | number | null): string {
  if (!time && time !== 0) return '00:00.00';

  const timeStr = time.toString();

  // If it already contains a colon, it's likely already formatted
  if (timeStr.includes(':')) {
    return timeStr;
  }

  // Otherwise, treat it as seconds and format it
  return formatSecondsToTime(timeStr);
}

/**
 * Convert seconds to M:SS format (single-digit minutes, used for time limits)
 * Returns empty string for null, undefined, or 0 (indicating no time limit)
 *
 * @param seconds - Time in seconds (integer)
 * @returns Formatted time string in M:SS format, or empty string if no limit
 *
 * @example
 * formatTimeLimitSeconds(125)  // "2:05"
 * formatTimeLimitSeconds(65)   // "1:05"
 * formatTimeLimitSeconds(0)    // ""
 * formatTimeLimitSeconds(null) // ""
 */
export function formatTimeLimitSeconds(seconds?: number | null): string {
  if (!seconds || seconds === 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
