/**
 * `settleAtShowSync`: the wait a watermark rewind needs before it can trust
 * `syncAtShowData` to run a NEW sync (offline-readiness prime).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const trialsSync = vi.fn();

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    sync: (id: string) => trialsSync(id),
    getTrialsByShow: async () => [],
  },
  replicatedClassesTable: { sync: vi.fn(async () => ({ success: true })) },
  replicatedEntriesTable: { sync: vi.fn(async () => ({ success: true })) },
}));

import { settleAtShowSync, syncAtShowData } from './atShowDataAdapter';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('settleAtShowSync', () => {
  beforeEach(() => {
    trialsSync.mockReset();
  });

  it('resolves immediately when no at-show sync is running', async () => {
    await expect(settleAtShowSync('show-idle')).resolves.toBeUndefined();
  });

  it('waits for the in-flight sync, after which syncAtShowData starts a NEW one', async () => {
    const first = deferred();
    trialsSync.mockReturnValueOnce(first.promise).mockResolvedValue({ success: true });
    void syncAtShowData('show-1');

    let settled = false;
    const settling = settleAtShowSync('show-1').then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    first.resolve();
    await settling;
    await flush();

    await syncAtShowData('show-1');
    // The first call, plus a fresh one: the second did not reuse the first.
    expect(trialsSync).toHaveBeenCalledTimes(2);
  });

  it('never rejects, even when the in-flight sync fails', async () => {
    const first = deferred();
    trialsSync.mockReturnValueOnce(first.promise);
    const running = syncAtShowData('show-2').catch(() => undefined);
    const settling = settleAtShowSync('show-2');
    first.reject(new Error('Failed to fetch'));
    await expect(settling).resolves.toBeUndefined();
    await running;
  });
});
