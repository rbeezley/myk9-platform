import { UserRole } from '@/types/auth-types';
import type { Dog } from '@/types/dog-types';
import type { PersonIdentityState } from '@/context/authContextTypes';

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

/**
 * The viewer's relationship to a dog, with "not decided yet" as its own state
 * (LESSON offline-identity-pairing). RBAC roles and the viewer's person id load
 * separately, so for a moment a real owner reads as a non-owner and a staff
 * viewer reads as having no roles; anything that acts on the answer (a layout,
 * a control, an effect that strips a deep link) must wait for `pending` to end.
 */
export type DogViewerRelationship = { kind: 'pending' } | { kind: 'owner' } | { kind: 'nonOwner' };

export interface DogRelationshipInputs {
  dog: Pick<Dog, 'ownerId' | 'coOwnerId'>;
  /** Authoritative, people-store or cached person id; `null`/`undefined` when none is known. */
  viewerPersonId: string | null | undefined;
  /** AuthContext's person lookup state. `undefined` (a bare test context) is not pending. */
  personIdentityState?: PersonIdentityState | undefined;
  rbacLoading?: boolean | undefined;
  /**
   * Stop waiting: the viewer is offline, or the wait timed out. A cold offline
   * boot with no cached pairing never leaves `unresolved`, so this decides it as
   * `nonOwner`, which for staff is the narrow read-only surface.
   */
  gaveUp: boolean;
}

export function resolveDogRelationship({
  dog,
  viewerPersonId,
  personIdentityState,
  rbacLoading,
  gaveUp,
}: DogRelationshipInputs): DogViewerRelationship {
  if (rbacLoading && !gaveUp) return { kind: 'pending' };
  if (viewerPersonId) {
    return dog.ownerId === viewerPersonId || dog.coOwnerId === viewerPersonId
      ? { kind: 'owner' }
      : { kind: 'nonOwner' };
  }
  if (personIdentityState === 'unresolved' && !gaveUp) return { kind: 'pending' };
  return { kind: 'nonOwner' };
}

export interface DogPageGates {
  viewerOwnsDog: boolean;
  narrowSurface: boolean;
  canManageRegistrations: boolean;
}

/** Every gate on the dog page, derived from the one relationship. Null while pending. */
export function deriveDogPageGates(
  relationship: DogViewerRelationship,
  hasRole: (role: UserRole) => boolean
): DogPageGates | null {
  if (relationship.kind === 'pending') return null;
  const viewer: DogViewer = { hasRole, viewerOwnsDog: relationship.kind === 'owner' };
  return {
    viewerOwnsDog: viewer.viewerOwnsDog,
    narrowSurface: usesNarrowDogSurface(viewer),
    canManageRegistrations: canManageDogRegistrations(viewer),
  };
}
