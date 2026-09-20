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

import type { AccountEntryReadState } from '@/features/account-entry-read/accountEntryReadState';

export type EntriesIdentityState =
  /** Auth itself has not settled. Nothing is known yet. */
  | 'pending-auth'
  /** Signed in, but the person id has not resolved — offline, or still in flight. */
  | 'unresolved'
  /** The authoritative profile lookup completed and found no person row. */
  | 'missing'
  /** We know who this is; an empty list is now a fact we can state. */
  | 'resolved';

export interface DeriveEntriesIdentityStateInput {
  /** AuthContext's own `loading` — the auth session, not the profile lookup. */
  authLoading: boolean;
  /** A signed-in auth user exists. */
  hasUser: boolean;
  /** The resolved `people.id`, or null while unresolved/absent. */
  personId: string | null | undefined;
  /** AuthContext's explicit profile lookup state, when available. */
  personIdentityState?: 'unresolved' | 'resolved' | 'missing' | undefined;
}

export type MyEntriesPresentation =
  'known-rows' | 'identity-pending' | 'identity-missing' | 'unconfirmed-empty' | 'confirmed-empty';

export interface MyEntriesPresentationInput {
  identityState: EntriesIdentityState;
  readState: AccountEntryReadState;
  entryCount: number;
  isLoading: boolean;
}

/**
 * Choose the page branch without turning a missing read into an empty-account
 * claim. Existing rows are useful evidence even while the identity refresh is
 * unresolved; only an authoritative empty read can show the first-run state.
 */
export function getMyEntriesPresentation({
  identityState,
  readState,
  entryCount,
}: MyEntriesPresentationInput): MyEntriesPresentation {
  if (entryCount > 0) return 'known-rows';
  if (identityState === 'missing') return 'identity-missing';
  // A cached person id lets the replica read run, but an unresolved
  // authoritative profile still leaves the account identity unconfirmed. An
  // empty result from that read is therefore not entitled to the first-run
  // claim, even when the replica reports a confirmed source.
  if (identityState === 'unresolved') return 'identity-pending';
  if (readState === 'identity-unresolved' || readState === 'read-pending') {
    return 'identity-pending';
  }
  if (readState === 'confirmed') return 'confirmed-empty';
  return 'unconfirmed-empty';
}

/**
 * Derive the identity state. Deliberately total and order-sensitive:
 * auth first, then identity, and only then "resolved".
 */
export function deriveEntriesIdentityState({
  authLoading,
  hasUser,
  personId,
  personIdentityState,
}: DeriveEntriesIdentityStateInput): EntriesIdentityState {
  if (authLoading) return 'pending-auth';
  // Signed out is the route guard's problem, not this page's. Treating it as
  // `unresolved` keeps this function from ever returning `resolved` for a
  // caller with no user, which is what gates the first-run claim.
  if (!hasUser) return 'unresolved';
  if (personIdentityState === 'missing') return 'missing';
  // A cached person id is enough to read the replica, but it is not evidence
  // that the authoritative profile lookup completed. Keep the page truthful
  // until that lookup resolves.
  if (personIdentityState === 'unresolved') return 'unresolved';
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
