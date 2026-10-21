/**
 * MYK9-1308: RBAC refreshes on focus / reconnect / auth event, never on a
 * timer, and never clears the cache before the refresh.
 */
import { act, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import {
  accessForRole,
  mockAuthReturn,
  mockUser,
  renderWithAuthProvider as renderWithProvider,
} from './AuthContext.testHarness';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';

const { mockRbacService, mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockRbacService: {
    getUserPermissions: vi.fn(),
    getUserRoles: vi.fn(),
    getUserRolesByEmail: vi.fn(),
    hasPermission: vi.fn(),
    checkPermission: vi.fn(),
    clearUserCache: vi.fn(),
    clearAllCache: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/services/rbac/RBACService', () => ({ rbacService: mockRbacService }));

import { AuthProvider } from '@/context/AuthContext';

const GAP_MS = 60_000;

const Roles = () => {
  const auth = useAuthContext();
  return (
    <span data-testid="roles">
      {auth.userWithRoles?.roles.join(',') ?? 'none'}|{auth.rbacError ?? 'ok'}
    </span>
  );
};

const renderRoles = () => renderWithProvider(AuthProvider, <Roles />, '/');
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const fire = (target: Document | Window, type: string) =>
  act(async () => {
    target.dispatchEvent(new Event(type));
  });

describe('RBAC refresh cadence (MYK9-1308)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSupabase.from.mockImplementation(() => createChainableQuery());
    mockUseAuth.mockReturnValue(mockAuthReturn);
    mockRbacService.getUserPermissions.mockResolvedValue(accessForRole(UserRole.SECRETARY));
    mockRbacService.getUserRoles.mockResolvedValue([]);
    mockRbacService.getUserRolesByEmail.mockResolvedValue([]);
    mockRbacService.hasPermission.mockResolvedValue(false);
    mockRbacService.checkPermission.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function booted() {
    renderRoles();
    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent(UserRole.SECRETARY));
    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(1);
  }

  it('makes no RPC call after five minutes with no focus', async () => {
    await booted();
    await advance(5 * 60 * 1000 + 1000);
    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(1);
    expect(mockRbacService.clearUserCache).not.toHaveBeenCalled();
  });

  it('refreshes exactly once when the tab becomes visible after the gap, with fresh read and no clear', async () => {
    await booted();
    mockRbacService.getUserPermissions.mockResolvedValue(accessForRole(UserRole.EXHIBITOR));
    await advance(GAP_MS + 1000);
    await fire(document, 'visibilitychange');
    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent(UserRole.EXHIBITOR));
    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2);
    expect(mockRbacService.getUserPermissions).toHaveBeenLastCalledWith(mockUser.id, undefined, {
      bypassCache: true,
    });
    expect(mockRbacService.clearUserCache).not.toHaveBeenCalled();
  });

  it('collapses focus events inside the gap into no extra refresh, and a pair after it into one', async () => {
    await booted();
    await advance(GAP_MS - 5000);
    await fire(window, 'focus');
    await fire(document, 'visibilitychange');
    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(1);

    await advance(10_000);
    await fire(window, 'focus');
    await fire(document, 'visibilitychange');
    await waitFor(() => expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2));
  });

  it('keeps the loaded roles when a focus refresh fails', async () => {
    await booted();
    mockRbacService.getUserPermissions.mockRejectedValue(new Error('boom: rpc down'));
    await advance(GAP_MS + 1000);
    await fire(window, 'focus');
    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent('boom: rpc down'));
    expect(screen.getByTestId('roles')).toHaveTextContent(UserRole.SECRETARY);
    expect(mockRbacService.clearUserCache).not.toHaveBeenCalled();
  });

  it('safety net: refreshes at 15 minutes with no focus, not at 14, and invalidates identity', async () => {
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    await booted();
    await advance(14 * 60 * 1000);
    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(1);
    await advance(60 * 1000 + 100);
    await waitFor(() => expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2));
    expect(mockRbacService.getUserPermissions).toHaveBeenLastCalledWith(mockUser.id, undefined, {
      bypassCache: true,
    });
    expect(spy).toHaveBeenCalledWith(
      { queryKey: ['userProfile', mockUser.id] },
      { cancelRefetch: false }
    );
    expect(mockRbacService.clearUserCache).not.toHaveBeenCalled();
  });

  it('safety net skips while the tab is hidden; showing the tab fires one refresh', async () => {
    await booted();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await advance(15 * 60 * 1000 + 1000);
    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue('visible');
    await fire(document, 'visibilitychange');
    await waitFor(() => expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2));
  });

  it('a focus refresh is silent: rbacLoading never goes true', async () => {
    const loadingSeen: boolean[] = [];
    const Probe = () => {
      const auth = useAuthContext();
      loadingSeen.push(auth.rbacLoading);
      return <span data-testid="roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>;
    };
    renderWithProvider(AuthProvider, <Probe />, '/');
    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent(UserRole.SECRETARY));
    await waitFor(() => expect(loadingSeen[loadingSeen.length - 1]).toBe(false));
    const before = loadingSeen.length;

    mockRbacService.getUserPermissions.mockResolvedValue(accessForRole(UserRole.EXHIBITOR));
    await advance(GAP_MS + 1000);
    await fire(window, 'focus');
    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent(UserRole.EXHIBITOR));
    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2);
    expect(loadingSeen.slice(before)).not.toContain(true);
  });

  it('visibilitychange and focus in the same tick start one refresh, and it invalidates identity', async () => {
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    await booted();
    await advance(GAP_MS + 1000);
    let release: (() => void) | undefined;
    mockRbacService.getUserPermissions.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve(accessForRole(UserRole.SECRETARY));
        })
    );
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(
      { queryKey: ['userProfile', mockUser.id] },
      { cancelRefetch: false }
    );
    await act(async () => release?.());
  });

  it('a window focus alone (no visibilitychange) invalidates identity through the RBAC path', async () => {
    const spy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    await booted();
    await advance(GAP_MS + 1000);
    await fire(window, 'focus');
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        { queryKey: ['userProfile', mockUser.id] },
        { cancelRefetch: false }
      )
    );
  });

  it('a failed focus refresh does not suppress the next focus', async () => {
    await booted();
    mockRbacService.getUserPermissions.mockRejectedValueOnce(new Error('boom: rpc down'));
    await advance(GAP_MS + 1000);
    await fire(window, 'focus');
    await waitFor(() => expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent('boom: rpc down'));

    await advance(1000);
    await fire(window, 'focus');
    await waitFor(() => expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(3));
  });

  it('still refreshes immediately on reconnect, inside the gap, without clearing', async () => {
    await booted();
    await fire(window, 'online');
    await waitFor(() => expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2));
    expect(mockRbacService.clearUserCache).not.toHaveBeenCalled();
  });

  it('refreshes on TOKEN_REFRESHED and ignores the SIGNED_IN refocus echo', async () => {
    await booted();
    const emit = (event: string) =>
      act(async () => {
        for (const [handler] of mockSupabase.auth.onAuthStateChange.mock.calls) {
          (handler as (e: string, session: unknown) => void)(event, { user: mockUser });
        }
      });
    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled();

    await emit('SIGNED_IN');
    expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(1);

    await emit('TOKEN_REFRESHED');
    await waitFor(() => expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2));
  });
});
