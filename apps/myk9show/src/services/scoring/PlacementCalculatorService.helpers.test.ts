import { describe, expect, it } from 'vitest';

import {
  assignPlacementsWithTieHandling,
  createEmptyPlacementCalculation,
  deserializePlacementCalculation,
  findTiedGroups,
  resolveTiesWithRules,
  serializePlacementCalculation,
  sortEntriesByFormat,
} from './PlacementCalculatorService.helpers';
import type {
  BaseScore,
  PlacementCalculation,
  PlacementEntry,
  PlacementRule,
  TieBreakingRule,
} from '@/types/scoring-types';

function score(
  entryId: string,
  overrides: Partial<BaseScore> & Record<string, unknown> = {}
): BaseScore {
  const now = new Date('2026-06-12T12:00:00.000Z');

  return {
    entryId,
    classId: 'class-1',
    judgeId: 'judge-1',
    format: 'scent_work',
    qualification: 'Qualified',
    timestamp: now,
    recordedBy: 'judge-1',
    recordedAt: now,
    version: 1,
    lastModified: now,
    syncStatus: 'synced',
    searchTime: 10_000,
    faults: 0,
    ...overrides,
  } as BaseScore;
}

function placementEntry(
  entryId: string,
  primaryScore: number,
  secondaryScore?: number,
  overrides: Partial<PlacementEntry> = {}
): PlacementEntry {
  return {
    entryId,
    dogName: `Dog ${entryId}`,
    handlerName: `Handler ${entryId}`,
    armband: entryId,
    primaryScore,
    secondaryScore,
    qualification: 'Qualified',
    isTied: false,
    rawScore: score(entryId),
    ...overrides,
  };
}

describe('PlacementCalculatorService helpers', () => {
  it('sorts entries by weighted placement rules', () => {
    const rules: PlacementRule[] = [
      {
        criteria: 'primaryScore',
        direction: 'descending',
        weight: 10,
        description: 'Higher score wins',
      },
      {
        criteria: 'secondaryScore',
        direction: 'ascending',
        weight: 1,
        description: 'Faster time breaks equal scores',
      },
    ];

    const sorted = sortEntriesByFormat(
      [
        placementEntry('slow-high', 95, 21),
        placementEntry('low', 88, 12),
        placementEntry('fast-high', 95, 18),
      ],
      'scent_work',
      rules
    );

    expect(sorted.map(entry => entry.entryId)).toEqual(['fast-high', 'slow-high', 'low']);
  });

  it('assigns competition placements and marks tied entries', () => {
    const entries = assignPlacementsWithTieHandling([
      placementEntry('first', 100),
      placementEntry('tie-a', 95, 10),
      placementEntry('tie-b', 95, 10),
      placementEntry('fourth', 90),
    ]);

    expect(entries.map(entry => [entry.entryId, entry.placement, entry.isTied])).toEqual([
      ['first', 1, false],
      ['tie-a', 2, true],
      ['tie-b', 2, true],
      ['fourth', 4, false],
    ]);
    expect(entries[1]?.tiedWith).toEqual(['tie-b']);
    expect(entries[2]?.tiedWith).toEqual(['tie-a']);
  });

  it('finds each tied placement group once', () => {
    const entries = assignPlacementsWithTieHandling([
      placementEntry('first-a', 100),
      placementEntry('first-b', 100),
      placementEntry('third-a', 90),
      placementEntry('third-b', 90),
    ]);

    const groups = findTiedGroups(entries);

    expect(groups.map(group => group.map(entry => entry.entryId))).toEqual([
      ['first-a', 'first-b'],
      ['third-a', 'third-b'],
    ]);
  });

  it('resolves tied groups with ordered tie-breaking rules', () => {
    const entries = assignPlacementsWithTieHandling([
      placementEntry('slower', 100, 0, {
        rawScore: score('slower', { searchTime: 15_000 }),
      }),
      placementEntry('faster', 100, 0, {
        rawScore: score('faster', { searchTime: 11_000 }),
      }),
      placementEntry('third', 90, 0, {
        rawScore: score('third', { searchTime: 9_000 }),
      }),
    ]);
    const rules: TieBreakingRule[] = [
      {
        priority: 1,
        criteria: 'searchTime',
        direction: 'ascending',
        description: 'Faster search time wins',
      },
    ];

    const resolved = resolveTiesWithRules(entries, rules, 'scent_work');

    expect(resolved.map(entry => [entry.entryId, entry.placement, entry.isTied])).toEqual([
      ['slower', 2, false],
      ['faster', 1, false],
      ['third', 3, false],
    ]);
  });

  it('creates an empty placement calculation for a class', () => {
    const calculation = createEmptyPlacementCalculation('class-1', 'scent_work');

    expect(calculation).toMatchObject({
      classId: 'class-1',
      format: 'scent_work',
      placements: [],
      calculatedBy: 'system',
      appliedTieBreakers: [],
    });
    expect(calculation.calculatedAt).toBeInstanceOf(Date);
  });

  it('serializes and deserializes placement date fields', () => {
    const calculation: PlacementCalculation = {
      classId: 'class-1',
      format: 'scent_work',
      placements: [
        placementEntry('entry-1', 100, 12, {
          placement: 1,
          rawScore: score('entry-1', {
            timestamp: new Date('2026-06-12T12:01:00.000Z'),
            recordedAt: new Date('2026-06-12T12:02:00.000Z'),
            lastModified: new Date('2026-06-12T12:03:00.000Z'),
          }),
        }),
      ],
      calculatedAt: new Date('2026-06-12T12:04:00.000Z'),
      calculatedBy: 'judge-1',
      tieBreakingRules: [],
      appliedTieBreakers: [],
    };

    const serialized = serializePlacementCalculation(calculation);
    const deserialized = deserializePlacementCalculation(serialized);

    expect(serialized.calculatedAt).toBe('2026-06-12T12:04:00.000Z');
    expect(deserialized.calculatedAt).toEqual(new Date('2026-06-12T12:04:00.000Z'));
    expect(deserialized.placements[0]?.rawScore.timestamp).toEqual(
      new Date('2026-06-12T12:01:00.000Z')
    );
    expect(deserialized.placements[0]?.rawScore.recordedAt).toEqual(
      new Date('2026-06-12T12:02:00.000Z')
    );
    expect(deserialized.placements[0]?.rawScore.lastModified).toEqual(
      new Date('2026-06-12T12:03:00.000Z')
    );
  });
});
