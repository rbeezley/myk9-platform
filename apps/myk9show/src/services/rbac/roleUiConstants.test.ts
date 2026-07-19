import { describe, it, expect } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { CLUB_SCOPED_ROLES, LOCKED_ROLES, MANAGEABLE_ROLES, ROLE_LABELS } from './roleUiConstants';

describe('roleUiConstants', () => {
  it('MANAGEABLE_ROLES equals the canonical seven role names', () => {
    expect(new Set(MANAGEABLE_ROLES)).toEqual(
      new Set([
        UserRole.SITE_ADMIN,
        UserRole.SECRETARY,
        UserRole.CLUB_ADMIN,
        UserRole.JUDGE,
        UserRole.EXHIBITOR,
        UserRole.STEWARD,
        UserRole.CHAIRMAN,
      ])
    );
    expect(MANAGEABLE_ROLES).toHaveLength(7);
  });

  it('CLUB_SCOPED_ROLES is secretary + club_admin', () => {
    expect(CLUB_SCOPED_ROLES).toEqual(new Set([UserRole.SECRETARY, UserRole.CLUB_ADMIN]));
  });

  it('LOCKED_ROLES is exhibitor only', () => {
    expect(LOCKED_ROLES).toEqual(new Set([UserRole.EXHIBITOR]));
  });

  it('ROLE_LABELS has a label for every manageable role', () => {
    for (const role of MANAGEABLE_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});
