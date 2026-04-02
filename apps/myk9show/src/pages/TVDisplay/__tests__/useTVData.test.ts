import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useTVData } from '../useTVData';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient');

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { Wrapper };
}

const mockShow = {
  id: 'show-1',
  name: 'Spring Trial 2026',
  start_date: '2026-04-01',
  end_date: '2026-04-02',
};

const mockClassRow = {
  id: 'class-1',
  name: 'Novice A',
  element: 'Container',
  level: 'Novice',
  status: 'In Progress',
  judge_assignments: [{ people: { first_name: 'John', last_name: 'Smith' } }],
  total_entries_count: 10,
  scored_count: 3,
  start_time: '09:00',
  trials: { show_id: 'show-1', trial_date: '2026-04-01', trial_number: 1 },
};

const mockEntryRow = {
  id: 'entry-1',
  class_id: 'class-1',
  armband: '42',
  handler: 'J. Martinez',
  run_order: 1,
  is_in_ring: true,
  is_scored: false,
  dogs: { name: 'Luna Star', call_name: 'Luna', breed: 'Labrador', image_url: null },
};

describe('useTVData', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'shows') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockShow, error: null }),
        } as never;
      }
      if (table === 'classes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [mockClassRow], error: null }),
        } as never;
      }
      if (table === 'entries') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [mockEntryRow], error: null }),
        } as never;
      }
      return { select: vi.fn().mockReturnThis() } as never;
    });
  });

  it('fetches show info and active classes with entries', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVData('show-1'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.show).toEqual({
      id: 'show-1',
      name: 'Spring Trial 2026',
      startDate: '2026-04-01',
      endDate: '2026-04-02',
    });
    expect(result.current.classes).toHaveLength(1);
    expect(result.current.classes[0].name).toBe('Novice A');
    expect(result.current.classes[0].entries).toHaveLength(1);
    expect(result.current.classes[0].entries[0].armband).toBe('42');
    expect(result.current.classes[0].entries[0].isInRing).toBe(true);
    expect(result.current.classes[0].entries[0].dog?.callName).toBe('Luna');
    expect(result.current.classes[0].judgeName).toBe('John Smith');
  });

  it('returns empty classes when show not found', async () => {
    vi.mocked(supabase.from).mockImplementation(() => {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      } as never;
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTVData('bad-id'), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.show).toBeNull();
    expect(result.current.classes).toEqual([]);
  });

  it('filters by trial ID when provided', async () => {
    const selectMock = vi.fn().mockReturnThis();
    const eqMock = vi.fn().mockReturnThis();
    const inMock = vi.fn().mockResolvedValue({ data: [], error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'shows') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockShow, error: null }),
        } as never;
      }
      if (table === 'classes') {
        return { select: selectMock, eq: eqMock, in: inMock } as never;
      }
      return { select: vi.fn().mockReturnThis() } as never;
    });

    const { Wrapper } = makeWrapper();
    renderHook(() => useTVData('show-1', 'trial-1'), { wrapper: Wrapper });

    await waitFor(() => expect(eqMock).toHaveBeenCalled());
  });
});
