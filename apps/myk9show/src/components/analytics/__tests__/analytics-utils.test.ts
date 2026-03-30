import { describe, it, expect } from 'vitest';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
  computeQualificationTrend,
  findCleanSweepDogs,
  computeClassBreakdown,
  type StatsEntry,
} from '../analytics-utils';

// ── Test fixtures ──────────────────────────────────────────────────────

function makeEntry(overrides: Partial<StatsEntry> = {}): StatsEntry {
  return {
    id: 'entry-1',
    dogId: 'dog-1',
    dogCallName: 'Rex',
    showId: 'show-1',
    showName: 'Spring Trial',
    showDate: '2026-03-01',
    classId: 'class-1',
    className: 'Novice',
    classElement: 'Containers',
    classLevel: 'NW1',
    resultText: 'Q',
    searchTimeSeconds: 45.2,
    totalFaults: 0,
    finalPlacement: 1,
    trialDate: '2026-04-01',
    trialNumber: '1',
    ...overrides,
  };
}

const mixedEntries: StatsEntry[] = [
  makeEntry({
    id: 'e1',
    dogId: 'dog-1',
    dogCallName: 'Rex',
    resultText: 'Q',
    searchTimeSeconds: 30,
    showId: 'show-1',
    showDate: '2026-01-01',
  }),
  makeEntry({
    id: 'e2',
    dogId: 'dog-1',
    dogCallName: 'Rex',
    resultText: 'Q',
    searchTimeSeconds: 50,
    showId: 'show-1',
    showDate: '2026-01-01',
  }),
  makeEntry({
    id: 'e3',
    dogId: 'dog-1',
    dogCallName: 'Rex',
    resultText: 'NQ',
    searchTimeSeconds: 60,
    showId: 'show-2',
    showDate: '2026-02-01',
  }),
  makeEntry({
    id: 'e4',
    dogId: 'dog-2',
    dogCallName: 'Bella',
    resultText: 'Q',
    searchTimeSeconds: 25,
    showId: 'show-2',
    showDate: '2026-02-01',
  }),
  makeEntry({
    id: 'e5',
    dogId: 'dog-2',
    dogCallName: 'Bella',
    resultText: 'pending',
    searchTimeSeconds: null,
    showId: 'show-2',
    showDate: '2026-02-01',
  }),
  makeEntry({
    id: 'e6',
    dogId: 'dog-3',
    dogCallName: 'Max',
    resultText: 'ABS',
    searchTimeSeconds: null,
    showId: 'show-1',
    showDate: '2026-01-01',
  }),
];

// ── computeSummaryStats ────────────────────────────────────────────────

