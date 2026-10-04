/**
 * MYK9-979 (Codex round 3 on #2707): the self-saving online-entries switch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ONLINE_ENTRIES_OFF_TOAST,
  ONLINE_ENTRIES_ON_TOAST,
  useOnlineEntriesSwitch,
} from '../useOnlineEntriesSwitch';
import { ONLINE_ENTRIES_BLOCKED_MESSAGE } from '../onlineEntryGate';

const h = vi.hoisted(() => ({
  show: undefined as Record<string, unknown> | undefined,
  payouts: null as { payouts_enabled: boolean } | null,
  online: true,
  setShowOnlineEntries: vi.fn(async (_showId: string, _enabled: boolean) => 8),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (state: { shows: unknown[] }) => unknown) =>
    selector({ shows: h.show ? [h.show] : [] }),
}));
vi.mock('../setShowOnlineEntries', () => ({ setShowOnlineEntries: h.setShowOnlineEntries }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => h.online }));
const syncTable = vi.hoisted(() => vi.fn(async (_table: string) => {}));
vi.mock('@/context/ReplicationSyncContext', async () => {
  const { createContext } = await import('react');
  return { ReplicationSyncContext: createContext({ syncTable }) };
});
vi.mock('../useClubStripeAccount', () => ({
  useClubStripeAccount: () => ({ data: h.payouts, isLoading: false, isError: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

function show(overrides: Record<string, unknown>) {
  return { id: 'show-1', clubId: 'club-1', status: 'published', ...overrides };
}

describe('useOnlineEntriesSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.payouts = null;
    h.online = true;
  });

  it('is disabled and writes nothing while offline (the RPC needs a connection)', async () => {
    h.show = show({ onlineEntriesEnabled: true });
    h.online = false;
    const { result } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });
    expect(result.current.offline).toBe(true);

    await act(() => result.current.setEnabled(false));

    expect(h.setShowOnlineEntries).not.toHaveBeenCalled();
  });

  it('reads the live value and turns entries off with its own one-column write', async () => {
    h.show = show({ onlineEntriesEnabled: true });
    const { result } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });
    expect(result.current.value).toBe(true);

    await act(() => result.current.setEnabled(false));

    expect(h.setShowOnlineEntries).toHaveBeenCalledWith('show-1', false);
    expect(toast.success).toHaveBeenCalledWith(ONLINE_ENTRIES_OFF_TOAST);
  });

  // Codex round 5: the confirmed value shows at once, without touching the
  // replica, and the show sync is asked to bring the row.
  it('shows the server-confirmed value right away and asks the show sync for the row', async () => {
    h.show = show({ onlineEntriesEnabled: true, serverVersion: 7 });
    const { result } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });

    await act(() => result.current.setEnabled(false));

    expect(result.current.value).toBe(false);
    expect(syncTable).toHaveBeenCalledWith('shows');
  });

  // Codex round 6: the RPC returns the row's new version (8 here). A replica
  // refresh older than that cannot undo the confirmation; one at or past it
  // wins, whatever value it holds.
  it('an older replica refresh does not override the confirmed value', async () => {
    h.show = show({ onlineEntriesEnabled: true, serverVersion: 7 });
    const { result, rerender } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });

    await act(() => result.current.setEnabled(false));
    expect(result.current.value).toBe(false);

    // An unrelated refresh re-delivers the pre-change row (a new object, same
    // version): the switch keeps the confirmed value.
    h.show = show({ onlineEntriesEnabled: true, serverVersion: 7 });
    rerender();
    expect(result.current.value).toBe(false);
  });

  it('a replica row at or past the returned version wins, even when another device flipped it back', async () => {
    h.show = show({ onlineEntriesEnabled: true, serverVersion: 7 });
    const { result, rerender } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });

    await act(() => result.current.setEnabled(false));

    h.show = show({ onlineEntriesEnabled: false, serverVersion: 8 });
    rerender();
    expect(result.current.value).toBe(false);

    // Another device turned it back on: a higher version holding the other value.
    h.show = show({ onlineEntriesEnabled: true, serverVersion: 9 });
    rerender();
    expect(result.current.value).toBe(true);
  });

  it('refuses to turn entries on for a public show without payouts, writing nothing', async () => {
    h.show = show({ onlineEntriesEnabled: false });
    const { result } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });

    await act(() => result.current.setEnabled(true));

    expect(h.setShowOnlineEntries).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(ONLINE_ENTRIES_BLOCKED_MESSAGE, expect.anything());
  });

  it('turns entries on for a public show whose club has payouts', async () => {
    h.show = show({ onlineEntriesEnabled: false });
    h.payouts = { payouts_enabled: true };
    const { result } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });

    await act(() => result.current.setEnabled(true));

    expect(h.setShowOnlineEntries).toHaveBeenCalledWith('show-1', true);
    expect(toast.success).toHaveBeenCalledWith(ONLINE_ENTRIES_ON_TOAST);
  });

  it('a draft may turn entries on without payouts (the gate runs at publish)', async () => {
    h.show = show({ onlineEntriesEnabled: false, status: 'draft' });
    const { result } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });

    await act(() => result.current.setEnabled(true));

    expect(h.setShowOnlineEntries).toHaveBeenCalledWith('show-1', true);
  });

  it('never writes while the value is unknown', async () => {
    h.show = show({});
    const { result } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });
    expect(result.current.value).toBeUndefined();

    await act(() => result.current.setEnabled(true));

    expect(h.setShowOnlineEntries).not.toHaveBeenCalled();
  });

  it('surfaces a publish-gate refusal (MK003) in the toast', async () => {
    h.show = show({ onlineEntriesEnabled: false, status: 'draft' });
    h.setShowOnlineEntries.mockRejectedValueOnce({
      code: 'MK003',
      message: ONLINE_ENTRIES_BLOCKED_MESSAGE,
    });
    const { result } = renderHook(() => useOnlineEntriesSwitch('show-1'), { wrapper });

    await act(() => result.current.setEnabled(true));

    expect(toast.error).toHaveBeenCalledWith(ONLINE_ENTRIES_BLOCKED_MESSAGE);
  });
});
