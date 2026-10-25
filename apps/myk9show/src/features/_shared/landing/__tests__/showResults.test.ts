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

  // Warm-store rows carry a REBUILT display name (element + level) and the stored name in
  // `className`; public rows carry the stored name in `name`. Both must disambiguate.
  const warm = (id: string, stored: string, releasedAt: string | null): ClassInfo =>
    row(id, {
      id,
      name: 'Interior Advanced',
      className: stored,
      element: 'Interior',
      level: 'Advanced',
      section: '',
      resultsReleasedAt: releasedAt,
    });
  const pub = (id: string, stored: string, releasedAt: string | null): ClassInfo =>
    row(id, {
      id,
      name: stored,
      element: 'Interior',
      level: 'Advanced',
      section: '',
      resultsReleasedAt: releasedAt,
    });

  it.each([
    ['warm-store', warm],
    ['public', pub],
  ])('labels same-trial classes differing only by name distinctly (%s rows)', (_shape, make) => {
    const results = buildShowResults(show, [
      make('a', 'Interior Advanced', '2020-10-18T20:00:00Z'),
      make('b', 'Interior Advanced Preliminary', '2020-10-18T20:00:00Z'),
    ]);

    const labels = results?.released.map(cls => cls.name);
    expect(new Set(labels).size).toBe(2);
    expect(labels).toContain('Interior Advanced Preliminary');
  });

  it.each([
    ['warm-store', warm],
    ['public', pub],
  ])('disambiguates a released class against its withheld sibling (%s rows)', (_shape, make) => {
    const results = buildShowResults(show, [
      make('a', 'Interior Advanced', '2020-10-18T20:00:00Z'),
      make('b', 'Interior Advanced Preliminary', null),
    ]);

    // The sibling is withheld, so it is never listed; the released one is the plain label.
    expect(results?.released.map(cls => cls.id)).toEqual(['a']);
    const only = buildShowResults(show, [
      make('b', 'Interior Advanced Preliminary', '2020-10-18T20:00:00Z'),
      make('a', 'Interior Advanced', null),
    ]);
    expect(only?.released.map(cls => cls.name)).toEqual(['Interior Advanced Preliminary']);
  });
});
