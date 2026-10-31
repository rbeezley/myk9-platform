import { describe, it, expect } from 'vitest';
import { areaCountRangeFor, needsAreaCount } from './areaCountChoices';
import { buildClassInfo } from './atShowDataAdapter';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

const table = { 'Interior|Master': { min: 2, max: 3 } };

describe('areaCountChoices (MYK9-1625)', () => {
  it('offers the allowed counts only for a class named in the table', () => {
    expect(areaCountRangeFor('Interior', 'Master', table)).toEqual({ min: 2, max: 3 });
    expect(areaCountRangeFor('Interior', 'Novice', table)).toBeNull();
    expect(areaCountRangeFor(undefined, undefined, table)).toBeNull();
  });

  it('needs a count only while a flexible class has none and is still to be run', () => {
    const base = { element: 'Interior', level: 'Master', classStatus: 'upcoming' };
    expect(needsAreaCount({ ...base }, table)).toBe(true);
    expect(needsAreaCount({ ...base, areaCount: 3 }, table)).toBe(false);
    expect(needsAreaCount({ ...base, classStatus: 'completed' }, table)).toBe(false);
    expect(needsAreaCount({ ...base, level: 'Novice' }, table)).toBe(false);
  });

  it('a saved count reaches the class info the Max Time dialog is built from', () => {
    const cls = { id: 'c1', areaCount: 3 } as ReplicatedClass;
    expect(buildClassInfo(cls, null, [], [], true).areas).toBe(3);
  });
});
