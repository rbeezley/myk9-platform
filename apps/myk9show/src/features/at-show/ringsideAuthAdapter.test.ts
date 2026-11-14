import { describe, it, expect } from 'vitest';
import { toRingsideRole, resolveRingsideAccess } from './ringsideAuthAdapter';
import { UserRole as ShowRole } from '@/types/auth-types';

describe('toRingsideRole', () => {
  it('maps show-running officials to admin', () => {
    expect(toRingsideRole(ShowRole.SITE_ADMIN)).toBe('admin');
    expect(toRingsideRole(ShowRole.SECRETARY)).toBe('admin');
    expect(toRingsideRole(ShowRole.CLUB_ADMIN)).toBe('admin');
    expect(toRingsideRole(ShowRole.CHAIRMAN)).toBe('admin');
  });

  it('maps judge/steward/exhibitor one-to-one', () => {
    expect(toRingsideRole(ShowRole.JUDGE)).toBe('judge');
    expect(toRingsideRole(ShowRole.STEWARD)).toBe('steward');
    expect(toRingsideRole(ShowRole.EXHIBITOR)).toBe('exhibitor');
  });

  it('returns null for an absent role', () => {
    expect(toRingsideRole(null)).toBeNull();
    expect(toRingsideRole(undefined)).toBeNull();
  });
});

describe('resolveRingsideAccess', () => {
  it('exposes the mapped role', () => {
    const auth = resolveRingsideAccess({ showRole: ShowRole.JUDGE });
    expect(auth.role).toBe('judge');
  });

  it('derives permissions from the mapped role (judge can score, cannot view passcodes)', () => {
    const auth = resolveRingsideAccess({ showRole: ShowRole.JUDGE });
    expect(auth.permissions?.canScore).toBe(true);
    expect(auth.permissions?.canViewPasscodes).toBe(false);
  });

  it('admin (mapped from secretary) can manage classes and view passcodes', () => {
    const auth = resolveRingsideAccess({ showRole: ShowRole.SECRETARY });
    expect(auth.permissions?.canManageClasses).toBe(true);
    expect(auth.permissions?.canViewPasscodes).toBe(true);
  });

  it('exhibitor can check in dogs but cannot score or change run order', () => {
    const auth = resolveRingsideAccess({ showRole: ShowRole.EXHIBITOR });
    expect(auth.permissions?.canCheckInDogs).toBe(true);
    expect(auth.permissions?.canScore).toBe(false);
    expect(auth.permissions?.canChangeRunOrder).toBe(false);
  });

  it('denies every permission when the role is unmapped/absent', () => {
    const auth = resolveRingsideAccess({ showRole: null });
    expect(auth.role).toBeNull();
    expect(auth.permissions).toBeNull();
  });

  // Phase 1c — passcode grant precedence over the account RBAC mapping.
  it('grantRole overrides the account RBAC role (exhibitor account + judge passcode → judge)', () => {
    const auth = resolveRingsideAccess({
      showRole: ShowRole.EXHIBITOR,
      grantRole: 'judge',
    });
    expect(auth.role).toBe('judge');
    expect(auth.permissions?.canScore).toBe(true);
  });

  it('falls back to the RBAC mapping when grantRole is null (passcode-less account)', () => {
    const auth = resolveRingsideAccess({ showRole: ShowRole.JUDGE, grantRole: null });
    expect(auth.role).toBe('judge');
  });

  it('a grant can grant access even when the account has no mapped role', () => {
    const auth = resolveRingsideAccess({ showRole: null, grantRole: 'admin' });
    expect(auth.role).toBe('admin');
    expect(auth.permissions?.canViewPasscodes).toBe(true);
  });

  it('grant override is unconditional — an exhibitor passcode on an admin account resolves to exhibitor for that show', () => {
    // The passcode is authoritative for its show, even when "lower" than the
    // account RBAC role (see resolveRingsideAccess doc). Pins the intended semantic.
    const auth = resolveRingsideAccess({
      showRole: ShowRole.SECRETARY,
      grantRole: 'exhibitor',
    });
    expect(auth.role).toBe('exhibitor');
    expect(auth.permissions?.canManageClasses).toBe(false);
  });
});
