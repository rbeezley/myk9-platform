import { describe, expect, it } from 'vitest';
import { showJudgesChanged } from './showJudgesChanged';

const j = (judgeId: string) => ({ judgeId });

describe('showJudgesChanged (MYK9-772)', () => {
  it('is false for the same judges in another order', () => {
    expect(showJudgesChanged([j('a'), j('b')], [j('b'), j('a')])).toBe(false);
  });

  it('is false for two empty lists: an unreadable list saved untouched', () => {
    expect(showJudgesChanged([], [])).toBe(false);
  });

  it('is true when a judge is added, removed or swapped', () => {
    expect(showJudgesChanged([j('a')], [j('a'), j('b')])).toBe(true);
    expect(showJudgesChanged([j('a'), j('b')], [j('a')])).toBe(true);
    expect(showJudgesChanged([j('a')], [j('b')])).toBe(true);
  });

  it('is true when every judge is removed', () => {
    expect(showJudgesChanged([j('a')], [])).toBe(true);
  });
});
