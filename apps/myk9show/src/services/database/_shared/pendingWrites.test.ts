import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPendingCount = vi.hoisted(() => vi.fn());
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { getPendingCount },
}));

import { hasPendingLocalWritesOrUnknown } from './pendingWrites';

describe('hasPendingLocalWritesOrUnknown (MYK9-774)', () => {
  beforeEach(() => {
    getPendingCount.mockReset();
  });

  it('is true while a write waits to upload', async () => {
    getPendingCount.mockResolvedValue(2);
    await expect(hasPendingLocalWritesOrUnknown()).resolves.toBe(true);
  });

  it('is false with an empty queue', async () => {
    getPendingCount.mockResolvedValue(0);
    await expect(hasPendingLocalWritesOrUnknown()).resolves.toBe(false);
  });

  it('is true when the queue cannot be read, since nothing rules a write out', async () => {
    getPendingCount.mockRejectedValue(new Error('IDB unavailable'));
    await expect(hasPendingLocalWritesOrUnknown()).resolves.toBe(true);
  });
});
