/**
 * MYK9-1327: what the class does while its judge assignment is stuck, and how it recovers.
 * A parked (permanently failed) assignment keeps the pick visible and recoverable, Retry
 * delivers it, Discard hands the judge back to the server; A to B to C ends on C however the
 * uploads are interleaved. Real replicas, queue, upload runner and syncs (classJudgeHarness).
 */
import { describe, expect, it, vi } from 'vitest';
import { replicatedClassesTable, replicatedJudgeAssignmentsTable } from '..';
import { replicatedClassJudgeClearsTable } from '../ReplicatedClassJudgeClearsTable';
import { CLASS_ID, TRIAL_ID, useClassJudgeHarness } from './classJudgeHarness';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/supabaseClient')>()),
  supabase: (await import('./classJudgeSupabaseBridge')).supabaseBridge,
}));

describe('class judge recovery (MYK9-1327)', () => {
  const h = useClassJudgeHarness();

  const localAssignmentIds = async () =>
    (await replicatedJudgeAssignmentsTable.getByClassOrThrow(CLASS_ID)).map(row => row.id).sort();

  /** Run passes until nothing is queued. */
  const drain = async () => {
    for (let pass = 0; pass < 6 && (await h.pending()).length > 0; pass += 1) await h.retryNow();
    await h.retryNow();
  };

  describe('a permanently refused assignment (parked)', () => {
    const park = async () => {
      h.transport = 'denied';
      await h.pick('judge-b');
      await h.pass();
    };

    it('keeps the pick visible, and recoverable, through pulls', async () => {
      await park();

      const failed = await h.failed();
      expect(failed.map(m => m.operation).sort()).toEqual(['DELETE', 'INSERT']);
      expect(await h.pending()).toEqual([]);
      expect([...h.serverAssignments.values()]).toEqual(['judge-a']);

      await h.syncClasses();
      expect(await h.storedJudgeId()).toBe('judge-a');
      expect(await h.shownJudgeId()).toBe('judge-b');
      expect(await h.shownByIdJudgeId()).toBe('judge-b');
    });

    it('Retry delivers the pick and the class converges on it', async () => {
      await park();
      h.transport = 'up';
      for (const mutation of await h.failed()) await h.manager.retryFailedMutation(mutation.id);
      await h.retryNow();

      expect([...h.serverAssignments.values()]).toEqual(['judge-b']);
      await h.catchUp();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-b'));
      expect(await h.shownJudgeId()).toBe('judge-b');
    });

    it('Discard hands the judge back: the added row goes and the removed row returns', async () => {
      await park();
      h.transport = 'up';
      const failed = await h.failed();
      const insert = failed.find(m => m.operation === 'INSERT')!;
      const remove = failed.find(m => m.operation === 'DELETE')!;

      await h.manager.discardFailedMutation(insert.id);
      await h.manager.discardFailedMutation(remove.id);

      await vi.waitFor(async () => expect(await localAssignmentIds()).toEqual(['ja-judge-a']));
      expect(await h.failed()).toEqual([]);
      expect(await h.shownJudgeId()).toBe('judge-a');
      expect(await h.shownByIdJudgeId()).toBe('judge-a');
      expect([...h.serverAssignments.values()]).toEqual(['judge-a']);
    });

    it('Discarding only the refused add keeps the removal visible as "no judge"', async () => {
      await park();
      const insert = (await h.failed()).find(m => m.operation === 'INSERT')!;

      await h.manager.discardFailedMutation(insert.id);

      expect(await localAssignmentIds()).toEqual([]);
      expect((await h.shownClass())?.judgeId).toBeUndefined();
    });
  });

  describe('clearing the judge', () => {
    it('keeps showing no judge when a sync downloads the row whose delete is still waiting', async () => {
      h.transport = 'down';
      await h.clear();
      await h.pass();

      h.touchClass(); // the server row changes, so the incremental assignment sync returns it
      await h.syncAssignments();
      expect(await localAssignmentIds()).toEqual(['ja-judge-a']); // downloaded again
      await h.syncClasses();

      expect((await h.shownClass())?.judgeId).toBeUndefined();
      expect((await replicatedClassesTable.getClassById(CLASS_ID))?.judgeId).toBeUndefined();

      h.transport = 'up';
      await drain();
      expect(h.serverAssignments.size).toBe(0);
      await h.catchUp();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBeUndefined());
      expect((await h.shownClass())?.judgeId).toBeUndefined();

      h.serverAssigns('judge-d'); // after the delete is acknowledged the server's word stands
      await h.syncAssignments();
      await h.syncClasses();
      expect(await h.shownJudgeId()).toBe('judge-d');
    });

    it('shows no judge after the delete is acknowledged and the device reloads, until the class is pulled', async () => {
      await h.clear();
      await h.pass();
      expect(await h.pending()).toEqual([]);
      expect(h.serverAssignments.size).toBe(0);
      await new Promise(resolve => setTimeout(resolve, 30)); // the acknowledgement stamps the tombstone

      expect(await h.storedJudgeId()).toBe('judge-a'); // the class has not been pulled
      const reloaded = h.reloaded();
      expect((await reloaded.getByTrialOrThrow(TRIAL_ID))[0]?.judgeId).toBeUndefined();
      expect((await reloaded.getClassById(CLASS_ID))?.judgeId).toBeUndefined();
      expect(await replicatedClassJudgeClearsTable.getAll()).toHaveLength(1);

      await h.catchUp(); // the class row now carries the delete's server time
      expect(await h.storedJudgeId()).toBeUndefined();
      expect((await reloaded.getByTrialOrThrow(TRIAL_ID))[0]?.judgeId).toBeUndefined();
      await vi.waitFor(async () =>
        expect(await replicatedClassJudgeClearsTable.getAll()).toEqual([])
      );

      h.serverAssigns('judge-d'); // and the server's word stands afterwards
      await h.catchUp();
      expect((await reloaded.getByTrialOrThrow(TRIAL_ID))[0]?.judgeId).toBe('judge-d');
    });

    it('shows no judge while the delete is undelivered, through pulls, then keeps none', async () => {
      h.transport = 'down';
      await h.clear();
      await h.pass();

      expect((await h.shownClass())?.judgeId).toBeUndefined();
      expect((await h.shownClass())?.judgeName).toBeUndefined();
      await h.syncClasses(); // the server still names judge A
      expect(await h.storedJudgeId()).toBe('judge-a');
      expect((await h.shownClass())?.judgeId).toBeUndefined();
      expect((await replicatedClassesTable.getClassById(CLASS_ID))?.judgeId).toBeUndefined();

      h.transport = 'up';
      await drain();
      expect(h.serverAssignments.size).toBe(0);
      await h.catchUp();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBeUndefined());
      expect((await h.shownClass())?.judgeId).toBeUndefined();
    });
  });

  describe('A to B to C', () => {
    it('ends on C with every write backed off, through pulls', async () => {
      h.transport = 'down';
      await h.pick('judge-b');
      await h.pass();
      await h.pick('judge-c');
      await h.pass();

      await h.syncClasses();
      expect(await h.shownJudgeId()).toBe('judge-c');

      h.transport = 'up';
      await drain();

      expect([...h.serverAssignments.values()]).toEqual(['judge-c']);
      expect(await h.pending()).toEqual([]);
      await h.catchUp();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-c'));
      expect(await h.shownJudgeId()).toBe('judge-c');
    });

    it('ends on C when the inserts are delayed and the deletes could overtake them', async () => {
      h.transport = 'insertsDown';
      await h.pick('judge-b');
      await h.pass();
      await h.pick('judge-c');
      await h.pass();
      expect(await h.shownJudgeId()).toBe('judge-c');
      await h.syncClasses();
      expect(await h.shownJudgeId()).toBe('judge-c');

      h.transport = 'up';
      await drain();

      // B's delete never ran ahead of B's insert (that would leave B on the server).
      expect([...h.serverAssignments.values()]).toEqual(['judge-c']);
      await h.catchUp();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-c'));
      expect(await h.shownJudgeId()).toBe('judge-c');
    });

    it('ends on C when the inserts are delivered and the deletes are delayed', async () => {
      h.transport = 'deletesDown';
      await h.pick('judge-b');
      await h.pass();
      await h.pick('judge-c');
      await h.pass();
      expect(await h.shownJudgeId()).toBe('judge-c');
      await h.syncClasses();
      expect(await h.shownJudgeId()).toBe('judge-c');

      h.transport = 'up';
      await drain();

      expect([...h.serverAssignments.values()]).toEqual(['judge-c']);
      await h.catchUp();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-c'));
      expect(await h.shownJudgeId()).toBe('judge-c');
    });

    it('ends on C when B was refused for good and C was picked after', async () => {
      h.transport = 'denied';
      await h.pick('judge-b');
      await h.pass(); // B's add and A's removal are both parked
      h.transport = 'up';
      await h.pick('judge-c');
      await h.pass();
      expect(await h.shownJudgeId()).toBe('judge-c');
      await h.syncClasses();
      expect(await h.shownJudgeId()).toBe('judge-c');

      // The parked work stays recoverable: retry A's removal, discard B's refused add.
      const parked = await h.failed();
      await h.manager.discardFailedMutation(parked.find(m => m.operation === 'INSERT')!.id);
      await h.manager.retryFailedMutation(parked.find(m => m.operation === 'DELETE')!.id);
      await drain();

      expect([...h.serverAssignments.values()]).toEqual(['judge-c']);
      expect(await h.failed()).toEqual([]);
      await h.catchUp();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-c'));
      expect(await h.shownJudgeId()).toBe('judge-c');
    });
  });

  it('reassigning in place shows the new judge, never the previous judge name', async () => {
    h.transport = 'down';
    await h.reassign('judge-a', 'judge-b');
    await h.pass();

    const shown = await h.shownClass();
    expect(shown?.judgeId).toBe('judge-b');
    expect(shown?.judgeName).not.toBe('Ann Judge');
    await h.syncClasses();
    expect(await h.shownJudgeId()).toBe('judge-b');

    h.transport = 'up';
    await drain();
    expect([...h.serverAssignments.values()]).toEqual(['judge-b']);
    await h.catchUp();
    await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-b'));
  });

  it('keeps a later class edit and the picked judge when both are delivered together', async () => {
    h.transport = 'down';
    await h.pick('judge-b');
    await h.pass();
    await replicatedClassesTable.updateClass(CLASS_ID, { entryFee: 25 });

    h.transport = 'up';
    await drain();

    await h.catchUp();
    await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-b'));
    expect((await replicatedClassesTable.get(CLASS_ID))?.entryFee).toBe(25);
    expect(await h.shownJudgeId()).toBe('judge-b');
  });
});
