/**
 * Classify `permission_audit_log.action` codes into summary families.
 *
 * The audit summary used to bucket rows with `action.includes('role')`, which
 * silently miscounted every action code that does not spell the word "role" —
 * a ledger of 8 `club_secretary_granted` / `club_secretary_revoked` rows
 * summarised as "8 changes • 0 role changes" (MYK9-396). Substring matching
 * cannot be right here: the emitted codes are a small, known, hand-written set
 * spread across SQL RPCs and the app-side `ActionType` enum, and nothing about
 * the string shape tells you which family a code belongs to.
 *
 * The emitted contract, established from the writers rather than guessed:
 *  - `ActionType` (src/types/rbac-types.ts:229) — every code AuditLogger writes.
 *  - SQL RPCs writing `permission_audit_log` directly:
 *      `club_secretary_granted`   (20260524120000, 20260730053500,
 *                                  20260802120000, 20260830210000)
 *      `club_secretary_revoked`   (20260524120000, 20260524122000,
 *                                  20260830230000)
 *      `club_access_request_approved` / `club_access_request_denied`
 *                                 (20260524120000)
 *  - `seed_data_created` (apps/myk9show/supabase/migrations/002_rbac_seed_data.sql)
 *
 * Families:
 *  - 'role'       — the event created, removed, reactivated, or altered a ROLE
 *                   ASSIGNMENT or a role definition. Club-secretary
 *                   appointments qualify (they write `user_roles`), and so does
 *                   `club_access_request_approved`, which inserts or
 *                   reactivates a `club_admin` assignment before logging.
 *  - 'permission' — the event created, removed, or altered a PERMISSION or a
 *                   per-user permission override.
 *  - 'other'      — everything else (request denials, seed bookkeeping) AND the
 *                   fallback for any code not listed here. Unknown codes are
 *                   deliberately parked in 'other' rather than pattern-matched:
 *                   they still appear in the total and in the table, so a new
 *                   action shows up as an uncategorised change instead of being
 *                   quietly counted as something it may not be.
 */

export type AuditActionFamily = 'role' | 'permission' | 'other';

/**
 * Whether an event handed access OUT, took it BACK, or did neither. Same
 * explicit-mapping discipline as the family: the row icon and badge are keyed
 * off the stored code, so an invented code renders as neutral rather than
 * borrowing a colour it has not earned.
 */
export type AuditActionTone = 'grant' | 'revoke' | 'neutral';

const ACTION_FAMILIES: Readonly<Record<string, AuditActionFamily>> = {
  // Role assignments (app-side, via ActionType)
  role_assigned: 'role',
  role_revoked: 'role',
  // Role definitions
  role_created: 'role',
  role_updated: 'role',
  role_deleted: 'role',
  // Role assignments (database RPCs)
  club_secretary_granted: 'role',
  club_secretary_revoked: 'role',
  club_access_request_approved: 'role',

  // Permissions and overrides
  permission_granted: 'permission',
  permission_revoked: 'permission',
  permission_created: 'permission',
  permission_updated: 'permission',
  permission_deleted: 'permission',
  permission_override_created: 'permission',
  permission_override_removed: 'permission',

  // Neither: no role or permission changed hands
  club_access_request_denied: 'other',
  seed_data_created: 'other',
};

const ACTION_TONES: Readonly<Record<string, AuditActionTone>> = {
  role_assigned: 'grant',
  role_created: 'grant',
  permission_granted: 'grant',
  permission_created: 'grant',
  permission_override_created: 'grant',
  club_secretary_granted: 'grant',
  club_access_request_approved: 'grant',

  role_revoked: 'revoke',
  role_deleted: 'revoke',
  permission_revoked: 'revoke',
  permission_deleted: 'revoke',
  permission_override_removed: 'revoke',
  club_secretary_revoked: 'revoke',
  club_access_request_denied: 'revoke',

  role_updated: 'neutral',
  permission_updated: 'neutral',
  seed_data_created: 'neutral',
};

/** Direction of one stored action code; unknown codes read as 'neutral'. */
export function getAuditActionTone(action: string | null | undefined): AuditActionTone {
  if (!action) return 'neutral';
  return ACTION_TONES[action] ?? 'neutral';
}

/** Family for one stored action code; unknown codes fall back to 'other'. */
export function classifyAuditAction(action: string | null | undefined): AuditActionFamily {
  if (!action) return 'other';
  return ACTION_FAMILIES[action] ?? 'other';
}

export interface AuditSummary {
  total: number;
  roleChanges: number;
  permissionChanges: number;
  otherChanges: number;
}

/**
 * Summarise the rows the table is actually showing. Callers must pass the
 * FILTERED list, so the headline never contradicts the visible rows.
 */
export function summarizeAuditActions(logs: ReadonlyArray<{ action: string }>): AuditSummary {
  let roleChanges = 0;
  let permissionChanges = 0;
  let otherChanges = 0;

  for (const log of logs) {
    const family = classifyAuditAction(log.action);
    if (family === 'role') roleChanges += 1;
    else if (family === 'permission') permissionChanges += 1;
    else otherChanges += 1;
  }

  return { total: logs.length, roleChanges, permissionChanges, otherChanges };
}
