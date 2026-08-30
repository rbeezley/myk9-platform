import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/services/LoggingService';

const { put } = vi.hoisted(() => ({ put: vi.fn() }));

vi.mock('@/services/database/connection', () => ({
  db: {
    instance: {
      open: vi.fn().mockResolvedValue(undefined),
      _zustand_state: { put },
    },
  },
}));

import { getOptimalStorage } from './storage-adapter';

describe('Zustand IndexedDB storage adapter', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false);
    put.mockReset();
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  it('swallows an IndexedDB quota abort because persisted state is non-critical', async () => {
    put.mockRejectedValue({ name: 'AbortError', message: 'QuotaExceededError' });

    const storage = getOptimalStorage('users');

    await expect(storage.setItem('myk9show-user-storage', '{"users":[]}')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'IndexedDB quota exceeded while persisting state; keeping in-memory state',
      'storage',
      { name: 'myk9show-user-storage' }
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('still rethrows non-quota IndexedDB failures', async () => {
    const error = new Error('database unavailable');
    put.mockRejectedValue(error);

    const storage = getOptimalStorage('users');

    await expect(storage.setItem('myk9show-user-storage', '{}')).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      'IndexedDB setItem error',
      'storage',
      { name: 'myk9show-user-storage' },
      error
    );
  });
});
