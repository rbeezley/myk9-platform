import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@/test/utils/testUtils';

import { useDeliveredPackets } from './useDeliveredPackets';

const prints = vi.hoisted(() => ({ data: [], isError: false, syncFailed: false }));
vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => prints,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function clientReturning(result: { data: unknown[] | null; error: unknown }) {
  const filter = {
    eq: () => filter,
    is: () => filter,
    order: () => Promise.resolve(result),
  };
  return { from: () => ({ select: () => filter }) } as never;
}

let deviceOnline = true;

describe('useDeliveredPackets listState', () => {
  beforeEach(() => {
    deviceOnline = true;
    prints.syncFailed = false;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => deviceOnline);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    // React Query's online manager also hears the 'offline' event and would keep later queries
    // paused.
    onlineManager.setOnline(true);
  });

  it('keeps an already-read list ready offline, so Mark printed stays usable', async () => {
    const { result, rerender } = renderHook(
      () => useDeliveredPackets('show-1', null, clientReturning({ data: [], error: null })),
      { wrapper }
    );
    await waitFor(() => expect(result.current.listState).toBe('ready'));
    deviceOnline = false;
    prints.syncFailed = true;
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    rerender();
    expect(result.current.offline).toBe(true);
    expect(result.current.listState).toBe('ready');
  });

  it('reads as offline, not as an error, when the device is offline and the print sync failed', () => {
    deviceOnline = false;
    prints.syncFailed = true;
    const { result } = renderHook(
      () => useDeliveredPackets('show-1', null, clientReturning({ data: [], error: null })),
      { wrapper }
    );
    expect(result.current.listState).toBe('offline');
  });

  it('reads as an error when online and the print sync failed', async () => {
    prints.syncFailed = true;
    const { result } = renderHook(
      () => useDeliveredPackets('show-1', null, clientReturning({ data: [], error: null })),
      { wrapper }
    );
    await waitFor(() => expect(result.current.listState).toBe('error'));
  });

  it('is ready once the sent copies are read', async () => {
    const { result } = renderHook(
      () => useDeliveredPackets('show-1', null, clientReturning({ data: [], error: null })),
      { wrapper }
    );
    expect(result.current.listState).toBe('pending');
    await waitFor(() => expect(result.current.listState).toBe('ready'));
  });
});
