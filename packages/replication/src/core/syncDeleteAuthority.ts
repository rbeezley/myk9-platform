/**
 * What a table's sync-path delete asks before it touches storage (MYK9-1624).
 *
 * A sync that was cancelled (offline, unmount) must not delete cached rows from
 * a response that arrives after the fact. The table's delete sinks take one of
 * these and check `aborted` immediately before opening each IndexedDB
 * transaction, so the guard sits at the storage boundary, not at each caller.
 * `SyncCacheWriter` is the sync's implementation; user-initiated deletes pass
 * nothing and are never blocked by a pass.
 */
export interface SyncDeleteAuthority {
  readonly aborted: boolean;
}
