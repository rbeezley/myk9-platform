/**
 * Whether the persisted cart belongs to someone other than the account just
 * announced (MYK9-651).
 *
 * A later announcement is always a change of identity, so it always resets.
 * The FIRST settled observation in a tab is not a change: the cart store
 * compares the identity it persisted with the one restored, which keeps a
 * draft across a reload and still clears account A's recovery ids on a tab
 * that opens with account B already signed in.
 *
 * With no recorded owner (storage from before owners were stamped, or a store
 * that has never heard an announcement) the only safe inference is the signed-
 * out one: nobody is signed in, so nothing persisted can be theirs.
 */
import type { AccountIdentityChange } from '@/lib/accountBoundary';

export function cartBelongsElsewhere(
  ownerAuthUserId: string | null | undefined,
  { userId, initial }: AccountIdentityChange
): boolean {
  if (!initial) return true;
  if (ownerAuthUserId === undefined) return userId === null;
  return ownerAuthUserId !== userId;
}
