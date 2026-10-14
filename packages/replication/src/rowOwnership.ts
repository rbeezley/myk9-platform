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
 * settle the scope stamp (see {@link ScopeStampDirective}). `wroteRows` is read
 * after the fact: does this account STILL own a row it wrote? A row another
 * account has since taken back, or one the bulk write skipped, is not this
 * sync's to answer for. Stops at the first row found, so the usual cost is one
 * read.
 */
export async function scopeStampDirective<T extends { id: string }>(
  table: ReplicatedTable<T>,
  writtenIds: readonly string[],
  syncingAuthUserId: string | null,
  whole: boolean
): Promise<ScopeStampDirective | undefined> {
  if (syncingAuthUserId === null) return undefined;
  let wroteRows = false;
  for (const id of writtenIds) {
    const row = await table.getReplicatedRowIncludingOtherAccounts(id);
    if (row?.ownerAuthUserId === syncingAuthUserId) {
      wroteRows = true;
      break;
    }
  }
  return { syncingAuthUserId, whole, wroteRows };
}
