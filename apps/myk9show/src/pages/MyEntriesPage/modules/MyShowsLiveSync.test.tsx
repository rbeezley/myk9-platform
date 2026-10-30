import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MyShowsLiveSync } from './MyShowsLiveSync';
import { useShowLiveSync } from '@/features/show-live-sync/useShowLiveSync';
import { markShowChannel, nextPollDelayMs, resetSyncCadence } from '@/providers/syncCadence';
import { SYNC_INTERVAL_MS } from '@myk9/replication';
import { features } from '@/config/features';

vi.mock('@/features/show-live-sync/useShowLiveSync', () => ({ useShowLiveSync: vi.fn() }));

describe('MyShowsLiveSync', () => {
  afterEach(() => {
    // Unmount first: its release must run before the cadence state is reset.
    cleanup();
    resetSyncCadence();
    vi.clearAllMocks();
  });

  it('mounts live sync once per distinct show and skips empty ids', () => {
    render(<MyShowsLiveSync showIds={['show-1', 'show-2', 'show-1', '']} />);
    const ids = vi.mocked(useShowLiveSync).mock.calls.map(call => call[0]);
    expect([...new Set(ids)].sort()).toEqual(['show-1', 'show-2']);
  });

  it('keeps the 60 s poll while open and lets the slow poll back on unmount', () => {
    (features as { replicationSubscribedCadence: boolean }).replicationSubscribedCadence = true;
    markShowChannel('show-1#1', true);
    const { unmount } = render(<MyShowsLiveSync showIds={['show-1']} />);
    expect(nextPollDelayMs()).toBe(SYNC_INTERVAL_MS);

    unmount();
    expect(nextPollDelayMs()).toBeGreaterThan(SYNC_INTERVAL_MS);
  });
});
