import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { buildClassPlacement } from '@/features/show-map/showMapHandPlacement';
import { pendingReplicatedByRunOrder } from './replicatedRunQueue';

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

  it('check-in completed is not waiting in either', () => {
    const rows = [
      { id: 'x', classId: 'c', armband: '1', runOrder: 9, checkInStatus: 'completed' },
      { id: 'y', classId: 'c', armband: '2', runOrder: 31 },
    ] as ReplicatedEntry[];
    expect(pendingReplicatedByRunOrder(rows).map(r => r.id)).toEqual(['y']);
    expect(buildClassPlacement(rows, []).model.waiting.map(r => r.id)).toEqual(['y']);
  });
});
