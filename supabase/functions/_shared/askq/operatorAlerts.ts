export const OPERATOR_ALERT_SELECT = 'id, created_at, source, severity, title';
export const OPERATOR_ALERT_QUERY_LIMIT = 50;
export const OPERATOR_ALERT_RECENT_LIMIT = 10;

type OperatorAlertSeverity = 'info' | 'warn' | 'error';

interface OperatorAlertRow {
  id: string;
  created_at: string;
  source: string;
  severity: string;
  title: string;
}

export interface OperatorAlertSummary {
  unresolvedCountInWindow: number;
  isAtQueryLimit: boolean;
  bySeverity: Record<OperatorAlertSeverity, number>;
  bySource: Record<string, number>;
  recentAlerts: Array<{
    id: string;
    createdAt: string;
    source: string;
    severity: OperatorAlertSeverity;
    title: string;
  }>;
}

interface OperatorAlertQuery {
  select(columns: string): OperatorAlertQuery;
  is(column: string, value: null): OperatorAlertQuery;
  order(column: string, options: { ascending: boolean }): OperatorAlertQuery;
  limit(count: number): PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;
}

export interface OperatorAlertClient {
  from(table: string): OperatorAlertQuery;
}

export async function readOperatorAlertSummary(
  callerClient: OperatorAlertClient
): Promise<OperatorAlertSummary> {
  const { data, error } = await callerClient
    .from('operator_alerts')
    .select(OPERATOR_ALERT_SELECT)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(OPERATOR_ALERT_QUERY_LIMIT);

  if (error) {
    throw new Error('Unable to read unresolved operator alerts');
  }

  return summarizeOperatorAlerts(data ?? []);
}

export function summarizeOperatorAlerts(rows: unknown[]): OperatorAlertSummary {
  const boundedRows = rows
    .slice(0, OPERATOR_ALERT_QUERY_LIMIT)
    .map(toOperatorAlertRow)
    .filter((row): row is OperatorAlertRow => row !== null);
  const bySeverity: Record<OperatorAlertSeverity, number> = {
    info: 0,
    warn: 0,
    error: 0,
  };
  const sourceCounts = new Map<string, number>();

  for (const row of boundedRows) {
    const severity = normalizeSeverity(row.severity);
    bySeverity[severity] += 1;
    sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);
  }

  return {
    unresolvedCountInWindow: boundedRows.length,
    isAtQueryLimit: rows.length >= OPERATOR_ALERT_QUERY_LIMIT,
    bySeverity,
    bySource: Object.fromEntries(sourceCounts),
    recentAlerts: boundedRows.slice(0, OPERATOR_ALERT_RECENT_LIMIT).map(row => ({
      id: row.id,
      createdAt: row.created_at,
      source: row.source,
      severity: normalizeSeverity(row.severity),
      title: row.title,
    })),
  };
}

function toOperatorAlertRow(value: unknown): OperatorAlertRow | null {
  if (!isRecord(value)) return null;

  const id = boundedString(value.id, 64);
  const createdAt = boundedString(value.created_at, 64);
  const source = boundedString(value.source, 80);
  const severity = boundedString(value.severity, 16);
  const title = boundedString(value.title, 200);
  if (!id || !createdAt || !source || !severity || !title) return null;

  return { id, created_at: createdAt, source, severity, title };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return [...value]
    .map(character => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 ? ' ' : character;
    })
    .join('')
    .trim()
    .slice(0, maxLength);
}

function normalizeSeverity(value: string): OperatorAlertSeverity {
  if (value === 'info' || value === 'warn') return value;
  return 'error';
}
