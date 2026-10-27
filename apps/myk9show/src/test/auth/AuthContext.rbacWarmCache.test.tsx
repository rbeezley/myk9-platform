/**
 * MYK9-1349: a saved permissions copy (same user id, at most 24h old) paints
 * the app before the server answers; the server's answer REPLACES it.
 */
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import type { UserPermissionsResponse } from '@/types/rbac-types';
import {
  accessForRole,
  mockAuthReturn,
  mockUser,
  renderWithAuthProvider as renderWithProvider,
} from './AuthContext.testHarness';
import { savePersonIdentityCache, loadPersonIdentityCache } from '@/context/personIdentityCache';
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

import { AuthProvider, ProtectedRoute } from '@/context/AuthContext';
import {
  RBAC_CACHE_TTL_MS,
  RBAC_WARM_CACHE_MAX_AGE_MS,
  loadRbacPermissionsCache,
} from '@/context/rbacPermissionsCache';

const EMPTY: UserPermissionsResponse = {
  roles: [],
  permissions: [],
  effectivePermissions: [],
  effectivePermissionScopes: [],
};

function seed(userId: string, ageMs: number, data = accessForRole(UserRole.SECRETARY)) {
  localStorage.setItem(
    `myk9show:rbac-cache:${userId}`,
    JSON.stringify({ cachedAt: new Date(Date.now() - ageMs).toISOString(), data })
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ProtectedRoute redirects a signed-out user in a loop, so the sign-out test
// renders the gate-free variant.
const Probe = ({ gate = true }: { gate?: boolean }) => {
  const auth = useAuthContext();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="roles">{auth.userWithRoles?.roles.join(',') ?? 'none'}</span>
      <span data-testid="from-cache">{auth.rbacFromCacheAt ?? 'live'}</span>
      {gate && (
        <ProtectedRoute requiredRole={UserRole.SECRETARY} fallback={<span>denied</span>}>
          <span>secretary surface</span>
        </ProtectedRoute>
      )}
    </div>
  );
};

const renderProbe = () => renderWithProvider(AuthProvider, <Probe />, '/');

describe('AuthContext RBAC warm cache (MYK9-1349)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation(() => createChainableQuery());
    mockUseAuth.mockReturnValue(mockAuthReturn);
    mockRbacService.getUserRoles.mockResolvedValue([]);
    mockRbacService.getUserRolesByEmail.mockResolvedValue([]);
    mockRbacService.hasPermission.mockResolvedValue(false);
    mockRbacService.checkPermission.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('same user: renders from a fresh saved copy before the server answers', async () => {
    seed(mockUser.id, 60 * 60 * 1000);
    const server = deferred<UserPermissionsResponse>();
    mockRbacService.getUserPermissions.mockReturnValue(server.promise);

    renderProbe();

    await waitFor(() => expect(screen.getByText('secretary surface')).toBeInTheDocument());
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    // Online warm seed must not claim "working offline".
    expect(screen.getByTestId('from-cache')).toHaveTextContent('live');

    await act(async () => {
      server.resolve(accessForRole(UserRole.SECRETARY));
    });
    expect(screen.getByText('secretary surface')).toBeInTheDocument();
  });

  it('revocation: the server answer without the role removes the surface at once', async () => {
    seed(mockUser.id, 60 * 1000);
    const server = deferred<UserPermissionsResponse>();
    mockRbacService.getUserPermissions.mockReturnValue(server.promise);

    renderProbe();
    await waitFor(() => expect(screen.getByText('secretary surface')).toBeInTheDocument());

    await act(async () => {
      server.resolve(EMPTY);
    });

    await waitFor(() => expect(screen.queryByText('secretary surface')).not.toBeInTheDocument());
    expect(screen.getByText('denied')).toBeInTheDocument();
    // The revoked copy is replaced on disk too.
    expect(loadRbacPermissionsCache(mockUser.id)?.data.roles).toEqual([]);
  });

  it('user switch: user B never renders from user A saved copy', async () => {
    seed('user-a', 60 * 1000);
    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: { ...mockUser, id: 'user-a' } });
    const serverA = deferred<UserPermissionsResponse>();
    mockRbacService.getUserPermissions.mockReturnValue(serverA.promise);

    const view = renderProbe();
    await waitFor(() => expect(screen.getByText('secretary surface')).toBeInTheDocument());

    const serverB = deferred<UserPermissionsResponse>();
    mockRbacService.getUserPermissions.mockReturnValue(serverB.promise);
    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: { ...mockUser, id: 'user-b' } });
    view.rerender(<Probe />);

    await waitFor(() => expect(screen.queryByText('secretary surface')).not.toBeInTheDocument());
    expect(screen.getByTestId('roles')).toHaveTextContent('none');
    expect(localStorage.getItem('myk9show:rbac-cache:user-a')).toBeNull();
  });

  it('sign-out clears the copy, so signing back in has nothing to warm from', async () => {
    seed('user-a', 60 * 1000);
    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: { ...mockUser, id: 'user-a' } });
    mockRbacService.getUserPermissions.mockReturnValue(deferred().promise);
    const view = renderWithProvider(AuthProvider, <Probe gate={false} />, '/');
    await waitFor(() => expect(screen.getByTestId('roles')).toHaveTextContent(UserRole.SECRETARY));

    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: null });
    view.rerender(<Probe gate={false} />);
    await waitFor(() => expect(localStorage.getItem('myk9show:rbac-cache:user-a')).toBeNull());

    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: { ...mockUser, id: 'user-a' } });
    view.rerender(<Probe gate={false} />);
    expect(screen.getByTestId('roles')).toHaveTextContent('none');
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('boot with auth resolved and no user purges a prior user copy (sign-out the app never saw)', async () => {
    seed('user-a', 60 * 1000);
    savePersonIdentityCache('user-a', 'person-a');
    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: null, loading: false });
    mockRbacService.getUserPermissions.mockReturnValue(deferred().promise);

    const view = renderWithProvider(AuthProvider, <Probe gate={false} />, '/');
    await waitFor(() => expect(localStorage.getItem('myk9show:rbac-cache:user-a')).toBeNull());
    expect(loadPersonIdentityCache('user-a')).toBeNull();

    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: { ...mockUser, id: 'user-a' } });
    view.rerender(<Probe gate={false} />);
    expect(screen.getByTestId('roles')).toHaveTextContent('none');
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('boot with auth still unresolved does not purge (offline cold boot needs the copy)', async () => {
    seed('user-a', 60 * 1000);
    savePersonIdentityCache('user-a', 'person-a');
    mockUseAuth.mockReturnValue({ ...mockAuthReturn, user: null, loading: true });
    mockRbacService.getUserPermissions.mockReturnValue(deferred().promise);

    renderWithProvider(AuthProvider, <Probe gate={false} />, '/');
    await act(async () => {});

    expect(loadRbacPermissionsCache('user-a')).not.toBeNull();
    expect(loadPersonIdentityCache('user-a')).not.toBeNull();
  });

  it('non-network failure after a warm seed keeps roles, retries, and a later revoked answer removes the surface', async () => {
    vi.useFakeTimers();
    try {
      seed(mockUser.id, 60 * 1000);
      mockRbacService.getUserPermissions
        .mockRejectedValueOnce(new Error('boom: RPC exploded'))
        .mockResolvedValue(EMPTY);

      renderProbe();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(1);
      expect(screen.getByText('secretary surface')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('secretary surface')).not.toBeInTheDocument();
      expect(screen.getByText('denied')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-revalidation is bounded: two retries (30s, 60s), then it hands back', async () => {
    vi.useFakeTimers();
    try {
      seed(mockUser.id, 60 * 1000);
      mockRbacService.getUserPermissions.mockRejectedValue(new Error('boom: RPC exploded'));

      renderProbe();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(3);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000);
      });
      expect(mockRbacService.getUserPermissions).toHaveBeenCalledTimes(3);
      expect(screen.getByText('secretary surface')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('max age: a 25h-old copy is not used warm (but survives for the offline fallback)', async () => {
    expect(RBAC_WARM_CACHE_MAX_AGE_MS).toBeLessThan(RBAC_CACHE_TTL_MS);
    seed(mockUser.id, 25 * 60 * 60 * 1000);
    mockRbacService.getUserPermissions.mockReturnValue(deferred().promise);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('loading')).toBeInTheDocument());
    expect(screen.queryByText('secretary surface')).not.toBeInTheDocument();
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    expect(loadRbacPermissionsCache(mockUser.id)).not.toBeNull();
  });

  it('max age: the same 25h-old copy still hydrates the offline cold boot (7-day TTL)', async () => {
    seed(mockUser.id, 25 * 60 * 60 * 1000);
    mockRbacService.getUserPermissions.mockRejectedValue(new Error('TypeError: Failed to fetch'));

    renderProbe();

    await waitFor(() => expect(screen.getByText('secretary surface')).toBeInTheDocument(), {
      timeout: 5000,
    });
    // toCacheHydratedState stamps the cache entry's own timestamp.
    const { cachedAt } = JSON.parse(
      localStorage.getItem(`myk9show:rbac-cache:${mockUser.id}`) as string
    ) as { cachedAt: string };
    expect(screen.getByTestId('from-cache')).toHaveTextContent(cachedAt);
  });

  it('offline failure after a warm seed keeps the seeded roles and shows the offline notice state', async () => {
    seed(mockUser.id, 60 * 1000);
    mockRbacService.getUserPermissions.mockRejectedValue(new Error('TypeError: Failed to fetch'));

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('from-cache')).not.toHaveTextContent('live'), {
      timeout: 5000,
    });
    expect(screen.getByText('secretary surface')).toBeInTheDocument();
  });
});
