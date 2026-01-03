/**
 * Utility functions for formatting dates in various formats.
 * Provides consistent date formatting across the application.
 */

/**
 * Formats a date string to MM/DD/YYYY format.
 * 
 * @param dateString - ISO date string or any valid date string
 * @returns Formatted date string in MM/DD/YYYY format, or 'N/A' if invalid
 * 
 * @example
 * ```typescript
 * formatDateMMDDYYYY('2024-01-15') // Returns: '01/15/2024'
 * formatDateMMDDYYYY('invalid') // Returns: 'N/A'
 * formatDateMMDDYYYY() // Returns: 'N/A'
 * ```
 */
export function formatDateMMDDYYYY(dateString?: string): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Formats a date string to abbreviated day name (e.g., 'Mon', 'Tue').
 * 
 * @param dateString - ISO date string or any valid date string
 * @returns Abbreviated day name, or empty string if invalid
 * 
 * @example
 * ```typescript
 * formatDayAbbreviation('2024-01-15') // Returns: 'Mon'
 * formatDayAbbreviation('2024-01-16') // Returns: 'Tue'
 * formatDayAbbreviation('invalid') // Returns: ''
 * ```
 */
export function formatDayAbbreviation(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { weekday: 'short' }); // e.g., 'Sat'
}
