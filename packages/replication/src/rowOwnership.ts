import type { ReplicatedTable } from './core/ReplicatedTable';
import type { ScopeStampDirective } from './core/scopeStamp';

/**
 * Is any of these rows, read whoever owns it, still not owned by `authUserId`?
 * A bulk write skips a row the device holds at a newer server version, and a
 * skipped row stays with its old owner. A row that is gone (refused because
 * its delete was confirmed) is not foreign: nobody can read it.
 */
export async function anyRowNotOwnedBy<T extends { id: string }>(
  table: ReplicatedTable<T>,
  ids: readonly string[],
  authUserId: string | null
): Promise<boolean> {
  for (const id of ids) {
    const row = await table.getReplicatedRowIncludingOtherAccounts(id);
    if (row && row.ownerAuthUserId !== authUserId) return true;
  }
  return false;
}

/**
 * The one request every ending of an account-owned sync makes of the cache to
 * settle the scope stamp (see {@link ScopeStampDirective}). It names the rows
 * the sync handed to the bulk write; whether this account still owns any of them
 * is read by the cache INSIDE the metadata transaction (MYK9-1149), so a row
 * another account took back in the meantime is not this sync's to answer for.
 */
export function scopeStampDirective(
  writtenIds: readonly string[],
  syncingAuthUserId: string | null,
  whole: boolean
): ScopeStampDirective | undefined {
  if (syncingAuthUserId === null) return undefined;
  return { syncingAuthUserId, whole, writtenIds };
}
