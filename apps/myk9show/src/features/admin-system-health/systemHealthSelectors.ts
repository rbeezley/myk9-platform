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
import { healthCheckStaleAfterMs, LEGACY_HEALTH_CHECK_STALE_AFTER_MS } from './healthCheckCadence';
import {
  HEALTH_CHECK_REMEDIATION,
  inferRemediationFromText,
  PAYOUT_CRON_DISPATCH_ONLY,
  UNKNOWN_HEALTH_CHECK_REMEDIATION,
  type HealthCheckRemediationRoute,
} from './healthCheckRemediationMap';

// INTENT: a health run older than this is treated as a *failure*, not merely
// stale data — a missing run can hide a broken cron, and the operator whose
// intent is "problems surfaced automatically" must be told loudly. Do not relax
// the "stale ⇒ fail, surfaced loudly" behavior without approval (docs/INTENT.md,
// Site Admin — "The platform is healthy").
/** Compatibility export for callers that still reason about the old daily run. */
export const STALE_AFTER_MS = LEGACY_HEALTH_CHECK_STALE_AFTER_MS;

export interface HealthCheckRemediation extends HealthCheckRemediationRoute {
  coverageIncomplete: boolean;
}

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
  const key = normalizeString(entry.key, `check-${index}`);
  // The cadence registry is authoritative; persisted metadata is descriptive
  // and must not be able to extend a check's trust window.
  const staleAfterMs = healthCheckStaleAfterMs(key);
  return {
    key,
    label: normalizeString(entry.label, key || `Check ${index + 1}`),
    status: normalizeCheckStatus(entry.status),
    detail: normalizeString(entry.detail),
    checkedAt: typeof entry.checked_at === 'string' ? entry.checked_at : null,
    verification: entry.verification === 'unprovable' ? 'unprovable' : 'proven',
    staleAfterMs,
  };
}

/**
 * Normalize a raw `checks` payload into a typed list. Never throws.
 * - An array is mapped element-wise (each malformed entry degrades to `unknown`).
 * - `null`/`undefined` (absent) yields an empty list.
 * - Any other non-array value violates the array contract; rather than silently
 *   emptying it — which would render a fresh, healthy-looking board with no rows —
 *   surface a single visible "malformed payload" check so the anomaly is seen.
 *   (The DB CHECK added in migration 20260704160000 prevents this at write time;
 *   this branch protects rows that predate it or are read before it deploys.)
 */
function parseChecks(rawChecks: unknown): HealthCheck[] {
  if (Array.isArray(rawChecks)) return rawChecks.map(parseCheck);
  if (rawChecks == null) return [];
  return [
    {
      key: 'malformed-checks',
      label: 'Malformed health payload',
      status: 'unknown',
      detail: 'The stored "checks" value is not an array — the health writer is misconfigured.',
      checkedAt: null,
      verification: 'unprovable',
    },
  ];
}

/**
 * Normalize a raw PostgREST row into a typed snapshot. Never throws.
 */
export function parseSnapshot(row: SystemHealthSnapshotRow): SystemHealthSnapshot {
  return {
    id: row.id,
    createdAt: row.created_at,
    source: normalizeString(row.source),
    overallStatus: normalizeOverallStatus(row.overall_status),
    checks: parseChecks(row.checks),
    runDurationMs: typeof row.run_duration_ms === 'number' ? row.run_duration_ms : null,
  };
}

/** True when `createdAt` is older than the staleness threshold relative to `now`. */
export function isStale(
  createdAt: string,
  now: number,
  staleAfterMs: number = LEGACY_HEALTH_CHECK_STALE_AFTER_MS
): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true; // an unparseable timestamp is not trustworthy
  return now - created > staleAfterMs;
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
  const stale =
    isStale(snapshot.createdAt, now) ||
    snapshot.checks.some(check =>
      check.checkedAt === null
        ? check.status === 'ok'
        : isStale(check.checkedAt, now, check.staleAfterMs ?? healthCheckStaleAfterMs(check.key))
    );
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

function checkText(check: HealthCheck): string {
  return `${check.key} ${check.label} ${check.detail}`.toLowerCase();
}

function matches(check: HealthCheck, pattern: RegExp): boolean {
  return pattern.test(checkText(check));
}

const COVERAGE_INCOMPLETE_PATTERN =
  /not checked|not evaluated|manual check|coverage (?:incomplete|missing|not checked|not evaluated)|(?:incomplete|missing) coverage|coverage gap|no coverage/;

export function isCoverageIncomplete(check: HealthCheck): boolean {
  return matches(check, COVERAGE_INCOMPLETE_PATTERN);
}

/**
 * Owner + recovery route for a check.
 *
 * MYK9-394: routing is decided by the stable check KEY, never by the diagnostic
 * text. `HEALTH_CHECK_REMEDIATION` is authoritative for every key the runner
 * emits; the only refinement applied on top of it is keyed on the runner's
 * structured `verification` field, and text inference is reachable only for a
 * key the map has never heard of.
 */
export function getHealthCheckRemediation(check: HealthCheck): HealthCheckRemediation {
  const coverageIncomplete = isCoverageIncomplete(check);
  const mapped = HEALTH_CHECK_REMEDIATION[check.key];

  if (mapped) {
    const route =
      check.key === 'payout_cron' && check.verification === 'unprovable'
        ? PAYOUT_CRON_DISPATCH_ONLY
        : mapped;
    return { ...route, coverageIncomplete };
  }

  const inferred = inferRemediationFromText(checkText(check));
  return { ...(inferred ?? UNKNOWN_HEALTH_CHECK_REMEDIATION), coverageIncomplete };
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
