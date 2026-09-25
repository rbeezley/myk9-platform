import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@/services/database/supabaseClient', () => ({ supabase: {} }));

import { ReplicatedJudgeAssignmentsTable } from '../ReplicatedJudgeAssignmentsTable';

// MYK9-775: judge assignments are hard-deleted, so without this opt-in a judge
// removed on the server stayed on every other device's replica forever.
describe('ReplicatedJudgeAssignmentsTable sync', () => {
  it('opts into stale-row cleanup after a full fetch', async () => {
    await new ReplicatedJudgeAssignmentsTable().sync();
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0]).toMatchObject({ cleanupStaleRowsOnFullSync: true });
  });
});
