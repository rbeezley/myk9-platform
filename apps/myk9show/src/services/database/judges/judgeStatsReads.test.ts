// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const rowsHolder = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock('../_shared/untyped-from', () => {
  const result = () => Promise.resolve({ data: rowsHolder.rows, error: null });
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'lte']) builder[m] = () => builder;
  builder.order = result;
  builder.then = (res: (v: unknown) => unknown) => result().then(res);
  return { untypedFrom: () => builder };
});

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {},
  replicatedJudgeAssignmentsTable: {},
}));

vi.mock('../supabaseClient', () => ({
  supabase: {},
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getJudgeStats, getJudgeUpcomingAssignments } from './reads';

const FUTURE = '2999-01-02';
const liveShow = { name: 'Live', start_date: '2999-01-01', end_date: FUTURE, organization: 'AKC' };

function row(id: string, over: Record<string, unknown>) {
  return {
    id,
    person_id: 'p1',
    show_id: `show-${id}`,
    trial_id: null,
    class_id: null,
    status: 'confirmed',
    invited_at: null,
    confirmed_at: null,
    shows: { ...liveShow, deleted_at: null },
    classes: null,
    ...over,
  };
}

describe('judge stats ignore deleted shows and classes', () => {
  beforeEach(() => {
    rowsHolder.rows = [
      row('live', {}),
      row('deleted-show', { shows: null }),
      row('deleted-show-visible', { shows: { ...liveShow, deleted_at: '2026-10-01' } }),
      row('deleted-class', { class_id: 'c1', classes: null }),
      row('class-soft-deleted', { class_id: 'c2', classes: { deleted_at: '2026-10-01' } }),
      row('live-class', { class_id: 'c3', classes: { deleted_at: null } }),
    ];
  });

  it('upcoming drops rows whose show embed is null or deleted, or whose class is deleted', async () => {
    const result = await getJudgeUpcomingAssignments('p1');
    expect(result.map(a => a.id).sort()).toEqual(['live', 'live-class']);
  });

  it('upcoming never keeps a row with no readable end date', async () => {
    rowsHolder.rows = [row('no-end', { shows: { name: 'X', end_date: null, deleted_at: null } })];
    expect(await getJudgeUpcomingAssignments('p1')).toEqual([]);
  });

  it('headline counts exclude deleted shows and classes', async () => {
    const stats = await getJudgeStats('p1');
    expect(stats.classesJudged).toBe(2);
    expect(stats.showsJudged).toBe(2);
    expect(stats.statusBreakdown).toEqual({ confirmed: 2 });
  });
});

describe('upcoming assignments use the local calendar day, not the UTC date', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
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

  const showEnding = (end: string) => ({
    name: 'S',
    start_date: '2026-11-07',
    end_date: end,
    organization: 'AKC',
    deleted_at: null,
  });

  it('keeps a show on its final local evening even though UTC is already tomorrow', async () => {
    rowsHolder.rows = [row('last-day', { shows: showEnding('2026-11-09') })];
    const result = await getJudgeUpcomingAssignments('p1');
    expect(result.map(a => a.id)).toEqual(['last-day']);
  });

  it('drops a show that ended the previous local day', async () => {
    rowsHolder.rows = [row('yesterday', { shows: showEnding('2026-11-08') })];
    expect(await getJudgeUpcomingAssignments('p1')).toEqual([]);
  });
});
