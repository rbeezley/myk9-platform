import { describe, expect, it } from 'vitest';
import type { ClassInfo } from '../ClassesTab';
import {
  CLASSES_TAB_DEFAULT_FILTERS,
  activeClassesTabViewId,
  buildClassesTabViews,
  classesTabViewFilters,
  filterClassesForTab,
} from '../classesTabViews';

function cls(patch: Partial<ClassInfo> & Pick<ClassInfo, 'id'>): ClassInfo {
  return {
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    section: '',
    judgeName: 'Judge',
    trialId: 't1',
    time: '9:00 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 0,
    userHasEntry: false,
    ...patch,
  };
}

// 20-class show, 2 owned by the signed-in secretary — the Oct 10 rehearsal
// shape (opened on "My Classes (2)" of 20).
const rehearsalClasses: ClassInfo[] = [
  ...Array.from({ length: 18 }, (_, i) => cls({ id: `other-${i}`, userHasEntry: false })),
  cls({ id: 'mine-1', userHasEntry: true }),
  cls({ id: 'mine-2', userHasEntry: true }),
];

describe('CLASSES_TAB_DEFAULT_FILTERS', () => {
  it('defaults to the whole show, never scoped to the signed-in user (Oct 10 rehearsal fix)', () => {
    expect(CLASSES_TAB_DEFAULT_FILTERS).toEqual({ status: 'all', mine: false });
    expect(filterClassesForTab(rehearsalClasses, CLASSES_TAB_DEFAULT_FILTERS)).toHaveLength(20);
  });
});

describe('filterClassesForTab', () => {
  const classes: ClassInfo[] = [
    cls({ id: 'not-started', status: 'Scheduled', entryCount: 5, scoredCount: 0 }),
    cls({
      id: 'completed',
      status: 'Completed',
      entryCount: 5,
      scoredCount: 5,
      isScoringFinalized: true,
    }),
    cls({ id: 'mine', userHasEntry: true, status: 'Scheduled', entryCount: 1, scoredCount: 0 }),
  ];

  it('"all" (mine=false) returns every class', () => {
    expect(filterClassesForTab(classes, { status: 'all', mine: false })).toHaveLength(3);
  });

  it('"pending" excludes only completed classes', () => {
    const result = filterClassesForTab(classes, { status: 'pending', mine: false });
    expect(result.map(c => c.id)).toEqual(['not-started', 'mine']);
  });

  it('"completed" keeps only completed classes', () => {
    const result = filterClassesForTab(classes, { status: 'completed', mine: false });
    expect(result.map(c => c.id)).toEqual(['completed']);
  });

  it('mine=true scopes to the signed-in user\'s entered classes first', () => {
    const result = filterClassesForTab(classes, { status: 'all', mine: true });
    expect(result.map(c => c.id)).toEqual(['mine']);
  });
});

describe('Classes tab views', () => {
  it('counts each view over the whole show (view counts match the rows the view actually shows)', () => {
    const views = buildClassesTabViews(rehearsalClasses);
    expect(views.map(v => [v.id, v.count])).toEqual([
      ['all', 20],
      ['pending', 20],
      ['completed', 0],
      ['mine', 2],
    ]);
  });

  it('the default state matches the "all" view, never "mine"', () => {
    expect(activeClassesTabViewId(CLASSES_TAB_DEFAULT_FILTERS)).toBe('all');
  });

  it('selecting "mine" applies status=all, mine=true', () => {
    expect(classesTabViewFilters('mine')).toEqual({ status: 'all', mine: true });
  });

  it('an unknown view id falls back to "all"', () => {
    expect(classesTabViewFilters('nope')).toEqual({ status: 'all', mine: false });
  });
});
