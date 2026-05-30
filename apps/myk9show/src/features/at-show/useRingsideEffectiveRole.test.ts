/**
 * Tests for useRingsideEffectiveRole — the single source of truth for a
 * surface's ringside role + permission bag.
 *
 * Covers the two inputs that decide `canScore` (and every other ringside
 * permission): the account RBAC mapping, and the Phase 1c show-scoped passcode
 * grant that overrides it. The real `getPrimaryRole` + the real grant store are
 * used (only `useAuthContext` is stubbed) so the RBAC→ringside mapping and the
 * grant precedence/scoping rules are exercised, not faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { UserRole } from '@/types/auth-types';

let mockRoles: UserRole[] = [];
vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useAuthContext')>();
  return {
    ...actual,
    useAuthContext: () => ({ getUserRoles: () => mockRoles }),
  };
});

import { useRingsideEffectiveRole } from './useRingsideEffectiveRole';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';

const SHOW = 'show-1';

describe('useRingsideEffectiveRole', () => {
  beforeEach(() => {
    mockRoles = [];
    useRingsideGrantStore.getState().clearGrant();
  });
  afterEach(() => vi.clearAllMocks());

  describe('account RBAC mapping (no grant)', () => {
    it('maps a steward to canScore=false but canCheckInDogs=true', () => {
      mockRoles = [UserRole.STEWARD];
      const { result } = renderHook(() => useRingsideEffectiveRole(SHOW));

      expect(result.current.ringsideRole).toBe('steward');
      expect(result.current.grantRole).toBeNull();
      expect(result.current.hasPermission('canScore')).toBe(false);
      expect(result.current.hasPermission('canCheckInDogs')).toBe(true);
    });

    it('maps a judge to canScore=true', () => {
      mockRoles = [UserRole.JUDGE];
      const { result } = renderHook(() => useRingsideEffectiveRole(SHOW));

      expect(result.current.ringsideRole).toBe('judge');
      expect(result.current.hasPermission('canScore')).toBe(true);
    });

    it('maps a show-running official (site admin) to admin/canScore=true', () => {
      mockRoles = [UserRole.SITE_ADMIN];
      const { result } = renderHook(() => useRingsideEffectiveRole(SHOW));

      expect(result.current.ringsideRole).toBe('admin');
      expect(result.current.hasPermission('canScore')).toBe(true);
      expect(result.current.hasPermission('canManageClasses')).toBe(true);
    });

    it('defaults an account with no roles to exhibitor/canScore=false', () => {
      mockRoles = [];
      const { result } = renderHook(() => useRingsideEffectiveRole(SHOW));

      expect(result.current.ringsideRole).toBe('exhibitor');
      expect(result.current.hasPermission('canScore')).toBe(false);
    });
  });

  describe('Phase 1c grant precedence', () => {
    it('a show-scoped judge grant overrides a steward account → canScore=true', () => {
      mockRoles = [UserRole.STEWARD];
      useRingsideGrantStore
        .getState()
        .setGrant({ showId: SHOW, role: 'judge', source: 'passcode' });

      const { result } = renderHook(() => useRingsideEffectiveRole(SHOW));

      expect(result.current.grantRole).toBe('judge');
      expect(result.current.ringsideRole).toBe('judge');
      expect(result.current.hasPermission('canScore')).toBe(true);
      // The account role is still surfaced separately (drives provider auth).
      expect(result.current.showRole).toBe(UserRole.STEWARD);
    });

    it('a grant scoped to a DIFFERENT show is ignored → falls back to RBAC', () => {
      mockRoles = [UserRole.STEWARD];
      useRingsideGrantStore
        .getState()
        .setGrant({ showId: 'other-show', role: 'judge', source: 'passcode' });

      const { result } = renderHook(() => useRingsideEffectiveRole(SHOW));

      expect(result.current.grantRole).toBeNull();
      expect(result.current.ringsideRole).toBe('steward');
      expect(result.current.hasPermission('canScore')).toBe(false);
    });

    it('an exhibitor grant deliberately narrows an admin account for that show', () => {
      mockRoles = [UserRole.SITE_ADMIN];
      useRingsideGrantStore
        .getState()
        .setGrant({ showId: SHOW, role: 'exhibitor', source: 'passcode' });

      const { result } = renderHook(() => useRingsideEffectiveRole(SHOW));

      expect(result.current.ringsideRole).toBe('exhibitor');
      expect(result.current.hasPermission('canScore')).toBe(false);
    });
  });
});
