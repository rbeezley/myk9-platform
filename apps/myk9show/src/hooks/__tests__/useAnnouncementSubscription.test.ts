/**
 * MYK9-802: the Message Center's Show messages tab must reach the shows an
 * exhibitor has entries for TODAY on a fresh, cold context — not only after
 * they happen to visit `/at-show`, which is the only place the previous
 * single-source (`useShowDayData`, offline-replica-only) subscription got
 * populated in time.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncementSubscription } from '../useAnnouncementSubscription';

const {
  mockSubscribe,
  mockUnsubscribe,
  mockUseShowDayData,
  mockUseAccountTodayEntries,
  mockAuth,
  mockShowState,
} = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  mockUnsubscribe: vi.fn(),
  mockUseShowDayData: vi.fn(() => ({ activeShows: [] as { showId: string }[] })),
  mockUseAccountTodayEntries: vi.fn(() => ({ data: [] as { showId: string }[] })),
  mockAuth: { userWithRoles: null as { databaseUserId: string } | null },
  mockShowState: { selectedShowId: null as string | null },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: mockAuth.userWithRoles }),
}));
vi.mock('@/hooks/queries/useShowDayData', () => ({ useShowDayData: mockUseShowDayData }));
vi.mock('@/features/show-today/accountTodayEntries', () => ({
  useAccountTodayEntries: mockUseAccountTodayEntries,
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockShowState),
}));
vi.mock('@/store/announcementStore', () => ({
  useAnnouncementStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ subscribe: mockSubscribe, unsubscribe: mockUnsubscribe }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.userWithRoles = { databaseUserId: 'user-1' };
  mockUseShowDayData.mockReturnValue({ activeShows: [] });
  mockUseAccountTodayEntries.mockReturnValue({ data: [] });
  mockShowState.selectedShowId = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAnnouncementSubscription', () => {
  it('subscribes to a show useShowDayData already knows about, as before', () => {
    mockUseShowDayData.mockReturnValue({ activeShows: [{ showId: 'show-replica' }] });

    renderHook(() => useAnnouncementSubscription());

    expect(mockSubscribe).toHaveBeenCalledWith(['show-replica']);
  });

  // The cold-replica case MYK9-802 reports: the offline replica has not
  // synced entries/classes/trials/shows yet, so useShowDayData reports no
  // shows today, while the account-scoped RPC the My Shows banner reads
  // already knows the exhibitor has an entry today.
  it('subscribes to a show only useAccountTodayEntries knows about (cold replica)', () => {
    mockUseShowDayData.mockReturnValue({ activeShows: [] });
    mockUseAccountTodayEntries.mockReturnValue({ data: [{ showId: 'show-rpc' }] });

    renderHook(() => useAnnouncementSubscription());

    expect(mockSubscribe).toHaveBeenCalledWith(['show-rpc']);
  });

  it('unions both sources without duplicates when they agree on a show', () => {
    mockUseShowDayData.mockReturnValue({ activeShows: [{ showId: 'show-both' }] });
    mockUseAccountTodayEntries.mockReturnValue({
      data: [{ showId: 'show-both' }, { showId: 'show-rpc-only' }],
    });

    renderHook(() => useAnnouncementSubscription());

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    const [showIds] = mockSubscribe.mock.calls[0];
    expect(new Set(showIds)).toEqual(new Set(['show-both', 'show-rpc-only']));
  });

  it('retains the replica show when the account-today RPC later returns another show', () => {
    mockUseShowDayData.mockReturnValue({ activeShows: [{ showId: 'show-a' }] });
    mockUseAccountTodayEntries.mockReturnValue({ data: [] });

    const { rerender } = renderHook(() => useAnnouncementSubscription());
    mockUseAccountTodayEntries.mockReturnValue({ data: [{ showId: 'show-b' }] });
    rerender();

    expect(mockSubscribe).toHaveBeenLastCalledWith(['show-a', 'show-b']);
  });

  it('keeps the selected official show when the account-today RPC updates', () => {
    mockShowState.selectedShowId = 'show-c';
    mockUseAccountTodayEntries.mockReturnValue({ data: [{ showId: 'show-b' }] });

    const { rerender } = renderHook(() => useAnnouncementSubscription());
    mockUseAccountTodayEntries.mockReturnValue({ data: [{ showId: 'show-d' }] });
    rerender();

    expect(mockSubscribe).toHaveBeenLastCalledWith(['show-c', 'show-d']);
  });

  it('does not resubscribe when the sorted union is unchanged', () => {
    mockUseShowDayData.mockReturnValue({ activeShows: [{ showId: 'show-a' }] });
    mockUseAccountTodayEntries.mockReturnValue({ data: [{ showId: 'show-b' }] });

    const { rerender } = renderHook(() => useAnnouncementSubscription());
    mockUseAccountTodayEntries.mockReturnValue({
      data: [{ showId: 'show-b' }, { showId: 'show-a' }],
    });
    rerender();

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes and never subscribes when signed out', () => {
    mockAuth.userWithRoles = null;
    mockUseAccountTodayEntries.mockReturnValue({ data: [{ showId: 'show-rpc' }] });

    renderHook(() => useAnnouncementSubscription());

    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
