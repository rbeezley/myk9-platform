import { describe, expect, it } from 'vitest';
import type { ExhibitorResult } from './useExhibitorResults';
import { countUnreleased, onlyReleasedResults } from './releasedExhibitorResults';
import { computePerformanceStats } from '@/services/performanceStatsEngine';
import { mapExhibitorResultToLeg } from '@/services/titleEngine';

function row(id: string, resultsReleasedAt: string | null): ExhibitorResult {
  return {
    id,
    dogId: 'dog-a',
    dogName: 'Willow',
    dogCallName: 'Willow',
    showId: 's',
    classId: 'c',
    trialId: 't',
    className: 'Interior Advanced',
    classLevel: 'Advanced',
    classElement: 'Interior',
    resultText: 'Q',
    resultStatus: 'qualified',
    searchTimeSeconds: 30,
    totalFaults: 0,
    finalPlacement: 1,
    scoringCompletedAt: '2026-10-01T00:00:00Z',
    showName: 'Show',
    showDate: '2026-10-01',
    resultsReleasedAt,
  };
}

describe('onlyReleasedResults (MYK9-1178)', () => {
  const rows = [
    row('released', '2026-10-02T00:00:00Z'),
    row('prelim-1', null),
    row('prelim-2', null),
  ];

  it('counts exactly the rows the released gate drops', () => {
    expect(countUnreleased(rows)).toBe(2);
    expect(countUnreleased(rows.slice(0, 1))).toBe(0);
  });

  it('keeps released rows and drops unreleased ones', () => {
    expect(onlyReleasedResults(rows).map(r => r.id)).toEqual(['released']);
  });

  it('gives statistics a Q count of 1 for one released and two unreleased Qs', () => {
    const stats = computePerformanceStats(onlyReleasedResults(rows), []);
    expect(stats.overall.total).toBe(1);
    expect(stats.overall.qualified).toBe(1);
  });

  it('gives title progress one leg for one released and two unreleased Qs', () => {
    const legs = onlyReleasedResults(rows)
      .map(mapExhibitorResultToLeg)
      .filter(l => l !== null);
    expect(legs).toHaveLength(1);
  });
});
