/**
 * MYK9-1162: the trials read is replica-first, so it must run offline. The
 * default `networkMode: 'online'` paused it without ever calling it, and the
 * "Registration number needed" pane waited on it forever after an offline reload.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockGetTrialsByShow } = vi.hoisted(() => ({ mockGetTrialsByShow: vi.fn() }));
vi.mock('@/services/database/trials', () => ({ getTrialsByShow: mockGetTrialsByShow }));

import { useShowTrials } from '../useShowTrials';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useShowTrials offline', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('reads the trials on the device while offline', async () => {
    onlineManager.setOnline(false);
    mockGetTrialsByShow.mockResolvedValue({ data: [{ id: 'trial-1' }], error: null });

    const { result } = renderHook(() => useShowTrials('show-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([{ id: 'trial-1' }]));
    expect(mockGetTrialsByShow).toHaveBeenCalledWith('show-1');
  });
});
