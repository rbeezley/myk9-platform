import { describe, it, expect } from 'vitest';
import { computeClubPermissions } from '../clubPermissions';

describe('computeClubPermissions', () => {
  it('grants edit and branding to site admins, but not member management', () => {
    expect(computeClubPermissions({ isClubAdmin: false, isSiteAdmin: true })).toEqual({
      canEditClub: true,
      canManageMembers: false,
      canEditBranding: true,
      canDeleteClub: true,
    });
  });

  it('grants club admins edit, branding and members — but not delete', () => {
    expect(computeClubPermissions({ isClubAdmin: true, isSiteAdmin: false })).toEqual({
      canEditClub: true,
      canManageMembers: true,
      canEditBranding: true,
      canDeleteClub: false,
    });
  });

  it('denies everything to plain authenticated users', () => {
    expect(computeClubPermissions({ isClubAdmin: false, isSiteAdmin: false })).toEqual({
      canEditClub: false,
      canManageMembers: false,
      canEditBranding: false,
      canDeleteClub: false,
    });
  });

  it('mirrors clubs_delete RLS — only site_admin can delete', () => {
    expect(
      computeClubPermissions({ isClubAdmin: true, isSiteAdmin: false }).canDeleteClub
    ).toBe(false);
    expect(
      computeClubPermissions({ isClubAdmin: false, isSiteAdmin: true }).canDeleteClub
    ).toBe(true);
  });

  // The third operand this used to carry (`hasManageMembersPermission`) is gone.
  // It asked hasPermission() for a code with no row in public.permissions, so it
  // was never true and canManageMembers already reduced to isClubAdmin. Pin that
  // canManageMembers tracks the club-scoped role EXACTLY, so re-introducing a
  // second way to earn it is a deliberate change and not an accident (MYK9-371).
  it('ties canManageMembers to the club-scoped role alone', () => {
    for (const isSiteAdmin of [false, true]) {
      expect(computeClubPermissions({ isClubAdmin: true, isSiteAdmin }).canManageMembers).toBe(true);
      expect(computeClubPermissions({ isClubAdmin: false, isSiteAdmin }).canManageMembers).toBe(
        false
      );
    }
  });
});
