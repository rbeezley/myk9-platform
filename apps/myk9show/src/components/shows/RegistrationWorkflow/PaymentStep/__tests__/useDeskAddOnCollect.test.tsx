/**
 * MYK9-2149: the desk quote is asked again when the secretary toggles the junior handler
 * fee, so the amount on screen is always the one the server prices.
 */
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, createTestQueryClient } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDeskAddOnQuote } from '@/features/registration/deskAddOnCollect';
import { useDeskAddOnCollect } from '../useDeskAddOnCollect';

vi.mock('@/features/registration/deskAddOnCollect', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/registration/deskAddOnCollect')>()),
  fetchDeskAddOnQuote: vi.fn(),
}));

describe('useDeskAddOnCollect (MYK9-2149)', () => {
  beforeEach(() => {
    vi.mocked(fetchDeskAddOnQuote).mockReset();
  });

  it('re-quotes when the junior fee is toggled, and shows the junior price', async () => {
    vi.mocked(fetchDeskAddOnQuote).mockImplementation(async (_show, _owner, _classes, junior) =>
      junior
        ? { collectCents: 1000, heldCents: 1000, addonCents: 2000 }
        : { collectCents: 2000, heldCents: 1000, addonCents: 3000 }
    );
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ junior }: { junior: boolean }) =>
        useDeskAddOnCollect({
          enabled: true,
          showId: 'show-1',
          handlerId: 'owner-1',
          classIds: ['class-1'],
          juniorOverride: junior,
        }),
      { wrapper, initialProps: { junior: false } }
    );

    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'partial', collectCents: 2000, heldCents: 1000 })
    );

    rerender({ junior: true });

    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'partial', collectCents: 1000, heldCents: 1000 })
    );
    expect(fetchDeskAddOnQuote).toHaveBeenLastCalledWith('show-1', 'owner-1', ['class-1'], true);
  });

  it('asks nothing and stays unchanged when disabled', () => {
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useDeskAddOnCollect({
          enabled: false,
          showId: 'show-1',
          handlerId: 'owner-1',
          classIds: ['class-1'],
          juniorOverride: false,
        }),
      { wrapper }
    );

    expect(result.current).toEqual({ kind: 'unchanged' });
    expect(fetchDeskAddOnQuote).not.toHaveBeenCalled();
  });
});
