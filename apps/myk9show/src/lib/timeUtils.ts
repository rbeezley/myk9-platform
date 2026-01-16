/**
 * Time Handling Utilities
 * 
 * Comprehensive functions for handling time values in the myK9Show application.
 * All times are stored as integer milliseconds and displayed in MM:SS or MM:SS.HH format.
 * 
 * @see /docs/technical/TIME_HANDLING_STANDARDS.md for complete documentation
 */

export type TimeDisplayPrecision = 'seconds' | 'hundredths';
export type TimeFormat = 'MM:SS' | 'MM:SS.HH' | 'H:MM:SS';

/**
 * Convert milliseconds to display format
 * 
 * @param ms - Time in milliseconds
 * @param precision - Display precision ('seconds' or 'hundredths')
 * @returns Formatted time string
 * 
 * @example
 * msToDisplay(90000) // "1:30"
 * msToDisplay(87350, 'hundredths') // "1:27.35"
 * msToDisplay(90000, 'hundredths') // "1:30.00"
 */
export function msToDisplay(
  ms: number, 
  precision: TimeDisplayPrecision = 'seconds'
): string {
  if (!ms || ms < 0) return precision === 'hundredths' ? '0:00.00' : '0:00';
  
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  
  const timeBase = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  if (precision === 'hundredths') {
    return `${timeBase}.${hundredths.toString().padStart(2, '0')}`;
  }
  
  return timeBase;
}

/**
 * Convert display format to milliseconds
 * 
 * @param display - Time in MM:SS or MM:SS.HH format
 * @returns Time in milliseconds
 * 
 * @example
 * displayToMs('1:30') // 90000
 * displayToMs('1:27.35') // 87350
 * displayToMs('1:30.00') // 90000
 */
export function displayToMs(display: string): number {
  if (!display || typeof display !== 'string') return 0;
  
  // Handle both MM:SS and MM:SS.HH formats
  const [timePart, hundredthsPart = '0'] = display.split('.');
  const [minutesStr, secondsStr] = timePart.split(':');
  
  const minutes = parseInt(minutesStr, 10) || 0;
  const seconds = parseInt(secondsStr, 10) || 0;
  const hundredths = parseInt(hundredthsPart.padEnd(2, '0').substring(0, 2), 10) || 0;
  
  return (minutes * 60 + seconds) * 1000 + (hundredths * 10);
}

/**
 * Validate time format
 * 
 * @param timeString - Time string to validate
 * @param allowHundredths - Whether to allow hundredths of seconds
 * @returns True if format is valid
 * 
 * @example
 * isValidTimeFormat('1:30') // true
 * isValidTimeFormat('1:27.35') // true
 * isValidTimeFormat('1:60') // false (seconds > 59)
 * isValidTimeFormat('1:30.100') // false (hundredths > 99)
 */
export function isValidTimeFormat(
  timeString: string, 
  allowHundredths: boolean = true
): boolean {
  if (!timeString || typeof timeString !== 'string') return false;
  
  // Base format: MM:SS or M:SS
  const basePattern = /^\d{1,2}:[0-5]\d$/;
  // With hundredths: MM:SS.HH or M:SS.HH
  const hundredthsPattern = /^\d{1,2}:[0-5]\d\.\d{1,2}$/;
  
  if (allowHundredths && timeString.includes('.')) {
    if (!hundredthsPattern.test(timeString)) return false;
    
    // Validate hundredths are <= 99
    const hundredthsPart = timeString.split('.')[1];
    const hundredths = parseInt(hundredthsPart, 10);
    return hundredths >= 0 && hundredths <= 99;
  } else {
    return basePattern.test(timeString);
  }
}

/**
 * Parse flexible time input with validation
 * 
 * @param input - User input time string
 * @returns Parsing result with milliseconds and validation status
 * 
 * @example
 * parseTimeInput('1:30') // { ms: 90000, isValid: true, display: '1:30' }
 * parseTimeInput('1:27.35') // { ms: 87350, isValid: true, display: '1:27.35' }
 * parseTimeInput('1:') // { ms: 0, isValid: false, display: '1:', error: 'Incomplete time format' }
 */
export function parseTimeInput(input: string): {
  ms: number;
  isValid: boolean;
  display: string;
  error?: string;
} {
  if (!input) {
    return { ms: 0, isValid: true, display: '0:00' };
  }
  
  // Allow partial input while typing
  const partialPattern = /^\d{0,2}:?\d{0,2}\.?\d{0,2}$/;
  if (!partialPattern.test(input)) {
    return { 
      ms: 0, 
      isValid: false, 
      display: input, 
      error: 'Invalid time format' 
    };
  }
  
  // Check if complete format
  if (isValidTimeFormat(input)) {
    return {
      ms: displayToMs(input),
      isValid: true,
      display: input
    };
  }
  
  // Partial input - allow but don't convert
  if (input.endsWith(':') || input.includes('.') && !input.match(/\.\d{2}$/)) {
    return {
      ms: 0,
      isValid: false,
      display: input,
      error: 'Incomplete time format'
    };
  }
  
  return { ms: 0, isValid: false, display: input, error: 'Invalid format' };
}

