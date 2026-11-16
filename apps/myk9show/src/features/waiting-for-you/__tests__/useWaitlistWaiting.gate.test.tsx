import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWaitlistWaiting } from '../useWaitlistWaiting';

const mocks = vi.hoisted(() => ({ getClasses: vi.fn() }));
vi.mock('@/services/database/waitlists', () => ({
  getClassesWithWaitlistCounts: mocks.getClasses,
}));
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: { getByClass: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/database/waitlists/replicaDependencies', () => ({
  WAITLIST_READ_TABLES: [],
}));

function mount(manages: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useWaitlistWaiting('show-1', manages), { wrapper });
}

describe('useWaitlistWaiting gate', () => {
  beforeEach(() => {
    mocks.getClasses.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('makes no waitlist read for a viewer who cannot manage the show', async () => {
    const { result } = mount(false);
    // Give any query a turn to start before asserting it never did.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.getClasses).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('reads the show for a viewer who manages it, and a zero is a read answer', async () => {
    const { result } = mount(true);
    await waitFor(() => expect(mocks.getClasses).toHaveBeenCalledWith('show-1'));
    await waitFor(() => expect(result.current).toEqual({ count: 0, runOut: [] }));
  });
});
