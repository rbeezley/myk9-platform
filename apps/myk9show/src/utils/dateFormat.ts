/**
 * Unified date formatting utilities for myK9Show.
 * Re-exports core functions from dateLocal.ts and adds additional formatters.
 */

// Re-export core date handling from dateLocal
export {
  formatDateDisplay,
  formatDateLocal,
  parseLocalDateString,
  normalizeLocalDateString,
  isValidDateFormat,
  getTodayLocal,
  dateDifferenceInDays,
} from './dateLocal';

/**
 * Formats an ISO date string (YYYY-MM-DD) to MM/DD/YYYY display format.
 * Uses direct string manipulation to avoid timezone issues.
 */
export function formatDateMMDDYYYY(dateStr?: string): string {
  if (!dateStr) return '';

  // Handle YYYY-MM-DD format directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
  }

  // Try to parse other formats
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Formats a date to abbreviated day name (e.g., 'Mon', 'Tue').
 */
export function formatDayAbbreviation(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Formats time from Date object or time string.
 */
export function formatTime(
  date: Date | string,
  options?: { hour12?: boolean; includeSeconds?: boolean }
): string {
  const { hour12 = true, includeSeconds = false } = options || {};

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return 'Invalid Time';

  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  };

  if (includeSeconds) {
    formatOptions.second = '2-digit';
  }

  return dateObj.toLocaleTimeString('en-US', formatOptions);
}

/**
 * Converts a Date or date string to YYYY-MM-DD for input[type="date"].
 */
export function toYYYYMMDD(date: string | Date): string {
  if (!date) return '';

  if (typeof date === 'string') {
    // If already in YYYY-MM-DD, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    // If in ISO format with time, extract date part
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    // Otherwise, try to parse as Date
    date = new Date(date);
  }

  if (date instanceof Date && !isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
}

/**
 * Calculate show status based on start and end dates.
 */
export function calculateShowStatus(
  startDate: string,
  endDate: string
): 'Upcoming' | 'In Progress' | 'Completed' {
  if (!startDate || !endDate) return 'Upcoming';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  if (today < start) {
    return 'Upcoming';
  } else if (today >= start && today <= end) {
    return 'In Progress';
  } else {
    return 'Completed';
  }
}
