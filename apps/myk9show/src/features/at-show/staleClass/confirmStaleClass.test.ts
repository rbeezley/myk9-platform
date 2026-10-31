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

const deps = (over: Partial<Parameters<typeof confirmStaleClass>[1]> = {}) => ({
  isOnline: () => true,
  complete: vi.fn().mockResolvedValue({ ok: true, markedCount: 3 }),
  queue: vi.fn().mockResolvedValue(undefined),
  ...over,
});

describe('confirmStaleClass', () => {
  it('makes one server call with exactly the ids the judge saw', async () => {
    const d = deps();
    const result = await confirmStaleClass(prompt, d);

    expect(d.complete).toHaveBeenCalledTimes(1);
    expect(d.complete).toHaveBeenCalledWith('stale', ['a', 'b', 'c']);
    expect(d.queue).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'marked', className: 'Container Novice A', markedCount: 3 });
  });

  it('returns the current dogs, and writes nothing more, when the set changed', async () => {
    const d = deps({
      complete: vi.fn().mockResolvedValue({ ok: false, currentEntryIds: ['a', 'b', 'c', 'd'] }),
    });
    const result = await confirmStaleClass(prompt, d);

    expect(result).toEqual({
      outcome: 'changed',
      className: 'Container Novice A',
      currentEntryIds: ['a', 'b', 'c', 'd'],
    });
    expect(d.complete).toHaveBeenCalledTimes(1);
  });

  it('reports not-needed when the server finds no dogs left', async () => {
    const d = deps({ complete: vi.fn().mockResolvedValue({ ok: false, currentEntryIds: [] }) });
    expect(await confirmStaleClass(prompt, d)).toEqual({
      outcome: 'not-needed',
      className: 'Container Novice A',
    });
  });

  it('queues ONE call offline and never calls the server', async () => {
    const d = deps({ isOnline: () => false });
    const result = await confirmStaleClass(prompt, d);

    expect(d.queue).toHaveBeenCalledTimes(1);
    expect(d.queue).toHaveBeenCalledWith('stale', ['a', 'b', 'c']);
    expect(d.complete).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'queued', className: 'Container Novice A', dogCount: 3 });
  });

  it('lets a failed call throw so the prompt stays up (the call is atomic, nothing is half done)', async () => {
    const d = deps({ complete: vi.fn().mockRejectedValue(new Error('network')) });
    await expect(confirmStaleClass(prompt, d)).rejects.toThrow('network');
  });
});
