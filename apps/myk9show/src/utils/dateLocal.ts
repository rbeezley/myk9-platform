/**
 * Core date handling utilities for myK9Show.
 * These utilities ensure consistent date handling without timezone issues.
 * IMPORTANT: We consistently work with dates in YYYY-MM-DD format.
 */

// Import the `logger` singleton rather than calling `LoggingService.getInstance()`
// at module scope. This module sits deep in common import chains (entries →
// search → entryWindowDate → here), and a module-scope call to the CLASS means
// every test that mocks '@/services/LoggingService' with a factory must export
// `LoggingService` too -- a factory mock replaces the whole module, so omitting
// it makes the entire suite fail to COLLECT, far from any date code.
// `logger` is `LoggingService.getInstance()`, so this is behaviour-identical.
import { logger } from '@/services/LoggingService';

/**
 * Converts a Date object to a YYYY-MM-DD string.
 * Uses component methods to avoid timezone issues.
 */
export function formatDateLocal(date: Date): string {
  if (!date || isNaN(date.getTime())) {
    logger.debug('formatDateLocal - invalid date input', 'dateUtils', { date });
    return '';
  }
  
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (e) {
    logger.error('Error in formatDateLocal', 'dateUtils', { date, error: e });
    return '';
  }
}

/**
 * Parses a YYYY-MM-DD string to a Date object.
 * Creates the date with year/month/day constructor to avoid timezone issues.
 */
export function parseLocalDateString(dateString: string): Date | undefined {
  if (!dateString) return undefined;
  
  try {
    // Parse the date components
    const parts = dateString.split('-');
    if (parts.length !== 3) {
      logger.debug('parseLocalDateString - invalid format, not YYYY-MM-DD', 'dateUtils', { dateString });
      return undefined;
    }
    
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-based months
    const day = parseInt(parts[2], 10);
    
    // Validate components
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      logger.debug('parseLocalDateString - invalid numeric parts', 'dateUtils', { year, month: month + 1, day });
      return undefined;
    }
    
    if (year < 1900 || year > 2100 || month < 0 || month > 11 || day < 1 || day > 31) {
      logger.debug('parseLocalDateString - out of range values', 'dateUtils', { year, month: month + 1, day });
      return undefined;
    }
    
    // Create a local date (no timezone offset)
    return new Date(year, month, day);
  } catch (e) {
    logger.error('Error parsing date string', 'dateUtils', { dateString, error: e });
    return undefined;
  }
}

/**
 * Ensures any input date string is properly converted to our standard YYYY-MM-DD format.
 * Handles various date formats and ensures consistent local date handling.
 */
export function normalizeLocalDateString(dateString?: string): string {
  if (!dateString) return '';
  
  try {
    // First try direct parsing if it matches our YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString; // Already in the right format, don't process further
    }
    
    // Handle other date formats by creating a date in the local timezone
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      logger.debug('normalizeLocalDateString - invalid date', 'dateUtils', { dateString });
      return '';
    }
    
    // Create a local date explicitly using components to avoid timezone issues
    const localDateFromComponents = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    
    return formatDateLocal(localDateFromComponents);
  } catch (e) {
    logger.error('Error normalizing date string', 'dateUtils', { dateString, error: e });
    return '';
  }
}

/**
 * Validates if a date string is in the correct YYYY-MM-DD format
 */
export function isValidDateFormat(dateString: string): boolean {
  if (!dateString) return false;
  
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(dateString)) return false;
  
  const date = parseLocalDateString(dateString);
  return date !== undefined;
}

/**
 * Gets today's date in YYYY-MM-DD format
 */
export function getTodayLocal(): string {
  return formatDateLocal(new Date());
}

/**
 * Calculates the difference in days between two date strings
 */
export function dateDifferenceInDays(startDate: string, endDate: string): number {
  const start = parseLocalDateString(startDate);
  const end = parseLocalDateString(endDate);
  
  if (!start || !end) {
    logger.debug('dateDifferenceInDays - invalid date inputs', 'dateUtils', { startDate, endDate });
    return 0;
  }
  
  const diffTime = end.getTime() - start.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}