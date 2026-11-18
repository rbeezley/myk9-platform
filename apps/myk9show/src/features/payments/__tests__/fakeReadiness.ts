import { useQuery } from '@tanstack/react-query';
import { vi } from 'vitest';

/**
 * MYK9-2166 test double for `useClubStripePaymentReadiness`: the real hook's shape (same key
 * layout, five-minute staleTime, a real React Query cache) over a controllable server answer, so a
 * test can warm the cache and then change what the server says.
 */
export const readinessServer = vi.fn<() => Promise<boolean>>();

export const readinessKey = (clubId: string) => ['club-stripe-payment-readiness', clubId, true];

export function useFakeReadiness(clubId: string | undefined) {
  return useQuery({
    queryKey: readinessKey(clubId ?? ''),
    queryFn: () => readinessServer(),
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
  });
}
