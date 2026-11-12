import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';
import { ScopeType, UserRole } from '@/types/auth-types';

/**
 * MYK9-1875: who is offered the desk payment actions ("Paid by cash or check", "Make
 * free", "Free entry"). The server accepts them only from this show's officials
 * (`v_is_official` in submit_show_entries), so a global role is not enough: a club A
 * secretary entering a dog at a club B show must not be offered them.
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

describe('usePaymentMethodResolution canUseDeskPaymentActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is offered to a secretary appointed at the show's club", () => {
    const result = setup({
      roles: [UserRole.SECRETARY],
      scopes: [scope(UserRole.SECRETARY, CLUB_B)],
    });
    expect(result.canUseDeskPaymentActions).toBe(true);
  });

  it('is not offered to a secretary of another club', () => {
    const result = setup({
      roles: [UserRole.SECRETARY],
      scopes: [scope(UserRole.SECRETARY, CLUB_A)],
    });
    expect(result.canUseDeskPaymentActions).toBe(false);
  });

  it("is offered to a club admin of the show's club", () => {
    const result = setup({
      roles: [UserRole.CLUB_ADMIN],
      scopes: [scope(UserRole.CLUB_ADMIN, CLUB_B)],
    });
    expect(result.canUseDeskPaymentActions).toBe(true);
  });

  it('is not offered to a club admin of another club', () => {
    const result = setup({
      roles: [UserRole.CLUB_ADMIN],
      scopes: [scope(UserRole.CLUB_ADMIN, CLUB_A)],
    });
    expect(result.canUseDeskPaymentActions).toBe(false);
  });

  it('is offered to a site admin', () => {
    expect(setup({ roles: [UserRole.SITE_ADMIN], scopes: [] }).canUseDeskPaymentActions).toBe(true);
  });

  it('is not offered to an exhibitor', () => {
    expect(setup({ roles: [UserRole.EXHIBITOR], scopes: [] }).canUseDeskPaymentActions).toBe(false);
  });
});
