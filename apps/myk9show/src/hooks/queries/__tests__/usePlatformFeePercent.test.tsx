import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock the untyped-from escape hatch (platform_settings isn't in generated types
// until the migration is pushed + regenerated). maybeSingle is the resolved leaf.
const maybeSingle = vi.fn();
vi.mock('@/services/database/_shared/untyped-from', () => ({
  untypedFrom: () => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
  }),
}));

import { usePlatformFeePercent } from '../usePlatformFeePercent';

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
