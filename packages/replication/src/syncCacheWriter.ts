import type { ReplicatedTable } from './core/ReplicatedTable';
import type { SyncDeleteAuthority } from './core/syncDeleteAuthority';
import type { DeleteRowsIfCleanResult } from './core/deleteRowsIfClean';

/**
 * The one door every SYNC-PATH delete goes through (MYK9-1624).
 *
 * `syncReplicatedTable` creates one per sync, bound to the sync's signal, and
 * hands it to every adapter hook (`fetchRemoteRows`, `afterSuccessfulSync`) and
 * to stale cleanup. Each method refuses (deletes nothing, reports nothing
 * removed) once the signal has aborted, and the table sinks it calls re-check
 * immediately before opening their IndexedDB transaction, so a response that
 * arrives after a cancel can never delete cached show-day data.
 *
 * Out of scope on purpose: user-initiated deletes (mutations, discard/revert,
 * quota eviction) are not sync-path and must never wait on a pass's signal.
 */
export class SyncCacheWriter<
  T extends { id: string } = { id: string },
> implements SyncDeleteAuthority {
  constructor(
    private readonly table: ReplicatedTable<T>,
    readonly signal?: AbortSignal
  ) {}

  get aborted(): boolean {
    return this.signal?.aborted === true;
  }

  /** Rows the server no longer has (see `ReplicatedTable.removeStaleEntries`). */
  removeStale(
    serverIds: Set<string>,
    options: { syncedBefore?: number; ownerAuthUserId?: string } = {}
  ): Promise<number> {
    return this.table.removeStaleEntries(serverIds, { ...options, by: this });
  }

  /** Delete the clean rows among `ids`; nothing, all reported kept, once aborted. */
  deleteIfClean(
    ids: Iterable<string>,
    remoteVersions?: ReadonlyMap<string, number>
  ): Promise<DeleteRowsIfCleanResult> {
    return this.table.deleteRowsIfClean(ids, remoteVersions, this);
  }

  batchDelete(ids: string[]): Promise<void> {
    return this.table.batchDelete(ids, this);
  }

  delete(id: string): Promise<void> {
    return this.table.delete(id, this);
  }

  clear(): Promise<void> {
    return this.table.clearCache(this);
  }

  /**
   * For a table-specific delete that opens its own transaction (the registrations
   * prune): runs `op` unless aborted, else answers `refused`. Call it again
   * before each further transaction.
   */
  async guarded<R>(refused: R, op: () => Promise<R>): Promise<R> {
    if (this.aborted) return refused;
    return op();
  }
}
