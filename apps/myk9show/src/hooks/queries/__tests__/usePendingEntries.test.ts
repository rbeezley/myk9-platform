import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { usePendingEntries } from '../usePendingEntries';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((msg: string) => new Error(msg)),
}));

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

const mockEntry = {
  id: 'entry-1',
  show_id: 'show-1',
  entry_status: 'submitted',
  handler_id: 'person-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  submitted_at: '2026-04-15T10:00:00Z',
  dogs: { call_name: 'Buddy' },
  people: { first_name: 'John', last_name: 'Smith' },
  classes: { name: 'Novice A' },
  shows: { name: 'Spring Trial 2026' },
};

describe('usePendingEntries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches pending entries across all shows', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [mockEntry], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => usePendingEntries(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].handlerName).toBe('John Smith');
    expect(result.current.data![0].dogName).toBe('Buddy');
  });

  it('filters by showId when provided', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const showEqMock = vi.fn().mockReturnValue({ order: orderMock });
    const statusEqMock = vi.fn().mockReturnValue({ eq: showEqMock });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: statusEqMock }),
    });

    const { result } = renderHook(() => usePendingEntries('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(showEqMock).toHaveBeenCalledWith('show_id', 'show-1');
  });
});