describe('computeSummaryStats', () => {
  it('returns zeroed stats for empty array', () => {
    const stats = computeSummaryStats([]);
    expect(stats.totalEntries).toBe(0);
    expect(stats.scoredEntries).toBe(0);
    expect(stats.qualifiedCount).toBe(0);
    expect(stats.qualificationRate).toBe(0);
    expect(stats.bestTime).toBeNull();
    expect(stats.bestTimeDogName).toBeNull();
    expect(stats.avgTime).toBeNull();
    expect(stats.medianTime).toBeNull();
  });

  it('excludes pending entries from Q rate denominator', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'Q' }),
      makeEntry({ id: 'e2', resultText: 'NQ' }),
      makeEntry({ id: 'e3', resultText: 'pending' }),
    ];
    const stats = computeSummaryStats(entries);
    expect(stats.totalEntries).toBe(3);
    expect(stats.scoredEntries).toBe(2);
    expect(stats.qualifiedCount).toBe(1);
    // Q rate = 1 / 2 scored = 0.5
    expect(stats.qualificationRate).toBe(0.5);
  });

  it('computes best/avg/median times from qualified entries only', () => {
    const entries = [
      makeEntry({ id: 'e1', dogCallName: 'Rex', resultText: 'Q', searchTimeSeconds: 30 }),
      makeEntry({ id: 'e2', dogCallName: 'Rex', resultText: 'Q', searchTimeSeconds: 50 }),
      makeEntry({ id: 'e3', dogCallName: 'Rex', resultText: 'Q', searchTimeSeconds: 40 }),
      makeEntry({ id: 'e4', dogCallName: 'Rex', resultText: 'NQ', searchTimeSeconds: 10 }), // excluded (NQ)
      makeEntry({ id: 'e5', dogCallName: 'Rex', resultText: 'Q', searchTimeSeconds: null }), // excluded (null time)
    ];
    const stats = computeSummaryStats(entries);
    expect(stats.bestTime).toBe(30);
    expect(stats.bestTimeDogName).toBe('Rex');
    expect(stats.avgTime).toBe(40); // (30+50+40)/3
    expect(stats.medianTime).toBe(40); // middle of [30,40,50]
  });

  it('computes median for even number of qualified times', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'Q', searchTimeSeconds: 20 }),
      makeEntry({ id: 'e2', resultText: 'Q', searchTimeSeconds: 40 }),
    ];
    const stats = computeSummaryStats(entries);
    expect(stats.medianTime).toBe(30); // (20+40)/2
  });

  it('handles all pending entries (zero scored)', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'pending' }),
      makeEntry({ id: 'e2', resultText: 'pending' }),
    ];
    const stats = computeSummaryStats(entries);
    expect(stats.totalEntries).toBe(2);
    expect(stats.scoredEntries).toBe(0);
    expect(stats.qualificationRate).toBe(0);
    expect(stats.bestTime).toBeNull();
    expect(stats.bestTimeDogName).toBeNull();
  });

  it('tracks bestTimeDogName correctly across multiple dogs', () => {
    const entries = [
      makeEntry({ id: 'e1', dogCallName: 'Rex', resultText: 'Q', searchTimeSeconds: 50 }),
      makeEntry({ id: 'e2', dogCallName: 'Bella', resultText: 'Q', searchTimeSeconds: 25 }),
      makeEntry({ id: 'e3', dogCallName: 'Max', resultText: 'Q', searchTimeSeconds: 35 }),
    ];
    const stats = computeSummaryStats(entries);
    expect(stats.bestTime).toBe(25);
    expect(stats.bestTimeDogName).toBe('Bella');
  });
});

// ── computePerDogStats ─────────────────────────────────────────────────

describe('computePerDogStats', () => {
  it('returns empty array for empty input', () => {
    expect(computePerDogStats([])).toEqual([]);
  });

  it('groups entries by dogId correctly', () => {
    const result = computePerDogStats(mixedEntries);
    expect(result).toHaveLength(3);
    const rex = result.find(d => d.dogId === 'dog-1');
    expect(rex).toBeDefined();
    expect(rex!.entries).toBe(3);
  });

  it('computes Q rate and qualifiedCount excluding pending entries', () => {
    const result = computePerDogStats(mixedEntries);
    const bella = result.find(d => d.dogId === 'dog-2');
    // Bella: 1 Q, 1 pending → scored = 1 → rate = 1.0
    expect(bella!.qualifiedCount).toBe(1);
    expect(bella!.qualificationRate).toBe(1);

    const rex = result.find(d => d.dogId === 'dog-1');
    // Rex: 2Q, 1NQ → qualifiedCount = 2
    expect(rex!.qualifiedCount).toBe(2);
  });

  it('sets isCleanSweep true when all scored entries are Q', () => {
    const result = computePerDogStats(mixedEntries);
    const rex = result.find(d => d.dogId === 'dog-1');
    const bella = result.find(d => d.dogId === 'dog-2');
    // Rex: 2Q, 1NQ → not clean sweep
    expect(rex!.isCleanSweep).toBe(false);
    // Bella: 1Q, 1 pending → clean sweep (pending excluded)
    expect(bella!.isCleanSweep).toBe(true);
  });

  it('computes best and avg times from qualified entries with times', () => {
    const result = computePerDogStats(mixedEntries);
    const rex = result.find(d => d.dogId === 'dog-1');
    // Rex Q times: 30, 50
    expect(rex!.bestTime).toBe(30);
    expect(rex!.avgTime).toBe(40);
  });

  it('returns null times when dog has no qualified entries with times', () => {
    const result = computePerDogStats(mixedEntries);
    const max = result.find(d => d.dogId === 'dog-3');
    expect(max!.bestTime).toBeNull();
    expect(max!.avgTime).toBeNull();
  });

  it('isCleanSweep false when dog has zero scored entries', () => {
    const entries = [makeEntry({ id: 'e1', dogId: 'dog-x', resultText: 'pending' })];
    const result = computePerDogStats(entries);
    expect(result[0]!.isCleanSweep).toBe(false);
  });
});

