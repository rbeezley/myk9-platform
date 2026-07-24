import type { OperatorAlertClient } from './operatorAlerts.ts';
import { boundedOperatorString, isOperatorRecord } from './operatorDataSanitization.ts';

export const OPERATOR_HEALTH_SELECT =
  'id, created_at, source, overall_status, checks, run_duration_ms';
export const OPERATOR_HEALTH_CHECK_LIMIT = 20;
export const OPERATOR_HEALTH_STALE_AFTER_HOURS = 26;

const OPERATOR_HEALTH_STALE_AFTER_MS = OPERATOR_HEALTH_STALE_AFTER_HOURS * 60 * 60 * 1000;
const SCOPE_NOTE =
  'This snapshot covers only the configured automated checks. It is not proof of complete platform health.';

type HealthStatus = 'ok' | 'warn' | 'fail';
type HealthCheckStatus = HealthStatus | 'unknown';

export interface OperatorHealthSummary {
  snapshotAvailable: boolean;
  snapshotCreatedAt: string | null;
  source: string | null;
  reportedStatus: HealthStatus | null;
  effectiveStatus: HealthStatus;
  isStale: boolean;
  staleAfterHours: number;
  runDurationMs: number | null;
  checksPayloadValid: boolean;
  checks: Array<{
    key: string;
    label: string;
    status: HealthCheckStatus;
    detail: string;
    checkedAt: string | null;
  }>;
  scopeNote: string;
}

export async function readOperatorHealthSummary(
  callerClient: OperatorAlertClient,
  now = Date.now()
): Promise<OperatorHealthSummary> {
  const { data, error } = await callerClient
    .from('system_health_snapshots')
    .select(OPERATOR_HEALTH_SELECT)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error('Unable to read the system health snapshot');
  }

  return summarizeOperatorHealth(data?.[0], now);
}

export function summarizeOperatorHealth(value: unknown, now: number): OperatorHealthSummary {
  if (!isOperatorRecord(value)) {
    return emptyHealthSummary();
  }

  const snapshotCreatedAt = boundedOperatorString(value.created_at, 64);
  const source = boundedOperatorString(value.source, 80);
  const reportedStatus = normalizeHealthStatus(value.overall_status);
  if (!snapshotCreatedAt || !source || !reportedStatus) {
    return emptyHealthSummary();
  }

  const createdAtMs = Date.parse(snapshotCreatedAt);
  const isStale = Number.isNaN(createdAtMs) || now - createdAtMs > OPERATOR_HEALTH_STALE_AFTER_MS;
  const checksPayloadValid = hasValidChecksPayload(value.checks);

  return {
    snapshotAvailable: true,
    snapshotCreatedAt,
    source,
    reportedStatus,
    effectiveStatus: isStale || !checksPayloadValid ? 'fail' : reportedStatus,
    isStale,
    staleAfterHours: OPERATOR_HEALTH_STALE_AFTER_HOURS,
    runDurationMs: normalizeRunDuration(value.run_duration_ms),
    checksPayloadValid,
    checks: normalizeChecks(value.checks),
    scopeNote: SCOPE_NOTE,
  };
}

function emptyHealthSummary(): OperatorHealthSummary {
  return {
    snapshotAvailable: false,
    snapshotCreatedAt: null,
    source: null,
    reportedStatus: null,
    effectiveStatus: 'fail',
    isStale: false,
    staleAfterHours: OPERATOR_HEALTH_STALE_AFTER_HOURS,
    runDurationMs: null,
    checksPayloadValid: false,
    checks: [],
    scopeNote: SCOPE_NOTE,
  };
}

function normalizeChecks(value: unknown): OperatorHealthSummary['checks'] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, OPERATOR_HEALTH_CHECK_LIMIT).map((rawCheck, index) => {
    const check = isOperatorRecord(rawCheck) ? rawCheck : {};
    const key = boundedOperatorString(check.key, 80) || `check-${index + 1}`;
    return {
      key,
      label: boundedOperatorString(check.label, 120) || key,
      status: normalizeCheckStatus(check.status),
      detail: boundedOperatorString(check.detail, 300),
      checkedAt: boundedOperatorString(check.checked_at, 64) || null,
    };
  });
}

function hasValidChecksPayload(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      check =>
        isOperatorRecord(check) &&
        typeof check.key === 'string' &&
        check.key.trim().length > 0 &&
        typeof check.label === 'string' &&
        check.label.trim().length > 0 &&
        normalizeHealthStatus(check.status) !== null &&
        typeof check.detail === 'string' &&
        (check.checked_at === null || typeof check.checked_at === 'string')
    )
  );
}

function normalizeHealthStatus(value: unknown): HealthStatus | null {
  return value === 'ok' || value === 'warn' || value === 'fail' ? value : null;
}

function normalizeCheckStatus(value: unknown): HealthCheckStatus {
  return normalizeHealthStatus(value) ?? 'unknown';
}

function normalizeRunDuration(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
