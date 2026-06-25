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
import {
  replicatedTrialsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
} from '@/services/replication';
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
  const current = existing.session?.user;

  // ENFORCE the precondition rather than trusting it: never replace a REAL
  // account session with an anonymous one. `useAuthContext.user` is null during
  // the getSession() auth-restore window even when a persisted account session
  // exists, so a passcode submitted in that window could reach here with a real
  // session present — signInAnonymously() would silently sign the account out.
  // Refuse instead (the caller re-submits once auth resolves, hitting the
  // signed-in branch). Symmetric with endAnonymousRingsideSession's guard.
  if (current && current.is_anonymous !== true) {
    return { ok: false, kind: 'session', message: SESSION_ERROR };
  }
  if (!current?.is_anonymous) {
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

  // The anon flow ALWAYS expects a stamp. If the edge fn validated the passcode
  // but skipped stamping (e.g. a transient getUser failure → success:true,
  // sessionStamped:false), the refreshed JWT carries no claim — the user would
  // land in the ring and silently read 0 rows. Fail closed instead.
  if (!result.sessionStamped) {
    await supabase.auth.signOut();
    return { ok: false, kind: 'session', message: SESSION_ERROR };
  }

  // The ringside claim is only live AFTER the refresh above. But signInAnonymously
  // already emitted SIGNED_IN, which kicks off a replication sync with the bare
  // anon JWT (empty app_metadata) — the claim-gated view returns 0 rows, and that
  // empty result gets cached with nothing re-triggering a sync. Without this,
  // /at-show shows "No Entries Yet" for a passcode judge. Re-sync the per-show
  // tables now, under the stamped session, so the run order + entries load.
  //
  // Scope differs per table: trials and entries sync by show_id (so showId works
  // directly), but classes sync by TRIAL_ID — so sync trials first, then sync
  // classes per trial (passing showId to classes.sync is a no-op). Offline-
  // tolerant: allSettled swallows failures (the page falls back to cache and
  // re-syncs when back online).
  await Promise.allSettled([
    replicatedEntriesTable.sync(result.showId),
    (async () => {
      await replicatedTrialsTable.sync(result.showId);
      const trials = await replicatedTrialsTable.getTrialsByShow(result.showId);
      await Promise.allSettled(trials.map(trial => replicatedClassesTable.sync(trial.id)));
    })(),
  ]);

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
