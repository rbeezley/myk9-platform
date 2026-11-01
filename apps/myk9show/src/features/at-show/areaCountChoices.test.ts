import { describe, it, expect } from 'vitest';
import { areaCountRangeFor, needsAreaCount, FLEXIBLE_AREA_COUNTS } from './areaCountChoices';
import { buildClassInfo } from './atShowDataAdapter';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

const table = { 'AKC|Interior|Master': { min: 2, max: 3 } };

describe('areaCountChoices (MYK9-1625)', () => {
  it('offers the allowed counts only for a class named in the table', () => {
    expect(areaCountRangeFor('AKC', 'Interior', 'Master', table)).toEqual({ min: 2, max: 3 });
    expect(areaCountRangeFor('AKC', 'Interior', 'Novice', table)).toBeNull();
    expect(areaCountRangeFor('UKC', 'Interior', 'Master', table)).toBeNull();
    expect(areaCountRangeFor(undefined, 'Interior', 'Master', table)).toBeNull();
    expect(areaCountRangeFor('AKC', undefined, undefined, table)).toBeNull();
  });

  it('needs a count only while a flexible class has none and is still to be run', () => {
    const base = { element: 'Interior', level: 'Master', classStatus: 'upcoming' };
    expect(needsAreaCount('AKC', { ...base }, table)).toBe(true);
    expect(needsAreaCount('AKC', { ...base, areaCount: 3 }, table)).toBe(false);
    expect(needsAreaCount('AKC', { ...base, classStatus: 'completed' }, table)).toBe(false);
    expect(needsAreaCount('AKC', { ...base, level: 'Novice' }, table)).toBe(false);
  });

  it('ASCA Interior Advanced and Excellent choose 1 or 2; AKC Interior Excellent is fixed', () => {
    expect(areaCountRangeFor('ASCA', 'Interior', 'Advanced')).toEqual({ min: 1, max: 2 });
    expect(areaCountRangeFor('ASCA', 'Interior', 'Excellent')).toEqual({ min: 1, max: 2 });
    expect(areaCountRangeFor('ASCA', 'Interior', 'Open')).toBeNull();
    expect(areaCountRangeFor('AKC', 'Interior', 'Excellent')).toBeNull();
    const unset = { element: 'Interior', level: 'Excellent', classStatus: 'upcoming' };
    expect(needsAreaCount('AKC', unset)).toBe(false);
    expect(needsAreaCount('ASCA', unset)).toBe(true);
    // Seeded at 1 (MYK9-1631): offered in the class menu, never prompted.
    expect(needsAreaCount('ASCA', { ...unset, areaCount: 1 })).toBe(false);
    expect(Object.keys(FLEXIBLE_AREA_COUNTS).every(k => k.split('|').length === 3)).toBe(true);
  });

  it('a saved count reaches the class info the Max Time dialog is built from', () => {
    const cls = { id: 'c1', areaCount: 3 } as ReplicatedClass;
    expect(buildClassInfo(cls, null, [], [], true).areas).toBe(3);
  });
});
