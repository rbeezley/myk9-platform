import { describe, it, expect, vi } from 'vitest';
import { getTabQuickActions } from './show-actions';
import { PERMISSIONS } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import type { Show } from '@/types/show-types';

/**
 * These actions render as the buttons in the Find Shows page header.
 *
 * They used to navigate with `window.location.href`, a full document load
 * inside an offline-first PWA: React state is torn down, the bundle refetched,
 * and offline it fails outright instead of routing to a cached view.
 *
 * A global escape hatch existed for exactly this — `useOptimizedNavigation` set
 * `window.__NAVIGATE_FUNCTION__` "for compatibility with show-actions" — but
 * that hook had NO consumers, so the global was never set and never read.
 * Wiring the buttons to it would have made them do nothing at all. The
 * navigator is therefore an explicit parameter, so a missing one is a type
 * error rather than a silent no-op, and these tests assert it is the thing
 * actually used.
 */

function userWith(permissions: string[]): UserWithRoles {
  return { id: 'u1', permissions, roles: [] } as unknown as UserWithRoles;
}

const SHOW = {} as Show;

describe('getTabQuickActions navigation', () => {
  it('routes "New Show" through the injected navigator', () => {
    const navigate = vi.fn();
    const actions = getTabQuickActions('all', userWith([PERMISSIONS.SHOW_CREATE]), navigate);

    const createShow = actions.find(a => a.id === 'create_show');
    expect(createShow, 'create_show action missing').toBeDefined();

    createShow!.onClick(SHOW);
    expect(navigate).toHaveBeenCalledWith('/secretary/create-show/wizard');
  });

  it('never assigns window.location.href', () => {
    // The regression guard. A full reload is invisible in a unit test unless
    // the assignment itself is watched, so watch it: any action that sets it
    // fails here rather than shipping a page reload.
    const navigate = vi.fn();
    const assigned: string[] = [];
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new Proxy(
        {},
        {
          get: () => '',
          set: (_t, prop, value) => {
            if (prop === 'href') assigned.push(String(value));
            return true;
          },
        }
      ),
    });

    try {
      for (const tab of ['all', 'managing', 'assignments']) {
        for (const action of getTabQuickActions(
          tab,
          userWith([
            PERMISSIONS.SHOW_CREATE,
            PERMISSIONS.SHOW_MANAGE,
            PERMISSIONS.REGISTRATION_BULK_OPERATIONS,
          ]),
          navigate
        )) {
          action.onClick(SHOW);
        }
      }
    } finally {
      if (original) Object.defineProperty(window, 'location', original);
    }

    expect(assigned, `actions performed a full page load: ${assigned.join(', ')}`).toEqual([]);
  });

  it('returns nothing without a user, rather than unguarded actions', () => {
    expect(getTabQuickActions('all', null, vi.fn())).toEqual([]);
  });
});
