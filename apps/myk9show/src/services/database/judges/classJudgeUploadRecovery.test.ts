/**
 * MYK9-1327: what a class does while its judge assignment is stuck, and how it recovers. A pull
 * keeps the local judge while the assignment is pending or parked in the failed store; Retry
 * lands it; Discard hands the judge back to the server. A LATER edit to the same class must never
 * be reverted by the judge change, including through the OCC rebase a landing assignment forces.
 */
import { describe, expect, it, vi } from 'vitest';
import { replicatedClassesTable } from '@/services/replication';
import { replicatedToTrialClass, trialClassToReplicated } from '@/store/trial-store-helpers';
import { CLASS_ID, useOrderingHarness } from './classJudgeOrderingHarness';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/supabaseClient')>()),
  supabase: (await import('./classJudgeSupabaseBridge')).supabaseBridge,
}));

const MARKER = '_judgeAssignmentMutationIds';

describe('class judge recovery (MYK9-1327)', () => {
  const h = useOrderingHarness();

  it('keeps a later edit AND the new judge when the landing assignment bumps the class version (OCC rebase)', async () => {
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations(); // assignment backed off
    await h.sync(); // a pull while it is backed off
    expect(await h.localJudgeId()).toBe('judge-b');

    await replicatedClassesTable.updateClass(CLASS_ID, { entryFee: 20 }); // dirty, token v3
    h.transport = 'up';
    await h.upload(); // assignment lands (trigger: v4), then the fee UPDATE is rejected for v3
    await h.upload(); // rebased, uploads

    expect(h.serverClass.entry_fee).toBe(20);
    expect([...h.serverAssignments.values()]).toEqual(['judge-b']);
    expect(h.classPayloads.every(payload => !JSON.stringify(payload).includes('judge'))).toBe(true);
    expect(await h.pending()).toEqual([]);
    await h.sync();
    expect(await h.localClass()).toMatchObject({ entryFee: 20, judgeId: 'judge-b' });
  });

  it('keeps the new judge when a rebase happens while the assignment is STILL undelivered', async () => {
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations();

    await replicatedClassesTable.updateClass(CLASS_ID, { entryFee: 20 });
    h.serverVersion += 1; // another device touched the class: the fee UPDATE's token is stale
    await h.upload(); // fee UPDATE rejected, re-fetched (old server judge), rebased; assignment down
    expect(await h.localJudgeId()).toBe('judge-b');

    h.transport = 'up';
    await h.upload();
    await h.upload();
    expect(h.serverClass.entry_fee).toBe(20);
    expect([...h.serverAssignments.values()]).toEqual(['judge-b']);
    expect(await h.localClass()).toMatchObject({ entryFee: 20, judgeId: 'judge-b' });
  });

  it('keeps the new judge through a pull of a class that is dirty for another edit, then lets the server judge in', async () => {
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations();
    await replicatedClassesTable.updateClass(CLASS_ID, { entryFee: 20 }); // the row is now dirty
    expect(await h.classIsDirty()).toBe(true);

    await h.sync(); // the dirty branch of the sync, with the assignment undelivered
    expect(await h.localJudgeId()).toBe('judge-b');
    expect(await h.localClass()).toMatchObject({ entryFee: 20 });

    h.transport = 'up';
    await h.upload();
    await h.upload();
    h.serverAssigns('judge-d'); // another secretary, after every related write is acknowledged
    await h.upload();
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-d');
    expect(await h.localClass()).not.toHaveProperty(MARKER);
    expect(h.serverClass.entry_fee).toBe(20);
  });

  it('applies the same rule when a conflicted class takes the server row', async () => {
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations();
    const local = (await h.localClass())!;
    const server = { ...local, entryFee: 30, judgeId: 'judge-a', judgeFirstName: 'Ann' };
    delete server._judgeAssignmentMutationIds;

    await replicatedClassesTable.replaceFromRemote(CLASS_ID, server, 4); // "take theirs"
    expect(await h.localClass()).toMatchObject({ entryFee: 30, judgeId: 'judge-b' });

    for (const mutation of await h.pending())
      await h.manager.discardPendingMutationsForRow(mutation.tableName, mutation.rowId);
    await replicatedClassesTable.replaceFromRemote(CLASS_ID, server, 5); // nothing left to deliver
    expect(await h.localClass()).toMatchObject({ entryFee: 30, judgeId: 'judge-a' });
  });

  it('keeps ownership through a full-row class edit built from a stale copy (trialStore path)', async () => {
    const stale = replicatedToTrialClass((await h.localClass())!); // read before the pick: judge-a
    h.transport = 'down';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations();

    // updateTrialClass: a wholesale row from the in-memory class, no marker, old judge.
    await replicatedClassesTable.set(
      CLASS_ID,
      trialClassToReplicated({ ...stale, startTime: '09:00' }, 'trial-1'),
      true
    );
    await h.sync(); // the server still names the old judge

    expect(await h.localJudgeId()).toBe('judge-b');
    expect(await h.localClass()).toMatchObject({ judgeFirstName: 'Bob', startTime: '09:00' });
    expect((await h.localClass())?.[MARKER]).toHaveLength(2);
  });

  it('keeps the new judge through a pull while its assignment is parked, and Retry lands it', async () => {
    h.transport = 'denied';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations();

    const parked = await h.failed();
    expect(parked.length).toBeGreaterThan(0); // parked for Retry / Discard
    expect(await h.pending()).toEqual([]);
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-b');
    expect((await h.localClass())?.[MARKER]).toEqual(expect.arrayContaining(parked.map(m => m.id)));

    h.transport = 'up';
    for (const mutation of parked) await h.manager.retryFailedMutation(mutation.id);
    await h.upload();
    await h.upload();

    expect(await h.failed()).toEqual([]);
    expect([...h.serverAssignments.values()]).toEqual(['judge-b']);
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-b');
    expect(await h.localClass()).not.toHaveProperty(MARKER);
  });

  it("hands the judge back to the server on Discard: the next pull shows the server's judge and clears the marker", async () => {
    h.transport = 'denied';
    await h.pick('judge-b', 'Bob');
    await h.manager.uploadPendingMutations();
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-b'); // parked, still owned

    h.transport = 'up';
    for (const mutation of await h.failed()) await h.manager.discardFailedMutation(mutation.id);
    await h.upload();

    expect(await h.failed()).toEqual([]);
    expect([...h.serverAssignments.values()]).toEqual(['judge-a']); // nothing was applied
    await h.sync();
    expect(await h.localJudgeId()).toBe('judge-a');
    expect(await h.localClass()).not.toHaveProperty(MARKER);
  });
});
