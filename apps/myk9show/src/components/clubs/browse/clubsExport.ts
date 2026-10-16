import { CLUB_TYPES } from '@/types/club-types';
import type { Club } from '@/types/club-types';

/** Human-readable label for a club type value. */
export function getClubTypeLabel(clubType: string | undefined): string | null {
  if (!clubType) return null;
  return CLUB_TYPES.find(t => t.value === clubType)?.label || clubType;
}

export function getClubLocation(club: Club): string {
  return [club.address?.city, club.address?.state].filter(Boolean).join(', ');
}

export const CLUB_EXPORT_HEADERS = ['Club', 'Type', 'Location', 'Members', 'Upcoming Shows'];

/** The Clubs list as CSV rows, in `CLUB_EXPORT_HEADERS` order. */
export function clubExportRows(clubs: readonly Club[], clubShowCounts: Map<string, number>) {
  return clubs.map(club => [
    club.name,
    getClubTypeLabel(club.clubType) || '',
    getClubLocation(club),
    club.memberIds?.length || 0,
    clubShowCounts.get(club.id) || 0,
  ]);
}
