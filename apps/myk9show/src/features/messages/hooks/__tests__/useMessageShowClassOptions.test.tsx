import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMessageShowClassOptions } from '../useMessageShowClassOptions';
import { supabase } from '@/lib/supabase-client';

vi.mock('@/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockClassesQuery(
  data: Array<{
    id: string;
    name: string | null;
    element: string | null;
    level: string | null;
    section: string | null;
  }> | null,
  error: Error | null = null
) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data, error })),
      })),
    })),
  };
}

function mockEntriesQuery(
  data: Array<{ class_id: string | null }> | null,
  error: Error | null = null
) {
  const terminal = {
    is: vi.fn(() => Promise.resolve({ data, error, count: data?.length ?? 0 })),
  };
  return {
    select: vi.fn(() => ({
      in: vi.fn(() => terminal),
      eq: vi.fn(() => terminal),
    })),
  };
}

describe('useMessageShowClassOptions', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
  });

  it('does not query classes when disabled', () => {
    renderHook(() => useMessageShowClassOptions('show-1', { enabled: false }), {
      wrapper,
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('loads entry counts with one batched entries query', async () => {
    vi.mocked(supabase.from).mockImplementation(table => {
      if (table === 'classes') {
        return mockClassesQuery([
          { id: 'class-1', name: 'Novice Containers', element: null, level: null, section: null },
          { id: 'class-2', name: 'Advanced Interior', element: null, level: null, section: null },
        ]) as never;
      }
      if (table === 'entries') {
        return mockEntriesQuery([
          { class_id: 'class-1' },
          { class_id: 'class-1' },
          { class_id: 'class-2' },
        ]) as never;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const { result } = renderHook(() => useMessageShowClassOptions('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(supabase.from).toHaveBeenNthCalledWith(1, 'classes');
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'entries');
    expect(result.current.data).toEqual([
      { id: 'class-1', label: 'Novice Containers', entryCount: 2 },
      { id: 'class-2', label: 'Advanced Interior', entryCount: 1 },
    ]);
  });

  it('surfaces class query errors instead of treating classes as empty', async () => {
    const classError = new Error('permission denied');
    vi.mocked(supabase.from).mockImplementation(table => {
      if (table === 'classes') return mockClassesQuery(null, classError) as never;
      throw new Error(`Unexpected table: ${table}`);
    });

    const { result } = renderHook(() => useMessageShowClassOptions('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(classError);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('surfaces entry count query errors instead of treating counts as zero', async () => {
    const entryError = new Error('network down');
    vi.mocked(supabase.from).mockImplementation(table => {
      if (table === 'classes') {
        return mockClassesQuery([
          { id: 'class-1', name: 'Novice Containers', element: null, level: null, section: null },
        ]) as never;
      }
      if (table === 'entries') return mockEntriesQuery(null, entryError) as never;
      throw new Error(`Unexpected table: ${table}`);
    });

    const { result } = renderHook(() => useMessageShowClassOptions('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(entryError);
  });
});
