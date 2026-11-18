import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';

/**
 * MYK9-2166: `cardPaused` is true only for a current, successful "not ready" answer, only for
 * someone who would pay by card. An unread, errored or offline answer is never "paused".
 */
const mocks = vi.hoisted(() => ({
  useAuthContext: vi.fn(),
  useShowStore: vi.fn(),
  useRegistrationPermissions: vi.fn(),
  readiness: { value: {} as Record<string, unknown> },
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mocks.useAuthContext }));
vi.mock('@/store/showStore', () => ({ useShowStore: mocks.useShowStore }));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: mocks.useRegistrationPermissions,
}));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: () => mocks.readiness.value,
}));

import { usePaymentMethodResolution } from '../usePaymentMethodResolution';

function resolve(readiness: Record<string, unknown>, staff = false) {
  mocks.readiness.value = readiness;
  mocks.useAuthContext.mockReturnValue({ hasRole: () => false, userWithRoles: { scopes: [] } });
  mocks.useRegistrationPermissions.mockReturnValue({
    isSecretary: staff,
    isClubAdmin: false,
    isSiteAdmin: false,
  });
  mocks.useShowStore.mockReturnValue({
    shows: [{ id: 's1', clubId: 'c1', acceptCheckPayments: true, acceptCashPayments: true }],
  });
  return renderHook(() => usePaymentMethodResolution('s1', 'credit_card')).result.current;
}

describe('cardPaused', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is true for a current answer of not ready, and the payment step says paused', () => {
    const resolution = resolve({ isSuccess: true, data: false, fetchStatus: 'idle' });
    expect(resolution.cardPaused).toBe(true);
    expect(resolution.cardCheckoutUnavailableReason).toBe(
      "Card payment is paused for this show. The club's bank account needs attention. Choose check or cash instead."
    );
  });

  it.each([
    ['ready', { isSuccess: true, data: true, fetchStatus: 'idle' }],
    ['unread', { isSuccess: false, isPending: true, data: undefined, fetchStatus: 'fetching' }],
    [
      'errored with stale false',
      { isSuccess: false, isError: true, data: false, fetchStatus: 'idle' },
    ],
    ['offline with stale false', { isSuccess: true, data: false, fetchStatus: 'paused' }],
  ])('is false when %s', (_name, readiness) => {
    expect(resolve(readiness).cardPaused).toBe(false);
  });

  it('keeps the old sentence when the answer errored, because that is not "paused"', () => {
    const resolution = resolve({
      isSuccess: false,
      isError: true,
      isPending: false,
      isFetching: false,
      data: undefined,
      fetchStatus: 'idle',
    });
    expect(resolution.cardCheckoutUnavailableReason).toBe(
      "Online card payment isn't available for this club. Choose check or cash instead."
    );
  });

  it('is false for staff keying an entry, who do not pay by card', () => {
    expect(resolve({ isSuccess: true, data: false, fetchStatus: 'idle' }, true).cardPaused).toBe(
      false
    );
  });
});
