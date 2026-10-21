/**
 * Has THIS account finished a whole download of a replicated scope? (MYK9-1133)
 *
 * Rows are kept per account: a reader of an account-owned table sees only its
 * own rows, so another account's cache can never leak. What that cannot say is
 * whether the rows an account sees are the WHOLE scope, and a half-loaded scope
 * reads as an empty list or a zero capacity. The sync stamps a scope (or, for an
 * unscoped sync, the table) with the auth user that completed a whole download
 * (`SyncMetadata.syncedByAuthUserId`); the reads below ask for it:
 *
 * - `owned`: the signed-in account's own whole download.
 * - `never-synced`: no sync has completed. Any rows are this device's own local
 *   writes (cold inserts), the MYK9-746 cold path, unchanged.
 * - `foreign`: a sync completed but not as the current account: another
 *   account's stamp, no stamp (a cache from before ownership), or the current
 *   account cannot be settled. Unresolved is its own state: it never matches and
 *   never reads as "no rows".
 * - `unreadable`: the metadata read failed or timed out. Not "never synced":
 *   nothing may be assumed, so every guard treats it like `foreign`.
 */
import type { SyncMetadata } from '@myk9/replication';

/** The table methods the check needs, so a test can hand it a real table. */
export interface StampedScopeTable {
  getSyncMetadata(scopeValue?: string): Promise<SyncMetadata | null>;
  /** Throws on a failed read; preferred when present. */
  getSyncMetadataOrThrow?(scopeValue?: string): Promise<SyncMetadata | null>;
  getCurrentAuthUserId(): Promise<string | null>;
}

export type ScopeOwnership = 'owned' | 'never-synced' | 'foreign' | 'unreadable';

/** A replica read refused because the scope is not this account's whole download. */
export class ForeignReplicaScopeError extends Error {
  constructor(scopeId: string) {
    super(`The device copy of ${scopeId} was saved by a different account.`);
    this.name = 'ForeignReplicaScopeError';
  }
}

async function readMetadata(
  table: StampedScopeTable,
  scopeValue?: string
): Promise<SyncMetadata | null> {
  return table.getSyncMetadataOrThrow
    ? table.getSyncMetadataOrThrow(scopeValue)
    : table.getSyncMetadata(scopeValue);
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
  scopeId: string
): Promise<ScopeOwnership> {
  try {
    return (await ownershipOf(await readMetadata(table, scopeId), table)) ?? 'never-synced';
  } catch {
    return 'unreadable';
  }
}

/** Ownership of a table synced WITHOUT a scope (waitlist entries): its table-level stamp. */
export async function getTableOwnership(table: StampedScopeTable): Promise<ScopeOwnership> {
  try {
    return (await ownershipOf(await readMetadata(table), table)) ?? 'never-synced';
  } catch {
    return 'unreadable';
  }
}

const withheld = (ownership: ScopeOwnership) =>
  ownership === 'foreign' || ownership === 'unreadable';

/**
 * For a read that answers from the replica: refuse a scope that is not this
 * account's whole download. Inside `withReplicationFallback` the throw sends the
 * read to PostgREST (RLS answers online) and returns an error offline: never an
 * empty list or a zero.
 */
export async function assertScopeNotForeign(
  table: StampedScopeTable,
  scopeId: string
): Promise<void> {
  if (withheld(await getScopeOwnership(table, scopeId))) {
    throw new ForeignReplicaScopeError(scopeId);
  }
}

/** {@link assertScopeNotForeign} for an unscoped table. */
export async function assertTableNotForeign(
  table: StampedScopeTable,
  label: string
): Promise<void> {
  if (withheld(await getTableOwnership(table))) throw new ForeignReplicaScopeError(label);
}
