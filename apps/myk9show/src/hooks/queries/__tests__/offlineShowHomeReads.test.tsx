import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';

import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { useShowPaperworkPrints } from '@/features/show-map/cockpit/useShowPaperworkPrints';

vi.mock('@/services/database/entries', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEntriesForShow: vi.fn(async () => ({
    data: [{ id: 'entry-1', class_id: 'class-1' }],
    error: null,
  })),
}));

vi.mock('@/services/replication', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  replicatedPaperworkPrintsTable: {
    getByShow: vi.fn(async () => [{ id: 'print-1' }]),
    sync: vi.fn(async () => ({ success: false })),
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(() => () => {}),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// MYK9-955 / MYK9-948's offline criterion: both reads come from the local
// replica first, but React Query's default 'online' network mode paused them
// before they ran, so an offline cold reload of the show home showed every
// count and checklist as unknown even with the replica on disk.
describe('show home reads on an offline cold load', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('reads show entries from the local replica while offline', async () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useSecretaryShowEntriesQuery('show-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it('reads paperwork prints from IndexedDB while offline', async () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useShowPaperworkPrints('show-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });
});
