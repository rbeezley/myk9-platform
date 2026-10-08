/**
 * The class rows behind every paperwork fingerprint (Reports and Overview) must not serve a
 * snapshot taken before a change the subscription never saw.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient } from '@/test/utils/testUtils';
import { useShowClassRows } from '../useShowClassRows';

const mocks = vi.hoisted(() => ({ getClassesByTrialId: vi.fn() }));

vi.mock('@/services/database/classes', () => ({
  getClassesByTrialId: mocks.getClassesByTrialId,
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { subscribe: vi.fn(() => () => undefined) },
}));

describe('useShowClassRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClassesByTrialId.mockResolvedValue({ data: [{ id: 'class-1' }], error: null });
  });

  it('re-reads the replica on remount instead of serving the unmounted-time snapshot', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const input = { showId: 'show-1', trialId: 'all', trialIds: ['trial-1'] };

    const first = renderHook(() => useShowClassRows(input), { wrapper });
    await waitFor(() => expect(first.result.current.data).toEqual([{ id: 'class-1' }]));
    first.unmount();

    // A class changed while nothing was mounted: no subscription saw it.
    mocks.getClassesByTrialId.mockResolvedValue({
      data: [{ id: 'class-1', status: 'completed' }],
      error: null,
    });
    const second = renderHook(() => useShowClassRows(input), { wrapper });

    await waitFor(() =>
      expect(second.result.current.data).toEqual([{ id: 'class-1', status: 'completed' }])
    );
    expect(mocks.getClassesByTrialId).toHaveBeenCalledTimes(2);
  });
});
