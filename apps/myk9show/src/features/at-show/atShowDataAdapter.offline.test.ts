import { afterEach, describe, expect, it, vi } from 'vitest';

const tables = vi.hoisted(() => ({
  trialsSync: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: { sync: tables.trialsSync, getTrialsByShow: async () => [] },
  replicatedClassesTable: { sync: async () => ({ success: true }) },
  replicatedEntriesTable: { sync: async () => ({ success: true }) },
  replicatedArmbandsTable: { sync: async () => ({ success: true }) },
}));

import { subscribeAtShowSyncSettled, syncAtShowData } from './atShowDataAdapter';

describe('syncAtShowData while the connection is dead (MYK9-1509)', () => {
  afterEach(() => {
    tables.trialsSync.mockReset();
    vi.restoreAllMocks();
  });

  it('settles a hung sync as failed when the device goes offline, and the next call starts a new one', async () => {
    tables.trialsSync.mockReturnValueOnce(new Promise(() => {}));
    const settled = vi.fn();
    const stop = subscribeAtShowSyncSettled('show-1', settled);

    const hung = syncAtShowData('show-1');
    window.dispatchEvent(new Event('offline'));
    await expect(hung).resolves.toEqual({ success: false });
    expect(settled).toHaveBeenCalledTimes(1);

    // Back online: a retry must not join the abandoned operation.
    tables.trialsSync.mockResolvedValueOnce({ success: true });
    await expect(syncAtShowData('show-1')).resolves.toEqual({ success: true });
    expect(tables.trialsSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it('settles at once as failed when called while already offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    tables.trialsSync.mockReturnValue(new Promise(() => {}));
    await expect(syncAtShowData('show-2')).resolves.toEqual({ success: false });
  });

  it('leaves an online sync alone', async () => {
    tables.trialsSync.mockResolvedValue({ success: true });
    await expect(syncAtShowData('show-3')).resolves.toEqual({ success: true });
  });
});
