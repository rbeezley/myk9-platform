import { formatVenueLines, type ShowAddressFields } from '../_shared/exhibitorEmailDetails.ts';

/**
 * The event location: the address the secretary typed (MYK9-2490), by the same rule as the
 * emails, on one line because a calendar LOCATION is one line.
 */
export function feedVenue(show: ShowAddressFields | null | undefined): string | null {
  const lines = formatVenueLines(show);
  return lines ? lines.split('\n').join(', ') : null;
}
