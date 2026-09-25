import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  subscribeToShowChanges,
  type ShowChangeListener,
} from '@/features/show-live-sync/showChangeSignal';
import { useNotificationMonitor } from '../useNotificationMonitor';
import { classRow, entry, type NotificationSnapshot } from './notificationMonitorFixtures';

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

// MYK9-735: the monitor used to alert on STATE, so every page load announced
// "Results posted" for a class finalized weeks earlier. Server push covers what
// happened while the user was away; the in-app monitor now alerts only on
// changes it observes while mounted. The first snapshot is a silent baseline.
describe('useNotificationMonitor alerts only on changes seen while open', () => {
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

  function countOf(type: string): number {
    return mockDeliver.mock.calls.filter(([payload]) => (payload as { type: string }).type === type)
      .length;
  }

  /** The next refetches succeed with this snapshot, requested "now". */
  function refetchFresh(snapshot: NotificationSnapshot) {
    mockRefetch.mockImplementation(async () => ({
      data: { ...snapshot, startedAt: Date.now() },
      dataUpdatedAt: Date.now(),
    }));
  }

  function loadSnapshot(snapshot: NotificationSnapshot) {
    mockUseQueryResult.mockReturnValue({ data: snapshot, refetch: mockRefetch });
  }

  const pending: NotificationSnapshot = {
    classes: [classRow()],
    entries: [entry({ check_in_status: 'no-status' })],
  };

  const inProgress: NotificationSnapshot = {
    classes: [classRow({ status: 'In Progress' })],
    entries: [entry({ check_in_status: 'no-status' })],
  };

  // The default visibility preset: visible on completion, never "released".
  const finalized: NotificationSnapshot = {
    classes: [classRow({ status: 'Complete', is_scoring_finalized: true })],
    entries: [entry({ is_scored: true })],
  };

  function withInRing(inRingEntryId: string): NotificationSnapshot {
    return {
      classes: [classRow({ status: 'In Progress' })],
      entries: [
        entry({
          id: 'in-ring-a',
          dog_id: 'dog-a',
          check_in_status: inRingEntryId === 'in-ring-a' ? 'in-ring' : 'checked-in',
        }),
        entry({
          id: 'in-ring-b',
          dog_id: 'dog-b',
          check_in_status: inRingEntryId === 'in-ring-b' ? 'in-ring' : 'checked-in',
        }),
        entry(),
      ],
    };
  }

  it('delivers nothing on mount or remount for a class already finalized and one already In Progress', () => {
    loadSnapshot({
      classes: [
        classRow({ status: 'Complete', is_scoring_finalized: true }),
        classRow({ id: 'class-2', status: 'In Progress' }),
      ],
      entries: [
        entry({ is_scored: true }),
        entry({ id: 'owned-entry-2', class_id: 'class-2', check_in_status: 'no-status' }),
      ],
    });

    renderHook(() => useNotificationMonitor()).unmount();
    renderHook(() => useNotificationMonitor()).unmount();

    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('announces results once when a class is finalized while mounted, with results_released_at null', async () => {
    loadSnapshot({ classes: [classRow({ status: 'Complete' })], entries: [entry()] });
    renderHook(() => useNotificationMonitor());
    expect(mockDeliver).not.toHaveBeenCalled();

    mockRefetch.mockResolvedValue({ data: finalized });
    await emitShowChange();
    await emitShowChange();

    expect(countOf('results_posted')).toBe(1);
    expect(mockDeliver).toHaveBeenCalledTimes(1);
  });

  it('announces class-starting and a check-in reminder when a class goes In Progress', () => {
    loadSnapshot(pending);
    const { rerender } = renderHook(() => useNotificationMonitor());
    expect(mockDeliver).not.toHaveBeenCalled();

    loadSnapshot(inProgress);
    rerender();
    loadSnapshot({ ...inProgress });
    rerender();

    expect(countOf('class_starting')).toBe(1);
    expect(countOf('check_in_reminder')).toBe(1);
  });

  it('reminds about a new unchecked entry that appears in a class already In Progress', () => {
    loadSnapshot({ classes: [classRow({ status: 'In Progress' })], entries: [entry()] });
    const { rerender } = renderHook(() => useNotificationMonitor());

    const withNewEntry: NotificationSnapshot = {
      classes: [classRow({ status: 'In Progress' })],
      entries: [entry(), entry({ id: 'owned-entry-2', check_in_status: 'no-status' })],
    };
    loadSnapshot(withNewEntry);
    rerender();
    loadSnapshot({ ...withNewEntry });
    rerender();

    expect(countOf('class_starting')).toBe(0);
    expect(countOf('check_in_reminder')).toBe(1);
  });

  it('announces dogs ahead when the in-ring entry changes, not for the one in the ring at mount', () => {
    loadSnapshot(withInRing('in-ring-a'));
    const { rerender } = renderHook(() => useNotificationMonitor());
    expect(countOf('your_turn')).toBe(0);

    loadSnapshot(withInRing('in-ring-b'));
    rerender();

    expect(countOf('your_turn')).toBe(1);
  });

  /** Runs `body` with a controllable `document.visibilityState`, restored afterwards. */
  async function withVisibility(
    body: (setVisibility: (next: DocumentVisibilityState) => Promise<void>) => Promise<void>
  ) {
    let visibility: DocumentVisibilityState = 'visible';
    const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    try {
      await body(async next => {
        visibility = next;
        await act(async () => {
          document.dispatchEvent(new Event('visibilitychange'));
          await Promise.resolve();
          await Promise.resolve();
        });
      });
    } finally {
      if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
      else delete (document as { visibilityState?: unknown }).visibilityState;
    }
  }

  // Backgrounded time counts as "away": server push covers it, so the app
  // re-baselines from a refetch taken the moment it is visible again.
  it('re-baselines after the app was hidden, then alerts on later changes', async () => {
    await withVisibility(async setVisibility => {
      loadSnapshot({ classes: [classRow({ status: 'Complete' })], entries: [entry()] });
      renderHook(() => useNotificationMonitor());

      await setVisibility('hidden');
      // While away: the class finalizes and the in-ring dog changes.
      const whileAway: NotificationSnapshot = {
        classes: [classRow({ status: 'Complete', is_scoring_finalized: true })],
        entries: [entry({ id: 'in-ring-b', dog_id: 'dog-b', check_in_status: 'in-ring' }), entry()],
      };
      refetchFresh(whileAway);
      await setVisibility('visible');
      await emitShowChange();
      expect(mockDeliver).not.toHaveBeenCalled();

      refetchFresh({
        ...whileAway,
        entries: [
          entry({ id: 'in-ring-b', dog_id: 'dog-b', check_in_status: 'checked-in' }),
          entry({ id: 'in-ring-c', dog_id: 'dog-c', check_in_status: 'in-ring' }),
          entry(),
        ],
      });
      await emitShowChange();
      expect(mockDeliver).toHaveBeenCalledTimes(1);
      expect(countOf('your_turn')).toBe(1);
    });
  });

  it('takes the baseline from a refetch on becoming visible, so the next change alerts', async () => {
    await withVisibility(async setVisibility => {
      loadSnapshot({ classes: [classRow()], entries: [entry()] });
      renderHook(() => useNotificationMonitor());

      await setVisibility('hidden');
      refetchFresh({ classes: [classRow()], entries: [entry()] });
      await setVisibility('visible');
      expect(mockRefetch).toHaveBeenCalledOnce();

      refetchFresh({ classes: [classRow({ status: 'In Progress' })], entries: [entry()] });
      await emitShowChange();

      expect(countOf('class_starting')).toBe(1);
      expect(mockDeliver).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the away baseline through a failed refetch that returns cached data', async () => {
    await withVisibility(async setVisibility => {
      const before: NotificationSnapshot = {
        classes: [classRow({ status: 'Complete' })],
        entries: [entry()],
      };
      loadSnapshot(before);
      renderHook(() => useNotificationMonitor());

      await setVisibility('hidden');
      // Back during a network failure: React Query hands back the cached
      // snapshot, last updated before the app went away, with the error.
      mockRefetch.mockResolvedValueOnce({
        data: before,
        dataUpdatedAt: Date.now() - 60_000,
        isError: true,
      });
      await setVisibility('visible');
      expect(mockRefetch).toHaveBeenCalledOnce();

      // The next successful fetch carries what changed while away.
      const whileAway: NotificationSnapshot = {
        classes: [classRow({ status: 'Complete', is_scoring_finalized: true })],
        entries: [entry({ id: 'in-ring-b', dog_id: 'dog-b', check_in_status: 'in-ring' }), entry()],
      };
      refetchFresh(whileAway);
      await emitShowChange();
      expect(mockDeliver).not.toHaveBeenCalled();

      const later: NotificationSnapshot = {
        ...whileAway,
        entries: [
          entry({ id: 'in-ring-b', dog_id: 'dog-b', check_in_status: 'checked-in' }),
          entry({ id: 'in-ring-c', dog_id: 'dog-c', check_in_status: 'in-ring' }),
          entry(),
        ],
      };
      refetchFresh(later);
      await emitShowChange();
      expect(mockDeliver).toHaveBeenCalledTimes(1);
      expect(countOf('your_turn')).toBe(1);
    });
  });

  // MYK9-742: a refresh that STARTED while hidden can resolve after the app is
  // visible again, carrying pre-resume state. Its completion time is after the
  // resume, but it must not end the away baseline, or the next refresh would
  // announce what changed while the user was away.
  it('keeps the away baseline through a refresh that started while hidden', async () => {
    await withVisibility(async setVisibility => {
      const before: NotificationSnapshot = {
        classes: [classRow({ status: 'Complete' })],
        entries: [entry()],
      };
      loadSnapshot(before);
      renderHook(() => useNotificationMonitor());

      await setVisibility('hidden');
      let resolveHidden: (snapshot: NotificationSnapshot) => void = () => {};
      mockRefetch.mockImplementationOnce(() => {
        // The request starts NOW, while hidden, and carries that start.
        const startedAt = Date.now();
        return new Promise(resolve => {
          resolveHidden = snapshot =>
            resolve({ data: { ...snapshot, startedAt }, dataUpdatedAt: Date.now() });
        });
      });
      // A show-change signal while hidden starts a refresh that is still in
      // flight when the user comes back.
      await emitShowChange();
      expect(mockRefetch).toHaveBeenCalledOnce();

      const whileAway: NotificationSnapshot = {
        classes: [classRow({ status: 'Complete', is_scoring_finalized: true })],
        entries: [entry({ id: 'in-ring-b', dog_id: 'dog-b', check_in_status: 'in-ring' }), entry()],
      };
      refetchFresh(whileAway);
      // Time passes while the app is in the background.
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      await setVisibility('visible');

      // The hidden-era request resolves after the resume with pre-resume state.
      await act(async () => {
        resolveHidden(before);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockRefetch).toHaveBeenCalledTimes(2);
      expect(mockDeliver).not.toHaveBeenCalled();

      const later: NotificationSnapshot = {
        ...whileAway,
        entries: [
          entry({ id: 'in-ring-b', dog_id: 'dog-b', check_in_status: 'checked-in' }),
          entry({ id: 'in-ring-c', dog_id: 'dog-c', check_in_status: 'in-ring' }),
          entry(),
        ],
      };
      refetchFresh(later);
      await emitShowChange();
      expect(mockDeliver).toHaveBeenCalledTimes(1);
      expect(countOf('your_turn')).toBe(1);
    });
  });

  // Codex review of #2458: if the refresh fired on resume FAILS, a later
  // successful poll that started after the resume must end the away baseline,
  // or the monitor stays silent until the next show-change signal.
  it('lets a later successful poll end the away baseline after a failed resume refresh', async () => {
    await withVisibility(async setVisibility => {
      const before: NotificationSnapshot = {
        classes: [classRow({ status: 'Complete' })],
        entries: [entry()],
      };
      loadSnapshot(before);
      const { rerender } = renderHook(() => useNotificationMonitor());

      await setVisibility('hidden');
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      mockRefetch.mockResolvedValueOnce({ data: before, isError: true });
      await setVisibility('visible');
      expect(mockRefetch).toHaveBeenCalledOnce();

      // The 30-second poll lands, requested after the resume: a baseline.
      const whileAway: NotificationSnapshot = {
        classes: [classRow({ status: 'Complete', is_scoring_finalized: true })],
        entries: [entry({ id: 'in-ring-b', dog_id: 'dog-b', check_in_status: 'in-ring' }), entry()],
        startedAt: Date.now(),
      };
      loadSnapshot(whileAway);
      rerender();
      expect(mockDeliver).not.toHaveBeenCalled();

      // The next poll carries a change seen while open, and it alerts.
      loadSnapshot({
        ...whileAway,
        entries: [
          entry({ id: 'in-ring-b', dog_id: 'dog-b', check_in_status: 'checked-in' }),
          entry({ id: 'in-ring-c', dog_id: 'dog-c', check_in_status: 'in-ring' }),
          entry(),
        ],
        startedAt: Date.now(),
      });
      rerender();
      expect(countOf('your_turn')).toBe(1);
    });
  });

  it('re-baselines on a user change instead of bursting alerts for the new user', () => {
    loadSnapshot({
      classes: [classRow({ status: 'Complete' }), classRow({ id: 'class-2' })],
      entries: [
        entry({ is_scored: true }),
        entry({ id: 'owned-entry-2', class_id: 'class-2', check_in_status: 'no-status' }),
      ],
    });
    const { rerender } = renderHook(() => useNotificationMonitor());

    mockAuth.userId = 'auth-user-2';
    loadSnapshot({
      classes: [
        classRow({ status: 'Complete', is_scoring_finalized: true }),
        classRow({ id: 'class-2', status: 'In Progress' }),
      ],
      entries: [
        entry({ is_scored: true }),
        entry({ id: 'owned-entry-2', class_id: 'class-2', check_in_status: 'no-status' }),
      ],
    });
    rerender();

    expect(mockDeliver).not.toHaveBeenCalled();
  });
});
