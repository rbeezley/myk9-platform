import { describe, it, expect } from 'vitest';
import { extractRoles } from '../userMappers';

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
