/**
 * Types for the site-admin System Health board.
 *
 * Mirrors the `public.system_health_snapshots` store (see the migration
 * `20260704120000_create_system_health_snapshots.sql`). A companion change
 * writes rows here; this app only reads them.
 */

/** The three health states stored in `overall_status` and each check's `status`. */
export type HealthStatus = 'ok' | 'warn' | 'fail';

/**
 * A check whose `status` was missing or unrecognized in the raw snapshot.
 * Surfaced rather than dropped so a malformed writer is visible, not silent.
 */
export type CheckStatus = HealthStatus | 'unknown';

/**
 * Whether an amber check is amber because it *cannot* prove anything
 * (`unprovable` — the board calls this "Unverified") or because it looked and
 * found a real degradation (`proven` — "Needs a look"). Written by the runner;
 * absent on older snapshots, which read as `proven`.
 */
export type CheckVerification = 'proven' | 'unprovable';

/** One normalized check row, parsed from an entry of the snapshot's `checks` array. */
export interface HealthCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** ISO timestamp the check ran, or null if the writer omitted it. */
  checkedAt: string | null;
  verification: CheckVerification;
}

/** A normalized snapshot row. */
export interface SystemHealthSnapshot {
  id: string;
  createdAt: string;
  source: string;
  overallStatus: HealthStatus;
  checks: HealthCheck[];
  runDurationMs: number | null;
}

/** Raw row shape as returned by PostgREST for `system_health_snapshots`. */
export interface SystemHealthSnapshotRow {
  id: string;
  created_at: string;
  source: string;
  overall_status: string;
  checks: unknown;
  run_duration_ms: number | null;
}

/**
 * The board's effective status once staleness and emptiness are folded in.
 * `status` is `fail` whenever the run is missing or stale, regardless of the
 * stored `overallStatus` — a missing run is itself a failure signal.
 */
export interface EffectiveHealth {
  status: HealthStatus;
  isStale: boolean;
  isEmpty: boolean;
}
