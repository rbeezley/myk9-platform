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
  private readonly refusedRepulls = new Map<string, RowRefetcher>();
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
    return this.enqueue(
      this.refetchers.get(tableName),
      tableName,
      rowId,
      'after a stale OCC rejection',
      'the write stays queued and its next rejection retries the fetch.'
    );
  }

  /** @returns an unregister function that removes only this refetcher. */
  registerRefusedRepull(tableName: string, repull: RowRefetcher): () => void {
    this.refusedRepulls.set(tableName, repull);
    return () => {
      if (this.refusedRepulls.get(tableName) === repull) this.refusedRepulls.delete(tableName);
    };
  }

  /** True when the table opted in to re-pulling rows whose edit was refused (MYK9-1076). */
  repullsRefused(tableName: string): boolean {
    return this.refusedRepulls.has(tableName);
  }

  /**
   * Queue a re-pull of one row whose queued edit was permanently refused or
   * discarded (MYK9-1076). Same contract as {@link request}: deferred past the
   * caller, runs under the upload lock, never rejects. A failed fetch (offline)
   * is logged and dropped: the row is not healed until a later refusal or
   * discard asks again. Returns undefined for a table that did not opt in.
   */
  requestRefusedRepull(tableName: string, rowId: string): Promise<void> | undefined {
    return this.enqueue(
      this.refusedRepulls.get(tableName),
      tableName,
      rowId,
      'after a refused or discarded edit',
      'the local row keeps its value until a later refusal or discard asks again.',
      'refused:'
    );
  }

  /** A discarded UPDATE returns its row to the server's value; other operations have no server row to return to. */
  requestDiscardedRepull(m: { tableName: string; rowId: string; operation: string }) {
    if (m.operation === 'UPDATE') void this.requestRefusedRepull(m.tableName, String(m.rowId));
  }

  private enqueue(
    refetch: RowRefetcher | undefined,
    tableName: string,
    rowId: string,
    when: string,
    consequence: string,
    keyPrefix = ''
  ): Promise<void> | undefined {
    if (!refetch) return undefined;
    const label = `${tableName}/${rowId}`;
    const key = `${keyPrefix}${label}`;
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
            `[MutationManager] Re-fetch of ${label} ${when} failed; ${consequence}`,
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
