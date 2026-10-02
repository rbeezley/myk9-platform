import { describe, it, expect } from 'vitest';
import { UserRole } from '@/types/auth-types';
import {
  canManageDogRegistrations,
  deriveDogPageGates,
  resolveDogRelationship,
  usesNarrowDogSurface,
} from './dogViewerAccess';

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

describe('resolveDogRelationship', () => {
  const OWNER = '11111111-0000-4000-8000-0000000000a1';
  const OTHER = '11111111-0000-4000-8000-0000000000a3';
  const dog = { ownerId: OWNER, coOwnerId: undefined };
  const base = { dog, viewerPersonId: undefined, gaveUp: false };

  it.each([
    ['roles still loading', { ...base, viewerPersonId: OWNER, rbacLoading: true }, 'pending'],
    [
      'person lookup unresolved and no cached id',
      { ...base, personIdentityState: 'unresolved' as const },
      'pending',
    ],
    [
      'cached person id while the lookup is unresolved',
      { ...base, viewerPersonId: OWNER, personIdentityState: 'unresolved' as const },
      'owner',
    ],
    [
      'co-owner',
      { ...base, dog: { ownerId: OTHER, coOwnerId: OWNER }, viewerPersonId: OWNER },
      'owner',
    ],
    ['different person', { ...base, viewerPersonId: OTHER }, 'nonOwner'],
    ['confirmed no person row', { ...base, personIdentityState: 'missing' as const }, 'nonOwner'],
    [
      'gave up (offline / timeout) with nothing resolved',
      { ...base, personIdentityState: 'unresolved' as const, rbacLoading: true, gaveUp: true },
      'nonOwner',
    ],
  ])('%s -> %s', (_label, inputs, kind) => {
    expect(resolveDogRelationship(inputs).kind).toBe(kind);
  });

  it('derives no gates while pending, and every gate from the one result otherwise', () => {
    const roles = [UserRole.CLUB_ADMIN];
    const hasRole = (r: UserRole) => roles.includes(r);
    expect(deriveDogPageGates({ kind: 'pending' }, hasRole)).toBeNull();
    expect(deriveDogPageGates({ kind: 'owner' }, hasRole)).toEqual({
      viewerOwnsDog: true,
      narrowSurface: false,
      canManageRegistrations: true,
    });
    expect(deriveDogPageGates({ kind: 'nonOwner' }, hasRole)).toEqual({
      viewerOwnsDog: false,
      narrowSurface: true,
      canManageRegistrations: false,
    });
  });
});
