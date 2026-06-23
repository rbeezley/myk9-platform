/**
 * Integration test: score → placement → exhibitor-visible rank + Q/NQ
 *
 * Seam: calculatePlacements() in apps/myk9show/src/pages/scoring/types.ts:136
 *   Input:  ScoringEntry[]  (each entry carries entryId, isScored, result?)
 *   Output: ScoringEntry[]  (qualifying entries gain a `placement` number;
 *                            non-qualifying entries have no `placement` field)
 *   Rank:   fewest faults first, then fastest time ascending; NQ / Absent /
 *           Excused / Withdrawn and time=0 entries are unplaced
 *
 * This file pins the end-to-end contract as a single named seam so a future
 * output-field rename or sort-direction change is caught immediately.
 * See also the companion unit tests in
 *   apps/myk9show/src/pages/scoring/__tests__/calculatePlacements.test.ts
 */

import { describe, it, expect } from 'vitest';
import { calculatePlacements } from '../../pages/scoring/types';
import type { ScoringEntry, ScoringResult } from '../../pages/scoring/types';

function makeEntry(
  entryId: string,
  overrides: Partial<ScoringEntry> = {},
  result?: Partial<ScoringResult>
): ScoringEntry {
  const base: ScoringEntry = {
    id: parseInt(entryId.replace(/\D/g, ''), 10) || 1,
    entryId,
    classId: 'class-integration',
    dogId: `dog-${entryId}`,
    callName: `Dog ${entryId}`,
    handler: `Handler ${entryId}`,
    breed: 'Mixed',
    armband: parseInt(entryId.replace(/\D/g, ''), 10) || 1,
    status: 'pending',
    inRing: false,
    isScored: false,
    exhibitorOrder: 1,
    ...overrides,
  };
  if (result) {
    base.result = { time: 0, faults: 0, qualification: 'Qualified', ...result };
    base.isScored = true;
    base.status = 'scored';
  }
  return base;
}

describe('score → placement → exhibitor-visible rank (integration contract)', () => {
  it('ranks 3 qualified + 1 NQ: Q entries placed 1/2/3 in correct order, NQ has no placement', () => {
    // Intended rank: e4 (0 faults, 20 s) → 1st; e1 (0 faults, 30 s) → 2nd; e3 (1 fault, 15 s) → 3rd
    // e2 is NQ even though it posted the fastest raw time — should receive no placement
    const entries = [
      makeEntry('e1', {}, { time: 30000, faults: 0, qualification: 'Qualified' }),
      makeEntry('e2', {}, { time: 10000, faults: 0, qualification: 'Not Qualified' }),
      makeEntry('e3', {}, { time: 15000, faults: 1, qualification: 'Qualified' }),
      makeEntry('e4', {}, { time: 20000, faults: 0, qualification: 'Qualified' }),
    ];

    const byId = new Map(calculatePlacements(entries).map(e => [e.entryId, e]));

    expect(byId.get('e4')?.placement).toBe(1); // 0 faults, fastest Q time
    expect(byId.get('e1')?.placement).toBe(2); // 0 faults, slower Q time
    expect(byId.get('e3')?.placement).toBe(3); // 1 fault, regardless of time
    expect(byId.get('e2')?.placement).toBeUndefined(); // NQ: no placement awarded
  });

  it('breaks a tie in faults by fastest time: the exhibitor-visible rank field is `placement`', () => {
    const entries = [
      makeEntry('slow', {}, { time: 45000, faults: 0, qualification: 'Qualified' }),
      makeEntry('fast', {}, { time: 22000, faults: 0, qualification: 'Qualified' }),
    ];
    const byId = new Map(calculatePlacements(entries).map(e => [e.entryId, e]));
    // Assert the exact output field name the results surface reads
    expect(byId.get('fast')?.placement).toBe(1);
    expect(byId.get('slow')?.placement).toBe(2);
  });

  it('all-NQ class: no entry receives a placement', () => {
    const entries = [
      makeEntry('n1', {}, { time: 25000, faults: 0, qualification: 'Not Qualified' }),
      makeEntry('n2', {}, { time: 18000, faults: 3, qualification: 'Not Qualified' }),
    ];
    expect(calculatePlacements(entries).every(e => e.placement === undefined)).toBe(true);
  });

  it('empty class: returns an empty array without throwing', () => {
    expect(calculatePlacements([])).toEqual([]);
  });
});
