import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCommandMenuCommands } from '../useCommandMenuCommands';
import { resolveActions } from '@/features/actions/actionRegistry';

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
        isShowManagementStaff: true,
      }
    );

    // The premium item is ABSENT here, and deliberately: with no publish read
    // resolved its state is unknown, `useCurrentActions` greys it rather than
    // guess, and the palette drops greyed items because it has no disabled row
    // and nowhere to put the reason. The header menu is where the reason shows.
    const expectedInPalette = expected.filter(a => a.command !== 'publish-premium');
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

    expect(result.current.actionCommands.some(c => c.label === 'Add mail-in entry')).toBe(false);
    expect(result.current.actionCommands.some(c => c.label === 'Open Show Day')).toBe(true);
  });

  it('is empty off a show route', () => {
    const { result } = renderHook(() => useCommandMenuCommands(), {
      wrapper: wrapperAt('/dogs'),
    });

    expect(result.current.actionCommands).toEqual([]);
  });
});
