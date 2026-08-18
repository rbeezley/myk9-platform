import { describe, it, expect } from 'vitest';
import {
  categorize,
  deriveTriage,
  filterTriage,
  summarizeAlertDetail,
  summarizeTriage,
} from './triageSelectors';
import type { HealthCheck } from '@/features/admin-system-health/systemHealthTypes';
import type { OperatorAlert } from '@/features/admin-system-health/operatorAlertsTypes';

const NOW = Date.parse('2026-08-01T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

const check = (over: Partial<HealthCheck> = {}): HealthCheck => ({
  key: 'background_jobs',
  label: 'Background jobs',
  status: 'fail',
  detail: '1 of 8 failing',
  checkedAt: hoursAgo(1),
  verification: 'proven',
  ...over,
});

const alert = (over: Partial<OperatorAlert> = {}): OperatorAlert => ({
  id: 'a1',
  createdAt: hoursAgo(2),
  source: 'resend-webhook',
  severity: 'error',
  title: 'Password reset email bounced',
  detail: null,
  dedupeKey: null,
  resolvedAt: null,
  resolvedBy: null,
  ...over,
});

describe('categorize', () => {
  it('groups by why you would act, not by emitting system', () => {
    expect(categorize('payout_cron nightly payout job')).toBe('money');
    expect(categorize('entry close deadline passing')).toBe('deadline');
    expect(categorize('ringside conflicts')).toBe('service');
  });

  it('defaults to service rather than guessing money', () => {
    expect(categorize('something entirely unfamiliar')).toBe('service');
  });
});

describe('deriveTriage', () => {
  it('excludes passing checks and keeps everything else', () => {
    const items = deriveTriage(
      [check({ key: 'a', status: 'ok' }), check({ key: 'b', status: 'fail' })],
      [],
      NOW
    );
    expect(items.map(i => i.id)).toEqual(['check:b']);
  });

  it('a failing money check is Critical; a failing service check is High', () => {
    const [money] = deriveTriage(
      [check({ key: 'payout_ledger', label: 'Payout ledger' })],
      [],
      NOW
    );
    const [service] = deriveTriage([check({ key: 'ringside_conflicts' })], [], NOW);
    expect(money.severity).toBe('Critical');
    expect(money.category).toBe('money');
    expect(service.severity).toBe('High');
  });

  it('an unprovable amber check is Low — a coverage gap, not an incident', () => {
    const [item] = deriveTriage([check({ status: 'warn', verification: 'unprovable' })], [], NOW);
    expect(item.severity).toBe('Low');
  });

  it('a proven amber check outranks an unprovable one', () => {
    const items = deriveTriage(
      [
        check({ key: 'unprovable', status: 'warn', verification: 'unprovable' }),
        check({ key: 'degraded', status: 'warn', verification: 'proven' }),
      ],
      [],
      NOW
    );
    expect(items.map(i => i.id)).toEqual(['check:degraded', 'check:unprovable']);
  });

  it('sorts by severity, then oldest first — never alphabetically', () => {
    const items = deriveTriage(
      [
        check({ key: 'zebra', status: 'fail', checkedAt: hoursAgo(1) }),
        check({ key: 'apple', status: 'fail', checkedAt: hoursAgo(9) }),
        check({ key: 'middle', status: 'warn', verification: 'proven' }),
      ],
      [],
      NOW
    );
    // Both High, so the 9-hour-old one leads; the Medium sinks below both.
    expect(items.map(i => i.id)).toEqual(['check:apple', 'check:zebra', 'check:middle']);
  });

  it('maps alert severity and never includes a resolved alert', () => {
    const items = deriveTriage(
      [],
      [alert({ id: 'open' }), alert({ id: 'done', resolvedAt: hoursAgo(1) })],
      NOW
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('alert:open');
    expect(items[0].severity).toBe('High');
  });

  it('carries a real destination for every row', () => {
    const items = deriveTriage([check({ key: 'payout_cron' })], [alert()], NOW);
    for (const item of items) {
      expect(item.action.href).toMatch(/^\/admin\//);
      expect(item.action.label.length).toBeGreaterThan(0);
    }
  });

  it('does not invent an owner', () => {
    const [item] = deriveTriage([check()], [], NOW);
    expect(item).not.toHaveProperty('owner');
  });

  it('is empty, not broken, when nothing is wrong', () => {
    expect(deriveTriage([check({ status: 'ok' })], [], NOW)).toEqual([]);
  });
});

// Codex review of PR #1566: the queue iterated `latest?.checks`, so a missing,
// stale or unreadable health run produced an EMPTY queue — "nothing is waiting
// on you" at the moment the platform cannot say whether anything is wrong.
describe('deriveTriage — an unknown source is not an all-clear', () => {
  const passing = [check({ status: 'ok' })];

  it('an unreadable health query is Critical, not silence', () => {
    const items = deriveTriage(passing, [], NOW, { healthUnavailable: true });
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('Critical');
    expect(items[0].detail).toMatch(/not an all-clear/i);
  });

  it('a health run that never happened is Critical', () => {
    const items = deriveTriage([], [], NOW, { healthMissing: true });
    expect(items[0].id).toBe('source:health-missing');
    expect(items[0].severity).toBe('Critical');
  });

  it('a stale run is High and carries the run time as its age', () => {
    const items = deriveTriage(passing, [], NOW, {
      healthStale: true,
      lastRunAt: hoursAgo(30),
    });
    expect(items[0].id).toBe('source:health-stale');
    expect(items[0].severity).toBe('High');
    expect(items[0].openedAt).toBe(hoursAgo(30));
  });

  it('an unreadable alerts query is its own row', () => {
    const items = deriveTriage(passing, [], NOW, { alertsUnavailable: true });
    expect(items.map(i => i.id)).toContain('source:alerts-unavailable');
  });

  it('reports the query failure rather than also claiming the run is missing', () => {
    const items = deriveTriage([], [], NOW, { healthUnavailable: true, healthMissing: true });
    expect(items.map(i => i.id)).toEqual(['source:health-unavailable']);
  });

  it('adds nothing when every source is healthy', () => {
    expect(
      deriveTriage(passing, [], NOW, {
        healthUnavailable: false,
        healthMissing: false,
        healthStale: false,
        alertsUnavailable: false,
      })
    ).toEqual([]);
  });
});

describe('summarizeTriage', () => {
  it('the total equals the rows, so one counter serves every badge', () => {
    const items = deriveTriage(
      [check({ key: 'payout_ledger' }), check({ key: 'ringside_conflicts' })],
      [alert()],
      NOW
    );
    const summary = summarizeTriage(items);
    expect(summary.total).toBe(items.length);
    expect(summary.money + summary.service + summary.deadline).toBe(summary.total);
  });

  it('each filter returns exactly what its count promised', () => {
    const items = deriveTriage([check({ key: 'payout_ledger' }), check()], [alert()], NOW);
    const summary = summarizeTriage(items);
    expect(filterTriage(items, 'money')).toHaveLength(summary.money);
    expect(filterTriage(items, 'service')).toHaveLength(summary.service);
    expect(filterTriage(items, 'all')).toHaveLength(summary.total);
  });
});

describe('summarizeAlertDetail', () => {
  it('renders scalar context and skips nested objects', () => {
    expect(summarizeAlertDetail({ show: 'Heartland', amount: 4180, meta: { a: 1 } })).toBe(
      'show: Heartland · amount: 4180'
    );
  });

  it('says so plainly when there is nothing to show', () => {
    expect(summarizeAlertDetail(null)).toBe('No further detail recorded.');
    expect(summarizeAlertDetail({ nested: { only: true } })).toBe('No further detail recorded.');
  });
});
