import { describe, it, expect } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { canManageDogRegistrations, usesNarrowDogSurface } from './dogViewerAccess';

const viewer = (roles: UserRole[], viewerOwnsDog = false) => ({
  hasRole: (role: UserRole) => roles.includes(role),
  viewerOwnsDog,
});

describe('usesNarrowDogSurface', () => {
  it.each([
    ['secretary', [UserRole.SECRETARY], false, true],
    ['club admin', [UserRole.CLUB_ADMIN], false, true],
    ['club admin + exhibitor', [UserRole.CLUB_ADMIN, UserRole.EXHIBITOR], false, true],
    ['club admin who owns the dog', [UserRole.CLUB_ADMIN], true, false],
    ['secretary who owns the dog', [UserRole.SECRETARY], true, false],
    ['site admin', [UserRole.SITE_ADMIN, UserRole.SECRETARY], false, false],
    ['exhibitor', [UserRole.EXHIBITOR], false, false],
  ])('%s -> %s', (_label, roles, owns, expected) => {
    expect(usesNarrowDogSurface(viewer(roles, owns))).toBe(expected);
  });
});

describe('canManageDogRegistrations', () => {
  it.each([
    ['secretary non-owner', [UserRole.SECRETARY], false, true],
    ['club admin only', [UserRole.CLUB_ADMIN], false, false],
    ['club admin + exhibitor', [UserRole.CLUB_ADMIN, UserRole.EXHIBITOR], false, false],
    ['club admin + secretary', [UserRole.CLUB_ADMIN, UserRole.SECRETARY], false, true],
    ['club admin owner', [UserRole.CLUB_ADMIN], true, true],
    ['exhibitor owner', [UserRole.EXHIBITOR], true, true],
    ['exhibitor non-owner', [UserRole.EXHIBITOR], false, false],
    ['site admin', [UserRole.SITE_ADMIN], false, true],
  ])('%s -> %s', (_label, roles, owns, expected) => {
    expect(canManageDogRegistrations(viewer(roles, owns))).toBe(expected);
  });
});
