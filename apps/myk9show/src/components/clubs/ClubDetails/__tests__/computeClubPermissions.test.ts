import { describe, it, expect } from 'vitest';
import { computeClubPermissions } from '../useClubDetailsState';

describe('computeClubPermissions', () => {
  it('grants all permissions to site admins', () => {
    expect(
      computeClubPermissions({
        isClubAdmin: false,
        isSiteAdmin: true,
        hasManageMembersPermission: false,
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
        hasManageMembersPermission: false,
      })
    ).toEqual({
      canEditClub: true,
      canManageMembers: true,
      canEditBranding: true,
      canDeleteClub: false,
    });
  });

  it('grants manage-members via scoped permission alone', () => {
    expect(
      computeClubPermissions({
        isClubAdmin: false,
        isSiteAdmin: false,
        hasManageMembersPermission: true,
      })
    ).toEqual({
      canEditClub: false,
      canManageMembers: true,
      canEditBranding: false,
      canDeleteClub: false,
    });
  });

  it('denies everything to plain authenticated users', () => {
    expect(
      computeClubPermissions({
        isClubAdmin: false,
        isSiteAdmin: false,
        hasManageMembersPermission: false,
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
        hasManageMembersPermission: true,
      }).canDeleteClub
    ).toBe(false);

    expect(
      computeClubPermissions({
        isClubAdmin: false,
        isSiteAdmin: true,
        hasManageMembersPermission: false,
      }).canDeleteClub
    ).toBe(true);
  });
});
