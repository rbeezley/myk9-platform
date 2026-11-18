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
  online: { value: true },
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mocks.useAuthContext }));
vi.mock('@/store/showStore', () => ({ useShowStore: mocks.useShowStore }));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: mocks.useRegistrationPermissions,
}));
vi.mock('@/features/payments/useClubStripeAccount', () => ({
  useClubStripePaymentReadiness: () => mocks.readiness.value,
}));

vi.mock('@/hooks/guestServerRead', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/guestServerRead')>()),
  useQueryOnlineStatus: () => mocks.online.value,
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
    mocks.online.value = true;
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

  it('says checking, never paused, while the answer is being refetched', () => {
    const resolution = resolve({
      isSuccess: true,
      isPending: false,
      isFetching: true,
      data: false,
      fetchStatus: 'fetching',
    });
    expect(resolution.cardPaused).toBe(false);
    expect(resolution.cardCheckoutUnavailableReason).toBe(
      'Checking online payment availability for this club.'
    );
  });

  it('never says paused offline, even with a cached false and nothing fetching', () => {
    mocks.online.value = false;
    const resolution = resolve({
      isSuccess: true,
      isPending: false,
      isFetching: false,
      data: false,
      fetchStatus: 'idle',
    });
    expect(resolution.cardPaused).toBe(false);
    expect(resolution.cardCheckoutUnavailableReason).toBe(
      "Online card payment isn't available for this club. Choose check or cash instead."
    );
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
