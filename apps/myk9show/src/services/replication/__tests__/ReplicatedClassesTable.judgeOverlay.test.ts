/**
 * MYK9-1327: a secretary's class judge pick is ONE queued judge_assignments write; the class
 * row keeps what the server said and readers see the picked judge while that write is
 * undelivered. Real replicas, real queue and upload runner, real incremental syncs and class
 * enrichment: only the network transport is faked (classJudgeHarness).
 */
import { describe, expect, it, vi } from 'vitest';
import { replicatedClassesTable, replicatedJudgeAssignmentsTable } from '..';
import { CLASS_ID, useClassJudgeHarness } from './classJudgeHarness';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/database/supabaseClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/supabaseClient')>()),
  supabase: (await import('./classJudgeSupabaseBridge')).supabaseBridge,
}));

describe('class judge while the assignment is undelivered (MYK9-1327)', () => {
  const h = useClassJudgeHarness();

  it('starts from the server judge, stored on the class row', async () => {
    expect(await h.shownJudgeId()).toBe('judge-a');
    expect(await h.storedJudgeId()).toBe('judge-a');
    expect(await h.shownClass()).toMatchObject({ judgeName: 'Ann Judge', judgeResolved: true });
  });

  it('keeps the picked judge through a class acknowledgement and pull while the assignment is backed off', async () => {
    h.transport = 'down';
    await h.pick('judge-b');
    await h.pass(); // both assignment writes fail into backoff

    // An unrelated class edit uploads and is acknowledged: the class row is clean again.
    await replicatedClassesTable.updateClass(CLASS_ID, { entryFee: 20 });
    await h.pass();
    expect(await h.classIsDirty()).toBe(false);
    expect((await h.pending()).length).toBeGreaterThan(0);

    const pulled = await h.syncClasses(); // incremental: the server still names judge A
    expect(pulled.success).toBe(true);
    expect(await h.storedJudgeId()).toBe('judge-a');

    expect(await h.shownJudgeId()).toBe('judge-b');
    expect(await h.shownByIdJudgeId()).toBe('judge-b');
    expect(await h.shownClass()).toMatchObject({ judgeName: 'Bob Judge', judgeResolved: true });
  });

  it('shows the picked judge the moment it is picked, offline, with no class write', async () => {
    h.transport = 'down';
    await h.pick('judge-b');

    expect(await h.shownJudgeId()).toBe('judge-b');
    expect(await h.classIsDirty()).toBe(false);
    expect((await h.manager.getPendingMutationsForTable('classes')).length).toBe(0);
  });

  it('names the judge from the people source when no name came with the pick', async () => {
    const { registerJudgeNameLookup } = await import('../classJudgeOverlay');
    const unregister = registerJudgeNameLookup(id =>
      id === 'judge-b'
        ? { name: 'Bob From People', firstName: 'Bob', lastName: 'People' }
        : undefined
    );
    h.transport = 'down';
    await h.pickWithoutName('judge-b');

    expect(await h.shownClass()).toMatchObject({
      judgeId: 'judge-b',
      judgeName: 'Bob From People',
    });
    unregister();
  });

  it('shows the id with no name rather than the previous judge name when nothing knows the name', async () => {
    h.transport = 'down';
    await h.pickWithoutName('judge-b');

    const shown = await h.shownClass();
    expect(shown?.judgeId).toBe('judge-b');
    expect(shown?.judgeName).toBeUndefined();
  });

  describe('when the assignment is delivered on retry', () => {
    it('converges on the picked judge after the acknowledgement refresh', async () => {
      h.transport = 'down';
      await h.pick('judge-b');
      await h.pass();
      await h.syncClasses();
      expect(await h.shownJudgeId()).toBe('judge-b');

      h.transport = 'up';
      await h.retryNow();

      expect([...h.serverAssignments.values()]).toEqual(['judge-b']);
      expect(await h.pending()).toEqual([]);
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-b'));
      expect(await h.shownJudgeId()).toBe('judge-b');
      expect(h.requests).toContain('classes:select:byId');
    });

    it('never flashes the previous judge between the acknowledgement and the refresh landing', async () => {
      h.transport = 'down';
      await h.pick('judge-b');
      await h.pass();

      let release!: () => void;
      h.classRefreshGate = new Promise<void>(resolve => (release = resolve));
      h.transport = 'up';
      await h.retryNow(); // delivered; the class refresh is now waiting on the gate

      expect(await h.pending()).toEqual([]);
      expect(await h.storedJudgeId()).toBe('judge-a'); // the stored row is still the old server judge
      for (let read = 0; read < 3; read += 1) {
        expect(await h.shownJudgeId()).toBe('judge-b');
        expect(await h.shownByIdJudgeId()).toBe('judge-b');
      }

      h.classRefreshGate = null;
      release();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-b'));
      await vi.waitFor(() => expect(h.settlingNow().size).toBe(0));
      expect(await h.shownJudgeId()).toBe('judge-b');
    });

    it("lets another secretary's later assignment win once every related write is acknowledged", async () => {
      h.transport = 'down';
      await h.pick('judge-b');
      await h.pass();
      h.transport = 'up';
      await h.retryNow();
      await vi.waitFor(async () => expect(await h.storedJudgeId()).toBe('judge-b'));
      await vi.waitFor(() => expect(h.settlingNow().size).toBe(0));

      // The synced local row for the delivered pick is still on this device.
      expect((await replicatedJudgeAssignmentsTable.getByClassOrThrow(CLASS_ID)).length).toBe(1);

      h.serverAssigns('judge-d'); // the assignments sync never sees a remote hard delete
      await h.syncAssignments(); // the remote change reaches the device as it would in a sync pass
      await h.syncClasses();

      expect(await h.storedJudgeId()).toBe('judge-d');
      expect(await h.shownJudgeId()).toBe('judge-d');
      expect(await h.shownByIdJudgeId()).toBe('judge-d');
    });

    it("lets another secretary's judge win over a stale synced local assignment row", async () => {
      // The device holds the server's A row (synced) and nothing is waiting to upload.
      expect((await replicatedJudgeAssignmentsTable.getByClassOrThrow(CLASS_ID)).length).toBe(1);

      h.serverAssigns('judge-d');
      await h.syncAssignments();
      await h.syncClasses();

      expect(await h.shownJudgeId()).toBe('judge-d');
    });
  });
});
