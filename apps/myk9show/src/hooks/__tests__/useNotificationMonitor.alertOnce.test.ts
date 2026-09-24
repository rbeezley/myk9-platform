import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  subscribeToShowChanges,
  type ShowChangeListener,
} from '@/features/show-live-sync/showChangeSignal';
import { useNotificationMonitor } from '../useNotificationMonitor';
import {
  classRow,
  daysAgoIso,
  entry,
  type NotificationSnapshot,
} from './notificationMonitorFixtures';

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

async function emitShowChange() {
  await act(async () => {
    showChangeHandler?.({ table: 'entries' });
    vi.advanceTimersByTime(400);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// MYK9-735: the dedupe used to live in refs, so every page load re-fired
// alerts for a state that had held for weeks ("Results posted" on sign-in).
describe('useNotificationMonitor alerts once per user, not once per page load', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPreferences.enabled = true;
    mockAuth.userId = 'auth-user-1';
    mockDeliver.mockReturnValue(true);
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

  function deliveredTypes(): string[] {
    return mockDeliver.mock.calls.map(([payload]) => (payload as { type: string }).type);
  }

  function countOf(type: string): number {
    return deliveredTypes().filter(t => t === type).length;
  }

  function loadSnapshot(snapshot: NotificationSnapshot) {
    mockUseQueryResult.mockReturnValue({ data: snapshot, refetch: mockRefetch });
  }

  // "Results posted" means released: exhibitors cannot see results before
  // the secretary releases them (the public results release gate).
  const RELEASED_AT = daysAgoIso(1);
  const released: NotificationSnapshot = {
    classes: [
      classRow({
        status: 'Complete',
        is_scoring_finalized: true,
        results_released_at: RELEASED_AT,
      }),
    ],
    entries: [entry({ is_scored: true })],
  };
  const finalizedUnreleased: NotificationSnapshot = {
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

  it('delivers results for an already-released class on the first load only', () => {
    loadSnapshot(released);

    renderHook(() => useNotificationMonitor()).unmount();
    expect(countOf('results_posted')).toBe(1);

    mockDeliver.mockClear();
    renderHook(() => useNotificationMonitor()).unmount();
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('delivers results for a class released while mounted', () => {
    loadSnapshot({ classes: [classRow({ status: 'Complete' })], entries: [entry()] });
    const { rerender } = renderHook(() => useNotificationMonitor());
    expect(countOf('results_posted')).toBe(0);

    loadSnapshot(released);
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
    loadSnapshot(released);
    renderHook(() => useNotificationMonitor()).unmount();
    expect(countOf('results_posted')).toBe(1);

    mockDeliver.mockClear();
    mockAuth.userId = 'auth-user-2';
    renderHook(() => useNotificationMonitor()).unmount();
    expect(countOf('results_posted')).toBe(1);
  });

  // A pruned record must never re-fire: the freshness gate and the prune
  // share one window, so a class older than the window cannot alert at all.
  it('does not announce results released outside the 30-day window, even with an empty ledger', () => {
    loadSnapshot({
      classes: [
        classRow({
          status: 'Complete',
          is_scoring_finalized: true,
          results_released_at: daysAgoIso(45),
          trial: { show_id: 'show-1', date: daysAgoIso(45).slice(0, 10) },
        }),
      ],
      entries: [entry({ is_scored: true })],
    });

    renderHook(() => useNotificationMonitor());

    expect(countOf('results_posted')).toBe(0);
  });

  it('announces results released inside the window', () => {
    loadSnapshot({
      classes: [
        classRow({
          status: 'Complete',
          is_scoring_finalized: true,
          results_released_at: daysAgoIso(2),
          trial: { show_id: 'show-1', date: daysAgoIso(2).slice(0, 10) },
        }),
      ],
      entries: [entry({ is_scored: true })],
    });

    renderHook(() => useNotificationMonitor());

    expect(countOf('results_posted')).toBe(1);
  });

  it('does not alert or record a finalized class until its results are released', () => {
    loadSnapshot(finalizedUnreleased);
    renderHook(() => useNotificationMonitor()).unmount();
    expect(countOf('results_posted')).toBe(0);
    expect(window.localStorage.length).toBe(0);

    loadSnapshot(released);
    renderHook(() => useNotificationMonitor()).unmount();
    renderHook(() => useNotificationMonitor()).unmount();
    expect(countOf('results_posted')).toBe(1);
  });

  it('treats an un-release and re-release as a new event', () => {
    loadSnapshot(released);
    renderHook(() => useNotificationMonitor()).unmount();

    loadSnapshot({
      ...released,
      classes: [
        classRow({
          status: 'Complete',
          is_scoring_finalized: true,
          results_released_at: daysAgoIso(0),
        }),
      ],
    });
    renderHook(() => useNotificationMonitor()).unmount();

    expect(countOf('results_posted')).toBe(2);
  });

  it('does not announce class-starting or check-in for a trial outside the window', () => {
    loadSnapshot({
      classes: [
        classRow({
          status: 'In Progress',
          trial: { show_id: 'show-1', date: daysAgoIso(45).slice(0, 10) },
        }),
      ],
      entries: [entry({ check_in_status: 'no-status' })],
    });

    renderHook(() => useNotificationMonitor());

    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('reminds about a new unchecked entry after class-starting was already delivered', () => {
    loadSnapshot({ classes: [classRow({ status: 'In Progress' })], entries: [entry()] });
    const { rerender } = renderHook(() => useNotificationMonitor());
    expect(countOf('class_starting')).toBe(1);
    expect(countOf('check_in_reminder')).toBe(0);

    const withNewEntry: NotificationSnapshot = {
      classes: [classRow({ status: 'In Progress' })],
      entries: [entry(), entry({ id: 'owned-entry-2', check_in_status: 'no-status' })],
    };
    loadSnapshot(withNewEntry);
    rerender();
    loadSnapshot({ ...withNewEntry });
    rerender();

    expect(countOf('class_starting')).toBe(1);
    expect(countOf('check_in_reminder')).toBe(1);
  });

  it('does not record an alert that delivery suppressed', () => {
    loadSnapshot(released);
    mockDeliver.mockReturnValue(false);
    renderHook(() => useNotificationMonitor()).unmount();

    mockDeliver.mockReset();
    mockDeliver.mockReturnValue(true);
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
      mockRefetch.mockResolvedValue({ data: released });
      loadSnapshot(released);

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
