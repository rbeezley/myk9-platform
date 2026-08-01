/**
 * "Needs a look" — the admin dashboard's triage queue.
 *
 * INTENT: this is DERIVED, read-only, and owns no storage. It is assembled from
 * two things that already exist — failing/unverified health checks and
 * unresolved operator alerts — because the alternative is a ticketing system,
 * and this platform has exactly one administrator
 * (docs/plan-admin-dashboard-data-contract.md § Triage queue).
 *
 * There is deliberately NO owner field and NO stored severity. Both were in the
 * design; both are backend concepts that do not exist yet, and inventing them
 * here would mean the dashboard asserting facts nothing can back up. Severity is
 * mapped from what the source already says. If a second admin ever arrives,
 * assignment is a real feature — build it then, not now.
 *
 * Side-effect free and `now`-injected, like the health selectors.
 */
import { getHealthCheckRemediation } from '@/features/admin-system-health/systemHealthSelectors';
import type { HealthCheck } from '@/features/admin-system-health/systemHealthTypes';
import type { OperatorAlert } from '@/features/admin-system-health/operatorAlertsTypes';

/** Ordered worst-first; the index is the sort key. */
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type TriageSeverity = (typeof SEVERITIES)[number];

/**
 * Grouped by why you would act, not by which system emitted it. An admin
 * triaging at 7am is asking "is money stuck, is service degraded, is a deadline
 * passing" — not "was this pg_cron or PostgREST".
 */
export type TriageCategory = 'money' | 'service' | 'deadline';

export interface TriageItem {
  id: string;
  severity: TriageSeverity;
  category: TriageCategory;
  title: string;
  /** One line of context — what was actually seen. */
  detail: string;
  openedAt: string | null;
  action: { label: string; href: string };
}

const MONEY = /payout|payment|stripe|refund|invoice|money|ledger/i;
const DEADLINE = /deadline|entry.close|closing|waitlist|expir/i;

/** Category from the source's own words. Service is the honest default: most
 * platform faults degrade service, and mislabelling one as money is worse than
 * a correct generic. */
export function categorize(text: string): TriageCategory {
  if (MONEY.test(text)) return 'money';
  if (DEADLINE.test(text)) return 'deadline';
  return 'service';
}

function checkSeverity(check: HealthCheck, category: TriageCategory): TriageSeverity {
  if (check.status === 'fail') return category === 'money' ? 'Critical' : 'High';
  // Amber. "Cannot prove" is a coverage gap, not an incident.
  return check.verification === 'unprovable' ? 'Low' : 'Medium';
}

const ALERT_SEVERITY: Record<OperatorAlert['severity'], TriageSeverity> = {
  error: 'High',
  warn: 'Medium',
  info: 'Low',
};

/** Alert `detail` is arbitrary JSON. Render the most useful single line we can
 * without pretending to a schema it does not have. */
export function summarizeAlertDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return 'No further detail recorded.';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || typeof value === 'object') continue;
    parts.push(`${key}: ${String(value)}`);
    if (parts.length === 3) break;
  }
  return parts.length > 0 ? parts.join(' · ') : 'No further detail recorded.';
}

function ageMs(openedAt: string | null, now: number): number {
  if (!openedAt) return 0;
  const parsed = Date.parse(openedAt);
  return Number.isNaN(parsed) ? 0 : now - parsed;
}

/**
 * Build the queue. Checks that pass are excluded; everything else earns a row.
 * Sort is severity, then oldest first — never alphabetical, because the top of
 * this list is meant to be the next thing you do.
 */
export interface TriageSources {
  /** True when no snapshot exists at all. */
  healthMissing?: boolean;
  /** True when the newest snapshot is older than the staleness window. */
  healthStale?: boolean;
  /** The health query itself failed — its checks are unknown, not passing. */
  healthUnavailable?: boolean;
  /** The alerts query failed — the alert set is unknown, not empty. */
  alertsUnavailable?: boolean;
  /** Newest snapshot time, for the age column on a staleness row. */
  lastRunAt?: string | null;
}

