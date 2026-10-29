/**
 * Entries access pending scopes (MYK9-1476).
 *
 * `view_authenticated_entry_results_replication` masks result and score fields
 * by the caller's active club_admin / secretary / steward roles, but a role
 * grant, revoke, expiry or deactivation moves no `updated_at` the view exposes,
 * and incremental entries sync reads only rows changed since its watermark. So
 * rows cached under the OLD role set stay masked (or unmasked) until the 24 h
 * full sync.
 *
 * On a server-verified role-set change this module persists, per account, the
 * shows whose cached entries may be stale. Nothing is purged. The next sync of a
 * pending show is a `replaceScope` (full fetch, replace after download), and the
 * show is cleared only when that replace completed and began after the mark. A
 * failure or going offline leaves the cached rows in place and the show pending.
 */
import { logger } from '@myk9/core';
import type { UserRoleWithDetails } from '@/types/rbac-types';
import type { ReplicatedEntriesTable } from './ReplicatedEntriesTable';

const PENDING_KEY_PREFIX = 'myk9:entries:access-pending:v1:';

interface PendingRecord {
  signature: string;
  markedAt: number;
  showIds: string[];
  /** Some part of the old role set is missing from the new one (access narrowed). */
  shrank: boolean;
}

export interface EntriesAccessMark {
  authUserId: string;
  markedAt: number;
  shrank: boolean;
}

/** The roles the results view's caller context reads; any other role cannot change a row. */
const VIEW_ROLES = new Set([
  'site_admin',
  'club_admin',
  'secretary',
  'trial_secretary',
  'steward',
  'chairman',
]);

/** Stable, order-insensitive signature of the active role set (role + club + show). */
export function activeRoleSetSignature(roles: UserRoleWithDetails[], now = Date.now()): string {
  const parts = roles
    .filter(role => role.is_active && (!role.expires_at || Date.parse(role.expires_at) > now))
    .filter(role => VIEW_ROLES.has(role.role?.name ?? role.role_id))
    .map(role => `${role.role?.name ?? role.role_id}|${role.club_id ?? ''}|${role.show_id ?? ''}`);
  return JSON.stringify([...new Set(parts)].sort());
}

function readRecord(userId: string): PendingRecord | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PENDING_KEY_PREFIX + userId) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const { signature, markedAt, showIds } = parsed as Partial<PendingRecord>;
    if (typeof signature !== 'string' || typeof markedAt !== 'number' || !Array.isArray(showIds)) {
      return null;
    }
    return {
      signature,
      markedAt,
      showIds: showIds.filter(id => typeof id === 'string'),
      shrank: (parsed as Partial<PendingRecord>).shrank === true,
    };
  } catch {
    return null;
  }
}

function writeRecord(userId: string, record: PendingRecord): void {
  try {
    localStorage.setItem(PENDING_KEY_PREFIX + userId, JSON.stringify(record));
  } catch (error) {
    logger.warn('[entries] Could not persist the pending access scopes', error);
  }
}

/** True when any account has a show pending. Synchronous, so the common case adds no await. */
export function hasEntriesAccessPending(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key?.startsWith(PENDING_KEY_PREFIX) &&
        readRecord(key.slice(PENDING_KEY_PREFIX.length))?.showIds.length
      )
        return true;
    }
  } catch {
    // An unreadable store reads as nothing pending.
  }
  return false;
}

/**
 * When the signed-in account's access to this show was marked changed, else
 * null. Never throws: an unreadable store reads as "nothing pending".
 */
export async function entriesAccessMark(
  table: ReplicatedEntriesTable,
  showId: string
): Promise<EntriesAccessMark | null> {
  try {
    const authUserId = await table.getCurrentAuthUserId();
    const record = authUserId ? readRecord(authUserId) : null;
    return authUserId && record?.showIds.includes(showId)
      ? { authUserId, markedAt: record.markedAt, shrank: record.shrank }
      : null;
  } catch {
    return null;
  }
}

/**
 * Clears one pending show after a completed replace. Only the run that read the
 * CURRENT mark at its start may clear it: that run's fetch began after the new
 * roles were verified. A run that saw an older mark (or none) was fetched under
 * older roles, so it leaves the show pending. Marks are strictly increasing, so
 * two never compare equal.
 */
export function clearEntriesAccessPending(
  authUserId: string,
  showId: string,
  markedAtSeen: number
): void {
  const record = readRecord(authUserId);
  if (!record || record.markedAt !== markedAtSeen || !record.showIds.includes(showId)) return;
  writeRecord(authUserId, { ...record, showIds: record.showIds.filter(id => id !== showId) });
}

/** True when some part of the old signature is absent from the new one. */
function signatureShrank(oldSignature: string, newSignature: string): boolean {
  try {
    const next = new Set(JSON.parse(newSignature) as string[]);
    return (JSON.parse(oldSignature) as string[]).some(part => !next.has(part));
  } catch {
    return true;
  }
}

/**
 * Lifecycle entry point. Pass only server-verified roles (never a cache or warm
 * seed). Marks every held and in-flight show on a changed role set (a missing
 * stored signature, the first load after deploy, counts as changed), then starts
 * a sync of each. Never throws.
 */
export async function noteEntriesAccessRoles(
  authUserId: string,
  roles: UserRoleWithDetails[],
  tableOverride?: ReplicatedEntriesTable
): Promise<void> {
  try {
    // Every focus refresh lands here: touch nothing when the set is unchanged.
    const signature = activeRoleSetSignature(roles);
    const stored = readRecord(authUserId);
    if (stored?.signature === signature) return;

    const table =
      tableOverride ?? (await import('./ReplicatedEntriesTable')).replicatedEntriesTable;
    if ((await table.getCurrentAuthUserId()) !== authUserId) return;
    // Held rows, plus shows mid-sync whose rows are not written yet (and whose
    // fetch may have been read under the old roles). getAll() answers [] on a
    // failed read, which would mark nothing.
    const showIds = new Set([...(stored?.showIds ?? []), ...table.runningShowIds()]);
    for (const row of await table.getAllOrThrow()) if (row.showId) showIds.add(row.showId);

    // Strictly increasing, so a re-mark in the same millisecond is still a new mark.
    const markedAt = Math.max(Date.now(), (stored?.markedAt ?? 0) + 1);
    // No stored signature (first load after deploy) cannot be known to narrow;
    // an earlier still-pending shrink stays a shrink.
    const shrank =
      (stored ? signatureShrank(stored.signature, signature) : false) ||
      (stored !== null && stored.showIds.length > 0 && stored.shrank);
    writeRecord(authUserId, { signature, markedAt, showIds: [...showIds], shrank });
    const results = await Promise.allSettled([...showIds].map(id => table.sync(id)));
    if (results.some(result => result.status === 'rejected' || !result.value.success)) {
      logger.warn('[entries] Access refetch did not complete; it stays pending');
    }
  } catch (error) {
    logger.warn('[entries] Could not mark entries for the changed role set', error);
  }
}
