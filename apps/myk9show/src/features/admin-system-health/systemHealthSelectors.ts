/**
 * Pure logic for the System Health board.
 *
 * All functions here are side-effect free and take an explicit `now` so the
 * stale/empty derivation is deterministically testable. Nothing here throws on
 * malformed input — a bad snapshot from the writer must degrade visibly on the
 * page, never crash it.
 */
import type { StatusBadgeVariants } from '@myk9/ui';
import type {
  CheckStatus,
  EffectiveHealth,
  HealthCheck,
  HealthStatus,
  SystemHealthSnapshot,
  SystemHealthSnapshotRow,
} from './systemHealthTypes';

// INTENT: a health run older than this is treated as a *failure*, not merely
// stale data — a missing run can hide a broken cron, and the operator whose
// intent is "problems surfaced automatically" must be told loudly. Do not relax
// the "stale ⇒ fail, surfaced loudly" behavior without approval (docs/INTENT.md,
// Site Admin — "The platform is healthy").
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000; // ~26 hours

const VALID_STATUSES: readonly HealthStatus[] = ['ok', 'warn', 'fail'];

function isHealthStatus(value: unknown): value is HealthStatus {
  return typeof value === 'string' && (VALID_STATUSES as readonly string[]).includes(value);
}

/** Coerce a raw check status to a known state, falling back to `unknown`. */
export function normalizeCheckStatus(value: unknown): CheckStatus {
  return isHealthStatus(value) ? value : 'unknown';
}

/** Coerce a raw overall status; an unrecognized value fails safe to `fail`. */
export function normalizeOverallStatus(value: unknown): HealthStatus {
  return isHealthStatus(value) ? value : 'fail';
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function parseCheck(raw: unknown, index: number): HealthCheck {
  const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    key: normalizeString(entry.key, `check-${index}`),
    label: normalizeString(entry.label, normalizeString(entry.key, `Check ${index + 1}`)),
    status: normalizeCheckStatus(entry.status),
    detail: normalizeString(entry.detail),
    checkedAt: typeof entry.checked_at === 'string' ? entry.checked_at : null,
  };
}

/**
 * Normalize a raw PostgREST row into a typed snapshot. Never throws: a non-array
 * `checks` yields an empty list, and each malformed entry degrades to `unknown`.
 */
export function parseSnapshot(row: SystemHealthSnapshotRow): SystemHealthSnapshot {
  const rawChecks = Array.isArray(row.checks) ? row.checks : [];
  return {
    id: row.id,
    createdAt: row.created_at,
    source: normalizeString(row.source),
    overallStatus: normalizeOverallStatus(row.overall_status),
    checks: rawChecks.map(parseCheck),
    runDurationMs: typeof row.run_duration_ms === 'number' ? row.run_duration_ms : null,
  };
}

/** True when `createdAt` is older than the staleness threshold relative to `now`. */
export function isStale(createdAt: string, now: number): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true; // an unparseable timestamp is not trustworthy
  return now - created > STALE_AFTER_MS;
}

/**
 * Fold staleness and emptiness into an effective status. Missing (`null`) or
 * stale snapshots resolve to `fail` regardless of their stored `overallStatus`.
 */
export function deriveEffectiveStatus(
  snapshot: SystemHealthSnapshot | null,
  now: number
): EffectiveHealth {
  if (!snapshot) {
    return { status: 'fail', isStale: false, isEmpty: true };
  }
  const stale = isStale(snapshot.createdAt, now);
  return {
    status: stale ? 'fail' : snapshot.overallStatus,
    isStale: stale,
    isEmpty: false,
  };
}

type BadgeVariant = NonNullable<StatusBadgeVariants['variant']>;

/** Map a health status to a shared `StatusBadge` variant (no new primitive). */
export function statusToBadgeVariant(status: CheckStatus): BadgeVariant {
  switch (status) {
    case 'ok':
      return 'success';
    case 'warn':
      return 'warning';
    case 'fail':
      return 'error';
    default:
      return 'muted';
  }
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Human "checked N ago" label. Returns "unknown" for a missing/invalid time. */
export function formatCheckedAgo(checkedAt: string | null, now: number): string {
  if (!checkedAt) return 'unknown';
  const checked = Date.parse(checkedAt);
  if (Number.isNaN(checked)) return 'unknown';

  const diff = now - checked;
  if (diff < 0) return 'just now'; // clock skew — don't render a negative age
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) {
    const mins = Math.floor(diff / MINUTE_MS);
    return `${mins} min ago`;
  }
  if (diff < DAY_MS) {
    const hrs = Math.floor(diff / HOUR_MS);
    return `${hrs} hr ago`;
  }
  const days = Math.floor(diff / DAY_MS);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
