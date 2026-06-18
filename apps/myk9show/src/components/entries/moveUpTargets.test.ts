import { describe, expect, it } from 'vitest';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';
import { getAvailableMoveUpTargets, hasConfiguredCapacity } from './moveUpTargets';

/** Build a ClassWithCapacity with sensible defaults (open spots, no cap). */
function makeClass(overrides: Partial<ClassWithCapacity> & { id: string }): ClassWithCapacity {
  return {
    name: overrides.id,
    class_number: null,
    max_entries: null,
    trial_id: 'trial-1',
    accepted_count: 0,
    available_spots: 999,
    element: null,
    level: null,
    section: null,
    ...overrides,
  };
}

// Mirrors the seed-demo show: one class per (element, level) pair plus a
// Buried Master to exercise the reported bug (Scout's Buried Master move-up).
const containerNoviceA = makeClass({
  id: 'container-novice-a',
  name: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  section: 'A',
});
const containerAdvanced = makeClass({
  id: 'container-advanced',
  name: 'Container Advanced',
  element: 'Container',
  level: 'Advanced',
});
const containerMaster = makeClass({
  id: 'container-master',
  name: 'Container Master',
  element: 'Container',
  level: 'Master',
});
const interiorNoviceB = makeClass({
  id: 'interior-novice-b',
  name: 'Interior Novice B',
  element: 'Interior',
  level: 'Novice',
  section: 'B',
});
const interiorAdvanced = makeClass({
  id: 'interior-advanced',
  name: 'Interior Advanced',
  element: 'Interior',
  level: 'Advanced',
});
const exteriorExcellent = makeClass({
  id: 'exterior-excellent',
  name: 'Exterior Excellent',
  element: 'Exterior',
  level: 'Excellent',
});
const buriedMaster = makeClass({
  id: 'buried-master',
  name: 'Buried Master',
  element: 'Buried',
  level: 'Master',
});

describe('getAvailableMoveUpTargets', () => {
  it('excludes lower levels, equal level, and cross-element classes (the F3 bug)', () => {
    // Scout's Buried Master request — the bug offered Novice/Advanced/Excellent
    // cross-element classes. The only higher Buried level (Detective) is absent,
    // so there is no valid target.
    const all = [
      containerNoviceA,
      interiorNoviceB,
      interiorAdvanced,
      exteriorExcellent,
      buriedMaster,
    ];

    const targets = getAvailableMoveUpTargets(all, buriedMaster.id);

    expect(targets).toEqual([]);
    // Explicitly: none of the invalid options the bug surfaced.
    const ids = targets.map(c => c.id);
    expect(ids).not.toContain(containerNoviceA.id);
    expect(ids).not.toContain(interiorNoviceB.id);
    expect(ids).not.toContain(interiorAdvanced.id);
    expect(ids).not.toContain(exteriorExcellent.id);
  });

  it('offers only higher levels within the same element', () => {
    const all = [
      containerNoviceA,
      containerAdvanced,
      containerMaster,
      interiorAdvanced,
      exteriorExcellent,
    ];

    const targets = getAvailableMoveUpTargets(all, containerNoviceA.id);
    const ids = targets.map(c => c.id);

    // Higher Container levels only.
    expect(ids).toEqual([containerAdvanced.id, containerMaster.id]);
    // Never the current class, a different element, or a lower/equal level.
    expect(ids).not.toContain(containerNoviceA.id);
    expect(ids).not.toContain(interiorAdvanced.id);
    expect(ids).not.toContain(exteriorExcellent.id);
  });

  it('excludes the current class even when its level matches', () => {
    const targets = getAvailableMoveUpTargets([containerAdvanced, containerMaster], containerAdvanced.id);
    expect(targets.map(c => c.id)).toEqual([containerMaster.id]);
  });

  it('excludes full classes (no available spots)', () => {
    const fullMaster = { ...containerMaster, available_spots: 0 };
    const targets = getAvailableMoveUpTargets([containerAdvanced, fullMaster], containerAdvanced.id);
    expect(targets).toEqual([]);
  });

  it('returns [] when the current class id is missing or unresolvable', () => {
    expect(getAvailableMoveUpTargets([containerAdvanced], null)).toEqual([]);
    expect(getAvailableMoveUpTargets([containerAdvanced], 'does-not-exist')).toEqual([]);
  });

  it('returns [] when the current class has no element/level to compare against', () => {
    const unstructured = makeClass({ id: 'mystery', element: null, level: null });
    const targets = getAvailableMoveUpTargets([unstructured, containerMaster], unstructured.id);
    expect(targets).toEqual([]);
  });
});

describe('hasConfiguredCapacity', () => {
  it('is true only when max_entries is a real number', () => {
    expect(hasConfiguredCapacity({ max_entries: 10 })).toBe(true);
    expect(hasConfiguredCapacity({ max_entries: 0 })).toBe(true);
    expect(hasConfiguredCapacity({ max_entries: null })).toBe(false);
  });
});
