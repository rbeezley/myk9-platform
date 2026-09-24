import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  subscribeToShowChanges,
  type ShowChangeListener,
} from '@/features/show-live-sync/showChangeSignal';
import {
  buildCheckInReminderPayload,
  buildClassStartingPayload,
  buildResultsPostedPayload,
  buildYourTurnPayload,
} from '@myk9/notifications';
import { useNotificationMonitor } from '../useNotificationMonitor';

const {
  mockDeliver,
  mockPreferences,
  mockUseShowDayData,
  mockUseQueryResult,
  mockRefetch,
  mockUnsubscribe,
  mockAuth,
} = vi.hoisted(() => {
  const mockDeliver = vi.fn();
  const mockPreferences = {
    enabled: true,
    leadDogs: 3,
    soundEnabled: true,
    voiceEnabled: false,
    vibrationEnabled: true,
    pushEnabled: false,
  };
  const mockUseShowDayData = vi.fn(() => ({ activeShows: [{ showId: 'show-1' }] }));
  const mockRefetch = vi.fn();
  const mockUseQueryResult = vi.fn(() => ({
    data: null as NotificationSnapshot | null,
    refetch: mockRefetch,
  }));
  return {
    mockDeliver,
    mockPreferences,
    mockUseShowDayData,
    mockUseQueryResult,
    mockRefetch,
    mockUnsubscribe: vi.fn(),
    mockAuth: { userId: 'auth-user-1' },
  };
});

interface NotificationSnapshot {
  classes: Array<Record<string, unknown>>;
  entries: Array<Record<string, unknown>>;
}

let showChangeHandler: ShowChangeListener | undefined;

vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('@/hooks/useNotificationDelivery', () => ({
  useNotificationDelivery: () => ({ deliver: mockDeliver }),
}));
vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ preferences: mockPreferences }),
}));
vi.mock('@/hooks/queries/useShowDayData', () => ({ useShowDayData: mockUseShowDayData }));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ selectedShowId: null }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'user-1', id: mockAuth.userId },
    user: { id: mockAuth.userId },
  }),
}));
vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsByOwnerQuery: () => ({ data: [{ id: 'dog-1' }] }),
}));
vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual('@tanstack/react-query')),
  useQuery: () => mockUseQueryResult(),
}));
vi.mock('@myk9/notifications', () => ({
  buildYourTurnPayload: vi.fn(() => ({ id: '1', type: 'your_turn' })),
  buildClassStartingPayload: vi.fn(() => ({ id: '2', type: 'class_starting' })),
  buildCheckInReminderPayload: vi.fn(() => ({ id: '3', type: 'check_in_reminder' })),
  buildResultsPostedPayload: vi.fn(() => ({ id: '4', type: 'results_posted' })),
}));
// The favorites query would otherwise read the snapshot `useQuery` mock above.
vi.mock('@/features/at-show/dogFavoritesSync', () => ({
  useFavoriteArmbandsByShow: () => new Map<string, ReadonlySet<number>>(),
}));
vi.mock('@/utils/conflictDetection', () => ({ detectConflicts: vi.fn(() => []) }));

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'owned-entry',
    dog_id: 'dog-1',
    class_id: 'class-1',
    show_id: 'show-1',
    check_in_status: 'checked-in',
    armband: '27',
    is_scored: false,
    result_status: null,
    dog_call_name: 'Ditto',
    ...overrides,
  };
}

function classRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'class-1',
    name: 'Container Novice A',
    status: 'Pending',
    is_scoring_finalized: false,
    results_released_at: null,
    ...overrides,
  };
}

