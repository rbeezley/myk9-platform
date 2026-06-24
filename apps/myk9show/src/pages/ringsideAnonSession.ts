/**
 * Account-less ringside sign-in (Phase D).
 *
 * A judge/steward who enters a show passcode WITHOUT an account needs a real
 * server identity, because the offline replication layer authenticates every
 * read/write sync through a Supabase session — no session ⟹ RLS denies ⟹ nothing
 * caches. So this orchestrates the three-step anonymous-session flow locked in
 * `docs/plan-ringside-entries-read-authz.md`:
 *
 *   1. Anonymous sign-in            → `auth.uid()` exists, so the edge fn has a
 *                                      user to stamp.
 *   2. `validate-passcode` (edge)   → on a valid code, stamps THIS anon user's
 *                                      app_metadata with { kind:'ringside_passcode',
 *                                      show_id, ringside_role } (Phase C).
 *   3. `refreshSession()`           → the reissued JWT carries the stamped claim,
 *                                      which the A+B DB tier authorizes on.
 *
 * The session supplies DB identity; the client `ringsideGrantStore` still holds
 * the UI role (both derive from the same validated passcode, so they agree).
 *
 * PRECONDITION: call this ONLY for the account-less path (no signed-in user). A
 * real account that enters a passcode keeps its account session untouched and
 * uses the client-only grant (Locked Decision #8) — never this flow, or step 1
 * would replace its session with an anonymous one.
 */

import { supabase } from '@/services/database/supabaseClient';
import { validatePasscode, type ValidatePasscodeResult } from './validatePasscode';

const SESSION_ERROR =
  "We couldn't start your ringside session. Check your connection and try again.";

/** A passcode result, plus the one failure mode unique to the anon-session flow. */
export type AnonRingsideResult =
  | ValidatePasscodeResult
  | { ok: false; kind: 'session'; message: string };

export async function startAnonymousRingsideSession(
  passcode: string
): Promise<AnonRingsideResult> {
  // 1. Ensure an anonymous session exists. Reuse one if the device already has
  //    it (e.g. after a reload) rather than minting another orphan anon user.
  const { data: existing } = await supabase.auth.getSession();
  if (!existing.session?.user?.is_anonymous) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) return { ok: false, kind: 'session', message: SESSION_ERROR };
  }

  // 2. Validate — the edge fn stamps the ringside claim onto this anon session.
  const result = await validatePasscode(passcode);
  if (!result.ok) {
    // No claim was stamped; drop the dangling anon session so the device isn't
    // left half-authenticated with an empty claim.
    await supabase.auth.signOut();
    return result;
  }

  // 3. Refresh so the reissued JWT carries the stamped app_metadata before the
  //    caller routes to /at-show and the replication layer starts syncing.
  const { error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshErr) {
    await supabase.auth.signOut();
    return { ok: false, kind: 'session', message: SESSION_ERROR };
  }

  return result;
}

/**
 * End an anonymous ringside session (the "leave show" / exit affordance, when
 * one is wired). No-op when the current session is a real account — we must
 * never sign a signed-in user out as a side effect of leaving a ring.
 */
export async function endAnonymousRingsideSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.is_anonymous) {
    await supabase.auth.signOut();
  }
}
