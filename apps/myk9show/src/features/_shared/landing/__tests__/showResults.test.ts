import { describe, expect, it } from 'vitest';
import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';
import { buildShowResults } from '../showResults';

const show = { id: 'show-1', startDate: '2020-10-17', endDate: '2020-10-18' };

function row(id: string, fields: Partial<ClassInfo>): ClassInfo {
  return {
    trialId: 'trial-1',
    resultsReleasedAt: '2020-10-18T20:00:00Z',
    ...fields,
  } as ClassInfo;
}

describe('buildShowResults class labels (MYK9-1288)', () => {
  it('keeps UKC A/B sections distinct for the warm-store row shape (name = element + level)', () => {
    const results = buildShowResults(show, [
      row('a', {
        id: 'a',
        name: 'Vehicle Novice',
        element: 'Vehicle',
        level: 'Novice',
        section: 'A',
      }),
      row('b', {
        id: 'b',
        name: 'Vehicle Novice',
        element: 'Vehicle',
        level: 'Novice',
        section: 'B',
      }),
    ]);

    expect(results?.released.map(cls => cls.name)).toEqual([
      'Vehicle Novice A',
      'Vehicle Novice B',
    ]);
  });

  it('keeps sections distinct for the public row shape (name from the row)', () => {
    const results = buildShowResults(show, [
      row('a', {
        id: 'a',
        name: 'Interior Novice',
        element: 'Interior',
        level: 'Novice',
        section: 'A',
      }),
      row('b', {
        id: 'b',
        name: 'Interior Novice',
        element: 'Interior',
        level: 'Novice',
        section: 'B',
      }),
    ]);

    expect(new Set(results?.released.map(cls => cls.name)).size).toBe(2);
  });

  it('falls back to the stored name when element and level are unresolved', () => {
    const results = buildShowResults(show, [
      row('a', { id: 'a', name: 'Special Class', element: '', level: '', section: '' }),
    ]);

    expect(results?.released[0]?.name).toBe('Special Class');
  });
});
