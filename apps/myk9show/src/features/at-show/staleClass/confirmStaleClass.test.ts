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
  complete: vi.fn().mockResolvedValue({ ok: true, markedCount: 3 }),
  queuedScoreEntryIds: vi.fn().mockResolvedValue(new Set<string>()),
  ...over,
});

describe('confirmStaleClass', () => {
  it('writes nothing while a listed dog still has a score queued on this device', async () => {
    const d = deps({ queuedScoreEntryIds: vi.fn().mockResolvedValue(new Set(['b'])) });
    const result = await confirmStaleClass(prompt, d);

    expect(result).toEqual({ outcome: 'scores-uploading', className: 'Container Novice A' });
    expect(d.complete).not.toHaveBeenCalled();
  });

  it('ignores queued scores for dogs that are not in the list', async () => {
    const d = deps({ queuedScoreEntryIds: vi.fn().mockResolvedValue(new Set(['other-dog'])) });
    expect((await confirmStaleClass(prompt, d)).outcome).toBe('marked');
  });

  it('makes one server call with exactly the ids the judge saw', async () => {
    const d = deps();
    const result = await confirmStaleClass(prompt, d);

    expect(d.complete).toHaveBeenCalledTimes(1);
    expect(d.complete).toHaveBeenCalledWith('stale', ['a', 'b', 'c']);
    expect(result).toEqual({ outcome: 'marked', className: 'Container Novice A', markedCount: 3 });
  });

  it('returns the current dogs, and writes nothing more, when the set changed', async () => {
    const d = deps({
      complete: vi.fn().mockResolvedValue({
        ok: false,
        currentEntryIds: ['a', 'b', 'c', 'd'],
        reason: 'changed',
      }),
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
    const d = deps({
      complete: vi.fn().mockResolvedValue({ ok: false, currentEntryIds: [], reason: 'changed' }),
    });
    expect(await confirmStaleClass(prompt, d)).toEqual({
      outcome: 'not-needed',
      className: 'Container Novice A',
    });
  });

  it('returns needs-connection for a fetch failure even when navigator.onLine is true', async () => {
    const d = deps({ complete: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
    expect(navigator.onLine).toBe(true);
    expect(await confirmStaleClass(prompt, d)).toEqual({
      outcome: 'needs-connection',
      className: 'Container Novice A',
    });
    expect(d.complete).toHaveBeenCalledTimes(1);
  });

  it('treats a supabase-js wrapped fetch failure and a timeout as needs-connection', async () => {
    for (const err of [
      { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
      Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }),
    ]) {
      const d = deps({ complete: vi.fn().mockRejectedValue(err) });
      expect((await confirmStaleClass(prompt, d)).outcome).toBe('needs-connection');
    }
  });

  it('lets a server-side error (authorization, validation) throw as it is', async () => {
    const err = Object.assign(new Error('permission denied'), { code: '42501' });
    const d = deps({ complete: vi.fn().mockRejectedValue(err) });
    await expect(confirmStaleClass(prompt, d)).rejects.toThrow('permission denied');
  });

  it.each(['in_ring', 'not_in_progress'] as const)(
    'reports a %s refusal as refused, never as already complete',
    async reason => {
      const d = deps({
        complete: vi.fn().mockResolvedValue({ ok: false, currentEntryIds: [], reason }),
      });
      expect(await confirmStaleClass(prompt, d)).toEqual({
        outcome: 'refused',
        className: 'Container Novice A',
        reason,
      });
    }
  );
});