export function deriveTriage(
  checks: HealthCheck[],
  alerts: OperatorAlert[],
  now: number,
  sources: TriageSources = {}
): TriageItem[] {
  const items: TriageItem[] = [];

  // A missing, stale or unreadable health run is itself the finding. Without
  // these rows the queue iterates an empty `checks` array and reports "nothing
  // is waiting on you" at the exact moment the platform cannot say whether
  // anything is wrong — the failure mode this whole redesign exists to remove.
  if (sources.healthUnavailable) {
    items.push({
      id: 'source:health-unavailable',
      severity: 'Critical',
      category: 'service',
      title: 'System health could not be read',
      detail:
        'The snapshot query failed, so no check below is known to be passing. This is not an all-clear.',
      openedAt: null,
      action: { label: 'Open system health', href: '/admin/health' },
    });
  } else if (sources.healthMissing) {
    items.push({
      id: 'source:health-missing',
      severity: 'Critical',
      category: 'service',
      title: 'No health run has ever been recorded',
      detail: 'The nightly runner has never written a snapshot.',
      openedAt: null,
      action: { label: 'Open system health', href: '/admin/health' },
    });
  } else if (sources.healthStale) {
    items.push({
      id: 'source:health-stale',
      severity: 'High',
      category: 'service',
      title: 'Health results are too old to trust',
      detail:
        'The last run is older than the window it covers, so a failure since then would not appear here.',
      openedAt: sources.lastRunAt ?? null,
      action: { label: 'Open system health', href: '/admin/health' },
    });
  }

  if (sources.alertsUnavailable) {
    items.push({
      id: 'source:alerts-unavailable',
      severity: 'High',
      category: 'service',
      title: 'Unresolved alerts could not be read',
      detail: 'The alerts query failed. An empty alert list here would be a guess, not a fact.',
      openedAt: null,
      action: { label: 'Open system health', href: '/admin/health' },
    });
  }

  for (const check of checks) {
    if (check.status === 'ok') continue;
    const category = categorize(`${check.key} ${check.label} ${check.detail}`);
    const remediation = getHealthCheckRemediation(check);
    items.push({
      id: `check:${check.key}`,
      severity: checkSeverity(check, category),
      category,
      title: check.label,
      detail: check.detail || 'The runner recorded no detail for this check.',
      openedAt: check.checkedAt,
      action: { label: remediation.actionLabel, href: remediation.href },
    });
  }

  for (const alert of alerts) {
    if (alert.resolvedAt) continue;
    items.push({
      id: `alert:${alert.id}`,
      severity: ALERT_SEVERITY[alert.severity] ?? 'Medium',
      category: categorize(`${alert.source} ${alert.title}`),
      title: alert.title,
      detail: summarizeAlertDetail(alert.detail),
      openedAt: alert.createdAt,
      action: { label: 'Open system health', href: '/admin/health' },
    });
  }

  return items.sort((a, b) => {
    const bySeverity = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return ageMs(b.openedAt, now) - ageMs(a.openedAt, now);
  });
}

export interface TriageSummary {
  money: number;
  service: number;
  deadline: number;
  total: number;
}

/** One source for the rail badge, the section badge, the tab labels and the
 * footer. Production showed 12, 10 and 3 for the same queue; that is the bug
 * this redesign exists to prevent, so there is exactly one counter. */
export function summarizeTriage(items: TriageItem[]): TriageSummary {
  return {
    money: items.filter(i => i.category === 'money').length,
    service: items.filter(i => i.category === 'service').length,
    deadline: items.filter(i => i.category === 'deadline').length,
    total: items.length,
  };
}

export function filterTriage(items: TriageItem[], category: TriageCategory | 'all'): TriageItem[] {
  return category === 'all' ? items : items.filter(i => i.category === category);
}
