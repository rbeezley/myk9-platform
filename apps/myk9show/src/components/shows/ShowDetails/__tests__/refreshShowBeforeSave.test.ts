import { describe, it, expect, vi, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ pull: vi.fn() }));
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { pullShowById: mocks.pull },
}));

import { refreshShowBeforeSave, REFRESH_SHOW_TIMEOUT_MS } from '../refreshShowBeforeSave';

describe('refreshShowBeforeSave (MYK9-2361)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops waiting on a pull that never resolves', async () => {
    vi.useFakeTimers();
    mocks.pull.mockReset().mockReturnValue(new Promise(() => {}));
    let done = false;
    const run = refreshShowBeforeSave('show-1').then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(REFRESH_SHOW_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(done).toBe(true);
  });

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
