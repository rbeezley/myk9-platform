import { describe, expect, it } from 'vitest';
import { filterManagedClasses, type ClassManagementRowLike } from '../classManagementFilters';
import {
  activeClassManagementViewId,
  buildClassManagementViews,
  classManagementViewState,
} from '../classManagementViews';

function cls(patch: Partial<ClassManagementRowLike>): ClassManagementRowLike {
  return {
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    status: null,
    ...patch,
  };
}

const classes: ClassManagementRowLike[] = [
  cls({ name: 'Container Novice A', element: 'Container', status: 'scheduled' }), // not_started
  cls({ name: 'Interior Novice A', element: 'Interior', status: 'upcoming' }), // not_started
  cls({ name: 'Buried Master', element: 'Buried', level: 'Master', status: 'in_progress' }),
  cls({ name: 'Exterior Excellent', element: 'Exterior', level: 'Excellent', status: 'completed' }),
];

describe('filterManagedClasses', () => {
  it('matches search across name, element and level', () => {
    expect(filterManagedClasses(classes, 'buried', { status: 'all', element: 'all' })).toHaveLength(
      1
    );
    expect(filterManagedClasses(classes, 'master', { status: 'all', element: 'all' })).toHaveLength(
      1
    );
  });

  it('filters by lifecycle status derived from the raw status string', () => {
    expect(
      filterManagedClasses(classes, '', { status: 'not_started', element: 'all' })
    ).toHaveLength(2);
    expect(filterManagedClasses(classes, '', { status: 'completed', element: 'all' })).toHaveLength(
      1
    );
  });

  it('filters by element', () => {
    expect(filterManagedClasses(classes, '', { status: 'all', element: 'Container' })).toHaveLength(
      1
    );
  });
});

describe('Class Management views', () => {
  it('counts each view over the whole trial (view counts match the rows the view actually shows)', () => {
    const views = buildClassManagementViews(classes);
    expect(views.map(v => [v.id, v.count])).toEqual([
      ['all', 4],
      ['not_started', 2],
      ['in_progress', 1],
      ['completed', 1],
    ]);
  });

  it('the default state (no status/element/search) matches the "all" view', () => {
    expect(activeClassManagementViewId({ status: 'all', element: 'all', search: '' })).toBe('all');
  });

  it('a view is active only on an exact match — a coexisting element filter reads as custom', () => {
    expect(
      activeClassManagementViewId({ status: 'not_started', element: 'Container', search: '' })
    ).toBeNull();
    expect(activeClassManagementViewId({ status: 'not_started', element: 'all', search: '' })).toBe(
      'not_started'
    );
  });

  it('a view is active only on an exact match — a coexisting search term reads as custom', () => {
    expect(
      activeClassManagementViewId({ status: 'all', element: 'all', search: 'novice' })
    ).toBeNull();
  });

  it('selecting a view resets element and search to the view preset', () => {
    expect(classManagementViewState('completed')).toEqual({
      status: 'completed',
      element: 'all',
      search: '',
    });
  });

  it('an unknown view id falls back to "all"', () => {
    expect(classManagementViewState('nope')).toEqual({ status: 'all', element: 'all', search: '' });
  });
});
