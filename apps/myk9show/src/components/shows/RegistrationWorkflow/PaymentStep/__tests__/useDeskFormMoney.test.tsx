/**
 * MYK9-2149: the form's money is the server's figure, read fresh each time the Payment step
 * opens; checking and failure are their own states, never "holds nothing".
 */
import React from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor, createTestQueryClient } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDeskFormDueCents } from '@/features/registration/deskFormDue';
import { useDeskFormMoney } from '../useDeskFormMoney';

vi.mock('@/features/registration/deskFormDue', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/registration/deskFormDue')>()),
  fetchDeskFormDueCents: vi.fn(),
}));

function renderMoney(client: QueryClient = createTestQueryClient(), enabled = true) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useDeskFormMoney({ enabled, showId: 'show-1', handlerId: 'owner-1' }), {
    wrapper,
  });
}

describe('useDeskFormMoney (MYK9-2149)', () => {
  beforeEach(() => {
    vi.mocked(fetchDeskFormDueCents).mockReset();
  });

  it('is checking, then holds the money from a negative due', async () => {
    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(-4000);
    const { result } = renderMoney();

    expect(result.current).toEqual({ status: 'checking' });
    await waitFor(() => expect(result.current).toEqual({ status: 'holds', heldCents: 4000 }));
    expect(fetchDeskFormDueCents).toHaveBeenCalledWith('show-1', 'owner-1');
  });

  it('holds nothing when the form owes or has no money', async () => {
    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(3000);
    const { result } = renderMoney();

    await waitFor(() => expect(result.current).toEqual({ status: 'none' }));
  });

  it('is failed, not "none", when the read fails', async () => {
    vi.mocked(fetchDeskFormDueCents).mockRejectedValue(new Error('offline'));
    const { result } = renderMoney();

    await waitFor(() => expect(result.current).toEqual({ status: 'failed' }));
  });

  it('reads again each time the Payment step opens, checking until it returns', async () => {
    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(-4000);
    const client = createTestQueryClient();
    const first = renderMoney(client);
    await waitFor(() => expect(first.result.current.status).toBe('holds'));
    first.unmount();

    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(0);
    const second = renderMoney(client);

    expect(second.result.current).toEqual({ status: 'checking' });
    await waitFor(() => expect(second.result.current).toEqual({ status: 'none' }));
    expect(fetchDeskFormDueCents).toHaveBeenCalledTimes(2);
  });

  it('asks nothing when disabled', () => {
    const { result } = renderMoney(createTestQueryClient(), false);

    expect(result.current).toEqual({ status: 'unknown' });
    expect(fetchDeskFormDueCents).not.toHaveBeenCalled();
  });
});
