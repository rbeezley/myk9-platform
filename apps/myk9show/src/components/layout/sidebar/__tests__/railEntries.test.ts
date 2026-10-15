import { describe, expect, it } from 'vitest';
import { Calendar } from 'lucide-react';
import { UserRole } from '@/types/auth-types';
import { buildRailEntries, railAccessibleName, railLabel } from '../railEntries';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import type { NavGroup } from '../types';

const CLUB = { clubId: 'club-1', clubName: 'Heartland Club' };

function railCount(roles: UserRole[]): number {
  const config = buildUnifiedSidebarConfig(roles, CLUB, 'Jamie');
  return buildRailEntries(config.groups).length;
}

describe('buildRailEntries', () => {
  it('keeps one rail item per nav item for a group without a rail menu', () => {
    const groups: NavGroup[] = [
      {
        title: 'Browse',
        items: [
          { title: 'Shows', href: '/shows', icon: Calendar },
          { title: 'Dogs', href: '/dogs', icon: Calendar },
        ],
      },
    ];

    const entries = buildRailEntries(groups);

    expect(entries.map(e => e.kind)).toEqual(['item', 'item']);
    expect(entries.map(e => e.startsGroup)).toEqual([false, false]);
  });

  it('folds groups sharing a rail menu id into one item at the first position', () => {
    const menu = { id: 'admin', title: 'Admin', icon: Calendar };
    const groups: NavGroup[] = [
      { title: 'Admin', railMenu: menu, items: [{ title: 'Users', href: '/u', icon: Calendar }] },
      { title: 'Browse', items: [{ title: 'Shows', href: '/shows', icon: Calendar }] },
      {
        title: 'Resources',
        railMenu: menu,
        items: [{ title: 'Help', href: '/h', icon: Calendar }],
      },
    ];

    const entries = buildRailEntries(groups);

    expect(entries).toHaveLength(2);
    const [first, second] = entries;
    expect(first.kind).toBe('menu');
    if (first.kind !== 'menu') return;
    expect(first.sections.map(s => s.title)).toEqual(['Admin', 'Resources']);
    expect(first.sections.flatMap(s => s.items.map(i => i.title))).toEqual(['Users', 'Help']);
    expect(second).toMatchObject({ kind: 'item', startsGroup: true });
  });

  it('skips empty groups without leaving a divider', () => {
    const groups: NavGroup[] = [
      { title: 'Empty', items: [] },
      { title: 'Browse', items: [{ title: 'Shows', href: '/shows', icon: Calendar }] },
    ];

    expect(buildRailEntries(groups)).toEqual([
      expect.objectContaining({ kind: 'item', startsGroup: false }),
    ]);
  });

  // Recorded in docs/plan-sidebar-browse-pane.md (phase 1): the counts the
  // rail menus were sized against. A change here is a design change.
  it.each([
    ['exhibitor only', [UserRole.EXHIBITOR], 5],
    ['judge only', [UserRole.JUDGE], 3],
    ['secretary + exhibitor', [UserRole.SECRETARY, UserRole.EXHIBITOR], 7],
    ['club admin + exhibitor', [UserRole.CLUB_ADMIN, UserRole.EXHIBITOR], 5],
    [
      'secretary + club admin + exhibitor',
      [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.EXHIBITOR],
      8,
    ],
    ['site admin only', [UserRole.SITE_ADMIN], 1],
    [
      'site admin with every role',
      [
        UserRole.SITE_ADMIN,
        UserRole.SECRETARY,
        UserRole.CLUB_ADMIN,
        UserRole.JUDGE,
        UserRole.EXHIBITOR,
      ],
      9,
    ],
  ])('a %s rail (%j) has %i items', (_label, roles, expected) => {
    expect(railCount(roles)).toBe(expected);
  });
});

describe('rail labels', () => {
  it('shortens Show Management to "Manage" and keeps the full title as its accessible name', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const item = config.groups.flatMap(g => g.items).find(i => i.href === '/secretary/dashboard');

    expect(item && railLabel(item)).toBe('Manage');
    expect(item && railAccessibleName(item)).toBe('Manage: Show Management');
  });

  it('uses the title unchanged when no rail title is set', () => {
    const item = { title: 'Show Management', href: '/secretary/dashboard', icon: Calendar };

    expect(railLabel(item)).toBe('Show Management');
    expect(railAccessibleName(item)).toBe('Show Management');
  });
});
