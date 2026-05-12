import { describe, expect, it } from 'vitest';
import {
  buildActiveRoleScopes,
  getUniqueActiveRoleNames,
  type UserRoleWithDetails,
} from '@/context/AuthContext';
import { ScopeType, UserRole } from '@/types/auth-types';

describe('buildActiveRoleScopes', () => {
  it('excludes inactive scoped role rows', () => {
    const roles: UserRoleWithDetails[] = [
      {
        role_id: UserRole.SECRETARY,
        role: { name: UserRole.SECRETARY, display_name: 'Secretary' },
        scope_type: ScopeType.CLUB,
        scope_id: 'club-active',
        assigned_at: '2026-05-09T00:00:00Z',
        is_active: true,
      },
      {
        role_id: UserRole.SECRETARY,
        role: { name: UserRole.SECRETARY, display_name: 'Secretary' },
        scope_type: ScopeType.CLUB,
        scope_id: 'club-inactive',
        assigned_at: '2026-05-09T00:00:00Z',
        is_active: false,
      },
    ];

    const scopes = buildActiveRoleScopes(roles, 'user-1');

    expect(scopes.map(scope => scope.scopeId)).toEqual(['club-active']);
  });
});

describe('getUniqueActiveRoleNames', () => {
  it('deduplicates repeated scoped role rows', () => {
    const roles: UserRoleWithDetails[] = [
      {
        role_id: UserRole.SECRETARY,
        role: { name: UserRole.SECRETARY, display_name: 'Secretary' },
        scope_type: ScopeType.SHOW,
        scope_id: 'show-1',
        is_active: true,
      },
      {
        role_id: UserRole.SECRETARY,
        role: { name: UserRole.SECRETARY, display_name: 'Secretary' },
        scope_type: ScopeType.SHOW,
        scope_id: 'show-2',
        is_active: true,
      },
      {
        role_id: UserRole.CHAIRMAN,
        role: { name: UserRole.CHAIRMAN, display_name: 'Chairman' },
        scope_type: ScopeType.SHOW,
        scope_id: 'show-1',
        is_active: true,
      },
      {
        role_id: UserRole.CHAIRMAN,
        role: { name: UserRole.CHAIRMAN, display_name: 'Chairman' },
        scope_type: ScopeType.SHOW,
        scope_id: 'show-2',
        is_active: true,
      },
    ];

    expect(getUniqueActiveRoleNames(roles)).toEqual([UserRole.SECRETARY, UserRole.CHAIRMAN]);
  });
});
