import { describe, expect, it } from 'vitest';
import {
  buildMoveUpClassLabeler,
  buildMoveUpTargets,
  classIdsEnteredByDog,
} from './buildMoveUpTargets';
import type { ShowMapClassInput } from './showMapTypes';

// MYK9-1265: Change class targets are every not-complete class in every trial of the
// show that the dog is not already entered in (owner decision 2026-10-20).

function makeClass(overrides: Partial<ShowMapClassInput> & { id: string }): ShowMapClassInput {
  return { trialId: 'trial-1', name: overrides.id, ...overrides };
}

const buriedNoviceA = makeClass({
  id: 'buried-novice-a',
  name: 'Buried Novice A',
  element: 'Buried',
  level: 'Novice',
  section: 'A',
});
const buriedAdvanced = makeClass({
  id: 'buried-advanced',
  name: 'Buried Advanced',
  element: 'Buried',
  level: 'Advanced',
});
const buriedExcellent = makeClass({
  id: 'buried-excellent',
  name: 'Buried Excellent',
  element: 'Buried',
  level: 'Excellent',
});
const buriedMaster = makeClass({
  id: 'buried-master',
  name: 'Buried Master',
  element: 'Buried',
  level: 'Master',
});
const interiorNovice = makeClass({
  id: 'interior-novice',
  name: 'Interior Novice A',
  element: 'Interior',
  level: 'Novice',
  section: 'A',
});

describe('buildMoveUpTargets', () => {
  it('offers the higher classes of the same trial and element, and every other open class', () => {
    const targets = buildMoveUpTargets(
      [buriedNoviceA, buriedAdvanced, buriedExcellent, buriedMaster, interiorNovice],
      buriedNoviceA.id
    );
    expect(targets.map(t => t.id).sort()).toEqual(
      [buriedAdvanced.id, buriedExcellent.id, buriedMaster.id, interiorNovice.id].sort()
    );
  });

  it('is not limited by level: a lower class in the same element is a target too', () => {
    const targets = buildMoveUpTargets([buriedNoviceA, buriedMaster], buriedMaster.id);
    expect(targets.map(t => t.id)).toEqual([buriedNoviceA.id]);
  });

  it('returns [] when the current class id is missing or unknown', () => {
    expect(buildMoveUpTargets([buriedAdvanced], undefined)).toEqual([]);
  });

  it('leaves out completed and cancelled classes and classes the dog is entered in', () => {
    const done = makeClass({ ...buriedAdvanced, id: 'done', status: 'completed' });
    const cancelled = makeClass({ ...buriedAdvanced, id: 'cancelled', status: 'cancelled' });
    const targets = buildMoveUpTargets(
      [buriedNoviceA, done, cancelled, buriedExcellent, buriedMaster],
      buriedNoviceA.id,
      new Set([buriedMaster.id])
    );
    expect(targets.map(t => t.id)).toEqual([buriedExcellent.id]);
  });

  it('includes classes in other trials, labelled with their trial and day, in trial order', () => {
    const t2Advanced = makeClass({
      ...buriedAdvanced,
      id: 't2-advanced',
      trialId: 'trial-2',
      trialDate: '2026-10-25',
      trialName: 'Sunday Trial 1',
    });
    const t1Advanced = makeClass({
      ...buriedAdvanced,
      trialDate: '2026-10-24',
      trialName: 'Saturday Trial 1',
    });
    const targets = buildMoveUpTargets([buriedNoviceA, t2Advanced, t1Advanced], buriedNoviceA.id);
    expect(targets.map(t => [t.id, t.label, t.detail])).toEqual([
      [t1Advanced.id, 'Buried Advanced', '2026-10-24 · Saturday Trial 1'],
      [t2Advanced.id, 'Buried Advanced', '2026-10-25 · Sunday Trial 1'],
    ]);
  });

  it('flags a full class instead of dropping it', () => {
    const targets = buildMoveUpTargets(
      [buriedNoviceA, buriedAdvanced, buriedMaster],
      buriedNoviceA.id,
      new Set(),
      new Map([
        [buriedAdvanced.id, 4],
        [buriedMaster.id, 0],
      ])
    );
    expect(targets.map(t => [t.id, t.isFull])).toEqual([
      [buriedAdvanced.id, false],
      [buriedMaster.id, true],
    ]);
  });

  it('labels each target with its section even when the stored name omits it', () => {
    const a = makeClass({
      id: 'v-a',
      name: 'Vehicle Advanced',
      element: 'Vehicle',
      level: 'Advanced',
      section: 'A',
    });
    const b = makeClass({ ...a, id: 'v-b', section: 'B' });
    const targets = buildMoveUpTargets([buriedNoviceA, a, b], buriedNoviceA.id);
    expect(targets.map(t => t.label).sort()).toEqual(['Vehicle Advanced A', 'Vehicle Advanced B']);
  });
});

describe('classIdsEnteredByDog', () => {
  const rows = [
    { id: 'e1', class_id: 'c1', dog: { id: 'dog-1' }, entry_status: 'confirmed' },
    { id: 'e2', class_id: 'c2', dog_id: 'dog-1', entry_status: 'withdrawn' },
    { id: 'e3', class_id: 'c3', dog_id: 'dog-1', entry_status: 'submitted' },
    { id: 'e4', class_id: 'c4', dog_id: 'dog-2', entry_status: 'confirmed' },
    { id: 'e5', class_id: 'c5', dog_id: 'dog-1', entry_status: 'confirmed', deleted_at: 'x' },
  ];

  it("collects the dog's live entries only, pending included", () => {
    expect([...classIdsEnteredByDog(rows, 'dog-1')].sort()).toEqual(['c1', 'c3']);
  });

  it('is empty when the dog is unknown', () => {
    expect(classIdsEnteredByDog(rows, undefined).size).toBe(0);
  });
});

describe('buildMoveUpClassLabeler (MYK9-1385)', () => {
  it('gives a class the same label the target list shows for it', () => {
    const storedNameLacksSection = makeClass({
      id: 'interior-novice-b',
      name: 'Interior Novice',
      element: 'Interior',
      level: 'Novice',
      section: 'B',
    });
    const classes = [buriedNoviceA, storedNameLacksSection, interiorNovice];
    const labeler = buildMoveUpClassLabeler(classes);
    const targets = buildMoveUpTargets(classes, 'buried-novice-a');

    expect(labeler(storedNameLacksSection)).toBe('Interior Novice B');
    for (const target of targets) {
      const cls = classes.find(candidate => candidate.id === target.id)!;
      expect(labeler(cls)).toBe(target.label);
    }
  });
});
