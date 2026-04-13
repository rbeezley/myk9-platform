import { describe, it, expect } from 'vitest';
import { getHighestRole, getDashboardRoute } from '../roleUtils';
import { UserRole } from '@/types/auth-types';

describe('getHighestRole', () => {
  it('returns SITE_ADMIN when user has both SITE_ADMIN and EXHIBITOR', () => {
    expect(getHighestRole([UserRole.EXHIBITOR, UserRole.SITE_ADMIN])).toBe(UserRole.SITE_ADMIN);
  });

  it('returns SECRETARY when user has SECRETARY and JUDGE', () => {
    expect(getHighestRole([UserRole.JUDGE, UserRole.SECRETARY])).toBe(UserRole.SECRETARY);
  });

  it('returns EXHIBITOR for an exhibitor-only user', () => {
    expect(getHighestRole([UserRole.EXHIBITOR])).toBe(UserRole.EXHIBITOR);
  });

  it('returns CLUB_ADMIN when user has CLUB_ADMIN and SECRETARY', () => {
    expect(getHighestRole([UserRole.SECRETARY, UserRole.CLUB_ADMIN])).toBe(UserRole.CLUB_ADMIN);
  });

  it('returns SITE_ADMIN when user has all roles', () => {
    expect(
      getHighestRole([
        UserRole.EXHIBITOR,
        UserRole.JUDGE,
        UserRole.SECRETARY,
        UserRole.CLUB_ADMIN,
        UserRole.SITE_ADMIN,
      ])
    ).toBe(UserRole.SITE_ADMIN);
  });

  it('returns EXHIBITOR fallback for an empty roles array', () => {
    expect(getHighestRole([])).toBe(UserRole.EXHIBITOR);
  });

  it('returns EXHIBITOR fallback for roles without a dashboard (STEWARD)', () => {
    expect(getHighestRole([UserRole.STEWARD])).toBe(UserRole.EXHIBITOR);
  });
});

describe('getDashboardRoute', () => {
  it('routes SITE_ADMIN to /admin/dashboard', () => {
    expect(getDashboardRoute([UserRole.SITE_ADMIN])).toBe('/admin/dashboard');
  });

  it('routes CLUB_ADMIN to /secretary/dashboard', () => {
    expect(getDashboardRoute([UserRole.CLUB_ADMIN])).toBe('/secretary/dashboard');
  });

  it('routes SECRETARY to /secretary/dashboard', () => {
    expect(getDashboardRoute([UserRole.SECRETARY])).toBe('/secretary/dashboard');
  });

  it('routes JUDGE to /exhibitor/dashboard (intentional — no judge dashboard yet)', () => {
    expect(getDashboardRoute([UserRole.JUDGE])).toBe('/exhibitor/dashboard');
  });

  it('routes EXHIBITOR to /exhibitor/dashboard', () => {
    expect(getDashboardRoute([UserRole.EXHIBITOR])).toBe('/exhibitor/dashboard');
  });

  it('routes SITE_ADMIN + EXHIBITOR multi-role user to /admin/dashboard', () => {
    expect(getDashboardRoute([UserRole.EXHIBITOR, UserRole.SITE_ADMIN])).toBe('/admin/dashboard');
  });
});
