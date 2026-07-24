import { useEffect, useState } from 'react';
import type { UserRole as RingsideRole } from '@myk9/ringside';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole as ShowRole } from '@/types/auth-types';
import { replicatedJudgeAssignmentsTable } from '@/services/replication';

/** Assignment-lifecycle statuses that put a class on the judge's plate — mirrors useJudgeAssignments. */
const ACTIVE_ASSIGNMENT_STATUSES = ['confirmed', 'invited'];

/**
 * Account roles the server's `ringside_update_entry()` manager tier authorizes
 * (is_site_admin / is_trial_secretary / is_club_admin) — they may score without
 * a judge_assignment, so the pre-flight must never block them, even when a
 * passcode grant has overridden their EFFECTIVE ringside role to `judge`.
 * CHAIRMAN is deliberately excluded — the server manager tier does not admit it.
 */
const SERVER_MANAGER_ACCOUNT_ROLES: readonly ShowRole[] = [
  ShowRole.SITE_ADMIN,
  ShowRole.SECRETARY,
  ShowRole.CLUB_ADMIN,
];

export type JudgeAssignmentGateResult =
  | { status: 'not-applicable' }
  | { status: 'checking' }
  | { status: 'assigned' }
  | { status: 'unassigned' };

interface Args {
  /** Effective ringside role (grant overrides RBAC), from useRingsideEffectiveRole. */
  ringsideRole: RingsideRole | null;
  /** Account RBAC role (grant-independent) — used to exempt server-authorized managers. */
  showRole: ShowRole | null | undefined;
  /** Whether the Supabase session is anonymous (a passcode guest session). */
  isAnonymous: boolean;
  classId: string | undefined;
}

/**
 * MYK9-82 pre-flight: `ringside_update_entry()` authorizes a scoring write via
 * `auth.uid()`-based tiers — manager role, a judge assigned to THIS class
 * (`judge_assignments`, status confirmed|invited), or (for an ANONYMOUS passcode
 * session) a show-scoped `app_metadata` claim. A signed-in judge ACCOUNT gets
 * NONE of the passcode claim — `validate-passcode` stamps only anonymous
 * sessions, and the account session is left untouched (Locked Decision #8;
 * migration 20260704190000 documents this explicitly). So a signed-in judge
 * with no assignment passes the client `canScore` gate, submits an optimistic
 * score, and only discovers the rejection at sync — the run is over and the
 * score is gone. This checks the assignment before the scoring engine mounts.
 *
 * Applies to a **non-anonymous session whose effective ringside role is
 * `judge`** — this catches both a signed-in RBAC judge AND a signed-in account
 * holding a judge passcode grant (the grant is client-only and does NOT
 * establish server authorization for an account session). Every other case is
 * `not-applicable`: an anonymous passcode session is server-authorized show-wide
 * by its claim, and managers/admins are authorized by role, not by assignment.
 *
 * Fail-open by design: reads replicated data only. It does a fast local check
 * first (an already-assigned judge never blocks or waits), and only when there
 * is no local match does it force a fresh `judge_assignments` sync before
 * denying — so a just-added assignment that hasn't replicated yet doesn't
 * wrongly block a legitimate judge. A cold/empty cache, a sync failure, or a
 * read error all resolve `assigned`; the server RPC remains the real
 * enforcement boundary.
 */
export function useJudgeAssignedToClass({
  ringsideRole,
  showRole,
  isAnonymous,
  classId,
}: Args): JudgeAssignmentGateResult {
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId ?? null;
  // A manager ACCOUNT is authorized by the server's role tier regardless of
  // assignment — even if a judge passcode grant overrode its effective role to
  // `judge` — so never gate it. The gate applies to a non-anonymous session
  // whose EFFECTIVE role is `judge` and whose ACCOUNT is not a server manager
  // (catches a signed-in RBAC judge, and a signed-in non-manager holding a judge
  // grant, both of which the server authorizes only via judge_assignments).
  const isManagerAccount = showRole != null && SERVER_MANAGER_ACCOUNT_ROLES.includes(showRole);
  const applicable = !isAnonymous && ringsideRole === 'judge' && !isManagerAccount;

  // The lookup key for the CURRENT inputs; null while inapplicable or identity
  // hasn't resolved. Storing the resolved verdict keyed by this string means a
  // verdict from a previous class (a route change mid-session) no longer matches
  // and naturally reads back as `checking` during render — so the stale verdict
  // is never shown, with no reset-on-change setState in the effect (which the
  // react-hooks/set-state-in-effect lint forbids).
  const lookupKey = applicable && classId && personId ? `${personId}:${classId}` : null;

  const [resolved, setResolved] = useState<{
    key: string;
    value: 'assigned' | 'unassigned';
  } | null>(null);

  useEffect(() => {
    if (!lookupKey || !classId || !personId) return;

    let cancelled = false;
    const matches = (rows: { personId: string; classId: string | null; status: string | null }[]) =>
      rows.some(
        a =>
          a.personId === personId &&
          a.classId === classId &&
          ACTIVE_ASSIGNMENT_STATUSES.includes(a.status ?? '')
      );

    const resolve = async () => {
      // Fast path: an already-assigned judge is confirmed from the local cache
      // with no sync round-trip and never blocks.
      let local;
      try {
        local = await replicatedJudgeAssignmentsTable.getAll();
      } catch {
        if (!cancelled) setResolved({ key: lookupKey, value: 'assigned' });
        return;
      }
      if (cancelled) return;
      if (matches(local)) {
        setResolved({ key: lookupKey, value: 'assigned' });
        return;
      }

      // No local match — the cache may be stale or predate a just-added
      // assignment. Force a fresh sync before denying so a legitimate judge is
      // never blocked by data that simply hasn't replicated yet.
      try {
        const result = await replicatedJudgeAssignmentsTable.sync();
        if (cancelled) return;
        if (!result?.success) {
          setResolved({ key: lookupKey, value: 'assigned' });
          return;
        }
      } catch {
        if (!cancelled) setResolved({ key: lookupKey, value: 'assigned' });
        return;
      }

      let fresh;
      try {
        fresh = await replicatedJudgeAssignmentsTable.getAll();
      } catch {
        if (!cancelled) setResolved({ key: lookupKey, value: 'assigned' });
        return;
      }
      if (cancelled) return;
      // Genuinely empty after a successful sync still fails open — never trap a
      // judge behind missing data; the server RPC is the real boundary.
      if (fresh.length === 0) {
        setResolved({ key: lookupKey, value: 'assigned' });
        return;
      }
      setResolved({ key: lookupKey, value: matches(fresh) ? 'assigned' : 'unassigned' });
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [lookupKey, classId, personId]);

  if (!applicable) return { status: 'not-applicable' };
  if (resolved && resolved.key === lookupKey) return { status: resolved.value };
  return { status: 'checking' };
}
