import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForShowSync } from '../waitForShowSync';

const hasUnsyncedWork = vi.hoisted(() => vi.fn());
const hasRejectedWork = vi.hoisted(() => vi.fn());
const requestUpload = vi.hoisted(() => vi.fn());

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { hasUnsyncedWork, hasRejectedWork },
}));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { requestUpload },
}));

describe('waitForShowSync (MYK9-2244)', () => {
  beforeEach(() => {
    hasUnsyncedWork.mockReset();
    hasRejectedWork.mockReset();
    hasRejectedWork.mockResolvedValue(false);
    requestUpload.mockReset();
  });

  it('returns at once when the show has nothing queued', async () => {
    hasUnsyncedWork.mockResolvedValue(false);
    await waitForShowSync('show-1');
    expect(hasUnsyncedWork).toHaveBeenCalledWith('show-1');
    expect(requestUpload).not.toHaveBeenCalled();
  });

  it('requests an upload and returns once the queue drains', async () => {
    hasUnsyncedWork.mockResolvedValueOnce(true).mockResolvedValue(false);
    await waitForShowSync('show-1', { intervalMs: 1, timeoutMs: 1000 });
    expect(requestUpload).toHaveBeenCalledTimes(1);
  });

  it('stops the publish with a sync message when the queue never drains', async () => {
    hasUnsyncedWork.mockResolvedValue(true);
    await expect(waitForShowSync('show-1', { intervalMs: 1, timeoutMs: 5 })).rejects.toMatchObject({
      code: 'show-syncing',
    });
  });

  it('blocks the publish when the server refused a write and the queue is empty', async () => {
    hasUnsyncedWork.mockResolvedValue(false);
    hasRejectedWork.mockResolvedValue(true);
    await expect(waitForShowSync('show-1')).rejects.toMatchObject({ code: 'show-rejected' });
    expect(hasRejectedWork).toHaveBeenCalledWith('show-1');
  });
});
