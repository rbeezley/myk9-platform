import { describe, expect, it } from 'vitest';
import {
  buildCockpitClassLabelResolver,
  compareCockpitClasses,
} from './secretaryCockpitClassLabel';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

/**
 * MYK9-825: a UKC Vehicle trial splits every level into A/B, giving 10
 * classes. The Oct 10 dress rehearsal's stored class names omitted the
 * section ("Vehicle Novice" for both the A and B rows), and the schedule's
 * order followed insertion order rather than the registry's level ladder
 * (Novice, Advanced, Superior, Master, Elite).
 */
function makeClass(input: Partial<SecretaryCockpitClass> & { id: string }): SecretaryCockpitClass {
  return {
    trialId: 'trial-1',
    name: 'Vehicle',
    classOrder: 0,
    lifecycle: 'not-started',
    entryCount: 0,
    scoredCount: 0,
    actions: [],
    attention: [],
    paperwork: [],
    entryRows: [],
    ...input,
  };
}

const UKC_VEHICLE_CLASSES: SecretaryCockpitClass[] = [
  // Insertion order mirrors the dress rehearsal's scramble, not level order.
  makeClass({
    id: 'n-a',
    name: 'Vehicle Novice',
    element: 'Vehicle',
    level: 'Novice',
    section: 'A',
    classOrder: 0,
  }),
  makeClass({
    id: 's-a',
    name: 'Vehicle Superior',
    element: 'Vehicle',
    level: 'Superior',
    section: 'A',
    classOrder: 1,
  }),
  makeClass({
    id: 's-b',
    name: 'Vehicle Superior',
    element: 'Vehicle',
    level: 'Superior',
    section: 'B',
    classOrder: 2,
  }),
  makeClass({
    id: 'e-a',
    name: 'Vehicle Elite',
    element: 'Vehicle',
    level: 'Elite',
    section: 'A',
    classOrder: 3,
  }),
  makeClass({
    id: 'n-b',
    name: 'Vehicle Novice',
    element: 'Vehicle',
    level: 'Novice',
    section: 'B',
    classOrder: 4,
  }),
  makeClass({
    id: 'adv-a',
    name: 'Vehicle Advanced',
    element: 'Vehicle',
    level: 'Advanced',
    section: 'A',
    classOrder: 5,
  }),
  makeClass({
    id: 'm-a',
    name: 'Vehicle Master',
    element: 'Vehicle',
    level: 'Master',
    section: 'A',
    classOrder: 6,
  }),
  makeClass({
    id: 'e-b',
    name: 'Vehicle Elite',
    element: 'Vehicle',
    level: 'Elite',
    section: 'B',
    classOrder: 7,
  }),
  makeClass({
    id: 'm-b',
    name: 'Vehicle Master',
    element: 'Vehicle',
    level: 'Master',
    section: 'B',
    classOrder: 8,
  }),
  makeClass({
    id: 'adv-b',
    name: 'Vehicle Advanced',
    element: 'Vehicle',
    level: 'Advanced',
    section: 'B',
    classOrder: 9,
  }),
];

describe('buildCockpitClassLabelResolver', () => {
  it('appends the section to every class, even when the stored name omits it', () => {
    const labelOf = buildCockpitClassLabelResolver(UKC_VEHICLE_CLASSES);
    expect(labelOf(UKC_VEHICLE_CLASSES.find(c => c.id === 'n-a')!)).toBe('Vehicle Novice A');
    expect(labelOf(UKC_VEHICLE_CLASSES.find(c => c.id === 'n-b')!)).toBe('Vehicle Novice B');
  });

  it('keeps a class from another trial from renaming this one', () => {
    const otherTrial = makeClass({
      id: 'n-a-trial2',
      trialId: 'trial-2',
      name: 'Vehicle Novice',
      element: 'Vehicle',
      level: 'Novice',
      section: 'A',
    });
    const labelOf = buildCockpitClassLabelResolver([...UKC_VEHICLE_CLASSES, otherTrial]);
    expect(labelOf(UKC_VEHICLE_CLASSES.find(c => c.id === 'n-a')!)).toBe('Vehicle Novice A');
    expect(labelOf(otherTrial)).toBe('Vehicle Novice A');
  });
});

describe('compareCockpitClasses', () => {
  it('orders untimed UKC classes by the registry ladder (Novice -> Elite), then section', () => {
    const noTime = () => null;
    const sorted = [...UKC_VEHICLE_CLASSES]
      .sort((a, b) => compareCockpitClasses(a, b, noTime, 'UKC'))
      .map(cls => cls.id);

    expect(sorted).toEqual([
      'n-a',
      'n-b',
      'adv-a',
      'adv-b',
      's-a',
      's-b',
      'm-a',
      'm-b',
      'e-a',
      'e-b',
    ]);
  });

  it('still prefers a real scheduled time over the registry ladder', () => {
    const timed = makeClass({
      id: 'elite-early',
      element: 'Vehicle',
      level: 'Elite',
      section: 'A',
    });
    const untimed = UKC_VEHICLE_CLASSES.find(c => c.id === 'n-a')!;
    const minutesOf = (cls: SecretaryCockpitClass) => (cls.id === 'elite-early' ? 480 : null);

    expect(compareCockpitClasses(timed, untimed, minutesOf, 'UKC')).toBeLessThan(0);
  });
});
