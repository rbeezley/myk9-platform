import { describe, expect, it } from 'vitest';
import {
  applyStatsFilters,
  computeBreedPerformance,
  deriveStatsFilterOptions,
  EMPTY_SHOW_STATS_FILTERS,
  UNKNOWN_BREED,
} from '../analytics-filters';
import type { StatsEntry } from '../analytics-utils';

function e(overrides: Partial<StatsEntry> & { id: string }): StatsEntry {
  return {
    dogId: 'd',
    dogCallName: 'Rex',
    showId: 's',
    showName: '',
    showDate: '',
    classId: 'c',
    className: 'C',
    classElement: 'Interior',
    classLevel: 'Novice',
    resultText: 'Q',
    searchTimeSeconds: 30,
    totalFaults: 0,
    finalPlacement: 1,
    breed: 'Beagle',
    trialId: 't1',
    trialDate: '2026-03-14',
    judgeIds: ['j1'],
    ...overrides,
  };
}

const ENTRIES = [
  e({ id: '1' }),
  e({
    id: '2',
    breed: 'Lab',
    trialId: 't2',
    trialDate: '2026-03-15',
    judgeIds: ['j2'],
    classElement: 'Exterior',
    classLevel: 'Excellent',
    resultText: 'NQ',
  }),
  e({ id: '3', breed: undefined, resultText: 'pending' }),
];

describe('applyStatsFilters', () => {
  it('passes everything with no filter', () => {
    expect(applyStatsFilters(ENTRIES, EMPTY_SHOW_STATS_FILTERS)).toHaveLength(3);
  });

  it.each([
    ['breed', 'Lab', ['2']],
    ['breed', UNKNOWN_BREED, ['3']],
    ['judge', 'j2', ['2']],
    ['date', '2026-03-15', ['2']],
    ['trial', 't1', ['1', '3']],
    ['element', 'Exterior', ['2']],
    ['level', 'Novice', ['1', '3']],
  ] as const)('filters by %s=%s', (key, value, ids) => {
    const out = applyStatsFilters(ENTRIES, { ...EMPTY_SHOW_STATS_FILTERS, [key]: value });
    expect(out.map(x => x.id)).toEqual(ids);
  });

  it('combines filters with AND', () => {
    const out = applyStatsFilters(ENTRIES, {
      ...EMPTY_SHOW_STATS_FILTERS,
      trial: 't1',
      breed: 'Lab',
    });
    expect(out).toEqual([]);
  });
});

describe('deriveStatsFilterOptions', () => {
  it('offers only values present, with judge names and ISO-ordered dates', () => {
    const o = deriveStatsFilterOptions(ENTRIES, new Map([['j1', 'Ann Judge']]));
    expect(o.breed.map(x => x.value)).toEqual(['Beagle', 'Lab', UNKNOWN_BREED]);
    expect(o.judge).toEqual([
      { value: 'j1', label: 'Ann Judge' },
      { value: 'j2', label: 'Unknown judge' },
    ]);
    expect(o.date.map(x => x.value)).toEqual(['2026-03-14', '2026-03-15']);
    expect(o.element.map(x => x.value)).toEqual(['Exterior', 'Interior']);
  });
});

describe('computeBreedPerformance', () => {
  it('rates scored entries per breed, ignoring pending, most-scored first', () => {
    const rows = computeBreedPerformance([
      ...ENTRIES,
      e({ id: '4', breed: 'Lab' }),
      e({ id: '5', breed: 'Lab' }),
    ]);
    expect(rows[0]).toMatchObject({ breed: 'Lab', scored: 3, qualified: 2 });
    expect(rows.find(r => r.breed === UNKNOWN_BREED)).toBeUndefined();
    expect(rows[0]!.qualificationRate).toBeCloseTo(2 / 3);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 12 }, (_, i) => e({ id: `${i}`, breed: `B${i}` }));
    expect(computeBreedPerformance(many)).toHaveLength(10);
  });
});
