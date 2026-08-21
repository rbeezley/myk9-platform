import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    await waitFor(() => expect(result.current.percent).toBe(10));
    expect(result.current.isError).toBe(false);
  });

  it('reports null — NOT 7 — on a query error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.percent).toBeNull();
  });

  it('reports null when the row is missing', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.percent).toBeNull();
  });

  it('reports null when the stored value is out of bounds', async () => {
    maybeSingle.mockResolvedValue({ data: { platform_fee_percent: 99 }, error: null });
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.percent).toBeNull();
  });

  it('starts as loading with no rate, rather than asserting a default', async () => {
    // The failure this prevents: a card that renders "Current rate: 7%" during
    // the first paint, before any row has been read.
    maybeSingle.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePlatformFeePercentQuery(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.percent).toBeNull();
  });
});
