// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

// Records every filter call; the chain is awaitable and resolves to an empty result.
const rec = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = [];
  const rows: { data: unknown[] } = { data: [] };
  const makeChain = () => {
    const result = { data: rows.data, count: 0, error: null };
    const chain: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    for (const method of ['select', 'eq', 'is', 'not', 'gte', 'lte', 'or', 'order', 'limit']) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      };
    }
    return chain;
  };
  return { calls, rows, makeChain };
});

vi.mock('./supabaseClient', () => ({
  supabase: { from: () => rec.makeChain() },
  logQuery: vi.fn(),
  createDatabaseError,
}));
vi.mock('./_shared/untyped-from', () => ({ untypedFrom: () => rec.makeChain() }));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {},
  replicatedJudgeAssignmentsTable: {},
}));

import { postgrestGetUpcomingShows } from './shows/reads.postgrest';
import { countUpcomingClubShows } from './clubs/reads';
import {
  getJudgeQualificationAlerts,
  getJudgeQualificationSummary,
  getJudgeQualificationsByJudgeId,
  getJudgeRosterSummary,
} from './judges/reads';

const filterValues = (method: string, column: string) =>
  rec.calls.filter(([m, a]) => m === method && a[0] === column).map(([, a]) => a[1]);

describe('server reads use the local calendar day, not the UTC date', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    rec.calls.length = 0;
    rec.rows.data = [];
    process.env.TZ = 'America/Chicago';
    vi.useFakeTimers({ toFake: ['Date'] });
    // 2026-11-09 19:00 in Chicago (CST) is already 2026-11-10 in UTC.
    vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('upcoming shows keep a show that starts on the local day', async () => {
    await postgrestGetUpcomingShows(5);
    expect(filterValues('gte', 'start_date')).toEqual(['2026-11-09']);
  });

  it('countUpcomingClubShows counts a show ending on the local day', async () => {
    await countUpcomingClubShows('club-1');
    expect(filterValues('gte', 'end_date')).toEqual(['2026-11-09']);
  });

  it('roster summary expiry window runs from the local day', async () => {
    await getJudgeRosterSummary();
    expect(filterValues('gte', 'expiration_date')).toEqual(['2026-11-09']);
    expect(filterValues('lte', 'expiration_date')).toEqual(['2026-12-09']);
  });

  it('expiring_within_days is measured from the local day', async () => {
    await getJudgeQualificationsByJudgeId('j1', { expiring_within_days: 10 });
    expect(filterValues('lte', 'expiration_date')).toEqual(['2026-11-19']);
  });

  it('qualification alerts window is anchored on the local day', async () => {
    await getJudgeQualificationAlerts(30);
    const or = rec.calls.find(([m]) => m === 'or')?.[1][0] as string;
    expect(or).toContain('expiration_date.lte.2026-12-09');
    expect(or).toContain('expiration_date.gte.2026-08-11');
  });

  it('qualification summary counts one expiring on the local day as expiring, not expired', async () => {
    rec.rows.data = [{ id: 'q1', is_active: true, expiration_date: '2026-11-09' }];
    const summary = await getJudgeQualificationSummary('j1');
    expect(summary.expired_qualifications).toBe(0);
    expect(summary.expiring_soon).toBe(1);
  });
});
