import { describe, expect, it } from 'vitest';
import { selectMoveUpTargetClasses } from './moveUpTargetSelection';

interface TestClass {
  id: string;
  trialId: string;
  element: string;
  level: string;
  spots?: number;
}

const novice: TestClass = { id: 'novice', trialId: 't1', element: 'Container', level: 'Novice' };
const advanced: TestClass = { id: 'adv', trialId: 't1', element: 'Container', level: 'Advanced' };
const advancedOtherTrial: TestClass = {
  id: 'adv-t2',
  trialId: 't2',
  element: 'Container',
  level: 'Advanced',
};
const fullMaster: TestClass = {
  id: 'master-full',
  trialId: 't1',
  element: 'Container',
  level: 'Master',
  spots: 0,
};

const spotsOf = (cls: TestClass) => cls.spots;

describe('selectMoveUpTargetClasses', () => {
  it('excludes another trial but KEEPS a full class, flagged isFull', () => {
    const result = selectMoveUpTargetClasses(
      [novice, advanced, advancedOtherTrial, fullMaster],
      novice.id,
      'AKC',
      spotsOf
    );
    expect(result.map(t => [t.cls.id, t.isFull, t.spotsKnown])).toEqual([
      ['adv', false, false],
      ['master-full', true, true],
    ]);
  });

  it('marks known free seats as known and not full', () => {
    const result = selectMoveUpTargetClasses(
      [novice, { ...advanced, spots: 4 }],
      novice.id,
      'AKC',
      spotsOf
    );
    expect(result.map(t => [t.cls.id, t.isFull, t.spotsKnown])).toEqual([['adv', false, true]]);
  });

  it('returns [] when the current class cannot be resolved', () => {
    expect(selectMoveUpTargetClasses([advanced], 'nope', 'AKC', spotsOf)).toEqual([]);
    expect(selectMoveUpTargetClasses([advanced], null, 'AKC', spotsOf)).toEqual([]);
  });
});
