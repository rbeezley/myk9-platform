import type { User } from '@supabase/supabase-js';
import {
  MOCK_USERS,
  ScopeType,
  USER_ROLE_HIERARCHY,
  UserRole,
  type RoleScope,
  type UserWithRoles,
} from '@/types/auth-types';
import type { UserRoleWithDetails } from './authContextTypes';

export function getPrimaryRole(roles: UserRole[]): UserRole {
  for (const role of USER_ROLE_HIERARCHY) {
    if (roles.includes(role)) return role;
  }
  return UserRole.EXHIBITOR;
}

export function buildActiveRoleScopes(
  roles: UserRoleWithDetails[],
  userId: string
): RoleScope[] {
  return roles
    .filter(ur => ur.is_active && ur.scope_type && ur.scope_id)
    .map(ur => ({
      userId,
      roleId: ur.role?.name || ur.role_id,
      scopeType: ur.scope_type as ScopeType,
      scopeId: ur.scope_id as string,
      createdAt: new Date(ur.assigned_at || Date.now()),
    }));
}

export function getUniqueActiveRoleNames(roles: UserRoleWithDetails[]): UserRole[] {
  const validRoleNames = new Set(Object.values(UserRole));
  return Array.from(
    new Set(
      roles
        .filter(ur => ur.is_active)
        .map(ur => ur.role?.name)
        .filter((name): name is UserRole => !!name && validRoleNames.has(name as UserRole))
    )
  );
}

export const DEV_AUTH_ROLE_ALIASES: Record<string, keyof typeof MOCK_USERS> = {
  'secretary@myk9t.com': 'secretary-user',
  'clubadmin@myk9t.com': 'club-admin-user',
  'admin@myk9t.com': 'site-admin-user',
  'judge@myk9t.com': 'judge-user',
};

export function buildDevUserWithMockRoles(
  authUser: User,
  mockUser: UserWithRoles,
  databaseUserId?: string
): UserWithRoles {
  return {
    ...authUser,
    roles: mockUser.roles,
    permissions: mockUser.permissions,
    scopes: mockUser.scopes.map(scope => ({ ...scope, userId: authUser.id })),
    ...(databaseUserId ? { databaseUserId } : {}),
  } as UserWithRoles;
}
