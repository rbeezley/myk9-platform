/**
 * MYK9-766: the at-show page hydrates its show through `syncAtShowData`, which
 * never touches the replication provider's `lastSyncAt`. The offline readiness
 * badge needs its own "that sync has settled" signal, fired only AFTER every
 * row of the operation is written, and on failure too (a partial sync still
 * changed local rows).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { trialsSync, classesSync, entriesSync } = vi.hoisted(() => ({
  trialsSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  classesSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
  entriesSync: vi.fn(async (..._args: unknown[]) => ({ success: true })),
}));

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: {
    sync: (...args: unknown[]) => trialsSync(...args),
    getTrialsByShow: async () => [{ id: 'trial-1' }],
  },
  replicatedClassesTable: { sync: (...args: unknown[]) => classesSync(...args) },
  replicatedEntriesTable: { sync: (...args: unknown[]) => entriesSync(...args) },
}));

import { subscribeAtShowSyncSettled, syncAtShowData } from './atShowDataAdapter';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<{ success: boolean }>(res => {
    resolve = () => res({ success: true });
  });
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('subscribeAtShowSyncSettled', () => {
  beforeEach(() => {
    trialsSync.mockClear();
    classesSync.mockReset().mockImplementation(async () => ({ success: true }));
    entriesSync.mockReset().mockImplementation(async () => ({ success: true }));
  });

  it('fires for the show only after every scope of the sync has written', async () => {
    const entries = deferred();
    entriesSync.mockReturnValueOnce(entries.promise);
    const listener = vi.fn();
    const unsubscribe = subscribeAtShowSyncSettled('show-a', listener);

    const running = syncAtShowData('show-a');
    await flush();
    // Trials and classes are done, entries are still being written.
    expect(listener).not.toHaveBeenCalled();

    entries.resolve();
    await running;
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('fires when the sync fails part-way, and not for other shows', async () => {
    classesSync.mockRejectedValueOnce(new Error('network'));
    const listener = vi.fn();
    const other = vi.fn();
    const unsubscribe = subscribeAtShowSyncSettled('show-b', listener);
    const unsubscribeOther = subscribeAtShowSyncSettled('show-other', other);

    await expect(syncAtShowData('show-b')).rejects.toThrow('network');
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    unsubscribe();
    unsubscribeOther();
  });

  it('stops firing after unsubscribe', async () => {
    const listener = vi.fn();
    subscribeAtShowSyncSettled('show-c', listener)();

    await syncAtShowData('show-c');
    await flush();

    expect(listener).not.toHaveBeenCalled();
  });
});