async function emitShowChange() {
  await act(async () => {
    showChangeHandler?.({ table: 'entries' });
    vi.advanceTimersByTime(400);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useNotificationMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPreferences.enabled = true;
    mockAuth.userId = 'auth-user-1';
    mockUseShowDayData.mockReturnValue({ activeShows: [{ showId: 'show-1' }] });
    mockUseQueryResult.mockReturnValue({ data: null, refetch: mockRefetch });
    mockRefetch.mockResolvedValue({ data: null });
    showChangeHandler = undefined;
    vi.mocked(subscribeToShowChanges).mockImplementation((_showId, handler) => {
      showChangeHandler = handler;
      return mockUnsubscribe;
    });
  });

  afterEach(() => vi.useRealTimers());

  it('subscribes per show and cleans up without row-payload channels', () => {
    const { unmount } = renderHook(() => useNotificationMonitor());
    expect(subscribeToShowChanges).toHaveBeenCalledWith('show-1', expect.any(Function));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledOnce();
  });

  it('does not subscribe when disabled or there are no shows', () => {
    mockPreferences.enabled = false;
    renderHook(() => useNotificationMonitor());
    mockPreferences.enabled = true;
    mockUseShowDayData.mockReturnValueOnce({ activeShows: [] });
    renderHook(() => useNotificationMonitor());
    expect(subscribeToShowChanges).not.toHaveBeenCalled();
  });

  it('refetches authoritative state before delivering class and check-in alerts', async () => {
    mockRefetch.mockResolvedValue({
      data: {
        classes: [classRow({ status: 'In Progress' })],
        entries: [entry({ check_in_status: 'no-status' })],
      },
    });
    renderHook(() => useNotificationMonitor());

    await emitShowChange();

    expect(mockRefetch).toHaveBeenCalledOnce();
    expect(buildClassStartingPayload).toHaveBeenCalledWith({
      className: 'Container Novice A',
    });
    expect(buildCheckInReminderPayload).toHaveBeenCalledWith({
      dogName: 'Ditto',
      className: 'Container Novice A',
    });
    expect(mockDeliver).toHaveBeenCalledWith(expect.objectContaining({ type: 'class_starting' }));
  });

  it('recomputes dogs ahead from the refreshed in-ring snapshot', async () => {
    mockRefetch.mockResolvedValue({
      data: {
        classes: [classRow({ status: 'In Progress' })],
        entries: [
          entry({
            id: 'in-ring-entry',
            dog_id: 'other-dog',
            check_in_status: 'in-ring',
            dog_call_name: 'Scout',
          }),
          entry(),
        ],
      },
    });
    renderHook(() => useNotificationMonitor());

    await emitShowChange();

    // Scout is in the ring and is NOT part of the waiting queue (shared
    // run-queue INTENT), so Ditto is at its head: 0 dogs ahead. The push used to
    // say 1 — distance from the in-ring dog — contradicting the entry-list pill.
    expect(buildYourTurnPayload).toHaveBeenCalledWith(
      expect.objectContaining({ dogName: 'Ditto', className: 'Container Novice A', dogsAhead: 0 })
    );
    expect(mockDeliver).toHaveBeenCalledWith(expect.objectContaining({ type: 'your_turn' }));
  });

  it('does not repeat dogs-ahead alerts while the same entry remains in-ring', async () => {
    mockRefetch.mockResolvedValue({
      data: {
        classes: [classRow({ status: 'In Progress' })],
        entries: [
          entry({
            id: 'in-ring-entry',
            dog_id: 'other-dog',
            check_in_status: 'in-ring',
            dog_call_name: 'Scout',
          }),
          entry(),
        ],
      },
    });
    renderHook(() => useNotificationMonitor());

    await emitShowChange();
    expect(buildYourTurnPayload).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(60_001));
    await emitShowChange();

    expect(buildYourTurnPayload).toHaveBeenCalledOnce();
  });

  it('builds a released qualified result URL from the refreshed snapshot', async () => {
    mockRefetch.mockResolvedValue({
      data: {
        classes: [
          classRow({
            status: 'Complete',
            is_scoring_finalized: true,
            results_released_at: '2026-06-19T16:00:00.000Z',
          }),
        ],
        entries: [entry({ is_scored: true, result_status: 'qualified' })],
      },
    });
    renderHook(() => useNotificationMonitor());

    await emitShowChange();

    expect(buildResultsPostedPayload).toHaveBeenCalled();
    expect(mockDeliver).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'results_posted',
        actionUrl: '/exhibitor/entries?resultEntryId=owned-entry',
      })
    );
  });

  it('coalesces a burst and runs at most one trailing refetch while in flight', async () => {
    let resolveFirst: ((value: { data: null }) => void) | undefined;
    mockRefetch
      .mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)))
      .mockResolvedValue({ data: null });
    renderHook(() => useNotificationMonitor());

    await act(async () => {
      showChangeHandler?.({ table: 'entries' });
      showChangeHandler?.({ table: 'entries' });
      showChangeHandler?.({ table: 'entries' });
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(mockRefetch).toHaveBeenCalledOnce();

    await act(async () => {
      showChangeHandler?.({ table: 'entries' });
      showChangeHandler?.({ table: 'entries' });
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(mockRefetch).toHaveBeenCalledOnce();

    await act(async () => {
      resolveFirst?.({ data: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRefetch).toHaveBeenCalledTimes(2);
  });

  // MYK9-735: the dedupe used to live in refs, so every page load re-fired
  // alerts for a state that had held for weeks ("Results posted" on sign-in).
  describe('alerts once per user, not once per page load', () => {
    function deliveredTypes(): string[] {
      return mockDeliver.mock.calls.map(([payload]) => (payload as { type: string }).type);
    }

    function countOf(type: string): number {
      return deliveredTypes().filter(t => t === type).length;
    }

    function loadSnapshot(snapshot: NotificationSnapshot) {
      mockUseQueryResult.mockReturnValue({ data: snapshot, refetch: mockRefetch });
    }

    const finalized: NotificationSnapshot = {
      classes: [classRow({ status: 'Complete', is_scoring_finalized: true })],
      entries: [entry({ is_scored: true })],
    };

    const starting: NotificationSnapshot = {
      classes: [classRow({ status: 'In Progress' })],
      entries: [entry({ check_in_status: 'no-status' })],
    };

    const inRing: NotificationSnapshot = {
      classes: [classRow({ status: 'In Progress' })],
      entries: [
        entry({
          id: 'in-ring-entry',
          dog_id: 'other-dog',
          check_in_status: 'in-ring',
          dog_call_name: 'Scout',
        }),
        entry(),
      ],
    };

    it('delivers results for an already-finalized class on the first load only', () => {
      loadSnapshot(finalized);

      renderHook(() => useNotificationMonitor()).unmount();
      expect(countOf('results_posted')).toBe(1);

      mockDeliver.mockClear();
      renderHook(() => useNotificationMonitor()).unmount();
      expect(mockDeliver).not.toHaveBeenCalled();
    });

    it('delivers results for a class finalized while mounted', () => {
      loadSnapshot({ classes: [classRow({ status: 'Complete' })], entries: [entry()] });
      const { rerender } = renderHook(() => useNotificationMonitor());
      expect(countOf('results_posted')).toBe(0);

      loadSnapshot(finalized);
      rerender();

      expect(countOf('results_posted')).toBe(1);
    });

    it('delivers class-starting and check-in for an in-progress class on the first load only', () => {
      loadSnapshot(starting);

      renderHook(() => useNotificationMonitor()).unmount();
      expect(countOf('class_starting')).toBe(1);
      expect(countOf('check_in_reminder')).toBe(1);

      mockDeliver.mockClear();
      renderHook(() => useNotificationMonitor()).unmount();
      expect(mockDeliver).not.toHaveBeenCalled();
    });

    it('delivers class-starting and check-in for a class that starts while mounted', () => {
      loadSnapshot({ classes: [classRow()], entries: [entry({ check_in_status: 'no-status' })] });
      const { rerender } = renderHook(() => useNotificationMonitor());
      expect(mockDeliver).not.toHaveBeenCalled();

      loadSnapshot(starting);
      rerender();

      expect(countOf('class_starting')).toBe(1);
      expect(countOf('check_in_reminder')).toBe(1);
    });

    it('delivers dogs-ahead for the current in-ring dog on the first load only', () => {
      loadSnapshot(inRing);

      renderHook(() => useNotificationMonitor()).unmount();
      expect(countOf('your_turn')).toBe(1);

      mockDeliver.mockClear();
      act(() => vi.advanceTimersByTime(60_001));
      renderHook(() => useNotificationMonitor()).unmount();
      expect(countOf('your_turn')).toBe(0);
    });

    it('keeps the record per user, so another account on the same browser is alerted', () => {
      loadSnapshot(finalized);
      renderHook(() => useNotificationMonitor()).unmount();
      expect(countOf('results_posted')).toBe(1);

      mockDeliver.mockClear();
      mockAuth.userId = 'auth-user-2';
      renderHook(() => useNotificationMonitor()).unmount();
      expect(countOf('results_posted')).toBe(1);
    });

    it('still dedupes in memory when storage throws', async () => {
      const realStorage = window.localStorage;
      const throwing = {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {
          throw new Error('SecurityError');
        },
      };
      try {
        window.localStorage = throwing as unknown as Storage;
        mockRefetch.mockResolvedValue({ data: finalized });
        loadSnapshot(finalized);

        renderHook(() => useNotificationMonitor());
        expect(countOf('results_posted')).toBe(1);

        await emitShowChange();
        expect(mockRefetch).toHaveBeenCalledOnce();
        expect(countOf('results_posted')).toBe(1);
      } finally {
        window.localStorage = realStorage;
      }
    });
  });
});
