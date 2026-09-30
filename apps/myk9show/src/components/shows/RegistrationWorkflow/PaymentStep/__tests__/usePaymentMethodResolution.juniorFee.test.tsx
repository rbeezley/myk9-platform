import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';
import { ScopeType, UserRole } from '@/types/auth-types';

/**
 * MYK9-878: who is offered "Charge junior handler fee". The server accepts the
 * override only from a secretary appointed at THE SHOW'S club (is_show_secretary),
 * so a global secretary role is not enough: a secretary at club A who is also a club
 * admin at club B must not be offered it on a club B show.
 */
const mocks = vi.hoisted(() => ({
  useAuthContext: vi.fn(),
  useShowStore: vi.fn(),
  useRegistrationPermissions: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mocks.useAuthContext }));
vi.mock('@/store/showStore', () => ({ useShowStore: mocks.useShowStore }));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: mocks.useRegistrationPermissions,
}));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: () => ({ isSuccess: true, data: false }),
}));

import { usePaymentMethodResolution } from '../usePaymentMethodResolution';

const SHOW_ID = 'show-b';
const CLUB_A = 'club-a';
const CLUB_B = 'club-b';

function scope(role: UserRole, clubId: string) {
  return { scopeType: ScopeType.CLUB, scopeId: clubId, roleId: role };
}

function setup(args: { roles: UserRole[]; scopes: ReturnType<typeof scope>[]; showClub?: string }) {
  mocks.useAuthContext.mockReturnValue({
    hasRole: (role: UserRole) => args.roles.includes(role),
    userWithRoles: { scopes: args.scopes },
  });
  mocks.useRegistrationPermissions.mockReturnValue({
    isSecretary: args.roles.includes(UserRole.SECRETARY),
    isClubAdmin: args.roles.includes(UserRole.CLUB_ADMIN),
    isSiteAdmin: args.roles.includes(UserRole.SITE_ADMIN),
  });
  mocks.useShowStore.mockReturnValue({
    shows: [{ id: SHOW_ID, clubId: args.showClub ?? CLUB_B, juniorHandlerFee: '15' }],
  });
  return renderHook(() => usePaymentMethodResolution(SHOW_ID, 'cash')).result.current;
}

describe('usePaymentMethodResolution canChargeJuniorFee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is offered to a secretary appointed at the show's club", () => {
    const result = setup({
      roles: [UserRole.SECRETARY],
      scopes: [scope(UserRole.SECRETARY, CLUB_B)],
    });
    expect(result.canChargeJuniorFee).toBe(true);
  });

  it('is NOT offered to a secretary at club A who is only a club admin at club B, on a club B show', () => {
    const result = setup({
      roles: [UserRole.SECRETARY, UserRole.CLUB_ADMIN],
      scopes: [scope(UserRole.SECRETARY, CLUB_A), scope(UserRole.CLUB_ADMIN, CLUB_B)],
    });

    // Still on-behalf staff (the wizard is open to them), but not offered the override.
    expect(result.isOnBehalf).toBe(true);
    expect(result.canChargeJuniorFee).toBe(false);
  });

  it('is NOT offered to a club admin alone', () => {
    const result = setup({
      roles: [UserRole.CLUB_ADMIN],
      scopes: [scope(UserRole.CLUB_ADMIN, CLUB_B)],
    });
    expect(result.canChargeJuniorFee).toBe(false);
  });

  it('is offered to a site admin on any show', () => {
    const result = setup({ roles: [UserRole.SITE_ADMIN], scopes: [] });
    expect(result.canChargeJuniorFee).toBe(true);
  });

  it("is NOT offered to a scoped secretary while the show's club is unknown", () => {
    const result = setup({
      roles: [UserRole.SECRETARY],
      scopes: [scope(UserRole.SECRETARY, CLUB_B)],
      showClub: '',
    });
    expect(result.canChargeJuniorFee).toBe(false);
  });
});
