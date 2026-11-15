import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getClassById, updateClass } = vi.hoisted(() => ({
  getClassById: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById, updateClass },
}));

import { setClassScoresOnPaper, setClassesScoreOnPaper } from './classScoringMutations';

describe('class scoring mutations (MYK9-1971)', () => {
  beforeEach(() => {
    getClassById.mockReset();
    updateClass.mockReset();
    getClassById.mockResolvedValue({ id: 'c1', scoresOnPaper: null });
  });

  it('writes paper through the replicated classes table', async () => {
    await setClassScoresOnPaper('c1', true);
    expect(updateClass).toHaveBeenCalledWith('c1', { scoresOnPaper: true });
  });

  it('writes a phone as an explicit false, never null', async () => {
    await setClassScoresOnPaper('c1', false);
    expect(updateClass).toHaveBeenCalledWith('c1', { scoresOnPaper: false });
  });

  it('does not queue a second write when the class already has that choice', async () => {
    getClassById.mockResolvedValue({ id: 'c1', scoresOnPaper: true });
    await setClassScoresOnPaper('c1', true);
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('writes every class of a judge, each as its own mutation', async () => {
    await setClassesScoreOnPaper(['c1', 'c2', 'c3'], true);
    expect(updateClass.mock.calls).toEqual([
      ['c1', { scoresOnPaper: true }],
      ['c2', { scoresOnPaper: true }],
      ['c3', { scoresOnPaper: true }],
    ]);
  });

  it('tries every class and then rejects when one write fails', async () => {
    updateClass.mockRejectedValueOnce(new Error('boom'));
    await expect(setClassesScoreOnPaper(['c1', 'c2'], true)).rejects.toThrow('boom');
    expect(updateClass).toHaveBeenCalledTimes(2);
  });
});
