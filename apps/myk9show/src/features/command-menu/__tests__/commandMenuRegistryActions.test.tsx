import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCommandMenuCommands } from '../useCommandMenuCommands';
import { resolveActions } from '@/features/actions/actionRegistry';
import { usePageEditAction, usePageEditTargetStore } from '@/features/actions/pageEditTarget';

const viewer = vi.hoisted(() => ({ canOperate: true }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'user-1' },
    hasRole: () => true,
    hasPermission: () => true,
    userWithRoles: null,
  }),
}));

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({
    status: 'resolved',
    canManage: true,
    canOperate: viewer.canOperate,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  }),
}));

beforeEach(() => {
  usePageEditTargetStore.setState({ target: null, owner: null, addClassesTrialId: null });
  viewer.canOperate = true;
});

// `useCurrentActions` composes the premium publish flow now, so it needs a
// QueryClient as well as a router. In the app it only ever renders inside both.
function wrapperAt(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('command palette show actions come from the action registry', () => {
  it('offers exactly the registry list for the current show, in registry order', () => {
    const { result } = renderHook(() => useCommandMenuCommands(), {
      wrapper: wrapperAt('/shows/show-1'),
    });

    const expected = resolveActions(
      { kind: 'show', showId: 'show-1', shellMounted: true },
      {
        canManageShow: true,
        canOperateShow: true,
        canCreateShows: true,
        canCreateDogs: true,
        canCreatePeople: true,
        canCreateClubs: true,
      }
    );

    // The premium item is ABSENT here, and deliberately: with no publish read
    // resolved its state is unknown, `useCurrentActions` greys it rather than
    // guess, and the palette drops greyed items because it has no disabled row
    // and nowhere to put the reason. The header menu is where the reason shows.
    // The Create group is absent too: the palette renders it as its own commands, with
    // their keyboard shortcuts (`createActions`, pinned below).
    const expectedInPalette = expected.filter(
      a => a.command !== 'publish-premium' && a.group !== 'create'
    );
    expect(result.current.actionCommands.map(c => c.label)).toEqual(
      expectedInPalette.map(a => a.label)
    );
    expect(result.current.actionCommands.map(c => c.href)).toEqual(
      expectedInPalette.map(a => a.href)
    );
    expect(result.current.actionCommands.some(c => /publish premium/i.test(c.label))).toBe(false);
    expect(result.current.actionCommands.every(c => c.showScope === 'show-1')).toBe(true);
  });

  it('omits an item the registry greys out, since the palette has no disabled row', () => {
    viewer.canOperate = false;
    const { result } = renderHook(() => useCommandMenuCommands(), {
      wrapper: wrapperAt('/shows/show-1'),
    });

    expect(result.current.actionCommands.some(c => c.label === 'Add entry for someone else')).toBe(
      false
    );
    // Positive control: an enabled item still comes through (Open Show Day went with the tab, MYK9-957).
    expect(result.current.actionCommands.some(c => c.label === 'Open Entry Forms')).toBe(true);
  });

  it('is empty off a show route', () => {
    const { result } = renderHook(() => useCommandMenuCommands(), {
      wrapper: wrapperAt('/dogs'),
    });

    expect(result.current.actionCommands).toEqual([]);
  });

  it("hands the palette the header's Create group, on and off a show route", () => {
    for (const route of ['/dogs', '/shows/show-1']) {
      const { result } = renderHook(() => useCommandMenuCommands(), {
        wrapper: wrapperAt(route),
      });
      expect(result.current.createActions.map(a => [a.label, a.href])).toEqual([
        ['Add Show', '/?wizard=true'],
        ['Add Dog', '/dogs?add=true'],
        ['Add Person', '/people?add=true'],
        ['Add Club', '/clubs?create=true'],
      ]);
    }
  });
});

describe('command palette offers the detail page own actions off a show route (MYK9-928)', () => {
  it('finds "Edit dog" on a dog page and runs it', () => {
    const run = vi.fn();
    const { result } = renderHook(
      () => {
        usePageEditAction({ kind: 'dog', enabled: true, run });
        return useCommandMenuCommands();
      },
      { wrapper: wrapperAt('/dogs/dog-1') }
    );

    const edit = result.current.actionCommands.find(c => c.label === 'Edit dog');
    expect(edit).toBeDefined();
    edit?.run?.();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("offers only the page's own items there, and no Create items (the palette renders those itself)", () => {
    const { result } = renderHook(
      () => {
        usePageEditAction({ kind: 'person', enabled: true, run: vi.fn() });
        return useCommandMenuCommands();
      },
      { wrapper: wrapperAt('/people/p1') }
    );
    expect(result.current.actionCommands.map(c => c.label)).toEqual(['Edit person']);
  });

  it('offers a trial page its Add classes too', () => {
    const { result } = renderHook(
      () => {
        usePageEditAction({
          kind: 'trial',
          enabled: true,
          run: vi.fn(),
          addClassesHref: '/wizard?trialId=t1',
        });
        return useCommandMenuCommands();
      },
      { wrapper: wrapperAt('/trials/t1') }
    );
    expect(result.current.actionCommands.map(c => c.label)).toEqual(['Edit trial', 'Add classes']);
  });
});
