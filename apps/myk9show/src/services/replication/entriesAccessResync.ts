/**
 * Entries access resync (MYK9-1476).
 *
 * `view_authenticated_entry_results_replication` masks result and score fields
 * by the caller's active club_admin / secretary / steward roles, but a role
 * grant, revoke, expiry or deactivation moves no `updated_at` the view exposes,
 * and incremental entries sync reads only rows changed since its watermark. So
 * when the signed-in user's active role set changes, every show held in the
 * entries replica needs one FULL sync to re-read rows under the new mask.
 *
 * The "needs full sync" mark is persisted per show (a reload before the sync
 * does not lose it). It is cleared by ReplicatedEntriesTable only after that
 * show's full sync returned `success: true`, and only if the mark was not
 * replaced meanwhile (each mark carries a token).
 */
import { logger } from '@myk9/core';
import type { UserRoleWithDetails } from '@/types/rbac-types';

const MARKS_KEY = 'myk9:entries:access-resync:v1';
const SIGNATURE_KEY_PREFIX = 'myk9:entries:access-signature:v1:';

function readMarks(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const parsed: unknown = JSON.parse(localStorage.getItem(MARKS_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMarks(marks: Record<string, string>): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    if (Object.keys(marks).length === 0) localStorage.removeItem(MARKS_KEY);
    else localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
    return true;
  } catch {
    return false;
  }
}

/** The mark's token for this show, or null when its next sync need not be full. */
export function getEntriesAccessResyncMark(showId: string): string | null {
  return readMarks()[showId] ?? null;
}

/** Clear the mark only if it is still the one the finished sync started under. */
export function clearEntriesAccessResyncMark(showId: string, token: string): void {
  const marks = readMarks();
  if (marks[showId] !== token) return;
  delete marks[showId];
  writeMarks(marks);
}

/** Stable, order-insensitive signature of the active role set (role + club + show). */
export function activeRoleSetSignature(roles: UserRoleWithDetails[], now = Date.now()): string {
  const parts = roles
    .filter(role => role.is_active && (!role.expires_at || Date.parse(role.expires_at) > now))
    .map(role => `${role.role?.name ?? role.role_id}|${role.club_id ?? ''}|${role.show_id ?? ''}`);
  return JSON.stringify([...new Set(parts)].sort());
}

/**
 * Compare a SUCCESSFULLY loaded role set with the last one recorded for this
 * user. On a change (or no record yet) mark every given show, then record the
 * signature. A storage failure records nothing, so the next load retries.
 * Callers must pass only server-verified roles (never a cache or warm seed).
 */
export function recordEntriesAccessRoleSet(
  userId: string,
  roles: UserRoleWithDetails[],
  showIds: readonly string[]
): boolean {
  const signature = activeRoleSetSignature(roles);
  const key = `${SIGNATURE_KEY_PREFIX}${userId}`;
  try {
    if (typeof localStorage === 'undefined') return false;
    if (localStorage.getItem(key) === signature) return false;
    const marks = readMarks();
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    for (const showId of showIds) marks[showId] = token;
    if (showIds.length > 0 && !writeMarks(marks)) return false;
    localStorage.setItem(key, signature);
    return true;
  } catch {
    return false;
  }
}

/** Lifecycle entry point: list the shows in the entries replica, then record. Never throws. */
export async function noteEntriesAccessRoles(
  userId: string,
  roles: UserRoleWithDetails[]
): Promise<void> {
  try {
    // Every focus refresh lands here: read the replica only when the set changed.
    if (
      localStorage.getItem(`${SIGNATURE_KEY_PREFIX}${userId}`) === activeRoleSetSignature(roles)
    ) {
      return;
    }
    const { replicatedEntriesTable } = await import('./ReplicatedEntriesTable');
    // getAll() answers [] on a failed read; that would record the new set with no marks.
    const rows = await replicatedEntriesTable.getAllOrThrow();
    const showIds = new Set<string>();
    for (const row of rows) if (row.showId) showIds.add(row.showId);
    recordEntriesAccessRoleSet(userId, roles, [...showIds]);
  } catch (error) {
    logger.warn('[entries] Could not record role set for access resync', error);
  }
}
