import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ACCOUNT_NOTIFICATIONS_POLL_MAX_MS,
  ACCOUNT_NOTIFICATIONS_POLL_MIN_MS,
  drawAccountNotificationsPollMs,
  useAccountNotifications,
} from '../useAccountNotifications';
import type { NotificationPayload } from '@myk9/notifications';
import type { AlertEntry } from '@/store/notificationStore';

const {
  mockAddAlert,
  mockDismissAlert,
  mockRefreshPermissions,
  mockUseQueryResult,
  mockUpdate,
  currentAuthUser,
  notificationState,
  queryOptionsSeen,
} = vi.hoisted(() => {
  const mockIn = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockEq = vi.fn(() => ({ in: mockIn }));
  const notificationState = { recentAlerts: [] as AlertEntry[] };
  return {
    mockAddAlert: vi.fn((payload: NotificationPayload) => {
      notificationState.recentAlerts = [
        { payload, read: false },
        ...notificationState.recentAlerts,
      ];
    }),
    mockDismissAlert: vi.fn((id: string) => {
      notificationState.recentAlerts = notificationState.recentAlerts.filter(
        alert => alert.payload.id !== id
      );
    }),
    mockRefreshPermissions: vi.fn(),
    mockUseQueryResult: vi.fn((): { data: unknown; dataUpdatedAt?: number } => ({
      data: undefined,
    })),
    mockUpdate: vi.fn(() => ({ eq: mockEq })),
    currentAuthUser: { id: 'auth-user-1' as string | null },
    notificationState,
    queryOptionsSeen: [] as {
      refetchInterval?: number;
      staleTime?: number;
      refetchOnWindowFocus?: boolean;
    }[],
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ update: mockUpdate })) },
}));
vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: Object.assign(
    (
      selector: (state: {
        addAlert: typeof mockAddAlert;
        dismissAlert: typeof mockDismissAlert;
      }) => unknown
    ) => selector({ addAlert: mockAddAlert, dismissAlert: mockDismissAlert }),
    { getState: () => notificationState }
  ),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: currentAuthUser.id ? { id: currentAuthUser.id } : null,
    refreshPermissions: mockRefreshPermissions,
  }),
}));
vi.mock('@tanstack/react-query', async () => ({
  ...(await vi.importActual('@tanstack/react-query')),
  useQuery: (options: (typeof queryOptionsSeen)[number]) => {
    queryOptionsSeen.push(options);
    return mockUseQueryResult();
  },
}));

const clubApprovedRow = {
  id: 'notif-1',
  type: 'club_access_approved',
  message: 'Riverside Kennel Club is approved. You can now manage the club and create its shows.',
  deep_link_url: '/clubs/club-1',
  created_at: '2026-09-27T12:00:00.000Z',
};

