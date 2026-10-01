import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPendingForRow = vi.hoisted(() => vi.fn());

vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { getPendingMutationsForRow: mockPendingForRow },
}));

const { refreshScopesAfterClubUpload } = await import('./refreshScopesAfterClubUpload');

describe('refreshScopesAfterClubUpload (MYK9-905)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPendingForRow.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes role scopes only after the club INSERT has left the queue', async () => {
    const refresh = vi.fn(async () => {});
    mockPendingForRow
      .mockResolvedValueOnce([{ id: 'm1' }])
      .mockResolvedValueOnce([{ id: 'm1' }])
      .mockResolvedValue([]);

    const done = refreshScopesAfterClubUpload('club-new', refresh);

    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(done).resolves.toBe(true);

    expect(mockPendingForRow).toHaveBeenCalledWith('clubs', 'club-new');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes immediately when nothing is queued for the club', async () => {
    const refresh = vi.fn(async () => {});
    mockPendingForRow.mockResolvedValue([]);

    await expect(refreshScopesAfterClubUpload('club-new', refresh)).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('gives up without refreshing when the upload never drains (the normal 5-minute poll covers it)', async () => {
    const refresh = vi.fn(async () => {});
    mockPendingForRow.mockResolvedValue([{ id: 'm1' }]);

    const done = refreshScopesAfterClubUpload('club-new', refresh, {
      timeoutMs: 5000,
      intervalMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(6000);

    await expect(done).resolves.toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeps waiting through a transient queue-read failure', async () => {
    const refresh = vi.fn(async () => {});
    mockPendingForRow.mockRejectedValueOnce(new Error('no session yet')).mockResolvedValue([]);

    const done = refreshScopesAfterClubUpload('club-new', refresh);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(done).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
