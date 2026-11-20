import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const maybeSingle = vi.hoisted(() => vi.fn());
const calls = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const query = {
        select: (...args: unknown[]) => {
          calls.select(...args);
          return query;
        },
        update: (...args: unknown[]) => {
          calls.update(...args);
          return query;
        },
        eq: (...args: unknown[]) => {
          calls.eq(...args);
          return query;
        },
        limit: () => query,
        maybeSingle,
      };
      return query;
    },
  },
}));

import { usePayoutBrake, usePayoutBrakeOn, useSetPayoutBrake } from './usePayoutBrake';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const offRow = {
  payouts_require_approval: false,
  payouts_require_approval_changed_at: '2026-11-18T18:00:00Z',
  changer: { first_name: 'Pat', last_name: 'Operator' },
};

describe('usePayoutBrake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the brake with who switched it and when', async () => {
    maybeSingle.mockResolvedValue({ data: offRow, error: null });
    const { result } = renderHook(() => usePayoutBrake(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      on: false,
      changedAt: '2026-11-18T18:00:00Z',
      changedByName: 'Pat Operator',
    });
    expect(String(calls.select.mock.calls[0][0])).toContain(
      'people!platform_settings_payouts_require_approval_changed_by_fkey'
    );
  });

  it('reads an unreadable row as an error, never as brake off', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePayoutBrake(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('reads anything but an explicit false as on', async () => {
    maybeSingle.mockResolvedValue({
      data: { ...offRow, payouts_require_approval: null, changer: null },
      error: null,
    });
    const { result } = renderHook(() => usePayoutBrake(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.on).toBe(true);
    expect(result.current.data?.changedByName).toBeNull();
  });
});

describe('usePayoutBrakeOn (MYK9-2172)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads only the brake column, and reports off only for an explicit false', async () => {
    maybeSingle.mockResolvedValue({ data: { payouts_require_approval: false }, error: null });
    const { result } = renderHook(() => usePayoutBrakeOn(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current).toBe(false));
    expect(calls.select).toHaveBeenCalledWith('payouts_require_approval');
  });

  it('reads as on while loading and when the row cannot be read', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => usePayoutBrakeOn(), { wrapper: createWrapper() });
    expect(result.current).toBe(true);
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });

  it('reads as on and asks nothing when disabled', () => {
    const { result } = renderHook(() => usePayoutBrakeOn(false), { wrapper: createWrapper() });
    expect(result.current).toBe(true);
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});

describe('useSetPayoutBrake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes only the brake column to the singleton row', async () => {
    maybeSingle.mockResolvedValue({ data: offRow, error: null });
    const { result } = renderHook(() => useSetPayoutBrake(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync(false);
    });
    // The trigger stamps who and when; the client never writes the stamp.
    expect(calls.update).toHaveBeenCalledWith({ payouts_require_approval: false });
    expect(calls.eq).toHaveBeenCalledWith('id', true);
  });

  it('passes the step-up refusal through when the password is not confirmed', async () => {
    const refusal = { code: 'MKAUT', message: 'Recent sign-in required' };
    maybeSingle.mockResolvedValue({ data: null, error: refusal });
    const { result } = renderHook(() => useSetPayoutBrake(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync(false)).rejects.toBe(refusal);
    });
  });

  it('treats an update RLS filtered to no row as a refusal', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useSetPayoutBrake(), { wrapper: createWrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync(true)).rejects.toMatchObject({ code: '42501' });
    });
  });
});
