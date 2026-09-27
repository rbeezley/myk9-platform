import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAccountNotifications } from '../useAccountNotifications';

const {
  mockAddAlert,
  mockRefreshPermissions,
  mockUseQueryResult,
  mockUpdate,
  mockEq,
  mockIn,
} = vi.hoisted(() => {
  const mockIn = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockEq = vi.fn(() => ({ in: mockIn }));
  return {
    mockAddAlert: vi.fn(),
    mockRefreshPermissions: vi.fn(),
    mockUseQueryResult: vi.fn(() => ({ data: undefined as unknown })),
    mockUpdate: vi.fn(() => ({ eq: mockEq })),
    mockEq,
    mockIn,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ update: mockUpdate })) },
}));
vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: (selector: (state: { addAlert: typeof mockAddAlert }) => unknown) =>
    selector({ addAlert: mockAddAlert }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { id: 'auth-user-1' },
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
    mockUseQueryResult.mockReturnValue({ data: undefined });
  });

  it('delivers an unread club_access_approved row as the exact bell payload', () => {
    mockUseQueryResult.mockReturnValue({ data: [clubApprovedRow] });

    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).toHaveBeenCalledWith({
      id: 'notif-1',
      type: 'announcement',
      title: 'Account update',
      body: clubApprovedRow.message,
      priority: 'normal',
      actionUrl: '/clubs/club-1',
      timestamp: new Date(clubApprovedRow.created_at).getTime(),
    });
  });

  it('refreshes RBAC permissions after delivering a club_access_approved row', () => {
    mockUseQueryResult.mockReturnValue({ data: [clubApprovedRow] });

    renderHook(() => useAccountNotifications());

    expect(mockRefreshPermissions).toHaveBeenCalledOnce();
  });

  it('marks delivered rows read, scoped to the signed-in user, so a later poll does not redeliver them', () => {
    mockUseQueryResult.mockReturnValue({ data: [clubApprovedRow] });

    renderHook(() => useAccountNotifications());

    expect(mockUpdate).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'auth-user-1');
    expect(mockIn).toHaveBeenCalledWith('id', ['notif-1']);
  });

  it('does not redeliver the same row when a later poll returns it again unread', () => {
    // Each call returns a NEW array/object (a fresh poll response with the
    // same still-unread row), so the effect's `rows` dependency actually
    // changes identity across rerenders and the deliveredRef guard — not
    // React's own effect-dependency memoization — is what's under test.
    mockUseQueryResult.mockImplementation(() => ({ data: [{ ...clubApprovedRow }] }));

    const { rerender } = renderHook(() => useAccountNotifications());
    rerender();
    rerender();

    expect(mockAddAlert).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there are no unread rows', () => {
    mockUseQueryResult.mockReturnValue({ data: [] });

    renderHook(() => useAccountNotifications());

    expect(mockAddAlert).not.toHaveBeenCalled();
    expect(mockRefreshPermissions).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
