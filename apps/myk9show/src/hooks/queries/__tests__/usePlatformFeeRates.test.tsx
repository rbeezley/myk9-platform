import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// maybeSingle is the resolved leaf of the supabase query chain.
const maybeSingle = vi.fn();
// `select` captures its argument. A mock that swallowed it would let the query
// stop asking for the flat/floor columns and still pass every fixture-driven
// test — the preview would then quietly read 0/0 while the server charges the
// flat component. That is a SILENT preview-vs-Stripe mismatch, not a checkout
// loop: stripe-checkout's drift healer only compares per-item entry fees, and
// the server overwrites the cart's fee columns rather than reading them back
// (MYK9-197 review, S3). Nothing in the system notices, which is why the mock
// has to.
const select = vi.fn((_columns: string) => ({ eq: () => ({ maybeSingle }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select }),
  },
}));

import { usePlatformFeeRates, usePlatformFeeRatesQuery } from '../usePlatformFeeRates';

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

describe('usePlatformFeeRates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the settings rate when present', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 10 }, error: null });
    const { result } = renderHook(() => usePlatformFeeRates(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.percent).toBe(10));
  });

  it('coerces a numeric string (PostgREST numeric) to a number', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: '12.50' }, error: null });
    const { result } = renderHook(() => usePlatformFeeRates(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.percent).toBe(12.5));
  });

  it('falls back to 7 when the row is missing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePlatformFeeRates(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.percent).toBe(7));
  });

  it('falls back to 7 when the value is out of the 0-20 bounds', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 99 }, error: null });
    const { result } = renderHook(() => usePlatformFeeRates(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.percent).toBe(7));
  });

  it('falls back to 7 on a query error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => usePlatformFeeRates(), { wrapper: createWrapper() });
    // Stays at the fallback; never resolves to anything else.
    await waitFor(() => expect(result.current.percent).toBe(7));
  });
});

/**
 * The same reads through the query-state hook. Every case the display hook
 * collapses into 7 must be distinguishable here as `percent: null` — this is the
 * whole reason the second hook exists. The fee-authoring card gates an
 * overwrite of the live checkout rate on this distinction.
 */
describe('usePlatformFeeRatesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the rate it actually read', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 10 }, error: null });
    const { result } = renderHook(() => usePlatformFeeRatesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.rates?.percent).toBe(10);
  });

  it('reports unavailable — NOT 7, and NOT a rate — on a query error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => usePlatformFeeRatesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    expect(result.current.rates).toBeNull();
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
    const { result } = renderHook(() => usePlatformFeeRatesQuery(), { wrapper });
    await waitFor(() => expect(result.current.rates?.percent).toBe(4.5));

    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await queryClient.refetchQueries({ queryKey: ['platform-settings', 'fee-rates'] });

    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    // The 4.5 is still in the cache; the hook must not hand it out.
    expect(result.current.rates).toBeNull();
  });

  it('distinguishes an ABSENT row from a failed read', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePlatformFeeRatesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.state).toBe('absent'));
    expect(result.current.rates).toBeNull();
  });

  it('treats an out-of-bounds stored value as absent, not as a rate', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 99 }, error: null });
    const { result } = renderHook(() => usePlatformFeeRatesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.state).toBe('absent'));
    expect(result.current.rates).toBeNull();
  });

  it('starts as loading with no rate, rather than asserting a default', async () => {
    maybeSingle.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePlatformFeeRatesQuery(), { wrapper: createWrapper() });
    expect(result.current.state).toBe('loading');
    expect(result.current.rates).toBeNull();
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
      const { result } = renderHook(() => usePlatformFeeRatesQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.state).toBe('unavailable'));
      expect(result.current.state).not.toBe('absent');
      expect(result.current.rates).toBeNull();
      expect(maybeSingle).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('does not re-enable a CACHED rate when a later fetch pauses offline', async () => {
    // The case a `data === undefined` paused-guard misses. refetchOnMount is
    // 'always', so remounting the page while offline pauses the query with the
    // previous rate still in the cache. Reporting 'ready' there would hand the
    // editor a stale rate to overwrite the live checkout value with — the same
    // hazard as the failed-refetch case, arriving by a different route.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, networkMode: 'online' } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 4.5 }, error: null });
    const first = renderHook(() => usePlatformFeeRatesQuery(), { wrapper });
    await waitFor(() => expect(first.result.current.state).toBe('ready'));
    first.unmount();

    onlineManager.setOnline(false);
    try {
      const { result } = renderHook(() => usePlatformFeeRatesQuery(), { wrapper });
      await waitFor(() => expect(result.current.state).toBe('unavailable'));
      expect(result.current.rates).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });
});

/**
 * The flat per-checkout component and the floor (MYK9-197). Both default to 0,
 * so the interesting cases are: a row that carries them, a row that predates
 * them, and a nonsense stored value — which must land on the SAME number the
 * server lands on rather than on a different one. A preview that disagrees with
 * the charge by a cent is a silent mismatch between the total the exhibitor
 * reviewed and the total Stripe asks for — nothing detects it (MYK9-197
 * review, S3).
 */
describe('usePlatformFeeRates flat component and floor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ASKS for all three columns', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 7 }, error: null });
    const { result } = renderHook(() => usePlatformFeeRates(), { wrapper: createWrapper() });
    await waitFor(() => expect(select).toHaveBeenCalled());
    const selected = String(select.mock.calls[0][0]);
    expect(selected).toContain('platform_fee_percent');
    expect(selected).toContain('platform_fee_flat_cents');
    expect(selected).toContain('platform_fee_min_cents');
    expect(result.current).toBeDefined();
  });

  it('reads the flat component and the floor alongside the percent', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        platform_fee_percent: '7.00',
        platform_fee_flat_cents: 30,
        platform_fee_min_cents: 100,
      },
      error: null,
    });
    const { result } = renderHook(() => usePlatformFeeRates(), { wrapper: createWrapper() });
    await waitFor(() =>
      expect(result.current).toEqual({ percent: 7, flatCents: 30, minCents: 100 })
    );
  });

  it('treats a row without the columns as flat 0 / floor 0, i.e. percentage-only', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 7 }, error: null });
    const { result } = renderHook(() => usePlatformFeeRates(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current).toEqual({ percent: 7, flatCents: 0, minCents: 0 }));
  });

  it('normalizes an out-of-range stored flat/floor exactly as the server does', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        platform_fee_percent: 7,
        platform_fee_flat_cents: 99999,
        platform_fee_min_cents: -5,
      },
      error: null,
    });
    const { result } = renderHook(() => usePlatformFeeRates(), { wrapper: createWrapper() });
    await waitFor(() =>
      expect(result.current).toEqual({ percent: 7, flatCents: 500, minCents: 0 })
    );
  });

  it('exposes them to the editing surface too', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        platform_fee_percent: 7,
        platform_fee_flat_cents: 30,
        platform_fee_min_cents: 100,
      },
      error: null,
    });
    const { result } = renderHook(() => usePlatformFeeRatesQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.rates).toEqual({ percent: 7, flatCents: 30, minCents: 100 });
  });
});
