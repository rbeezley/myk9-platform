import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';

// Control the kill switch without pulling in the hook's supabase/replication deps.
const enabled = vi.fn(() => true);
vi.mock('@/features/show-live-sync/useShowLiveSync', () => ({
  showLiveSyncEnabled: () => enabled(),
}));

const tree = (lastSyncAt: Date | null) => (
  <ReplicationSyncContext.Provider
    value={{
      status: { isSyncing: false, lastSyncAt, error: null, tablesStatus: {} },
      triggerSync: vi.fn(),
      syncTable: vi.fn(),
    }}
  >
    <LiveUpdateIndicator />
  </ReplicationSyncContext.Provider>
);

/**
 * Render with an initial last-sync time. Initial render and `completeSync` use
 * the SAME root element type (the Provider), so the component instance — and its
 * pendingRef — survives the rerender instead of remounting.
 */
function renderIndicator(lastSyncAt: Date | null = null) {
  const utils = render(tree(lastSyncAt));
  return {
    ...utils,
    // Simulate a completed sync (provider advances lastSyncAt on success only).
    completeSync: (at: Date) => act(() => utils.rerender(tree(at))),
  };
}

const nudge = () =>
  act(() => {
    window.dispatchEvent(new Event('replication:sync-requested'));
  });

const statusText = () => screen.getByRole('status').textContent ?? '';

beforeEach(() => {
  vi.useFakeTimers();
  enabled.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('LiveUpdateIndicator', () => {
  it('renders nothing before any activity', () => {
    const { container } = renderIndicator();
    expect(container.firstChild).toBeNull();
  });

  it('does NOT claim fresh on the nudge alone (the nudge is only pre-sync)', () => {
    // Regression for Codex P2: a detected change without a completed sync must
    // not assert the cache refreshed.
    const { container } = renderIndicator();
    nudge();
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows "Updated just now" only after a sync actually completes', () => {
    const { completeSync } = renderIndicator();
    nudge();
    completeSync(new Date());
    expect(statusText()).toContain('Updated just now');
  });

  it('ignores a sync completion with no pending show change (e.g. the 60s poll)', () => {
    const { completeSync, container } = renderIndicator();
    completeSync(new Date()); // poll-driven sync, no nudge first
    expect(container.firstChild).toBeNull();
  });

  it('decays the relative time as it ages', () => {
    const { completeSync } = renderIndicator();
    nudge();
    completeSync(new Date());
    expect(statusText()).toContain('Updated just now');
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(statusText()).toContain('Updated 1 minute ago');
  });

  it('stays inert when the kill switch is off', () => {
    enabled.mockReturnValue(false);
    const { completeSync, container } = renderIndicator();
    nudge(); // listener never armed pending
    completeSync(new Date());
    expect(container.firstChild).toBeNull();
  });

  it('exposes an ambient ARIA status region (implicit aria-live=polite)', () => {
    const { completeSync } = renderIndicator();
    nudge();
    completeSync(new Date());
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('stops listening after unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderIndicator();
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('replication:sync-requested', expect.any(Function));
    removeSpy.mockRestore();
  });
});
