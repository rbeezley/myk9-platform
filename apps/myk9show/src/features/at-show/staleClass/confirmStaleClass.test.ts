import { describe, expect, it, vi } from 'vitest';
import { confirmStaleClass } from './confirmStaleClass';
import type { StaleClassPrompt } from './staleClassPromptStore';

const prompt: StaleClassPrompt = {
  classId: 'stale',
  className: 'Container Novice A',
  unscoredEntryIds: ['a', 'b', 'c'],
  lastResultAtMs: 0,
  showId: 'show',
  trialId: 'trial',
  scoredClassId: 'other',
};

describe('confirmStaleClass', () => {
  it('marks only the dogs the fresh check still finds unscored', async () => {
    const markAbsent = vi.fn().mockResolvedValue(undefined);
    const recheck = vi.fn().mockResolvedValue({
      classId: 'stale',
      className: 'Container Novice A',
      unscoredEntryIds: ['b'],
      lastResultAtMs: 0,
    });

    const result = await confirmStaleClass(prompt, { recheck, markAbsent });

    expect(result).toEqual({ outcome: 'marked', className: 'Container Novice A', markedCount: 1 });
    expect(markAbsent).toHaveBeenCalledTimes(1);
    expect(markAbsent).toHaveBeenCalledWith('b', 'stale', 'Container Novice A');
  });

  it('changes nothing when the synced state says the class no longer qualifies', async () => {
    const markAbsent = vi.fn();
    const recheck = vi.fn().mockResolvedValue(null);

    const result = await confirmStaleClass(prompt, { recheck, markAbsent });

    expect(result).toEqual({ outcome: 'not-needed', className: 'Container Novice A' });
    expect(markAbsent).not.toHaveBeenCalled();
  });

  it('stops at the first failed write rather than reporting success', async () => {
    const markAbsent = vi.fn().mockRejectedValueOnce(new Error('queue full'));
    const recheck = vi.fn().mockResolvedValue({
      classId: 'stale',
      className: 'Container Novice A',
      unscoredEntryIds: ['a', 'b'],
      lastResultAtMs: 0,
    });

    await expect(confirmStaleClass(prompt, { recheck, markAbsent })).rejects.toThrow('queue full');
    expect(markAbsent).toHaveBeenCalledTimes(1);
  });
});
