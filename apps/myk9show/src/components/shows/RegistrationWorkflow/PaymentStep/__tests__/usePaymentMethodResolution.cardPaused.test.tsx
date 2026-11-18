import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';
import { readinessKey, readinessServer } from '@/features/payments/__tests__/fakeReadiness';

/**
 * MYK9-2166: `cardPaused` is true only for an answer fetched since this surface opened, only for
 * someone who would pay by card. A cached, unread, errored or offline answer is never "paused".
 */
const mocks = vi.hoisted(() => ({
  useAuthContext: vi.fn(),
  useShowStore: vi.fn(),
  useRegistrationPermissions: vi.fn(),
  online: { value: true },
}));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mocks.useAuthContext }));
vi.mock('@/store/showStore', () => ({ useShowStore: mocks.useShowStore }));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: mocks.useRegistrationPermissions,
}));
vi.mock('@/features/payments/useClubStripeAccount', async () => {
  const fake = await import('@/features/payments/__tests__/fakeReadiness');
  return { useClubStripePaymentReadiness: fake.fakeUseClubStripePaymentReadiness };
});

vi.mock('@/hooks/guestServerRead', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/guestServerRead')>()),
  useQueryOnlineStatus: () => mocks.online.value,
}));

import { usePaymentMethodResolution } from '../usePaymentMethodResolution';

function resolve(cached: boolean | undefined, staff = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached !== undefined) client.setQueryData(readinessKey('c1'), cached);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  mocks.useAuthContext.mockReturnValue({ hasRole: () => false, userWithRoles: { scopes: [] } });
  mocks.useRegistrationPermissions.mockReturnValue({
    isSecretary: staff,
    isClubAdmin: false,
    isSiteAdmin: false,
  });
  mocks.useShowStore.mockReturnValue({
    shows: [{ id: 's1', clubId: 'c1', acceptCheckPayments: true, acceptCashPayments: true }],
  });
  return renderHook(() => usePaymentMethodResolution('s1', 'credit_card'), { wrapper });
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('cardPaused', () => {
  beforeEach(() => {
    readinessServer.mockReset();
    mocks.online.value = true;
  });

  it('warm cache true, server now false: not paused at first, paused once rechecked', async () => {
    readinessServer.mockResolvedValue(false);
    const { result } = resolve(true);
    expect(result.current.cardPaused).toBe(false);
    await waitFor(() => expect(result.current.cardPaused).toBe(true));
    expect(result.current.cardCheckoutUnavailableReason).toBe(
      "Card payment is paused for this show. The club's bank account needs attention. Choose check or cash instead."
    );
    expect(readinessServer).toHaveBeenCalledTimes(1);
  });

  it('warm cache false, server now true: never paused, card is offered', async () => {
    readinessServer.mockResolvedValue(true);
    const { result } = resolve(false);
    expect(result.current.cardPaused).toBe(false);
    await waitFor(() => expect(result.current.cardCheckoutAvailable).toBe(true));
    expect(result.current.cardPaused).toBe(false);
  });

  it('refetch fails with a warm false: not paused', async () => {
    readinessServer.mockRejectedValue(new Error('network'));
    const { result } = resolve(false);
    await waitFor(() => expect(readinessServer).toHaveBeenCalledTimes(1));
    await settle();
    expect(result.current.cardPaused).toBe(false);
  });

  it('never says paused offline, even with a warm false', async () => {
    mocks.online.value = false;
    const { result } = resolve(false);
    await settle();
    expect(readinessServer).not.toHaveBeenCalled();
    expect(result.current.cardPaused).toBe(false);
  });

  it('is false for staff keying an entry, who do not pay by card', async () => {
    readinessServer.mockResolvedValue(false);
    const { result } = resolve(true, true);
    await waitFor(() => expect(readinessServer).toHaveBeenCalledTimes(1));
    await settle();
    expect(result.current.cardPaused).toBe(false);
  });
});
