import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

import { useAtShowExhibitorDogs } from './useAtShowExhibitorDogs';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpc.mockReset();
});

describe('useAtShowExhibitorDogs', () => {
  it('calls the privacy-reviewed function with the show id and groups the rows', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          armband: 7,
          call_name: 'Friend',
          breed: 'Poodle',
          handler_name: 'Pat',
          class_id: 'c1',
          class_name: 'Container Novice',
          trial_name: 'Trial A',
          trial_date: '2026-11-01',
          run_order: 2,
          check_in_status: 'no-status',
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useAtShowExhibitorDogs('s1'), { wrapper });
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith('show_dogs_limited_view', { p_show_id: 's1' });
    expect(result.current.dogs[0]).toMatchObject({ dogName: 'Friend', armband: 7 });
  });

  it('reports a failed read instead of an empty show', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    const { result } = renderHook(() => useAtShowExhibitorDogs('s1'), { wrapper });
    await waitFor(() => expect(result.current.loadFailed).toBe(true));
    expect(result.current.dogs).toEqual([]);
  });

  it('does not call the function without a show', () => {
    renderHook(() => useAtShowExhibitorDogs(undefined), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
  });
});
