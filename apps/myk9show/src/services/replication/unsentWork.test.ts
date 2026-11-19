import { beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES, type PendingMutation } from '@myk9/replication';
import { RINGSIDE_RPC_FUNCTION } from './ringsideEntryRpc';
import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';
import { SCORE_DETAIL_CLEAR_FIELDS } from './scoreResetFields';
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

const refused = (id: string, rowId: string, extra: Partial<PendingMutation> = {}) =>
  score(id, rowId, {
    status: 'failed',
    failureKind: 'permanent',
    error: 'Non-retryable error: This class is cancelled. Scores and check-ins are closed.',
    ...extra,
  });

const checkInChange = (id: string, rowId: string, status: 'pending' | 'failed') =>
  mutation({
    id,
    rowId,
    status,
    rpc: { name: RINGSIDE_RPC_FUNCTION, fields: { check_in_status: 'checked-in' } },
  });

const noReplica = async (): Promise<ReplicatedEntry | undefined> => undefined;

describe('summarizeUnsentWork', () => {
  it('counts a refused score, so the total is never zero while it sits on the device', () => {
    const work = summarizeUnsentWork([], [refused('f1', 'entry-1')]);
    expect(work.total).toBe(1);
    expect(work.refusedCount).toBe(1);
    expect(work.unsentScoreCount).toBe(1);
    expect(work.scores).toEqual([
      expect.objectContaining({
        entryId: 'entry-1',
        state: 'refused',
        retryIds: ['f1'],
        removeIds: ['f1'],
      }),
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

  // MYK9-2168: the sign-out warning reads this count, so a queued club edit is the
  // "unsent changes" that warns before an account switch.
  it('counts a queued club edit as an unsent change', () => {
    const work = summarizeUnsentWork(
      [mutation({ id: 'c1', tableName: 'clubs', rowId: 'club-a', authUserId: 'user-a' })],
      []
    );
    expect(work.otherChangeCount).toBe(1);
    expect(work.total).toBe(1);
  });

  it('lists all four refused scores', () => {
    const failed = ['e1', 'e2', 'e3', 'e4'].map((rowId, i) => refused(`f${i}`, rowId));
    const work = summarizeUnsentWork([], failed);
    expect(work.scores.map(s => s.entryId)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(work.refusedCount).toBe(4);
  });

  // Review finding 3: a correction saved after a refusal is the score; the old one is never resent.
  // Round 2: a refused version is resent only while the replica holds exactly that score.
  describe('supersession by value', () => {
    const refusedFields = {
      is_scored: true,
      result_status: 'nq',
      search_time_seconds: 42.5,
      total_faults: 1,
      area1_time_seconds: 42.5,
      disqualification_reason: 'Handler error',
      scoring_completed_at: '2026-11-14T10:00:00.000Z',
    };
    const old = refused('f1', 'entry-1', {
      rpc: { name: RINGSIDE_RPC_FUNCTION, fields: refusedFields },
    });
    const replicaWith = (fields: Record<string, unknown>) =>
      new Map([['entry-1', { id: 'entry-1', ...fields } as ReplicatedEntry]]);

    it('refused and unchanged: Try again is offered and resends the same values', () => {
      // The same instant written differently still matches.
      const work = summarizeUnsentWork(
        [],
        [old],
        replicaWith({ ...refusedFields, scoring_completed_at: '2026-11-14T10:00:00+00:00' })
      );
      expect(work.scores[0]).toMatchObject({ state: 'refused', retryIds: ['f1'] });
      // Try again re-queues this exact mutation, so what it sends is the refused payload itself.
      expect(work.scores[0]?.mutation.rpc?.fields).toEqual(refusedFields);
      expect(work.unsentScoreCount).toBe(1);
    });

    // Round 3: one save can stamp the camel and snake completed-at a millisecond apart.
    it('same score with completed-at timestamps 1 ms apart stays refused with Try again', () => {
      const work = summarizeUnsentWork(
        [],
        [old],
        replicaWith({
          ...refusedFields,
          scoring_completed_at: '2026-11-14T10:00:00.001Z',
          scoringCompletedAt: '2026-11-14T10:00:00.000Z',
        })
      );
      expect(work.scores[0]).toMatchObject({ state: 'refused', retryIds: ['f1'] });
      expect(work.unsentScoreCount).toBe(1);
    });

    it('the same result re-saved 30 s later supersedes it: Remove only', () => {
      const work = summarizeUnsentWork(
        [],
        [old],
        replicaWith({ ...refusedFields, scoring_completed_at: '2026-11-14T10:00:30.000Z' })
      );
      expect(work.scores[0]).toMatchObject({
        state: 'superseded',
        retryIds: [],
        removeIds: ['f1'],
      });
    });

    it('refused, then corrected: superseded, Remove only', () => {
      const corrected = {
        ...refusedFields,
        result_status: 'qualified',
        disqualification_reason: null,
        scoring_completed_at: '2026-11-14T10:05:00.000Z',
      };
      const work = summarizeUnsentWork([], [old], replicaWith(corrected));
      expect(work.scores).toEqual([
        expect.objectContaining({ state: 'superseded', retryIds: [], removeIds: ['f1'] }),
      ]);
      expect(work.unsentScoreCount).toBe(0);
      expect(work.total).toBe(0);
    });

    it('refused, then cleared by Reset score (clearEntryScore): superseded, Remove only', () => {
      // The values clearEntryScore writes (clearEntryScore.ts), with the same detail clears.
      const cleared = {
        is_scored: false,
        result_status: 'pending',
        search_time_seconds: 0,
        total_faults: 0,
        scoring_completed_at: null,
        disqualification_reason: null,
        ...SCORE_DETAIL_CLEAR_FIELDS,
      };
      const work = summarizeUnsentWork([], [old], replicaWith(cleared));
      expect(work.scores[0]).toMatchObject({ state: 'superseded', retryIds: [] });
    });

    it('a different score pulled from another device also supersedes it', () => {
      const work = summarizeUnsentWork(
        [],
        [old],
        replicaWith({ ...refusedFields, search_time_seconds: 40.1 })
      );
      expect(work.scores[0]?.state).toBe('superseded');
    });

    it('while a correction waits, the row shows the correction and offers nothing to resend', () => {
      const correction = score('p2', 'entry-1', { timestamp: 9 });
      const work = summarizeUnsentWork([correction], [old]);
      expect(work.scores).toEqual([
        expect.objectContaining({ state: 'waiting', mutation: correction, retryIds: [] }),
      ]);
    });
  });

  // Round 2 [P2]: a waiting change never hides behind a score that is not counted.
  it("counts a waiting check-in on its own when the dog's score is superseded", () => {
    const old = refused('f1', 'entry-1', {
      rpc: { name: RINGSIDE_RPC_FUNCTION, fields: { is_scored: true, result_status: 'nq' } },
    });
    const replica = new Map([
      ['entry-1', { id: 'entry-1', is_scored: false, result_status: 'pending' } as ReplicatedEntry],
    ]);
    const behindSuperseded = summarizeUnsentWork(
      [checkInChange('c1', 'entry-1', 'pending')],
      [old],
      replica
    );
    expect(behindSuperseded.scores[0]?.state).toBe('superseded');
    expect(behindSuperseded.otherChangeCount).toBe(1);
    expect(behindSuperseded.total).toBe(1);

    // Behind a counted (waiting) score it rides with the score, counted once.
    const behindWaiting = summarizeUnsentWork(
      [score('p1', 'entry-1'), checkInChange('c1', 'entry-1', 'pending')],
      []
    );
    expect(behindWaiting.otherChangeCount).toBe(0);
    expect(behindWaiting.total).toBe(1);
  });

  // Review finding 2: Remove and Try again act on the score's own rows, never another change.
  it('keeps a refused check-in on the same dog out of the score and counts it on its own', () => {
    const work = summarizeUnsentWork(
      [checkInChange('ring-exit', 'entry-1', 'pending')],
      [refused('f1', 'entry-1'), checkInChange('c1', 'entry-1', 'failed')]
    );
    expect(work.scores).toEqual([
      expect.objectContaining({
        retryIds: ['f1'],
        removeIds: ['f1'],
        hasOtherRefusedChange: true,
      }),
    ]);
    expect(work.otherChangeCount).toBe(1);
    expect(work.refusedCount).toBe(2);
    expect(work.total).toBe(2);
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

    const work = await readDeviceUnsentWork(noReplica);

    expect(work.scores.map(s => [s.entryId, s.state])).toEqual([
      ['entry-1', 'waiting'],
      ['entry-2', 'refused'],
    ]);
    expect(work.total).toBe(2);
  });

  // Review finding 5: a failed replica read is a failed read, never "nothing unsent".
  it('rejects when the entry read fails', async () => {
    const db = await databaseManager.getDatabase('unsentWork.test');
    await db.put(REPLICATION_STORES.FAILED_MUTATIONS, refused('f1', 'entry-2'));
    const readEntry = vi.fn().mockRejectedValue(new Error('idb gone'));
    await expect(readDeviceUnsentWork(readEntry)).rejects.toThrow('idb gone');
    expect(readEntry).toHaveBeenCalledWith('entry-2');
  });
});
