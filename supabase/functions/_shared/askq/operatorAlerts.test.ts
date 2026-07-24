import { describe, expect, it, vi } from 'vitest';

import {
  OPERATOR_ALERT_QUERY_LIMIT,
  OPERATOR_ALERT_RECENT_LIMIT,
  OPERATOR_ALERT_SELECT,
  readOperatorAlertSummary,
  summarizeOperatorAlerts,
} from './operatorAlerts.ts';
import { OPERATOR_TOOLS } from './operatorToolDefinitions.ts';

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

describe('Operator Support alert tool', () => {
  it('advertises exactly one read-only operator tool', () => {
    expect(OPERATOR_TOOLS.map(tool => tool.name)).toEqual(['summarize_operator_alerts']);
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
