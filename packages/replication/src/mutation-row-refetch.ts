import type { Logger } from './dependencies';

/** Re-fetch rows by id and run them through dirty-row reconciliation. */
export type RowRefetcher = (rowIds: string[]) => Promise<unknown>;

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
 * There is no bookkeeping to lose: a failed fetch is logged and dropped, the
 * write stays queued, and its next rejection asks again.
 */
export class RowRefetchRegistry {
  private readonly refetchers = new Map<string, RowRefetcher>();
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly logger: Logger) {}

  /** @returns an unregister function that removes only this refetcher. */
  register(tableName: string, refetch: RowRefetcher): () => void {
    this.refetchers.set(tableName, refetch);
    return () => {
      if (this.refetchers.get(tableName) === refetch) this.refetchers.delete(tableName);
    };
  }

  /**
   * Fire-and-forget re-fetch of one row. Never rejects. A request for a row
   * whose re-fetch is still running joins it. Returns undefined when the table
   * registered no refetcher (current behavior: the write keeps backing off).
   */
  request(tableName: string, rowId: string): Promise<void> | undefined {
    const refetch = this.refetchers.get(tableName);
    if (!refetch) return undefined;
    const key = `${tableName}/${rowId}`;
    const running = this.inFlight.get(key);
    if (running) return running;

    // Deferred through .then so the refetcher never runs (or throws) before the
    // in-flight entry exists, and `finally` always removes it.
    const run = Promise.resolve()
      .then(() => refetch([rowId]))
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
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, run);
    return run;
  }
}
