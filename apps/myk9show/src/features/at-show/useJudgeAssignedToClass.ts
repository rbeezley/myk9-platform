import { useEffect, useState } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole as ShowRole } from '@/types/auth-types';
import { replicatedJudgeAssignmentsTable } from '@/services/replication';

/** Assignment-lifecycle statuses that put a class on the judge's plate — mirrors useJudgeAssignments. */
const ACTIVE_ASSIGNMENT_STATUSES = ['confirmed', 'invited'];

export type JudgeAssignmentGateResult =
  | { status: 'not-applicable' }
  | { status: 'checking' }
  | { status: 'assigned' }
  | { status: 'unassigned' };

interface Args {
  /** Account RBAC role (grant-independent), from useRingsideEffectiveRole. */
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
 * Applies to a **non-anonymous JUDGE account** — the one case whose server
 * authorization depends solely on `judge_assignments`, and the ticket's real
 * target. It keys on the ACCOUNT role (grant-independent), so a signed-in judge
 * holding a client-side passcode grant is still gated (the grant does not
 * establish server authz for an account session). Every other session is
 * `not-applicable` and left to fail open, which is never worse than today:
 *   - anonymous passcode session — server-authorized show-wide by its claim;
 *   - manager accounts (site-admin / secretary / club-admin) — authorized by
 *     the server's role tier (with its own club scoping we don't replicate);
 *   - a non-judge account holding a judge/admin grant — an exotic combination
 *     the server would reject, left to the existing dead-letter path (MYK9-84).
 * Keying on the account role deliberately avoids re-implementing the server's
 * full, club-scoped manager/steward tiers on the client, which is fragile.
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
  showRole,
  isAnonymous,
  classId,
}: Args): JudgeAssignmentGateResult {
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId ?? null;
  const applicable = !isAnonymous && showRole === ShowRole.JUDGE;

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
