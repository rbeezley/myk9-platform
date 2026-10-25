/**
 * MYK9-1327: what the class does while its judge assignment is stuck, and how it recovers.
 * A parked (permanently failed) assignment keeps the pick visible and recoverable, Retry
 * delivers it, Discard hands the judge back to the server; A to B to C ends on C however the
 * uploads are interleaved. Real replicas, queue, upload runner and syncs (classJudgeHarness).
 */
import { describe, expect, it, vi } from 'vitest';
import { replicatedClassesTable, replicatedJudgeAssignmentsTable } from '..';
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import { CLASS_ID, useClassJudgeHarness } from './classJudgeHarness';

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

  /** Run passes until nothing is queued, letting each pass's acknowledgement refresh land. */
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
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBeUndefined());
      expect((await h.shownClass())?.judgeId).toBeUndefined();

      h.serverAssigns('judge-d'); // after the delete is acknowledged the server's word stands
      await h.syncAssignments();
      await h.syncClasses();
      expect(await h.shownJudgeId()).toBe('judge-d');
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
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-c'));
      expect(await h.shownJudgeId()).toBe('judge-c');
    });
  });

  describe('an unrelated class edit lands while the acknowledgement refresh is running', () => {
    it('keeps the picked judge until the class row itself carries it', async () => {
      h.transport = 'down';
      await h.pick('judge-b');
      await h.pass();

      let release!: () => void;
      h.classRefreshGate = new Promise<void>(resolve => (release = resolve));
      h.transport = 'up';
      await h.retryNow(); // delivered; the refresh waits on the gate

      // An edit to the same class lands now and stays unsent (its upload is held back).
      await replicatedClassesTable.updateClass(CLASS_ID, { entryFee: 30 });
      const db = await databaseManager.getDatabase('test');
      for (const m of await h.manager.getPendingMutationsForTable('classes')) {
        await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
          ...m,
          nextRetryAt: Date.now() + 3_600_000,
        });
      }

      h.classRefreshGate = null;
      release();
      await new Promise(resolve => setTimeout(resolve, 50)); // the refresh skips the dirty row

      expect(await h.storedJudgeId()).toBe('judge-a');
      expect(await h.shownJudgeId()).toBe('judge-b');
      expect(await h.shownByIdJudgeId()).toBe('judge-b');

      // The edit is delivered and the class is pulled: the server row carries B and the wait ends.
      for (const m of await h.manager.getPendingMutationsForTable('classes')) {
        await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...m, nextRetryAt: undefined });
      }
      await h.pass();
      await h.syncClasses();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-b'));
      expect(await h.shownJudgeId()).toBe('judge-b');
      expect(h.settlingNow().size).toBe(0);
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
    await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-b'));
  });

  it('keeps a later class edit and the picked judge when both are delivered together', async () => {
    h.transport = 'down';
    await h.pick('judge-b');
    await h.pass();
    await replicatedClassesTable.updateClass(CLASS_ID, { entryFee: 25 });

    h.transport = 'up';
    await drain();

    await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-b'));
    expect((await replicatedClassesTable.get(CLASS_ID))?.entryFee).toBe(25);
    expect(await h.shownJudgeId()).toBe('judge-b');
  });
});
