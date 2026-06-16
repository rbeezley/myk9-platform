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

  it('writes the new percent + updated_by to the singleton row', async () => {
    const { result } = renderHook(() => useUpdatePlatformFee(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync(10);
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ platform_fee_percent: 10, updated_by: 'person-1' })
    );
    expect(eq).toHaveBeenCalledWith('id', true);
  });

  it('rejects an out-of-bounds percent without touching the DB', async () => {
    const { result } = renderHook(() => useUpdatePlatformFee(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync(99)).rejects.toThrow(/between 0 and 20/);
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('surfaces a DB error', async () => {
    eq.mockResolvedValue({ error: { message: 'rls denied' } });
    const { result } = renderHook(() => useUpdatePlatformFee(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync(8)).rejects.toMatchObject({ message: 'rls denied' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
