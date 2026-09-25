import { UserRole } from '@/types/auth-types';
import type { Club } from '@/types/club-types';

export function isDeveloperSeedClub(club: Pick<Club, 'name'>): boolean {
  return /^e2e club\b/i.test(club.name.trim());
}

export function canSeeDeveloperSeedClubs(roles: readonly string[] | null | undefined): boolean {
  return roles?.includes(UserRole.SITE_ADMIN) ?? false;
}

export interface BrowseClubsViewer {
  /** Signed out, or an anonymous (ringside passcode) session. */
  isGuest: boolean;
  /** Ids clubs_select listed for a guest at the last guest sync, or null. */
  guestVisibleClubIds: ReadonlySet<string> | null;
}

/**
 * MYK9-747: whether a signed-out visitor may see this cached club. The clubs
 * replica is device-wide and a guest sync never prunes it, so it can hold a
 * club only a previous signed-in session could see. A revoked club's
 * authorized_at = null never reaches a guest (anon RLS hides the row), so the
 * server's guest id set is the authority; offline, with no set, fall back to
 * the authorization half of clubs_select.
 */
function isListedForGuest(club: Club, guestVisibleClubIds: ReadonlySet<string> | null): boolean {
  if (guestVisibleClubIds) return guestVisibleClubIds.has(club.id);
  return club.authorizedAt != null;
}

export function filterVisibleBrowseClubs(
  clubs: readonly Club[],
  roles: readonly string[] | null | undefined,
  viewer?: BrowseClubsViewer
): Club[] {
  const listed = viewer?.isGuest
    ? clubs.filter(club => isListedForGuest(club, viewer.guestVisibleClubIds))
    : clubs;
  if (canSeeDeveloperSeedClubs(roles)) return [...listed];
  return listed.filter(club => !isDeveloperSeedClub(club));
}
