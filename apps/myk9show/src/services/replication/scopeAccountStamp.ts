/**
 * Whose rows does a replicated scope hold? (MYK9-1133)
 *
 * Sign-out keeps the IndexedDB replicas on purpose (MYK9-202), so on a shared
 * browser account B opens a replica account A synced. The sync stamps a scope
 * (or, for an unscoped sync, the table) with the auth user that synced it
 * (`SyncMetadata.syncedByAuthUserId`). Reads ask this module whether the rows
 * they are about to return are the signed-in account's:
 *
 * - `owned`: the scope completed a sync stamped with the current account.
 * - `never-synced`: no sync has completed here. Whatever rows exist are this
 *   device's own local writes (cold inserts); that is the pre-existing
 *   MYK9-746 cold path, unchanged.
 * - `foreign`: a sync completed but not as the current account: another
 *   account's stamp, no stamp at all (a cache from before the stamp existed),
 *   or the current account cannot be settled (no session, or an expired one
 *   that cannot refresh offline). Unresolved is its own state: it never matches
 *   and never reads as "no rows".
 */
import type { SyncMetadata } from '@myk9/replication';

/** The two table methods the check needs, so a test can hand it a real table. */
export interface StampedScopeTable {
  getSyncMetadata(scopeValue?: string): Promise<SyncMetadata | null>;
  getCurrentAuthUserId(): Promise<string | null>;
}

export type ScopeOwnership = 'owned' | 'never-synced' | 'foreign';

export interface ScopeOwnershipOptions {
  /**
   * Also consult the table-level stamp when the scope itself never synced: for
   * a table the provider syncs both per show and without a scope (armbands),
   * an unscoped sync by another account covers every show.
   */
  includeTableStamp?: boolean;
}

/** A replica read refused because the scope holds another account's rows. */
export class ForeignReplicaScopeError extends Error {
  constructor(scopeId: string) {
    super(`The device copy of ${scopeId} was saved by a different account.`);
    this.name = 'ForeignReplicaScopeError';
  }
}

async function ownershipOf(
  metadata: SyncMetadata | null,
  table: StampedScopeTable
): Promise<ScopeOwnership | null> {
  if (metadata?.totalRows === undefined) return null;
  const current = await table.getCurrentAuthUserId();
  return current !== null && metadata.syncedByAuthUserId === current ? 'owned' : 'foreign';
}

export async function getScopeOwnership(
  table: StampedScopeTable,
  scopeId: string,
  options: ScopeOwnershipOptions = {}
): Promise<ScopeOwnership> {
  const scoped = await ownershipOf(await table.getSyncMetadata(scopeId), table);
  if (scoped) return scoped;
  if (options.includeTableStamp) {
    const tableLevel = await ownershipOf(await table.getSyncMetadata(), table);
    if (tableLevel) return tableLevel;
  }
  return 'never-synced';
}

/**
 * For a read that answers from the replica: refuse a foreign scope. Inside
 * `withReplicationFallback` the throw sends the read to PostgREST, which
 * answers as RLS does for this account online and fails (an error, never an
 * empty list) offline.
 */
export async function assertScopeNotForeign(
  table: StampedScopeTable,
  scopeId: string,
  options: ScopeOwnershipOptions = {}
): Promise<void> {
  if ((await getScopeOwnership(table, scopeId, options)) === 'foreign') {
    throw new ForeignReplicaScopeError(scopeId);
  }
}

/**
 * Ownership of a table synced WITHOUT a scope (waitlist entries): the
 * table-level stamp an unscoped sync writes. A table never synced is
 * `never-synced`.
 */
export async function getTableOwnership(table: StampedScopeTable): Promise<ScopeOwnership> {
  return (await ownershipOf(await table.getSyncMetadata(), table)) ?? 'never-synced';
}

/** {@link assertScopeNotForeign} for an unscoped table. */
export async function assertTableNotForeign(
  table: StampedScopeTable,
  label: string
): Promise<void> {
  if ((await getTableOwnership(table)) === 'foreign') throw new ForeignReplicaScopeError(label);
}
