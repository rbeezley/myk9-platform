/**
 * Core date handling utilities for myK9Show.
 * These utilities ensure consistent date handling without timezone issues.
 * IMPORTANT: We consistently work with dates in YYYY-MM-DD format.
 */

import { LoggingService } from '@/services/LoggingService';

const logger = LoggingService.getInstance();

/**
 * Formats a date string for display in MM/DD/YYYY format with simple string manipulation
 * This is the most reliable way to format a date without timezone issues
 */
export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  
  try {
    // Ensure we're using the raw YYYY-MM-DD string from the database
    // and not interpreting it with Date objects that can cause timezone issues
    const parts = dateStr.split('-');
    if (parts.length !== 3) {
      logger.debug('formatDateDisplay - invalid format, not YYYY-MM-DD', 'dateUtils', { dateStr });
      return dateStr;
    }
    
    // Extract parts directly from the string, no Date object creation
    const [year, month, day] = parts;
    
    // Validate numeric parts
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    
    if (isNaN(yearNum) || isNaN(monthNum) || isNaN(dayNum)) {
      logger.debug('formatDateDisplay - invalid numeric parts', 'dateUtils', { year, month, day });
      return dateStr;
    }
    
    // Format as MM/DD/YYYY, preserving exact day value from input string
    return `${monthNum}/${dayNum}/${yearNum}`;
  } catch (e) {
    logger.error('Error in formatDateDisplay', 'dateUtils', { dateStr, error: e });
    return dateStr; // Return original on error
  }
}

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