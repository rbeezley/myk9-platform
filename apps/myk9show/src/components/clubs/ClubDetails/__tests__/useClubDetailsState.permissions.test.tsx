/**
 * MYK9-359 — the club-write affordances on /clubs/:id must follow the user's
 * real club-scoped `club_admin` grant, not a lookup into MOCK_USERS.
 *
 * These assertions go through the HOOK, not the pure helper, because the defect
 * was in the wiring: `computeClubPermissions` was always correct and its own
 * tests stayed green while the two arms feeding it were structurally false.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScopeType, UserRole } from '@/types/auth-types';
import type { RoleScope, UserWithRoles } from '@/types/auth-types';
import type { Club } from '@/types/club-types';

const CLUB_A = '11111111-1111-4111-8111-111111111111';
const CLUB_B = '22222222-2222-4222-8222-222222222222';

type PermissionChecker = (code: string, scope?: unknown) => boolean;

const mockAuth = vi.hoisted(() => ({
  userWithRoles: null as UserWithRoles | null,
  hasPermission: vi.fn<(code: string, scope?: unknown) => boolean>(() => false),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuth,
}));
vi.mock('@/store/clubStore', () => ({
  useClubStore: () => ({ updateClub: vi.fn() }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: { shows: unknown[] }) => unknown) => selector({ shows: [] }),
}));
vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useDeleteClubMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/services/database/club-memberships/members', () => ({
  getClubMembers: vi.fn(async () => []),
  getActiveClubMembers: (members: unknown[]) => members,
}));

const { useClubDetailsState } = await import('../useClubDetailsState');
const { hasClubAdminScope } = await import('../clubPermissions');

function clubScope(roleId: UserRole, scopeId: string): RoleScope {
  return {
    userId: 'auth-uid',
    roleId,
    scopeType: ScopeType.CLUB,
    scopeId,
    createdAt: new Date(),
  };
}

function userWith(roles: UserRole[], scopes: RoleScope[]): UserWithRoles {
  return {
    id: 'auth-uid',
    email: 'club-admin@example.test',
    roles,
    permissions: [],
    scopes,
    // Deliberately absent: a cold offline boot has no `people` row resolved yet,
    // and that must not cost a club admin their affordances.
    databaseUserId: undefined,
  } as unknown as UserWithRoles;
}

const club = { id: CLUB_A, name: 'Heartland Scent Work Club' } as Club;

function renderState() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useClubDetailsState(club), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </MemoryRouter>
    ),
  });
}

describe('useClubDetailsState permissions (MYK9-359)', () => {
  beforeEach(() => {
    mockAuth.userWithRoles = null;
    mockAuth.hasPermission = vi.fn<PermissionChecker>(() => false);
  });

  it('grants edit/branding/members to a club-scoped club_admin for THIS club', () => {
    mockAuth.userWithRoles = userWith(
      [UserRole.CLUB_ADMIN, UserRole.EXHIBITOR],
      [clubScope(UserRole.CLUB_ADMIN, CLUB_A)]
    );

    const { result } = renderState();

    expect(result.current.canEditClub).toBe(true);
    expect(result.current.canEditBranding).toBe(true);
    expect(result.current.canManageMembers).toBe(true);
    // clubs_delete RLS is site_admin only.
    expect(result.current.canDeleteClub).toBe(false);
  });

  it('denies a club_admin of a DIFFERENT club', () => {
    mockAuth.userWithRoles = userWith(
      [UserRole.CLUB_ADMIN, UserRole.EXHIBITOR],
      [clubScope(UserRole.CLUB_ADMIN, CLUB_B)]
    );

    const { result } = renderState();

    expect(result.current.canEditClub).toBe(false);
    expect(result.current.canEditBranding).toBe(false);
    expect(result.current.canManageMembers).toBe(false);
  });

  it('does not promote a club-scoped SECRETARY to club admin', () => {
    mockAuth.userWithRoles = userWith(
      [UserRole.SECRETARY],
      [clubScope(UserRole.SECRETARY, CLUB_A)]
    );

    const { result } = renderState();

    expect(result.current.canEditClub).toBe(false);
    expect(result.current.canEditBranding).toBe(false);
  });

  it('denies a plain exhibitor with no scopes', () => {
    mockAuth.userWithRoles = userWith([UserRole.EXHIBITOR], []);

    const { result } = renderState();

    expect(result.current.canEditClub).toBe(false);
    expect(result.current.canManageMembers).toBe(false);
    expect(result.current.canDeleteClub).toBe(false);
  });

  it('does not consult permissions for member management', () => {
    mockAuth.userWithRoles = userWith([UserRole.EXHIBITOR], []);

    const { result } = renderState();

    expect(mockAuth.hasPermission).not.toHaveBeenCalled();
    expect(result.current.canManageMembers).toBe(false);
    expect(result.current.canEditClub).toBe(false);
  });
});

describe('hasClubAdminScope', () => {
  it('matches only an active club_admin scope for the same club', () => {
    expect(hasClubAdminScope([clubScope(UserRole.CLUB_ADMIN, CLUB_A)], CLUB_A)).toBe(true);
    expect(hasClubAdminScope([clubScope(UserRole.CLUB_ADMIN, CLUB_B)], CLUB_A)).toBe(false);
    expect(hasClubAdminScope([clubScope(UserRole.SECRETARY, CLUB_A)], CLUB_A)).toBe(false);
    expect(hasClubAdminScope([], CLUB_A)).toBe(false);
    expect(hasClubAdminScope(undefined, CLUB_A)).toBe(false);
  });

  it('ignores a show-scoped grant of the same role', () => {
    const showScope: RoleScope = {
      userId: 'auth-uid',
      roleId: UserRole.CLUB_ADMIN,
      scopeType: ScopeType.SHOW,
      scopeId: CLUB_A,
      createdAt: new Date(),
    };
    expect(hasClubAdminScope([showScope], CLUB_A)).toBe(false);
  });
});
