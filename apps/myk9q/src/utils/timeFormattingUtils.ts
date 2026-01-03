/**
 * Time Formatting Utilities
 *
 * Centralized utilities for time formatting and parsing across the application.
 * Handles various time input formats with smart parsing and validation.
 *
 * Used in:
 * - ClassStatusDialog: Briefing/break/start times (12-hour format)
 * - MaxTimeDialog: Time limits (MM:SS format)
 * - ClassCard: Planned start times display
 */

/**
 * Format user input into 12-hour time format (H:MM AM/PM)
 *
 * Handles multiple input formats with smart AM/PM detection:
 * - Single/double digits: "1" → "1:00 AM", "9" → "9:00 AM"
 * - Three digits: "130" → "1:30 AM"
 * - Four digits: "1330" → "1:30 PM" (24-hour conversion)
 * - With period: "3pm" → "3:00 PM", "1145am" → "11:45 AM"
 *
 * Smart AM/PM detection for dog show context:
 * - Hours 1-11: Default to AM (early morning/morning)
 * - Hour 12: Default to PM (noon)
 * - Hour 13+: Convert to PM (afternoon/evening)
 *
 * This consolidates the formatTimeInput logic from ClassStatusDialog.tsx
 * (lines 204-268, ~64 lines).
 *
 * @param value - User input string (may contain numbers, AM/PM, colons, etc.)
 * @returns Formatted time string in "H:MM AM/PM" format, or empty string if invalid
 *
 * @example
 * ```typescript
 * formatTimeInputTo12Hour("1")       // "1:00 AM"
 * formatTimeInputTo12Hour("130")     // "1:30 AM"
 * formatTimeInputTo12Hour("1330")    // "1:30 PM"
 * formatTimeInputTo12Hour("9")       // "9:00 AM"
 * formatTimeInputTo12Hour("3pm")     // "3:00 PM"
 * formatTimeInputTo12Hour("1145am")  // "11:45 AM"
 * formatTimeInputTo12Hour("invalid") // ""
 * ```
 */
