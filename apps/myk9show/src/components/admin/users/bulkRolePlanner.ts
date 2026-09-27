/**
 * The ONE place that decides what a bulk role edit will do (Codex convergence
 * restructure). For the selected people, their current role assignments and
 * the admin's Add / Remove choices, it returns the exact per-person plan: which
 * assignment rows will be revoked and which (role, club) grants will be added.
 *
 * The panel's "What will happen" renders only this plan, and the runner
 * (bulkRoleRunner.executePersonPlan) executes only this plan — neither derives
 * anything itself, so they cannot drift.
 *
 * Rules, carried over from the runner they replace:
 * - A grant limited to one show or with an end date is never revoked; it is
 *   reported as left unchanged.
 * - A club-scoped role (Secretary, Club Admin) is removed only for the chosen
 *   clubs, and added once per chosen club.
 * - An add is skipped where `ensureUserHasRole` would find the grant already
 *   active: same role, same club (or none), not show-limited.
 * - The current admin's OWN roles are never removed by a bulk edit — they can
 *   still be added to (that is not "stripping"). MYK9-820.
 * Canonical role-name validation stays in useBulkActions, before any write.
 */

import { supabase } from '@/services/database/supabaseClient';
import { CLUB_SCOPED_ROLES } from '@/services/rbac/roleUiConstants';

export interface RoleAssignment {
  id: string;
  userId: string;
  role: string;
  clubId: string | null;
  showId: string | null;
  expiresAt: string | null;
}

export interface PlannedAdd {
  role: string;
  clubId: string | null;
}

export interface PersonRolePlan {
  userId: string;
  remove: RoleAssignment[];
  add: PlannedAdd[];
}

export interface BulkRolePlan {
  /** Only people the plan changes. */
  people: PersonRolePlan[];
  /** Grants a removal matched but deliberately leaves alone. */
  leftUnchanged: RoleAssignment[];
}

export function isProtectedAssignment(assignment: RoleAssignment): boolean {
  return assignment.showId !== null || assignment.expiresAt !== null;
}

// PostgREST caps a response at 1,000 rows; page below it and never assume a
// short read means "everything". User ids are batched to keep the URL short.
export const ASSIGNMENT_PAGE_SIZE = 1000;
const USER_ID_BATCH = 100;

type AssignmentRow = {
  id: string;
  user_id: string;
  club_id: string | null;
  show_id: string | null;
  expires_at: string | null;
  roles: { name: string } | null;
};

/**
 * Every active role assignment of `userIds`, across as many pages as it takes.
 * Throws on any read failure: a partial plan must never be shown or run.
 */
export async function fetchActiveAssignments(userIds: string[]): Promise<RoleAssignment[]> {
  const all: RoleAssignment[] = [];
  for (let i = 0; i < userIds.length; i += USER_ID_BATCH) {
    const batch = userIds.slice(i, i + USER_ID_BATCH);
    for (let from = 0; ; from += ASSIGNMENT_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id, club_id, show_id, expires_at, roles(name)')
        .in('user_id', batch)
        .eq('is_active', true)
        .order('id')
        .range(from, from + ASSIGNMENT_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as AssignmentRow[];
      for (const row of rows) {
        all.push({
          id: row.id,
          userId: row.user_id,
          role: row.roles?.name ?? '',
          clubId: row.club_id ?? null,
          showId: row.show_id ?? null,
          expiresAt: row.expires_at ?? null,
        });
      }
      if (rows.length < ASSIGNMENT_PAGE_SIZE) break;
    }
  }
  return all;
}

export interface PlanInput {
  userIds: string[];
  assignments: RoleAssignment[];
  add: string[];
  remove: string[];
  clubIds: string[];
  /** The signed-in admin's own person id — their roles are never removed. */
  currentUserId?: string | null | undefined;
}

export function planBulkRoleEdit({
  userIds,
  assignments,
  add,
  remove,
  clubIds,
  currentUserId,
}: PlanInput): BulkRolePlan {
  const byUser = new Map<string, RoleAssignment[]>();
  for (const assignment of assignments) {
    const list = byUser.get(assignment.userId) ?? [];
    list.push(assignment);
    byUser.set(assignment.userId, list);
  }

  const people: PersonRolePlan[] = [];
  const leftUnchanged: RoleAssignment[] = [];

  for (const userId of userIds) {
    const held = byUser.get(userId) ?? [];
    const isCurrentAdmin = !!currentUserId && userId === currentUserId;
    const personRemove: RoleAssignment[] = [];
    for (const assignment of held) {
      if (!remove.includes(assignment.role)) continue;
      if (CLUB_SCOPED_ROLES.has(assignment.role)) {
        if (!assignment.clubId || !clubIds.includes(assignment.clubId)) continue;
      }
      if (isProtectedAssignment(assignment)) {
        leftUnchanged.push(assignment);
        continue;
      }
      // The current admin can never strip their own roles via a bulk edit —
      // even one they explicitly chose to remove for everyone. Their grant is
      // simply left alone; it does not appear in `leftUnchanged` (that list is
      // for grants a removal matched but a SCOPE rule protects, which the panel
      // explains with "limited to one show or with an end date" — a different
      // reason).
      if (isCurrentAdmin) continue;
      personRemove.push(assignment);
    }

    const personAdd: PlannedAdd[] = [];
    for (const role of add) {
      const scopes = CLUB_SCOPED_ROLES.has(role) ? clubIds : [null];
      for (const clubId of scopes) {
        const alreadyActive = held.some(
          a => a.role === role && a.clubId === clubId && a.showId === null
        );
        if (!alreadyActive) personAdd.push({ role, clubId });
      }
    }

    if (personRemove.length > 0 || personAdd.length > 0) {
      people.push({ userId, remove: personRemove, add: personAdd });
    }
  }

  return { people, leftUnchanged };
}

/** Every (person, assignment id) the plan revokes — what the summary promises. */
export function plannedRemovals(plan: BulkRolePlan): Set<string> {
  return new Set(plan.people.flatMap(p => p.remove.map(a => `${p.userId}:${a.id}`)));
}

/** A canonical, order-independent fingerprint of what a plan will WRITE. */
function planSignature(plan: BulkRolePlan): string {
  return plan.people
    .map(
      p =>
        `${p.userId}:${[...p.remove.map(a => a.id)].sort().join(',')}` +
        `:${[...p.add.map(a => `${a.role}@${a.clubId ?? ''}`)].sort().join(',')}`
    )
    .sort()
    .join('|');
}

/**
 * Whether two plans would write the exact same thing. Used to detect that the
 * roster moved between showing a plan and running it (MYK9-820, round-3 finding
 * #1: `bulk-role-assignments`'s 5-minute staleTime let a reselect submit
 * assignment ids already revoked) — a mismatch means Apply must re-show the
 * fresh plan for review instead of running the one the admin already read.
 */
export function plansEqual(a: BulkRolePlan, b: BulkRolePlan): boolean {
  return planSignature(a) === planSignature(b);
}
