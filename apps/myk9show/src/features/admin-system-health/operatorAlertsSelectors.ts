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
