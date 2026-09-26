/**
 * useRehydrateRingsideGrant — repopulates the client-only `ringsideGrantStore`
 * from a still-valid anonymous session's `ringside_passcode` claim when the
 * store doesn't already reflect it, and returns the role the CALLER should
 * treat as active right now.
 *
 * Why this exists: `ringsideGrantStore` is deliberately NOT persisted (plan
 * decision 5-E) — a hard reload wipes it. But Supabase's own session
 * persistence survives reload (it's in localStorage), so an anonymous
 * passcode judge/steward still has a valid, unexpired, forge-proof claim in
 * `user.app_metadata` after reload. Without this hook, `AtShowAccessGate` has
 * no grant to route on and falls through to exhibitor-account logic that was
 * never meant for an anonymous user, producing an indefinite "Checking
 * ringside access…" hang instead of restoring the ring. Fixes the launch-gate
 * checklist item "reload → score persists" in
 * `docs/plan-ringside-entries-read-authz.md` (found by the 2026-07-10
 * verification walk).
 *
 * Reads ONLY the claim's role + show_id — it does not, and cannot, recover
 * the original plaintext passcode or a typed display name (neither survive
 * reload by design; both are optional on `RingsideGrant` and consumers
 * already fall back gracefully — see `useLocalPresenceIdentity`). A fresh
 * presence `sessionId` is minted, matching the store's own "a fresh session
 * gets a fresh id" contract.
 *
 * Skips entirely while `suppressRehydration` is set — the narrow window
 * `ringsidePasscodeRevocation.ts` holds it open between dropping the grant
 * and the anon session's `signOut()` actually completing. Without this, a
 * revocation could be immediately undone by re-deriving from the not-yet-
 * invalidated claim still sitting in `app_metadata`.
 *
 * OFFLINE FALLBACK (offline-identity-pairing): when `user` comes back null
 * while the device is offline, that is not proof of a signed-out session —
 * `@supabase/auth-js` reports `session: null` for a genuinely-expired anon
 * session it never actually invalidated whenever refreshing it fails offline
 * (see `ringsideClaimCache.ts`). In that specific combination — no user, no
 * network — fall back to the last claim this hook itself confirmed for this
 * show. Never applied while online, where a null user is the real signal.
 * The grant this writes is marked `unconfirmedOffline: true` — see below.
 *
 * RETURN VALUE, AND WHY THE STORE WRITE ALONE ISN'T ENOUGH: the store is
 * populated from a `useEffect`, which runs AFTER this render commits.
 * `AtShowAccessGate` redirects to sign-in synchronously — in the SAME render
 * — whenever `user` is null, which unmounts the whole subtree before that
 * effect ever gets to fire. A grant that only exists one tick later is a
 * grant the gate never lives to see. Returning the resolved role lets the
 * gate (and anything else that needs an immediate answer) use it on the very
 * first render; the effect still runs afterward to make the store agree for
 * every other consumer (`useRingsideGrantRole`, presence, the revocation
 * flow).
 *
 * REVALIDATION ON RECONNECT (Codex review, MYK9-834): an offline-fallback
 * grant is unconfirmed by construction — it was never re-checked against the
 * live session, only against a cache. If the device comes back online and the
 * session turns out to be genuinely dead (`loading` is false and `user` is
 * null with real network available), an `unconfirmedOffline` grant still on
 * record is now known-stale and is cleared. Scoped ONLY to that flag: a grant
 * set by ordinary entry (`SmartSignInPage`) or claim-derivation can likewise
 * observe a momentarily-null `user` while the just-created session's
 * `onAuthStateChange` event is still propagating, and that race is a already
 * a tolerated, correct part of Locked Decision #8's client-only trust model
 * (`AtShowAccessGate.test.tsx`'s "admits an anonymous user with a matching
 * passcode grant") — clearing on it would be a regression, not a fix.
 */

import { useEffect } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  useRingsideGrantStore,
  selectGrantRoleForShow,
  deriveRingsideRoleFromClaim,
  type RingsideGrant,
} from '@/store/ringsideGrantStore';
import { readPersistedRingsideClaim } from './ringsideClaimCache';

export function useRehydrateRingsideGrant(
  showId: string | undefined
): RingsideGrant['role'] | null {
  const { user, loading } = useAuthContext();
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);
  const setGrant = useRingsideGrantStore(state => state.setGrant);
  const clearGrant = useRingsideGrantStore(state => state.clearGrant);
  const suppressRehydration = useRingsideGrantStore(state => state.suppressRehydration);

  const resolvable = !loading && !!showId && !suppressRehydration;
  const storeRole = resolvable ? selectGrantRoleForShow(activeGrant, showId) : null;
  const claimRole = resolvable && !storeRole ? deriveRingsideRoleFromClaim(user, showId) : null;
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const offlineFallbackRole =
    resolvable && !storeRole && !claimRole && !user && isOffline
      ? readPersistedRingsideClaim(showId!)
      : null;
  // Only an offline-fallback grant is subject to reconnect revalidation — see
  // the module docstring for why an ordinary grant must NOT be swept up here.
  const staleGrant =
    resolvable && storeRole && !user && !isOffline && activeGrant?.unconfirmedOffline === true;

  useEffect(() => {
    if (!resolvable) return;
    if (staleGrant) {
      clearGrant();
      return;
    }
    if (storeRole) return;
    if (claimRole) {
      // `setGrant` itself persists the confirmed claim to the offline-reload
      // fallback cache (ringsideGrantStore.ts) — no need to do it here too.
      setGrant({
        showId: showId!,
        role: claimRole,
        sessionId: crypto.randomUUID(),
        source: 'passcode',
      });
      return;
    }
    if (offlineFallbackRole) {
      setGrant({
        showId: showId!,
        role: offlineFallbackRole,
        sessionId: crypto.randomUUID(),
        source: 'passcode',
        unconfirmedOffline: true,
      });
    }
  }, [
    resolvable,
    staleGrant,
    storeRole,
    claimRole,
    offlineFallbackRole,
    showId,
    setGrant,
    clearGrant,
  ]);

  return staleGrant ? null : (storeRole ?? claimRole ?? offlineFallbackRole);
}
