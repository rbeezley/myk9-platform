/**
 * MYK9-2149 (inform only): the money a form holds is said only from a read confirmed in this
 * visit to the Payment step: never while loading, refetching, paused (offline) or failed, and
 * never from cache alone.
 */
import React from 'react';
import { QueryClientProvider, onlineManager, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor, createTestQueryClient } from '@/test/utils/testUtils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDeskFormDueCents } from '@/features/registration/deskFormDue';
import { useDeskFormHeldCents } from '../useDeskFormHeldCents';

vi.mock('@/features/registration/deskFormDue', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/registration/deskFormDue')>()),
  fetchDeskFormDueCents: vi.fn(),
}));

function renderHeld(client: QueryClient = createTestQueryClient(), enabled = true) {
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
  afterEach(() => {
    act(() => onlineManager.setOnline(true));
  });

  it('says nothing while loading, then the money held from a negative due', async () => {
    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(-4000);
    const { result } = renderHeld();

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(4000));
    expect(fetchDeskFormDueCents).toHaveBeenCalledWith('show-1', 'owner-1');
  });

  it('says nothing when the form holds nothing', async () => {
    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(3000);
    const { result } = renderHeld();

    await waitFor(() => expect(fetchDeskFormDueCents).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('says nothing when the read fails', async () => {
    vi.mocked(fetchDeskFormDueCents).mockRejectedValue(new Error('server'));
    const { result } = renderHeld();

    await waitFor(() => expect(fetchDeskFormDueCents).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('reads again when the step opens again, saying nothing from cache meanwhile', async () => {
    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(-4000);
    const client = createTestQueryClient();
    const first = renderHeld(client);
    await waitFor(() => expect(first.result.current).toBe(4000));
    first.unmount();

    let answer: (due: number) => void = () => {};
    vi.mocked(fetchDeskFormDueCents).mockReturnValue(
      new Promise<number>(resolve => {
        answer = resolve;
      })
    );
    const second = renderHeld(client);

    expect(second.result.current).toBeNull();
    await act(async () => answer(0));
    await waitFor(() => expect(fetchDeskFormDueCents).toHaveBeenCalledTimes(2));
    expect(second.result.current).toBeNull();
  });

  it('says nothing from a cached read while offline (the read is paused)', async () => {
    vi.mocked(fetchDeskFormDueCents).mockResolvedValue(-4000);
    const client = createTestQueryClient();
    const first = renderHeld(client);
    await waitFor(() => expect(first.result.current).toBe(4000));
    first.unmount();

    act(() => onlineManager.setOnline(false));
    const second = renderHeld(client);

    expect(second.result.current).toBeNull();
    expect(fetchDeskFormDueCents).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when disabled', () => {
    const { result } = renderHeld(createTestQueryClient(), false);

    expect(result.current).toBeNull();
    expect(fetchDeskFormDueCents).not.toHaveBeenCalled();
  });
});
