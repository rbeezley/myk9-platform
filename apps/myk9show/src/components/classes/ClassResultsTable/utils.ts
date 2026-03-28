/**
 * Utility functions for ClassResultsTable
 *
 * Pure helper functions extracted from the component for reuse and testing.
 */


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

