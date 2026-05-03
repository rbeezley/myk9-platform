import { describe, it, expect } from 'vitest';
import { getHighestRole } from '../getHighestRole';
import { UserRole } from '@/types/auth-types';

describe('getHighestRole', () => {
  it('returns SITE_ADMIN when user has SITE_ADMIN and EXHIBITOR', () => {
    expect(getHighestRole([UserRole.SITE_ADMIN, UserRole.EXHIBITOR])).toBe(UserRole.SITE_ADMIN);
  });

  it('returns SECRETARY when user has SECRETARY and JUDGE', () => {
    expect(getHighestRole([UserRole.SECRETARY, UserRole.JUDGE])).toBe(UserRole.SECRETARY);
  });

  it('returns EXHIBITOR for an exhibitor-only user', () => {
    expect(getHighestRole([UserRole.EXHIBITOR])).toBe(UserRole.EXHIBITOR);
  });

  it('returns EXHIBITOR fallback for an empty roles array', () => {
    expect(getHighestRole([])).toBe(UserRole.EXHIBITOR);
  });
});
