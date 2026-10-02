import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCurrentActions } from '@/features/actions/useCurrentActions';
import { usePageExportAction, usePageEditTargetStore } from '@/features/actions/pageEditTarget';
import { resolveActions } from '@/features/actions/actionRegistry';

// MYK9-929 review: a list that lost its table "Export CSV" button gets it back as a page action
// in the header Actions menu (and the command palette), in a last "export" group.

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => false, hasPermission: () => false }),
}));
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: 'resolved',
    canManage: false,
    canOperate: false,
    hasOperationalStaffRole: false,
    clubId: null,
  }),
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dogs']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  usePageEditTargetStore.setState({
    target: null,
    owner: null,
    addClassesTrialId: null,
    exports: [],
  });
});

describe('resolveActions with a page export', () => {
  it('adds one "Export CSV" item, last, behind a divider, owned by the page', () => {
    const actions = resolveActions(
      { kind: 'global' },
      {
        canManageShow: false,
        canOperateShow: false,
        canCreateShows: true,
        isShowManagementStaff: false,
        pageExports: [{ id: 'dogs' }],
      }
    );
    const last = actions[actions.length - 1]!;
    expect(last).toMatchObject({
      id: 'page-export-dogs',
      label: 'Export CSV',
      command: 'page-export',
      separatorBefore: true,
      pageOwned: true,
    });
  });

  it('shows the export even when nothing else belongs to the context', () => {
    const actions = resolveActions(
      { kind: 'global' },
      {
        canManageShow: false,
        canOperateShow: false,
        canCreateShows: false,
        isShowManagementStaff: false,
        pageExports: [{ id: 'clubs' }],
      }
    );
    expect(actions.map(action => action.label)).toEqual(['Export CSV']);
  });
});

describe('usePageExportAction', () => {
  it('registers while enabled, binds the latest run, and clears on unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ run }) => usePageExportAction({ id: 'dogs', enabled: true, run }),
      { initialProps: { run: first }, wrapper }
    );
    const actions = renderHook(() => useCurrentActions(), { wrapper });
    const exportAction = () => actions.result.current.actions.find(a => a.label === 'Export CSV');

    rerender({ run: second });
    act(() => exportAction()?.run?.());
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();

    unmount();
    expect(usePageEditTargetStore.getState().exports).toEqual([]);
  });

  it('registers nothing while disabled', () => {
    renderHook(() => usePageExportAction({ id: 'dogs', enabled: false, run: vi.fn() }), {
      wrapper,
    });
    expect(usePageEditTargetStore.getState().exports).toEqual([]);
  });
});
