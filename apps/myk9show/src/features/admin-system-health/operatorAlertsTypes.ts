/**
 * Types for the /admin/health board's unresolved-operator-alerts section.
 *
 * Mirrors `public.operator_alerts` (see the migration
 * `20260709130000_create_operator_alerts.sql`). Edge functions write rows via
 * `_shared/alertAdmin.ts`; this app only reads and resolves them.
 */

/** The three alert severities stored in `severity`. */
export type AlertSeverity = 'info' | 'warn' | 'error';

/** A normalized alert row. */
export interface OperatorAlert {
  id: string;
  createdAt: string;
  source: string;
  severity: AlertSeverity;
  title: string;
  /** Structured context (payment identifiers, amounts, etc.), or null. */
  detail: Record<string, unknown> | null;
  dedupeKey: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/** Raw row shape as returned by PostgREST for `operator_alerts`. */
export interface OperatorAlertRow {
  id: string;
  created_at: string;
  source: string;
  severity: string;
  title: string;
  detail: unknown;
  dedupe_key: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}
