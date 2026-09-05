import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelfCheckinBatchLoader } from '../selfCheckinBatch';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: (key: string, ids: string[]) => read(table, key, ids),
      }),
    }),
  },
}));

beforeEach(() => {
  read.mockReset();
  read.mockImplementation((table: string, _key: string, ids: string[]) => ({
    data:
      table === 'classes'
        ? ids.map(id => ({ id, trial_id: 'trial-1', trials: { show_id: 'show-1' } }))
        : [],
    error: null,
  }));
});

describe('check-in batch loading', () => {
  it('bounds filters to 100 classes and deduplicates shared ancestors', async () => {
    const load = createSelfCheckinBatchLoader();
    const ids = Array.from({ length: 205 }, (_, i) => `class-${i}`);
    expect(await Promise.all(ids.map(load))).toEqual(ids.map(() => true));
    expect(read).toHaveBeenCalledTimes(12);
    expect(read).toHaveBeenCalledWith('show_visibility_settings', 'show_id', ['show-1']);
    expect(read).toHaveBeenCalledWith('trial_visibility_overrides', 'trial_id', ['trial-1']);
    for (const call of read.mock.calls) expect(call[2].length).toBeLessThanOrEqual(100);
  });

  it('resolves each class against its own ancestors and override', async () => {
    read.mockImplementation((table: string) => ({
      data: {
        classes: [
          { id: 'a', trial_id: 't1', trials: { show_id: 's1' } },
          { id: 'b', trial_id: 't2', trials: { show_id: 's2' } },
          { id: 'c', trial_id: 't2', trials: { show_id: 's2' } },
        ],
        show_visibility_settings: [
          { show_id: 's1', self_checkin_enabled: false },
          { show_id: 's2', self_checkin_enabled: true },
        ],
        trial_visibility_overrides: [{ trial_id: 't2', self_checkin_enabled: false }],
        class_visibility_overrides: [{ class_id: 'c', self_checkin_enabled: true }],
      }[table],
      error: null,
    }));
    const load = createSelfCheckinBatchLoader();
    expect(await Promise.all(['a', 'b', 'c'].map(load))).toEqual([false, false, true]);
  });

  it('rejects an unavailable class without enabling it or failing accessible siblings', async () => {
    read.mockImplementation((table: string) => ({
      data: table === 'classes' ? [{ id: 'a', trial_id: 't1', trials: { show_id: 's1' } }] : [],
      error: null,
    }));
    const load = createSelfCheckinBatchLoader();
    const results = await Promise.allSettled(['a', 'missing'].map(load));
    expect(results[0]).toEqual({ status: 'fulfilled', value: true });
    expect(results[1].status).toBe('rejected');
  });

  it.each(['show_visibility_settings', 'trial_visibility_overrides', 'class_visibility_overrides'])(
    'rejects failed %s reads and reads again after recovery',
    async table => {
      const normal = read.getMockImplementation()!;
      read.mockImplementation((name, key, ids) =>
        name === table ? { data: null, error: new Error('offline') } : normal(name, key, ids)
      );
      const load = createSelfCheckinBatchLoader();
      await expect(load('a')).rejects.toThrow('offline');
      read.mockImplementation(normal);
      await expect(load('a')).resolves.toBe(true);
    }
  );
});
