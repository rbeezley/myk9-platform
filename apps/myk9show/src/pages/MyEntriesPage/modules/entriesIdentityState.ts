/**
 * Whether My Shows knows WHO it is loading entries for.
 *
 * Entries are read by `personId`. That id comes from AuthContext's `people`
 * lookup, a plain network query with no `networkMode`, so it PAUSES offline —
 * and `useCurrentUserPersonId` returns `null` both while it is resolving and
 * when the person genuinely has no row. The page previously collapsed all of
 * that into `entries: []` with `isError: false` and then rendered the
 * first-run welcome, telling an exhibitor standing at a venue that they had
 * never entered a show while their entries sat in IndexedDB beneath them.
 *
 * The fix is not to guess which kind of `null` it is — it is to stop treating
 * "no entries" as proof of "no entries ever". `first-run` is now gated on a
 * POSITIVE signal (identity resolved, load finished), and every other case
 * falls into a state that claims nothing.
 *
 * @module MyEntriesPage/modules/entriesIdentityState
 */

export type EntriesIdentityState =
  /** Auth itself has not settled. Nothing is known yet. */
  | 'pending-auth'
  /** Signed in, but the person id has not resolved — offline, or still in flight. */
  | 'unresolved'
  /** We know who this is; an empty list is now a fact we can state. */
  | 'resolved';

export interface DeriveEntriesIdentityStateInput {
  /** AuthContext's own `loading` — the auth session, not the profile lookup. */
  authLoading: boolean;
  /** A signed-in auth user exists. */
  hasUser: boolean;
  /** The resolved `people.id`, or null while unresolved/absent. */
  personId: string | null | undefined;
}

/**
 * Derive the identity state. Deliberately total and order-sensitive:
 * auth first, then identity, and only then "resolved".
 */
export function deriveEntriesIdentityState({
  authLoading,
  hasUser,
  personId,
}: DeriveEntriesIdentityStateInput): EntriesIdentityState {
  if (authLoading) return 'pending-auth';
  // Signed out is the route guard's problem, not this page's. Treating it as
  // `unresolved` keeps this function from ever returning `resolved` for a
  // caller with no user, which is what gates the first-run claim.
  if (!hasUser) return 'unresolved';
  if (!personId) return 'unresolved';
  return 'resolved';
}

/**
 * Whether the page may state, as a fact, that this exhibitor has no entries.
 *
 * Requires ALL of: a known identity, a finished load, and no load error. Any
 * one of those missing means the empty list is an absence of knowledge, not
 * an absence of entries.
 */
export function canClaimNoEntries({
  identityState,
  isLoading,
  isError,
  entryCount,
}: {
  identityState: EntriesIdentityState;
  isLoading: boolean;
  isError: boolean;
  entryCount: number;
}): boolean {
  return identityState === 'resolved' && !isLoading && !isError && entryCount === 0;
}
