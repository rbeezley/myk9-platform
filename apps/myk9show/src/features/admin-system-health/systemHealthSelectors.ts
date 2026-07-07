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

export interface HealthCheckRemediation {
  ownerLabel: string;
  actionLabel: string;
  href: string;
  nextStep: string;
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
  return {
    key: normalizeString(entry.key, `check-${index}`),
    label: normalizeString(entry.label, normalizeString(entry.key, `Check ${index + 1}`)),
    status: normalizeCheckStatus(entry.status),
    detail: normalizeString(entry.detail),
    checkedAt: typeof entry.checked_at === 'string' ? entry.checked_at : null,
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

function checkText(check: HealthCheck): string {
  return `${check.key} ${check.label} ${check.detail}`.toLowerCase();
}

function matches(check: HealthCheck, pattern: RegExp): boolean {
  return pattern.test(checkText(check));
}

export function isCoverageIncomplete(check: HealthCheck): boolean {
  return matches(check, /not checked|not evaluated|incomplete|manual check|coverage/);
}

export function getHealthCheckRemediation(check: HealthCheck): HealthCheckRemediation {
  const coverageIncomplete = isCoverageIncomplete(check);

  if (matches(check, /sync|replication|queue|conflict/)) {
    return {
      ownerLabel: 'Sync Monitoring',
      actionLabel: 'Open Sync',
      href: '/admin/sync',
      nextStep: 'Review device queues, conflicts, and sync errors.',
      coverageIncomplete,
    };
  }

  if (matches(check, /support|ticket|inbox/)) {
    return {
      ownerLabel: 'Support Inbox',
      actionLabel: 'Open Support',
      href: '/admin/support',
      nextStep: 'Review the support queue and affected diagnostics.',
      coverageIncomplete,
    };
  }

  if (matches(check, /deleted|restore|recovery|trash/)) {
    return {
      ownerLabel: 'Deleted Items',
      actionLabel: 'Open Deleted Items',
      href: '/admin/deleted-items',
      nextStep: 'Check whether missing data can be restored.',
      coverageIncomplete,
    };
  }

  if (matches(check, /permission|access|rbac|role|user role/)) {
    return {
      ownerLabel: 'Permissions',
      actionLabel: 'Open Permissions',
      href: '/admin/permissions',
      nextStep: 'Review role assignments and access repair surfaces.',
      coverageIncomplete,
    };
  }

  if (matches(check, /payout|payment|stripe|money/)) {
    return {
      ownerLabel: 'Payout Ledger',
      actionLabel: 'Open Payouts',
      href: '/admin/payouts',
      nextStep: 'Review payout/payment status and the money-path runbook.',
      coverageIncomplete,
    };
  }

  if (matches(check, /migration|deploy|cron|scheduler|background|edge|manual|job/)) {
    return {
      ownerLabel: 'Operations Runbook',
      actionLabel: 'Open Admin Help',
      href: '/admin/help',
      nextStep: 'Use the operations runbook or admin help to assign the manual recovery owner.',
      coverageIncomplete,
    };
  }

  return {
    ownerLabel: 'Owner incomplete',
    actionLabel: 'Open Admin Help',
    href: '/admin/help',
    nextStep: 'No owner is mapped yet; use admin help or the operations runbook to triage.',
    coverageIncomplete,
  };
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
