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

function makeResult(entryId: string, searchTime: number, faults: number): ScentWorkResult {
  return {
    entryId,
    classId: 'class-1',
    searchTime,
    maxTimeAllowed: 120_000,
    qualification: 'Qualified',
    faults,
    recordedBy: 'Judge',
    recordedAt: new Date(0),
  };
}

describe('buildPlacementData', () => {
  it('orders by server placement when time-first ranking would disagree', () => {
    const entries = [makeEntry('A', '2'), makeEntry('B', '1')];
    const results = new Map([
      ['A', makeResult('A', 35_000, 1)],
      ['B', makeResult('B', 40_000, 0)],
    ]);

    const placementData = buildPlacementData(entries, results);

    expect(placementData.map(entry => [entry.entryId, entry.placement])).toEqual([
      ['B', 1],
      ['A', 2],
    ]);
  });
});
