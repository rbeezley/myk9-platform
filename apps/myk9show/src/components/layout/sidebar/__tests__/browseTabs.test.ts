import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { browseHref, browseTabForPath, browseTabsForRoles } from '../browseTabs';

const ids = (roles: UserRole[]) => browseTabsForRoles(roles).map(tab => tab.id);

describe('browseTabsForRoles', () => {
  it.each([
    ['secretary', [UserRole.SECRETARY], ['shows', 'dogs', 'people', 'clubs']],
    [
      'site admin with a club role',
      [UserRole.SITE_ADMIN, UserRole.CLUB_ADMIN],
      ['shows', 'dogs', 'people', 'clubs'],
    ],
    ['judge', [UserRole.JUDGE], ['shows', 'dogs']],
    ['club admin + exhibitor', [UserRole.CLUB_ADMIN, UserRole.EXHIBITOR], ['shows', 'dogs']],
    ['steward', [UserRole.STEWARD], ['shows', 'dogs']],
    ['exhibitor only (phase 4)', [UserRole.EXHIBITOR], []],
    ['site admin only', [UserRole.SITE_ADMIN], []],
  ] as const)('%s browses %j', (_label, roles, expected) => {
    expect(ids([...roles])).toEqual(expected);
  });

  it('labels the dogs list My Dogs where the roster holds only the viewer’s own dogs', () => {
    expect(browseTabsForRoles([UserRole.JUDGE])[1].title).toBe('My Dogs');
    expect(browseTabsForRoles([UserRole.SECRETARY])[1].title).toBe('Dogs');
  });
});

describe('browseTabForPath', () => {
  it.each([
    ['/shows', 'shows'],
    ['/shows/s-1/entries', 'shows'],
    ['/dogs/d-1', 'dogs'],
    ['/people', 'people'],
    ['/clubs/c-1', 'clubs'],
    ['/showsx', null],
    ['/secretary/dashboard', null],
    ['/', null],
  ])('%s is %s', (path, expected) => {
    expect(browseTabForPath(path)).toBe(expected);
  });
});

describe('browseHref', () => {
  const secretary = browseTabsForRoles([UserRole.SECRETARY]);
  const judge = browseTabsForRoles([UserRole.JUDGE]);

  it('prefers the list open now, then the one used last, then Shows', () => {
    expect(browseHref(secretary, 'clubs', 'people')).toBe('/clubs');
    expect(browseHref(secretary, null, 'people')).toBe('/people');
    expect(browseHref(secretary, null, null)).toBe('/shows');
  });

  it('opens Shows when the list used last is one this role cannot see', () => {
    expect(browseHref(judge, null, 'people')).toBe('/shows');
  });
});
