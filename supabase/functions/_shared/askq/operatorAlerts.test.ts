import { describe, expect, it, vi } from 'vitest';

import {
  OPERATOR_ALERT_QUERY_LIMIT,
  OPERATOR_ALERT_RECENT_LIMIT,
  OPERATOR_ALERT_SELECT,
  readOperatorAlertSummary,
  summarizeOperatorAlerts,
} from './operatorAlerts.ts';
import {
  OPERATOR_HEALTH_CHECK_LIMIT,
  OPERATOR_HEALTH_SELECT,
  readOperatorHealthSummary,
} from './operatorHealth.ts';
import { OPERATOR_TOOLS } from './operatorToolDefinitions.ts';
import { executeOperatorTool } from './operatorToolExecutor.ts';

function makeAlertClient(data: unknown[], error: { message: string } | null = null) {
  const query = {
    select: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data, error })),
  };
  const from = vi.fn(() => query);
  return { client: { from }, from, query };
}

function makeHealthClient(data: unknown[], error: { message: string } | null = null) {
  const query = {
    select: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data, error })),
  };
  const from = vi.fn(() => query);
  return { client: { from }, from, query };
}

describe('Operator Support alert tool', () => {
  it('advertises exactly the approved read-only operator tools', () => {
    expect(OPERATOR_TOOLS.map(tool => tool.name)).toEqual([
      'summarize_operator_alerts',
      'summarize_system_health',
    ]);
  });

  it('queries unresolved alerts through the provided caller client with a fixed field allowlist', async () => {
    const { client, from, query } = makeAlertClient([]);

    await readOperatorAlertSummary(client);

    expect(from).toHaveBeenCalledWith('operator_alerts');
    expect(query.select).toHaveBeenCalledWith(OPERATOR_ALERT_SELECT);
    expect(query.is).toHaveBeenCalledWith('resolved_at', null);
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(OPERATOR_ALERT_QUERY_LIMIT);
    expect(OPERATOR_ALERT_SELECT).toBe('id, created_at, source, severity, title');
  });

  it('returns only bounded aggregates and allowlisted recent-alert fields', () => {
    const rows = Array.from({ length: OPERATOR_ALERT_QUERY_LIMIT + 5 }, (_, index) => ({
      id: `alert-${index}`,
      created_at: `2026-07-24T12:${String(index).padStart(2, '0')}:00.000Z`,
      source: index % 2 === 0 ? 'stripe-webhook' : 'cron-process-payouts',
      severity: index % 3 === 0 ? 'error' : 'warn',
      title: `Alert ${index}`,
      detail: { email: 'private@example.com', payment_intent: 'pi_secret' },
      dedupe_key: 'private-dedupe-key',
      resolved_by: 'private-user-id',
    }));

    const summary = summarizeOperatorAlerts(rows);
    const serialized = JSON.stringify(summary);

    expect(summary.unresolvedCountInWindow).toBe(OPERATOR_ALERT_QUERY_LIMIT);
    expect(summary.isAtQueryLimit).toBe(true);
    expect(summary.recentAlerts).toHaveLength(OPERATOR_ALERT_RECENT_LIMIT);
    expect(summary.recentAlerts[0]).toEqual({
      id: 'alert-0',
      createdAt: '2026-07-24T12:00:00.000Z',
      source: 'stripe-webhook',
      severity: 'error',
      title: 'Alert 0',
    });
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('pi_secret');
    expect(serialized).not.toContain('private-dedupe-key');
    expect(serialized).not.toContain('private-user-id');
  });

  it('returns an honest empty window without claiming overall platform health', () => {
    expect(summarizeOperatorAlerts([])).toEqual({
      unresolvedCountInWindow: 0,
      isAtQueryLimit: false,
      bySeverity: { info: 0, warn: 0, error: 0 },
      bySource: {},
      recentAlerts: [],
    });
  });

  it('fails instead of returning a healthy-looking summary when the RLS query errors', async () => {
    const { client } = makeAlertClient([], { message: 'permission denied' });

    await expect(readOperatorAlertSummary(client)).rejects.toThrow(
      'Unable to read unresolved operator alerts'
    );
  });
});

