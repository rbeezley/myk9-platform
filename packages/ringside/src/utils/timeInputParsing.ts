/**
 * Time Input Parsing Utilities
 *
 * Smart time parsing functions for handling multiple input formats in scoresheet time fields.
 * Extracted from AKCScentWorkScoresheet-Enhanced.tsx for reusability across all scoresheets.
 *
 * Supports various input formats and intelligently converts them to MM:SS.HH format.
 */

/**
 * Parse time input in multiple formats and convert to MM:SS.HH format
 *
 * **Supported Input Formats:**
 * - `MM:SS.HH` - Full format (e.g., "01:23.45")
 * - `MM:SS` - Minutes and seconds (e.g., "1:23" → "01:23.00")
 * - `SSS.HH` - Decimal seconds (e.g., "123.45" → "02:03.45")
 * - `MMSSYY` - 6 digits (e.g., "012345" → "01:23.45")
 * - `MSSYY` - 5 digits (e.g., "12345" → "01:23.45")
 * - `SSYY` - 4 digits (e.g., "2345" → "00:23.45")
 * - `SYY` - 3 digits (e.g., "345" → "00:03.45")
 * - `YY` - 2 digits (e.g., "45" → "00:00.45")
 * - `M` - 1 digit (e.g., "5" → "05:00.00")
 *
 * **Validation Rules:**
 * - Minutes: 0-59
 * - Seconds: 0-59
 * - Hundredths: 0-99
 * - Max time: 59:59.99
 *
 * @param input - Raw time input string
 * @returns Formatted time string in MM:SS.HH format, or empty string if invalid
 *
 * @example
 * ```typescript
 * // Full format (already formatted)
 * parseSmartTime('01:23.45')  // Returns: "01:23.45"
 * parseSmartTime('1:23.45')   // Returns: "01:23.45" (zero-padded)
 *
 * // MM:SS format (no hundredths)
 * parseSmartTime('1:23')      // Returns: "01:23.00"
 * parseSmartTime('12:34')     // Returns: "12:34.00"
 *
 * // Decimal format (total seconds.hundredths)
 * parseSmartTime('123.45')    // Returns: "02:03.45" (123s = 2m 3s)
 * parseSmartTime('89.5')      // Returns: "01:29.50" (89s = 1m 29s)
 *
 * // 6 digits: MMSSYY
 * parseSmartTime('012345')    // Returns: "01:23.45"
 * parseSmartTime('123456')    // Returns: "12:34.56"
 *
 * // 5 digits: MSSYY
 * parseSmartTime('12345')     // Returns: "01:23.45"
 * parseSmartTime('54321')     // Returns: "05:43.21"
 *
 * // 4 digits: SSYY
 * parseSmartTime('2345')      // Returns: "00:23.45"
 * parseSmartTime('5912')      // Returns: "00:59.12"
 *
 * // 3 digits: SYY
 * parseSmartTime('345')       // Returns: "00:03.45"
 * parseSmartTime('912')       // Returns: "00:09.12"
 *
 * // 2 digits: YY (hundredths)
 * parseSmartTime('45')        // Returns: "00:00.45"
 * parseSmartTime('99')        // Returns: "00:00.99"
 *
 * // 1 digit: M (minutes)
 * parseSmartTime('5')         // Returns: "05:00.00"
 * parseSmartTime('9')         // Returns: "09:00.00"
 *
 * // Invalid inputs
 * parseSmartTime('')          // Returns: ""
 * parseSmartTime('   ')       // Returns: ""
 * parseSmartTime('99:99.99')  // Returns: "99:99.99" (invalid, user can continue typing)
 * ```
 */
