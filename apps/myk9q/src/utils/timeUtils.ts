/**
 * Time utility functions for formatting and converting time values
 */

/**
 * Convert seconds to MM:SS format (no hundredths)
 * Used for displaying max time limits
 * @param seconds - Time in seconds (integer)
 * @returns Formatted time string in MM:SS format
 */
export function formatSecondsToMMSS(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Convert seconds (decimal) to MM:SS.HH format
 * @param seconds - Time in seconds (can be decimal)
 * @returns Formatted time string in MM:SS.HH format
 */
export function formatSecondsToTime(seconds: number | string | null): string {
  if (!seconds || seconds === '') return '00:00.00';

  const numSeconds = typeof seconds === 'string' ? parseFloat(seconds) : seconds;

  if (isNaN(numSeconds) || numSeconds < 0) return '00:00.00';

  const minutes = Math.floor(numSeconds / 60);
  const remainingSeconds = numSeconds % 60;

  // Format: MM:SS.HH
  const minutesStr = minutes.toString().padStart(2, '0');
  const secondsStr = remainingSeconds.toFixed(2).padStart(5, '0');

  return `${minutesStr}:${secondsStr}`;
}

/**
 * Convert time string (MM:SS.ss or SS.ss) to decimal seconds
 * @param timeString - Time string in various formats
 * @returns Time in decimal seconds
 */
export function convertTimeToSeconds(timeString: string): number {
  if (!timeString || timeString.trim() === '') return 0;

  // Handle different time formats
  if (timeString.includes(':')) {
    // Format: MM:SS.ss or M:SS.ss
    const parts = timeString.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
  } else {
    // Format: SS.ss (just seconds)
    return parseFloat(timeString) || 0;
  }

  return 0;
}

/**
 * Format time for display based on the input type
 * If the input is already in MM:SS format, return as-is
 * If the input is in seconds, convert to MM:SS.HH format
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
 * formatTimeLimitSeconds(125) // "2:05"
 * formatTimeLimitSeconds(65)  // "1:05"
 * formatTimeLimitSeconds(0)   // ""
 * formatTimeLimitSeconds(null) // ""
 */
export function formatTimeLimitSeconds(seconds?: number | null): string {
  if (!seconds || seconds === 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}