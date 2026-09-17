import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

function wrapperAt(route: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  };
}

describe('command palette show actions come from the action registry', () => {
  it('offers exactly the registry list for the current show, in registry order', () => {
    const { result } = renderHook(() => useCommandMenuCommands(), {
      wrapper: wrapperAt('/shows/show-1'),
    });

    const expected = resolveActions(
      { kind: 'show', showId: 'show-1' },
      {
        canManageShow: true,
        canOperateShow: true,
        canCreateShows: true,
        isShowManagementStaff: true,
      }
    );

    expect(result.current.actionCommands.map(c => c.label)).toEqual(expected.map(a => a.label));
    expect(result.current.actionCommands.map(c => c.href)).toEqual(expected.map(a => a.href));
    expect(result.current.actionCommands.every(c => c.showScope === 'show-1')).toBe(true);
  });

  it('omits an item the registry greys out, since the palette has no disabled row', () => {
    viewer.canOperate = false;
    const { result } = renderHook(() => useCommandMenuCommands(), {
      wrapper: wrapperAt('/shows/show-1'),
    });

    expect(result.current.actionCommands.some(c => c.label === 'Add mail-in entry')).toBe(false);
    expect(result.current.actionCommands.some(c => c.label === 'Open Show Desk')).toBe(true);
  });

  it('is empty off a show route', () => {
    const { result } = renderHook(() => useCommandMenuCommands(), {
      wrapper: wrapperAt('/dogs'),
    });

    expect(result.current.actionCommands).toEqual([]);
  });
});
