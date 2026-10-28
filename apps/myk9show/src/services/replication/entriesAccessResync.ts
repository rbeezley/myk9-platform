/**
 * Entries access resync (MYK9-1476).
 *
 * `view_authenticated_entry_results_replication` masks result and score fields
 * by the caller's active club_admin / secretary / steward roles, but a role
 * grant, revoke, expiry or deactivation moves no `updated_at` the view exposes,
 * and incremental entries sync reads only rows changed since its watermark. So
 * rows cached under the OLD role set stay masked (or unmasked) until the 24 h
 * full sync.
 *
 * On a server-verified role-set change this purges each held show's clean
 * cached rows LOCALLY (the engine's own stale-row eviction, `removeStaleEntries`;
 * never a server DELETE) and starts a forced full sync. A purged or partial
 * replica already forces the next sync full, so a failed sync needs no mark. A
 * row with unsent local work is kept. The new signature is recorded only after
 * every purge succeeded, so a failure retries on the next verified load.
 */
import { logger } from '@myk9/core';
import type { UserRoleWithDetails } from '@/types/rbac-types';
import type { ReplicatedEntriesTable } from './ReplicatedEntriesTable';

const SIGNATURE_KEY_PREFIX = 'myk9:entries:access-signature:v1:';

/** Stable, order-insensitive signature of the active role set (role + club + show). */
export function activeRoleSetSignature(roles: UserRoleWithDetails[], now = Date.now()): string {
  const parts = roles
    .filter(role => role.is_active && (!role.expires_at || Date.parse(role.expires_at) > now))
    .map(role => `${role.role?.name ?? role.role_id}|${role.club_id ?? ''}|${role.show_id ?? ''}`);
  return JSON.stringify([...new Set(parts)].sort());
}

/**
 * Evict one show's clean cached rows. Waits for a running sync of the show
 * first, so a fetch begun under the old roles cannot write after the purge.
 * `removeStaleEntries` keeps every id in `keep`, skips dirty rows itself, and
 * notifies subscribers; rows with other unsent work are added to `keep` here.
 */
async function purgeShowRows(table: ReplicatedEntriesTable, showId: string): Promise<void> {
  for (let running = table.whenShowSyncSettles(showId); running;) {
    await running;
    running = table.whenShowSyncSettles(showId);
  }
  // A row another sync writes after this read is not in `keep`; the engine's own
  // cutoff never evicts a row synced after it (MYK9-775).
  const syncedBefore = Date.now();
  const rows = await table.getAllOrThrow();
  const keep = new Set<string>();
  for (const row of rows) {
    if (row.showId !== showId || (await table.hasUnsyncedLocalWork(row.id))) keep.add(row.id);
  }
  await table.removeStaleEntries(keep, { syncedBefore });
}

/**
 * Lifecycle entry point. Pass only server-verified roles (never a cache or warm
 * seed). Never throws.
 */
export async function noteEntriesAccessRoles(
  userId: string,
  roles: UserRoleWithDetails[],
  tableOverride?: ReplicatedEntriesTable
): Promise<void> {
  try {
    // Every focus refresh lands here: touch nothing when the set is unchanged.
    const key = `${SIGNATURE_KEY_PREFIX}${userId}`;
    const signature = activeRoleSetSignature(roles);
    if (localStorage.getItem(key) === signature) return;

    const table =
      tableOverride ?? (await import('./ReplicatedEntriesTable')).replicatedEntriesTable;
    // getAll() answers [] on a failed read; that would record the set having purged nothing.
    const showIds = new Set<string>();
    for (const row of await table.getAllOrThrow()) if (row.showId) showIds.add(row.showId);

    for (const showId of showIds) {
      await purgeShowRows(table, showId);
      table.sync(showId, { forceFullSync: true }).catch(error => {
        logger.warn('[entries] Access resync could not complete', error);
      });
    }
    localStorage.setItem(key, signature);
  } catch (error) {
    logger.warn('[entries] Could not purge entries for the changed role set', error);
  }
}
