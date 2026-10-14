import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShowPaperworkPrints } from '../useShowPaperworkPrints';

/**
 * MYK9-1133: the paperwork-prints hook after an account switch.
 *
 * Account A (secretary of show-y) synced the paperwork_prints replica, which
 * stamped show-y as A's, and signed out (MYK9-202 keeps it). Account B, who is
 * not a manager of show-y, signs in and opens a show-y screen. The hook reads
 * IndexedDB only (`networkMode: 'always'`, MYK9-955): B gets an error until
 * B's own sync restamps the show, never A's rows and never an empty list. A
 * reading its own stamped show is unchanged. The sync is a stand-in that
 * resolves success and leaves the stamp alone; the engine's stamping and
 * cleanup are pinned in packages/replication.
 */

const { state } = vi.hoisted(() => ({
  state: {
    user: 'A' as 'A' | 'B' | null,
    stampedBy: 'user-a' as string | undefined,
  },
}));

const PRINT_A1 = { id: 'print-a1', showId: 'show-y', reportId: 'check-in' };
const PRINT_A2 = { id: 'print-a2', showId: 'show-y', reportId: 'run-order' };

vi.mock('@/services/replication', () => ({
  replicatedPaperworkPrintsTable: {
    sync: vi.fn(async () => ({ success: true })),
    getByShow: vi.fn(async (showId: string) =>
      [PRINT_A1, PRINT_A2].filter(print => print.showId === showId)
    ),
    subscribe: vi.fn(() => vi.fn()),
    getSyncMetadata: vi.fn(async (showId?: string) =>
      showId === 'show-y'
        ? {
            tableName: 'paperwork_prints',
            totalRows: 2,
            ...(state.stampedBy ? { syncedByAuthUserId: state.stampedBy } : {}),
          }
        : null
    ),
    getCurrentAuthUserId: vi.fn(async () =>
      state.user ? (state.user === 'A' ? 'user-a' : 'user-b') : null
    ),
  },
}));
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(() => vi.fn()),
}));

function renderPrints() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useShowPaperworkPrints('show-y'), { wrapper });
}

beforeEach(() => {
  state.user = 'A';
  state.stampedBy = 'user-a';
});

describe('paperwork prints replica after an account switch (MYK9-1133)', () => {
  it('positive control: account A reads its own show-y prints', async () => {
    const { result } = renderPrints();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((result.current.data ?? []).map(print => print.id)).toEqual(['print-a1', 'print-a2']);
  });

  it('useShowPaperworkPrints: B must not see A rows, and is told it could not load', async () => {
    state.user = 'B';
    const { result } = renderPrints();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('a pre-change cache (no stamp) is an error, even for A', async () => {
    state.stampedBy = undefined;
    const { result } = renderPrints();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('an unresolved account matches no stamp', async () => {
    state.user = null;
    const { result } = renderPrints();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
