import { describe, expect, it } from 'vitest';

import {
  applyTieBreakingRule,
  assignPlacementsWithTieHandling,
  createPlacementEntry,
  createEmptyPlacementCalculation,
  deserializePlacementCalculation,
  extractValue,
  findTiedGroups,
  isTieFullyResolved,
  resolveTiesWithRules,
  serializePlacementCalculation,
  sortEntriesByFormat,
  updatePlacementsAfterTieBreaking,
} from './PlacementCalculatorService.helpers';
import type {
  BaseScore,
  PlacementCalculation,
  PlacementEntry,
  PlacementRule,
  TieBreakingRule,
  ScoringFormat,
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
  it('extracts common and format-specific placement values', () => {
    const cases: Array<{
      format: ScoringFormat;
      rawScore: BaseScore;
      expected: Record<string, number>;
    }> = [
      {
        format: 'agility',
        rawScore: score('agility', {
          format: 'agility',
          totalFaults: 5,
          courseTime: 42_000,
          jumpFaults: 1,
          refusals: 2,
          yardagePerSecond: 4.5,
        }),
        expected: {
          totalFaults: 5,
          courseTime: 42_000,
          jumpFaults: 1,
          refusals: 2,
          yardagePerSecond: 4.5,
        },
      },
      {
        format: 'obedience',
        rawScore: score('obedience', {
          format: 'obedience',
          totalScore: 198,
          maximumScore: 200,
          qualifyingScore: 170,
        }),
        expected: { totalScore: 198, maximumScore: 200, qualifyingScore: 170 },
      },
      {
        format: 'rally',
        rawScore: score('rally', {
          format: 'rally',
          finalScore: 205,
          courseTime: 63_000,
          totalDeductions: 5,
          stationDeductions: 3,
        }),
        expected: {
          finalScore: 205,
          courseTime: 63_000,
          totalDeductions: 5,
          stationDeductions: 3,
        },
      },
      {
        format: 'conformation',
        rawScore: score('conformation', {
          format: 'conformation',
          placement: 2,
          pointsAwarded: 4,
          gaitScore: 8,
          typeScore: 9,
        }),
        expected: { placement: 2, pointsAwarded: 4, gaitScore: 8, typeScore: 9 },
      },
      {
        format: 'scent_work',
        rawScore: score('scent', {
          searchTime: undefined,
          totalSearchTime: 31_000,
          totalFaults: 2,
          qualification: 'Not Qualified',
        }),
        expected: { qualification: 0, searchTime: 31_000, faults: 2, time: 31_000 },
      },
    ];

    for (const { format, rawScore, expected } of cases) {
      const entry = placementEntry('entry', 100, 10, { rawScore });
      for (const [criteria, value] of Object.entries(expected)) {
        expect(extractValue(entry, criteria, format)).toBe(value);
      }
    }
  });

  it('creates placement entries with format-specific primary and secondary scores', () => {
    expect(
      createPlacementEntry(
        score('agility', { format: 'agility', totalFaults: 10, courseTime: 45_000 }),
        { dogName: 'Ziva', handlerName: 'Jane', armband: '42' }
      )
    ).toMatchObject({
      entryId: 'agility',
      dogName: 'Ziva',
      handlerName: 'Jane',
      armband: '42',
      primaryScore: 10,
      secondaryScore: 45_000,
    });

    expect(createPlacementEntry(score('scent', { time: 18_000, faults: 1 }))).toMatchObject({
      entryId: 'scent',
      dogName: 'Unknown Dog',
      handlerName: 'Unknown Handler',
      armband: '000',
      primaryScore: 18_000,
      secondaryScore: 1,
      isTied: false,
    });
  });

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

  it('sorts by rule weight before declaration order', () => {
    const rules: PlacementRule[] = [
      {
        criteria: 'secondaryScore',
        direction: 'ascending',
        weight: 1,
        description: 'Faster time only breaks ties',
      },
      {
        criteria: 'primaryScore',
        direction: 'descending',
        weight: 10,
        description: 'Higher score wins first',
      },
    ];

    const sorted = sortEntriesByFormat(
      [placementEntry('fast-low', 80, 1), placementEntry('slow-high', 95, 99)],
      'scent_work',
      rules
    );

    expect(sorted.map(entry => entry.entryId)).toEqual(['slow-high', 'fast-low']);
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

  it('marks the final placement group as tied', () => {
    const entries = assignPlacementsWithTieHandling([
      placementEntry('first', 100),
      placementEntry('final-a', 90, 10),
      placementEntry('final-b', 90, 10),
    ]);

    expect(entries.map(entry => [entry.entryId, entry.placement, entry.isTied])).toEqual([
      ['first', 1, false],
      ['final-a', 2, true],
      ['final-b', 2, true],
    ]);
    expect(entries[1]?.tiedWith).toEqual(['final-b']);
    expect(entries[2]?.tiedWith).toEqual(['final-a']);
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

  it('checks whether tie-breaker rules fully resolved a tied group', () => {
    expect(isTieFullyResolved([placementEntry('a', 100, 1), placementEntry('b', 100, 1)])).toBe(
      false
    );
    expect(isTieFullyResolved([placementEntry('a', 100, 1), placementEntry('b', 100, 2)])).toBe(
      true
    );
  });

  it('applies tie-breaking rules in both directions', () => {
    const tied = [placementEntry('low', 100, 1), placementEntry('high', 100, 5)];

    expect(
      applyTieBreakingRule(
        [...tied],
        { priority: 1, criteria: 'secondaryScore', direction: 'descending', description: 'high' },
        'scent_work'
      ).map(entry => entry.entryId)
    ).toEqual(['high', 'low']);
  });

  it('shifts later placements after expanding a tied group resolution', () => {
    const first = placementEntry('first', 100, 1, { placement: 1 });
    const tiedA = placementEntry('tied-a', 95, 1, { placement: 2, isTied: true });
    const tiedB = placementEntry('tied-b', 95, 1, { placement: 2, isTied: true });
    // Simulates a resolver expanding a two-way tie into three ranked positions.
    const resolvedC = placementEntry('resolved-c', 95, 2, { placement: 2, isTied: true });
    const fourth = placementEntry('fourth', 90, 1, { placement: 4 });
    const entries = [first, tiedA, tiedB, fourth];

    updatePlacementsAfterTieBreaking(entries, [tiedA, tiedB], [tiedA, tiedB, resolvedC]);

    expect(entries.map(entry => [entry.entryId, entry.placement, entry.isTied])).toEqual([
      ['first', 1, false],
      ['tied-a', 2, false],
      ['tied-b', 3, false],
      ['fourth', 5, false],
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
