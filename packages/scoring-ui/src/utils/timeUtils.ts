/**
 * Time utility functions for formatting and converting time values
 * Used across scoresheets and entry lists for consistent time handling.
 */

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
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2);
  return `${minutes}:${seconds.padStart(5, '0')}`;
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

  const minutes = Math.floor(numSeconds / 60);
  const remainingSeconds = numSeconds % 60;

  // Format: MM:SS.HH
  const minutesStr = minutes.toString().padStart(2, '0');
  const secondsStr = remainingSeconds.toFixed(2).padStart(5, '0');

  return `${minutesStr}:${secondsStr}`;
}

/**
 * Convert time string (MM:SS.ss or SS.ss) to decimal seconds
 *
 * @param timeString - Time string in various formats
 * @returns Time in decimal seconds
 *
 * @example
 * convertTimeToSeconds("1:23.45") // 83.45
 * convertTimeToSeconds("45.5")    // 45.5
 */
export function convertTimeToSeconds(timeString: string): number {
  if (!timeString || timeString.trim() === '') return 0;

  // Handle different time formats
  if (timeString.includes(':')) {
    // Format: MM:SS.ss or M:SS.ss
    const parts = timeString.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0] ?? '0') || 0;
      const seconds = parseFloat(parts[1] ?? '0') || 0;
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

/**
 * Parse a time string in "MM:SS" or "M:SS" format to milliseconds
 *
 * @param timeString - Time string (e.g., "3:00", "4:30")
 * @returns Time in milliseconds
 *
 * @example
 * parseTimeToMs("3:00") // 180000
 * parseTimeToMs("1:30") // 90000
 */
export function parseTimeToMs(timeString: string): number {
  if (!timeString) return 0;
  const parts = timeString.split(':');
  const minutes = parseFloat(parts[0] ?? '0') || 0;
  const seconds = parseFloat(parts[1] ?? '0') || 0;
  return (minutes * 60 + seconds) * 1000;
}

/**
 * Format user input into MM:SS format for time limits
 *
 * Handles multiple input formats:
 * - Single/double digits: "1" → "01:00", "2" → "02:00"
 * - Three digits: "130" → "01:30" (1 minute 30 seconds)
 * - Four digits: "215" → "02:15" (2 minutes 15 seconds)
 * - With colon: "1:30" → "01:30"
 *
 * Features:
 * - Automatic seconds overflow handling (90 seconds → 01:30)
 * - Maximum limit enforcement (optional)
 * - Zero-padding for consistent MM:SS format
 *
 * @param value - User input string
 * @param maxMinutes - Maximum allowed minutes (optional)
 * @returns Formatted time string in "MM:SS" format, or empty string if invalid
 *
 * @example
 * formatTimeInputToMMSS("1")      // "01:00"
 * formatTimeInputToMMSS("130")    // "01:30"
 * formatTimeInputToMMSS("1:30")   // "01:30"
 * formatTimeInputToMMSS("90")     // "01:30" (seconds overflow)
 */
export function formatTimeInputToMMSS(value: string, maxMinutes?: number): string {
  // Use default max of 5 for formatted inputs (3-4 digits, colon), but not for simple 1-2 digit inputs
  const defaultMax = 5;
  // Remove non-digits and colons
  const cleaned = value.replace(/[^\d:]/g, '');

  // If empty, return empty
  if (!cleaned) return '';

  // Handle MM:SS format
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    let minutes = parseInt(parts[0] ?? '0') || 0;
    let seconds = parseInt(parts[1] ?? '0') || 0;

    // Handle seconds overflow (convert to minutes)
    if (seconds >= 60) {
      minutes += Math.floor(seconds / 60);
      seconds = seconds % 60;
    }

    // Cap at maximum - if at or over max, zero out seconds
    const effectiveMax = maxMinutes !== undefined ? maxMinutes : defaultMax;
    if (minutes > effectiveMax) {
      minutes = effectiveMax;
      seconds = 0;
    } else if (minutes === effectiveMax && seconds > 0) {
      // Exactly at max minutes but with extra seconds - cap at max:00
      seconds = 0;
    }

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Handle just numbers - interpret based on length and context
  const numValue = parseInt(cleaned);
  if (isNaN(numValue)) return '';

  if (cleaned.length <= 2) {
    // 1-2 digits: treat as minutes
    // Only cap if maxMinutes was explicitly provided
    const finalMinutes = maxMinutes !== undefined ? Math.min(numValue, maxMinutes) : numValue;
    return `${finalMinutes.toString().padStart(2, '0')}:00`;
  } else if (cleaned.length === 3) {
    // 3 digits: first digit as minutes, last two as seconds (e.g., 130 = 1:30)
    const minutes = Math.floor(numValue / 100);
    const seconds = numValue % 100;
    if (seconds < 60) {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      // Invalid seconds (>= 60), use just the minutes part and zero out seconds
      return `${minutes.toString().padStart(2, '0')}:00`;
    }
  } else {
    // 4+ digits: treat as MMSS format
    const minutes = Math.floor(numValue / 100);
    const seconds = numValue % 100;
    const effectiveMax = maxMinutes !== undefined ? maxMinutes : defaultMax;
    const cappedMinutes = Math.min(minutes, effectiveMax);
    // If we're capping minutes, zero out seconds; otherwise keep valid seconds
    const finalSeconds = minutes > effectiveMax ? 0 : (seconds < 60 ? seconds : 0);
    return `${cappedMinutes.toString().padStart(2, '0')}:${finalSeconds.toString().padStart(2, '0')}`;
  }
}
