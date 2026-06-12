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
 * Smaller buffer for high-churn tables (entries, classes) where a 60s window
 * would re-fetch a large rolling set on every sync tick during a live show. Safe
 * because the server-authoritative watermark already prevents systemic drops —
 * here the buffer only absorbs sub-second boundary ties.
 */
export const REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN = 5_000;
