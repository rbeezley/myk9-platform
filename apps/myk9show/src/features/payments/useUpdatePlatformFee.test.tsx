import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ update }) },
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: { databaseUserId: 'person-1' } }),
}));

import { useUpdatePlatformFee } from './useUpdatePlatformFee';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useUpdatePlatformFee', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eq.mockResolvedValue({ error: null });
  });

  it('writes all three fee components + updated_by to the singleton row', async () => {
    const { result } = renderHook(() => useUpdatePlatformFee(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ percent: 10, flatCents: 30, minCents: 100 });
    });
    // All three move TOGETHER: the fee is one expression, so writing the
    // percent without the flat component would leave the row describing a fee
    // nobody chose.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        platform_fee_percent: 10,
        platform_fee_flat_cents: 30,
        platform_fee_min_cents: 100,
        updated_by: 'person-1',
      })
    );
    expect(eq).toHaveBeenCalledWith('id', true);
  });

  it('rejects an out-of-bounds percent without touching the DB', async () => {
    const { result } = renderHook(() => useUpdatePlatformFee(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ percent: 99, flatCents: 0, minCents: 0 })
      ).rejects.toThrow(/between 0 and 20/);
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an out-of-bounds or fractional flat component without touching the DB', async () => {
    const { result } = renderHook(() => useUpdatePlatformFee(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ percent: 7, flatCents: 501, minCents: 0 })
      ).rejects.toThrow(/whole number of cents between 0 and 500/);
      await expect(
        result.current.mutateAsync({ percent: 7, flatCents: 30.5, minCents: 0 })
      ).rejects.toThrow(/whole number of cents between 0 and 500/);
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an out-of-bounds or fractional floor without touching the DB', async () => {
    const { result } = renderHook(() => useUpdatePlatformFee(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ percent: 7, flatCents: 0, minCents: 2001 })
      ).rejects.toThrow(/whole number of cents between 0 and 2000/);
      await expect(
        result.current.mutateAsync({ percent: 7, flatCents: 0, minCents: 100.5 })
      ).rejects.toThrow(/whole number of cents between 0 and 2000/);
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('accepts the all-zero flat/floor configuration that ships by default', async () => {
    const { result } = renderHook(() => useUpdatePlatformFee(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ percent: 7, flatCents: 0, minCents: 0 });
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ platform_fee_flat_cents: 0, platform_fee_min_cents: 0 })
    );
  });

  it('surfaces a DB error', async () => {
    eq.mockResolvedValue({ error: { message: 'rls denied' } });
    const { result } = renderHook(() => useUpdatePlatformFee(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ percent: 8, flatCents: 0, minCents: 0 })
      ).rejects.toMatchObject({ message: 'rls denied' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
