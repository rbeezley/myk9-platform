/**
 * Helpers for the server-authoritative incremental-sync watermark.
 *
 * See docs/plan-replication-incremental-watermark-fix.md. The replication engine
 * advances its incremental watermark to the maximum server `updated_at` it has
 * observed, rather than the client wall clock — removing the clock-skew /
 * round-trip-race classes of silently dropped rows. Adapters use
 * {@link parseUpdatedAtMs} to feed their remote row's `updated_at` to the engine.
 */

/**
 * Parse a server `updated_at` value into epoch milliseconds for use as an
 * incremental-sync watermark. Returns `null` for any value that can't be parsed
 * to a finite number, so the engine can exclude it from the watermark max — a
 * `NaN` would poison the watermark and break every subsequent fetch
 * (`new Date(NaN).toISOString()` throws).
 */
export function parseUpdatedAtMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Incremental-sync safety buffer (ms) subtracted from the watermark before each
 * fetch, to re-catch rows committed with the same `updated_at` as the last
 * observed max (same-millisecond ties / commits landing inside the fetch
 * snapshot). Default for low-churn tables (dogs, trials, shows, clubs, etc.).
 * Re-fetching a few overlapping rows is an idempotent upsert.
 */
export const REPLICATION_INCREMENTAL_BUFFER_MS = 60_000;

/**
 * Buffer for high-churn tables (entries, classes), smaller than the 60s default
 * because it is re-read on every sync tick during a live show.
 *
 * It must exceed commit lag, not just absorb boundary ties: `updated_at` is
 * stamped with `now()`, the transaction START time, so a row stamped at T can
 * commit at T + d. If d is longer than this buffer, incremental sync advances
 * its watermark past T and never sees the row until the 24h full sync.
 * Measured on production pg_stat_statements (2026-10-31): the slowest write RPC
 * peaked at 3.78s; load tests (MYK9-1468) showed p95 of 3.5-9.5s under
 * concurrent syncs. 30s keeps a wide margin over both (MYK9-1497).
 *
 * Cost: each incremental sync re-reads the rows changed in the last 30s, an
 * idempotent upsert of a few dozen rows at a live show.
 */
export const REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN = 30_000;
