import { describe, expect, it } from 'vitest';
import type { ClassEntry } from '@myk9/ringside';
import {
  classMatchesSearch,
  classMatchesTab,
  countByTab,
  sortClassCards,
} from './atShowClassListFilter';

function card(overrides: Partial<ClassEntry> = {}): ClassEntry {
  return {
    id: 'c',
    element: 'Container',
    level: 'Novice',
    section: '',
    class_name: 'Container Novice',
    class_order: 1,
    judge_name: 'Jane Judge',
    entry_count: 4,
    completed_count: 0,
    class_status: 'setup',
    is_favorite: false,
    dogs: [],
    ...overrides,
  } as ClassEntry;
}

const idle = card({ id: 'idle' });
const live = card({ id: 'live', class_status: 'in_progress' });
const done = card({ id: 'done', class_status: 'completed', completed_count: 4 });
const faved = card({ id: 'faved', is_favorite: true });
const favedDone = card({
  id: 'faved-done',
  is_favorite: true,
  class_status: 'completed',
  completed_count: 4,
});

describe('classMatchesTab', () => {
  it('Pending is everything not completed, live classes included', () => {
    expect([idle, live, done, faved].map(c => classMatchesTab(c, 'pending'))).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });

  it('In Progress is only the classes being run', () => {
    expect([idle, live, done].map(c => classMatchesTab(c, 'in-progress'))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('Favorites and Completed are independent of each other', () => {
    expect(classMatchesTab(favedDone, 'favorites')).toBe(true);
    expect(classMatchesTab(favedDone, 'completed')).toBe(true);
    expect(classMatchesTab(favedDone, 'pending')).toBe(false);
  });
});

describe('countByTab', () => {
  it('counts each tab from the same predicate the tab filters with', () => {
    expect(countByTab([idle, live, done, faved, favedDone])).toEqual({
      pending: 3,
      'in-progress': 1,
      favorites: 2,
      completed: 2,
    });
  });

  it('is all zeros for an empty list', () => {
    expect(countByTab([])).toEqual({ pending: 0, 'in-progress': 0, favorites: 0, completed: 0 });
  });
});

describe('classMatchesSearch', () => {
  const entry = card({
    class_name: 'Interior Excellent',
    element: 'Interior',
    level: 'Excellent',
    section: 'B',
    judge_name: 'Pat Morgan',
  });

  it.each([
    ['class name', 'interior excellent'],
    ['element', 'INTERIOR'],
    ['level', 'excel'],
    ['judge', 'morgan'],
    ['section', 'b'],
  ])('matches on %s', (_field, query) => {
    expect(classMatchesSearch(entry, query)).toBe(true);
  });

  it('needs every word to match somewhere', () => {
    expect(classMatchesSearch(entry, 'morgan excellent')).toBe(true);
    expect(classMatchesSearch(entry, 'morgan novice')).toBe(false);
  });

  it('matches everything for a blank query', () => {
    expect(classMatchesSearch(entry, '   ')).toBe(true);
  });
});

describe('sortClassCards', () => {
  const containerMaster = card({ id: 'cm', element: 'Container', level: 'Master' });
  const containerNovice = card({ id: 'cn', element: 'Container', level: 'Novice' });
  const interiorNovice = card({ id: 'in', element: 'Interior', level: 'Novice' });
  const buriedAdvanced = card({ id: 'ba', element: 'Buried', level: 'Advanced' });
  const list = [containerMaster, interiorNovice, buriedAdvanced, containerNovice];
  const ids = (cards: ClassEntry[]) => cards.map(c => c.id);

  it('Run Order leaves the page order untouched', () => {
    expect(sortClassCards(list, 'run-order')).toBe(list);
  });

  it('Element → Level groups by element, then ranks levels Novice to Master', () => {
    expect(ids(sortClassCards(list, 'element-level'))).toEqual(['ba', 'cn', 'cm', 'in']);
  });

  it('Level → Element groups by level rank, then element', () => {
    expect(ids(sortClassCards(list, 'level-element'))).toEqual(['cn', 'in', 'ba', 'cm']);
  });

  it('does not mutate its input', () => {
    const before = ids(list);
    sortClassCards(list, 'element-level');
    expect(ids(list)).toEqual(before);
  });
});
