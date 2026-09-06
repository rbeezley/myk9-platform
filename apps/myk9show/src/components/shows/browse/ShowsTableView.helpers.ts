import { formatShowDateRange } from '@/lib/format/dates';

export function formatShowsTableDateRange(startDate: string, endDate: string): string {
  return formatShowDateRange(startDate, endDate);
}

/**
 * Split a one-line show location into a venue line and a locality line at the
 * first comma: "300 Load Fixture Way, Tulsa, OK 74101" → venue "300 Load
 * Fixture Way", locality "Tulsa, OK 74101". A location with no comma is all
 * venue.
 */
export function splitShowLocation(location: string | null | undefined): {
  venue: string;
  locality: string;
} {
  const trimmed = (location ?? '').trim();
  const comma = trimmed.indexOf(',');
  if (comma === -1) return { venue: trimmed, locality: '' };
  return { venue: trimmed.slice(0, comma).trim(), locality: trimmed.slice(comma + 1).trim() };
}
