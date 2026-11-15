import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { calculatePlacements } from '../types';
import type { ScoringEntry, ScoringResult } from '../types';

// MYK9-2005: the same cases run through the server's recalculate_class_placements in
// supabase/tests/myk9_2005_qualified_time_test.sql (section D). Both read this file's cases.
interface FixtureEntry {
  key: string;
  status: 'qualified' | 'not_qualified' | 'excused' | 'absent';
  faults: number;
  time: number | null;
}
interface FixtureCase {
  name: string;
  entries: FixtureEntry[];
  expected: Record<string, number | null>;
}

const QUALIFICATION: Record<FixtureEntry['status'], ScoringResult['qualification']> = {
  qualified: 'Qualified',
  not_qualified: 'Not Qualified',
  excused: 'Excused',
  absent: 'Absent',
};

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../../../supabase/tests/fixtures/qualified-ranking/cases.json'),
    'utf8'
  )
) as { cases: FixtureCase[] };

function toScoringEntry(entry: FixtureEntry, index: number): ScoringEntry {
  return {
    id: index + 1,
    entryId: entry.key,
    classId: 'class-1',
    dogId: `dog-${entry.key}`,
    callName: entry.key,
    handler: 'Handler',
    breed: 'Test Breed',
    armband: index + 1,
    status: 'scored',
    inRing: false,
    isScored: true,
    exhibitorOrder: index + 1,
    result: {
      time: entry.time ?? 0,
      faults: entry.faults,
      qualification: QUALIFICATION[entry.status],
    },
  };
}

describe('qualified ranking shared with the server (MYK9-2005)', () => {
  it('reads at least one case', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  it.each(fixture.cases.map(c => [c.name, c] as const))('%s', (_name, fixtureCase) => {
    const placed = calculatePlacements(fixtureCase.entries.map(toScoringEntry));
    const actual = Object.fromEntries(placed.map(e => [e.entryId, e.placement ?? null]));
    expect(actual).toEqual(fixtureCase.expected);
  });
});
