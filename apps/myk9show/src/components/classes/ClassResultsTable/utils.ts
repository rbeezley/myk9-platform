/**
 * Utility functions for ClassResultsTable
 *
 * Pure helper functions extracted from the component for reuse and testing.
 */

import type { BulkEntryData } from './types';
import { STATUSES_REQUIRING_REASON } from './constants';

/** Convert a time string in MM:SS.HH format to milliseconds */
export function timeStringToMs(timeStr: string): number {
  const match = timeStr.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
  if (!match) return 0;

  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const hundredths = parseInt(match[3]);

  return (minutes * 60 + seconds) * 1000 + hundredths * 10;
}

/** Convert various time string formats to the standard MM:SS.HH input format */
export function convertTimeToInputFormat(timeStr: string): string {
  if (!timeStr) return '';

  // Already in MM:SS.HH format
  if (timeStr.match(/^\d{1,2}:\d{2}\.\d{2}$/)) {
    return timeStr;
  }

  // Convert MM:SS to MM:SS.HH
  if (timeStr.match(/^\d{1,2}:\d{2}$/)) {
    return `${timeStr}.00`;
  }

  // Try to parse as seconds
  const seconds = parseFloat(timeStr);
  if (!isNaN(seconds)) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hundredths = Math.round((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  }

  return timeStr;
}

/** Return a CSS class string for AKC ribbon placement badges */
export function getPlacementBadgeClass(placement: number | null): string {
  if (!placement) return '';

  switch (placement) {
    case 1:
      return 'akc-placement-badge akc-placement-1st';
    case 2:
      return 'akc-placement-badge akc-placement-2nd';
    case 3:
      return 'akc-placement-badge akc-placement-3rd';
    case 4:
      return 'akc-placement-badge akc-placement-4th';
    default:
      return 'akc-placement-badge akc-placement-other';
  }
}

/** Format a placement number as an ordinal string (1st, 2nd, 3rd, etc.) */
export function formatPlacement(placement: number): string {
  switch (placement) {
    case 1:
      return '1st';
    case 2:
      return '2nd';
    case 3:
      return '3rd';
    default:
      return `${placement}th`;
  }
}

/**
 * Calculate placements for qualified entries based on faults first, then time.
 *
 * Returns a new array with placement values assigned to qualified entries
 * and cleared for non-qualified entries.
 */
export function calculatePlacements(data: BulkEntryData[]): BulkEntryData[] {
  // Only calculate placements for qualified entries with valid data
  const qualifiedEntries = data
    .map((entry, index) => ({ ...entry, originalIndex: index }))
    .filter(
      entry => entry.qualification === 'Qualified' && entry.searchTime && entry.faults !== undefined
    );

  // Sort by faults (ascending), then by time (ascending)
  const sortedEntries = qualifiedEntries.sort((a, b) => {
    const faultsA = parseInt(a.faults) || 0;
    const faultsB = parseInt(b.faults) || 0;

    if (faultsA !== faultsB) {
      return faultsA - faultsB; // Fewer faults = better placement
    }

    // If faults are equal, sort by time
    const timeA = timeStringToMs(a.searchTime);
    const timeB = timeStringToMs(b.searchTime);
    return timeA - timeB; // Faster time = better placement
  });

  // Assign placements
  const updatedData = [...data];
  sortedEntries.forEach((entry, index) => {
    const placement = index + 1;
    updatedData[entry.originalIndex].placement = placement;
  });

  // Clear placements for non-qualified entries
  updatedData.forEach(entry => {
    if (entry.qualification !== 'Qualified') {
      entry.placement = null;
    }
  });

  return updatedData;
}

/** Validate a single entry and return whether it is valid plus an optional error message */
export function validateEntry(data: BulkEntryData): { isValid: boolean; error?: string } {
  if (!data.hasChanges) {
    return { isValid: true }; // Empty fields are valid (not invalid)
  }

  // Check if qualification reason is required
  const needsReason = STATUSES_REQUIRING_REASON.includes(data.qualification);
  if (needsReason && !data.qualificationReason) {
    return { isValid: false, error: 'Reason required for NQ, Excused, or Withdrawn' };
  }

  // Only Qualified entries require time — NQ/Excused/Withdrawn/Absent may not have one
  if (data.qualification === 'Qualified' && !data.searchTime) {
    return { isValid: false, error: 'Time required for Qualified entries' };
  }

  // If time is provided without qualification, require qualification
  if (!data.qualification && data.searchTime) {
    return { isValid: false, error: 'Qualification required when time is set' };
  }

  // If only notes, faults, or qualification reason are set without time/qualification, that's valid
  if (!data.searchTime && !data.qualification) {
    return { isValid: true };
  }

  // Validate time format (MM:SS.HH)
  const timePattern = /^(\d{1,2}):([0-5]\d)\.(\d{2})$/;
  if (!timePattern.test(data.searchTime)) {
    return { isValid: false, error: 'Invalid time format (MM:SS.HH)' };
  }

  // Additional validation for logical time values
  const match = data.searchTime.match(timePattern);
  if (match) {
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const hundredths = parseInt(match[3]);

    if (minutes > 59 || seconds > 59 || hundredths > 99) {
      return { isValid: false, error: 'Invalid time values' };
    }
  }

  // Validate faults
  const faultCount = parseInt(data.faults);
  if (isNaN(faultCount) || faultCount < 0) {
    return { isValid: false, error: 'Invalid fault count' };
  }

  return { isValid: true };
}
