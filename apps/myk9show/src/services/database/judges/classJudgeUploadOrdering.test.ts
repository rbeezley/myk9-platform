/**
 * MYK9-1327: a class judge change queues the assignment writes and writes the new judge onto the
 * LOCAL class row, with no class mutation. While those writes are undelivered every pull must keep
 * the local judge; once delivered, the server's judge wins. Real replica, real queue and real
 * MutationUploadRunner, the real `ReplicatedClassesTable.sync`; only the Supabase transport is
 * faked.
 */
import { REPLICATION_STORES, databaseManager } from '@myk9/replication';
import { describe, expect, it, vi } from 'vitest';
import { replicatedClassesTable } from '@/services/replication';
import { CLASS_ID, useOrderingHarness } from './classJudgeOrderingHarness';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/supabaseClient')>()),
  supabase: (await import('./classJudgeSupabaseBridge')).supabaseBridge,
}));

const MARKER = '_judgeAssignmentMutationIds';

describe('class judge upload ordering (MYK9-1327)', () => {
  const h = useOrderingHarness();

  it('keeps the new judge through a pull while its assignment is backed off, with no class mutation', async () => {
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations(); // assignment fails into backoff

    // No class UPDATE exists to upload and clean the row ahead of the assignment.
    expect((await h.pending()).filter(m => m.tableName === 'classes')).toEqual([]);
    expect(h.classPayloads).toEqual([]);
    expect(await h.classIsDirty()).toBe(false);

    await h.sync(); // the server still names the old judge
    expect(await h.localJudgeId()).toBe('judge-b');
    expect(await h.localClass()).toMatchObject({ judgeFirstName: 'Bob', judgeResolved: true });
  });

  it("lands the assignment on retry, then another secretary's later judge wins the next pull", async () => {
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations();

    h.transport = 'up';
    await h.upload();
    expect([...h.serverAssignments.values()]).toEqual(['judge-b']);
    expect(await h.pending()).toEqual([]);
    expect(h.classPayloads).toEqual([]);

    await h.sync(); // every related write is acknowledged: the server's judge stands
    expect(await h.localJudgeId()).toBe('judge-b');
    expect(await h.localClass()).not.toHaveProperty(MARKER);

    h.serverAssigns('judge-d');
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-d');
  });

  it('A to B to C ends on C through every pull and every partial upload order', async () => {
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations();
    await h.pick('judge-c', 'Cy');
    await h.manager.uploadPendingMutations();

    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-c');

    h.transport = 'up';
    await h.upload();
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-c');
    await h.upload();

    expect([...h.serverAssignments.values()]).toEqual(['judge-c']);
    expect(await h.pending()).toEqual([]);
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-c');
  });

  it('A to B to C ends on C when only the inserts are delayed and the deletes would overtake them', async () => {
    h.transport = 'insertsDown';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations();
    await h.pick('judge-c', 'Cy');
    await h.manager.uploadPendingMutations();
    expect(h.classPayloads).toEqual([]);
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-c');

    h.transport = 'up';
    await h.upload();
    await h.upload();
    await h.upload();

    expect([...h.serverAssignments.values()]).toEqual(['judge-c']);
    expect(await h.pending()).toEqual([]);
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-c');
  });

  it('keeps "no judge" through a pull while the removal is backed off', async () => {
    h.transport = 'down';
    await h.remove();
    await h.manager.uploadPendingMutations();

    expect(await h.localJudgeId()).toBeUndefined();
    await h.sync();
    expect(await h.localJudgeId()).toBeUndefined();

    h.transport = 'up';
    await h.upload();
    expect(h.serverAssignments.size).toBe(0);
    await h.sync();
    expect(await h.localJudgeId()).toBeUndefined();
  });

  it('persists the local judge and its marker: a fresh read of the stored row still has them', async () => {
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');

    const db = await databaseManager.getDatabase('test');
    const stored = (await db.get(REPLICATION_STORES.REPLICATED_TABLES, ['classes', CLASS_ID])) as {
      data: Record<string, unknown>;
    };
    const queued = (await h.pending()).filter(m => m.tableName === 'judge_assignments');
    expect(stored.data).toMatchObject({ judgeId: 'judge-b', judgeFirstName: 'Bob' });
    expect([...(stored.data[MARKER] as string[])].sort()).toEqual(queued.map(m => m.id).sort());
    expect((await replicatedClassesTable.getClassById(CLASS_ID))?.judgeId).toBe('judge-b');
  });

  it('never sends the marker to the server', async () => {
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');
    await replicatedClassesTable.updateClass(CLASS_ID, { entryFee: 20 });
    await h.manager.uploadPendingMutations();

    expect(h.classPayloads).toHaveLength(1);
    expect(Object.keys(h.classPayloads[0]!)).not.toContain(MARKER);
    expect(JSON.stringify(h.classPayloads)).not.toContain('judge');
  });
});
