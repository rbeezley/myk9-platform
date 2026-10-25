/**
 * MYK9-1327: a secretary's class judge pick is ONE queued judge_assignments write; the class
 * row keeps what the server said and readers see the picked judge while that write is
 * undelivered. Real replicas, real queue and upload runner, real incremental syncs and class
 * enrichment: only the network transport is faked (classJudgeHarness).
 */
import { describe, expect, it, vi } from 'vitest';
import { replicatedClassesTable, replicatedJudgeAssignmentsTable } from '..';
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import { CLASS_ID, TRIAL_ID, useClassJudgeHarness } from './classJudgeHarness';

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

  describe('after the assignment is delivered', () => {
    const deliver = async () => {
      h.transport = 'down';
      await h.pick('judge-b');
      await h.pass();
      h.transport = 'up';
      await h.retryNow();
      expect(await h.pending()).toEqual([]);
      expect([...h.serverAssignments.values()]).toEqual(['judge-b']);
    };

    it('holds the picked judge on a reload until the class has been pulled past the assignment', async () => {
      await deliver();
      expect(await h.storedJudgeId()).toBe('judge-a'); // no class pull has happened
      expect(h.requests).not.toContain('classes:select:byId'); // and none is forced

      // A reload: a fresh table instance with no memory of this session.
      const reloaded = h.reloaded();
      expect((await reloaded.getByTrialOrThrow(TRIAL_ID))[0]?.judgeId).toBe('judge-b');
      expect((await reloaded.getClassById(CLASS_ID))?.judgeId).toBe('judge-b');

      await h.syncAssignments(); // the delivered row comes back stamped with its server time
      expect((await reloaded.getByTrialOrThrow(TRIAL_ID))[0]?.judgeId).toBe('judge-b');
      expect(await h.storedJudgeId()).toBe('judge-a');

      await h.syncClasses(); // the class row now carries the assignment's server time
      expect(await h.storedJudgeId()).toBe('judge-b');
      expect((await reloaded.getByTrialOrThrow(TRIAL_ID))[0]).toMatchObject({
        judgeId: 'judge-b',
        judgeName: 'Bob Judge',
      });
    });

    it("lets another secretary's later assignment win once the class is pulled past ours", async () => {
      await deliver();
      await h.catchUp();
      expect(await h.storedJudgeId()).toBe('judge-b');
      // The synced local row for the delivered pick is still on this device.
      expect((await replicatedJudgeAssignmentsTable.getByClassOrThrow(CLASS_ID)).length).toBe(1);

      h.serverAssigns('judge-d'); // the assignments sync never sees a remote hard delete
      await h.syncAssignments();
      await h.syncClasses(); // the class row is newer than our delivered row

      expect(await h.storedJudgeId()).toBe('judge-d');
      expect(await h.shownJudgeId()).toBe('judge-d');
      expect(await h.shownByIdJudgeId()).toBe('judge-d');
      expect(await h.shownJudgeId()).toBe('judge-d');
    });

    it("lets another secretary's judge win over a stale synced local assignment row", async () => {
      // The device holds the server's A row (synced) and nothing is waiting to upload.
      expect((await replicatedJudgeAssignmentsTable.getByClassOrThrow(CLASS_ID)).length).toBe(1);

      h.serverAssigns('judge-d');
      await h.catchUp();

      expect(await h.shownJudgeId()).toBe('judge-d');
    });

    it('keeps the picked judge while an unrelated class conflict holds the class row back', async () => {
      await deliver();
      // A local edit of the fee waits to upload while another device changes the same field.
      await replicatedClassesTable.updateClass(CLASS_ID, { entryFee: 25 });
      const db = await databaseManager.getDatabase('test');
      for (const m of await h.manager.getPendingMutationsForTable('classes')) {
        await db.put(REPLICATION_STORES.PENDING_MUTATIONS, {
          ...m,
          nextRetryAt: Date.now() + 3_600_000,
        });
      }
      h.entryFee = 40;
      h.touchClass();
      await h.catchUp();

      const row = await replicatedClassesTable.getReplicatedRow(CLASS_ID);
      expect(row?.syncStatus).toBe('conflict'); // the pull could not adopt the class row
      expect(await h.storedJudgeId()).toBe('judge-a');
      expect(await h.shownJudgeId()).toBe('judge-b');
      expect(await h.shownByIdJudgeId()).toBe('judge-b');

      // Taking the server's class row is the first caught-up row: the server's judge shows.
      await replicatedClassesTable.resolveReplicationConflict(CLASS_ID, 'take-remote');
      await h.manager.discardPendingMutationsForRow('classes', CLASS_ID);
      expect(await h.storedJudgeId()).toBe('judge-b');
      expect(await h.shownJudgeId()).toBe('judge-b');
    });

    it('lets the server stamp the assignment: no client updated_at is queued', async () => {
      h.transport = 'down';
      await h.pick('judge-b');
      await h.reassign('judge-b', 'judge-c');

      const queued = (await h.pending()).filter(m => m.operation !== 'DELETE');
      expect(queued.map(m => m.operation)).toContain('INSERT');
      expect(queued.map(m => m.operation)).toContain('UPDATE');
      for (const mutation of queued) {
        expect(mutation.data).not.toHaveProperty('updated_at');
      }
    });

    it('keeps the picked judge after a delayed upload until the class is pulled past the assignment', async () => {
      h.transport = 'down';
      await h.pick('judge-b');
      await h.pass();
      // The pick waits in backoff; meanwhile the device pulled the class (old judge).
      await h.catchUp();
      h.transport = 'up';
      await h.retryNow(); // delivered late: the server stamps it after the class pull above

      await h.syncAssignments(); // the row comes back with the server's time, newer than the class row
      expect(await h.storedJudgeId()).toBe('judge-a');
      expect(await h.shownJudgeId()).toBe('judge-b');

      await h.syncClasses();
      expect(await h.storedJudgeId()).toBe('judge-b');
      expect(await h.shownJudgeId()).toBe('judge-b');
    });

    it('never shows an invited judge whose assignment arrives before its class', async () => {
      h.serverInvites('judge-c');
      await h.syncAssignments(); // a newer, unconfirmed row; the class has not been pulled

      expect(await h.shownJudgeId()).toBe('judge-a');
      expect(await h.shownByIdJudgeId()).toBe('judge-a');
    });

    it('keeps the judge name when the name lookup fails on the pull', async () => {
      h.enrichmentDown = true;
      await deliver();
      await h.catchUp();

      expect(await h.storedJudgeId()).toBe('judge-b'); // the class row has the id...
      expect((await replicatedClassesTable.get(CLASS_ID))?.judgeName).toBeUndefined(); // ...no name
      expect(await h.shownClass()).toMatchObject({ judgeId: 'judge-b', judgeName: 'Bob Judge' });
      expect((await replicatedClassesTable.getClassById(CLASS_ID))?.judgeName).toBe('Bob Judge');
    });
  });
});
