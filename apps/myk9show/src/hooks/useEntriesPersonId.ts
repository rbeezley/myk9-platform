/**
 * The ONE person id every account-level `getUserEntries` consumer reads.
 *
 * There used to be two expressions. My Shows and My Payments took
 * `useCurrentUserPersonId() ?? userWithRoles.databaseUserId`; the ringside and
 * Browse Shows callers took `useCurrentUserPersonId()` alone.
 *
 * THE `??` ARM WAS DEAD, and is deliberately not carried here.
 * `useCurrentUserPersonId` already returns `userWithRoles.databaseUserId` first
 * (`useRoleBasedData.ts:187`) and only consults the people store when it is
 * falsy, so the second operand could never be reached with a value. The two
 * expressions were extensionally equal: MYK9-629's premise that this was two
 * React Query keys for one account is wrong, and repeating the dead arm here
 * would have preserved a fiction in the one place meant to end it.
 *
 * What this hook is, then, is a named seam: five call sites that each re-typed
 * an identity expression now share one, so the next consumer copies a name
 * instead of re-deciding what "the exhibitor" means.
 *
 * @module hooks/useEntriesPersonId
 */

import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';

export function useEntriesPersonId(): string | null {
  return useCurrentUserPersonId();
}
