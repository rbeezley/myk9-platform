import { describe, it, expect } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { extractRoleAssignments, extractRoles, mapDatabaseToUser } from '../userMappers';

describe('extractRoles', () => {
  it('returns [] for missing user_roles + missing roles', () => {
    expect(extractRoles({})).toEqual([]);
  });

  it('extracts role names from joined user_roles shape', () => {
    const dbUser = {
      user_roles: [{ role: { name: 'judge' } }, { role: { name: 'exhibitor' } }],
    };
    expect(extractRoles(dbUser)).toEqual(['judge', 'exhibitor']);
  });

  it('falls back to flat roles array (RPC shape)', () => {
    expect(extractRoles({ roles: ['judge', 'exhibitor'] })).toEqual(['judge', 'exhibitor']);
  });

  it('dedupes duplicate role names from the joined shape', () => {
    // user_roles can hold multiple rows for the same (user, role) pair —
    // different assignments, granted_by, etc. The UI must not see duplicate
    // role badges (regression guard against React duplicate-key warnings).
    const dbUser = {
      user_roles: [
        { role: { name: 'secretary' } },
        { role: { name: 'exhibitor' } },
        { role: { name: 'secretary' } },
      ],
    };
    expect(extractRoles(dbUser)).toEqual(['secretary', 'exhibitor']);
  });

  it('dedupes duplicate role names from the flat RPC shape', () => {
    expect(extractRoles({ roles: ['secretary', 'exhibitor', 'secretary'] })).toEqual([
      'secretary',
      'exhibitor',
    ]);
  });

  it('drops role rows with null role and continues', () => {
    const dbUser = {
      user_roles: [{ role: { name: 'judge' } }, { role: null }],
    };
    expect(extractRoles(dbUser)).toEqual(['judge']);
  });
});

describe('extractRoleAssignments', () => {
  it('keeps scope and active state from joined user_roles rows', () => {
    const assignments = extractRoleAssignments({
      user_roles: [
        {
          role: { name: 'secretary' },
          club_id: 'club-1',
          show_id: null,
          is_active: true,
        },
        {
          role: { name: 'chairman' },
          club_id: 'club-1',
          show_id: 'show-1',
          is_active: false,
        },
      ],
    });

    expect(assignments).toEqual([
      { roleName: UserRole.SECRETARY, clubId: 'club-1', showId: null, isActive: true },
      { roleName: UserRole.CHAIRMAN, clubId: 'club-1', showId: 'show-1', isActive: false },
    ]);
  });

  it('maps role assignments onto User records for scoped pickers', () => {
    const user = mapDatabaseToUser({
      id: 'person-1',
      first_name: 'Jane',
      last_name: 'Secretary',
      user_roles: [
        {
          role: { name: 'secretary' },
          club_id: 'club-1',
          show_id: null,
          is_active: true,
        },
      ],
    });

    expect(user.roleAssignments).toEqual([
      { roleName: UserRole.SECRETARY, clubId: 'club-1', showId: null, isActive: true },
    ]);
  });
});