// ── computeResultDistribution ──────────────────────────────────────────

describe('computeResultDistribution', () => {
  it('returns empty array for empty input', () => {
    expect(computeResultDistribution([])).toEqual([]);
  });

  it('excludes pending entries', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'Q' }),
      makeEntry({ id: 'e2', resultText: 'pending' }),
    ];
    const result = computeResultDistribution(entries);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('Q');
  });

  it('omits zero-count statuses', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'Q' }),
      makeEntry({ id: 'e2', resultText: 'NQ' }),
    ];
    const result = computeResultDistribution(entries);
    const statuses = result.map(r => r.status);
    expect(statuses).toContain('Q');
    expect(statuses).toContain('NQ');
    expect(statuses).not.toContain('EX');
    expect(statuses).not.toContain('ABS');
    expect(statuses).not.toContain('WD');
  });

  it('returns items in fixed display order: Q, NQ, EX, ABS, WD', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'WD' }),
      makeEntry({ id: 'e2', resultText: 'Q' }),
      makeEntry({ id: 'e3', resultText: 'ABS' }),
      makeEntry({ id: 'e4', resultText: 'NQ' }),
      makeEntry({ id: 'e5', resultText: 'EX' }),
    ];
    const result = computeResultDistribution(entries);
    const statuses = result.map(r => r.status);
    expect(statuses).toEqual(['Q', 'NQ', 'EX', 'ABS', 'WD']);
  });

  it('assigns correct colors and labels', () => {
    const entries = [makeEntry({ id: 'e1', resultText: 'Q' })];
    const result = computeResultDistribution(entries);
    expect(result[0]!.color).toBe('#10b981');
    expect(result[0]!.label).toBe('Qualified');
  });

  it('counts multiple entries per status', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'Q' }),
      makeEntry({ id: 'e2', resultText: 'Q' }),
      makeEntry({ id: 'e3', resultText: 'NQ' }),
    ];
    const result = computeResultDistribution(entries);
    const q = result.find(r => r.status === 'Q');
    expect(q!.count).toBe(2);
  });
});

// ── computeFastestTimes ────────────────────────────────────────────────

describe('computeFastestTimes', () => {
  it('returns empty array for empty input', () => {
    expect(computeFastestTimes([], 5)).toEqual([]);
  });

  it('excludes non-qualified entries', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'NQ', searchTimeSeconds: 10 }),
      makeEntry({ id: 'e2', resultText: 'Q', searchTimeSeconds: 20 }),
    ];
    const result = computeFastestTimes(entries, 5);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('e2');
  });

  it('excludes entries with null times', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'Q', searchTimeSeconds: null }),
      makeEntry({ id: 'e2', resultText: 'Q', searchTimeSeconds: 20 }),
    ];
    const result = computeFastestTimes(entries, 5);
    expect(result).toHaveLength(1);
  });

  it('sorts by time ascending and assigns 1-based rank', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'Q', searchTimeSeconds: 50 }),
      makeEntry({ id: 'e2', resultText: 'Q', searchTimeSeconds: 20 }),
      makeEntry({ id: 'e3', resultText: 'Q', searchTimeSeconds: 35 }),
    ];
    const result = computeFastestTimes(entries, 5);
    expect(result[0]!.rank).toBe(1);
    expect(result[0]!.searchTimeSeconds).toBe(20);
    expect(result[1]!.rank).toBe(2);
    expect(result[1]!.searchTimeSeconds).toBe(35);
    expect(result[2]!.rank).toBe(3);
    expect(result[2]!.searchTimeSeconds).toBe(50);
  });

  it('respects limit parameter', () => {
    const entries = [
      makeEntry({ id: 'e1', resultText: 'Q', searchTimeSeconds: 10 }),
      makeEntry({ id: 'e2', resultText: 'Q', searchTimeSeconds: 20 }),
      makeEntry({ id: 'e3', resultText: 'Q', searchTimeSeconds: 30 }),
    ];
    const result = computeFastestTimes(entries, 2);
    expect(result).toHaveLength(2);
  });

  it('includes correct fields in output', () => {
    const entries = [
      makeEntry({
        id: 'e1',
        resultText: 'Q',
        searchTimeSeconds: 42,
        dogCallName: 'Rex',
        className: 'Novice',
        classElement: 'Containers',
        classLevel: 'NW1',
        showName: 'Spring Trial',
      }),
    ];
    const result = computeFastestTimes(entries, 5);
    expect(result[0]).toEqual({
      rank: 1,
      id: 'e1',
      dogCallName: 'Rex',
      className: 'Novice',
      classElement: 'Containers',
      classLevel: 'NW1',
      searchTimeSeconds: 42,
      showName: 'Spring Trial',
    });
  });
});

