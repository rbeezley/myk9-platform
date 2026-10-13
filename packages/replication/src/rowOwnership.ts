import type { ReplicatedTable } from './core/ReplicatedTable';

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
 * What a finishing sync writes to the scope stamp: its own account after a whole
 * download. A sync that falls short leaves this account's own earlier stamp alone
 * (its rows are still its own) but clears any other: it may have re-owned some of
 * the rows that stamp vouched for. `stored` is the stamp as it is NOW.
 */
export function scopeStampFor(
  whole: boolean,
  syncingAuthUserId: string | null,
  stored: string | undefined
): string | null | undefined {
  if (whole) return syncingAuthUserId;
  return stored === syncingAuthUserId ? undefined : null;
}
