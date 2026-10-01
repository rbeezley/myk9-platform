/**
 * The Managing tab lists only shows whose club the viewer holds a club-scoped
 * management role for. A club-scoped secretary is NOT a global secretary:
 * dropping the scopes made getUserManagedShows read every show as managed, so
 * a club the secretary has no role at appeared under Managing (with no
 * selection checkbox, because the bulk bar does check scopes).
 */
import { describe, expect, it } from 'vitest';
import { ScopeType, UserRole } from '@/types/auth-types';
import type { RoleScope, UserWithRoles } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import { filterShowsForTab, getUserShowContext } from '@/utils/unified-shows-config';

const HEARTLAND = 'dededede-0000-0000-0000-000000000001';
const PRAIRIE = 'dededede-0000-0000-0000-000000000002';
const DARBOSHEA = 'f8f9c772-3b83-416b-8ff3-688124fc5602';

function scope(roleId: string, clubId: string): RoleScope {
  return {
    userId: 'person-1',
    roleId,
    scopeType: ScopeType.CLUB,
    scopeId: clubId,
    createdAt: new Date(),
  };
}

// The shape of secretary@myk9t.com on 2026-10-01: secretary at two clubs,
// steward at one, plus unscoped exhibitor and steward roles.
const secretary = {
  id: 'auth-1',
  databaseUserId: 'person-1',
  email: 'secretary@example.com',
  roles: [UserRole.SECRETARY, UserRole.STEWARD, UserRole.EXHIBITOR],
  permissions: [],
  scopes: [
    scope(UserRole.SECRETARY, HEARTLAND),
    scope(UserRole.SECRETARY, DARBOSHEA),
    scope(UserRole.STEWARD, HEARTLAND),
  ],
} as unknown as UserWithRoles;

function show(id: string, clubId: string): Show {
  return { id, name: id, clubId } as unknown as Show;
}

const shows = [
  show('heartland-classic', HEARTLAND),
  show('darboshea-oct-31', DARBOSHEA),
  show('prairie-spring', PRAIRIE),
];

describe('Managing tab scope', () => {
  it('lists only shows of clubs the secretary holds a club-scoped role at', () => {
    const context = getUserShowContext(secretary, shows, []);

    const managing = filterShowsForTab('managing', shows, [], context).map(s => s.id);

    expect(managing).toEqual(['heartland-classic', 'darboshea-oct-31']);
  });

  it('still lists every show for a secretary with no club scopes at all (global role)', () => {
    const global = { ...secretary, scopes: [] } as unknown as UserWithRoles;
    const context = getUserShowContext(global, shows, []);

    expect(filterShowsForTab('managing', shows, [], context)).toHaveLength(3);
  });
});
