/**
 * Pure logic for the /admin/health board's unresolved-operator-alerts
 * section. Side-effect free; nothing here throws on malformed input — a bad
 * row from the writer must degrade visibly (e.g. an unrecognized severity
 * falls back to 'error', the loudest state), never crash the board.
 */
import type { StatusBadgeVariants } from '@myk9/ui';
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

/** Keys whose value IS the message; prefixing them ("html: …") is noise. */
const MESSAGE_KEYS = /^(html|message|text|body|detail)$/i;

/** Values can arrive as rendered markup (production alerts store serialized
 * HTML under an `html` key). Show the sentence, never the serialization. */
function toPlainText(value: unknown): string {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compact "key: value, key: value" rendering of an alert's structured detail. */
export function formatAlertDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || typeof value === 'object') continue;
    const text = toPlainText(value);
    if (!text) continue;
    parts.push(MESSAGE_KEYS.test(key) ? text : `${key}: ${text}`);
  }
  return parts.join(', ');
}
