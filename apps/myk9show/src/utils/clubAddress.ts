import type { Club } from '@/types/club-types';

/**
 * Join a club's full street address into a single comma-separated string.
 * Blank parts are skipped. Returns '' when the club is undefined so callers
 * can drop it straight into a UI/display field.
 */
export function formatClubAddress(club: Club | undefined): string {
  if (!club) return '';
  const a = club.address;
  return [a.street, a.city, a.state, a.zipCode, a.country].filter(Boolean).join(', ');
}
