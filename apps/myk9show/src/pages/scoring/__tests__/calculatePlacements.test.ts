import { describe, it, expect } from 'vitest';
import { calculatePlacements } from '../types';
import type { ScoringEntry, ScoringResult } from '../types';

function makeEntry(
  entryId: string,
  overrides: Partial<ScoringEntry> = {},
  result?: Partial<ScoringResult>
): ScoringEntry {
  const base: ScoringEntry = {
    id: parseInt(entryId.replace(/\D/g, ''), 10) || 1,
    entryId,
    classId: 'class-1',
    dogId: `dog-${entryId}`,
    callName: `Dog ${entryId}`,
    handler: `Handler ${entryId}`,
    breed: 'Test Breed',
    armband: parseInt(entryId.replace(/\D/g, ''), 10) || 1,
    status: 'pending',
    inRing: false,
    isScored: false,
    exhibitorOrder: 1,
    ...overrides,
  };
  if (result) {
    base.result = {
      time: 0,
      faults: 0,
      qualification: 'Qualified',
      ...result,
    };
    base.isScored = true;
    base.status = 'scored';
  }
  return base;
}

describe('calculatePlacements', () => {
  it('returns an empty array for empty input', () => {
    expect(calculatePlacements([])).toEqual([]);
  });

  it('assigns no placements when no entries are scored', () => {
    const entries = [makeEntry('e1'), makeEntry('e2')];
    const result = calculatePlacements(entries);
    expect(result.every(e => e.placement === undefined)).toBe(true);
  });

  it('assigns no placements when all entries are NQ', () => {
    const entries = [
      makeEntry('e1', {}, { time: 30000, faults: 0, qualification: 'Not Qualified' }),
      makeEntry('e2', {}, { time: 25000, faults: 0, qualification: 'Not Qualified' }),
    ];
    const result = calculatePlacements(entries);
    expect(result.every(e => e.placement === undefined)).toBe(true);
  });

  it('skips Absent / Excused / Withdrawn entries', () => {
    const entries = [
      makeEntry('a', {}, { time: 30000, qualification: 'Absent' }),
      makeEntry('b', {}, { time: 30000, qualification: 'Excused' }),
      makeEntry('c', {}, { time: 30000, qualification: 'Withdrawn' }),
      makeEntry('d', {}, { time: 30000, qualification: 'Qualified' }),
    ];
    const byId = new Map(calculatePlacements(entries).map(e => [e.entryId, e]));
    expect(byId.get('a')?.placement).toBeUndefined();
    expect(byId.get('b')?.placement).toBeUndefined();
    expect(byId.get('c')?.placement).toBeUndefined();
    expect(byId.get('d')?.placement).toBe(1);
  });

  it('ranks qualified entries fewest faults first', () => {
    const entries = [
      makeEntry('a', {}, { time: 20000, faults: 2, qualification: 'Qualified' }),
      makeEntry('b', {}, { time: 30000, faults: 0, qualification: 'Qualified' }),
      makeEntry('c', {}, { time: 25000, faults: 1, qualification: 'Qualified' }),
    ];
    const byId = new Map(calculatePlacements(entries).map(e => [e.entryId, e]));
    expect(byId.get('b')?.placement).toBe(1);
    expect(byId.get('c')?.placement).toBe(2);
    expect(byId.get('a')?.placement).toBe(3);
  });

  it('breaks faults tie by fastest time', () => {
    const entries = [
      makeEntry('slow', {}, { time: 40000, faults: 0, qualification: 'Qualified' }),
      makeEntry('fast', {}, { time: 20000, faults: 0, qualification: 'Qualified' }),
      makeEntry('mid', {}, { time: 30000, faults: 0, qualification: 'Qualified' }),
    ];
    const byId = new Map(calculatePlacements(entries).map(e => [e.entryId, e]));
    expect(byId.get('fast')?.placement).toBe(1);
    expect(byId.get('mid')?.placement).toBe(2);
    expect(byId.get('slow')?.placement).toBe(3);
  });

  it('mixes Q and NQ — only Q entries get placements, in correct order', () => {
    const entries = [
      makeEntry('q1', {}, { time: 30000, faults: 0, qualification: 'Qualified' }),
      makeEntry('nq', {}, { time: 10000, faults: 0, qualification: 'Not Qualified' }),
      makeEntry('q2', {}, { time: 25000, faults: 1, qualification: 'Qualified' }),
      makeEntry('q3', {}, { time: 20000, faults: 0, qualification: 'Qualified' }),
    ];
    const byId = new Map(calculatePlacements(entries).map(e => [e.entryId, e]));
    expect(byId.get('q3')?.placement).toBe(1);
    expect(byId.get('q1')?.placement).toBe(2);
    expect(byId.get('q2')?.placement).toBe(3);
    expect(byId.get('nq')?.placement).toBeUndefined();
  });

  it('excludes qualified entries with time === 0 from placements', () => {
    const entries = [
      makeEntry('zero', {}, { time: 0, faults: 0, qualification: 'Qualified' }),
      makeEntry('real', {}, { time: 30000, faults: 0, qualification: 'Qualified' }),
    ];
    const byId = new Map(calculatePlacements(entries).map(e => [e.entryId, e]));
    expect(byId.get('zero')?.placement).toBeUndefined();
    expect(byId.get('real')?.placement).toBe(1);
  });

  it('does not mutate the input array or its entries', () => {
    const entries = [
      makeEntry('a', {}, { time: 20000, faults: 0, qualification: 'Qualified' }),
      makeEntry('b', {}, { time: 30000, faults: 0, qualification: 'Qualified' }),
    ];
    const snapshot = JSON.parse(JSON.stringify(entries));
    calculatePlacements(entries);
    expect(JSON.parse(JSON.stringify(entries))).toEqual(snapshot);
  });

  it('preserves all original fields on returned entries', () => {
    const entries = [
      makeEntry(
        'a',
        { callName: 'Rex', handler: 'Alice', armband: 42 },
        { time: 20000, faults: 0, qualification: 'Qualified' }
      ),
    ];
    const [out] = calculatePlacements(entries);
    expect(out.callName).toBe('Rex');
    expect(out.handler).toBe('Alice');
    expect(out.armband).toBe(42);
    expect(out.placement).toBe(1);
  });

  it('handles a single qualified entry — placement = 1', () => {
    const entries = [makeEntry('only', {}, { time: 15000, qualification: 'Qualified' })];
    expect(calculatePlacements(entries)[0].placement).toBe(1);
  });

  it('clears stale placement when an entry is now non-qualifying', () => {
    const stale = makeEntry('x', { placement: 1 }, { time: 30000, qualification: 'Not Qualified' });
    const [out] = calculatePlacements([stale]);
    expect(out.placement).toBeUndefined();
  });

  it('clears stale placement when an entry is now Excused', () => {
    const stale = makeEntry('x', { placement: 2 }, { time: 30000, qualification: 'Excused' });
    const [out] = calculatePlacements([stale]);
    expect(out.placement).toBeUndefined();
  });
});
