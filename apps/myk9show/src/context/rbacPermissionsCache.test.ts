import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPermissionsResponse } from '@/types/rbac-types';
import {
  RBAC_CACHE_TTL_MS,
  clearRbacPermissionsCache,
  loadRbacPermissionsCache,
  saveRbacPermissionsCache,
} from './rbacPermissionsCache';

const USER_ID = 'user-1';

const response: UserPermissionsResponse = {
  roles: [
    {
      role_id: 'role-secretary',
      role: { name: 'secretary', display_name: 'Secretary' },
      is_active: true,
    } as UserPermissionsResponse['roles'][number],
  ],
  permissions: [],
  effectivePermissions: ['show:manage'],
  effectivePermissionScopes: [
    { permission_code: 'show:manage', scope_type: 'club', scope_id: 'club-1' },
  ],
};

describe('rbacPermissionsCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('round-trips a saved permissions response keyed by user id', () => {
    saveRbacPermissionsCache(USER_ID, response);

    const cached = loadRbacPermissionsCache(USER_ID);

    expect(cached).not.toBeNull();
    expect(cached?.data).toEqual(response);
    expect(cached?.cachedAt).toBeTruthy();
  });

  it('returns null for a user with no cached entry', () => {
    saveRbacPermissionsCache(USER_ID, response);

    expect(loadRbacPermissionsCache('someone-else')).toBeNull();
  });

  it('returns null and clears the entry when the stored value is malformed', () => {
    saveRbacPermissionsCache(USER_ID, response);
    localStorage.setItem(`myk9show:rbac-cache:${USER_ID}`, 'not-json{');

    expect(loadRbacPermissionsCache(USER_ID)).toBeNull();
  });

  it('returns null when a nested element is malformed (roles: [null])', () => {
    localStorage.setItem(
      `myk9show:rbac-cache:${USER_ID}`,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        data: {
          roles: [null],
          permissions: [],
          effectivePermissions: [],
          effectivePermissionScopes: [],
        },
      })
    );

    expect(loadRbacPermissionsCache(USER_ID)).toBeNull();
  });

  it('returns null when the entry is older than the TTL', () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now - RBAC_CACHE_TTL_MS - 1000);
    saveRbacPermissionsCache(USER_ID, response);
    vi.setSystemTime(now);

    expect(loadRbacPermissionsCache(USER_ID)).toBeNull();
  });

  it('still serves an entry that is stale but inside the TTL', () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now - RBAC_CACHE_TTL_MS + 60_000);
    saveRbacPermissionsCache(USER_ID, response);
    vi.setSystemTime(now);

    expect(loadRbacPermissionsCache(USER_ID)).not.toBeNull();
  });

  it("clearRbacPermissionsCache removes only that user's entry", () => {
    saveRbacPermissionsCache(USER_ID, response);
    saveRbacPermissionsCache('user-2', response);

    clearRbacPermissionsCache(USER_ID);

    expect(loadRbacPermissionsCache(USER_ID)).toBeNull();
    expect(loadRbacPermissionsCache('user-2')).not.toBeNull();
  });

  it('save swallows storage failures instead of throwing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => saveRbacPermissionsCache(USER_ID, response)).not.toThrow();

    setItem.mockRestore();
  });
});
