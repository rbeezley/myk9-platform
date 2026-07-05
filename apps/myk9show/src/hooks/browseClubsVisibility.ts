import { UserRole } from '@/types/auth-types';
import type { Club } from '@/types/club-types';

export function isDeveloperSeedClub(club: Pick<Club, 'name'>): boolean {
  return /^e2e club\b/i.test(club.name.trim());
}

export function canSeeDeveloperSeedClubs(roles: readonly string[] | null | undefined): boolean {
  return roles?.includes(UserRole.SITE_ADMIN) ?? false;
}

export function filterVisibleBrowseClubs(
  clubs: readonly Club[],
  roles: readonly string[] | null | undefined
): Club[] {
  if (canSeeDeveloperSeedClubs(roles)) return [...clubs];
  return clubs.filter(club => !isDeveloperSeedClub(club));
}
