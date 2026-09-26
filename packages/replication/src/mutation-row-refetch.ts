import type { Logger } from './dependencies';

/** Re-fetch rows by id and run them through dirty-row reconciliation. */
export type RowRefetcher = (rowIds: string[]) => Promise<unknown>;

/** Runs work under the `replication-upload` lock (MutationUploadRunner.runExclusive). */
export type RunExclusive = <R>(work: () => Promise<R>) => Promise<R>;

/**
 * Tables that can fetch ONE row, keyed by table name (MYK9-771).
 *
 * A queued full-row UPDATE can hold an OCC token older than both its row's and
 * the server's. The OCC handler advances only the row's token, and an
 * incremental sync never re-downloads a row it already holds at the server's
 * version, so without a way to fetch that exact row the write retried
 * `version=eq.<stale>` forever. On each such rejection the upload runner asks
 * here for a re-fetch; the table reconciles the fresh row, which either rebases
 * the write or surfaces a same-field conflict.
 *
 * The whole re-fetch (fetch, detect, mark or reconcile) runs under the upload
 * lock, so no upload or OCC rejection can interleave with it. A request made
 * from inside an upload only QUEUES: the work takes the lock after that upload
 * releases it. Waiting for the lock inline would deadlock.
 *
 * There is no bookkeeping to lose: a failed fetch is logged and dropped, the
 * write stays queued, and its next rejection asks again.
 */
export class RowRefetchRegistry {
  private readonly refetchers = new Map<string, RowRefetcher>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly logger: Logger,
    private readonly runExclusive: RunExclusive
  ) {}

  /** @returns an unregister function that removes only this refetcher. */
  register(tableName: string, refetch: RowRefetcher): () => void {
    this.refetchers.set(tableName, refetch);
    return () => {
      if (this.refetchers.get(tableName) === refetch) this.refetchers.delete(tableName);
    };
  }

  /**
   * Queue a re-fetch of one row; never awaits the lock itself, never rejects.
   * A request for a row whose re-fetch is still queued or running joins it.
   * Returns undefined when the table registered no refetcher (current
   * behavior: the write keeps backing off).
   */
  request(tableName: string, rowId: string): Promise<void> | undefined {
    const refetch = this.refetchers.get(tableName);
    if (!refetch) return undefined;
    const key = `${tableName}/${rowId}`;
    const queued = this.pending.get(key);
    if (queued) return queued;

    // Deferred through .then so the lock is requested after this call returns
    // (the caller may be an upload holding it), and `finally` always clears.
    const run = Promise.resolve()
      .then(() => this.runExclusive(() => refetch([rowId])))
      .then(
        () => undefined,
        (error: unknown) => {
          this.logger.warn(
            `[MutationManager] Re-fetch of ${key} after a stale OCC rejection failed; ` +
              `the write stays queued and its next rejection retries the fetch.`,
            error
          );
        }
      )
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, run);
    return run;
  }
}