export function parseSmartTime(input: string): string {
  if (!input || input.trim() === '') return '';

  const cleaned = input.trim();

  // If already in MM:SS.HH format, validate and return
  const fullFormatMatch = cleaned.match(/^(\d{1,2}):(\d{2})\.(\d{2})$/);
  if (fullFormatMatch) {
    const [, minutes, seconds, hundredths] = fullFormatMatch;
    const min = parseInt(minutes);
    const sec = parseInt(seconds);
    const hun = parseInt(hundredths);

    if (min <= 59 && sec <= 59 && hun <= 99) {
      return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${hun.toString().padStart(2, '0')}`;
    }
  }

  // Handle MM:SS format (no hundredths)
  const timeFormatMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (timeFormatMatch) {
    const [, minutes, seconds] = timeFormatMatch;
    const min = parseInt(minutes);
    const sec = parseInt(seconds);

    if (min <= 59 && sec <= 59) {
      return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.00`;
    }
  }

  // Handle decimal format like 123.45 (total seconds.hundredths)
  const decimalMatch = cleaned.match(/^(\d{1,3})\.(\d{1,2})$/);
  if (decimalMatch) {
    const [, wholePart, decimalPart] = decimalMatch;
    const totalSeconds = parseInt(wholePart);
    const hundredths = decimalPart.padEnd(2, '0').slice(0, 2);

    if (totalSeconds <= 3599) { // Max 59:59
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths}`;
    }
  }

  // Handle pure digit strings
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length === 0) return '';

  const digits = digitsOnly.slice(0, 6); // Max 6 digits

  if (digits.length === 5) {
    // 5 digits: MSSYY format (1:23.45)
    const minutes = digits.slice(0, 1);
    const seconds = digits.slice(1, 3);
    const hundredths = digits.slice(3, 5);

    const min = parseInt(minutes);
    const sec = parseInt(seconds);

    if (min <= 9 && sec <= 59) {
      return `0${minutes}:${seconds}.${hundredths}`;
    }
  } else if (digits.length >= 6) {
    // 6+ digits: MMSSYY format
    const minutes = digits.slice(0, 2);
    const seconds = digits.slice(2, 4);
    const hundredths = digits.slice(4, 6).padEnd(2, '0');

    const min = parseInt(minutes);
    const sec = parseInt(seconds);

    if (min <= 59 && sec <= 59) {
      return `${minutes}:${seconds}.${hundredths}`;
    }
  } else if (digits.length === 4) {
    // 4 digits: SSYY format (under 1 minute)
    const seconds = digits.slice(0, 2);
    const hundredths = digits.slice(2, 4);

    const sec = parseInt(seconds);
    if (sec <= 59) {
      return `00:${seconds}.${hundredths}`;
    }
  } else if (digits.length === 3) {
    // 3 digits: SYY format (S.YY seconds)
    const seconds = digits.slice(0, 1);
    const hundredths = digits.slice(1, 3);

    const sec = parseInt(seconds);
    if (sec <= 9) {
      return `00:0${seconds}.${hundredths}`;
    }
  } else if (digits.length === 2) {
    // 2 digits: treat as hundredths of a second (0.YY)
    const hundredths = digits;
    return `00:00.${hundredths}`;
  } else if (digits.length === 1) {
    // 1 digit: treat as minutes
    const minutes = parseInt(digits);
    if (minutes <= 9) {
      return `0${minutes}:00.00`;
    }
  }

  // If no valid format found, return original input for user to continue typing
  return cleaned;
}

/**
 * Validate if a time string is in correct MM:SS.HH format
 *
 * @param time - Time string to validate
 * @returns True if valid MM:SS.HH format with valid values
 *
 * @example
 * ```typescript
 * isValidTimeFormat('01:23.45')  // true
 * isValidTimeFormat('59:59.99')  // true
 * isValidTimeFormat('00:00.00')  // true
 * isValidTimeFormat('1:23.45')   // false (not zero-padded)
 * isValidTimeFormat('60:00.00')  // false (invalid minutes)
 * isValidTimeFormat('00:60.00')  // false (invalid seconds)
 * isValidTimeFormat('12:34')     // false (missing hundredths)
 * ```
 */
export function isValidTimeFormat(time: string): boolean {
  const match = time.match(/^(\d{2}):(\d{2})\.(\d{2})$/);
  if (!match) return false;

  const [, minutes, seconds, hundredths] = match;
  const min = parseInt(minutes);
  const sec = parseInt(seconds);
  const hun = parseInt(hundredths);

  return min <= 59 && sec <= 59 && hun <= 99;
}

/**
 * Convert time from MM:SS.HH format to total seconds (with decimal hundredths)
 *
 * @param time - Time string in MM:SS.HH format
 * @returns Total seconds as decimal number, or 0 if invalid
 *
 * @example
 * ```typescript
 * timeToSeconds('01:23.45')  // 83.45
 * timeToSeconds('00:59.99')  // 59.99
 * timeToSeconds('02:00.00')  // 120.00
 * timeToSeconds('invalid')   // 0
 * ```
 */
export function timeToSeconds(time: string): number {
  const match = time.match(/^(\d{2}):(\d{2})\.(\d{2})$/);
  if (!match) return 0;

  const [, minutes, seconds, hundredths] = match;
  const totalSeconds = parseInt(minutes) * 60 + parseInt(seconds) + parseInt(hundredths) / 100;
  return totalSeconds;
}

/**
 * Convert total seconds to MM:SS.HH format
 *
 * @param totalSeconds - Total seconds (can include decimal hundredths)
 * @returns Formatted time string in MM:SS.HH format
 *
 * @example
 * ```typescript
 * secondsToTime(83.45)   // "01:23.45"
 * secondsToTime(59.99)   // "00:59.99"
 * secondsToTime(120)     // "02:00.00"
 * secondsToTime(3599.99) // "59:59.99"
 * ```
 */
export function secondsToTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.round((totalSeconds % 1) * 100);

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

/**
 * Compare two time strings and return which is faster (lower time wins)
 *
 * @param time1 - First time string in MM:SS.HH format
 * @param time2 - Second time string in MM:SS.HH format
 * @returns -1 if time1 is faster, 1 if time2 is faster, 0 if equal
 *
 * @example
 * ```typescript
 * compareTime('01:23.45', '01:23.50')  // -1 (time1 is faster)
 * compareTime('02:00.00', '01:59.99')  // 1 (time2 is faster)
 * compareTime('01:23.45', '01:23.45')  // 0 (equal)
 * ```
 */
export function compareTime(time1: string, time2: string): number {
  const seconds1 = timeToSeconds(time1);
  const seconds2 = timeToSeconds(time2);

  if (seconds1 < seconds2) return -1;
  if (seconds1 > seconds2) return 1;
  return 0;
}