/**
 * Format time range for display
 * 
 * @param minMs - Minimum time in milliseconds
 * @param maxMs - Maximum time in milliseconds  
 * @param precision - Display precision
 * @returns Formatted range string
 * 
 * @example
 * formatTimeRange(60000, 180000) // "1:00 - 3:00"
 * formatTimeRange(87000, 87000) // "1:27" (same min/max = fixed)
 * formatTimeRange(60000, 180000, 'hundredths') // "1:00.00 - 3:00.00"
 */
export function formatTimeRange(
  minMs: number, 
  maxMs: number, 
  precision: TimeDisplayPrecision = 'seconds'
): string {
  if (minMs === maxMs) {
    return msToDisplay(minMs, precision);
  }
  
  const minDisplay = msToDisplay(minMs, precision);
  const maxDisplay = msToDisplay(maxMs, precision);
  
  return `${minDisplay} - ${maxDisplay}`;
}

/**
 * Add time values
 * 
 * @param times - Array of time values in milliseconds
 * @returns Sum in milliseconds
 * 
 * @example
 * addTimes([90000, 30000]) // 120000 (1:30 + 0:30 = 2:00)
 */
export function addTimes(...times: number[]): number {
  return times.reduce((sum, time) => sum + (time || 0), 0);
}

/**
 * Subtract time values
 * 
 * @param from - Starting time in milliseconds
 * @param subtract - Time to subtract in milliseconds
 * @returns Difference in milliseconds (minimum 0)
 * 
 * @example
 * subtractTime(120000, 30000) // 90000 (2:00 - 0:30 = 1:30)
 */
export function subtractTime(from: number, subtract: number): number {
  return Math.max(0, from - subtract);
}

/**
 * Compare time values
 * 
 * @param time1 - First time in milliseconds
 * @param time2 - Second time in milliseconds
 * @returns -1 if time1 < time2, 0 if equal, 1 if time1 > time2
 */
export function compareTimes(time1: number, time2: number): -1 | 0 | 1 {
  if (time1 < time2) return -1;
  if (time1 > time2) return 1;
  return 0;
}

/**
 * Check if time is within range
 * 
 * @param timeMs - Time to check in milliseconds
 * @param minMs - Minimum allowed time in milliseconds
 * @param maxMs - Maximum allowed time in milliseconds
 * @returns True if time is within range (inclusive)
 */
export function isTimeInRange(timeMs: number, minMs: number, maxMs: number): boolean {
  return timeMs >= minMs && timeMs <= maxMs;
}

/**
 * Convert legacy time formats to milliseconds
 * 
 * @param value - Legacy time value
 * @param format - Original format ('minutes', 'seconds', 'MM:SS')
 * @returns Time in milliseconds
 * 
 * @example
 * convertLegacyTime(1.5, 'minutes') // 90000 (1.5 minutes = 90 seconds = 90000ms)
 * convertLegacyTime(90, 'seconds') // 90000
 * convertLegacyTime('1:30', 'MM:SS') // 90000
 */
export function convertLegacyTime(
  value: number | string, 
  format: 'minutes' | 'seconds' | 'MM:SS'
): number {
  switch (format) {
    case 'minutes':
      return Math.round((value as number) * 60 * 1000);
    case 'seconds':
      return Math.round((value as number) * 1000);
    case 'MM:SS':
      return displayToMs(value as string);
    default:
      return 0;
  }
}

/**
 * Get appropriate time precision for context
 * 
 * @param context - Usage context
 * @returns Recommended precision
 */
export function getTimeDisplayPrecision(context: 'template' | 'result' | 'estimate'): TimeDisplayPrecision {
  switch (context) {
    case 'template':
    case 'estimate':
      return 'seconds';
    case 'result':
      return 'hundredths';
    default:
      return 'seconds';
  }
}

// Legacy compatibility - maintain old function names for gradual migration
export const durationToSeconds = (mmss: string): number => Math.floor(displayToMs(mmss) / 1000);
export const secondsToMMSS = (seconds: number): string => msToDisplay(seconds * 1000);
export const parseMMSSInput = parseTimeInput;
export const isValidMMSSFormat = isValidTimeFormat;

/**
 * Format seconds to time display (M:SS format)
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string
 *
 * @example
 * formatSecondsToTime(90) // "1:30"
 * formatSecondsToTime(125) // "2:05"
 */
export function formatSecondsToTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}