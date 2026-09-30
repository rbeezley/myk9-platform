import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { ScopeType, UserRole, type UserWithRoles } from '@/types/auth-types';
import { canCreateShowForClub } from '@/components/clubs/ClubDetails/clubPermissions';
import { isClubShowCreateDenied, useClubShowCreateDenied } from './clubShowCreatePermission';
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

  it('never lets a show-scoped row grant club-level create (is_trial_secretary requires show_id IS NULL), nor a non-creator club role', () => {
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

const auth = vi.hoisted(() => ({ userWithRoles: null as unknown }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth }));

function denied(clubId: string, search: string, enabled = true) {
  return renderHook(() => useClubShowCreateDenied(clubId, enabled), {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: [`/wizard${search}`] }, children),
  }).result.current;
}

describe('wizard advisory alert (MYK9-887)', () => {
  it('alerts for an unauthorized club, not for an authorized one', () => {
    auth.userWithRoles = user([UserRole.SECRETARY], [scope(UserRole.SECRETARY, 'mine')]);
    expect(denied('other', '?clubId=other')).toBe(true);
    expect(denied('mine', '?clubId=mine')).toBe(false);
  });

  it('is silent for the club this navigation just created, but only that club', () => {
    auth.userWithRoles = user([UserRole.SECRETARY], []);
    expect(denied('new1', '?clubId=new1&clubCreated=1')).toBe(false);
    // The user then picks a different club: the flag no longer covers it.
    expect(denied('other', '?clubId=new1&clubCreated=1')).toBe(true);
    // Without the flag a club is an ordinary permission miss.
    expect(denied('new1', '?clubId=new1')).toBe(true);
  });

  it('does not check when disabled (editing an existing show)', () => {
    auth.userWithRoles = user([], []);
    expect(denied('c1', '', false)).toBe(false);
  });
});

describe('Next is never blocked by the club check', () => {
  it('Basics validation has no club-permission message even for an unauthorized club', () => {
    const show = {
      name: 'Spring',
      organization: 'AKC',
      startDate: '2026-10-10',
      endDate: '2026-10-11',
      location: 'Venue',
      clubId: 'not-mine',
      entryOpenDate: '',
      entryCloseDate: '',
      officials: { secretary: ['p1'], chairman: ['p2'], steward: [] },
    };
    expect(isClubShowCreateDenied(user([], []), 'not-mine')).toBe(true);
    expect(getShowDetailsValidationMessages(show)).toEqual([]);
  });
});
