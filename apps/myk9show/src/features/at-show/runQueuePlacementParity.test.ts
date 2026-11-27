import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { buildClassPlacement } from '@/features/show-map/showMapHandPlacement';
import {
  nextPendingReplicated,
  pendingReplicatedByRunOrder,
  remainingReplicated,
} from './replicatedRunQueue';

// MYK9-996: the ringside run queue and the secretary's placement model (the
// real one, via its adapter) must agree on who is still waiting, or a place
// shown ringside and a slot written from the Show Map describe different dogs.
describe('run queue and placement model agree on who is waiting', () => {
  const checkIns = [undefined, 'checked-in', 'completed', 'pulled', 'in-ring'] as const;

  for (const isScored of [false, true]) {
    for (const checkInStatus of checkIns) {
      it(`isScored=${isScored} checkIn=${checkInStatus}`, () => {
        const rows = [
          { id: 'x', classId: 'c', armband: '1', runOrder: 9, isScored, checkInStatus },
          { id: 'ref', classId: 'c', armband: '2', runOrder: 31 },
        ] as ReplicatedEntry[];
        const waiting = buildClassPlacement(rows, []).model.waiting.map(r => r.id);
        expect(pendingReplicatedByRunOrder(rows).map(r => r.id)).toEqual(waiting);
      });
    }
  }

  it('a stale ring_entry_time with is_in_ring false is waiting in both (MYK9-1889)', () => {
    const rows = [
      {
        id: 'x',
        classId: 'c',
        armband: '1',
        runOrder: 9,
        checkInStatus: 'checked-in',
        ring_entry_time: '2026-07-20T10:00:00Z',
        is_in_ring: false,
      },
      { id: 'ref', classId: 'c', armband: '2', runOrder: 31 },
    ] as ReplicatedEntry[];
    expect(pendingReplicatedByRunOrder(rows).map(r => r.id)).toEqual(['x', 'ref']);
    expect(buildClassPlacement(rows, []).model.waiting.map(r => r.id)).toEqual(['x', 'ref']);
  });

  // MYK9-2391: a Pending (not yet approved) entry holds a run number but is not in line. The
  // queue leaves it out; the placement model is deliberately unchanged and still places it.
  it.each(['pending', 'submitted', 'draft', 'paid', 'promotion-expired'])(
    'a %s entry between two running dogs is not in the queue, and the dogs around it still agree',
    entryStatus => {
      const rows = [
        {
          id: 'p',
          classId: 'c',
          armband: '3',
          runOrder: 1,
          entryStatus,
          checkInStatus: 'no-status',
        },
        {
          id: 'a',
          classId: 'c',
          armband: '1',
          runOrder: 2,
          entryStatus: 'confirmed',
          checkInStatus: 'no-status',
        },
        {
          id: 'b',
          classId: 'c',
          armband: '2',
          runOrder: 3,
          entryStatus: 'confirmed',
          checkInStatus: 'no-status',
        },
      ] as ReplicatedEntry[];
      expect(pendingReplicatedByRunOrder(rows).map(r => r.id)).toEqual(['a', 'b']);
      expect(nextPendingReplicated(rows, 1).map(r => r.id)).toEqual(['a']);
      expect(remainingReplicated(rows)).toBe(2);
      // Placement keeps the Pending dog, in run order, with its own run number.
      const waiting = buildClassPlacement(rows, []).model.waiting;
      expect(waiting.map(r => r.id)).toEqual(['p', 'a', 'b']);
      expect(waiting.find(r => r.id === 'p')?.runOrder).toBe(1);
    }
  );

  it('check-in completed is not waiting in either', () => {
    const rows = [
      { id: 'x', classId: 'c', armband: '1', runOrder: 9, checkInStatus: 'completed' },
      { id: 'y', classId: 'c', armband: '2', runOrder: 31 },
    ] as ReplicatedEntry[];
    expect(pendingReplicatedByRunOrder(rows).map(r => r.id)).toEqual(['y']);
    expect(buildClassPlacement(rows, []).model.waiting.map(r => r.id)).toEqual(['y']);
  });
});
