import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentActions } from '@/features/actions/useCurrentActions';
import { usePageEditAction, usePageEditTargetStore } from '@/features/actions/pageEditTarget';
import type { ShowManageScope, ShowManageScopeStatus } from '@/hooks/useShowManageScope';

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';

const scope = vi.hoisted(() => ({
  status: 'resolved' as ShowManageScopeStatus,
  canManage: true,
  canOperate: true,
}));

const publishInfoRead = vi.hoisted(() => vi.fn());

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

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: publishInfoRead })),
      })),
    })),
  },
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
  usePageEditTargetStore.setState({ target: null, owner: null });
  scope.status = 'resolved';
  scope.canManage = true;
  scope.canOperate = true;
  publishInfoRead.mockReset();
  publishInfoRead.mockResolvedValue({ data: null, error: null });
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
      expect(result.current.route).toMatchObject({ kind: 'show', showId: SHOW_ID });
      expect(result.current.actions).toEqual([]);
    }
  );

  it('offers the show list once the scope resolves (positive control)', () => {
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.actions.map(action => action.id)).toEqual([
      'show-settings',
      'show-add-mail-in-entry',
      'show-enter-own-dogs',
      'show-add-new-trial',
      'show-add-classes',
      'show-open-entry-management',
      'show-open-show-desk',
      'show-generate-publish-premium',
    ]);
  });

  it('offers nothing when a resolved scope denies management (faithful negative)', () => {
    scope.canManage = false;
    scope.canOperate = false;
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.actions).toEqual([]);
  });

  it.each([
    ['exhibitor', 'resolved', false],
    ['manager scope unresolved', 'resolving', true],
  ] as const)('does not request publish info for %s', async (_label, status, canManage) => {
    scope.status = status;
    scope.canManage = canManage;

    renderHook(() => useCurrentActions(), { wrapper });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(publishInfoRead).not.toHaveBeenCalled();
  });

  it('requests publish info once after management scope resolves', async () => {
    renderHook(() => useCurrentActions(), { wrapper });

    await waitFor(() => expect(publishInfoRead).toHaveBeenCalledTimes(1));
  });
});

describe('useCurrentActions — a detail page registers its Edit (MYK9-928)', () => {
  function useBoth(options: Parameters<typeof usePageEditAction>[0]) {
    usePageEditAction(options);
    return useCurrentActions();
  }

  it('binds the page Edit to the callback the page registered, as the first item', () => {
    const run = vi.fn();
    const { result } = renderHook(() => useBoth({ kind: 'trial', enabled: true, run }), {
      wrapper,
    });
    const first = result.current.actions[0];
    expect(first).toMatchObject({ id: 'trial-edit', label: 'Edit trial' });
    act(() => first?.run?.());
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('calls the LATEST run, not the one from the first render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ run }) => useBoth({ kind: 'class', enabled: true, run }),
      { wrapper, initialProps: { run: first } }
    );
    rerender({ run: second });
    act(() => result.current.actions[0]?.run?.());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('offers nothing when the page gate is closed', () => {
    scope.canManage = false;
    scope.canOperate = false;
    const { result } = renderHook(() => useBoth({ kind: 'trial', enabled: false, run: vi.fn() }), {
      wrapper,
    });
    expect(result.current.actions).toEqual([]);
  });

  it('withdraws the item when the page unmounts', () => {
    scope.canManage = false;
    scope.canOperate = false;
    const { result, unmount } = renderHook(
      () => useBoth({ kind: 'dog', enabled: true, run: vi.fn() }),
      { wrapper }
    );
    expect(result.current.actions.map(action => action.id)).toEqual(['dog-edit']);
    unmount();
    expect(usePageEditTargetStore.getState().target).toBeNull();
  });
});
