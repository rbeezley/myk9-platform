import { beforeEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock('@myk9/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@myk9/replication')>();
  return {
    ...actual,
    syncReplicatedTable: vi.fn(async (_table: unknown, adapter: unknown) => {
      engine.calls.push(adapter);
      return { tableName: 'judge_assignments', success: true, operation: 'full-sync' };
    }),
  };
});

const db = vi.hoisted(() => ({
  pages: [] as unknown[][],
  cursors: [] as string[],
}));

vi.mock('@/services/database/supabaseClient', () => {
  const query = {
    select: () => query,
    gt: () => {
      db.cursors.push('first');
      return query;
    },
    or: (filter: string) => {
      db.cursors.push(filter);
      return query;
    },
    order: () => query,
    range: async () => ({ data: db.pages.shift() ?? [], error: null }),
  };
  return { supabase: { from: () => query } };
});

import {
  JUDGE_ASSIGNMENTS_PAGE_SIZE,
  ReplicatedJudgeAssignmentsTable,
} from '../ReplicatedJudgeAssignmentsTable';

// Module-scope state shared by both describes: reset it before every test, or
// a shuffled order leaks one test's captured sync calls and pages into another.
beforeEach(() => {
  engine.calls.length = 0;
  db.pages = [];
  db.cursors = [];
});

// MYK9-775: judge assignments are hard-deleted, so without this opt-in a judge
// removed on the server stayed on every other device's replica forever.
describe('ReplicatedJudgeAssignmentsTable sync', () => {
  it('opts into stale-row cleanup after a full fetch', async () => {
    await new ReplicatedJudgeAssignmentsTable().sync();
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0]).toMatchObject({ cleanupStaleRowsOnFullSync: true });
  });
});

// MYK9-776: PostgREST caps a response at max_rows. The cleanup only runs after
// a fetch that returned the whole server count, so the fetch must page.
describe('ReplicatedJudgeAssignmentsTable fetch', () => {
  it('pages by (updated_at, id) until a short page', async () => {
    const row = (i: number) => ({ id: `ja-${i}`, updated_at: '2026-09-25T00:00:00Z' });
    db.pages = [
      Array.from({ length: JUDGE_ASSIGNMENTS_PAGE_SIZE }, (_, i) => row(i)),
      [row(JUDGE_ASSIGNMENTS_PAGE_SIZE)],
    ];
    await new ReplicatedJudgeAssignmentsTable().sync();
    const adapter = engine.calls[0] as {
      fetchRemoteRows: (args: { since: number }) => Promise<unknown[]>;
    };

    const rows = await adapter.fetchRemoteRows({ since: 0 });

    expect(rows).toHaveLength(JUDGE_ASSIGNMENTS_PAGE_SIZE + 1);
    expect(db.cursors).toEqual([
      'first',
      `updated_at.gt.2026-09-25T00:00:00Z,and(updated_at.eq.2026-09-25T00:00:00Z,id.gt.ja-${JUDGE_ASSIGNMENTS_PAGE_SIZE - 1})`,
    ]);
  });
});