describe('useAccountNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthUser.id = 'auth-user-1';
    notificationState.recentAlerts = [];
    queryOptionsSeen.length = 0;
    mockUseQueryResult.mockReturnValue({ data: undefined });
  });

  // MYK9-1368: app-wide server poll, jittered per mount between 3 and 5 minutes.
  describe('poll cadence', () => {
    it('draws the interval from the 3-5 minute range and refetches on focus', () => {
      renderHook(() => useAccountNotifications());
      const options = queryOptionsSeen[0];
      expect(options.refetchInterval).toBeGreaterThanOrEqual(180_000);
      expect(options.refetchInterval).toBeLessThanOrEqual(300_000);
      expect(options.staleTime).toBe(options.refetchInterval);
      expect(options.refetchOnWindowFocus).toBe(true);
    });

    it('keeps the one draw across re-renders of the same mount', () => {
      const { rerender } = renderHook(() => useAccountNotifications());
      rerender();
      rerender();
      const intervals = new Set(queryOptionsSeen.map(options => options.refetchInterval));
      expect(intervals.size).toBe(1);
    });

    it('spans the bounds uniformly', () => {
      expect(ACCOUNT_NOTIFICATIONS_POLL_MIN_MS).toBe(180_000);
      expect(ACCOUNT_NOTIFICATIONS_POLL_MAX_MS).toBe(300_000);
      expect(drawAccountNotificationsPollMs(() => 0)).toBe(180_000);
      expect(drawAccountNotificationsPollMs(() => 0.5)).toBe(240_000);
      expect(drawAccountNotificationsPollMs(() => 0.999999)).toBeLessThanOrEqual(300_000);
    });
  });

  it('delivers an unread club_access_approved row as the exact bell payload', () => {
    mockUseQueryResult.mockReturnValue({
      data: { userId: 'auth-user-1', rows: [clubApprovedRow] },
    });

    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).toHaveBeenCalledWith({
      id: 'notif-1',
      type: 'announcement',
      title: 'Account update',
      body: clubApprovedRow.message,
      priority: 'normal',
      data: {
        accountNotificationUserId: 'auth-user-1',
        accountNotificationType: 'club_access_approved',
      },
      actionUrl: '/clubs/club-1',
      timestamp: new Date(clubApprovedRow.created_at).getTime(),
    });
  });

  // MYK9-1003: the secretary's automatic-offer notice reaches the bell, and
  // is not a role change.
  it('delivers a waitlist_auto_offer row to the bell without an RBAC refresh', () => {
    mockUseQueryResult.mockReturnValue({
      data: {
        userId: 'auth-user-1',
        rows: [
          {
            id: 'notif-wl-1',
            type: 'waitlist_auto_offer',
            message: 'Rex was offered the open spot in Novice A automatically.',
            deep_link_url: '/shows/show-1/entries?tab=waitlist',
            created_at: '2026-10-04T12:00:00.000Z',
          },
        ],
      },
    });

    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notif-wl-1',
        title: 'Wait list offer sent',
        actionUrl: '/shows/show-1/entries?tab=waitlist',
      })
    );
    expect(mockRefreshPermissions).not.toHaveBeenCalled();
  });

  it('delivers the mail-in head action to the secretary bell', () => {
    mockUseQueryResult.mockReturnValue({
      data: {
        userId: 'auth-user-1',
        rows: [
          {
            id: 'notif-mail-1',
            type: 'waitlist_mail_in_head',
            message:
              'A spot opened in Novice A. Rex is next and joined by mail; offer it from the Waitlist tab.',
            deep_link_url: '/shows/show-1/entries?tab=waitlist',
            created_at: '2026-10-07T01:00:00.000Z',
          },
        ],
      },
    });

    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notif-mail-1',
        title: 'Mail-in dog needs an offer',
        actionUrl: '/shows/show-1/entries?tab=waitlist',
      })
    );
    expect(mockRefreshPermissions).not.toHaveBeenCalled();
  });

  it('delivers a club awaiting authorization notice without an RBAC refresh', () => {
    mockUseQueryResult.mockReturnValue({
      data: {
        userId: 'auth-user-1',
        rows: [
          {
            id: 'notif-club-1',
            type: 'club_awaiting_authorization',
            message: 'Riverside KC was created by Pat Lee and is waiting for authorization.',
            deep_link_url: '/clubs/club-1',
            created_at: '2026-10-22T01:00:00.000Z',
          },
        ],
      },
    });

    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notif-club-1',
        title: 'Club waiting for authorization',
        actionUrl: '/clubs/club-1',
      })
    );
    expect(mockRefreshPermissions).not.toHaveBeenCalled();
  });

  describe('folded club awaiting authorization notices (MYK9-1395)', () => {
    const creatorLink = '/admin/onboarding?creator=creator-1';
    const foldedRow = (id: string, message: string, link = creatorLink) => ({
      id,
      type: 'club_awaiting_authorization',
      message,
      deep_link_url: link,
      created_at: '2026-10-27T20:00:00.000Z',
    });

    it('replaces the visible alert when the database folds a later club into a new row', () => {
      let rows = [
        foldedRow('notif-a', 'Club A was created by Pat and is waiting for authorization.'),
      ];
      let updatedAt = 1;
      mockUseQueryResult.mockImplementation(() => ({
        data: { userId: 'auth-user-1', rows },
        dataUpdatedAt: updatedAt,
      }));

      const { rerender } = renderHook(() => useAccountNotifications());
      // The trigger deleted notif-a and inserted notif-b for the same creator.
      rows = [foldedRow('notif-b', 'Pat created clubs waiting for authorization, latest: Club B.')];
      updatedAt = 2;
      rerender();
      rows = [foldedRow('notif-c', 'Pat created clubs waiting for authorization, latest: Club C.')];
      updatedAt = 3;
      rerender();

      expect(notificationState.recentAlerts.map(a => a.payload.id)).toEqual(['notif-c']);
      expect(mockDismissAlert).toHaveBeenCalledWith('notif-a');
      expect(mockDismissAlert).toHaveBeenCalledWith('notif-b');
    });

    it("keeps a different creator's folded notice and other types with the same link", () => {
      let rows: ReturnType<typeof foldedRow>[] = [
        foldedRow('notif-a', 'Club A was created by Pat and is waiting for authorization.'),
        {
          ...foldedRow('notif-x', 'Other notice'),
          type: 'club_access_approved',
        },
      ];
      let updatedAt = 1;
      mockUseQueryResult.mockImplementation(() => ({
        data: { userId: 'auth-user-1', rows },
        dataUpdatedAt: updatedAt,
      }));

      const { rerender } = renderHook(() => useAccountNotifications());
      rows = [
        ...rows,
        foldedRow(
          'notif-z',
          'Club Z was created by Sam and is waiting for authorization.',
          '/admin/onboarding?creator=creator-2'
        ),
      ];
      updatedAt = 2;
      rerender();

      expect(notificationState.recentAlerts.map(a => a.payload.id).sort()).toEqual([
        'notif-a',
        'notif-x',
        'notif-z',
      ]);
      expect(mockDismissAlert).not.toHaveBeenCalled();
    });
  });

  it('refreshes RBAC permissions after delivering a club_access_approved row', () => {
    mockUseQueryResult.mockReturnValue({
      data: { userId: 'auth-user-1', rows: [clubApprovedRow] },
    });

    renderHook(() => useAccountNotifications());

    expect(mockRefreshPermissions).toHaveBeenCalledOnce();
  });

  it('leaves a delivered row unread until the requester views or dismisses it', () => {
    mockUseQueryResult.mockReturnValue({
      data: { userId: 'auth-user-1', rows: [clubApprovedRow] },
    });

    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('delivers the same unread row again after a reload resets the in-memory bell', () => {
    mockUseQueryResult.mockReturnValue({
      data: { userId: 'auth-user-1', rows: [clubApprovedRow] },
    });

    const firstMount = renderHook(() => useAccountNotifications());
    firstMount.unmount();
    notificationState.recentAlerts = [];
    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).toHaveBeenCalledTimes(2);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not redeliver the same row when a later poll returns it again unread', () => {
    // Each call returns a NEW array/object (a fresh poll response with the
    // same still-unread row), so the effect checks the store on each response.
    mockUseQueryResult.mockImplementation(() => ({
      data: { userId: 'auth-user-1', rows: [{ ...clubApprovedRow }] },
    }));

    const { rerender } = renderHook(() => useAccountNotifications());
    rerender();
    rerender();

    expect(mockAddAlert).toHaveBeenCalledTimes(1);
  });

  it('restores an unread notice removed from local state on the next poll', () => {
    const data = { userId: 'auth-user-1', rows: [clubApprovedRow] };
    let updatedAt = 1;
    mockUseQueryResult.mockImplementation(() => ({ data, dataUpdatedAt: updatedAt }));

    const { rerender } = renderHook(() => useAccountNotifications());
    notificationState.recentAlerts = []; // Local alert state was cleared.
    updatedAt = 2;
    rerender();

    expect(mockAddAlert).toHaveBeenCalledTimes(2);
  });

  it('keeps all 51 unread account notices stable across polls', () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      ...clubApprovedRow,
      id: `notif-${index}`,
    }));
    const data = { userId: 'auth-user-1', rows };
    let updatedAt = 1;
    mockUseQueryResult.mockImplementation(() => ({ data, dataUpdatedAt: updatedAt }));

    const { rerender } = renderHook(() => useAccountNotifications());
    expect(mockAddAlert).toHaveBeenCalledTimes(51);
    expect(notificationState.recentAlerts).toHaveLength(51);
    updatedAt = 2;
    rerender();
    expect(mockAddAlert).toHaveBeenCalledTimes(51);
    expect(mockRefreshPermissions).toHaveBeenCalledOnce();
  });

  it('clears the prior account notice and restores it when that user returns', () => {
    mockUseQueryResult.mockReturnValue({
      data: { userId: 'auth-user-1', rows: [clubApprovedRow] },
    });
    const { rerender } = renderHook(() => useAccountNotifications());

    currentAuthUser.id = 'auth-user-2';
    mockUseQueryResult.mockReturnValue({ data: { userId: 'auth-user-2', rows: [] } });
    rerender();
    expect(mockDismissAlert).toHaveBeenCalledWith('notif-1');
    expect(notificationState.recentAlerts).toEqual([]);

    currentAuthUser.id = 'auth-user-1';
    mockUseQueryResult.mockReturnValue({
      data: { userId: 'auth-user-1', rows: [clubApprovedRow] },
    });
    rerender();
    expect(mockAddAlert).toHaveBeenCalledTimes(2);
  });

  it('ignores notification types that belong to other delivery paths and never marks them read', () => {
    mockUseQueryResult.mockReturnValue({
      data: {
        userId: 'auth-user-1',
        rows: [{ ...clubApprovedRow, id: 'notif-other', type: 'entry_confirmed' }],
      },
    });
    renderHook(() => useAccountNotifications());
    expect(mockAddAlert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does nothing when there are no unread rows', () => {
    mockUseQueryResult.mockReturnValue({ data: { userId: 'auth-user-1', rows: [] } });

    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).not.toHaveBeenCalled();
    expect(mockRefreshPermissions).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('delivers nothing and marks nothing read when the fetch result belongs to a previous user (stale data after an account switch)', () => {
    // Current session is user B, but the query result in flight was fetched
    // for user A (e.g. resolved just after an in-app account switch).
    currentAuthUser.id = 'auth-user-2';
    mockUseQueryResult.mockReturnValue({
      data: { userId: 'auth-user-1', rows: [clubApprovedRow] },
    });

    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).not.toHaveBeenCalled();
    expect(mockRefreshPermissions).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('delivers a switched-in user row even when its id matches an already-delivered row from the previous user', () => {
    currentAuthUser.id = 'auth-user-1';
    mockUseQueryResult.mockReturnValue({
      data: { userId: 'auth-user-1', rows: [clubApprovedRow] },
    });
    const { rerender } = renderHook(() => useAccountNotifications());
    expect(mockAddAlert).toHaveBeenCalledTimes(1);

    currentAuthUser.id = 'auth-user-2';
    mockUseQueryResult.mockReturnValue({
      data: { userId: 'auth-user-2', rows: [{ ...clubApprovedRow, id: 'notif-1' }] },
    });
    rerender();

    expect(mockAddAlert).toHaveBeenCalledTimes(2);
  });
});
