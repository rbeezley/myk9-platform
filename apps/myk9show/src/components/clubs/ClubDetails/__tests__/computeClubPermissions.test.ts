import { describe, it, expect } from 'vitest';
import { ScopeType, UserRole } from '@/types/auth-types';
import type { RoleScope } from '@/types/auth-types';
import { canDeleteShowForClub, computeClubPermissions } from '../clubPermissions';

describe('computeClubPermissions', () => {
  it('grants all permissions to site admins', () => {
    expect(
      computeClubPermissions({
        isClubAdmin: false,
        isSiteAdmin: true,
      })
    ).toEqual({
      canEditClub: true,
      canManageMembers: false,
      canEditBranding: true,
      canDeleteClub: true,
    });
  });

  it('grants club admins manage/branding but not delete', () => {
    expect(
      computeClubPermissions({
        isClubAdmin: true,
        isSiteAdmin: false,
      })
    ).toEqual({
      canEditClub: true,
      canManageMembers: true,
      canEditBranding: true,
      canDeleteClub: false,
    });
  });

  it('does not grant member management from an unscoped permission', () => {
    expect(
      computeClubPermissions({
        isClubAdmin: false,
        isSiteAdmin: false,
      })
    ).toEqual({
      canEditClub: false,
      canManageMembers: false,
      canEditBranding: false,
      canDeleteClub: false,
    });
  });

  it('denies everything to plain authenticated users', () => {
    expect(
      computeClubPermissions({
        isClubAdmin: false,
        isSiteAdmin: false,
      })
    ).toEqual({
      canEditClub: false,
      canManageMembers: false,
      canEditBranding: false,
      canDeleteClub: false,
    });
  });

  it('mirrors clubs_delete RLS — only site_admin can delete', () => {
    expect(
      computeClubPermissions({
        isClubAdmin: true,
        isSiteAdmin: false,
      }).canDeleteClub
    ).toBe(false);

    expect(
      computeClubPermissions({
        isClubAdmin: false,
        isSiteAdmin: true,
      }).canDeleteClub
    ).toBe(true);
  });
});

// soft_delete_show (20261001235300) admits is_club_admin(club) OR is_trial_secretary(club)
// OR is_site_admin(). Both club helpers read CLUB-scoped grants (show_id IS NULL), so a
// secretary appointed to one show only is refused and must not see the button.
describe('canDeleteShowForClub (mirrors soft_delete_show)', () => {
  const scope = (roleId: string, scopeType: ScopeType, scopeId: string): RoleScope => ({
    userId: 'u1',
    roleId,
    scopeType,
    scopeId,
    createdAt: new Date(0),
  });
  const viewer = (roles: UserRole[], scopes: RoleScope[] = []) => ({ roles, scopes });

  it.each([
    ['a site admin', viewer([UserRole.SITE_ADMIN]), true],
    [
      'a club admin of this club',
      viewer([], [scope('club_admin', ScopeType.CLUB, 'club-1')]),
      true,
    ],
    ['a secretary of this club', viewer([], [scope('secretary', ScopeType.CLUB, 'club-1')]), true],
    [
      'a trial secretary of this club',
      viewer([], [scope('trial_secretary', ScopeType.CLUB, 'club-1')]),
      true,
    ],
    [
      'a secretary appointed to one show only',
      viewer([], [scope('secretary', ScopeType.SHOW, 'club-1')]),
      false,
    ],
    [
      'a club admin of another club',
      viewer([], [scope('club_admin', ScopeType.CLUB, 'club-2')]),
      false,
    ],
    ['an exhibitor', viewer([UserRole.EXHIBITOR]), false],
  ])('%s: %s', (_label, user, expected) => {
    expect(canDeleteShowForClub(user, 'club-1')).toBe(expected);
  });

  it('is false with no signed-in user, and a club-less show is a site admin matter', () => {
    expect(canDeleteShowForClub(null, 'club-1')).toBe(false);
    expect(canDeleteShowForClub(viewer([UserRole.SECRETARY]), undefined)).toBe(false);
    expect(canDeleteShowForClub(viewer([UserRole.SITE_ADMIN]), undefined)).toBe(true);
  });
});
