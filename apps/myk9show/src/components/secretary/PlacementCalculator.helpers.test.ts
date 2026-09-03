import { describe, expect, it } from 'vitest';
import type { ScentWorkEntry, ScentWorkResult } from '@/types/scent-work-types';
import { buildPlacementData } from './PlacementCalculator.helpers';

function makeEntry(id: string, placement: string): ScentWorkEntry {
  return {
    id,
    classId: 'class-1',
    showId: 'show-1',
    dogId: `dog-${id}`,
    status: 'completed',
    statusHistory: [],
    registrationData: {
      submittedAt: new Date(0),
      handler: `Handler ${id}`,
      entryFee: 0,
      paymentStatus: 'paid',
    },
    competitionData: { placement, recordedBy: 'Judge' },
    classConfig: {
      element: 'Container',
      level: 'Novice',
      timeLimit: 120_000,
      warningsEnabled: true,
    },
    displayInfo: {
      armband: id,
      dogName: `Dog ${id}`,
      dogBreed: 'Mixed Breed',
      handlerName: `Handler ${id}`,
      dogId: `dog-${id}`,
      handlerId: `handler-${id}`,
    },
  };
}

function makeResult(
  entryId: string,
  searchTime: number,
  faults: number,
  placementCalculated?: number
): ScentWorkResult {
  return {
    entryId,
    classId: 'class-1',
    searchTime,
    maxTimeAllowed: 120_000,
    qualification: 'Qualified',
    faults,
    recordedBy: 'Judge',
    recordedAt: new Date(0),
    ...(placementCalculated === undefined ? {} : { placementCalculated }),
  };
}

describe('buildPlacementData', () => {
  it('orders by server placement when time-first ranking would disagree', () => {
    const entries = [makeEntry('A', '2'), makeEntry('B', '1')];
    const results = new Map([
      ['A', makeResult('A', 35_000, 1, 2)],
      ['B', makeResult('B', 40_000, 0, 1)],
    ]);

    const placementData = buildPlacementData(entries, results);

    expect(placementData.map(entry => [entry.entryId, entry.placement])).toEqual([
      ['B', 1],
      ['A', 2],
    ]);
  });

  it('does not show a stale placement for a non-qualified result', () => {
    const entries = [makeEntry('A', '2')];
    const result = makeResult('A', 35_000, 1, 2);
    result.qualification = 'Not Qualified';

    const placementData = buildPlacementData(entries, new Map([['A', result]]));

    expect(placementData[0]?.placement).toBeUndefined();
  });

  it('uses armband order as the deterministic tie-breaker for equal placements', () => {
    const entries = [makeEntry('102', '1'), makeEntry('101', '1')];
    const results = new Map([
      ['102', makeResult('102', 35_000, 0, 1)],
      ['101', makeResult('101', 35_000, 0, 1)],
    ]);

    expect(buildPlacementData(entries, results).map(entry => entry.entryId)).toEqual(['101', '102']);
  });
});