describe('Operator Support system-health tool', () => {
  it('reads only the newest snapshot through the caller client with a fixed field allowlist', async () => {
    const { client, from, query } = makeHealthClient([]);

    await readOperatorHealthSummary(client, Date.parse('2026-07-24T12:00:00.000Z'));

    expect(from).toHaveBeenCalledWith('system_health_snapshots');
    expect(query.select).toHaveBeenCalledWith(OPERATOR_HEALTH_SELECT);
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(OPERATOR_HEALTH_SELECT).toBe(
      'id, created_at, source, overall_status, checks, run_duration_ms'
    );
  });

  it('routes the registered health tool through the caller-scoped health query', async () => {
    const { client, from } = makeHealthClient([]);

    await expect(executeOperatorTool('summarize_system_health', {}, client)).resolves.toMatchObject(
      {
        result: {
          snapshotAvailable: false,
          effectiveStatus: 'fail',
        },
      }
    );

    expect(from).toHaveBeenCalledWith('system_health_snapshots');
  });

  it('fails safe when the latest snapshot is stale', async () => {
    const { client } = makeHealthClient([
      {
        id: 'snapshot-1',
        created_at: '2026-07-23T08:00:00.000Z',
        source: 'cron-health-check',
        overall_status: 'ok',
        run_duration_ms: 1268,
        checks: [
          {
            key: 'background-jobs',
            label: 'Background jobs',
            status: 'ok',
            detail: '7 jobs healthy',
            checked_at: '2026-07-23T08:00:00.000Z',
            private_payload: 'must-not-leak',
          },
        ],
        private_payload: 'must-not-leak',
      },
    ]);

    const summary = await readOperatorHealthSummary(client, Date.parse('2026-07-24T12:00:00.000Z'));

    expect(summary).toMatchObject({
      snapshotAvailable: true,
      snapshotCreatedAt: '2026-07-23T08:00:00.000Z',
      source: 'cron-health-check',
      reportedStatus: 'ok',
      effectiveStatus: 'fail',
      isStale: true,
      staleAfterHours: 26,
      runDurationMs: 1268,
      checks: [
        {
          key: 'background-jobs',
          label: 'Background jobs',
          status: 'ok',
          detail: '7 jobs healthy',
          checkedAt: '2026-07-23T08:00:00.000Z',
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain('must-not-leak');
  });

  it('bounds and sanitizes health checks before returning them to the model', async () => {
    const checks = Array.from({ length: OPERATOR_HEALTH_CHECK_LIMIT + 3 }, (_, index) => ({
      key: `check-${index}`,
      label: `Check ${index}`,
      status: index === 0 ? 'unexpected' : 'ok',
      detail: `Detail ${index}`,
      checked_at: '2026-07-24T11:00:00.000Z',
      secret: 'private',
    }));
    const { client } = makeHealthClient([
      {
        id: 'snapshot-1',
        created_at: '2026-07-24T11:00:00.000Z',
        source: 'cron-health-check',
        overall_status: 'ok',
        run_duration_ms: -10,
        checks,
      },
    ]);

    const summary = await readOperatorHealthSummary(client, Date.parse('2026-07-24T12:00:00.000Z'));

    expect(summary.checks).toHaveLength(OPERATOR_HEALTH_CHECK_LIMIT);
    expect(summary.checks[0]?.status).toBe('unknown');
    expect(summary.checksPayloadValid).toBe(false);
    expect(summary.effectiveStatus).toBe('fail');
    expect(summary.runDurationMs).toBeNull();
    expect(JSON.stringify(summary)).not.toContain('private');
  });

  it('fails safe when a fresh snapshot has a malformed checks payload', async () => {
    const { client } = makeHealthClient([
      {
        id: 'snapshot-1',
        created_at: '2026-07-24T11:00:00.000Z',
        source: 'cron-health-check',
        overall_status: 'ok',
        run_duration_ms: 100,
        checks: { unexpected: 'object' },
      },
    ]);

    await expect(
      readOperatorHealthSummary(client, Date.parse('2026-07-24T12:00:00.000Z'))
    ).resolves.toMatchObject({
      snapshotAvailable: true,
      reportedStatus: 'ok',
      effectiveStatus: 'fail',
      checksPayloadValid: false,
      checks: [],
    });
  });

  it('fails safe when a fresh snapshot contains no configured checks', async () => {
    const { client } = makeHealthClient([
      {
        id: 'snapshot-1',
        created_at: '2026-07-24T11:00:00.000Z',
        source: 'cron-health-check',
        overall_status: 'ok',
        run_duration_ms: 100,
        checks: [],
      },
    ]);

    await expect(
      readOperatorHealthSummary(client, Date.parse('2026-07-24T12:00:00.000Z'))
    ).resolves.toMatchObject({
      snapshotAvailable: true,
      reportedStatus: 'ok',
      effectiveStatus: 'fail',
      checksPayloadValid: false,
      checks: [],
    });
  });

  it('uses the worst check status when it conflicts with the stored overall status', async () => {
    const { client } = makeHealthClient([
      {
        id: 'snapshot-1',
        created_at: '2026-07-24T11:00:00.000Z',
        source: 'cron-health-check',
        overall_status: 'ok',
        run_duration_ms: 100,
        checks: [
          {
            key: 'background-jobs',
            label: 'Background jobs',
            status: 'fail',
            detail: 'A configured job is overdue',
            checked_at: '2026-07-24T11:00:00.000Z',
          },
        ],
      },
    ]);

    await expect(
      readOperatorHealthSummary(client, Date.parse('2026-07-24T12:00:00.000Z'))
    ).resolves.toMatchObject({
      snapshotAvailable: true,
      reportedStatus: 'ok',
      effectiveStatus: 'fail',
      checksPayloadValid: true,
    });
  });

  it('uses failed checks beyond the returned detail cap when deriving effective status', async () => {
    const checks = Array.from({ length: OPERATOR_HEALTH_CHECK_LIMIT + 1 }, (_, index) => ({
      key: `check-${index}`,
      label: `Check ${index}`,
      status: index === OPERATOR_HEALTH_CHECK_LIMIT ? 'fail' : 'ok',
      detail: `Detail ${index}`,
      checked_at: '2026-07-24T11:00:00.000Z',
    }));
    const { client } = makeHealthClient([
      {
        id: 'snapshot-1',
        created_at: '2026-07-24T11:00:00.000Z',
        source: 'cron-health-check',
        overall_status: 'ok',
        run_duration_ms: 100,
        checks,
      },
    ]);

    const summary = await readOperatorHealthSummary(client, Date.parse('2026-07-24T12:00:00.000Z'));

    expect(summary.checks).toHaveLength(OPERATOR_HEALTH_CHECK_LIMIT);
    expect(summary.checksPayloadValid).toBe(true);
    expect(summary.reportedStatus).toBe('ok');
    expect(summary.effectiveStatus).toBe('fail');
  });

  it('reports a missing snapshot as a failed health signal instead of healthy', async () => {
    const { client } = makeHealthClient([]);

    await expect(
      readOperatorHealthSummary(client, Date.parse('2026-07-24T12:00:00.000Z'))
    ).resolves.toMatchObject({
      snapshotAvailable: false,
      reportedStatus: null,
      effectiveStatus: 'fail',
      isStale: false,
      checks: [],
    });
  });

  it('fails instead of returning a healthy-looking summary when the RLS query errors', async () => {
    const { client } = makeHealthClient([], { message: 'permission denied' });

    await expect(
      readOperatorHealthSummary(client, Date.parse('2026-07-24T12:00:00.000Z'))
    ).rejects.toThrow('Unable to read the system health snapshot');
  });
});
