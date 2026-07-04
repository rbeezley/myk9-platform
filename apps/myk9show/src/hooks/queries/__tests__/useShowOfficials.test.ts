import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useShowOfficials } from '../useShowOfficials';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// SA-006: the hook now reads officials through the get_show_officials
// SECURITY DEFINER RPC (user_roles is no longer directly SELECT-able cross-user).
const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useShowOfficials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the get_show_officials RPC with the show id', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useShowOfficials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith('get_show_officials', { p_show_id: 'show-1' });
  });

  it('returns empty arrays when no officials assigned', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useShowOfficials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.secretaries).toEqual([]);
    expect(result.current.data?.chairmen).toEqual([]);
    expect(result.current.data?.stewards).toEqual([]);
  });

  it('is disabled when showId is undefined', () => {
    const { result } = renderHook(() => useShowOfficials(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('groups officials by role', async () => {
    const mockData = [
      { user_id: 'p1', first_name: 'Jane', last_name: 'Doe', email: 'jane@test.com', role: 'secretary' },
      { user_id: 'p2', first_name: 'John', last_name: 'Smith', email: 'john@test.com', role: 'chairman' },
      { user_id: 'p3', first_name: 'Bob', last_name: 'Lee', email: null, role: 'steward' },
    ];

    mockRpc.mockResolvedValue({ data: mockData, error: null });

    const { result } = renderHook(() => useShowOfficials('show-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.secretaries).toHaveLength(1);
    expect(result.current.data?.secretaries[0]).toEqual({
      personId: 'p1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@test.com',
      role: 'secretary',
    });
    expect(result.current.data?.chairmen).toHaveLength(1);
    expect(result.current.data?.chairmen[0].personId).toBe('p2');
    expect(result.current.data?.stewards).toHaveLength(1);
    expect(result.current.data?.stewards[0].personId).toBe('p3');
    expect(result.current.data?.stewards[0].email).toBeNull();
  });
});
