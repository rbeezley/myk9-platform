/**
 * MYK9-429 at the wiring, not the hook: what AuthProvider actually hands the
 * query-cache boundary.
 *
 * `useClearQueryCacheOnAccountChange` is tested on its own, but its central
 * promise — that a TOKEN REFRESH clears nothing — is invisible at that level,
 * because a refresh only reaches the hook if the value AuthProvider derives
 * changes. Supabase returns a brand-new `User` object on every refresh, so the
 * whole question is whether the provider passes the identity or something that
 * moves with the session. That is only observable here.
 */
import type { ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { viewerScope } from '@/lib/viewerScopedQueryKey';

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

const CACHED_KEY = ['exhibitor', 'my-payments', viewerScope('user-1'), 'all'] as const;
const CACHED_ROWS = [{ reference: 'pi_first_viewer' }];

/** A fresh User object every call — exactly what a token refresh produces. */
function session(id: string | null, loading = false) {
  return {
    user: id === null ? null : { id, email: `${id}@example.test`, created_at: '2026-01-01' },
    loading,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    updateProfile: vi.fn(),
  };
}

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(<div data-testid="child" />, { wrapper });
  return { queryClient, rerender: () => view.rerender(<div data-testid="child" />) };
}

describe('AuthProvider query-cache boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockRbacService.getUserPermissions.mockResolvedValue({
      roles: [],
      permissions: [],
      effectivePermissions: [],
      effectivePermissionScopes: [],
    });
    mockRbacService.getUserRoles.mockResolvedValue([]);
    mockRbacService.getUserRolesByEmail.mockResolvedValue([]);
    mockRbacService.hasPermission.mockResolvedValue(false);
    mockRbacService.checkPermission.mockResolvedValue(false);
  });

  it('keeps cached data across a token refresh for the same account', async () => {
    mockUseAuth.mockReturnValue(session('user-1'));
    const { queryClient, rerender } = renderProvider();
    queryClient.setQueryData(CACHED_KEY, CACHED_ROWS);

    // Two more refreshes: a new User object each time, same identity. An
    // offline exhibitor must not lose their ledger to the session renewing.
    mockUseAuth.mockReturnValue(session('user-1'));
    rerender();
    mockUseAuth.mockReturnValue(session('user-1'));
    rerender();

    await waitFor(() => expect(queryClient.getQueryData(CACHED_KEY)).toEqual(CACHED_ROWS));
  });

  it('keeps cached data across a cold boot that restores the same session', async () => {
    // Auth starts unresolved with no user, then the stored session settles.
    mockUseAuth.mockReturnValue(session(null, true));
    const { queryClient, rerender } = renderProvider();
    queryClient.setQueryData(CACHED_KEY, CACHED_ROWS);

    mockUseAuth.mockReturnValue(session('user-1'));
    rerender();

    await waitFor(() => expect(queryClient.getQueryData(CACHED_KEY)).toEqual(CACHED_ROWS));
  });

  it('clears the cache when a different account signs in on the same tab', async () => {
    mockUseAuth.mockReturnValue(session('user-1'));
    const { queryClient, rerender } = renderProvider();
    queryClient.setQueryData(CACHED_KEY, CACHED_ROWS);

    mockUseAuth.mockReturnValue(session('user-2'));
    rerender();

    await waitFor(() => expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined());
  });

  it('clears the cache on sign-out', async () => {
    mockUseAuth.mockReturnValue(session('user-1'));
    const { queryClient, rerender } = renderProvider();
    queryClient.setQueryData(CACHED_KEY, CACHED_ROWS);

    mockUseAuth.mockReturnValue(session(null));
    rerender();

    await waitFor(() => expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined());
  });
});
