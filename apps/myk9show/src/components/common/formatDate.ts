import { format } from 'date-fns';
import { parseLocalDateString, normalizeLocalDateString } from '@/utils/dateLocal';

/**
 * Formats a date string as M/D/YYYY for user-friendly display.
 * First normalizes the date string to ensure consistent local handling,
 * then formats it using date-fns.
 * 
 * @param dateString Date string in any supported format
 * @returns Formatted date string as M/D/YYYY
 */
export function formatDateMMDDYYYY(dateString?: string): string {
  if (!dateString) return '';
  try {
    // First normalize the date string to ensure consistent local handling
    const normalizedDateString = normalizeLocalDateString(dateString);
    if (!normalizedDateString) return '';
    
    // Then parse it to a Date object and format with date-fns
    const parsed = parseLocalDateString(normalizedDateString);
    if (!parsed) return '';
    
    return format(parsed, 'M/d/yyyy');
  } catch (e) {
    console.error('Error formatting date:', e);
    return '';
  }
}