// ── computeQualificationTrend ──────────────────────────────────────────

describe('computeQualificationTrend', () => {
  it('returns empty array for empty input', () => {
    expect(computeQualificationTrend([])).toEqual([]);
  });

  it('groups by showId and sorts by showDate ascending', () => {
    const result = computeQualificationTrend(mixedEntries);
    expect(result).toHaveLength(2);
    expect(result[0]!.showId).toBe('show-1');
    expect(result[1]!.showId).toBe('show-2');
  });

  it('uses scored-only entries for rates (excludes pending)', () => {
    const result = computeQualificationTrend(mixedEntries);
    // show-2: e3(NQ), e4(Q), e5(pending) → scored=2, qualified=1
    const show2 = result.find(t => t.showId === 'show-2');
    expect(show2!.totalEntries).toBe(2);
    expect(show2!.qualifiedCount).toBe(1);
    expect(show2!.qualificationRate).toBe(0.5);
  });

  it('includes showName and showDate', () => {
    const entries = [
      makeEntry({ showId: 's1', showName: 'My Show', showDate: '2026-05-01', resultText: 'Q' }),
    ];
    const result = computeQualificationTrend(entries);
    expect(result[0]!.showName).toBe('My Show');
    expect(result[0]!.showDate).toBe('2026-05-01');
  });

  it('handles show with all pending entries (zero scored)', () => {
    const entries = [
      makeEntry({ id: 'e1', showId: 's1', resultText: 'pending' }),
      makeEntry({ id: 'e2', showId: 's1', resultText: 'pending' }),
    ];
    const result = computeQualificationTrend(entries);
    expect(result[0]!.totalEntries).toBe(0);
    expect(result[0]!.qualificationRate).toBe(0);
  });
});

// ── findCleanSweepDogs ─────────────────────────────────────────────────

describe('findCleanSweepDogs', () => {
  it('returns empty array for empty input', () => {
    expect(findCleanSweepDogs([])).toEqual([]);
  });

  it('finds dogs where all scored entries are Q', () => {
    const result = findCleanSweepDogs(mixedEntries);
    const ids = result.map(d => d.dogId);
    // Bella: 1Q, 1 pending → clean sweep
    expect(ids).toContain('dog-2');
    // Rex: 2Q, 1NQ → not clean sweep
    expect(ids).not.toContain('dog-1');
    // Max: 1 ABS → not clean sweep
    expect(ids).not.toContain('dog-3');
  });

  it('ignores pending when determining clean sweep', () => {
    const entries = [
      makeEntry({ id: 'e1', dogId: 'dog-a', dogCallName: 'Ace', resultText: 'Q' }),
      makeEntry({ id: 'e2', dogId: 'dog-a', dogCallName: 'Ace', resultText: 'pending' }),
      makeEntry({ id: 'e3', dogId: 'dog-a', dogCallName: 'Ace', resultText: 'Q' }),
    ];
    const result = findCleanSweepDogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0]!.dogId).toBe('dog-a');
    expect(result[0]!.totalEntries).toBe(3);
    expect(result[0]!.qualifiedCount).toBe(2);
  });

  it('requires at least 1 scored entry', () => {
    const entries = [
      makeEntry({ id: 'e1', dogId: 'dog-a', dogCallName: 'Ace', resultText: 'pending' }),
    ];
    const result = findCleanSweepDogs(entries);
    expect(result).toEqual([]);
  });

  it('includes dogCallName in results', () => {
    const entries = [makeEntry({ id: 'e1', dogId: 'dog-a', dogCallName: 'Ace', resultText: 'Q' })];
    const result = findCleanSweepDogs(entries);
    expect(result[0]!.dogCallName).toBe('Ace');
  });
});

// ── computeClassBreakdown ──────────────────────────────────────────────

