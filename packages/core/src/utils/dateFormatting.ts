/**
 * Date utility functions for formatting and parsing dates
 *
 * These utilities ensure consistent date handling without timezone issues.
 * We consistently work with dates in YYYY-MM-DD format.
 */

/**
 * Formats a YYYY-MM-DD date string to MM/DD/YYYY display format.
 * Uses direct string manipulation to avoid timezone issues.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Formatted date string in MM/DD/YYYY format
 *
 * @example
 * formatDateDisplay("2024-01-15") // "1/15/2024"
 */
export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';

  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    return dateStr;
  }

  const yearNum = parseInt(parts[0] ?? '0', 10);
  const monthNum = parseInt(parts[1] ?? '0', 10);
  const dayNum = parseInt(parts[2] ?? '0', 10);

  if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) {
    return dateStr;
  }

  return `${monthNum}/${dayNum}/${yearNum}`;
}

/**
 * Formats a YYYY-MM-DD date string to MM/DD/YYYY with leading zeros.
 * Uses direct string manipulation to avoid timezone issues.
 *
 * @param dateStr - Date string in YYYY-MM-DD format (or other parseable format)
 * @returns Formatted date string in MM/DD/YYYY format
 *
 * @example
 * formatDateMMDDYYYY("2024-01-05") // "1/5/2024"
 */
export function formatDateMMDDYYYY(dateStr?: string): string {
  if (!dateStr) return '';

  // Handle YYYY-MM-DD format directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(month ?? '0', 10)}/${parseInt(day ?? '0', 10)}/${year}`;
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
 * Converts a Date object to a YYYY-MM-DD string.
 * Uses component methods to avoid timezone issues.
 *
 * @param date - Date object to format
 * @returns Date string in YYYY-MM-DD format
 *
 * @example
 * formatDateLocal(new Date(2024, 0, 15)) // "2024-01-15"
 */
export function formatDateLocal(date: Date): string {
  if (!date || isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts a Date or date string to YYYY-MM-DD for input[type="date"].
 *
 * @param date - Date object or date string
 * @returns Date string in YYYY-MM-DD format
 *
 * @example
 * toYYYYMMDD(new Date(2024, 0, 15)) // "2024-01-15"
 * toYYYYMMDD("2024-01-15")          // "2024-01-15"
 */
export function toYYYYMMDD(date: string | Date): string {
  if (!date) return '';

  if (typeof date === 'string') {
    // If already in YYYY-MM-DD, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    // If in ISO format with time, extract date part
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match && match[1]) return match[1];
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
 * Parses a YYYY-MM-DD string to a Date object.
 * Creates the date with year/month/day constructor to avoid timezone issues.
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object or undefined if invalid
 *
 * @example
 * parseLocalDateString("2024-01-15") // Date object for Jan 15, 2024
 */
export function parseLocalDateString(dateString: string): Date | undefined {
  if (!dateString) return undefined;

  const parts = dateString.split('-');
  if (parts.length !== 3) {
    return undefined;
  }

  const year = parseInt(parts[0] ?? '0', 10);
  const month = parseInt(parts[1] ?? '0', 10) - 1; // 0-based months
  const day = parseInt(parts[2] ?? '0', 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return undefined;
  }

  if (year < 1900 || year > 2100 || month < 0 || month > 11 || day < 1 || day > 31) {
    return undefined;
  }

  return new Date(year, month, day);
}

/**
 * Gets today's date in YYYY-MM-DD format
 *
 * @returns Today's date in YYYY-MM-DD format
 */
export function getTodayLocal(): string {
  return formatDateLocal(new Date());
}

/**
 * Validates if a date string is in the correct YYYY-MM-DD format
 *
 * @param dateString - Date string to validate
 * @returns True if valid YYYY-MM-DD format
 */
export function isValidDateFormat(dateString: string): boolean {
  if (!dateString) return false;

  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(dateString)) return false;

  const date = parseLocalDateString(dateString);
  return date !== undefined;
}

/**
 * Calculates the difference in days between two date strings
 *
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns Number of days between dates
 */
export function dateDifferenceInDays(startDate: string, endDate: string): number {
  const start = parseLocalDateString(startDate);
  const end = parseLocalDateString(endDate);

  if (!start || !end) {
    return 0;
  }

  const diffTime = end.getTime() - start.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formats a date to abbreviated day name (e.g., 'Mon', 'Tue').
 *
 * @param dateStr - Date string
 * @returns Abbreviated day name
 */
export function formatDayAbbreviation(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Formats time from Date object or time string.
 *
 * @param date - Date object or date string
 * @param options - Formatting options
 * @returns Formatted time string
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
 * Format a trial date string with optional trial number.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param trialNumber - Optional trial number to display
 * @returns Formatted date string like "Mon, Jan 15, 2024 • Trial 1"
 */
export function formatTrialDate(dateStr: string, trialNumber?: number): string {
  // Parse date components manually to avoid timezone issues
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const year = parseInt(parts[0] ?? '0', 10);
  const month = parseInt(parts[1] ?? '0', 10);
  const day = parseInt(parts[2] ?? '0', 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;

  const date = new Date(year, month - 1, day); // month is 0-indexed

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNumber = date.getDate();
  const yearNumber = date.getFullYear();

  const baseDate = `${dayName}, ${monthName} ${dayNumber}, ${yearNumber}`;
  return trialNumber ? `${baseDate} • Trial ${trialNumber}` : baseDate;
}
