import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useEntitlement, ENTITLEMENT_QUERY_KEY } from './useEntitlement';
import type { OwnEntitlementContext } from '@/services/database/entitlement/types';

const mockFetchOwnEntitlementContext = vi.fn<() => Promise<OwnEntitlementContext>>();

vi.mock('@/services/database/entitlement/context', () => ({
  fetchOwnEntitlementContext: () => mockFetchOwnEntitlementContext(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

function activePaidContext(overrides: Partial<OwnEntitlementContext> = {}): OwnEntitlementContext {
  return {
    evaluated_at: new Date().toISOString(),
    paid_tier: 'premium',
    paid_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min out
    grant_type: null,
    grant_status: null,
    grant_starts_at: null,
    grant_ends_at: null,
    scored_show_count: 5,
    ...overrides,
  };
}

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useEntitlement(), { wrapper }) };
}

describe('useEntitlement', () => {
  beforeEach(() => {
    mockFetchOwnEntitlementContext.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loading state: neutral (no effective value, no premature lock/unlock)', () => {
    mockFetchOwnEntitlementContext.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderWithClient();

    expect(result.current.isLoading).toBe(true);
    expect(result.current.effective).toBeNull();
    expect(result.current.canAuthorizePremium).toBe(false);
  });

  it('successful load: trusted, and authorizes premium for an active paid source', async () => {
    mockFetchOwnEntitlementContext.mockResolvedValue(activePaidContext());

    const { result } = renderWithClient();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.effective?.tier).toBe('premium');
    expect(result.current.isTrusted).toBe(true);
    expect(result.current.canAuthorizePremium).toBe(true);
  });

  it('no trusted result exists: query errors before any successful load -> fail closed', async () => {
    mockFetchOwnEntitlementContext.mockRejectedValue(new Error('network down'));

    const { result } = renderWithClient();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.effective).toBeNull();
    expect(result.current.isTrusted).toBe(false);
    expect(result.current.canAuthorizePremium).toBe(false);
  });

  it('refresh failure after trustedUntil: display data may remain, but authorization fails closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // trustedUntil is capped by the 5-minute maxStaleMs ceiling (source end is
    // farther out), so advancing 5 minutes crosses the trust boundary without
    // needing to touch the source's own end date.
    mockFetchOwnEntitlementContext.mockResolvedValueOnce(
      activePaidContext({ paid_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    );

    const { result } = renderWithClient();

    await vi.waitFor(() => expect(result.current.isTrusted).toBe(true));
    expect(result.current.canAuthorizePremium).toBe(true);
    const displayedTierWhileTrusted = result.current.effective?.tier;
    expect(displayedTierWhileTrusted).toBe('premium');

    // Next refresh (triggered by the scheduled boundary invalidation) fails.
    mockFetchOwnEntitlementContext.mockRejectedValue(new Error('refresh failed'));

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);

    await vi.waitFor(() => expect(result.current.isTrusted).toBe(false));
    expect(result.current.canAuthorizePremium).toBe(false);
    // Display data is not erased by the failed refresh.
    expect(result.current.effective?.tier).toBe('premium');
  });

  it('scheduled boundary invalidation: refetches again once trustedUntil passes, even on success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetchOwnEntitlementContext.mockResolvedValue(
      activePaidContext({ paid_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    );

    renderWithClient();

    await vi.waitFor(() => expect(mockFetchOwnEntitlementContext).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);

    await vi.waitFor(() => expect(mockFetchOwnEntitlementContext).toHaveBeenCalledTimes(2));
  });

  it('boundary invalidation fires at most once when refetch keeps failing (no unbounded refetch storm)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetchOwnEntitlementContext.mockResolvedValueOnce(
      activePaidContext({ paid_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    );

    const { result } = renderWithClient();

    await vi.waitFor(() => expect(result.current.isTrusted).toBe(true));
    expect(mockFetchOwnEntitlementContext).toHaveBeenCalledTimes(1);

    mockFetchOwnEntitlementContext.mockRejectedValue(new Error('still failing'));

    // Cross the trustedUntil boundary (bounded by the 5-minute maxStaleMs
    // ceiling) and let several extra macrotasks elapse — if invalidation
    // fired more than once per boundary this would show up as call count > 2.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    await vi.waitFor(() => expect(result.current.isTrusted).toBe(false));
    expect(mockFetchOwnEntitlementContext).toHaveBeenCalledTimes(2);
    expect(result.current.canAuthorizePremium).toBe(false);
    // Display data stays put through the failed refresh.
    expect(result.current.effective?.tier).toBe('premium');
  });

  it('uses a single, stable query key across renders', () => {
    expect(ENTITLEMENT_QUERY_KEY).toEqual(['entitlement', 'own']);
  });
});
