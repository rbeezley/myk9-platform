/**
 * ringsideGrantStore — the "active ringside grant" (Phase 1c, Locked Decision #8).
 *
 * A signed-in account that enters a per-show passcode *expands* its ringside
 * role for that one show — it never impersonates and never touches the account
 * session (identity, audit, push ownership stay with the account). That
 * expansion is held here as a transient, client-only grant:
 *
 *   { showId, role, source }
 *
 * Design notes:
 * - **Zustand, not AuthContext** (plan decision 5-D): the account context stays
 *   account-only; this store is read by the `/at-show` shim alone.
 * - **Ephemeral** (plan decision 5-E): NOT persisted. Sign-out navigates the
 *   document (`window.location.href`), which wipes this in-memory state — so a
 *   grant never survives sign-out or reload. `clearGrant` is for an explicit
 *   "leave show" affordance.
 * - **Set by the 1b confirmation flow.** This PR (1c) ships the model + the
 *   precedence wiring; the smart-input field and confirmation dialog that call
 *   `setGrant` land in Phase 1b. With no grant set, role resolution falls back
 *   to the account RBAC mapping (current behavior — see `buildRingsideAuth`).
 */

import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { UserRole as RingsideRole } from '@myk9/ringside';

export interface RingsideGrant {
  /** The show this grant is scoped to. A grant for show X never applies to Y. */
  showId: string;
  /** The ringside role the grant confers (from `validate-passcode`). */
  role: RingsideRole;
  /** Original normalized passcode, kept in memory only for ringside presence RPCs. */
  passcode?: string;
  /**
   * Display name the anonymous user optionally typed at passcode entry. Powers
   * show presence so a passcode-only judge/steward shows a real name (not just
   * "Judge"). Display-only — never an authz signal. Absent for signed-in grants
   * (those carry the account's own name).
   */
  name?: string;
  /**
   * Stable per-session id for an ANONYMOUS grant (minted once at passcode entry).
   * It is this device's presence channel key + dedup key, since an anonymous
   * user has no account `user.id`. Ephemeral by construction: a reload wipes the
   * grant, so a fresh session gets a fresh id. Unset for signed-in grants.
   */
  sessionId?: string;
  /**
   * How the grant was obtained. `'passcode'` is the only source today
   * (account + passcode merge); `'account'` is reserved for future use.
   */
  source: 'passcode' | 'account';
}

interface RingsideGrantState {
  activeGrant: RingsideGrant | null;
  /** Attach a show-scoped grant (called by the 1b confirmation flow). */
  setGrant: (grant: RingsideGrant) => void;
  /** Drop the grant (explicit "leave show"). */
  clearGrant: () => void;
  /**
   * True for the brief window between a passcode REVOCATION clearing the
   * grant and its anon-session signOut() actually completing (see
   * `ringsidePasscodeRevocation.ts`). `clearGrant` fires synchronously so the
   * gate reacts immediately, but the still-present anon session's claim is
   * only invalidated once signOut() resolves. Without this flag,
   * `useRehydrateRingsideGrant` would see "no grant, but a claim-shaped
   * app_metadata" in that gap and re-admit the just-revoked user. Set/cleared
   * ONLY by `ringsidePasscodeRevocation.ts` — never by a normal reload path.
   */
  suppressRehydration: boolean;
  setSuppressRehydration: (value: boolean) => void;
}

export const useRingsideGrantStore = create<RingsideGrantState>()(set => ({
  activeGrant: null,
  setGrant: grant => set({ activeGrant: grant }),
  clearGrant: () => set({ activeGrant: null }),
  suppressRehydration: false,
  setSuppressRehydration: value => set({ suppressRehydration: value }),
}));

/**
 * Precedence + show-scoping resolver (pure).
 *
 * Returns the grant's role ONLY when it is scoped to `showId`; otherwise null
 * so the caller falls back to the account RBAC mapping. This is the explicit
 * guard behind Locked Decision #8's rule: a passcode for show X must never
 * elevate the account's view of show Y.
 */
export function selectGrantRoleForShow(
  grant: RingsideGrant | null,
  showId: string | undefined
): RingsideRole | null {
  if (!grant || !showId) return null;
  return grant.showId === showId ? grant.role : null;
}

const RINGSIDE_ROLES: readonly RingsideRole[] = ['admin', 'judge', 'steward', 'exhibitor'];

function isRingsideRole(value: unknown): value is RingsideRole {
  return typeof value === 'string' && (RINGSIDE_ROLES as readonly string[]).includes(value);
}

/**
 * Reads the forge-proof `ringside_passcode` claim straight off a Supabase
 * session's `app_metadata` (stamped server-side by `validate-passcode`, never
 * client-writable — see `docs/plan-ringside-entries-read-authz.md` Phase C).
 *
 * This exists to REHYDRATE `ringsideGrantStore` after a hard reload wipes it
 * (the store is deliberately not persisted — see the module docstring — but
 * Supabase's own session persistence survives reload, so the claim is still
 * there). Returns the role only when the claim is present, correctly marked,
 * and scoped to `showId` — the same show-scoping rule as
 * `selectGrantRoleForShow`. Pure derivation only; callers still go through
 * `setGrant` to actually repopulate the store (see `useRehydrateRingsideGrant`).
 */
export function deriveRingsideRoleFromClaim(
  user: Pick<User, 'is_anonymous' | 'app_metadata'> | null | undefined,
  showId: string | undefined
): RingsideRole | null {
  if (!user?.is_anonymous || !showId) return null;
  const claim = user.app_metadata as
    { kind?: unknown; show_id?: unknown; ringside_role?: unknown } | undefined;
  if (claim?.kind !== 'ringside_passcode') return null;
  if (claim.show_id !== showId) return null;
  return isRingsideRole(claim.ringside_role) ? claim.ringside_role : null;
}
