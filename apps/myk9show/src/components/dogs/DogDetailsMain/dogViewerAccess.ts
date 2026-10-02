import { UserRole } from '@/types/auth-types';

/**
 * What the signed-in viewer may do on a dog page, decided by ROLE MEMBERSHIP
 * and relationship to the dog, never by primary role (MYK9-935 / MYK9-912).
 */
export interface DogViewer {
  hasRole: (role: UserRole) => boolean;
  /** True when the viewer is the dog's owner or co-owner (person ids, not auth uid). */
  viewerOwnsDog: boolean;
}

/**
 * The narrow dog surface (Registrations + vaccination Health Records + the
 * "entries live with each show" note) is for a secretary or club admin looking
 * at someone else's dog. Owners and co-owners keep the full view whatever their
 * roles; site admins are never narrowed.
 */
export function usesNarrowDogSurface({ hasRole, viewerOwnsDog }: DogViewer): boolean {
  if (viewerOwnsDog || hasRole(UserRole.SITE_ADMIN)) return false;
  return hasRole(UserRole.SECRETARY) || hasRole(UserRole.CLUB_ADMIN);
}

/**
 * Who may see the Manage registrations action. Matches the live
 * `dog_registrations` INSERT/UPDATE/DELETE RLS policies: the dog's owner,
 * `is_site_admin()`, or `has_role('secretary')`. A club admin without the
 * secretary role is refused by the server, so is not offered the action.
 * (Co-owners are treated as owners here, as on the rest of the dog page.)
 */
export function canManageDogRegistrations({ hasRole, viewerOwnsDog }: DogViewer): boolean {
  return viewerOwnsDog || hasRole(UserRole.SITE_ADMIN) || hasRole(UserRole.SECRETARY);
}
