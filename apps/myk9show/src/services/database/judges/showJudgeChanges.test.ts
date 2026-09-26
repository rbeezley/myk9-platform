import { describe, expect, it } from 'vitest';
import { diffShowJudges } from './showJudgeChanges';

const j = (judgeId: string) => ({ judgeId });

describe('diffShowJudges (MYK9-772)', () => {
  it('is empty for the same judges in another order', () => {
    expect(diffShowJudges([j('a'), j('b')], [j('b'), j('a')])).toEqual({ add: [], remove: [] });
  });

  it('only adds when the loaded list was empty: an unreadable list can never remove', () => {
    expect(diffShowJudges([], [j('c')])).toEqual({ add: ['c'], remove: [] });
    expect(diffShowJudges([], [])).toEqual({ add: [], remove: [] });
  });

  it('names exactly the judges added and removed', () => {
    expect(diffShowJudges([j('a'), j('b')], [j('b'), j('c')])).toEqual({
      add: ['c'],
      remove: ['a'],
    });
  });

  it('removes every judge the secretary took off the list', () => {
    expect(diffShowJudges([j('a'), j('b')], [])).toEqual({ add: [], remove: ['a', 'b'] });
  });
});
