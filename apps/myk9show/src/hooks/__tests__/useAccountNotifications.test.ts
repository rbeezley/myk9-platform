import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAccountNotifications } from '../useAccountNotifications';
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
  useQuery: () => mockUseQueryResult(),
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
    mockUseQueryResult.mockReturnValue({ data: undefined });
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
      data: { accountNotificationUserId: 'auth-user-1' },
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
