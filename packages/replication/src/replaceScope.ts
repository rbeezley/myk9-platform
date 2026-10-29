import type { ReplicatedTable } from './core/ReplicatedTable';
import {
  syncReplicatedTable,
  type SyncReplicatedTableOptions,
  type SyncScope,
  type SyncReplicatedTableAdapter,
} from './syncReplicatedTable';
import type { SyncResult } from './types';

/**
 * Replace one scope's cached rows with a full fetch of it (MYK9-1476), for a
 * caller that knows access to the scope changed (a role grant or revocation).
 *
 * Nothing is removed until the download has succeeded: the fetch runs first,
 * every returned row is written over its clean local copy, and only then are
 * rows the server no longer returns removed. So a failed or offline fetch
 * leaves the cached rows in place and reports `success: false`.
 *
 * The contract, all inherited from `syncReplicatedTable`:
 * - rows with unsent local work (dirty rows) are never overwritten or removed;
 * - removal is bound to the account that started the fetch, never to whoever is
 *   signed in by the time it lands;
 * - removal needs a COMPLETE fetch (the server count was covered);
 * - unlike an ordinary full sync, a complete zero-row answer is believed: the
 *   caller states access changed, so the MYK9-880 independent proof
 *   (`verifyScopeEmpty`, which a user who just lost access can never pass) is
 *   not asked for.
 */
export function replaceScope<TRemote, TLocal extends { id: string }>(
  table: ReplicatedTable<TLocal>,
  adapter: SyncReplicatedTableAdapter<TRemote, TLocal>,
  scope: SyncScope,
  options: SyncReplicatedTableOptions = {}
): Promise<SyncResult> {
  return syncReplicatedTable(table, adapter, scope, {
    ...options,
    accessChanged: true,
    forceFullSync: true,
  });
}
