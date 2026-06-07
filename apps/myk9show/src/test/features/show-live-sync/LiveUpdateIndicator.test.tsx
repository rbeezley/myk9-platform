import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LiveUpdateIndicator } from '@/features/show-live-sync/LiveUpdateIndicator';

// Control the kill switch without pulling in the hook's supabase/replication deps.
const enabled = vi.fn(() => true);
vi.mock('@/features/show-live-sync/useShowLiveSync', () => ({
  showLiveSyncEnabled: () => enabled(),
}));

const dispatchSync = () =>
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
  it('renders nothing until the first live update (never claims live without proof)', () => {
    const { container } = render(<LiveUpdateIndicator />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows "Updated just now" on a sync nudge', () => {
    render(<LiveUpdateIndicator />);
    dispatchSync();
    expect(statusText()).toContain('Updated just now');
  });

  it('decays the relative time as it ages', () => {
    render(<LiveUpdateIndicator />);
    dispatchSync();
    expect(statusText()).toContain('Updated just now');
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(statusText()).toContain('Updated 1 minute ago');
  });

  it('stays inert when the kill switch is off', () => {
    enabled.mockReturnValue(false);
    const { container } = render(<LiveUpdateIndicator />);
    dispatchSync();
    expect(container.firstChild).toBeNull();
  });

  it('exposes an ambient ARIA status region (implicit aria-live=polite)', () => {
    render(<LiveUpdateIndicator />);
    dispatchSync();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('stops listening after unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<LiveUpdateIndicator />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('replication:sync-requested', expect.any(Function));
    removeSpy.mockRestore();
  });
});
