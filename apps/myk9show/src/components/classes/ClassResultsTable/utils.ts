/**
 * Utility functions for ClassResultsTable
 *
 * Pure helper functions extracted from the component for reuse and testing.
 */

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
