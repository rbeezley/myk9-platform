import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentActions } from '@/features/actions/useCurrentActions';
import type { ShowManageScope, ShowManageScopeStatus } from '@/hooks/useShowManageScope';

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';

const scope = vi.hoisted(() => ({
  status: 'resolved' as ShowManageScopeStatus,
  canManage: true,
  canOperate: true,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: () => true,
    hasPermission: () => true,
  }),
}));

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: (): ShowManageScope => ({
    status: scope.status,
    canManage: scope.canManage,
    canOperate: scope.canOperate,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  // A QueryClient too: the hook composes the premium publish flow, which the
  // app always renders inside a provider.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/shows/${SHOW_ID}`]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  scope.status = 'resolved';
  scope.canManage = true;
  scope.canOperate = true;
});

/**
 * `useCurrentActions` grants nothing unless the ownership answer is FINAL.
 *
 * The un-resolved fixtures below deliberately report `canManage: true` while
 * `status` is not `resolved` — a combination the real `useShowManageScope`
 * never emits, because it fails its own booleans closed in those branches. That
 * redundancy is exactly why this guard had zero coverage: with a faithful
 * fixture, deleting `scope.status === 'resolved'` changes no observable
 * behaviour anywhere in the suite. Pinning it needs a fixture that can only
 * fail if the guard is gone, so the day the scope hook's branches change, the
 * menu does not start granting mid-resolution.
 */
describe('useCurrentActions — ownership must be resolved before anything is offered', () => {
  it.each(['resolving', 'unavailable'] as const)(
    'offers nothing while the scope reports %s, even if its booleans say yes',
    status => {
      scope.status = status;
      const { result } = renderHook(() => useCurrentActions(), { wrapper });
      expect(result.current.route).toEqual({ kind: 'show', showId: SHOW_ID });
      expect(result.current.actions).toEqual([]);
    }
  );

  it('offers the show list once the scope resolves (positive control)', () => {
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.actions.map(action => action.id)).toEqual([
      'show-add-mail-in-entry',
      'show-enter-own-dogs',
      'show-open-entry-management',
      'show-open-show-desk',
      'show-generate-publish-premium',
      'show-settings',
    ]);
  });

  it('offers nothing when a resolved scope denies management (faithful negative)', () => {
    scope.canManage = false;
    scope.canOperate = false;
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.actions).toEqual([]);
  });
});
