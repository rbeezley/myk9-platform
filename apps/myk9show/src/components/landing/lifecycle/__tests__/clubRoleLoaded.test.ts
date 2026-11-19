import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userHoldsClubRole } from '../clubRoleLoaded';

const getUserPermissions = vi.hoisted(() => vi.fn());
vi.mock('@/services/rbac/RBACService', () => ({ rbacService: { getUserPermissions } }));

const role = (overrides: Record<string, unknown>) => ({
  is_active: true,
  club_id: null,
  scope_type: undefined,
  scope_id: undefined,
  ...overrides,
});

beforeEach(() => {
  getUserPermissions.mockReset();
});

describe('userHoldsClubRole (MYK9-2199)', () => {
  it('is true for an active role on that club', async () => {
    getUserPermissions.mockResolvedValue({ roles: [role({ club_id: 'club-9' })] });
    await expect(userHoldsClubRole('user-1', 'club-9')).resolves.toBe(true);
    expect(getUserPermissions).toHaveBeenCalledWith('user-1');
  });

  it('is true for a club scope row', async () => {
    getUserPermissions.mockResolvedValue({
      roles: [role({ scope_type: 'club', scope_id: 'club-9' })],
    });
    await expect(userHoldsClubRole('user-1', 'club-9')).resolves.toBe(true);
  });

  it('is false when the roles are the old ones or the grant is inactive', async () => {
    getUserPermissions.mockResolvedValue({ roles: [role({ club_id: 'club-1' })] });
    await expect(userHoldsClubRole('user-1', 'club-9')).resolves.toBe(false);
    getUserPermissions.mockResolvedValue({
      roles: [role({ club_id: 'club-9', is_active: false })],
    });
    await expect(userHoldsClubRole('user-1', 'club-9')).resolves.toBe(false);
  });

  it('is false when the read fails', async () => {
    getUserPermissions.mockRejectedValue(new Error('offline'));
    await expect(userHoldsClubRole('user-1', 'club-9')).resolves.toBe(false);
  });
});
