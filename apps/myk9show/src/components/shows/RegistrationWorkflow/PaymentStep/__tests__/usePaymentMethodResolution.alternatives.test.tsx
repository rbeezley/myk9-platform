import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';

/**
 * MYK9-2164: online card is the default, so a show can accept card only. The "card is not
 * available" message may name only the methods the selector actually offers.
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
  useClubStripePaymentReadiness: () => ({ isSuccess: true, data: false, fetchStatus: 'idle' }),
}));

import { usePaymentMethodResolution } from '../usePaymentMethodResolution';

// MYK9-2166: a current answer of "not ready" reads as paused, not as unavailable.
const FIRST = "Card payment is paused for this show. The club's bank account needs attention.";

function reasonFor(show: { acceptCheckPayments: boolean; acceptCashPayments: boolean }) {
  mocks.useAuthContext.mockReturnValue({ hasRole: () => false, userWithRoles: { scopes: [] } });
  mocks.useRegistrationPermissions.mockReturnValue({
    isSecretary: false,
    isClubAdmin: false,
    isSiteAdmin: false,
  });
  mocks.useShowStore.mockReturnValue({ shows: [{ id: 's1', clubId: 'c1', ...show }] });
  return renderHook(() => usePaymentMethodResolution('s1', 'credit_card')).result.current
    .cardCheckoutUnavailableReason;
}

describe('card-unavailable message names only the methods the show offers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('both check and cash', () => {
    expect(reasonFor({ acceptCheckPayments: true, acceptCashPayments: true })).toBe(
      `${FIRST} Choose check or cash instead.`
    );
  });

  it('check only', () => {
    expect(reasonFor({ acceptCheckPayments: true, acceptCashPayments: false })).toBe(
      `${FIRST} Choose check instead.`
    );
  });

  it('cash only', () => {
    expect(reasonFor({ acceptCheckPayments: false, acceptCashPayments: true })).toBe(
      `${FIRST} Choose cash instead.`
    );
  });

  it('neither: says payment is unavailable and to contact the secretary', () => {
    const reason = reasonFor({ acceptCheckPayments: false, acceptCashPayments: false });
    expect(reason).toBe(
      `${FIRST} Payment isn't available for this show right now. Please contact the show secretary.`
    );
    expect(reason).not.toMatch(/check|cash/i);
  });
});
