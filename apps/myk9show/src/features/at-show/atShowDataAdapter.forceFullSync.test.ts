/**
 * `syncAtShowData(showId, { forceFullSync })` (MYK9-752): offline readiness
 * prime re-fetches every row instead of trusting a server count that may be
 * unavailable, and never lets an incremental sync already running answer it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { trialsSync, classesSync, entriesSync } = vi.hoisted(() => ({
  trialsSync: vi.fn(),
  classesSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  entriesSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
}));

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    sync: (id: string, options?: unknown) => trialsSync(id, options),
    getTrialsByShow: async () => [{ id: 'trial-1' }],
  },
  replicatedClassesTable: { sync: (...args: unknown[]) => classesSync(...args) },
  replicatedEntriesTable: { sync: (...args: unknown[]) => entriesSync(...args) },
}));

import { syncAtShowData } from './atShowDataAdapter';

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

describe('syncAtShowData forceFullSync', () => {
  beforeEach(() => {
    trialsSync.mockReset();
    classesSync.mockClear();
    entriesSync.mockClear();
  });

  it('passes forceFullSync to the trials, classes and entries syncs', async () => {
    trialsSync.mockResolvedValue({ success: true });
    await syncAtShowData('show-a', { forceFullSync: true });

    expect(trialsSync).toHaveBeenCalledWith('show-a', { forceFullSync: true });
    expect(classesSync).toHaveBeenCalledWith('trial-1', { forceFullSync: true });
    expect(entriesSync).toHaveBeenCalledWith('show-a', { forceFullSync: true });
  });

  it('an ordinary call shares the sync already running', async () => {
    const first = deferred();
    trialsSync.mockReturnValueOnce(first.promise).mockResolvedValue({ success: true });
    const running = syncAtShowData('show-b');
    const joined = syncAtShowData('show-b');
    first.resolve();
    await Promise.all([running, joined]);

    expect(trialsSync).toHaveBeenCalledTimes(1);
  });

  it('a forced call waits out an incremental sync already running, then runs its own', async () => {
    const first = deferred();
    trialsSync.mockReturnValueOnce(first.promise).mockResolvedValue({ success: true });
    const incremental = syncAtShowData('show-c');

    const forced = syncAtShowData('show-c', { forceFullSync: true });
    await flush();
    // Not started while the incremental one is still running.
    expect(trialsSync).toHaveBeenCalledTimes(1);

    first.resolve();
    await Promise.all([incremental, forced]);
    expect(trialsSync).toHaveBeenCalledTimes(2);
    expect(trialsSync).toHaveBeenLastCalledWith('show-c', { forceFullSync: true });
  });

  it('a forced call still runs when the sync it waited out failed', async () => {
    const first = deferred();
    trialsSync.mockReturnValueOnce(first.promise).mockResolvedValue({ success: true });
    const incremental = syncAtShowData('show-d').catch(() => undefined);
    const forced = syncAtShowData('show-d', { forceFullSync: true });

    first.reject(new Error('Failed to fetch'));
    await Promise.all([incremental, forced]);
    expect(trialsSync).toHaveBeenLastCalledWith('show-d', { forceFullSync: true });
  });

  it('later ordinary callers share the forced run', async () => {
    const forcedTrials = deferred();
    trialsSync.mockReturnValueOnce(forcedTrials.promise).mockResolvedValue({ success: true });
    const forced = syncAtShowData('show-e', { forceFullSync: true });
    await flush();
    const joined = syncAtShowData('show-e');
    forcedTrials.resolve();
    await Promise.all([forced, joined]);

    expect(trialsSync).toHaveBeenCalledTimes(1);
  });
});
