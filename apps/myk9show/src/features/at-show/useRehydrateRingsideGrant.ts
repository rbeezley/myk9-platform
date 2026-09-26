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
 */

import { useEffect } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  useRingsideGrantStore,
  selectGrantRoleForShow,
  deriveRingsideRoleFromClaim,
  type RingsideGrant,
} from '@/store/ringsideGrantStore';
import { persistRingsideClaim, readPersistedRingsideClaim } from './ringsideClaimCache';

export function useRehydrateRingsideGrant(
  showId: string | undefined
): RingsideGrant['role'] | null {
  const { user, loading } = useAuthContext();
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);
  const setGrant = useRingsideGrantStore(state => state.setGrant);
  const suppressRehydration = useRingsideGrantStore(state => state.suppressRehydration);

  const resolvable = !loading && !!showId && !suppressRehydration;
  const storeRole = resolvable ? selectGrantRoleForShow(activeGrant, showId) : null;
  const claimRole = resolvable && !storeRole ? deriveRingsideRoleFromClaim(user, showId) : null;
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const offlineFallbackRole =
    resolvable && !storeRole && !claimRole && !user && isOffline
      ? readPersistedRingsideClaim(showId!)
      : null;

  useEffect(() => {
    if (!resolvable || storeRole) return;
    if (claimRole) {
      persistRingsideClaim({ showId: showId!, role: claimRole });
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
      });
    }
  }, [resolvable, storeRole, claimRole, offlineFallbackRole, showId, setGrant]);

  return storeRole ?? claimRole ?? offlineFallbackRole;
}
