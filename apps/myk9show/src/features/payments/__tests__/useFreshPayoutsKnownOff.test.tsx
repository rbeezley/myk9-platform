import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';
import { readinessKey, readinessServer } from './fakeReadiness';

const online = vi.hoisted(() => ({ value: true }));
vi.mock('../useClubStripeAccount', async () => {
  const fake = await import('./fakeReadiness');
  return {
    useClubStripePaymentReadiness: fake.useFakeReadiness,
    useStripeLivemode: () => ({ data: true }),
  };
});
vi.mock('@/hooks/guestServerRead', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/guestServerRead')>()),
  useQueryOnlineStatus: () => online.value,
}));

import { useFreshPayoutsKnownOff } from '../useFreshPayoutsKnownOff';

function warm(cached: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(readinessKey('c1'), cached);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useFreshPayoutsKnownOff('c1'), { wrapper });
}

describe('useFreshPayoutsKnownOff (warm cache)', () => {
  beforeEach(() => {
    readinessServer.mockReset();
    online.value = true;
  });

  it('cached true, server now false: unknown at first, then known off after the refetch', async () => {
    readinessServer.mockResolvedValue(false);
    const { result } = warm(true);
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(readinessServer).toHaveBeenCalledTimes(1);
  });

  it('cached false, server now true: never shown, even on the first render', async () => {
    readinessServer.mockResolvedValue(true);
    const { result } = warm(false);
    expect(result.current).toBe(false);
    await waitFor(() => expect(readinessServer).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result.current).toBe(false);
  });

  it('refetch fails: shows nothing, even with a cached false', async () => {
    readinessServer.mockRejectedValue(new Error('network'));
    const { result } = warm(false);
    await waitFor(() => expect(readinessServer).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result.current).toBe(false);
  });

  it('refetches once per mount, not per render', async () => {
    readinessServer.mockResolvedValue(false);
    const { result, rerender } = warm(true);
    await waitFor(() => expect(result.current).toBe(true));
    rerender();
    rerender();
    expect(readinessServer).toHaveBeenCalledTimes(1);
  });

  it('offline: no refetch and nothing shown', async () => {
    online.value = false;
    const { result } = warm(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(readinessServer).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });
});
