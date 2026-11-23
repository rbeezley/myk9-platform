import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pull: vi.fn() }));
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { pullShowById: mocks.pull },
}));

import { refreshShowBeforeSave } from '../refreshShowBeforeSave';

describe('refreshShowBeforeSave (MYK9-2361)', () => {
  it("pulls the show's server row by id", async () => {
    mocks.pull.mockReset().mockResolvedValue(null);
    await refreshShowBeforeSave('show-1');
    expect(mocks.pull).toHaveBeenCalledWith('show-1');
  });

  it('never fails the save when the pull fails (offline)', async () => {
    mocks.pull.mockReset().mockRejectedValue(new Error('offline'));
    await expect(refreshShowBeforeSave('show-1')).resolves.toBeUndefined();
  });
});
