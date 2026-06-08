import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMessageShowClassOptions } from '../useMessageShowClassOptions';
import { supabase } from '@/lib/supabase-client';

vi.mock('@/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
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

describe('useMessageShowClassOptions', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it('does not query classes when disabled', () => {
    renderHook(() => useMessageShowClassOptions('show-1', { enabled: false }), {
      wrapper,
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('loads entry counts with one aggregate RPC', async () => {
    vi.mocked(supabase.from).mockImplementation(table => {
      if (table === 'classes') {
        return mockClassesQuery([
          { id: 'class-1', name: 'Novice Containers', element: null, level: null, section: null },
          { id: 'class-2', name: 'Advanced Interior', element: null, level: null, section: null },
        ]) as never;
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { class_id: 'class-1', entry_count: 2 },
        { class_id: 'class-2', entry_count: 1 },
      ],
      error: null,
    } as never);

    const { result } = renderHook(() => useMessageShowClassOptions('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('classes');
    expect(supabase.rpc).toHaveBeenCalledWith('get_message_class_entry_counts', {
      p_class_ids: ['class-1', 'class-2'],
    });
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

  it('surfaces entry count RPC errors instead of treating counts as zero', async () => {
    const entryError = new Error('network down');
    vi.mocked(supabase.from).mockImplementation(table => {
      if (table === 'classes') {
        return mockClassesQuery([
          { id: 'class-1', name: 'Novice Containers', element: null, level: null, section: null },
        ]) as never;
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: entryError } as never);

    const { result } = renderHook(() => useMessageShowClassOptions('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(entryError);
  });
});
