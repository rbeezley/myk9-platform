import { describe, expect, it } from 'vitest';
import { ScopeType, UserRole, type UserWithRoles } from '@/types/auth-types';
import { canCreateShowForClub } from '@/components/clubs/ClubDetails/clubPermissions';
import {
  isClubShowCreateDenied,
  markClubJustCreated,
  clearJustCreatedClubsForTest,
} from './clubShowCreatePermission';
import { getShowDetailsValidationMessages } from './showCreationWizardValidation';

const scope = (roleId: string, scopeId: string, scopeType = ScopeType.CLUB) => ({
  userId: 'u1',
  roleId,
  scopeType,
  scopeId,
  createdAt: new Date(0),
});

const user = (roles: UserRole[], scopes: ReturnType<typeof scope>[]) =>
  ({ id: 'u1', roles, scopes, permissions: [] }) as unknown as UserWithRoles;

describe('canCreateShowForClub (mirrors create_show_with_children)', () => {
  it('allows a club admin and a secretary of that club', () => {
    expect(canCreateShowForClub(user([], [scope(UserRole.CLUB_ADMIN, 'c1')]), 'c1')).toBe(true);
    expect(canCreateShowForClub(user([], [scope(UserRole.SECRETARY, 'c1')]), 'c1')).toBe(true);
    expect(canCreateShowForClub(user([], [scope('trial_secretary', 'c1')]), 'c1')).toBe(true);
  });

  it('allows a site admin for any club', () => {
    expect(canCreateShowForClub(user([UserRole.SITE_ADMIN], []), 'c9')).toBe(true);
  });

  it('denies a user with no grant for that club', () => {
    expect(canCreateShowForClub(user([UserRole.EXHIBITOR], []), 'c1')).toBe(false);
    expect(canCreateShowForClub(user([], [scope(UserRole.SECRETARY, 'c2')]), 'c1')).toBe(false);
    expect(canCreateShowForClub(null, 'c1')).toBe(false);
  });

  it('does not count a show-scoped secretary or a non-creator club role', () => {
    expect(
      canCreateShowForClub(user([], [scope(UserRole.SECRETARY, 'c1', ScopeType.SHOW)]), 'c1')
    ).toBe(false);
    expect(canCreateShowForClub(user([], [scope(UserRole.STEWARD, 'c1')]), 'c1')).toBe(false);
  });
});

describe('isClubShowCreateDenied (wizard)', () => {
  it('is denied only for a known user without a grant', () => {
    expect(isClubShowCreateDenied(user([], [scope(UserRole.SECRETARY, 'c2')]), 'c1')).toBe(true);
    expect(isClubShowCreateDenied(user([], [scope(UserRole.SECRETARY, 'c1')]), 'c1')).toBe(false);
  });

  it('is unknown, not denied, before identity loads or a club is chosen', () => {
    expect(isClubShowCreateDenied(null, 'c1')).toBe(false);
    expect(isClubShowCreateDenied(user([], []), undefined)).toBe(false);
  });
});

describe('create-club-and-return path (Codex P1)', () => {
  it('never blocks a club this user just created, even before scopes catch up', () => {
    clearJustCreatedClubsForTest();
    const u = user([UserRole.SECRETARY], [scope(UserRole.SECRETARY, 'old')]);
    expect(isClubShowCreateDenied(u, 'new1')).toBe(true);
    markClubJustCreated('new1');
    expect(isClubShowCreateDenied(u, 'new1')).toBe(false);
    expect(isClubShowCreateDenied(u, 'other')).toBe(true);
  });
});

describe('Basics-step validation carries the club permission message', () => {
  const show = {
    name: 'Spring',
    organization: 'AKC',
    startDate: '2026-10-10',
    endDate: '2026-10-11',
    location: 'Venue',
    clubId: 'c1',
    entryOpenDate: '',
    entryCloseDate: '',
    officials: { secretary: ['p1'], chairman: ['p2'], steward: [] },
  };

  it('blocks Next for an unauthorized club and is clean for an authorized one', () => {
    expect(getShowDetailsValidationMessages(show, { clubCreateDenied: true })).toEqual([
      expect.stringMatching(/permission to create shows for this club/i),
    ]);
    expect(getShowDetailsValidationMessages(show, { clubCreateDenied: false })).toEqual([]);
  });
});
