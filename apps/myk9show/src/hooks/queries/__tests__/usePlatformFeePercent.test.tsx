import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// maybeSingle is the resolved leaf of the supabase query chain.
const maybeSingle = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  },
}));

import { usePlatformFeePercent, usePlatformFeePercentQuery } from '../usePlatformFeePercent';

function createWrapper() {
  // networkMode mirrors the app's queryClient (queryClient.ts:61) so the paused
  // path is reachable in tests at all.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: 'online' } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('usePlatformFeePercent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the settings rate when present', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 10 }, error: null });
    const { result } = renderHook(() => usePlatformFeePercent(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current).toBe(10));
  });

  it('coerces a numeric string (PostgREST numeric) to a number', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: '12.50' }, error: null });
    const { result } = renderHook(() => usePlatformFeePercent(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current).toBe(12.5));
  });

  it('falls back to 7 when the row is missing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePlatformFeePercent(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current).toBe(7));
  });

  it('falls back to 7 when the value is out of the 0-20 bounds', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 99 }, error: null });
    const { result } = renderHook(() => usePlatformFeePercent(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current).toBe(7));
  });

  it('falls back to 7 on a query error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => usePlatformFeePercent(), { wrapper: createWrapper() });
    // Stays at the fallback; never resolves to anything else.
    await waitFor(() => expect(result.current).toBe(7));
  });
});

/**
 * The same reads through the query-state hook. Every case the display hook
 * collapses into 7 must be distinguishable here as `percent: null` — this is the
 * whole reason the second hook exists. The fee-authoring card gates an
 * overwrite of the live checkout rate on this distinction.
 */
describe('usePlatformFeePercentQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the rate it actually read', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 10 }, error: null });
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.percent).toBe(10);
  });

  it('reports unavailable — NOT 7, and NOT a rate — on a query error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    expect(result.current.percent).toBeNull();
  });

  it('DISCARDS a cached rate when a later refetch fails', async () => {
    // React Query keeps the last good `data` through a failed refetch, and
    // refetchOnWindowFocus is on for this query. This hook feeds a card that can
    // overwrite the live checkout rate, so returning the stale number alongside
    // isError would let an admin act on a value we no longer know to be true.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 4.5 }, error: null });
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper });
    await waitFor(() => expect(result.current.percent).toBe(4.5));

    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await queryClient.refetchQueries({ queryKey: ['platform-settings', 'fee-percent'] });

    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    // The 4.5 is still in the cache; the hook must not hand it out.
    expect(result.current.percent).toBeNull();
  });

  it('distinguishes an ABSENT row from a failed read', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.state).toBe('absent'));
    expect(result.current.percent).toBeNull();
  });

  it('treats an out-of-bounds stored value as absent, not as a rate', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 99 }, error: null });
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.state).toBe('absent'));
    expect(result.current.percent).toBeNull();
  });

  it('starts as loading with no rate, rather than asserting a default', async () => {
    maybeSingle.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper: createWrapper() });
    expect(result.current.state).toBe('loading');
    expect(result.current.percent).toBeNull();
  });

  it('reports a PAUSED (offline) query as unavailable, not as an absent rate', async () => {
    // networkMode:'online' pauses rather than runs. The query then reports
    // isLoading:false AND isError:false with data undefined — so any branch that
    // keys on those two booleans reads "never asked" as a definite answer. The
    // wrong answer here is 'absent', which would tell the operator no platform
    // fee is configured and send them to support over a working setting.
    onlineManager.setOnline(false);
    try {
      maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 4.5 }, error: null });
      const { result } = renderHook(() => usePlatformFeePercentQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.state).toBe('unavailable'));
      expect(result.current.state).not.toBe('absent');
      expect(result.current.percent).toBeNull();
      expect(maybeSingle).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
