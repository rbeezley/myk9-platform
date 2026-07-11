/**
 * useRehydrateRingsideGrant — repopulates the client-only `ringsideGrantStore`
 * from a still-valid anonymous session's `ringside_passcode` claim when the
 * store doesn't already reflect it.
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
 */

import { useEffect } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  useRingsideGrantStore,
  selectGrantRoleForShow,
  deriveRingsideRoleFromClaim,
} from '@/store/ringsideGrantStore';

export function useRehydrateRingsideGrant(showId: string | undefined): void {
  const { user, loading } = useAuthContext();
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);
  const setGrant = useRingsideGrantStore(state => state.setGrant);

  useEffect(() => {
    if (loading || !showId) return;
    // The store already agrees with this show — nothing to rehydrate. Also
    // covers the signed-in-account grant case, which never needs claim-based
    // rehydration (its session is never anonymous).
    if (selectGrantRoleForShow(activeGrant, showId)) return;
    const claimRole = deriveRingsideRoleFromClaim(user, showId);
    if (!claimRole) return;
    setGrant({
      showId,
      role: claimRole,
      sessionId: crypto.randomUUID(),
      source: 'passcode',
    });
  }, [loading, showId, user, activeGrant, setGrant]);
}
