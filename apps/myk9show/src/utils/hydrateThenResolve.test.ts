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
});
