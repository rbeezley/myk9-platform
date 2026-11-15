import { beforeEach, describe, expect, it } from 'vitest';
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';
import { RINGSIDE_RPC_FUNCTION } from './ringsideEntryRpc';
import { readDeviceUnsentWork, summarizeUnsentWork } from './unsentWork';

// The replication database stays open across tests; empty its queue stores so no row leaks.
async function clearQueue() {
  const db = await databaseManager.getDatabase('unsentWork.test');
  await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
  await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
}

function mutation(overrides: Partial<PendingMutation> & { id: string }): PendingMutation {
  return {
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'entry-1',
    data: {},
    timestamp: 1,
    retries: 0,
    status: 'pending',
    ...overrides,
  };
}

const score = (id: string, rowId: string, extra: Partial<PendingMutation> = {}) =>
  mutation({
    id,
    rowId,
    rpc: { name: RINGSIDE_RPC_FUNCTION, fields: { is_scored: true, result_status: 'qualified' } },
    ...extra,
  });

const refused = (id: string, rowId: string) =>
  score(id, rowId, {
    status: 'failed',
    failureKind: 'permanent',
    error: 'Non-retryable error: This class is cancelled. Scores and check-ins are closed.',
  });

describe('summarizeUnsentWork', () => {
  it('counts a refused score, so the total is never zero while it sits on the device', () => {
    const work = summarizeUnsentWork([], [refused('f1', 'entry-1')]);
    expect(work.total).toBe(1);
    expect(work.refusedCount).toBe(1);
    expect(work.scores).toEqual([
      expect.objectContaining({ entryId: 'entry-1', refused: true, failedMutationIds: ['f1'] }),
    ]);
  });

  it('counts one dog scored as one score, however many rows the save queued', () => {
    const ringExit = mutation({
      id: 'm2',
      rowId: 'entry-1',
      rpc: { name: RINGSIDE_RPC_FUNCTION, fields: { is_in_ring: false } },
    });
    const correction = score('m3', 'entry-1', { timestamp: 3 });
    const work = summarizeUnsentWork([score('m1', 'entry-1'), ringExit, correction], []);
    expect(work.scores).toHaveLength(1);
    expect(work.scores[0]?.mutation.id).toBe('m3');
    expect(work.otherChangeCount).toBe(0);
    expect(work.total).toBe(1);
  });

  it('lists all four refused scores', () => {
    const failed = ['e1', 'e2', 'e3', 'e4'].map((rowId, i) => refused(`f${i}`, rowId));
    const work = summarizeUnsentWork([], failed);
    expect(work.scores.map(s => s.entryId)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(work.refusedCount).toBe(4);
  });

  it('shows the refused score over a newer waiting one for the same dog', () => {
    const work = summarizeUnsentWork(
      [score('p1', 'entry-1', { timestamp: 9 })],
      [refused('f1', 'entry-1')]
    );
    expect(work.scores).toHaveLength(1);
    expect(work.scores[0]).toMatchObject({ refused: true, mutation: { id: 'f1' } });
  });

  it('counts other changes once per row they change', () => {
    const checkIn = (id: string) =>
      mutation({
        id,
        rowId: 'entry-9',
        rpc: { name: RINGSIDE_RPC_FUNCTION, fields: { check_in_status: 'checked-in' } },
      });
    const show = mutation({ id: 's1', tableName: 'shows', rowId: 'show-1', status: 'failed' });
    const work = summarizeUnsentWork([checkIn('c1'), checkIn('c2')], [show]);
    expect(work.scores).toHaveLength(0);
    expect(work.otherChangeCount).toBe(2);
    expect(work.refusedCount).toBe(1);
    expect(work.total).toBe(2);
  });
});

describe('readDeviceUnsentWork', () => {
  beforeEach(clearQueue);
  it('reads the queue and the dead letters of every account on this device', async () => {
    const db = await databaseManager.getDatabase('unsentWork.test');
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      score('p1', 'entry-1', { authUserId: 'judge-now' })
    );
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, {
      ...refused('f1', 'entry-2'),
      timestamp: 2,
      authUserId: 'earlier-passcode',
    });

    const work = await readDeviceUnsentWork();

    expect(work.scores.map(s => [s.entryId, s.refused])).toEqual([
      ['entry-1', false],
      ['entry-2', true],
    ]);
    expect(work.total).toBe(2);
  });
});
