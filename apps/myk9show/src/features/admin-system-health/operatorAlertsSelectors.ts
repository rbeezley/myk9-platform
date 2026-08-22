/**
 * Pure logic for the /admin/health board's unresolved-operator-alerts
 * section. Side-effect free; nothing here throws on malformed input — a bad
 * row from the writer must degrade visibly (e.g. an unrecognized severity
 * falls back to 'error', the loudest state), never crash the board.
 */
import type { StatusBadgeVariants } from '@myk9/ui';
import { detailEntryToText } from './alertDetailText';
import type { AlertSeverity, OperatorAlert, OperatorAlertRow } from './operatorAlertsTypes';

type BadgeVariant = NonNullable<StatusBadgeVariants['variant']>;

const VALID_SEVERITIES: readonly AlertSeverity[] = ['info', 'warn', 'error'];

function normalizeSeverity(value: string): AlertSeverity {
  return (VALID_SEVERITIES as readonly string[]).includes(value)
    ? (value as AlertSeverity)
    : 'error';
}

function normalizeDetail(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Normalize a raw `operator_alerts` PostgREST row into board-ready shape. */
export function parseOperatorAlert(row: OperatorAlertRow): OperatorAlert {
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    severity: normalizeSeverity(row.severity),
    title: row.title,
    detail: normalizeDetail(row.detail),
    dedupeKey: row.dedupe_key,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
}

/** Maps an alert severity to the shared StatusBadge variant vocabulary. */
export function severityToBadgeVariant(severity: AlertSeverity): BadgeVariant {
  switch (severity) {
    case 'error':
      return 'error';
    case 'warn':
      return 'warning';
    default:
      return 'muted';
  }
}

/** Compact "key: value, key: value" rendering of an alert's structured detail.
 * Value formatting (markup stripping, object JSON, the length cap) lives in
 * `alertDetailText` so this board and the admin dashboard read alerts alike. */
export function formatAlertDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    const text = detailEntryToText(key, value);
    if (text) parts.push(text);
  }
  return parts.join(', ');
}

/**
 * Unresolved alerts as the health verdict reads them. Deliberately two numbers,
 * not one: every unresolved alert is worth naming, but only an error-severity
 * one is loud enough to withdraw the board's all-clear.
 */
export interface AlertSummary {
  unresolved: number;
  /** Error severity — the bucket that blocks "Everything's running". */
  needingReview: number;
}

/** Fold the unresolved-alerts list into the counts the verdict needs. */
export function summarizeAlerts(alerts: OperatorAlert[]): AlertSummary {
  let needingReview = 0;
  for (const alert of alerts) {
    if (alert.severity === 'error') needingReview += 1;
  }
  return { unresolved: alerts.length, needingReview };
}

/**
 * One repeated alert type, with every occurrence that shares its identity.
 *
 * Grouped on source + severity + title, NOT on `dedupe_key`: that key embeds
 * the event's own identifiers (`cart-overflow-refund-issued-re_3U5z1F...`) so
 * it is an idempotency key for a single write, and grouping on it would return
 * N groups of one. Every member is therefore a DISTINCT event - four
 * occurrences are four different refunds - which is why the UI collapses them
 * for reading but still resolves them one at a time.
 */
export interface AlertGroup {
  key: string;
  source: string;
  severity: AlertSeverity;
  title: string;
  /** Occurrences, in the newest-first order the query returned. */
  alerts: OperatorAlert[];
  newestAt: string;
  oldestAt: string;
}

/** Collapse repeated alert types, preserving the query's newest-first order. */
export function groupOperatorAlerts(alerts: OperatorAlert[]): AlertGroup[] {
  const byKey = new Map<string, AlertGroup>();

  for (const alert of alerts) {
    const key = `${alert.source} ${alert.severity} ${alert.title}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        source: alert.source,
        severity: alert.severity,
        title: alert.title,
        alerts: [alert],
        newestAt: alert.createdAt,
        oldestAt: alert.createdAt,
      });
      continue;
    }
    existing.alerts.push(alert);
    // Do not assume the caller sorted: take the extremes as they are seen.
    if (alert.createdAt > existing.newestAt) existing.newestAt = alert.createdAt;
    if (alert.createdAt < existing.oldestAt) existing.oldestAt = alert.createdAt;
  }

  return [...byKey.values()];
}
