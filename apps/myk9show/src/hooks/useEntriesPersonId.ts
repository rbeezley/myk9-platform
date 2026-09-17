/**
 * The ONE person id every account-level `getUserEntries` consumer reads.
 *
 * There used to be two resolvers. My Shows and My Payments took
 * `useCurrentUserPersonId() ?? userWithRoles.databaseUserId`; the two ringside
 * hooks took `useCurrentUserPersonId()` alone. Since `getUserEntries` keys its
 * React Query cache on the id, an exhibitor whose id came from the auth record
 * rather than the legacy lookup got a DIFFERENT key on each pair — the "one
 * shared query" of MYK9-563 item 3 was one query shape over two keys, so the
 * same rows were fetched twice and could disagree while one half refetched.
 *
 * Resolution order is the surviving one: the legacy `people` lookup first,
 * then the auth record. Dropping the fallback would disable the query for
 * every exhibitor whose id only exists in the legacy lookup.
 *
 * @module hooks/useEntriesPersonId
 */

import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';

export function useEntriesPersonId(): string | null {
  const legacyPersonId = useCurrentUserPersonId();
  const { userWithRoles } = useAuthContext();
  return legacyPersonId ?? userWithRoles?.databaseUserId ?? null;
}
