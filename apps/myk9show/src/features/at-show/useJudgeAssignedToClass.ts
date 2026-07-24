import { useEffect, useState } from 'react';
import type { UserRole as RingsideRole } from '@myk9/ringside';
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
  showRole: ShowRole | null | undefined;
  grantRole: RingsideRole | null;
  classId: string | undefined;
}

/**
 * MYK9-82 pre-flight: `ringside_update_entry()` only authorizes scoring for a
 * judge assigned to THIS class (`judge_assignments`, status confirmed|invited).
 * A signed-in judge account with no matching assignment passes the client
 * `canScore` gate (it only checks the role), submits an optimistic score, and
 * only discovers the rejection later at sync — by which point the run is over
 * and the score is gone. This checks the assignment before the scoring engine
 * mounts, so an unassigned judge is redirected to the passcode path instead.
 *
 * Scope: only applies to a pure RBAC judge session with no passcode grant —
 * a passcode grant already overrides RBAC and is authorized server-side via
 * the grant path, and manager roles are authorized as managers, not via
 * assignment. Every other case resolves as `not-applicable` immediately.
 *
 * Fail-open by design: reads replicated data only (offline-safe, no network
 * fallback). If the local `judge_assignments` store is completely empty —
 * sync hasn't landed, or the read fails — this resolves `assigned` rather
 * than blocking. A cold cache must never deny a legitimate judge; the server
 * RPC remains the actual enforcement boundary regardless of this check.
 */
export function useJudgeAssignedToClass({
  showRole,
  grantRole,
  classId,
}: Args): JudgeAssignmentGateResult {
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId ?? null;
  const applicable = !grantRole && showRole === ShowRole.JUDGE;

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
    replicatedJudgeAssignmentsTable
      .getAll()
      .then(all => {
        if (cancelled) return;
        // Cold cache (sync hasn't landed) — fail open, never block a real judge.
        if (all.length === 0) {
          setResolved({ key: lookupKey, value: 'assigned' });
          return;
        }
        const isAssigned = all.some(
          a =>
            a.personId === personId &&
            a.classId === classId &&
            ACTIVE_ASSIGNMENT_STATUSES.includes(a.status ?? '')
        );
        setResolved({ key: lookupKey, value: isAssigned ? 'assigned' : 'unassigned' });
      })
      .catch(() => {
        // Read failure — fail open; the server RPC is the real enforcement boundary.
        if (!cancelled) setResolved({ key: lookupKey, value: 'assigned' });
      });

    return () => {
      cancelled = true;
    };
  }, [lookupKey, classId, personId]);

  if (!applicable) return { status: 'not-applicable' };
  if (resolved && resolved.key === lookupKey) return { status: resolved.value };
  return { status: 'checking' };
}
