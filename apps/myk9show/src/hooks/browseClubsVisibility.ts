import { UserRole } from '@/types/auth-types';
import type { Club } from '@/types/club-types';
import { PUBLIC_SHOW_STATUSES, type Show } from '@/types/show-types';

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
  /** Clubs hosting a cached show in a public status (clubHostsPublicShowIds). */
  publicShowHostIds?: ReadonlySet<string>;
}

/**
 * The local mirror of club_has_public_show(): ids of clubs hosting a cached
 * show whose status anon may read. Used only when the guest id set is unknown.
 */
export function clubHostsPublicShowIds(
  shows: readonly Pick<Show, 'clubId' | 'status'>[]
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const show of shows) {
    if (show.clubId && PUBLIC_SHOW_STATUSES.includes(show.status)) ids.add(show.clubId);
  }
  return ids;
}

/**
 * MYK9-747: whether a signed-out visitor may see this cached club. The clubs
 * replica is device-wide and a guest sync never prunes it, so it can hold a
 * club only a previous signed-in session could see. A revoked club's
 * authorized_at = null never reaches a guest (anon RLS hides the row), so the
 * server's guest id set is the authority. Offline, with no set, fall back to
 * clubs_select's two anon arms: authorized, or hosting a public show.
 */
function isListedForGuest(club: Club, viewer: BrowseClubsViewer): boolean {
  if (viewer.guestVisibleClubIds) return viewer.guestVisibleClubIds.has(club.id);
  return club.authorizedAt != null || (viewer.publicShowHostIds?.has(club.id) ?? false);
}

export function filterVisibleBrowseClubs(
  clubs: readonly Club[],
  roles: readonly string[] | null | undefined,
  viewer?: BrowseClubsViewer
): Club[] {
  const listed = viewer?.isGuest ? clubs.filter(club => isListedForGuest(club, viewer)) : clubs;
  if (canSeeDeveloperSeedClubs(roles)) return [...listed];
  return listed.filter(club => !isDeveloperSeedClub(club));
}
