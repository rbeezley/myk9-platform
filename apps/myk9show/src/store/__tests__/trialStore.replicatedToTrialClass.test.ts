import { describe, expect, it } from 'vitest';
import { replicatedToTrialClass, mergeTrialClassData } from '../trial-store-helpers';
import type { ReplicatedClass } from '@/services/replication';

/**
 * The offline-first read path maps replicated class rows (IndexedDB) into the
 * domain SyncableTrialClass via `replicatedToTrialClass`. `reopenedAfterCloseoutAt`
 * (server-stamped when a late entry reopens a closed class) must survive that hop —
 * it drives the show-map class-level attention signal (getClassAttention). If dropped
 * here, the signal is silently inert even though the DB column and show-map code exist.
 */
function makeReplicated(fields: {
  reopenedAfterCloseoutAt?: string | null;
  revisedExpectedStart?: string | null;
  actualStartTime?: string;
  actualFinishTime?: string;
}): ReplicatedClass {
  return {
    id: 'class-1',
    name: 'Interior Novice',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
    judgeId: 'judge-1',
    judgeName: 'Judge One',
    startTime: '09:00 AM',
    classStatus: 'Scheduled',
    reopenedAfterCloseoutAt: fields.reopenedAfterCloseoutAt,
    revisedExpectedStart: fields.revisedExpectedStart,
    actual_start_time: fields.actualStartTime,
    actual_end_time: fields.actualFinishTime,
  };
}

describe('replicatedToTrialClass — reopenedAfterCloseoutAt carry (warm path)', () => {
  it('carries reopenedAfterCloseoutAt from the replicated row onto the domain class', () => {
    expect(
      replicatedToTrialClass(makeReplicated({ reopenedAfterCloseoutAt: '2026-07-12T18:00:00Z' }))
        .reopenedAfterCloseoutAt
    ).toBe('2026-07-12T18:00:00Z');
  });

  it('defaults a missing reopenedAfterCloseoutAt to null', () => {
    expect(replicatedToTrialClass(makeReplicated({})).reopenedAfterCloseoutAt).toBeNull();
  });

  it('preserves reopenedAfterCloseoutAt through mergeTrialClassData with existing local data', () => {
    const replicated = makeReplicated({ reopenedAfterCloseoutAt: '2026-07-12T18:00:00Z' });
    const existing = replicatedToTrialClass(makeReplicated({}));
    const merged = mergeTrialClassData(replicated, existing);
    expect(merged.reopenedAfterCloseoutAt).toBe('2026-07-12T18:00:00Z');
  });

  it('carries revised and actual timing without replacing Scheduled Start', () => {
    const mapped = replicatedToTrialClass(
      makeReplicated({
        revisedExpectedStart: '2026-07-20T15:15:00Z',
        actualStartTime: '2026-07-20T15:18:00Z',
        actualFinishTime: '2026-07-20T15:47:00Z',
      })
    );
    expect(mapped.startTime).toBe('09:00 AM');
    expect(mapped.revisedExpectedStart).toBe('2026-07-20T15:15:00Z');
    expect(mapped.actualStartTime).toBe('2026-07-20T15:18:00Z');
    expect(mapped.actualFinishTime).toBe('2026-07-20T15:47:00Z');
  });
});
