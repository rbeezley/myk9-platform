import { describe, expect, it } from 'vitest';
import {
  clashQuestion,
  findHandlerClashes,
  isClashAnswered,
  type ClashClassInfo,
  type ClashDog,
} from './handlerClashes';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';

const dogs: ClashDog[] = [
  { id: 'willow', ownerId: 'o1', name: 'Willow' },
  { id: 'scout', ownerId: 'o1', name: 'Scout' },
  { id: 'rex', ownerId: 'o2', name: 'Rex' },
];

const classes: Record<string, ClashClassInfo> = {
  cNovA: { trialId: 't1', element: 'Container', level: 'Novice', section: 'A' },
  cNovB: { trialId: 't1', element: 'Container', level: 'Novice', section: 'B' },
  iNovA: { trialId: 't1', element: 'Interior', level: 'Novice', section: 'A' },
  cNovAt2: { trialId: 't2', element: 'Container', level: 'Novice', section: 'A' },
  cNovA2: { trialId: 't1', element: 'Container', level: 'Novice', section: 'A' },
  iNovB: { trialId: 't1', element: 'Interior', level: 'Novice', section: 'B' },
};
const getClass = (id: string) => classes[id];

const pick = (dogId: string, ...classIds: string[]): ClassSelectionData => ({
  dogId,
  trialId: 't1',
  selectedClasses: classIds.map(classId => ({ classId })),
});

const find = (
  selectedDogIds: string[],
  classSelections: ClassSelectionData[],
  existingEntries: { dogId: string; classId: string }[] = []
) => findHandlerClashes({ selectedDogIds, classSelections, dogs, existingEntries, getClass });

describe('findHandlerClashes (MYK9-2021)', () => {
  it('asks about the second dog when two dogs of one owner share a class', () => {
    const clashes = find(['willow', 'scout'], [pick('willow', 'cNovA'), pick('scout', 'cNovA')]);
    expect(clashes).toHaveLength(1);
    expect(clashQuestion(clashes[0]!)).toBe(
      'Willow and Scout are both in Container Novice A. Who handles Scout?'
    );
    expect(clashes[0]!.subjectClassIds).toEqual(['cNovA']);
  });

  it('treats Novice A and Novice B of one element as one class', () => {
    const clashes = find(['willow', 'scout'], [pick('willow', 'cNovA'), pick('scout', 'cNovB')]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.classLabels).toEqual(['Container Novice']);
    expect(clashes[0]!.subjectClassIds).toEqual(['cNovB']);
  });

  it('asks nothing for different elements or different trials', () => {
    expect(find(['willow', 'scout'], [pick('willow', 'cNovA'), pick('scout', 'iNovA')])).toEqual(
      []
    );
    expect(find(['willow', 'scout'], [pick('willow', 'cNovA'), pick('scout', 'cNovAt2')])).toEqual(
      []
    );
  });

  it('asks nothing for dogs of different owners', () => {
    expect(find(['willow', 'rex'], [pick('willow', 'cNovA'), pick('rex', 'cNovA')])).toEqual([]);
  });

  it('catches a dog entered now when her other dog is already entered in that class', () => {
    const clashes = find(
      ['scout'],
      [pick('scout', 'cNovB')],
      [{ dogId: 'willow', classId: 'cNovA' }]
    );
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.subjectDogId).toBe('scout');
    expect(clashes[0]!.otherDogId).toBe('willow');
  });

  it('ignores earlier entries of another owner', () => {
    expect(find(['scout'], [pick('scout', 'cNovA')], [{ dogId: 'rex', classId: 'cNovA' }])).toEqual(
      []
    );
  });

  it('gives one block for a pair that clashes in several classes', () => {
    const clashes = find(
      ['willow', 'scout'],
      [pick('willow', 'cNovA', 'iNovA'), pick('scout', 'cNovA', 'iNovA')]
    );
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.subjectClassIds).toEqual(['cNovA', 'iNovA']);
    expect(clashQuestion(clashes[0]!)).toContain('in Container Novice A and Interior Novice A.');
  });

  it('does not repeat a class already counted for the same dog and class', () => {
    expect(
      find(['willow'], [pick('willow', 'cNovA')], [{ dogId: 'willow', classId: 'cNovA' }])
    ).toEqual([]);
  });

  it('asks about each dog when each is the newly entered one in a different class', () => {
    // Willow already has Container, Scout already has Interior; this entry adds the
    // opposite classes, so Scout needs a handler in Container and Willow in Interior.
    const clashes = find(
      ['willow', 'scout'],
      [pick('scout', 'cNovA2'), pick('willow', 'iNovB')],
      [
        { dogId: 'willow', classId: 'cNovA' },
        { dogId: 'scout', classId: 'iNovA' },
      ]
    );
    expect(clashes).toHaveLength(2);
    const bySubject = Object.fromEntries(clashes.map(c => [c.subjectDogId, c.subjectClassIds]));
    expect(bySubject).toEqual({ scout: ['cNovA2'], willow: ['iNovB'] });
    expect(new Set(clashes.map(c => c.pairKey)).size).toBe(2);
  });
});

describe('isClashAnswered', () => {
  const clash = find(['willow', 'scout'], [pick('willow', 'cNovA'), pick('scout', 'cNovA')])[0]!;
  const owner: HandlerInfo = { handlerId: 'o1', handlerName: 'Pat', isOwner: true };
  const friend: HandlerInfo = { handlerId: '', handlerName: 'Sam', isOwner: false };

  it('is unanswered while the owner is the handler and nothing was chosen', () => {
    expect(isClashAnswered(clash, { 'scout|cNovA': owner }, [])).toBe(false);
  });

  it('is answered by a typed name or by deciding at the show', () => {
    expect(isClashAnswered(clash, { 'scout|cNovA': friend }, [])).toBe(true);
    expect(isClashAnswered(clash, { 'scout|cNovA': owner }, [clash.pairKey])).toBe(true);
  });
});
