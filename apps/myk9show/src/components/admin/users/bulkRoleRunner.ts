/**
 * Executes one person's slice of a bulk role plan (bulkRolePlanner.ts) — and
 * nothing else. It revokes exactly the planned assignment rows and grants
 * exactly the planned (role, club) pairs, through the same RBAC service calls
 * the single-person Manage roles dialog uses. It derives nothing: the planner
 * alone decides what changes, so the panel's summary and this runner cannot
 * disagree (Codex convergence restructure).
 *
 * Revoke by row id, never by user + role, so a person who also holds a
 * protected (show-limited / expiring) grant of the same role keeps it.
 * `ensureUserHasRole` returning false ("already active") is a no-op, not an
 * error. Throws on a real failure so the bulk dispatch reports that person.
 */
import { rbacService } from '@/services/rbac/RBACService';
import type { PersonRolePlan } from './bulkRolePlanner';

export async function executePersonPlan(person: PersonRolePlan): Promise<void> {
  for (const assignment of person.remove) {
    await rbacService.revokeUserRole(assignment.id);
  }
  for (const grant of person.add) {
    await rbacService.ensureUserHasRole(
      person.userId,
      grant.role,
      grant.clubId ? { clubId: grant.clubId } : undefined
    );
  }
}
