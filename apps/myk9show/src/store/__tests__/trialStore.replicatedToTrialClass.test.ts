import { describe, expect, it } from 'vitest';
import {
  replicatedToTrialClass,
  mergeTrialClassData,
  trialClassToReplicated,
} from '../trial-store-helpers';
import type { SyncableTrialClass } from '../trial-store-types';
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

/**
 * The stored class NAME is the only thing that separates two classes sharing an
 * element, a level and a section — the case `buildClassDisambiguator` exists for
 * (MYK9-489). The registration wizard PREFERS this replicated path over its
 * query and availability fallbacks, so a name lost on either hop is a name no
 * exhibitor-facing surface can recover. Found in review of #2196: the read hop
 * dropped it, and the write hop overwrote it with a synthesised one.
 */
describe('class name survives the replication round trip', () => {
  const syncable = (fields: Partial<SyncableTrialClass>): SyncableTrialClass =>
    ({
      id: 'class-1',
      element: 'Interior',
      level: 'Advanced',
      section: '',
      judgeId: '',
      startTime: '',
      status: 'Scheduled',
      entries: 0,
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: '',
      _syncStatus: 'synced',
      ...fields,
    }) as SyncableTrialClass;

  it('carries the name from the replicated row into the domain class', () => {
    const mapped = replicatedToTrialClass({
      ...makeReplicated({}),
      id: 'class-40',
      name: 'Interior Advanced Preliminary',
      element: 'Interior',
      level: 'Advanced',
      section: '',
    });

    expect(mapped.name).toBe('Interior Advanced Preliminary');
  });

  it('does not overwrite a stored name with a synthesised one on the way out', () => {
    const written = trialClassToReplicated(
      syncable({ name: 'Interior Advanced Preliminary' }),
      'trial-1'
    );

    // The synthesised fallback would be "Interior Advanced" — identical to the
    // sibling class, which is exactly the ambiguity being fixed.
    expect(written.name).toBe('Interior Advanced Preliminary');
  });

  it('still synthesises a name for a class that never had one', () => {
    const written = trialClassToReplicated(syncable({ section: 'B', level: 'Novice' }), 'trial-1');

    expect(written.name).toBe('Interior Novice B');
  });

  it('keeps two same-level classes distinguishable across a full round trip', () => {
    const plain = syncable({ id: 'c1', name: 'Interior Advanced' });
    const preliminary = syncable({ id: 'c2', name: 'Interior Advanced Preliminary' });

    const roundTrip = (cls: SyncableTrialClass) =>
      replicatedToTrialClass(trialClassToReplicated(cls, 'trial-1')).name;

    expect(roundTrip(plain)).not.toBe(roundTrip(preliminary));
  });
});
