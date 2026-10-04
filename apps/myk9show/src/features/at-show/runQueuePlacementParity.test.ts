import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { buildRunOrderPlacementModel } from '@/features/show-map/runOrderPlacementModel';
import { pendingReplicatedByRunOrder } from './replicatedRunQueue';

// MYK9-996: the ringside run queue and the secretary's placement model must
// agree on who has already run, or a place shown ringside and a slot written
// from the Show Map describe different dogs.
describe('run queue and placement model agree on who already ran', () => {
  const scored = [false, true];
  const checkIns = [null, 'checked-in', 'completed', 'pulled', 'in-ring'] as const;

  for (const isScored of scored) {
    for (const checkIn of checkIns) {
      it(`isScored=${isScored} checkIn=${checkIn}`, () => {
        const placement = buildRunOrderPlacementModel([
          {
            id: 'x',
            armband: '1',
            runOrder: 9,
            isScored,
            checkInStatus: checkIn,
          },
        ])[0];
        const queued = pendingReplicatedByRunOrder([
          {
            id: 'x',
            classId: 'c',
            armband: '1',
            runOrder: 9,
            isScored,
            checkInStatus: checkIn,
          } as ReplicatedEntry,
        ]).length;
        // Whatever the placement model pins as already-ran is out of the queue.
        if (placement?.pinned === 'already-ran') expect(queued).toBe(0);
      });
    }
  }
});
