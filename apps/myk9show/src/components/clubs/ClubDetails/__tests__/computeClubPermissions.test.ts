import { describe, it, expect } from 'vitest';
import { computeClubPermissions } from '../clubPermissions';

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
