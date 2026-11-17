/**
 * MYK9-2149: the money a form holds is the server's figure, and the read fails closed.
 */
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, createTestQueryClient } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDeskFormDueCents } from '@/features/registration/deskFormDue';
import { useDeskFormHeldCents } from '../useDeskFormHeldCents';

vi.mock('@/features/registration/deskFormDue', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/registration/deskFormDue')>()),
  fetchDeskFormDueCents: vi.fn(),
}));

function renderHeld(enabled = true) {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useDeskFormHeldCents({ enabled, showId: 'show-1', handlerId: 'owner-1' }),
    { wrapper }
  );
}

describe('useDeskFormHeldCents (MYK9-2149)', () => {
  beforeEach(() => {
    vi.mocked(fetchDeskFormDueCents).mockReset();
  });

  it('reads the money held from a negative due', async () => {
    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(-4000);
    const { result } = renderHeld();

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(4000));
    expect(fetchDeskFormDueCents).toHaveBeenCalledWith('show-1', 'owner-1');
  });

  it('is null when the form holds nothing', async () => {
    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(3000);
    const { result } = renderHeld();

    await waitFor(() => expect(fetchDeskFormDueCents).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('fails closed: null when the read fails', async () => {
    vi.mocked(fetchDeskFormDueCents).mockRejectedValue(new Error('offline'));
    const { result } = renderHeld();

    await waitFor(() => expect(fetchDeskFormDueCents).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('asks nothing when disabled', () => {
    const { result } = renderHeld(false);

    expect(result.current).toBeNull();
    expect(fetchDeskFormDueCents).not.toHaveBeenCalled();
  });
});
