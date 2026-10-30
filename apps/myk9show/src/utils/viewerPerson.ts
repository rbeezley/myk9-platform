import type { User } from '@/types/user-types';

/** Find the person record for an auth user by matching `user_id`. */
export function getUserPersonFromAuthId(authUserId?: string, allPeople: User[] = []): User | null {
  if (!authUserId) return null;
  return allPeople.find(p => p.user_id === authUserId) || null;
}

/**
 * The viewer's `people.id`. Prefer the canonical id from RBAC (`databaseUserId`);
 * the auth-uid lookup is only for legacy sessions that predate it. `people.id`
 * is never the auth uid, so an unresolved identity is `undefined`, not the uid.
 */
export function resolveViewerPersonId(
  userWithRoles:
    { id?: string | undefined; databaseUserId?: string | undefined } | null | undefined,
  allPeople: User[] = [],
  cachedPersonId?: string | null
): string | undefined {
  if (!userWithRoles) return undefined;
  // `cachedPersonId` is the device-cached pairing (`useEntriesPersonId`). It is for READ checks
  // only (roster filter, ownership comparison): `databaseUserId` itself stays confirmed-only
  // because writes read it (MYK9-601 kept cached identity scoped to readers, MYK9-1493).
  return (
    userWithRoles.databaseUserId ??
    cachedPersonId ??
    getUserPersonFromAuthId(userWithRoles.id, allPeople)?.id
  );
}