describe('computeClassBreakdown', () => {
  it('returns empty array for empty entries', () => {
    expect(computeClassBreakdown([])).toEqual([]);
  });

  it('groups entries by classId and computes per-class stats', () => {
    const entries: StatsEntry[] = [
      makeEntry({
        id: 'e1',
        classId: 'c1',
        className: 'Containers Novice',
        classElement: 'Containers',
        classLevel: 'Novice',
        resultText: 'Q',
        searchTimeSeconds: 30,
      }),
      makeEntry({
        id: 'e2',
        classId: 'c1',
        className: 'Containers Novice',
        classElement: 'Containers',
        classLevel: 'Novice',
        resultText: 'Q',
        searchTimeSeconds: 45,
      }),
      makeEntry({
        id: 'e3',
        classId: 'c1',
        className: 'Containers Novice',
        classElement: 'Containers',
        classLevel: 'Novice',
        resultText: 'NQ',
        searchTimeSeconds: 60,
      }),
      makeEntry({
        id: 'e4',
        classId: 'c2',
        className: 'Interiors Excellent',
        classElement: 'Interiors',
        classLevel: 'Excellent',
        resultText: 'Q',
        searchTimeSeconds: 20,
      }),
    ];
    const result = computeClassBreakdown(entries);

    expect(result).toHaveLength(2);

    const c1 = result.find(r => r.classId === 'c1')!;
    expect(c1.className).toBe('Containers Novice');
    expect(c1.entryCount).toBe(3);
    expect(c1.qualifiedCount).toBe(2);
    expect(c1.qualificationRate).toBeCloseTo(2 / 3);
    expect(c1.bestTime).toBe(30);
    expect(c1.avgTime).toBeCloseTo(37.5);

    const c2 = result.find(r => r.classId === 'c2')!;
    expect(c2.entryCount).toBe(1);
    expect(c2.qualifiedCount).toBe(1);
    expect(c2.qualificationRate).toBe(1);
    expect(c2.bestTime).toBe(20);
    expect(c2.avgTime).toBe(20);
  });

  it('handles classes with no qualified entries', () => {
    const entries: StatsEntry[] = [
      makeEntry({ id: 'e1', classId: 'c1', resultText: 'NQ', searchTimeSeconds: 50 }),
      makeEntry({ id: 'e2', classId: 'c1', resultText: 'ABS', searchTimeSeconds: null }),
    ];
    const result = computeClassBreakdown(entries);

    expect(result).toHaveLength(1);
    expect(result[0].qualifiedCount).toBe(0);
    expect(result[0].qualificationRate).toBe(0);
    expect(result[0].bestTime).toBeNull();
    expect(result[0].avgTime).toBeNull();
  });

  it('sorts by trialDate, then trialNumber, then element, then level', () => {
    const entries: StatsEntry[] = [
      makeEntry({
        id: 'e1',
        classId: 'c2',
        classElement: 'Interiors',
        classLevel: 'Novice',
        trialDate: '2026-04-01',
        trialNumber: '1',
      }),
      makeEntry({
        id: 'e2',
        classId: 'c1',
        classElement: 'Containers',
        classLevel: 'Novice',
        trialDate: '2026-04-01',
        trialNumber: '1',
      }),
      makeEntry({
        id: 'e3',
        classId: 'c3',
        classElement: 'Containers',
        classLevel: 'Novice',
        trialDate: '2026-03-31',
        trialNumber: '2',
      }),
    ];
    const result = computeClassBreakdown(entries);

    expect(result[0].classId).toBe('c3'); // earliest date
    expect(result[1].classId).toBe('c1'); // same date, Containers < Interiors
    expect(result[2].classId).toBe('c2');
  });

  it('includes pending (unscored) entries in entry count but not Q rate', () => {
    const entries: StatsEntry[] = [
      makeEntry({ id: 'e1', classId: 'c1', resultText: 'Q', searchTimeSeconds: 30 }),
      makeEntry({ id: 'e2', classId: 'c1', resultText: 'pending', searchTimeSeconds: null }),
    ];
    const result = computeClassBreakdown(entries);

    expect(result[0].entryCount).toBe(2);
    expect(result[0].qualifiedCount).toBe(1);
    expect(result[0].qualificationRate).toBe(1); // 1/1 scored
  });
});
