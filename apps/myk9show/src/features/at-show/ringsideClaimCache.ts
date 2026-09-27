/**
 * ringsideClaimCache — durable, device-local echo of the last SERVER-CONFIRMED
 * `ringside_passcode` claim, keyed by show. Exists only to survive one narrow
 * gap: `@supabase/auth-js` (2.116.0) treats a session as "genuinely dead" once
 * its access token is more than `EXPIRY_MARGIN_MS` (90s) past its real `exp`,
 * and returns `session: null` from `getSession()` / the initial
 * `onAuthStateChange` notification whenever refreshing it fails — INCLUDING
 * when the failure is a plain offline network error, where nothing was
 * actually rejected and the session is still sitting untouched in storage
 * (`_removeSession()` is never called for a retryable/offline failure; only
 * the client's in-memory read of it goes dark). A judge who reloads mid-show
 * after being offline longer than the access-token lifetime hits exactly
 * this: `useAuthContext().user` comes back `null` with no SIGNED_OUT ever
 * having fired and no passcode revoked.
 *
 * `useRehydrateRingsideGrant` treats that specific combination — no user, but
 * genuinely offline — as UNRESOLVED identity (CLAUDE.md lesson
 * offline-identity-pairing), not as signed-out, and falls back to whatever
 * this cache last confirmed. It is never a fallback while online: there,
 * `user === null` really does mean no session, and the existing sign-in /
 * passcode-entry path is correct.
 *
 * Every write here is a snapshot of a value `deriveRingsideRoleFromClaim`
 * already derived from a real, server-stamped session — this cache never
 * originates a claim on its own, and it is purged on every path that ends
 * ringside access (the `SIGNED_OUT`/`SIGNED_IN` handling in `useAuth.ts`,
 * passcode revocation) so it can never outlive a sign-out, a different
 * identity signing in, or a revoked passcode.
 */

import type { UserRole as RingsideRole } from '@myk9/ringside';

const STORAGE_KEY = 'myk9:ringside-claim-cache';

const RINGSIDE_ROLES: readonly RingsideRole[] = ['admin', 'judge', 'steward', 'exhibitor'];

function isRingsideRole(value: unknown): value is RingsideRole {
  return typeof value === 'string' && (RINGSIDE_ROLES as readonly string[]).includes(value);
}

export interface CachedRingsideClaim {
  showId: string;
  role: RingsideRole;
}

/** Snapshot the confirmed claim, or clear it (explicit sign-out / revocation). */
export function persistRingsideClaim(claim: CachedRingsideClaim | null): void {
  try {
    if (!claim) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ showId: claim.showId, role: claim.role })
    );
  } catch {
    // Best-effort: private browsing / storage quota. The reload still works —
    // it just can't survive the offline-genuinely-expired gap this cache closes.
  }
}

/** The cached role for `showId`, or null if absent, malformed, or for another show. */
export function readPersistedRingsideClaim(showId: string): RingsideRole | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedRingsideClaim> | null;
    if (!parsed || parsed.showId !== showId) return null;
    return isRingsideRole(parsed.role) ? parsed.role : null;
  } catch {
    return null;
  }
}
