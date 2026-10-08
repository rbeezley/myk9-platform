import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentActions } from '@/features/actions/useCurrentActions';
import {
  usePageEditAction,
  usePageEditTargetStore,
  useSetupAddClassesTrial,
} from '@/features/actions/pageEditTarget';
import type { AppAction } from '@/features/actions/actionRegistry';
import { useShowStore } from '@/store/showStore';
import type { ShowManageScope, ShowManageScopeStatus } from '@/hooks/useShowManageScope';

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';

const scope = vi.hoisted(() => ({
  status: 'resolved' as ShowManageScopeStatus,
  canManage: true,
  canOperate: true,
}));

const publishInfoRead = vi.hoisted(() => vi.fn());
const rbac = vi.hoisted(() => ({ loading: false }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: () => true,
    hasPermission: () => true,
    rbacLoading: rbac.loading,
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

/** The mocked viewer holds every create, so the Create group is on every route; these tests
 * are about the sections above it, which are its own describe's business. */
function aboveCreate(actions: AppAction[]): AppAction[] {
  return actions.filter(action => action.group !== 'create');
}

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
  usePageEditTargetStore.setState({ target: null, owner: null, addClassesTrialId: null });
  scope.status = 'resolved';
  scope.canManage = true;
  scope.canOperate = true;
  rbac.loading = false;
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
      expect(aboveCreate(result.current.actions)).toEqual([]);
    }
  );

  it('offers the show list once the scope resolves (positive control)', () => {
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(aboveCreate(result.current.actions).map(action => action.id)).toEqual([
      'show-settings',
      'show-add-mail-in-entry',
      'show-enter-own-dogs',
      'show-add-new-trial',
      'show-add-classes',
      'show-open-entry-management',
      'show-generate-publish-premium',
      'show-close-out',
    ]);
  });

  it('offers nothing when a resolved scope denies management (faithful negative)', () => {
    scope.canManage = false;
    scope.canOperate = false;
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(aboveCreate(result.current.actions)).toEqual([]);
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
    expect(aboveCreate(result.current.actions)).toEqual([]);
  });

  it('withdraws the item when the page unmounts', () => {
    scope.canManage = false;
    scope.canOperate = false;
    const { result, unmount } = renderHook(
      () => useBoth({ kind: 'dog', enabled: true, run: vi.fn() }),
      { wrapper }
    );
    expect(aboveCreate(result.current.actions).map(action => action.id)).toEqual(['dog-edit']);
    unmount();
    expect(usePageEditTargetStore.getState().target).toBeNull();
  });
});

describe('useCurrentActions — Setup hands its picked trial to Add classes (MYK9-928)', () => {
  it('puts the registered trial into the show-wide Add classes href', () => {
    const { result } = renderHook(
      () => {
        useSetupAddClassesTrial('t3');
        return useCurrentActions();
      },
      { wrapper }
    );
    expect(result.current.actions.find(a => a.id === 'show-add-classes')?.href).toBe(
      `/secretary/create-show/wizard?showId=${SHOW_ID}&mode=add-classes&trialId=t3`
    );
  });
});

describe('useCurrentActions — labelled sections (CRUD standard decision 6)', () => {
  beforeEach(() => {
    useShowStore.setState({ shows: [] });
  });

  it('heads the show section with the show name from the replicated store', () => {
    useShowStore.setState({
      shows: [{ id: SHOW_ID, name: 'Fall Scent Weekend' }] as never,
    });
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.groups.map(group => [group.id, group.heading])).toEqual([
      ['show', 'Fall Scent Weekend'],
      ['create', 'Create'],
    ]);
  });

  it('withholds Close out show once the stored show is completed', () => {
    useShowStore.setState({
      shows: [{ id: SHOW_ID, name: 'Fall Scent Weekend', status: 'completed' }] as never,
    });
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    const ids = result.current.actions.map(action => action.id);
    expect(ids).not.toContain('show-close-out');
    expect(ids).toContain('show-settings');
  });

  it('falls back to "This show" before the store has the show', () => {
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.groups[0]?.heading).toBe('This show');
  });

  it('heads the page section with the title the page registered', () => {
    const { result } = renderHook(
      () => {
        usePageEditAction({
          kind: 'trial',
          enabled: true,
          run: vi.fn(),
          title: 'Saturday trial 1',
        });
        return useCurrentActions();
      },
      { wrapper }
    );
    expect(result.current.groups.map(group => group.heading)).toEqual([
      'Saturday trial 1',
      'This show',
      'Create',
    ]);
  });

  it('keeps every action in exactly one section, in the flat list order', () => {
    const { result } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.groups.flatMap(group => group.actions)).toEqual(result.current.actions);
  });
});

describe('useCurrentActions — Create waits for permissions', () => {
  it('offers no Create item while RBAC is loading, then all four once it settles', () => {
    rbac.loading = true;
    const { result, rerender } = renderHook(() => useCurrentActions(), { wrapper });
    expect(result.current.actions.filter(action => action.group === 'create')).toEqual([]);

    rbac.loading = false;
    rerender();
    expect(
      result.current.actions.filter(action => action.group === 'create').map(action => action.id)
    ).toEqual(['create-show', 'create-dog', 'create-person', 'create-club']);
  });
});
