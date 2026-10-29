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

  it('folds a group with a rail link into one link entry carrying all its items', () => {
    const link = { id: 'browse' as const, title: 'Browse', icon: Calendar };
    const groups: NavGroup[] = [
      { title: 'Show Day', items: [{ title: 'Ringside', href: '/at-show', icon: Calendar }] },
      {
        title: 'Browse',
        railLink: link,
        items: [
          { title: 'Shows', href: '/shows', icon: Calendar },
          { title: 'Dogs', href: '/dogs', icon: Calendar },
        ],
      },
    ];

    const entries = buildRailEntries(groups);

    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ kind: 'link', link, startsGroup: true });
    if (entries[1].kind !== 'link') return;
    expect(entries[1].items.map(i => i.href)).toEqual(['/shows', '/dogs']);
  });

  // Recorded in docs/plan-sidebar-browse-pane.md (phases 1 and 3): the counts the
  // rail menus were sized against. A change here is a design change. Phase 3 folds
  // Shows, Dogs, People and Clubs into one Browse item.
  it.each([
    ['exhibitor only', [UserRole.EXHIBITOR], 4],
    ['judge only', [UserRole.JUDGE], 2],
    ['secretary + exhibitor', [UserRole.SECRETARY, UserRole.EXHIBITOR], 4],
    ['club admin + exhibitor', [UserRole.CLUB_ADMIN, UserRole.EXHIBITOR], 4],
    [
      'secretary + club admin + exhibitor',
      [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.EXHIBITOR],
      5,
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
      6,
    ],
  ])('a %s rail (%j) has %i items', (_label, roles, expected) => {
    expect(railCount(roles)).toBe(expected);
  });
});

// MYK9-1490: Home is the hub and the current show its workspace, with Ringside (that show's live
// view) beside it; then Browse, My Entries, and the role-specific groups. A change here is a
// design change.
describe('rail order', () => {
  const CURRENT = { currentShow: { id: 's1', name: 'Fall Classic' } };

  function railLabels(roles: UserRole[], currentShowNav?: typeof CURRENT): string[] {
    const config = buildUnifiedSidebarConfig(roles, CLUB, 'Jamie', currentShowNav);
    return buildRailEntries(config.groups).map(entry =>
      entry.kind === 'item'
        ? railLabel(entry.item)
        : entry.kind === 'menu'
          ? entry.menu.title
          : entry.link.title
    );
  }

  it('reads Home, current show, Ringside, Browse, My Entries, then My Club for a secretary', () => {
    expect(
      railLabels([UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.EXHIBITOR], CURRENT)
    ).toEqual(['Home', 'Fall Classic', 'Ringside', 'Browse', 'My Entries', 'My Club']);
  });

  it('puts Admin after My Entries and before My Club when the viewer holds every role', () => {
    expect(
      railLabels(
        [
          UserRole.SITE_ADMIN,
          UserRole.SECRETARY,
          UserRole.CLUB_ADMIN,
          UserRole.JUDGE,
          UserRole.EXHIBITOR,
        ],
        CURRENT
      )
    ).toEqual(['Home', 'Fall Classic', 'Ringside', 'Browse', 'My Entries', 'Admin', 'My Club']);
  });

  it('starts a judge-only rail with Ringside', () => {
    expect(railLabels([UserRole.JUDGE])[0]).toBe('Ringside');
  });
});

describe('rail labels', () => {
  it('labels the secretary dashboard Home in the rail, with no shortened title', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const item = config.groups.flatMap(g => g.items).find(i => i.href === '/secretary/dashboard');

    expect(item && railLabel(item)).toBe('Home');
    expect(item && railAccessibleName(item)).toBe('Home');
  });

  it('uses the title unchanged when no rail title is set', () => {
    const item = { title: 'Show Management', href: '/secretary/dashboard', icon: Calendar };

    expect(railLabel(item)).toBe('Show Management');
    expect(railAccessibleName(item)).toBe('Show Management');
  });
});
