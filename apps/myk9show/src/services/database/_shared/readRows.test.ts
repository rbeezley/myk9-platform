import { describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/services/LoggingService', () => ({ logger: { warn } }));

import { joinRowsOrEmpty, rowsOrThrow } from './readRows';

describe('readRows (MYK9-774)', () => {
  it('rowsOrThrow throws on a failed status read', async () => {
    await expect(
      rowsOrThrow(Promise.resolve({ ok: false as const, rows: [] as [], error: 'x' }), 'nope')
    ).rejects.toThrow('nope');
  });

  it('joinRowsOrEmpty passes a readable join through', async () => {
    await expect(joinRowsOrEmpty(Promise.resolve([1, 2]), 'labels')).resolves.toEqual([1, 2]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('joinRowsOrEmpty leaves an unreadable join out, with a warning', async () => {
    await expect(
      joinRowsOrEmpty(Promise.reject(new Error('device read failed')), 'class labels')
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Join read failed on this device; class labels left out',
      'database',
      expect.objectContaining({ join: 'class labels' })
    );
  });
});
