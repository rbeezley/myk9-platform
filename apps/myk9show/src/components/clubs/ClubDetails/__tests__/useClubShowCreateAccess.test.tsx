import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScopeType, UserRole } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';

const h = vi.hoisted(() => ({
  auth: { userWithRoles: null as unknown, refreshPermissions: vi.fn() },
  pending: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => h.auth }));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { getPendingMutationsForRow: h.pending },
}));

const { useClubShowCreateAccess } = await import('../useClubShowCreateAccess');
const { useClubShowCreateDenied } =
  await import('@/pages/secretary/ShowCreationWizard/clubShowCreatePermission');

const user = (clubIds: string[]) =>
  ({
    id: 'auth-uid',
    roles: [UserRole.SECRETARY],
    permissions: [],
    scopes: clubIds.map(scopeId => ({
      userId: 'auth-uid',
      roleId: UserRole.CLUB_ADMIN,
      scopeType: ScopeType.CLUB,
      scopeId,
      createdAt: new Date(0),
    })),
  }) as unknown as UserWithRoles;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useClubShowCreateAccess', () => {
  beforeEach(() => {
    h.auth.userWithRoles = user(['mine']);
    h.auth.refreshPermissions = vi.fn().mockResolvedValue(undefined);
    h.pending.mockReset().mockResolvedValue([]);
  });

  it('is unknown, not denied, while the club row has queued local mutations', async () => {
    h.pending.mockResolvedValue([{ id: 'm1' }]);
    const { result } = renderHook(() => useClubShowCreateAccess('new1'), { wrapper });
    await waitFor(() => expect(h.pending).toHaveBeenCalledWith('clubs', 'new1'));
    expect(result.current).toBe('unknown');
    const denied = renderHook(() => useClubShowCreateDenied('new1'), { wrapper });
    await waitFor(() => expect(h.pending).toHaveBeenCalledTimes(2));
    expect(denied.result.current).toBe(false);
  });

  it('still denies an ordinary unauthorized club (nothing queued) and allows an owned one', async () => {
    const { result } = renderHook(() => useClubShowCreateAccess('other'), { wrapper });
    await waitFor(() => expect(result.current).toBe('denied'));
    const owned = renderHook(() => useClubShowCreateAccess('mine'), { wrapper });
    expect(owned.result.current).toBe('allowed');
    expect(h.auth.refreshPermissions).not.toHaveBeenCalled();
  });

  it('refreshes permissions once when the queue drains, staying unknown until it resolves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let finishRefresh: () => void = () => {};
      h.auth.refreshPermissions = vi.fn(() => new Promise<void>(r => (finishRefresh = r)));
      h.pending.mockResolvedValue([{ id: 'm1' }]);
      const { result } = renderHook(() => useClubShowCreateAccess('new1'), { wrapper });
      await waitFor(() => expect(h.pending).toHaveBeenCalledTimes(1));

      h.pending.mockResolvedValue([]); // upload drained
      await vi.advanceTimersByTimeAsync(1600);
      await waitFor(() => expect(h.auth.refreshPermissions).toHaveBeenCalledTimes(1));
      expect(result.current).toBe('unknown'); // refresh still in flight

      finishRefresh(); // scopes still lack the club after the refresh
      await waitFor(() => expect(result.current).toBe('denied'));
      await vi.advanceTimersByTimeAsync(3200);
      expect(h.auth.refreshPermissions).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows once the refreshed scopes contain the club', async () => {
    h.pending.mockResolvedValue([{ id: 'm1' }]);
    const { result, rerender } = renderHook(() => useClubShowCreateAccess('new1'), { wrapper });
    await waitFor(() => expect(result.current).toBe('unknown'));
    h.auth.userWithRoles = user(['new1']);
    rerender();
    expect(result.current).toBe('allowed');
  });
});