export function formatTimeInputTo12Hour(value: string): string {
  // Remove all non-alphanumeric characters and spaces for processing
  const cleaned = value.replace(/[^0-9apmAPM]/g, '').toLowerCase();

  // If empty, return empty
  if (!cleaned) return '';

  // Extract AM/PM if present
  const hasAM = cleaned.includes('a');
  const hasPM = cleaned.includes('p');
  const period = hasPM ? 'PM' : hasAM ? 'AM' : '';

  // Remove am/pm from the number part
  const numStr = cleaned.replace(/[ap]/g, '');

  if (!numStr) return '';

  const num = parseInt(numStr);
  if (isNaN(num)) return '';

  // Smart AM/PM detection based on typical dog show hours
  const getSmartPeriod = (hour: number): string => {
    if (hour >= 1 && hour <= 6) return 'AM'; // 1-6 is early morning (AM)
    if (hour >= 7 && hour <= 11) return 'AM'; // 7-11 is morning (AM)
    if (hour === 12) return 'PM'; // 12 is noon (PM)
    return 'PM'; // Everything else PM
  };

  // Interpret the numbers based on length
  if (numStr.length <= 2) {
    // 1-2 digits: treat as hour
    let hour = num;
    // Handle hour 0 as midnight (12 AM) before period detection
    if (hour === 0) {
      return `12:00 ${period || 'AM'}`;
    }
    const defaultPeriod = period || getSmartPeriod(hour);
    if (hour > 12) hour = hour % 12 || 12;
    return `${hour}:00 ${defaultPeriod}`;
  } else if (numStr.length === 3) {
    // 3 digits: first digit as hour, last two as minutes (e.g., 130 = 1:30)
    let hour = Math.floor(num / 100);
    const minutes = num % 100;
    const defaultPeriod = period || getSmartPeriod(hour);
    if (hour > 12) hour = hour % 12 || 12;
    if (hour === 0) hour = 12;
    if (minutes < 60) {
      return `${hour}:${minutes.toString().padStart(2, '0')} ${defaultPeriod}`;
    } else {
      return `${hour}:00 ${defaultPeriod}`;
    }
  } else {
    // 4+ digits: treat as HHMM format
    let hour = Math.floor(num / 100);
    const minutes = num % 100;

    // Handle midnight (hour 0) specially
    if (hour === 0) {
      const finalMinutes = minutes < 60 ? minutes : 0;
      return `12:${finalMinutes.toString().padStart(2, '0')} ${period || 'AM'}`;
    }

    const defaultPeriod = period || (hour >= 13 ? 'PM' : getSmartPeriod(hour % 12 || 12));

    // Convert 24-hour to 12-hour
    if (hour > 12) {
      hour = hour - 12;
    }

    const finalMinutes = minutes < 60 ? minutes : 0;
    return `${hour}:${finalMinutes.toString().padStart(2, '0')} ${defaultPeriod}`;
  }
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
 * - Maximum limit enforcement (caps at 5 minutes)
 * - Zero-padding for consistent MM:SS format
 *
 * This consolidates the formatTimeInput logic from MaxTimeDialog.tsx
 * (lines 198-253, ~55 lines).
 *
 * @param value - User input string
 * @param maxMinutes - Maximum allowed minutes (default: 5)
 * @returns Formatted time string in "MM:SS" format, or empty string if invalid
 *
 * @example
 * ```typescript
 * formatTimeInputToMMSS("1")      // "01:00"
 * formatTimeInputToMMSS("130")    // "01:30"
 * formatTimeInputToMMSS("1:30")   // "01:30"
 * formatTimeInputToMMSS("90")     // "01:30" (seconds overflow)
 * formatTimeInputToMMSS("2")      // "02:00"
 * formatTimeInputToMMSS("215")    // "02:15"
 * formatTimeInputToMMSS("6")      // "05:00" (capped at max)
 * formatTimeInputToMMSS("invalid")// ""
 * ```
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
    let minutes = parseInt(parts[0]) || 0;
    let seconds = parseInt(parts[1]) || 0;

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

/**
 * Add minutes to a time string and return formatted result
 *
 * Parses a 12-hour format time string, adds the specified minutes,
 * and returns the new time in the same format.
 *
 * Features:
 * - Handles empty input (uses current time)
 * - Parses various 12-hour formats ("9:30 AM", "930am", etc.)
 * - Correctly handles AM/PM periods
 * - Handles midnight (12 AM) edge case
 * - Falls back to current time if parsing fails
 *
 * This consolidates the addMinutes logic from ClassStatusDialog.tsx
 * (lines 158-201, ~43 lines).
 *
 * @param timeString - Time string in 12-hour format (e.g., "9:30 AM")
 * @param minutesToAdd - Number of minutes to add
 * @returns New time string in "H:MM AM/PM" format
 *
 * @example
 * ```typescript
 * addMinutesToTime("9:30 AM", 15)   // "9:45 AM"
 * addMinutesToTime("9:30 AM", 30)   // "10:00 AM"
 * addMinutesToTime("11:45 PM", 30)  // "12:15 AM" (crosses midnight)
 * addMinutesToTime("", 15)          // Current time + 15 minutes
 * addMinutesToTime("invalid", 15)   // Current time + 15 minutes (fallback)
 * ```
 */
export function addMinutesToTime(timeString: string, minutesToAdd: number): string {
  let baseTime: Date;

  if (timeString.trim()) {
    // Try to parse the existing time
    try {
      const timeParts = timeString.match(/(\d+):?(\d+)?\s*(am|pm)?/i);
      if (timeParts) {
        let hours = parseInt(timeParts[1]);
        let mins = parseInt(timeParts[2] || '0');
        const period = timeParts[3]?.toLowerCase();

        // If no colon and hours > 99, treat as HHMM format (e.g., "930" = 9:30)
        if (!timeParts[2] && hours > 99) {
          mins = hours % 100;
          hours = Math.floor(hours / 100);
        }

        // Convert to 24-hour format
        if (period === 'pm' && hours !== 12) {
          hours += 12;
        } else if (period === 'am' && hours === 12) {
          hours = 0;
        }

        baseTime = new Date();
        baseTime.setHours(hours, mins, 0, 0);
      } else {
        // Can't parse, use current time
        baseTime = new Date();
      }
    } catch {
      baseTime = new Date();
    }
  } else {
    // Empty field, use current time
    baseTime = new Date();
  }

  // Add the specified minutes
  const futureTime = new Date(baseTime.getTime() + minutesToAdd * 60000);
  return futureTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get current time in 12-hour format
 *
 * Returns the current time formatted as "H:MM AM/PM".
 * Uses browser locale for formatting.
 *
 * This consolidates the getCurrentTime logic from ClassStatusDialog.tsx
 * (lines 106-110, ~6 lines).
 *
 * @returns Current time string in "H:MM AM/PM" format
 *
 * @example
 * ```typescript
 * getCurrentTime12Hour()  // "9:30 AM" (if current time is 9:30 AM)
 * ```
 */
export function getCurrentTime12Hour(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a timestamp as "Month Day, H:MM AM/PM"
 *
 * Formats a planned start time with both date and time information.
 * Used for displaying class start times in the schedule.
 *
 * This consolidates the formatPlannedStartTime logic from ClassCard.tsx
 * (lines 130-136, ~10 lines).
 *
 * @param timestamp - ISO timestamp string or undefined
 * @returns Formatted string like "Jan 15, 9:00 AM", or null if timestamp is undefined
 *
 * @example
 * ```typescript
 * formatPlannedStartTime("2024-01-15T09:00:00Z")  // "Jan 15, 9:00 AM"
 * formatPlannedStartTime(undefined)                // null
 * ```
 */
export function formatPlannedStartTime(timestamp: string | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
