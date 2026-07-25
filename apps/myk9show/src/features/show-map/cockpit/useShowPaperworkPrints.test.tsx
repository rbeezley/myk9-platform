import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShowPaperworkPrints } from './useShowPaperworkPrints';
import type { ShowChangeListener } from '@/features/show-live-sync/showChangeSignal';

const h = vi.hoisted(() => ({
  sync: vi.fn(async () => ({ success: true })),
  getByShow: vi.fn(async () => []),
  subscribe: vi.fn(() => vi.fn()),
  subscribeToShowChanges: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedPaperworkPrintsTable: {
    sync: h.sync,
    getByShow: h.getByShow,
    subscribe: h.subscribe,
  },
}));

vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: h.subscribeToShowChanges,
}));

describe('useShowPaperworkPrints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.subscribe.mockReturnValue(vi.fn());
    h.subscribeToShowChanges.mockReturnValue(vi.fn());
  });

  it('pulls the Show-scoped replica when another secretary changes Paperwork Print evidence', async () => {
    let realtimeListener: ShowChangeListener | undefined;
    h.subscribeToShowChanges.mockImplementation((_showId, listener: ShowChangeListener) => {
      realtimeListener = listener;
      return vi.fn();
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useShowPaperworkPrints('show-1'), { wrapper });
    await waitFor(() => expect(h.sync).toHaveBeenCalledWith('show-1'));
    h.sync.mockClear();

    act(() => realtimeListener?.({ table: 'classes' }));
    expect(h.sync).not.toHaveBeenCalled();

    act(() => realtimeListener?.({ table: 'paperwork_prints' }));
    await waitFor(() => expect(h.sync).toHaveBeenCalledWith('show-1'));
  });
});
