/**
 * MYK9-969 (Codex round 5): the podium classifies a row as an anonymised
 * private entry by the server's explicit signal (a NULL dog id), never by the
 * display name — a real dog may be called "Private entry".
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { createChainableQuery, mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import { useShowResults } from './useShowResults';
import { PRIVATE_ENTRY_LABEL } from '@/lib/resultsPrivacy';

const BASE = {
  class_id: 'class-1',
  class_name: 'Container Novice',
  class_element: 'Container',
  class_level: 'Novice',
  class_results_released_at: '2026-10-04T15:00:00Z',
  trial_id: 'trial-1',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useShowResults — private entries (MYK9-969)', () => {
  beforeEach(() => {
    resetMockSupabase();
  });

  it('keeps the handler and breed of a PUBLIC dog literally named "Private entry"', async () => {
    mockSupabase.from.mockImplementation(() =>
      createChainableQuery({
        data: [
          {
            ...BASE,
            dog_id: 'dog-1',
            handler: 'Ann Handler',
            dog_call_name: PRIVATE_ENTRY_LABEL,
            dog_breed: 'Beagle',
            armband: '101',
            final_placement: 1,
          },
        ],
        error: null,
      })
    );

    const { result } = renderHook(() => useShowResults('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]?.placements[0]).toMatchObject({
      isPrivate: false,
      handlerName: 'Ann Handler',
      breed: 'Beagle',
      armband: '101',
    });
  });

  it('anonymises a row the server anonymised (null dog id)', async () => {
    mockSupabase.from.mockImplementation(() =>
      createChainableQuery({
        data: [
          {
            ...BASE,
            dog_id: null,
            handler: null,
            dog_call_name: PRIVATE_ENTRY_LABEL,
            dog_breed: null,
            armband: null,
            final_placement: 1,
          },
        ],
        error: null,
      })
    );

    const { result } = renderHook(() => useShowResults('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]?.placements[0]).toMatchObject({
      isPrivate: true,
      handlerName: '',
      dogName: PRIVATE_ENTRY_LABEL,
    });
  });

  it('asks the public view for dog_id, the explicit signal', async () => {
    const query = createChainableQuery({ data: [], error: null });
    mockSupabase.from.mockImplementation(() => query);

    const { result } = renderHook(() => useShowResults('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const select = (query as unknown as { select: { mock: { calls: string[][] } } }).select;
    const columns = (select.mock.calls[0]?.[0] ?? '').split(',').map(column => column.trim());
    expect(columns).toContain('dog_id');
  });
});
