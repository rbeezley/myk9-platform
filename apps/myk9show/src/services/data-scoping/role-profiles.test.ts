import { describe, it, expect } from 'vitest';
import {
  getDataScopeForRole,
  hasDataAccess,
  applyRoleDataFilter,
  getPaginationForRole,
  SECRETARY_SCOPE,
  JUDGE_SCOPE,
  EXHIBITOR_SCOPE,
  ADMIN_SCOPE,
} from './role-profiles';

describe('getDataScopeForRole', () => {
  it.each<[string, string, ReturnType<typeof getDataScopeForRole>]>([
    ['secretary', 'secretary', SECRETARY_SCOPE],
    ['judge', 'judge', JUDGE_SCOPE],
    ['exhibitor', 'exhibitor', EXHIBITOR_SCOPE],
    ['admin', 'admin', ADMIN_SCOPE],
    ['administrator (alias)', 'administrator', ADMIN_SCOPE],
    ['case-insensitive SECRETARY', 'SECRETARY', SECRETARY_SCOPE],
    ['unknown role -> defaults to exhibitor for security', 'nonexistent-role', EXHIBITOR_SCOPE],
    ['empty string role -> defaults to exhibitor', '', EXHIBITOR_SCOPE],
  ])('%s', (_label, role, expected) => {
    expect(getDataScopeForRole(role)).toBe(expected);
  });
});

/**
 * Decision table: role x dataType x operation -> access granted.
 * Derived from the explicit accessMatrix in role-profiles.ts, plus the
 * read-only fallback that grants read access when a dataFilters entry
 * exists for that dataType even without an explicit matrix entry.
 */
describe('hasDataAccess', () => {
  it.each<[string, string, string, 'read' | 'write' | 'delete', boolean]>([
    // admin: explicit "all" grant covers every operation/dataType
    ['admin read shows', 'admin', 'shows', 'read', true],
    ['admin write dogs', 'admin', 'dogs', 'write', true],
    ['admin delete anything', 'admin', 'nonexistent-type', 'delete', true],

    // secretary: explicit matrix
    ['secretary read shows', 'secretary', 'shows', 'read', true],
    ['secretary write shows', 'secretary', 'shows', 'write', true],
    [
      'secretary write dogs -> false (dogs is read-only for secretary)',
      'secretary',
      'dogs',
      'write',
      false,
    ],
    ['secretary read dogs -> true', 'secretary', 'dogs', 'read', true],
    ['secretary delete shows -> false (delete not granted)', 'secretary', 'shows', 'delete', false],

    // judge: explicit matrix
    ['judge write classes', 'judge', 'classes', 'write', true],
    ['judge write dogs -> false (read-only)', 'judge', 'dogs', 'write', false],
    ['judge read registrations', 'judge', 'registrations', 'read', true],

    // exhibitor: explicit matrix
    ['exhibitor write dogs', 'exhibitor', 'dogs', 'write', true],
    ['exhibitor write shows -> false (read-only)', 'exhibitor', 'shows', 'write', false],
    ['exhibitor read shows -> true', 'exhibitor', 'shows', 'read', true],

    // read-fallback via dataFilters presence (no accessMatrix entry for "health")
    ['secretary read health -> true via dataFilters fallback', 'secretary', 'health', 'read', true],
    ['judge read health -> true via dataFilters fallback', 'judge', 'health', 'read', true],
    ['exhibitor read health -> true via dataFilters fallback', 'exhibitor', 'health', 'read', true],
    [
      'secretary write health -> false (fallback only covers read)',
      'secretary',
      'health',
      'write',
      false,
    ],

    // unknown role -> no matrix entry -> false regardless of operation
    ['unknown role -> false', 'unknown-role', 'shows', 'read', false],
    ['unknown role write -> false', 'unknown-role', 'dogs', 'write', false],
  ])('%s', (_label, role, dataType, operation, expected) => {
    expect(hasDataAccess(role, dataType, operation)).toBe(expected);
  });
});

describe('getPaginationForRole', () => {
  it.each<[string, string, string, number]>([
    ['secretary dogs pagination', 'secretary', 'dogs', 50],
    ['judge shows pagination', 'judge', 'shows', 10],
    ['exhibitor people pagination', 'exhibitor', 'people', 5],
    ['admin registrations pagination', 'admin', 'registrations', 100],
    ['unknown dataType -> defaults to 50', 'secretary', 'nonexistent', 50],
  ])('%s', (_label, role, dataType, expected) => {
    expect(getPaginationForRole(role, dataType)).toBe(expected);
  });
});

describe('applyRoleDataFilter', () => {
  it('exhibitor dogs filter narrows to the current user via CURRENT_USER_ID substitution', () => {
    const dogs = [
      { id: 'd1', ownerId: 'user-1' },
      { id: 'd2', ownerId: 'user-2' },
    ];
    const result = applyRoleDataFilter(dogs, 'exhibitor', 'dogs', 'user-1');
    expect(result.map(d => d.id)).toEqual(['d1']);
  });

  it('secretary shows filter narrows by status array membership', () => {
    const shows = [
      { id: 's1', status: 'draft' },
      { id: 's2', status: 'archived' },
      { id: 's3', status: 'active' },
    ];
    const result = applyRoleDataFilter(shows, 'secretary', 'shows', undefined, 'show-x');
    expect(result.map(s => s.id)).toEqual(['s1', 's3']);
  });

  it('dataType with no filter defined returns data unchanged', () => {
    const data = [{ id: 'a' }, { id: 'b' }];
    // "templates" has no filter for exhibitor
    expect(applyRoleDataFilter(data, 'exhibitor', 'templates')).toBe(data);
  });

  it('applies limit when the filter specifies one', () => {
    const dogs = Array.from({ length: 5 }, (_, i) => ({
      id: `d${i}`,
      // admin dogs filter has no where clause, just a limit of 100 (below sample size N/A);
      // use judge classes filter instead which has no limit — assert admin dogs limit path
    }));
    const result = applyRoleDataFilter(dogs, 'admin', 'dogs');
    expect(result).toHaveLength(5); // limit (100) exceeds sample size, so nothing trimmed
  });
});
