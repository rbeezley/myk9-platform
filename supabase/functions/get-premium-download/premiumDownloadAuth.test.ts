import { describe, expect, it, vi } from 'vitest';
import { hasShowManagementAccess } from './premiumDownloadAuth.ts';

const showId = '00000000-0000-0000-0000-000000694011';

function authBackend(overrides: {
  userExists?: boolean;
  canManage?: boolean;
  isSecretary?: boolean;
} = {}) {
  return {
    getUser: vi.fn(async (_token: string) => ({ userExists: overrides.userExists ?? true })),
    checkShowAccess: vi.fn(async (_showId: string, _token: string) => ({
      canManage: overrides.canManage ?? false,
      isSecretary: overrides.isSecretary ?? false,
    })),
  };
}

describe('hasShowManagementAccess', () => {
  it('does not treat missing or malformed authorization as management access', async () => {
    const auth = authBackend({ canManage: true });

    await expect(hasShowManagementAccess(showId, null, auth)).resolves.toBe(false);
    await expect(hasShowManagementAccess(showId, 'Basic token', auth)).resolves.toBe(false);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.checkShowAccess).not.toHaveBeenCalled();
  });

  it('does not query manager scope for an invalid bearer token', async () => {
    const auth = authBackend({ userExists: false, canManage: true });

    await expect(
      hasShowManagementAccess(showId, 'Bearer invalid-token', auth)
    ).resolves.toBe(false);
    expect(auth.getUser).toHaveBeenCalledWith('invalid-token');
    expect(auth.checkShowAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['show manager', { canManage: true }],
    ['platform admin', { canManage: true }],
    ['show-scoped secretary', { isSecretary: true }],
  ])('allows existing RBAC helpers to authorize a %s', async (_role, access) => {
    const auth = authBackend(access);

    await expect(
      hasShowManagementAccess(showId, 'Bearer valid-user-jwt', auth)
    ).resolves.toBe(true);
    expect(auth.getUser).toHaveBeenCalledWith('valid-user-jwt');
    expect(auth.checkShowAccess).toHaveBeenCalledWith(showId, 'valid-user-jwt');
  });

  it('denies a valid user who does not manage this show', async () => {
    const auth = authBackend();

    await expect(
      hasShowManagementAccess(showId, 'Bearer unrelated-manager-jwt', auth)
    ).resolves.toBe(false);
    expect(auth.checkShowAccess).toHaveBeenCalledWith(showId, 'unrelated-manager-jwt');
  });
});
