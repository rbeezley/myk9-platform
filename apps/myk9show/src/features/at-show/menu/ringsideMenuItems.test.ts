import { describe, it, expect } from 'vitest';
import { BarChart3 } from 'lucide-react';
import {
  buildRingsideMenuItems,
  itemNeedsConnection,
  type RingsideMenuContext,
  type RingsideMenuExtension,
} from './ringsideMenuItems';

const base: RingsideMenuContext = {
  showId: 'show-1',
  canManageShow: false,
  isOnline: true,
  hasAccount: true,
};

const ids = (context: RingsideMenuContext, extensions?: readonly RingsideMenuExtension[]) =>
  buildRingsideMenuItems(context, extensions).map(item => item.id);
const find = (context: RingsideMenuContext, id: string) =>
  buildRingsideMenuItems(context).find(item => item.id === id);

describe('buildRingsideMenuItems', () => {
  it('lists the core show-day set in order, ending with Sign out', () => {
    expect(ids(base)).toEqual([
      'announcements',
      'settings',
      'results',
      'show-info',
      'askq',
      'sign-out',
    ]);
  });

  it('sends an exhibitor or judge to the show page tabs, never a management page', () => {
    expect(find(base, 'results')?.href).toBe('/shows/show-1?tab=results');
  });

  it('sends a show manager to the results page they already use', () => {
    const manager = { ...base, canManageShow: true };
    expect(find(manager, 'results')?.href).toBe('/shows/show-1/results');
  });

  it('has no separate Stats item: Show Stats is a view inside Results', () => {
    expect(ids(base)).not.toContain('stats');
    expect(ids({ ...base, canManageShow: true })).not.toContain('stats');
  });

  it('gives Results to every viewer who has a show, manager or not', () => {
    expect(ids(base)).toContain('results');
    expect(ids({ ...base, canManageShow: true })).toContain('results');
  });

  it('opens Settings on Appearance, where theme, voice and haptics live', () => {
    expect(find(base, 'settings')?.href).toBe('/account?section=appearance');
  });

  it('withholds Settings from a passcode session, which has no account to open', () => {
    expect(ids({ ...base, hasAccount: false })).not.toContain('settings');
  });

  it('drops Results when the show is unknown rather than linking nowhere', () => {
    const unknown = ids({ ...base, showId: undefined });
    expect(unknown).not.toContain('results');
  });

  it('marks Settings, Results and AskQ online-only, and Announcements and Sign out usable offline', () => {
    const online = (id: string) => find(base, id)?.requiresConnection;
    expect([online('settings'), online('results'), online('askq')]).toEqual([true, true, true]);
    expect([online('announcements'), online('sign-out')]).toEqual([false, false]);
  });

  it('puts extension items after the core set and before Sign out', () => {
    const extension: RingsideMenuExtension = {
      id: 'leaderboard',
      build: () => ({
        id: 'leaderboard',
        label: 'Leaderboard',
        icon: BarChart3,
        href: '/x',
        requiresConnection: true,
      }),
    };
    const withExtension = ids(base, [extension]);
    expect(withExtension.slice(-2)).toEqual(['leaderboard', 'sign-out']);
  });

  it('lets an extension hide itself for a viewer', () => {
    const staffOnly: RingsideMenuExtension = {
      id: 'staff',
      build: context =>
        context.canManageShow
          ? { id: 'staff', label: 'Staff', icon: BarChart3, href: '/x', requiresConnection: false }
          : null,
    };
    expect(ids(base, [staffOnly])).not.toContain('staff');
    expect(ids({ ...base, canManageShow: true }, [staffOnly])).toContain('staff');
  });
});

describe('itemNeedsConnection', () => {
  it('is true only for an online-only item while offline', () => {
    const results = find(base, 'results')!;
    const settings = find(base, 'settings')!;
    expect(itemNeedsConnection(results, false)).toBe(true);
    expect(itemNeedsConnection(results, true)).toBe(false);
    expect(itemNeedsConnection(settings, false)).toBe(true);
    expect(itemNeedsConnection(find(base, 'announcements')!, false)).toBe(false);
  });
});
