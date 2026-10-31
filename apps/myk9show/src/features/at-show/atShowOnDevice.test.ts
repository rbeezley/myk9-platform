// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entriesSynced: vi.fn(),
  structureOnDevice: vi.fn(),
}));
vi.mock('@/services/replication/entriesShowSyncState', () => ({
  hasShowEntriesSynced: mocks.entriesSynced,
}));
vi.mock('./atShowClassListAdapter', () => ({
  isAtShowStructureOnDevice: mocks.structureOnDevice,
}));

import { isAtShowFullyOnDevice } from './atShowOnDevice';

describe('isAtShowFullyOnDevice', () => {
  beforeEach(() => {
    mocks.entriesSynced.mockReset().mockResolvedValue(true);
    mocks.structureOnDevice.mockReset().mockResolvedValue(true);
  });

  it('is true when entries, trials and classes are all on the device', async () => {
    expect(await isAtShowFullyOnDevice('s1')).toBe(true);
  });

  it('is false when the entries synced but a trial or class sync did not', async () => {
    mocks.structureOnDevice.mockResolvedValue(false);
    expect(await isAtShowFullyOnDevice('s1')).toBe(false);
  });

  it('is false when the classes are here but the entries never synced', async () => {
    mocks.entriesSynced.mockResolvedValue(false);
    expect(await isAtShowFullyOnDevice('s1')).toBe(false);
  });

  it('is false when a metadata read throws', async () => {
    mocks.structureOnDevice.mockRejectedValue(new Error('idb'));
    expect(await isAtShowFullyOnDevice('s1')).toBe(false);
  });
});
