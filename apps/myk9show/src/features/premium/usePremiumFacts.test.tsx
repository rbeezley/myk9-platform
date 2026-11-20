import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPremiumFactsMock = vi.hoisted(() => vi.fn());

vi.mock('./fetchPremium', () => ({ fetchPremiumFacts: fetchPremiumFactsMock }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => true }));

import { createAppQueryClient } from '@/lib/queryClient';
import { usePremiumFacts } from './usePremiumFacts';

const SHOW_ID = '11111111-2222-4333-8444-555555555555';

// MYK9-2307: a secretary leaves Premium, changes a venue policy and returns. The new visit's key
// still names the same show, so the app's entity-scoped placeholder rule keeps the previous
// visit's facts on screen with isLoading false unless the hook opts out.
describe('usePremiumFacts across visits (production query client)', () => {
  beforeEach(() => {
    fetchPremiumFactsMock.mockReset();
  });

  it('does not hand the previous visit facts back as placeholder data on return', async () => {
    const client = createAppQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    fetchPremiumFactsMock.mockResolvedValueOnce({ venue: 'A' });

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePremiumFacts(SHOW_ID, enabled),
      { wrapper, initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.data).toEqual({ venue: 'A' }));

    // Leave Premium (the tab stays mounted), change a fact, return.
    rerender({ enabled: false });
    fetchPremiumFactsMock.mockImplementationOnce(() => new Promise(() => {}));
    rerender({ enabled: true });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('settles on the fresh facts of the second visit', async () => {
    const client = createAppQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    fetchPremiumFactsMock.mockResolvedValueOnce({ venue: 'A' });
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePremiumFacts(SHOW_ID, enabled),
      { wrapper, initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.data).toEqual({ venue: 'A' }));

    rerender({ enabled: false });
    fetchPremiumFactsMock.mockResolvedValueOnce({ venue: 'B' });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toEqual({ venue: 'B' }));
    expect(result.current.isLoading).toBe(false);
  });
});
