import { describe, expect, it, vi } from 'vitest';
import { hydrateThenResolve } from './hydrateThenResolve';

describe('hydrateThenResolve', () => {
  it('returns a warm record without syncing', async () => {
    const sync = vi.fn();
    const reload = vi.fn();
    const result = await hydrateThenResolve({ readStore: () => 'warm', sync, reload });
    expect(result).toBe('warm');
    expect(sync).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('syncs, reloads, then reads again when cold', async () => {
    let value: string | null = null;
    const order: string[] = [];
    const result = await hydrateThenResolve({
      readStore: () => value,
      sync: async () => {
        order.push('sync');
      },
      reload: async () => {
        order.push('reload');
        value = 'loaded';
      },
    });
    expect(result).toBe('loaded');
    expect(order).toEqual(['sync', 'reload']);
  });

  it('a failed sync resolves null (still absent) instead of throwing', async () => {
    const reload = vi.fn();
    const result = await hydrateThenResolve({
      readStore: () => null,
      sync: async () => {
        throw new Error('offline');
      },
      reload,
    });
    expect(result).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('never rejects: a throwing first read resolves via hydration, or null', async () => {
    let calls = 0;
    const result = await hydrateThenResolve({
      readStore: () => {
        calls += 1;
        if (calls === 1) throw new Error('IndexedDB init failed');
        return 'second';
      },
      sync: async () => undefined,
      reload: async () => undefined,
    });
    expect(result).toBe('second');
  });

  it('never rejects: a rejecting read on both attempts resolves null', async () => {
    const result = await hydrateThenResolve({
      readStore: async () => {
        throw new Error('IndexedDB read failed');
      },
      sync: async () => undefined,
      reload: async () => undefined,
    });
    expect(result).toBeNull();
  });

  it('never rejects: a throwing second read resolves null', async () => {
    let calls = 0;
    const result = await hydrateThenResolve({
      readStore: () => {
        calls += 1;
        if (calls === 2) throw new Error('boom');
        return null;
      },
      sync: async () => undefined,
      reload: async () => undefined,
    });
    expect(result).toBeNull();
  });
});
